/* ============================================================
   Cartographe Knight — stockage
   Local d'abord : IndexedDB pour la bibliothèque de travail,
   fichiers JSON pour la source de vérité (versionnée dans git).
   Expose window.KJ.stockage
   ============================================================ */
window.KJ = window.KJ || {};
KJ.stockage = (function () {

  const DB_NOM = 'cartographe-knight';
  const STORE = 'cartes';
  let db = null;

  function ouvrir() {
    if (db) return Promise.resolve(db);
    return new Promise((res, rej) => {
      let rq;
      try { rq = indexedDB.open(DB_NOM, 1); }
      catch (e) { return rej(e); }               // stockage interdit (navigation privée stricte)
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      rq.onsuccess = () => { db = rq.result; res(db); };
      rq.onerror = () => rej(rq.error);
      rq.onblocked = () => rej(new Error('Base de données bloquée par un autre onglet.'));
    });
  }

  /* Le stockage local peut être indisponible, bridé ou muet (navigation privée,
     quota, onglet concurrent). Rien ne doit rester bloqué à cause de lui :
     au-delà du délai, on continue avec une valeur de repli. */
  function avecDelai(promesse, ms, repli) {
    return new Promise((res) => {
      let fini = false;
      const t = setTimeout(() => { if (!fini) { fini = true; res(repli); } }, ms || 1500);
      Promise.resolve(promesse).then(
        (v) => { if (!fini) { fini = true; clearTimeout(t); res(v); } },
        () => { if (!fini) { fini = true; clearTimeout(t); res(repli); } }
      );
    });
  }

  function tx(mode) {
    return ouvrir().then(d => d.transaction(STORE, mode).objectStore(STORE));
  }
  const promesse = (rq) => new Promise((res, rej) => {
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });

  const enregistrer = (carte) => { carte.maj = Date.now(); return tx('readwrite').then(s => promesse(s.put(carte))); };
  const charger     = (id) => tx('readonly').then(s => promesse(s.get(id)));
  const supprimer   = (id) => tx('readwrite').then(s => promesse(s.delete(id)));
  const lister      = () => tx('readonly').then(s => promesse(s.getAll()))
    .then(l => l.sort((a, b) => (b.maj || 0) - (a.maj || 0)));

  /* ---------- fichiers ---------- */
  function telecharger(nomFichier, contenu, type) {
    const blob = new Blob([contenu], { type: type || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomFichier;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const slug = (s) => String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'carte';

  function exporterJSON(carte) {
    telecharger(slug(carte.nom) + '.json', KJ.modele.versJSON(carte), 'application/json');
  }
  function exporterSVG(carte, opts) {
    telecharger(slug(carte.nom) + '.svg', KJ.rendu.svgString(carte, opts), 'image/svg+xml');
  }

  function importerFichier(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { try { res(KJ.modele.depuisJSON(fr.result)); } catch (e) { rej(e); } };
      fr.onerror = () => rej(fr.error);
      fr.readAsText(file);
    });
  }

  /* ---------- catalogue du dépôt ----------
     cartes/index.json liste les cartes livrées avec le site :
     { "cartes": [ { "fichier": "manoir-rdc.json", "nom": "…" } ] }
     Indisponible en file:// (bloqué par la politique d'origine) : échec silencieux. */
  function catalogueDepot() {
    return fetch('cartes/index.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => j.cartes || [])
      .catch(() => []);
  }
  function chargerDepot(fichier) {
    return fetch('cartes/' + fichier, { cache: 'no-cache' })
      .then(r => r.json()).then(KJ.modele.depuisJSON);
  }

  /* ---------- service worker ----------
     Il sert à l'usage hors-ligne du site publié. En local il est nuisible :
     il peut resservir une version périmée de l'application (ancienne page sans
     le mode Jeu, ancien catalogue de cartes…). On le désinscrit donc et on purge
     les caches dès qu'on tourne sur localhost. */
  function gererServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const local = ['localhost', '127.0.0.1', ''].includes(location.hostname)
      || location.protocol === 'file:';
    if (local) {
      navigator.serviceWorker.getRegistrations()
        .then(rs => rs.forEach(r => r.unregister()))
        .catch(() => {});
      if (window.caches && caches.keys)
        caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
      return;
    }
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  return { enregistrer, charger, supprimer, lister, avecDelai, gererServiceWorker,
           exporterJSON, exporterSVG, importerFichier, telecharger, slug,
           catalogueDepot, chargerDepot };
})();
