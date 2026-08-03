/* ============================================================
   Configuration Firebase — propre à TON projet.
   ------------------------------------------------------------
   À remplir une seule fois : console.firebase.google.com
   → ton projet → ⚙ Paramètres du projet → « Vos applications »
   → application Web → copier l'objet firebaseConfig ici.

   Ces valeurs ne sont PAS des secrets : elles identifient le projet,
   elles ne donnent aucun droit — ce sont les règles de sécurité de la
   base (database.rules.json) qui protègent les données. Elles peuvent
   donc vivre dans le dépôt et être servies par le site.

   Tant que ce fichier vaut null, l'application fonctionne exactement
   comme avant : les sessions multi-appareils sont simplement proposées
   comme « non configurées ».
   ============================================================ */
window.KJ_FIREBASE_CONFIG = {
  apiKey: "AIzaSyC4aZ_rsYbGt3Xh2dyfFvTxVLty_TiFxdg",
  authDomain: "creation-de-carte-jdr.firebaseapp.com",
  databaseURL: "https://creation-de-carte-jdr-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "creation-de-carte-jdr",
  storageBucket: "creation-de-carte-jdr.firebasestorage.app",
  messagingSenderId: "877683817576",
  appId: "1:877683817576:web:d09373c70bd9c2bb498fdd"
};
