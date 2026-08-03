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

  /* Le magasin `cartes` d'IndexedDB n'est plus utilisé : les cartes sont des fichiers
     (voir plus bas). On ne le supprime pas pour autant — d'anciennes copies peuvent y
     dormir, autant les laisser récupérables plutôt que de les effacer d'office. */

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

  /* ================= LES CARTES : UNE SEULE SOURCE, LES FICHIERS =================
     Les cartes vivent dans `cartes/*.json`, et nulle part ailleurs. Il n'existe plus
     de « copie de travail » cachée dans le navigateur : c'était deux bibliothèques en
     parallèle, jamais synchronisées entre appareils, et c'est ce qui faisait qu'un
     téléphone (ou un PC) continuait d'afficher une vieille version d'une carte
     pourtant à jour dans le dépôt, sans le moindre signe visible.

     Deux façons de lire les mêmes fichiers, selon l'appareil :
     - dossier lié (PC, navigateur Chromium) → on lit/écrit les fichiers du DISQUE,
       donc ce qu'on voit est exactement ce qui sera commité ;
     - sinon (téléphone, autre navigateur) → on lit les fichiers SERVIS par le site,
       en lecture seule : le téléphone sert à jouer, pas à préparer.
     Le passage de l'un à l'autre, c'est le push — un geste explicite, jamais implicite.

     `cartes/index.json` reste nécessaire pour la lecture par le site (on ne peut pas
     lister un dossier en HTTP) : il est reconstruit à chaque écriture. */

  const estCarteJSON = (nom) => /\.json$/i.test(nom) && nom.toLowerCase() !== 'index.json';
  const triCartes = (a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { sensitivity: 'base' });

  function listerParHTTP() {
    return fetch('cartes/index.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => Promise.all((j.cartes || []).map(e =>
        fetch('cartes/' + e.fichier, { cache: 'no-cache' })
          .then(r => r.json()).then(KJ.modele.depuisJSON).catch(() => null))))
      .then(l => l.filter(Boolean).sort(triCartes))
      .catch(() => []);
  }
  async function listerParDossier(poignee) {
    const dir = await poignee.getDirectoryHandle('cartes');
    const cartes = [];
    for await (const [nom, h] of dir.entries()) {
      if (h.kind !== 'file' || !estCarteJSON(nom)) continue;
      try { cartes.push(KJ.modele.depuisJSON(await (await h.getFile()).text())); } catch (e) {}
    }
    return cartes.sort(triCartes);
  }
  /* Toutes les cartes disponibles, dans l'ordre alphabétique. */
  function listerCartes() {
    return dossierDepotActif(false)
      .then(poignee => poignee ? listerParDossier(poignee) : listerParHTTP())
      .catch(() => listerParHTTP());
  }
  /* Charge les cartes d'une liste d'entrées { fichier } ou { id } — utilisé avec
     l'index PRIVÉ du MJ (KJ.session.lireIndexCartes) : cartes/index.json n'est
     plus publié, la bibliothèque n'est découvrable qu'avec le compte. */
  function listerDepuisListe(entrees) {
    return Promise.all((entrees || []).map(e =>
      fetch('cartes/' + (e.fichier || e.id + '.json'), { cache: 'no-cache' })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(KJ.modele.depuisJSON).catch(() => null)))
      .then(l => l.filter(Boolean).sort(triCartes));
  }
  function chargerCarte(id) {
    return listerCartes().then(l => l.find(c => c.id === id) || null);
  }

  /* Modifier une carte suppose d'écrire son fichier : possible uniquement quand le
     dossier est lié. Ailleurs, l'appli est explicitement en lecture seule plutôt que
     d'enregistrer dans un coin invisible que personne ne retrouvera. */
  function peutModifier() {
    return dossierDepotActif(false).then(p => !!p).catch(() => false);
  }
  async function reconstruireIndex(poignee) {
    const cartes = await listerParDossier(poignee);
    await ecrireFichierDepot(poignee, 'cartes/index.json', JSON.stringify({
      _lisez_moi: 'Catalogue régénéré par l’application à chaque enregistrement. '
        + 'Il sert à lister les cartes depuis le site (impossible d’y lister un dossier).',
      cartes: cartes.map(c => ({ fichier: c.id + '.json', nom: c.nom })),
    }, null, 2) + '\n');
  }
  async function enregistrerCarte(carte) {
    const poignee = await dossierDepotActif(false);
    if (!poignee) throw new Error('lecture seule');
    carte.maj = Date.now();
    await ecrireFichierDepot(poignee, 'cartes/' + carte.id + '.json', KJ.modele.versJSON(carte));
    await reconstruireIndex(poignee);
  }
  async function supprimerCarte(id) {
    const poignee = await dossierDepotActif(false);
    if (!poignee) throw new Error('lecture seule');
    const dir = await poignee.getDirectoryHandle('cartes');
    await dir.removeEntry(id + '.json');
    await reconstruireIndex(poignee);
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
    /* Mémoriser la poignée (pour ne plus la redemander) passe par IndexedDB, qui peut
       rester muet. Ce n'est qu'un confort : si ça échoue, la liaison reste valable pour
       cette session et sera simplement redemandée la prochaine fois. Ne jamais faire
       dépendre la liaison elle-même de cette écriture — sinon le clic « Enregistrer »
       se fige sans que rien ne l'explique. */
    await avecDelai(sauverDossierDepot(poignee).catch(() => {}), 2500, null);
    return poignee;
  }
  async function permissionDossier(poignee, demander) {
    const opts = { mode: 'readwrite' };
    if ((await poignee.queryPermission(opts)) === 'granted') return true;
    if (!demander) return false;
    return (await poignee.requestPermission(opts)) === 'granted';
  }
  /* demander=true seulement depuis un clic (contrainte du navigateur) ;
     demander=false pour les vérifications silencieuses (démarrage, autosave).

     Le délai de secours est posé ICI, et pas chez les appelants : cette fonction est
     le passage obligé vers le dossier, et elle lit IndexedDB (qui peut rester muet —
     onglet concurrent, quota, navigation privée). Sans ce filet, c'est TOUT ce qui en
     dépend — lister les cartes, enregistrer, savoir si on est en lecture seule — qui
     se figeait sans le moindre message. Un garde par appelant, c'est un garde qu'on
     oublie : celui-ci couvre tout le monde d'un coup. */
  async function dossierDepotActif(demander) {
    const poignee = await avecDelai(chargerDossierDepot(), 2500, null);
    if (!poignee) return null;
    try {
      return (await permissionDossier(poignee, demander)) ? poignee : null;
    } catch (e) { return null; }
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

  return { avecDelai, gererServiceWorker,
           // les cartes : une seule source, les fichiers de cartes/
           listerCartes, listerDepuisListe, chargerCarte, enregistrerCarte, supprimerCarte, peutModifier,
           campagnesDeclarees, declarerCampagne, oublierCampagne, renommerCampagneDeclaree,
           exporterJSON, exporterSVG, importerFichier, telecharger, slug,
           catalogueImages, arboreImages,
           depotPrisEnCharge, lierDossierDepot, oublierDossierDepot, dossierDepotActif };
})();
