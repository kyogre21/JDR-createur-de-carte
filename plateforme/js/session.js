/* ============================================================
   Cartographe — comptes MJ et parties persistantes (Firebase)
   ------------------------------------------------------------
   Le MJ a un compte (e-mail + mot de passe) ; il crée des PARTIES qui
   restent ouvertes d'une soirée à l'autre : brouillard, révélations et
   jetons sont conservés dans la base, et le code à 4 chiffres reste le
   même toute la campagne — les joueurs gardent le lien en favori.
   Les joueurs, eux, entrent en INVITÉS (connexion anonyme) : un code
   suffit, aucun compte à créer.

   Principes (voir ARCHITECTURE.md) :
   - seul l'ÉTAT DE PARTIE transite (brouillard, jetons, carte affichée,
     révélations) — jamais les cartes elles-mêmes, servies par le site ;
   - seul le MJ propriétaire écrit (règles : database.rules.json) ; les
     joueurs déposent leurs gestes dans mouvements/<uid>, le MJ applique ;
   - l'espace privé du MJ (mj/<uid>) porte sa liste de parties et l'index
     de ses cartes : sans compte, la bibliothèque n'est pas découvrable ;
   - le SDK Firebase n'est chargé qu'à la première utilisation : la table
     reste légère et utilisable hors ligne tant qu'on ne touche pas au réseau.

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

  let db = null, utilisateur = null;
  let etatSession = null;   // { code, mj: bool, refs: [fonctions de désabonnement] }
  let publierTimer = null, publierDernier = null;

  const configuree = () => !!window.KJ_FIREBASE_CONFIG;
  const TS = () => firebase.database.ServerValue.TIMESTAMP;

  /* ---------- chargement paresseux du SDK ---------- */
  function chargerScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      // sans CORS, une exception de nos rappels traversant le SDK est masquée
      // en « Script error. » sans fichier ni ligne — indiagnosticable
      s.crossOrigin = 'anonymous';
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
        throw new Error('Pas de connexion internet : les parties multi-appareils en ont besoin.');
      for (const s of SDK) if (!window.firebase || !chargeDeja(s)) await chargerScript(s);
      if (!firebase.apps.length) firebase.initializeApp(window.KJ_FIREBASE_CONFIG);
      db = firebase.database();
      // le navigateur mémorise la connexion : un MJ connecté le reste d'une visite
      // à l'autre — on attend ce qu'il a en réserve avant de créer un anonyme
      utilisateur = await new Promise(res => {
        const off = firebase.auth().onAuthStateChanged(u => { off(); res(u); });
      });
      if (!utilisateur) utilisateur = (await firebase.auth().signInAnonymously()).user;
      poserMarqueurMJ();
    })().catch(e => { pInit = null; throw e; });
    return pInit;
  }
  const chargeDeja = (src) => !!document.querySelector('script[src="' + src + '"]');
  const uid = () => (utilisateur ? utilisateur.uid : null);

  /* ---------- compte MJ ----------
     Un vrai compte (e-mail + mot de passe) : c'est lui qui rend la bibliothèque
     et les parties PRIVÉES — un visiteur ou un invité anonyme n'y a pas accès. */
  const estMJconnecte = () => !!(utilisateur && !utilisateur.isAnonymous);
  const emailMJ = () => (estMJconnecte() ? utilisateur.email : null);
  /* Marqueur local « un MJ est (probablement) connecté ici » : il permet aux pages
     de savoir AVANT de charger le SDK si la bibliothèque en ligne vaut d'être
     attendue — sans lui, chaque visiteur et chaque invité payait l'initialisation
     complète juste pour apprendre qu'il n'y avait rien à attendre. */
  function poserMarqueurMJ() {
    try {
      if (estMJconnecte()) localStorage.setItem('kj-mj-connecte', '1');
      else localStorage.removeItem('kj-mj-connecte');
    } catch (e) {}
  }
  const mjProbable = () => {
    try { return localStorage.getItem('kj-mj-connecte') === '1'; } catch (e) { return false; }
  };

  function traduireErreurAuth(e) {
    const codes = {
      'auth/invalid-email': 'Adresse e-mail invalide.',
      'auth/user-not-found': 'Aucun compte avec cette adresse.',
      'auth/wrong-password': 'Mot de passe incorrect.',
      'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
      'auth/invalid-login-credentials': 'E-mail ou mot de passe incorrect.',
      'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse — connecte-toi.',
      'auth/weak-password': 'Mot de passe trop court : 6 caractères minimum.',
      'auth/too-many-requests': 'Trop d’essais — réessaie dans quelques minutes.',
      'auth/operation-not-allowed': 'La connexion par e-mail n’est pas activée sur le projet '
        + 'Firebase (console → Authentication → Sign-in method).',
    };
    return new Error(codes[e && e.code] || (e && e.message) || 'Connexion impossible.');
  }
  async function connexionMJ(email, mdp) {
    await init();
    try {
      utilisateur = (await firebase.auth().signInWithEmailAndPassword(email.trim(), mdp)).user;
    } catch (e) { throw traduireErreurAuth(e); }
    poserMarqueurMJ();
    return utilisateur.email;
  }
  async function creerCompteMJ(email, mdp) {
    await init();
    try {
      utilisateur = (await firebase.auth().createUserWithEmailAndPassword(email.trim(), mdp)).user;
      // pseudo par défaut : la partie avant l'@ — modifiable ensuite (definirPseudo) ;
      // c'est le pseudo qui s'affiche dans l'application, jamais l'adresse complète
      await utilisateur.updateProfile({ displayName: email.trim().split('@')[0] }).catch(() => {});
    } catch (e) { throw traduireErreurAuth(e); }
    poserMarqueurMJ();
    return utilisateur.email;
  }
  async function definirPseudo(nom) {
    await init();
    if (!estMJconnecte()) throw new Error('Connecte-toi d’abord.');
    await utilisateur.updateProfile({ displayName: String(nom || '').trim().slice(0, 40) });
    return utilisateur.displayName;
  }
  const pseudoMJ = () => (estMJconnecte() ? (utilisateur.displayName || utilisateur.email) : null);
  async function deconnexion() {
    await fermer();
    try { await firebase.auth().signOut(); } catch (e) {}
    utilisateur = null;
    poserMarqueurMJ();
    pInit = null;   // le prochain usage repartira en invité anonyme
  }
  /* À appeler pour savoir qui est là (charge le SDK au besoin). Renvoie le PSEUDO
     du MJ connecté (jamais l'adresse complète), ou null (visiteur/invité). */
  async function quiEstConnecte() {
    await init();
    return pseudoMJ();
  }

  /* ---------- code de partie ----------
     4 chiffres : vite dicté, vite tapé sur un téléphone. Le code est STABLE pour
     toute la vie de la partie — le lien donné aux joueurs au premier soir reste
     valable toute la campagne. */
  function genererCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  /* ---------- côté MJ : parties persistantes ---------- */
  function brancherMJ(code) {
    /* rebrancher SANS nettoyer l'ancienne session laissait ses écouteurs vivants :
       les mouvements des joueurs de la partie A s'appliquaient à l'état de la
       partie B — et le timer de publication pouvait écrire A dans B. */
    if (etatSession) etatSession.refs.forEach(f => { try { f(); } catch (e) {} });
    if (publierTimer) { clearTimeout(publierTimer); publierTimer = null; publierDernier = null; }
    etatSession = { code, mj: true, refs: [] };
    // présence : les joueurs voient si le MJ est à la table ; la partie, elle, RESTE
    const r = db.ref('parties/' + code + '/mjEnLigne');
    r.onDisconnect().set(false);
    etatSession.refs.push(() => r.onDisconnect().cancel());
  }
  async function creerPartie(nom) {
    await init();
    if (!estMJconnecte()) throw new Error('Connecte-toi avec ton compte MJ pour créer une partie.');
    for (let essai = 0; essai < 8; essai++) {
      const code = genererCode();
      const ref = db.ref('parties/' + code);
      if ((await ref.get()).exists()) continue;   // code déjà pris par une partie vivante
      await ref.set({ mj: uid(), nom: nom || 'Partie', creee: TS(), modifiee: TS(),
        mjEnLigne: true, etat: null });
      await db.ref('mj/' + uid() + '/parties/' + code)
        .set({ nom: nom || 'Partie', creee: TS(), modifiee: TS() });
      brancherMJ(code);
      return code;
    }
    throw new Error('Impossible de trouver un code libre — réessaie.');
  }
  /* Reprendre une partie existante : rend l'état conservé (à appliquer localement),
     ou null si la partie n'a encore jamais publié d'état. */
  async function reprendrePartie(code) {
    await init();
    const ref = db.ref('parties/' + code);
    const p = (await ref.get()).val();
    if (!p || p.mj !== uid()) throw new Error('Partie « ' + code + ' » introuvable sur ce compte.');
    // les gestes des joueurs sont ceux d'une soirée : on ne rejoue pas ceux d'avant
    await ref.child('mouvements').remove().catch(() => {});
    await ref.update({ mjEnLigne: true, modifiee: TS() });
    brancherMJ(code);
    return p.etat || null;
  }
  async function listerParties() {
    await init();
    if (!estMJconnecte()) return [];
    const v = (await db.ref('mj/' + uid() + '/parties').get()).val() || {};
    return Object.keys(v).map(code => Object.assign({ code: code }, v[code]))
      .sort((a, b) => (b.modifiee || 0) - (a.modifiee || 0));
  }
  /* Le MJ connecté qui suit le lien de SA propre partie (ou en tape le code) ne doit
     jamais y entrer en invité : la table vérifie d'abord la propriété. */
  async function estProprietaire(code) {
    await init();
    if (!estMJconnecte()) return false;
    const v = (await db.ref('parties/' + String(code || '').replace(/\D+/g, '') + '/mj').get()).val();
    return v === uid();
  }
  async function supprimerPartie(code) {
    await init();
    if (etatSession && etatSession.code === code) await fermer();
    await db.ref('parties/' + code).remove();
    await db.ref('mj/' + uid() + '/parties/' + code).remove();
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
      // la table a pu être quittée pendant les 300 ms d'attente : plus rien à publier
      if (!etatSession || !etatSession.mj) return;
      db.ref('parties/' + etatSession.code)
        .update({ etat: JSON.parse(JSON.stringify(publierDernier)), modifiee: TS() })
        .catch(() => {});
    }, 300);
  }

  function surJoueurs(cb) {
    if (!etatSession || !db) return;
    const ref = db.ref('parties/' + etatSession.code + '/joueurs');
    const h = ref.on('value', s => cb(s.numChildren()));
    etatSession.refs.push(() => ref.off('value', h));
  }

  /* ---------- côté joueur (invité) ---------- */
  async function rejoindre(code, handlers) {
    await init();
    code = String(code || '').replace(/\D+/g, '');
    const ref = db.ref('parties/' + code);
    const s = (await ref.get()).val();
    if (!s || !s.mj) throw new Error('Aucune partie « ' + code + ' ». Vérifie le code avec le MJ.');
    etatSession = { code, mj: false, refs: [] };
    // présence : le MJ voit combien de joueurs suivent ; départ propre à la déconnexion
    const moi = ref.child('joueurs/' + uid());
    moi.set(TS()).catch(() => {});
    moi.onDisconnect().remove();
    // l'état de partie, en continu — y compris l'état CONSERVÉ d'une soirée
    // précédente, servi immédiatement même si le MJ n'est pas encore là
    const rEtat = ref.child('etat');
    const hEtat = rEtat.on('value', snap => {
      const etat = snap.val();
      if (etat && handlers.onEtat) handlers.onEtat(etat);
    });
    etatSession.refs.push(() => rEtat.off('value', hEtat));
    // la carte affichée, transportée par la partie (voir publierCartePartie)
    if (handlers.onCarte) {
      const rCarte = ref.child('carte');
      const hCarte = rCarte.on('value', snap => {
        const c = snap.val();
        if (c && c.json && handlers.onCarte) handlers.onCarte(c);
      });
      etatSession.refs.push(() => rCarte.off('value', hCarte));
    }
    // pings éphémères du MJ
    if (handlers.onPing) {
      const rPing = ref.child('ping');
      const hPing = rPing.on('value', snap => {
        const p = snap.val();
        if (p && Date.now() - (p.t || 0) < 15000) handlers.onPing(p);
      });
      etatSession.refs.push(() => rPing.off('value', hPing));
    }
    // présence du MJ (la partie survit à ses absences) et suppression de la partie
    if (handlers.onPresence) {
      const rL = ref.child('mjEnLigne');
      const hL = rL.on('value', snap => handlers.onPresence(!!snap.val()));
      etatSession.refs.push(() => rL.off('value', hL));
    }
    /* détection de fermeture : écouter « creee » (un scalaire), PAS le nœud entier —
       un écouteur value sur parties/<code> re-téléchargeait la carte complète ET
       toutes ses images chez chaque joueur à CHAQUE publication d'état (≈3/s en
       peignant le brouillard) : quota et forfait mobile engloutis. */
    const rFin = ref.child('creee');
    const hFin = rFin.on('value', snap => {
      if (snap.val() === null && handlers.onFin) handlers.onFin('fermee');
    });
    etatSession.refs.push(() => rFin.off('value', hFin));
    return code;
  }

  /* Un joueur déplace son jeton : il n'a pas le droit d'écrire l'état (le MJ est
     seul maître), mais il dépose son geste dans une boîte aux lettres à son nom —
     le MJ l'applique à l'état officiel, qui redescend ensuite vers tout le monde. */
  function envoyerMouvement(m) {
    if (!etatSession || etatSession.mj || !db) return;
    db.ref('parties/' + etatSession.code + '/mouvements/' + uid())
      .set(Object.assign({}, m, { t: TS() }))
      .catch(() => {});
  }
  function surMouvements(cb) {
    if (!etatSession || !etatSession.mj || !db) return;
    const ref = db.ref('parties/' + etatSession.code + '/mouvements');
    const h = ref.on('child_added', s => cb(s.val()));
    const h2 = ref.on('child_changed', s => cb(s.val()));
    etatSession.refs.push(() => { ref.off('child_added', h); ref.off('child_changed', h2); });
  }

  function ping(x, y, carteId) {
    if (!etatSession || !etatSession.mj || !db) return;
    db.ref('parties/' + etatSession.code + '/ping')
      .set({ x, y, carte: carteId, t: TS() })
      .catch(() => {});
  }

  /* ---------- les cartes du MJ (bibliothèque en ligne) ----------
     La SOURCE DE VÉRITÉ des cartes est le compte : créée ou modifiée n'importe où,
     une carte est disponible sur tous les appareils du MJ, sans dossier à lier ni
     synchronisation manuelle. Chaque carte est stockée en une CHAÎNE JSON intacte
     (Firebase ampute les objets de leurs champs vides — voir erreur n°24 du skill).
     Le dossier lié (PC) reste un bonus : une copie fichiers pour git. */
  const cleCarte = (id) => String(id).replace(/[.#$\[\]\/]/g, '_');
  async function listerCartesMJ() {
    await init();
    if (!estMJconnecte()) return null;   // null = « pas de bibliothèque en ligne ici »
    const v = (await db.ref('mj/' + uid() + '/cartes').get()).val() || {};
    return Object.keys(v).map(k => v[k] && v[k].json).filter(Boolean);
  }
  async function enregistrerCarteMJ(id, nom, campagne, maj, json) {
    await init();
    if (!estMJconnecte()) throw new Error('Connecte-toi (compte MJ) pour enregistrer dans ta bibliothèque.');
    await db.ref('mj/' + uid() + '/cartes/' + cleCarte(id))
      .set({ id: id, nom: nom || '', campagne: campagne || '', maj: maj || Date.now(), json: json });
  }
  async function supprimerCarteMJ(id) {
    await init();
    if (!estMJconnecte()) return false;
    await db.ref('mj/' + uid() + '/cartes/' + cleCarte(id)).remove();
    return true;
  }

  /* ---------- les images du MJ (illustrations de compte) ----------
     Même principe que les cartes : chaque compte a les siennes, importées depuis
     l'appareil et FORTEMENT compressées avant envoi (data URL ~512 px) — la base
     gratuite est comptée, les cartes restent prioritaires. Posée sur une carte,
     l'image est embarquée dans le JSON de la carte (el.src = data URL) : les
     joueurs la reçoivent avec la carte, sans accès au compte du MJ. */
  async function listerImagesMJ() {
    await init();
    if (!estMJconnecte()) return null;   // null = « pas de compte connecté ici »
    const v = (await db.ref('mj/' + uid() + '/images').get()).val() || {};
    return Object.keys(v)
      .map(k => ({ id: k, nom: (v[k] && v[k].nom) || '', data: v[k] && v[k].data,
                   dossier: (v[k] && v[k].dossier) || '' }))
      .filter(x => x.data)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }
  async function enregistrerImageMJ(nom, data, dossier) {
    await init();
    if (!estMJconnecte()) throw new Error('Connecte-toi (compte MJ) pour importer des images.');
    await db.ref('mj/' + uid() + '/images').push({ nom: nom || '', data: data,
      dossier: dossier || '', maj: TS() });
  }
  async function supprimerImageMJ(id) {
    await init();
    if (!estMJconnecte()) return false;
    await db.ref('mj/' + uid() + '/images/' + String(id).replace(/[.#$\[\]\/]/g, '_')).remove();
    return true;
  }
  // déplacer/renommer une image du compte (champs : { nom, dossier })
  async function modifierImageMJ(id, champs) {
    await init();
    if (!estMJconnecte()) throw new Error('Connecte-toi (compte MJ).');
    const maj = {};
    if (champs.nom !== undefined) maj.nom = champs.nom;
    if (champs.dossier !== undefined) maj.dossier = champs.dossier;
    await db.ref('mj/' + uid() + '/images/' + String(id).replace(/[.#$\[\]\/]/g, '_')).update(maj);
  }
  /* Dossiers d'images DÉCLARÉS : un dossier doit exister même vide (créé avant
     d'y importer quoi que ce soit), il est donc mémorisé dans le compte au lieu
     d'être seulement déduit des images qu'il contient. */
  async function dossiersImagesMJ() {
    await init();
    if (!estMJconnecte()) return [];
    const v = (await db.ref('mj/' + uid() + '/imagesDossiers').get()).val() || {};
    return Object.keys(v).map(k => v[k]).filter(Boolean);
  }
  async function declarerDossierImagesMJ(nom) {
    await init();
    if (!estMJconnecte()) throw new Error('Connecte-toi (compte MJ).');
    await db.ref('mj/' + uid() + '/imagesDossiers/' + cleCarte(nom)).set(nom);
  }
  async function oublierDossierImagesMJ(nom) {
    await init();
    if (!estMJconnecte()) return;
    await db.ref('mj/' + uid() + '/imagesDossiers/' + cleCarte(nom)).remove();
  }

  /* ---------- la carte affichée, transportée par la partie ----------
     Les joueurs n'ont ni compte ni bibliothèque : la partie leur apporte la carte
     elle-même. Le MJ la publie à chaque changement (rare), les joueurs l'écoutent. */
  function publierCartePartie(id, json, images) {
    if (!etatSession || !etatSession.mj || !db) return;
    // images : { idImage: dataURL } — celles du compte MJ que la carte référence
    // (src « img:<id> ») ; les joueurs n'ont pas accès au compte, la partie leur
    // apporte donc les données avec la carte.
    db.ref('parties/' + etatSession.code + '/carte')
      .set({ id: id, json: json, images: images || null, maj: TS() })
      .catch(() => {});
  }

  /* ---------- commun ----------
     « fermer » = QUITTER la table ce soir : la partie et son état restent dans la
     base pour la prochaine séance. Détruire une partie = supprimerPartie. */
  async function fermer() {
    if (!etatSession) return;
    // publier la dernière version en attente AVANT de couper : sans ça, les 300
    // dernières ms de brouillard peint juste avant « Quitter » étaient perdues
    if (publierTimer) {
      clearTimeout(publierTimer); publierTimer = null;
      if (etatSession.mj && publierDernier && db)
        await db.ref('parties/' + etatSession.code)
          .update({ etat: JSON.parse(JSON.stringify(publierDernier)), modifiee: TS() })
          .catch(() => {});
      publierDernier = null;
    }
    etatSession.refs.forEach(f => { try { f(); } catch (e) {} });
    if (db) {
      if (etatSession.mj)
        await db.ref('parties/' + etatSession.code + '/mjEnLigne').set(false).catch(() => {});
      else
        await db.ref('parties/' + etatSession.code + '/joueurs/' + uid()).remove().catch(() => {});
    }
    etatSession = null;
  }

  return {
    configuree,
    active: () => !!etatSession,
    estMJ: () => !!(etatSession && etatSession.mj),
    code: () => (etatSession ? etatSession.code : null),
    // compte MJ
    connexionMJ, creerCompteMJ, deconnexion, quiEstConnecte, definirPseudo,
    estMJconnecte: () => estMJconnecte(),
    mjProbable,
    // parties persistantes
    creerPartie, reprendrePartie, listerParties, supprimerPartie, estProprietaire,
    // jeu en direct
    publier, rejoindre, fermer, ping, surJoueurs, surMouvements, envoyerMouvement,
    publierCartePartie,
    // bibliothèque en ligne
    listerCartesMJ, enregistrerCarteMJ, supprimerCarteMJ,
    // images du compte
    listerImagesMJ, enregistrerImageMJ, supprimerImageMJ, modifierImageMJ,
    dossiersImagesMJ, declarerDossierImagesMJ, oublierDossierImagesMJ,
  };
})();
