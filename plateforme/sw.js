/* ============================================================
   Service worker — hors-ligne, stratégie « réseau d'abord »
   ------------------------------------------------------------
   Ne s'enregistre QUE sur le site publié (voir stockage.js) : en local il
   serait nuisible. Stratégie réseau d'abord pour TOUT, cache en secours :
   - en ligne, on reçoit toujours la dernière version (jamais de code périmé) ;
   - hors-ligne, la dernière version vue reste consultable — ce qui est le but
     à table, quand le réseau manque.

   Une version antérieure faisait « cache d'abord » : le navigateur resservait
   indéfiniment l'ancien code, y compris celui qui réinstallait ce cache. Ne
   jamais revenir à cette stratégie pour le HTML et les scripts.
   ============================================================ */
const CACHE = 'cartographe-knight-4';
const ESSENTIELS = [
  './', './index.html', './editeur.html', './table.html', './css/commun.css',
  './js/modele.js', './js/rendu.js', './js/stockage.js', './js/editeur.js', './js/table.js',
  './manifest.webmanifest', './cartes/index.json',
  './icone-192.png', './icone-512.png', './icone-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ESSENTIELS).catch(() => {}))   // un fichier manquant ne bloque pas
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const rq = e.request;
  if (rq.method !== 'GET' || !rq.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(rq)
      .then(rep => {
        if (rep && rep.ok) {
          const copie = rep.clone();
          caches.open(CACHE).then(c => c.put(rq, copie)).catch(() => {});
        }
        return rep;
      })
      .catch(() => caches.match(rq).then(r => r || caches.match('./index.html')))
  );
});
