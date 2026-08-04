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
const CACHE = 'cartographe-6';
const ESSENTIELS = [
  './', './index.html', './editeur.html', './table.html', './css/commun.css',
  './js/modele.js', './js/rendu.js', './js/stockage.js', './js/editeur.js', './js/table.js',
  './manifest.webmanifest',
  './icone-192.png', './icone-512.png', './icone-32.png',
  './js/firebase-config.js', './js/session.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // fichier par fichier : addAll est ATOMIQUE, un seul 404 (ex. un fichier
      // exclu du déploiement) annulait silencieusement tout le pré-cache et
      // le hors-ligne ne marchait pour rien du tout
      .then(c => Promise.all(ESSENTIELS.map(u => c.add(u).catch(() => {}))))
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
