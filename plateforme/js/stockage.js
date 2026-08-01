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
  const STORE_PARAM = 'parametres';   // v2 : dossier du dépôt lié (File System Access)
  let db = null, ouvertureEnCours = null;

  /* Deux appels concurrents avant la résolution du premier (ex. l'éditeur qui
     vérifie le dossier lié ET enregistre la carte dans la même poignée de main)
     ouvriraient sinon deux connexions indexedDB.open() en parallèle — on
     mémorise donc la promesse en cours, pas seulement le résultat final. */
  function ouvrir() {
    if (db) return Promise.resolve(db);
    if (ouvertureEnCours) return ouvertureEnCours;
    ouvertureEnCours = new Promise((res, rej) => {
      let rq;
      try { rq = indexedDB.open(DB_NOM, 2); }
      catch (e) { ouvertureEnCours = null; return rej(e); }   // stockage interdit (navigation privée stricte)
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORE_PARAM)) d.createObjectStore(STORE_PARAM, { keyPath: 'cle' });
      };
      rq.onsuccess = () => { db = rq.result; ouvertureEnCours = null; res(db); };
      rq.onerror = () => { ouvertureEnCours = null; rej(rq.error); };
      rq.onblocked = () => { ouvertureEnCours = null; rej(new Error('Base de données bloquée par un autre onglet.')); };
    });
    return ouvertureEnCours;
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

  function txDe(nom, mode) {
    return ouvrir().then(d => d.transaction(nom, mode).objectStore(nom));
  }
  const tx = (mode) => txDe(STORE, mode);
  const txParam = (mode) => txDe(STORE_PARAM, mode);
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

  /* ---------- catalogue d'images ----------
     images/index.json liste les illustrations livrées avec le site (créatures, lieux) :
     { "images": [ { "fichier": "loup-garou.jpg", "nom": "Loup-garou" } ] }
     Même principe que cartes/index.json : le dépôt sert de bibliothèque d'images,
     pas d'import depuis l'appareil (fiable sur mobile, versionné dans git). */
  function catalogueImages() {
    return fetch('images/index.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => j.images || [])
      .catch(() => []);
  }

  /* Vue arborescente du catalogue à un niveau donné (chemin = tableau de segments,
     [] = racine) : les sous-dossiers directs de ce niveau, et les images posées
     directement dedans (pas dans un sous-dossier). Le format de images/index.json ne
     change pas (chaque image garde son « dossier » en chemin complet, ex. "Legendary
     lands/Campagne oiseau") ; c'est ici qu'on le transforme en arborescence navigable,
     pour l'éditeur comme pour la galerie de la table de jeu. */
  function arboreImages(catalogue, chemin) {
    const prefixe = (chemin || []).join('/');
    const dossiers = new Set();
    const images = [];
    for (const im of catalogue) {
      const d = im.dossier || '';
      if (prefixe && d !== prefixe && !d.startsWith(prefixe + '/')) continue;
      const reste = prefixe ? d.slice(prefixe.length).replace(/^\//, '') : d;
      if (!reste) images.push(im);
      else dossiers.add(reste.split('/')[0]);
    }
    return {
      dossiers: [...dossiers].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
      images,
    };
  }

  /* ---------- campagnes déclarées ----------
     Les campagnes sont normalement déduites des cartes. Pour pouvoir créer un
     dossier VIDE (et y déposer des cartes ensuite), on mémorise à part les noms
     déclarés par l'utilisateur. */
  const CLE_CAMPAGNES = 'kj-campagnes';
  function campagnesDeclarees() {
    try { return JSON.parse(localStorage.getItem(CLE_CAMPAGNES) || '[]'); } catch (e) { return []; }
  }
  function ecrireCampagnes(liste) {
    const propre = [...new Set(liste.map(x => String(x).trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    try { localStorage.setItem(CLE_CAMPAGNES, JSON.stringify(propre)); } catch (e) {}
    return propre;
  }
  const declarerCampagne = (nom) => ecrireCampagnes(campagnesDeclarees().concat([nom]));
  const oublierCampagne = (nom) =>
    ecrireCampagnes(campagnesDeclarees().filter(x => x !== nom));
  function renommerCampagneDeclaree(ancien, nouveau) {
    const l = campagnesDeclarees().filter(x => x !== ancien);
    if (nouveau) l.push(nouveau);
    return ecrireCampagnes(l);
  }

  /* ---------- dossier du dépôt (écriture directe sur disque) ----------
     File System Access API : Chromium uniquement (Chrome, Edge, Brave desktop —
     pas Firefox ni Safari, qui n'implémentent pas cette API). Quand ce dossier
     est lié, enregistrer une carte l'écrit directement dans plateforme/cartes/,
     comme une édition manuelle du fichier : plus d'export/import, plus de copie
     locale qui masque le dépôt. La publication (commit + push) reste un geste
     séparé et volontaire, pour ne pas déclencher un déploiement Netlify à
     chaque frappe. Le navigateur redemande parfois la permission d'un dossier
     déjà lié (perte de la permission entre deux sessions) : ça ne peut se faire
     que dans un clic (voir dossierDepotActif, paramètre « demander »). */
  const CLE_DOSSIER = 'dossier-depot';
  function depotPrisEnCharge() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }
  function sauverDossierDepot(poignee) {
    return txParam('readwrite').then(s => promesse(s.put({ cle: CLE_DOSSIER, poignee })));
  }
  function chargerDossierDepot() {
    return txParam('readonly').then(s => promesse(s.get(CLE_DOSSIER)))
      .then(r => (r && r.poignee) || null).catch(() => null);
  }
  function oublierDossierDepot() {
    return txParam('readwrite').then(s => promesse(s.delete(CLE_DOSSIER)));
  }
  async function lierDossierDepot() {
    const poignee = await window.showDirectoryPicker({ id: 'kj-depot', mode: 'readwrite' });
    await poignee.getDirectoryHandle('cartes');   // vérifie que c'est bien le dossier plateforme/
    await sauverDossierDepot(poignee);
    return poignee;
  }
  async function permissionDossier(poignee, demander) {
    const opts = { mode: 'readwrite' };
    if ((await poignee.queryPermission(opts)) === 'granted') return true;
    if (!demander) return false;
    return (await poignee.requestPermission(opts)) === 'granted';
  }
  /* demander=true seulement depuis un clic (contrainte du navigateur) ;
     demander=false pour les vérifications silencieuses (démarrage, autosave). */
  async function dossierDepotActif(demander) {
    const poignee = await chargerDossierDepot();
    if (!poignee) return null;
    return (await permissionDossier(poignee, demander)) ? poignee : null;
  }
  async function ecrireFichierDepot(poignee, cheminRelatif, contenu) {
    const segs = cheminRelatif.split('/');
    let dir = poignee;
    for (let i = 0; i < segs.length - 1; i++) dir = await dir.getDirectoryHandle(segs[i], { create: true });
    const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true });
    const w = await fh.createWritable();
    await w.write(contenu);
    await w.close();
  }
  async function lireFichierDepotSiExiste(poignee, cheminRelatif) {
    try {
      const segs = cheminRelatif.split('/');
      let dir = poignee;
      for (let i = 0; i < segs.length - 1; i++) dir = await dir.getDirectoryHandle(segs[i]);
      const fh = await dir.getFileHandle(segs[segs.length - 1]);
      return await (await fh.getFile()).text();
    } catch (e) { return null; }
  }
  /* Écrit cartes/<id>.json (convention déjà suivie par toutes les cartes du dépôt)
     et complète cartes/index.json si la carte n'y figure pas encore — une carte
     neuve créée dans l'éditeur devient ainsi visible partout dès l'enregistrement. */
  async function ecrireCarteDansDepot(poignee, carte) {
    const fichier = carte.id + '.json';
    await ecrireFichierDepot(poignee, 'cartes/' + fichier, KJ.modele.versJSON(carte));
    let cat = null;
    try { cat = JSON.parse(await lireFichierDepotSiExiste(poignee, 'cartes/index.json')); } catch (e) {}
    if (!cat || !Array.isArray(cat.cartes)) {
      cat = {
        _lisez_moi: 'Catalogue des cartes livrées avec le site. Ajoute une entrée par fichier '
          + '.json déposé dans ce dossier, puis commite : le site les proposera partout, y '
          + 'compris sur mobile.',
        cartes: [],
      };
    }
    const i = cat.cartes.findIndex(e => e.fichier === fichier);
    const entree = { fichier, nom: carte.nom };
    if (i === -1) cat.cartes.push(entree); else cat.cartes[i] = entree;
    await ecrireFichierDepot(poignee, 'cartes/index.json', JSON.stringify(cat, null, 2) + '\n');
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
           campagnesDeclarees, declarerCampagne, oublierCampagne, renommerCampagneDeclaree,
           exporterJSON, exporterSVG, importerFichier, telecharger, slug,
           catalogueDepot, chargerDepot, catalogueImages, arboreImages,
           depotPrisEnCharge, lierDossierDepot, oublierDossierDepot, dossierDepotActif,
           ecrireCarteDansDepot };
})();
