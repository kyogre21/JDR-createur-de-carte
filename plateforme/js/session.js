/* ============================================================
   Cartographe Knight — sessions multi-appareils (Firebase RTDB)
   ------------------------------------------------------------
   Le MJ ouvre une session et obtient un code court ; les joueurs le
   saisissent (ou ouvrent table.html?session=CODE) et reçoivent l'état
   de partie en direct, en vue joueurs imposée.

   Principes (voir ARCHITECTURE.md) :
   - seul l'ÉTAT DE PARTIE transite (brouillard, jetons, carte affichée,
     révélations) — jamais les cartes elles-mêmes, servies par le site ;
   - seul le MJ écrit (règles de sécurité : database.rules.json) ;
   - couche OPTIONNELLE : sans configuration ou sans réseau, l'application
     fonctionne comme avant (BroadcastChannel sur un même PC) ;
   - le SDK Firebase n'est chargé qu'à la première utilisation : la table
     reste légère et utilisable hors ligne tant qu'on n'ouvre pas de session.

   Expose window.KJ.session
   ============================================================ */
window.KJ = window.KJ || {};
KJ.session = (function () {

  const VERSION_SDK = '10.14.1';
  const SDK = [
    'https://www.gstatic.com/firebasejs/' + VERSION_SDK + '/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/' + VERSION_SDK + '/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/' + VERSION_SDK + '/firebase-database-compat.js',
  ];

  let db = null, uid = null;
  let etatSession = null;   // { code, mj: bool, refs: [fonctions de désabonnement] }
  let publierTimer = null, publierDernier = null;

  const configuree = () => !!window.KJ_FIREBASE_CONFIG;

  /* ---------- chargement paresseux du SDK ---------- */
  function chargerScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Chargement impossible : ' + src));
      document.head.appendChild(s);
    });
  }
  let pInit = null;
  function init() {
    if (pInit) return pInit;
    pInit = (async () => {
      if (!configuree())
        throw new Error('Sessions non configurées : remplir js/firebase-config.js (voir ARCHITECTURE.md).');
      if (!navigator.onLine)
        throw new Error('Pas de connexion internet : les sessions multi-appareils en ont besoin.');
      for (const s of SDK) if (!window.firebase || !chargeDeja(s)) await chargerScript(s);
      firebase.initializeApp(window.KJ_FIREBASE_CONFIG);
      // connexion anonyme : aucun compte à créer pour personne,
      // mais un identifiant stable qui permet de réserver l'écriture au MJ
      const cred = await firebase.auth().signInAnonymously();
      uid = cred.user.uid;
      db = firebase.database();
    })().catch(e => { pInit = null; throw e; });
    return pInit;
  }
  const chargeDeja = (src) => !!document.querySelector('script[src="' + src + '"]');

  /* ---------- code de session ----------
     Lisible à voix haute autour d'une table : pas de O/0, I/1, L. */
  const LETTRES = 'BCDFGHJKMNPRSTVWXZ', CHIFFRES = '23456789';
  function genererCode() {
    const t = (a) => a[Math.floor(Math.random() * a.length)];
    return t(LETTRES) + t(LETTRES) + t(LETTRES) + '-' + t(CHIFFRES) + t(CHIFFRES) + t(CHIFFRES);
  }

  /* ---------- côté MJ ---------- */
  async function creer() {
    await init();
    for (let essai = 0; essai < 5; essai++) {
      const code = genererCode();
      const ref = db.ref('sessions/' + code);
      const existante = (await ref.get()).val();
      // un code déjà pris par une session récente (< 24 h) : on en tire un autre
      if (existante && Date.now() - (existante.creee || 0) < 86400000) continue;
      await ref.set({ mj: uid, creee: firebase.database.ServerValue.TIMESTAMP, etat: null });
      ref.onDisconnect().update({ mjParti: firebase.database.ServerValue.TIMESTAMP });
      etatSession = { code, mj: true, refs: [] };
      return code;
    }
    throw new Error('Impossible de trouver un code libre — réessaie.');
  }

  /* Publication de l'état, avec lissage : peindre le brouillard déclenche des
     dizaines de sauvegardes par seconde, on n'envoie que la dernière toutes
     les 300 ms. L'état complet reste petit (quelques Ko). */
  function publier(partie) {
    if (!etatSession || !etatSession.mj || !db) return;
    publierDernier = partie;
    if (publierTimer) return;
    publierTimer = setTimeout(() => {
      publierTimer = null;
      db.ref('sessions/' + etatSession.code + '/etat')
        .set(JSON.parse(JSON.stringify(publierDernier)))
        .catch(() => {});
    }, 300);
  }

  function surJoueurs(cb) {
    if (!etatSession || !db) return;
    const ref = db.ref('sessions/' + etatSession.code + '/joueurs');
    const h = ref.on('value', s => cb(s.numChildren()));
    etatSession.refs.push(() => ref.off('value', h));
  }

  /* ---------- côté joueur ---------- */
  async function rejoindre(code, handlers) {
    await init();
    code = String(code || '').trim().toUpperCase();
    // tolère la saisie sans tiret
    if (/^[A-Z]{3}[0-9]{3}$/.test(code)) code = code.slice(0, 3) + '-' + code.slice(3);
    const ref = db.ref('sessions/' + code);
    const s = (await ref.get()).val();
    if (!s || !s.mj) throw new Error('Aucune session « ' + code + ' ». Vérifie le code avec le MJ.');
    etatSession = { code, mj: false, refs: [] };
    // présence : le MJ voit combien de joueurs suivent ; départ propre à la déconnexion
    const moi = ref.child('joueurs/' + uid);
    moi.set(firebase.database.ServerValue.TIMESTAMP).catch(() => {});
    moi.onDisconnect().remove();
    // l'état de partie, en continu
    const rEtat = ref.child('etat');
    const hEtat = rEtat.on('value', snap => {
      const etat = snap.val();
      if (etat && handlers.onEtat) handlers.onEtat(etat);
    });
    etatSession.refs.push(() => rEtat.off('value', hEtat));
    // pings éphémères du MJ
    if (handlers.onPing) {
      const rPing = ref.child('ping');
      const hPing = rPing.on('value', snap => {
        const p = snap.val();
        if (p && Date.now() - (p.t || 0) < 15000) handlers.onPing(p);
      });
      etatSession.refs.push(() => rPing.off('value', hPing));
    }
    // fin de session : le MJ a fermé, ou s'est déconnecté
    const hFin = ref.on('value', snap => {
      const v = snap.val();
      if ((!v || v.mjParti) && handlers.onFin) handlers.onFin(!v ? 'fermee' : 'mj-deconnecte');
    });
    etatSession.refs.push(() => ref.off('value', hFin));
    return code;
  }

  function ping(x, y, carteId) {
    if (!etatSession || !etatSession.mj || !db) return;
    db.ref('sessions/' + etatSession.code + '/ping')
      .set({ x, y, carte: carteId, t: firebase.database.ServerValue.TIMESTAMP })
      .catch(() => {});
  }

  /* ---------- commun ---------- */
  async function fermer() {
    if (!etatSession) return;
    etatSession.refs.forEach(f => { try { f(); } catch (e) {} });
    if (db) {
      if (etatSession.mj) await db.ref('sessions/' + etatSession.code).remove().catch(() => {});
      else await db.ref('sessions/' + etatSession.code + '/joueurs/' + uid).remove().catch(() => {});
    }
    etatSession = null;
  }

  return {
    configuree,
    active: () => !!etatSession,
    estMJ: () => !!(etatSession && etatSession.mj),
    code: () => (etatSession ? etatSession.code : null),
    creer, rejoindre, publier, ping, surJoueurs, fermer,
  };
})();
