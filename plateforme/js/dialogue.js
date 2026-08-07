/* ============================================================
   Cartographe — dialogues internes (confirmer / info / saisir)
   ------------------------------------------------------------
   Remplace confirm(), alert() et prompt() du navigateur. Pourquoi :
   - sur téléphone ces boîtes sont minuscules, sans multi-ligne, et iOS peut
     purement les supprimer ;
   - Chrome propose « ne plus autoriser ce site à vous solliciter » : une fois
     cochée, confirm() renvoie « non » en silence et l'action ÉCHOUE sans que
     personne comprenne pourquoi ;
   - dans une application empaquetée (WebView), elles sont souvent désactivées ;
   - elles bloquent le fil d'exécution, donc gèlent le temps réel de la partie.

   Tout rend une promesse : confirmer → booléen, saisir → texte ou null,
   info → rien. Un seul dialogue à la fois (le précédent est refermé).

   Expose window.KJ.dlg
   ============================================================ */
window.KJ = window.KJ || {};
KJ.dlg = (function () {

  let courant = null;   // { fond, resoudre }

  function fermer(valeur) {
    if (!courant) return;
    const c = courant;
    courant = null;
    if (c.fond && c.fond.parentNode) c.fond.parentNode.removeChild(c.fond);
    document.removeEventListener('keydown', c.clavier, true);
    c.resoudre(valeur);
  }

  /* opts : { titre, texte, champ:{label,valeur,multi,max}, ok, annuler, danger } */
  function ouvrir(opts) {
    fermer(opts.valeurAnnule);   // un seul à la fois
    return new Promise((resoudre) => {
      const fond = document.createElement('div');
      fond.className = 'kj-dlg-fond';
      const boite = document.createElement('div');
      boite.className = 'kj-dlg';
      fond.appendChild(boite);

      if (opts.titre) {
        const h = document.createElement('h3');
        h.textContent = opts.titre;
        boite.appendChild(h);
      }
      // le texte peut contenir des sauts de ligne : un paragraphe par ligne
      String(opts.texte || '').split('\n').forEach((ligne) => {
        if (!ligne.trim()) return;
        const p = document.createElement('p');
        p.textContent = ligne;
        boite.appendChild(p);
      });

      let champ = null;
      if (opts.champ) {
        champ = document.createElement(opts.champ.multi ? 'textarea' : 'input');
        if (!opts.champ.multi) champ.type = 'text';
        if (opts.champ.max) champ.maxLength = opts.champ.max;
        champ.value = opts.champ.valeur == null ? '' : String(opts.champ.valeur);
        if (opts.champ.placeholder) champ.placeholder = opts.champ.placeholder;
        champ.id = 'kj-dlg-champ';
        champ.className = 'kj-dlg-champ';
        boite.appendChild(champ);
      }

      const barre = document.createElement('div');
      barre.className = 'kj-dlg-barre';
      // ids stables : repérables au débogage et dans les tests automatisés
      const bAnn = document.createElement('button');
      bAnn.id = 'kj-dlg-annuler';
      bAnn.textContent = opts.annuler || 'Annuler';
      bAnn.addEventListener('click', () => fermer(opts.valeurAnnule));
      const bOk = document.createElement('button');
      bOk.id = 'kj-dlg-ok';
      bOk.textContent = opts.ok || 'OK';
      bOk.className = 'primaire' + (opts.danger ? ' danger' : '');
      bOk.addEventListener('click', () => fermer(champ ? champ.value : true));
      // pas de bouton Annuler pour une simple information
      if (!opts.info) barre.appendChild(bAnn);
      barre.appendChild(bOk);
      boite.appendChild(barre);

      const clavier = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(opts.valeurAnnule); }
        else if (e.key === 'Enter') {
          // dans une zone multi-ligne, Entrée saute une ligne : Ctrl+Entrée valide
          if (champ && opts.champ.multi && !(e.ctrlKey || e.metaKey)) return;
          e.preventDefault(); e.stopPropagation();
          fermer(champ ? champ.value : true);
        }
      };
      document.addEventListener('keydown', clavier, true);
      // clic sur le fond = annuler (jamais pour une action dangereuse : trop facile)
      fond.addEventListener('click', (e) => { if (e.target === fond && !opts.danger) fermer(opts.valeurAnnule); });

      courant = { fond: fond, resoudre: resoudre, clavier: clavier };
      document.body.appendChild(fond);
      setTimeout(() => { (champ || bOk).focus(); }, 0);
    });
  }

  return {
    /* Remplace confirm() : rend une promesse de booléen. */
    confirmer(texte, opts) {
      opts = opts || {};
      return ouvrir({ titre: opts.titre, texte: texte, ok: opts.ok || 'Confirmer',
        annuler: opts.annuler, danger: opts.danger, valeurAnnule: false })
        .then(v => v === true);
    },
    /* Remplace alert() : rend une promesse résolue à la fermeture. */
    info(texte, opts) {
      opts = opts || {};
      return ouvrir({ titre: opts.titre, texte: texte, ok: opts.ok || 'Fermer',
        info: true, valeurAnnule: true });
    },
    /* Remplace prompt() : rend le texte saisi, ou null si annulé. */
    saisir(texte, valeur, opts) {
      opts = opts || {};
      return ouvrir({ titre: opts.titre, texte: texte, ok: opts.ok || 'Valider',
        champ: { valeur: valeur, multi: !!opts.multi, max: opts.max, placeholder: opts.placeholder },
        valeurAnnule: null })
        .then(v => (v === null ? null : String(v)));
    },
    ferme() { return !courant; },
  };
})();
