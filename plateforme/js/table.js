/* ============================================================
   Cartographe — mode Jeu (table virtuelle légère)
   Lit les cartes de la bibliothèque (IndexedDB) et du dépôt,
   ajoute brouillard de guerre, jetons, portails, ping et mesure.
   L'état de partie est distinct des cartes : une carte est une donnée,
   le brouillard et les jetons sont une session.
   ============================================================ */
(function () {
  const M = KJ.modele, R = KJ.rendu, S = KJ.stockage;
  const $ = (id) => document.getElementById(id);
  const scene = $('scene'), monde = $('monde'), plan = $('plan'), fog = $('fog'),
        pinsEl = $('pins'), imagesEl = $('images'), jetonsEl = $('jetons'), regle = $('regle'), sur = $('sur');

  const QUAL = 2, PINCEAU = 26, CLE_PARTIE = 'kj-partie';
  const params = new URLSearchParams(location.search);
  const codeSessionURL = (params.get('session') || '').trim() || null;
  const codePartieURL = (params.get('partie') || '').trim() || null;   // reprise MJ par l'adresse
  // rejoindre une session par lien impose la vue joueurs, comme ?vue=joueurs
  const vueJoueurs = params.get('vue') === 'joueurs' || !!codeSessionURL;
  if (vueJoueurs) {
    document.body.dataset.vue = 'joueurs';
    // classe séparée de data-vue (qui, elle, bascule aussi pour la préview locale du MJ) :
    // vraie ici pour toute la vie de cette fenêtre, jamais pour la préview. Sert à verrouiller
    // en dur ce qui ne doit JAMAIS apparaître dans une vraie fenêtre joueurs séparée (galerie,
    // lightbox), tout en les laissant fonctionner dans la préview locale d'un MJ solo qui
    // montre son propre écran — c'est justement le moyen de révéler une image au bon moment.
    document.body.classList.add('fenetre-joueurs');
    // b-vue (préview locale du MJ) n'a de sens que dans la fenêtre du MJ : ici, il n'y a
    // pas de « vue MJ » à laquelle revenir, donc pas de bouton pour y prétendre. b-galerie
    // reste dans la liste d'exception CSS de #barre-mj (utile à la préview locale) : il
    // faut donc le cacher ici explicitement, cette fenêtre-ci n'a rien à y déclencher.
    if ($('b-vue')) $('b-vue').style.display = 'none';
    if ($('b-galerie')) $('b-galerie').style.display = 'none';
  }
  const canal = ('BroadcastChannel' in window) ? new BroadcastChannel(CLE_PARTIE) : null;

  const COULEURS = ['#c9a227', '#6d8fb0', '#7fa070', '#a8544c', '#9aa0a6', '#b08fc9'];

  /* ---------------- état ---------------- */
  let carte = null;                 // carte affichée (données)
  let catalogue = [];               // [{ id, nom, source:'locale'|'depot', ref }]
  let galCatalogue = [];             // images/index.json : galerie indépendante du plan
  let galChemin = [];                // navigation dans le catalogue (chemin de dossiers) ; [] = racine
  let imagesCompte = null;           // images du compte MJ (côté MJ, pour résoudre les src « img:<id> »)
  let imagesPartie = {};             // côté joueur : { id: dataURL } transportées avec la carte
  let imagesChargement = null;       // promesse en cours (réessayée tant que rien n'est obtenu)

  /* Charge (ou recharge) les images du compte MJ. Réessaie à chaque appel tant que
     rien n'a été obtenu : le MJ peut très bien se connecter APRÈS l'ouverture de la
     page (modale « Partie »), or l'ancienne version ne tentait qu'une fois au
     chargement — les images partaient alors « null » vers les joueurs, en silence. */
  function chargerImagesCompte() {
    if (!KJ.session || !KJ.session.configuree()) return Promise.resolve(null);
    if (!imagesChargement)
      imagesChargement = KJ.session.listerImagesMJ()
        .then(l => { imagesCompte = l; if (l === null) imagesChargement = null; return l; })
        .catch(() => { imagesChargement = null; return null; });
    return imagesChargement;
  }

  /* Une src d'élément image peut être : un chemin du dépôt (images/…), un blob
     embarqué (data:, anciennes cartes), ou une référence de compte (img:<id>) —
     résolue ici depuis le compte du MJ ou depuis ce que la partie a transporté. */
  function resoudreImage(src) {
    if (!src || src.indexOf('img:') !== 0) return src;
    const id = src.slice(4);
    if (imagesPartie && imagesPartie[id]) return imagesPartie[id];
    const m = (imagesCompte || []).find(x => x.id === id);
    return m ? m.data : '';
  }
  // les images du compte que cette carte référence : partent avec elle vers les joueurs
  function imagesDeCarte(c) {
    const map = {};
    for (const el of c.elements) {
      if (el.type !== 'image' || !el.src || el.src.indexOf('img:') !== 0) continue;
      const data = resoudreImage(el.src);
      if (data) map[el.src.slice(4)] = data;
    }
    return Object.keys(map).length ? map : null;
  }
  let partie = { carte: null, fog: {}, jetons: [], reveles: {}, masques: {} };
  try { const s = localStorage.getItem(CLE_PARTIE); if (s) partie = JSON.parse(s); } catch (e) {}
  if (!partie.reveles) partie.reveles = {};   // sessions sauvegardées avant l'ajout de ce champ
  if (!partie.masques) partie.masques = {};   // idem : re-cachés à la main, prioritaires sur l'auto
  // un état reçu du réseau a pu être sauvegardé amputé de ses champs vides
  // (Firebase les supprime — voir appliquerEtatDistant) : mêmes gardes ici
  if (!partie.fog) partie.fog = {};
  if (!partie.jetons) partie.jetons = [];

  // diffuser: undefined = comportement par défaut (jamais depuis la vraie fenêtre séparée,
  // qui ne fait normalement que refléter le MJ) ; true = forcer la diffusion même depuis
  // cette fenêtre — nécessaire quand un joueur y déplace lui-même son jeton PJ, pour que
  // le MJ voie le résultat ; false = ne jamais diffuser (mise à jour reçue, pas d'écho).
  function sauverPartie(diffuser) {
    try { localStorage.setItem(CLE_PARTIE, JSON.stringify(partie)); }
    catch (e) {
      // quota plein (des années de brouillard accumulé) : le dire UNE fois plutôt
      // que de perdre silencieusement la sauvegarde locale à chaque geste
      if (!sauverPartie._quota) {
        sauverPartie._quota = true;
        toast('Sauvegarde locale pleine : « Réinitialiser cette carte » (brouillard) allège l’état.');
      }
    }
    const doitDiffuser = diffuser === true || (diffuser !== false && !vueJoueurs);
    if (doitDiffuser && canal) canal.postMessage({ t: 'partie', partie: partie });
    if (doitDiffuser && KJ.session && KJ.session.estMJ()) KJ.session.publier(partie);
  }
  /* Sauvegarde LISSÉE pour les gestes continus (pinceau, états reçus en rafale) :
     sérialiser + écrire localStorage + cloner vers l'autre fenêtre à chaque
     pointermove bloquait le fil principal 60 fois par seconde. Les gestes discrets
     (poser un jeton, révéler) continuent d'appeler sauverPartie directement. */
  let sauverTimer = null, sauverRang = 0;   // 1 = false, 2 = défaut, 3 = true (diffusion)
  function sauverPartieBientot(diffuser) {
    const r = diffuser === true ? 3 : diffuser === false ? 1 : 2;
    if (r > sauverRang) sauverRang = r;
    if (sauverTimer) return;
    sauverTimer = setTimeout(() => {
      sauverTimer = null;
      const d = sauverRang === 3 ? true : sauverRang === 1 ? false : undefined;
      sauverRang = 0;
      sauverPartie(d);
    }, 400);
  }
  function flushSauver() {
    if (!sauverTimer) return;
    clearTimeout(sauverTimer); sauverTimer = null;
    const d = sauverRang === 3 ? true : sauverRang === 1 ? false : undefined;
    sauverRang = 0;
    sauverPartie(d);
  }
  window.addEventListener('pagehide', flushSauver);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSauver(); });

  // éléments MJ (secret, image) révélés en permanence aux joueurs pour la carte affichée :
  // une session de partie, comme le brouillard — pas une donnée de la carte elle-même.
  const opsReveles = () => (partie.reveles[carte.id] = partie.reveles[carte.id] || []);
  const opsMasques = () => (partie.masques[carte.id] = partie.masques[carte.id] || []);
  /* Re-cacher NE désarme PLUS la révélation automatique (l'ancien « verrou »
     bloquait les éléments re-cachés pendant les tests, de façon invisible).
     Conséquence assumée : un élément re-caché alors qu'un PJ est encore dans sa
     zone se re-révélera au prochain mouvement — éloigner le jeton d'abord. */
  function basculerRevele(id) {
    const liste = opsReveles(), masques = opsMasques();
    const i = liste.indexOf(id);
    if (i >= 0) {
      liste.splice(i, 1);
      toast('Caché de nouveau aux joueurs.');
    } else {
      liste.push(id);
      toast('Révélé aux joueurs.');
    }
    const m = masques.indexOf(id);
    if (m >= 0) masques.splice(m, 1);   // purge les verrous hérités des anciennes versions
    dessinerPlan(); dessinerImages(); dessinerPins(); sauverPartie();
  }
  /* Révélation automatique : dès qu'un jeton PJ entre dans la pièce (élément 'piece') qui
     contient un secret ou une image non révélé, on le révèle — approximation volontaire
     d'une ligne de vue (une pièce fermée = un champ de vision) sans le coût d'un vrai calcul
     de raycasting, hors périmètre de ce projet (voir README, « ce qui n'est pas fait »).
     Permanent comme la révélation manuelle : ne redevient pas caché si le groupe ressort. */
  function verifierDeclencheurs() {
    if (!carte) return;
    const pjs = partie.jetons.filter(j => j.pj && j.carte === carte.id);
    if (!pjs.length) return;
    const revelees = opsReveles();
    // auto !== false : un élément sans le champ (anciens fichiers) reste éligible par défaut ;
    // el.auto = false l'exclut explicitement (ex. une trappe qui ne doit jamais se révéler
    // toute seule) — reste quand même révélable à la main, par clic droit.
    /* Secrets et images : révélation auto par défaut (e.auto !== false).
       Éléments « cachés aux joueurs » (el.cache) : l'inverse — clic droit du MJ
       uniquement, SAUF si la révélation auto a été cochée explicitement
       (e.auto === true) dans l'éditeur. Le « verrou » des éléments re-cachés à la
       main (masques) a été retiré : il désarmait l'automatisme de façon invisible. */
    const cibles = carte.elements.filter(e =>
      ((e.type === 'secret' || e.type === 'image') ? e.auto !== false : (e.cache && e.auto === true))
      && !revelees.includes(e.id));
    if (!cibles.length) return;
    const pieces = carte.elements.filter(e => e.type === 'piece');
    let changement = false;
    for (const cible of cibles) {
      const b = M.boite(cible);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      // la pièce qui contient le centre de la cible (la plus petite si plusieurs se chevauchent)
      const salle = pieces
        .filter(p => cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h)
        .sort((a, c) => a.w * a.h - c.w * c.h)[0];
      /* pas de pièce englobante (élément posé en couloir, extérieur…) : repli en
         rayon autour de l'élément, en CASES de la carte.
         - zone cachée (mur, pièce… marqué cache) : 1 case — le PJ doit passer
           dessus, pas à côté (demande explicite : ne rien révéler aux alentours) ;
         - secret ou image : « Portée » de l'élément (2 cases par défaut) — une
           embuscade qui flanque un pont peut avoir besoin de 4 ou 5 cases. */
      const cel = (carte.grille && carte.grille.cell) || 40;
      const r = cible.cache ? cel : cel * (cible.portee > 0 ? cible.portee : 2);
      const zone = salle || { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
      if (pjs.some(j => j.x >= zone.x && j.x <= zone.x + zone.w && j.y >= zone.y && j.y <= zone.y + zone.h)) {
        revelees.push(cible.id);
        changement = true;
        toast((cible.type === 'image' ? '🖼 ' : '⌗ ') + (cible.nom || cible.nature || 'Élément')
          + ' révélé : un PJ est entré dans la zone.');
      }
    }
    if (changement) { dessinerPlan(); dessinerImages(); sauverPartie(); }
  }
  const opsFog = () => (partie.fog[carte.id] = partie.fog[carte.id] || []);
  const cellule = () => (carte.grille.cell || 0);

  /* ---------------- caméra ---------------- */
  let cam = { s: 1, tx: 0, ty: 0 }, suivre = true;
  function appliquerCam() {
    monde.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})`;
    /* --inv = 1/zoom : sert aux zones tactiles (voir .jeton::before dans table.html).
       Jetons, portails et icônes d'image suivent le zoom de la carte ; sur un plan
       dézoomé (le cas normal sur téléphone) un jeton tombe à ~17 px à l'écran, très
       en dessous de ce qu'un doigt peut viser. Cette variable permet de garder une
       zone sensible de taille CONSTANTE À L'ÉCRAN sans toucher au dessin.
       Écrite SEULEMENT quand le zoom change : c'est une propriété héritée, la poser
       invalide le style de tout le sous-arbre (des milliers de nœuds) — un pan la
       laissait pourtant identique, à chaque frame. */
    if (cam.s !== appliquerCam._s) {
      appliquerCam._s = cam.s;
      monde.style.setProperty('--inv', 1 / (cam.s || 1));
    }
    if (canal && !vueJoueurs) {
      const r = rectScene();
      canal.postMessage({ t: 'cam', cx: (r.width / 2 - cam.tx) / cam.s, cy: (r.height / 2 - cam.ty) / cam.s, s: cam.s });
    }
  }
  /* Le rectangle de la scène ne bouge qu'au redimensionnement : le lire à chaque
     pointermove forçait un recalcul de mise en page par événement (60-120/s). */
  let rectSceneCache = null;
  function rectScene() { return rectSceneCache || (rectSceneCache = scene.getBoundingClientRect()); }
  window.addEventListener('resize', () => { rectSceneCache = null; });
  window.addEventListener('orientationchange', () => { rectSceneCache = null; });
  function cadrer() {
    rectSceneCache = null;   // la mise en page a pu changer (barre repliée, rotation)
    const r = rectScene();
    cam.s = Math.min(r.width / carte.taille.w, r.height / carte.taille.h) * 0.94;
    cam.tx = (r.width - carte.taille.w * cam.s) / 2;
    cam.ty = (r.height - carte.taille.h * cam.s) / 2;
    appliquerCam();
  }
  function versMonde(cx, cy) {
    const r = rectScene();
    return { x: (cx - r.left - cam.tx) / cam.s, y: (cy - r.top - cam.ty) / cam.s };
  }

  /* ---------------- brouillard ----------------
     Dessin INCRÉMENTAL : l'ancienne version rejouait TOUTES les touches depuis le
     début de la campagne à chaque mouvement du pinceau (coût quadratique : injouable
     après une minute de peinture cumulée) et réallouait le bitmap du canvas
     (10-30 Mo) à chaque appel. On mémorise ce que le canvas contient déjà (carte,
     nombre d'ops, signature de la dernière) et on ne peint que le suffixe ; le
     redessin complet ne sert qu'aux cas où l'historique a changé autrement
     (annulation, couvrir, carte changée, état distant divergent). */
  let fogCtx = null;
  let fogPeint = { carte: null, nb: 0, sig: '' };
  const sigOp = (o) => o ? o.m + o.x + ',' + o.y + ',' + o.r : '';
  function peindreOp(c, op) {
    if (op.m === 'reveal') {
      c.globalCompositeOperation = 'destination-out';
      const g = c.createRadialGradient(op.x, op.y, op.r * .55, op.x, op.y, op.r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
    } else {
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#080a12';   // noir légèrement bleuté : se distingue mieux du parchemin
    }
    c.beginPath(); c.arc(op.x, op.y, op.r, 0, 7); c.fill();
  }
  function dessinerFog() {
    const w = carte.taille.w, h = carte.taille.h;
    const ops = opsFog();
    // willReadFrequently : sousBrouillard lit des pixels juste après le dessin —
    // sur le chemin GPU, chaque lecture forçait une synchronisation coûteuse
    if (!fogCtx) fogCtx = fog.getContext('2d', { willReadFrequently: true });
    const c = fogCtx;
    const memeBase = fogPeint.carte === carte.id
      && fog.width === w * QUAL && fog.height === h * QUAL
      && ops.length >= fogPeint.nb
      && sigOp(ops[fogPeint.nb - 1]) === fogPeint.sig;
    if (memeBase) {
      for (let i = fogPeint.nb; i < ops.length; i++) peindreOp(c, ops[i]);
    } else {
      // écrire canvas.width VIDE le bitmap : ne réallouer que si la taille change
      if (fog.width !== w * QUAL || fog.height !== h * QUAL) { fog.width = w * QUAL; fog.height = h * QUAL; }
      fog.style.width = w + 'px'; fog.style.height = h + 'px';
      c.setTransform(QUAL, 0, 0, QUAL, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#080a12';
      c.fillRect(0, 0, w, h);
      for (const op of ops) peindreOp(c, op);
    }
    fogPeint = { carte: carte.id, nb: ops.length, sig: sigOp(ops[ops.length - 1]) };
  }
  function pinceau(m, x, y) {
    const ops = opsFog();
    const prec = ops[ops.length - 1];
    x = Math.round(x); y = Math.round(y);
    // filtre de distance : à 60-120 événements/s, garder chaque point multipliait
    // par 5-10 la taille de l'état (réseau, stockage, redessin) sans gain visible
    if (prec && prec.m === m && Math.hypot(prec.x - x, prec.y - y) < PINCEAU / 3) return;
    ops.push({ m: m, x: x, y: y, r: PINCEAU });
    dessinerFog(); sauverPartieBientot();
  }
  /* Le pinceau ne touche QUE le décor (choix de design après essai à table) : les
     révélations automatiques appartiennent aux mouvements des JOUEURS — entrée
     dans une pièce ou proximité (verifierDeclencheurs) — jamais au brouillard,
     sinon éclairer une salle éventait toute embuscade. Le clic droit du MJ reste
     le maître-geste pour forcer dans les deux sens. */
  /* Un coup de pinceau malheureux dévoile une pièce entière : il faut pouvoir
     revenir en arrière. On retire le dernier geste (une traînée = plusieurs
     touches, on remonte donc jusqu'au marqueur de début de geste). */
  /* Pile de marqueurs PAR CARTE : une pile globale mélangeait les index de
     plusieurs cartes — annuler après un changement de carte pouvait effacer des
     heures d'exploration d'une autre carte, ou pire, AGRANDIR le tableau (index
     d'une grande carte appliqué à une petite) et créer des trous qui faisaient
     planter dessinerFog à chaque redessin. */
  let marqueursFog = {};
  const pileFog = () => (marqueursFog[carte.id] = marqueursFog[carte.id] || []);
  function debutGesteFog() { const p = pileFog(); p.push(opsFog().length); if (p.length > 40) p.shift(); }
  function annulerFog() {
    const ops = opsFog(), pile = pileFog();
    if (!ops.length) { toast('Rien à annuler.'); return; }
    const depuis = pile.length ? pile.pop() : ops.length - 1;
    ops.length = Math.max(0, Math.min(depuis, ops.length));   // ne jamais agrandir
    dessinerFog(); sauverPartie();
    toast('Dernier geste de brouillard annulé.');
  }

  /* ---------------- rendu ---------------- */
  function dessinerPlan() {
    plan.setAttribute('width', carte.taille.w);
    plan.setAttribute('height', carte.taille.h);
    // ids:true : nécessaire pour retrouver un secret sous le clic droit (basculerRevele)
    // grain:false — le bruit de parchemin (feTurbulence) se recalcule pixel par
    // pixel à chaque rendu et à chaque palier de zoom : joli à l'export, ruineux à table
    R.dansSVG(plan, carte, { ids: true, vueMJ: document.body.dataset.vue === 'mj', grille: true,
      portails: false, images: false, grain: false, reveles: opsReveles() });
  }
  /* Icônes d'illustration (créatures, lieux) : comme les portails, dessinées en HTML
     pour être cliquables — un clic ouvre l'image en grand par-dessus le plan (lightbox),
     un clic droit bascule sa révélation permanente aux joueurs (basculerRevele). Invisibles
     en vue joueurs par CSS tant que non révélées (voir table.html) : jamais un spoiler
     visible avant que le MJ ne le décide. */
  function dessinerImages() {
    const revelees = opsReveles();
    imagesEl.innerHTML = '';
    for (const im of carte.elements.filter(e => e.type === 'image' && e.src)) {
      const d = document.createElement('div');
      d.className = 'img-pin' + (revelees.includes(im.id) ? ' revele' : '');
      d.dataset.src = im.src; d.dataset.id = im.id; d.title = im.nom || 'Image';
      d.style.left = im.x + 'px'; d.style.top = im.y + 'px';
      d.innerHTML = '<span class="ic">🖼</span>';
      imagesEl.appendChild(d);
    }
  }
  function ouvrirImage(src, titre) {
    // une référence img:<id> non résolue (compte pas connecté, image supprimée)
    // arrive ici en chaîne vide : le dire vaut mieux qu'une visionneuse cassée
    if (!src) { toast('Image indisponible — compte MJ non connecté, ou image supprimée du compte.'); return; }
    let lb = $('lightbox');
    if (!lb) {
      lb = document.createElement('div'); lb.id = 'lightbox';
      lb.innerHTML = '<img alt=""><p class="legende"></p>';
      lb.addEventListener('click', () => {
        // le tap qui vient d'ouvrir la visionneuse génère aussi un « clic » qui
        // atterrit sur elle (elle recouvre alors l'écran) et la refermait aussitôt
        if (Date.now() - (lb._ouverte || 0) < 500) return;
        lb.classList.remove('vu');
      });
      document.body.appendChild(lb);
    }
    lb.querySelector('img').src = src;
    lb.querySelector('.legende').textContent = titre || '';
    lb._ouverte = Date.now();
    lb.classList.add('vu');
  }

  /* ---------------- boîte de dialogue générique ----------------
     Un seul #modale, un seul point d'entrée : galerie d'images, nouveau jeton…
     construire(corps) remplit #modale-corps ; fermer réutilisable partout. */
  function bouton(txt, onc) {
    const b = document.createElement('button'); b.textContent = txt;
    b.addEventListener('click', onc); return b;
  }
  function ouvrirModale(titre, large, construire) {
    $('modale-titre').textContent = titre;
    $('modale').classList.toggle('large', !!large);
    const corps = $('modale-corps'); corps.innerHTML = '';
    construire(corps);
    $('modale').hidden = false;
  }
  function fermerModale() { $('modale').hidden = true; $('modale').classList.remove('pour-joueur'); }
  $('b-fermer-modale').addEventListener('click', fermerModale);
  $('modale').addEventListener('click', (e) => { if (e.target.id === 'modale') fermerModale(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('modale').hidden) fermerModale();
  });

  /* Sélecteur d'image navigable (dossiers + vignettes), partagé par la galerie et le
     choix de portrait d'un jeton. chemin est un tableau muté en place (pas réassigné),
     pour que l'appelant retrouve toujours le même chemin après un re-rendu. */
  function construirePickerImages(dEl, gEl, chemin, onChoisir) {
    // les images du compte MJ apparaissent comme un dossier « 👤 Mes images »
    // au milieu de celles du dépôt — mêmes dossiers, même navigation
    const catalogueComplet = () => galCatalogue.concat((imagesCompte || []).map(x =>
      ({ nom: x.nom, data: x.data, dossier: '👤 Mes images' + (x.dossier ? '/' + x.dossier : '') })));
    const rendre = () => {
      dEl.innerHTML = ''; gEl.innerHTML = '';
      const tout = catalogueComplet();
      if (!tout.length) {
        const p = document.createElement('p'); p.className = 'aide';
        p.textContent = 'Aucune image : dépôt vide et pas d’images de compte (importables dans l’éditeur).';
        gEl.appendChild(p);
        return;
      }
      const racine = bouton('🗀 Toutes', () => { chemin.splice(0); rendre(); });
      if (!chemin.length) racine.classList.add('actif');
      dEl.appendChild(racine);
      chemin.forEach((seg, i) => {
        const sep = document.createElement('span'); sep.className = 'fil-sep'; sep.textContent = '›';
        dEl.appendChild(sep);
        const b = bouton(seg, () => { chemin.splice(i + 1); rendre(); });
        if (i === chemin.length - 1) b.classList.add('actif');
        dEl.appendChild(b);
      });
      const { dossiers, images } = S.arboreImages(tout, chemin);
      if (!dossiers.length && !images.length) {
        const p = document.createElement('p'); p.className = 'aide'; p.textContent = 'Dossier vide.';
        gEl.appendChild(p);
        return;
      }
      for (const d of dossiers) {
        const b = document.createElement('button'); b.className = 'dossier';
        b.innerHTML = `<span class="ic-dossier">🗀</span><span>${d}</span>`;
        b.addEventListener('click', () => { chemin.push(d); rendre(); });
        gEl.appendChild(b);
      }
      for (const im of images) {
        const b = document.createElement('button');
        b.innerHTML = `<img src="${im.data || 'images/' + im.fichier}" alt="">` + `<span>${R.esc(im.nom || im.fichier)}</span>`;
        b.addEventListener('click', () => onChoisir(im));
        gEl.appendChild(b);
      }
    };
    rendre();
  }

  /* ---------------- galerie ----------------
     Montrer une illustration sans la poser sur le plan : utile quand aucune carte
     n'est nécessaire à l'instant (un PNJ important apparaît, une scène hors plan). */
  function chargerGalerie() {
    return S.avecDelai(S.catalogueImages(), 1500, []).then(l => { galCatalogue = l; });
  }
  function ouvrirGalerie() {
    ouvrirModale('Montrer une image', true, (corps) => {
      corps.innerHTML = '<div id="galerie-dossiers" class="fil-ariane"></div><div id="galerie-grille" class="palette"></div>';
      construirePickerImages($('galerie-dossiers'), $('galerie-grille'), galChemin, (im) => {
        fermerModale();
        ouvrirImage(im.data || 'images/' + im.fichier, im.nom);
      });
    });
  }
  $('b-galerie').addEventListener('click', ouvrirGalerie);
  /* Un point est-il couvert par le brouillard ? Lu directement dans le canvas (alpha au
     seuil de mi-fondu) : fidèle au rendu, y compris les bords doux du pinceau. Suppose
     dessinerFog() déjà passé pour la carte affichée — vrai partout (chargerCarte et
     toutes les réceptions d'état dessinent le brouillard avant les jetons). */
  function sousBrouillard(x, y) {
    try {
      return fog.getContext('2d')
        .getImageData(Math.round(x * QUAL), Math.round(y * QUAL), 1, 1).data[3] > 140;
    } catch (e) { return false; }
  }
  function dessinerJetons() {
    jetonsEl.innerHTML = '';
    // les jetons flottent au-dessus du brouillard (les PJ doivent toujours se voir),
    // mais côté joueurs ce privilège n'appartient qu'aux PJ : un monstre posé dans une
    // zone couverte resterait sinon visible, pastille de nom comprise — embuscade grillée
    const vueJ = vueJoueurs || document.body.dataset.vue === 'joueurs';
    for (const j of partie.jetons) {
      if (j.carte !== carte.id) continue;
      if (vueJ && !j.pj && sousBrouillard(j.x, j.y)) continue;
      const d = document.createElement('div');
      d.className = 'jeton'; d.dataset.id = j.id; d.dataset.pj = j.pj ? 'true' : 'false';
      d.style.left = j.x + 'px'; d.style.top = j.y + 'px';
      if (j.img) d.style.backgroundImage = `url("${j.img}")`;
      // le rond porte l'initiale, le nom complet vit dans la pastille .lab dessous
      else { d.style.background = j.couleur; d.textContent = (j.nom || '?').trim().charAt(0).toUpperCase(); }
      if (j.nom) {
        const lab = document.createElement('span');
        lab.className = 'lab'; lab.textContent = j.nom;
        d.appendChild(lab);
      }
      jetonsEl.appendChild(d);
    }
  }
  /* Résolution d'une liaison : par identifiant, sinon par nom (ou son slug) — les
     anciennes cartes visent parfois un nom plutôt qu'un identifiant. */
  function resoudre(vers) {
    if (!vers) return null;
    const v = S.slug(vers);
    return catalogue.find(c => c.id === vers || S.slug(c.id) === v || S.slug(c.nom) === v) || null;
  }
  /* Portail à moins d'une case du point donné (le jeton qu'on vient de lâcher) — ignore un
     portail inerte (carte de destination introuvable), rien à déclencher. Une case entière,
     pas une demi-case : les portails s'aimantent à la demi-case (acc(pt,true) dans l'éditeur)
     mais les jetons à la case entière (voir plus bas) — deux grilles décalées, un portail posé
     sur un multiple entier de la case reste alors à une demi-case pile du jeton le plus proche
     possible. Un seuil trop juste (l'ancien : demi-case) ratait le déclenchement alors que le
     jeton semblait visuellement posé dessus. */
  function trouverPortailProche(pt) {
    if (!carte) return null;
    const seuil = cellule() || 40;
    // un joueur en partie n'a pas de catalogue pour résoudre la destination : c'est
    // le MJ qui la résoudra — on ne filtre les portails inertes que hors partie
    const enPartie = KJ.session && KJ.session.active() && !KJ.session.estMJ();
    for (const p of carte.elements) {
      if (p.type !== 'portail' || (!enPartie && !resoudre(p.vers))) continue;
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= seuil) return p;
    }
    return null;
  }

  function dessinerPins() {
    pinsEl.innerHTML = '';
    const portails = carte.elements.filter(e => e.type === 'portail');
    // un joueur en partie n'a pas de catalogue : la destination sera résolue par le
    // MJ, ses losanges restent donc dorés (jamais « inertes » faute d'index)
    const enPartie = KJ.session && KJ.session.active() && !KJ.session.estMJ();
    for (const p of portails) {
      /* portail « caché aux joueurs » : les pins sont en HTML, hors du filtre SVG
         des zones cachées — sans ce test, losange ET nom de la destination
         apparaissaient aux joueurs dès que le brouillard était ouvert. */
      const revele = opsReveles().includes(p.id);
      const d = document.createElement('div');
      const dest = resoudre(p.vers);
      d.className = 'pin' + (dest || enPartie ? '' : ' inerte')
        + (p.cache && !revele ? ' zone-cachee' : '');
      d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
      if (dest) d.dataset.vers = dest.id;
      d.dataset.id = p.id;   // clic droit = révéler/cacher, comme un secret
      d.title = dest ? 'Aller à : ' + dest.nom
        : (enPartie ? 'Passage' : 'Carte « ' + p.vers + ' » absente de la bibliothèque');
      d.innerHTML = `<span class="los"></span><span class="lab">${R.esc(p.label || (dest ? dest.nom : p.vers))}</span>`;
      pinsEl.appendChild(d);
    }
  }
  function toast(txt) {
    const t = $('toast'); t.textContent = txt; t.classList.add('vu');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('vu'), 1900);
  }

  /* ---------------- chargement des cartes ---------------- */
  function chargerCatalogue() {
    // bibliothèque en ligne du MJ connecté, sinon dossier lié, sinon fichiers du
    // site (voir stockage.listerCartes) ; les joueurs invités n'ont pas de
    // catalogue, la carte affichée leur arrive par la partie elle-même
    return S.avecDelai(S.listerCartes(), 12000, []).then(cartes => {
      catalogue = cartes;
      /* Sélecteur groupé par campagne : le MJ retrouve ses lieux par aventure. */
      const sel = $('choix-carte'); sel.innerHTML = '';
      const groupes = M.parCampagne(catalogue.map(c => ({ campagne: c.campagne, _ref: c })));
      for (const nom of M.listeCampagnes(catalogue)) {
        const g = document.createElement('optgroup');
        g.label = nom;
        for (const item of groupes[nom]) {
          const o = document.createElement('option');
          o.value = item._ref.id;
          o.textContent = item._ref.nom;
          g.appendChild(o);
        }
        sel.appendChild(g);
      }
    });
  }
  let carteRecue = null;      // côté joueur : la carte transportée par la partie
  let generationCarte = 0;    // anti-course : seul le chargement le plus récent s'applique
  function chargerCarte(id) {
    const gen = ++generationCarte;
    /* JAMAIS « || catalogue[0] » quand un id précis est demandé : ce repli affichait
       une carte de démo du site à la place de la carte de la partie (le brouillard du
       MJ, indexé sur SON id, la couvrait alors de noir), et la carte transportée
       (carteRecue) devenait inatteignable. catalogue[0] ne sert qu'au tout premier
       affichage, quand AUCUNE carte n'est demandée. */
    const c = id ? catalogue.find(x => x.id === id) : catalogue[0];
    /* Les joueurs invités n'ont pas de catalogue (bibliothèque privée) : la carte
       affichée leur est TRANSPORTÉE par la partie (publierCartePartie). Le fichier
       servi par le site reste un dernier recours (anciennes cartes déployées). */
    let promesse;
    if (c) promesse = Promise.resolve(c);
    else if (id && carteRecue && carteRecue.id === id)
      promesse = Promise.resolve(KJ.modele.depuisJSON(carteRecue.json));
    else if (!id) promesse = Promise.reject(new Error('Aucune carte.'));
    else promesse = fetch('cartes/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('Carte introuvable.'); return r.json(); })
      .then(KJ.modele.depuisJSON);
    return promesse.then(c => {
      if (gen !== generationCarte) return c;   // un chargement plus récent a gagné
      // un geste en cours (pinceau de brouillard, jeton tenu) ne doit pas continuer
      // sur la nouvelle carte : il écrirait dans le brouillard de la mauvaise carte
      mode = null; jDrag = null;
      carte = c;
      const vide = document.getElementById('scene-vide');
      if (vide) vide.remove();   // le message d'attente s'efface dès qu'une carte arrive
      partie.carte = c.id;
      $('choix-carte').value = c.id;
      $('b-editer').href = 'editeur.html?id=' + encodeURIComponent(c.id);
      dessinerPlan(); dessinerFog(); dessinerJetons(); dessinerPins(); dessinerImages();
      // pas dans la vraie fenêtre séparée : elle reste un pur miroir, jamais productrice
      // d'état — un PJ déjà présent dans une pièce au chargement doit être détecté, mais
      // uniquement par la fenêtre du MJ (voir le point 12 du skill sur les trois publics).
      if (!vueJoueurs) verifierDeclencheurs();
      /* Sur téléphone, la barre d'outils se réorganise après le premier calcul de
         mise en page : on recadre une fois les dimensions définitives connues. */
      cadrer();
      requestAnimationFrame(cadrer);
      setTimeout(cadrer, 150);
      sauverPartie();
      // en partie, la carte affichée voyage avec elle : les joueurs n'ont ni compte
      // ni bibliothèque, c'est la partie qui la leur apporte
      if (KJ.session && KJ.session.active() && KJ.session.estMJ())
        // attendre les images du compte : publier avant leur chargement enverrait
        // « images: null » et les joueurs ne les recevraient jamais
        chargerImagesCompte().then(() => {
          if (carte === c && KJ.session.active() && KJ.session.estMJ())
            KJ.session.publierCartePartie(c.id, JSON.stringify(c), imagesDeCarte(c));   // compact : -40 % d'octets
        });
      // dire une fois où cliquer : les portails ne sautent pas aux yeux
      if (!vueJoueurs && !chargerCarte._dit) {
        const n = pinsEl.querySelectorAll('.pin:not(.inerte)').length;
        if (n) { chargerCarte._dit = true;
          toast('Clique sur un losange doré (les escaliers) pour changer de niveau.'); }
      }
    });
  }

  /* ---------------- synchronisation entre fenêtres ---------------- */
  if (canal) canal.onmessage = (ev) => {
    const m = ev.data;
    if (m.t === 'partie') {
      /* même chemin que le réseau : gardes anti-champs-vides, garde carte nulle,
         et redessin COMPLET — sans dessinerPlan/dessinerImages/dessinerPins, la
         fenêtre joueurs locale (TV) n'affichait jamais les révélations du MJ, et
         un élément re-caché y restait visible. */
      appliquerEtatDistant(m.partie);
    } else if (m.t === 'cam' && vueJoueurs && suivre) {
      const r = scene.getBoundingClientRect();
      cam.s = m.s; cam.tx = r.width / 2 - m.cx * m.s; cam.ty = r.height / 2 - m.cy * m.s;
      monde.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})`;
    } else if (m.t === 'ping' && carte && m.carte === carte.id) {
      montrerPing(m.x, m.y);
    }
  };
  window.addEventListener('storage', (e) => {
    if (e.key === CLE_PARTIE && e.newValue && !canal) {
      try { appliquerEtatDistant(JSON.parse(e.newValue)); } catch (err) {}
    }
  });

  /* ---------------- ping ---------------- */
  function montrerPing(x, y) {
    const p = document.createElement('div');
    p.className = 'ping'; p.style.left = x + 'px'; p.style.top = y + 'px';
    p.innerHTML = '<span></span><span></span><span></span>';
    sur.appendChild(p);
    setTimeout(() => p.remove(), 2100);
  }
  /* Double-clic sur un jeton : l'ouvrir en édition (étiquette, PJ, portrait, suppression) ;
     ailleurs : un ping — réservé au MJ et à la préview locale, jamais à la vraie fenêtre
     séparée. Déclenché par le vrai dblclick (souris) ET par un double-tap détecté à la main
     dans fin() : avec touch-action:none, la synthèse du dblclick au double-tap n'est pas
     garantie sur mobile — sans quoi le MJ sur téléphone n'a ni ping ni édition de jeton. */
  function actionDoubleTap(cible, cx, cy) {
    actionDoubleTap._t = Date.now();   // dédoublonnage si le navigateur synthétise AUSSI dblclick
    const jet = cible.closest('.jeton');
    if (jet) {
      if (!vueJoueurs) {
        const j = partie.jetons.find(x => x.id === jet.dataset.id);
        if (j) ouvrirDialogueJeton(j);
      }
      return;
    }
    // le ping est réservé au MJ (voir commentaire ci-dessus) — et sans carte
    // affichée, carte.id planterait
    if (vueJoueurs || !carte) return;
    const w = versMonde(cx, cy);
    montrerPing(w.x, w.y);
    if (canal) canal.postMessage({ t: 'ping', x: w.x, y: w.y, carte: carte.id });
    if (KJ.session && KJ.session.estMJ()) KJ.session.ping(w.x, w.y, carte.id);
  }
  scene.addEventListener('dblclick', (e) => {
    if (Date.now() - (actionDoubleTap._t || 0) < 700) return;
    actionDoubleTap(e.target, e.clientX, e.clientY);
  });

  /* ---------------- outils ---------------- */
  let outil = 'deplacer';
  document.querySelectorAll('#barre-mj [data-o]').forEach(b => b.addEventListener('click', () => {
    outil = b.dataset.o;
    document.querySelectorAll('#barre-mj [data-o]').forEach(x => x.classList.toggle('actif', x === b));
    scene.className = 'o-' + outil;
  }));

  /* ---------------- pointeurs ---------------- */
  const actifs = new Map();
  let mode = null, dep = null, jDrag = null, bouge = 0, mesure = null, pincePrec = null, pinEnCours = null,
      imgEnCours = null, dernierPointeur = '';

  scene.addEventListener('pointerdown', (e) => {
    dernierPointeur = e.pointerType;
    if (e.button === 2 || !carte) return;
    try { scene.setPointerCapture(e.pointerId); } catch (err) {}
    actifs.set(e.pointerId, e);
    if (actifs.size === 2) { mode = 'pince'; pincePrec = null; return; }

    const w = versMonde(e.clientX, e.clientY);
    const jet = e.target.closest('.jeton');
    const pin = e.target.closest('.pin');
    const imgPin = e.target.closest('.img-pin');
    bouge = 0;

    if (!vueJoueurs && pin && pin.dataset.vers) { mode = 'pin'; pinEnCours = pin.dataset.vers; return; }
    // une image révélée se consulte aussi côté joueurs (tap → plein écran) ;
    // non révélée, elle reste réservée au MJ.
    if (imgPin && (!vueJoueurs || imgPin.classList.contains('revele'))) {
      mode = 'img'; imgEnCours = { src: resoudreImage(imgPin.dataset.src), titre: imgPin.title }; return;
    }
    // un joueur peut déplacer son propre jeton PJ, même dans la vraie fenêtre séparée ;
    // le MJ peut toujours déplacer n'importe quel jeton, depuis n'importe où.
    if (jet && outil === 'deplacer' && (!vueJoueurs || jet.dataset.pj === 'true')) {
      mode = 'jeton'; jDrag = partie.jetons.find(j => j.id === jet.dataset.id);
      jet.classList.add('drag'); return;
    }
    if (!vueJoueurs && (outil === 'reveal' || outil === 'hide')) {
      mode = 'fog'; debutGesteFog(); pinceau(outil, w.x, w.y); return;
    }
    if (!vueJoueurs && outil === 'mesure') {
      mode = 'mesure'; mesure = { x: w.x, y: w.y };
      regle.setAttribute('width', carte.taille.w); regle.setAttribute('height', carte.taille.h);
      regle.innerHTML = `<line x1="${w.x}" y1="${w.y}" x2="${w.x}" y2="${w.y}"/>`;
      return;
    }
    mode = 'pan'; dep = { x: e.clientX - cam.tx, y: e.clientY - cam.ty };
  });

  scene.addEventListener('pointermove', (e) => {
    if (!actifs.has(e.pointerId) || !carte) return;
    actifs.set(e.pointerId, e);
    if (mode === 'pince' && actifs.size === 2) {
      const [a, b] = [...actifs.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const mi = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      if (pincePrec) {
        const r = scene.getBoundingClientRect();
        const p = versMonde(pincePrec.mi.x, pincePrec.mi.y);
        cam.s = Math.min(10, Math.max(.1, cam.s * (d / pincePrec.d)));
        cam.tx = mi.x - r.left - p.x * cam.s; cam.ty = mi.y - r.top - p.y * cam.s;
        appliquerCam();
      }
      pincePrec = { d: d, mi: mi };
      return;
    }
    const w = versMonde(e.clientX, e.clientY);
    if (mode === 'jeton' && jDrag) {
      bouge++; jDrag.x = w.x; jDrag.y = w.y;
      const el = jetonsEl.querySelector('[data-id="' + jDrag.id + '"]');
      if (el) { el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; }
    } else if (mode === 'fog') {
      pinceau(outil, w.x, w.y);
    } else if (mode === 'pin' || mode === 'img') {
      bouge++;
    } else if (mode === 'mesure' && mesure) {
      const l = regle.querySelector('line');
      l.setAttribute('x2', w.x); l.setAttribute('y2', w.y);
      const c = cellule();
      const dx = Math.abs(w.x - mesure.x), dy = Math.abs(w.y - mesure.y);
      let e2 = $('etiquette');
      if (!e2) { e2 = document.createElement('div'); e2.id = 'etiquette'; sur.appendChild(e2); }
      e2.style.left = w.x + 'px'; e2.style.top = w.y + 'px';
      if (c) {
        const cases = Math.round(Math.max(dx, dy) / c);
        e2.textContent = cases + ' case' + (cases > 1 ? 's' : '')
          + ' (' + (cases * carte.grille.metres).toLocaleString('fr-FR') + ' m)';
      } else e2.textContent = Math.round(Math.hypot(dx, dy)) + ' px';
    } else if (mode === 'pan' && dep) {
      cam.tx = e.clientX - dep.x; cam.ty = e.clientY - dep.y; appliquerCam();
    }
  });

  function fin(e) {
    actifs.delete(e.pointerId);
    if (mode === 'pince') {
      if (actifs.size < 2) { pincePrec = null; mode = actifs.size ? 'pan' : null;
        if (mode === 'pan') { const p = [...actifs.values()][0]; dep = { x: p.clientX - cam.tx, y: p.clientY - cam.ty }; } }
      return;
    }
    if (mode === 'jeton' && jDrag) {
      // avant le repositionnement sur la grille ci-dessous : la position brute où le jeton a
      // été lâché est plus fidèle à l'intention que sa case la plus proche (voir trouverPortailProche)
      const portail = jDrag.pj ? trouverPortailProche(jDrag) : null;
      const c = cellule();
      if (bouge > 2 && c) {
        jDrag.x = Math.round((jDrag.x - c / 2) / c) * c + c / 2;
        jDrag.y = Math.round((jDrag.y - c / 2) / c) * c + c / 2;
      }
      dessinerJetons();
      // true : un jeton qui bouge doit toujours se voir de l'autre côté, y compris quand
      // c'est un joueur qui vient de le déplacer depuis la vraie fenêtre séparée.
      sauverPartie(true);
      if (jDrag.pj) {
        // en session réseau, le geste du joueur remonte au MJ, qui l'applique à
        // l'état officiel — y compris la révélation automatique, calculée chez lui
        const enReseau = KJ.session && KJ.session.active() && !KJ.session.estMJ();
        if (enReseau)
          KJ.session.envoyerMouvement({ id: jDrag.id, x: jDrag.x, y: jDrag.y, carte: carte.id,
            portail: portail ? portail.vers : null });
        // JAMAIS dans la fenêtre joueurs : un joueur seul (MJ absent) pouvait sinon
        // se révéler localement tous les secrets en promenant son jeton
        if (!vueJoueurs) verifierDeclencheurs();
        // le groupe marche sur le losange : change de carte tout seul, PJ amenés avec lui
        if (portail) {
          const dest = resoudre(portail.vers);
          toast('Passage : ' + (portail.label || (dest ? dest.nom : 'passage')) + '…');
          // en réseau, changer de carte localement désynchronisait les deux vues :
          // l'état officiel du MJ, resté sur l'ancienne carte, ramenait les joueurs
          // en arrière. C'est le MJ qui traverse (voir surMouvements) et la nouvelle
          // carte redescend vers tout le monde par l'état.
          // dest.id (résolu par nom OU id) : le « vers » brut d'une vieille carte
          // pouvait viser un nom et charger n'importe quoi.
          if (!enReseau && dest)
            chargerCarte(dest.id).then(() => { amenerPJ(); sauverPartie(true); })
              .catch(() => toast('Carte introuvable.'));
        }
      }
      jDrag = null;
    }
    if (mode === 'pin' && pinEnCours) {
      if (bouge <= 2) chargerCarte(pinEnCours).catch(() => toast('Carte introuvable.'));
      pinEnCours = null;
    }
    if (mode === 'img' && imgEnCours) {
      if (bouge <= 2) ouvrirImage(imgEnCours.src, imgEnCours.titre);
      imgEnCours = null;
    }
    if (mode === 'fog') flushSauver();   // le geste est fini : la sauvegarde lissée part maintenant
    if (mode === 'mesure') {
      setTimeout(() => { regle.innerHTML = ''; const l = $('etiquette'); if (l) l.remove(); }, 1200);
      mesure = null;
    }
    // double-tap tactile (voir actionDoubleTap) : deux taps immobiles rapprochés, hors
    // portail et image (qui ont leur propre action au tap simple)
    if (e.pointerType === 'touch' && bouge <= 2 && (mode === 'pan' || mode === 'jeton')) {
      const t = Date.now(), prec = fin._tap;
      if (prec && t - prec.t < 350 && Math.hypot(e.clientX - prec.x, e.clientY - prec.y) < 30) {
        fin._tap = null;
        // pas e.target : la capture de pointeur recible tous les événements sur la scène
        const sous = document.elementFromPoint(e.clientX, e.clientY) || e.target;
        if (Date.now() - (actionDoubleTap._t || 0) >= 700) actionDoubleTap(sous, e.clientX, e.clientY);
      } else fin._tap = { t: t, x: e.clientX, y: e.clientY };
    }
    mode = null; dep = null;
  }
  scene.addEventListener('pointerup', fin);
  scene.addEventListener('pointercancel', fin);

  scene.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!carte || (vueJoueurs && suivre)) return;
    const r = scene.getBoundingClientRect();
    const w = versMonde(e.clientX, e.clientY);
    cam.s = Math.min(10, Math.max(.1, cam.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    cam.tx = e.clientX - r.left - w.x * cam.s; cam.ty = e.clientY - r.top - w.y * cam.s;
    appliquerCam();
  }, { passive: false });

  scene.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (vueJoueurs) return;
    // sur mobile, l'appui long déclenche ce menu contextuel — y compris pendant
    // qu'on maintient un jeton pour le glisser : ignorer tant qu'un glissé est en cours
    if (mode === 'jeton' && bouge > 2) return;
    const jet = e.target.closest('.jeton');
    if (jet) {
      // au doigt, l'appui long part trop facilement tout seul : on confirme avant
      // de supprimer (à la souris, le clic droit reste immédiat comme avant)
      const jNom = (partie.jetons.find(j => j.id === jet.dataset.id) || {}).nom;
      if (dernierPointeur === 'touch'
          && !confirm('Supprimer le jeton « ' + (jNom || '?') + ' » ?')) return;
      partie.jetons = partie.jetons.filter(j => j.id !== jet.dataset.id);
      // le geste en cours tenait ce jeton : sans ça, le relâchement du doigt
      // rejouait un « lâcher sur portail » avec un jeton supprimé → changement
      // de carte fantôme pour toute la table
      mode = null; jDrag = null;
      dessinerJetons(); sauverPartie();
      return;
    }
    const imgPin = e.target.closest('.img-pin');
    if (imgPin && imgPin.dataset.id) { basculerRevele(imgPin.dataset.id); return; }
    // secret : pas de calque HTML dédié, on retrouve l'élément via data-id dans le SVG du plan
    const cible = e.target.closest('[data-id]');
    if (cible) {
      const el = M.trouver(carte, cible.dataset.id);
      // secret ou élément marqué « caché aux joueurs » : le clic droit bascule sa révélation
      if (el && (el.type === 'secret' || el.cache)) basculerRevele(el.id);
    }
  });

  /* ---------------- commandes ---------------- */
  $('choix-carte').addEventListener('change', (e) => chargerCarte(e.target.value).catch(() => toast('Chargement impossible.')));
  $('b-annuler-fog').addEventListener('click', annulerFog);
  $('b-couvrir').addEventListener('click', () => { partie.fog[carte.id] = []; marqueursFog[carte.id] = []; dessinerFog(); sauverPartie(); toast('Carte entièrement recouverte.'); });
  $('b-decouvrir').addEventListener('click', () => {
    partie.fog[carte.id] = [{ m: 'reveal', x: carte.taille.w / 2, y: carte.taille.h / 2,
      r: Math.max(carte.taille.w, carte.taille.h) }];
    marqueursFog[carte.id] = [];
    dessinerFog(); sauverPartie(); toast('Terrain entièrement révélé.');
  });
  /* Repartir à neuf sur cette carte pour une nouvelle table (d'autres joueurs) : brouillard,
     révélations et jetons sont une session, pas une donnée de la carte (voir README) — mais
     rien ne les remettait à zéro jusqu'ici, un groupe suivant héritait du brouillard et des
     révélations du précédent. Ne touche qu'à la carte affichée, jamais aux autres.
     Trois cases plutôt qu'un confirm() global : le brouillard représente souvent des heures
     d'exploration qu'on ne veut pas perdre juste pour corriger une révélation isolée — décoché
     par défaut, contrairement aux révélations et aux jetons (le cas le plus courant : rejouer
     la carte avec un nouveau groupe). Un clic droit direct sur un seul élément reste le moyen
     le plus rapide de ne corriger que lui, sans passer par cette boîte. */
  $('b-reinitialiser').addEventListener('click', () => {
    ouvrirModale('Réinitialiser « ' + carte.nom + ' »', false, (corps) => {
      corps.innerHTML = `
        <p class="aide">Ne touche que cette carte ; les autres cartes de la campagne ne sont pas concernées.</p>
        <label class="coche"><input id="r-fog" type="checkbox"> Brouillard (tout redevient caché)</label>
        <label class="coche"><input id="r-reveles" type="checkbox" checked> Révélations (secrets, images redeviennent cachés)</label>
        <label class="coche"><input id="r-jetons" type="checkbox" checked> Jetons posés sur cette carte</label>
        <div class="actions-modale">
          <button id="r-annuler">Annuler</button>
          <button id="r-ok" class="danger">Réinitialiser</button>
        </div>`;
      $('r-annuler').addEventListener('click', fermerModale);
      $('r-ok').addEventListener('click', () => {
        const touche = [];
        if ($('r-fog').checked) { partie.fog[carte.id] = []; marqueursFog[carte.id] = []; touche.push('brouillard'); }
        // masques aussi : un élément re-caché à la main restait sinon désarmé pour
        // toujours — la révélation automatique ne marchait plus pour le groupe suivant
        if ($('r-reveles').checked) { partie.reveles[carte.id] = []; partie.masques[carte.id] = []; touche.push('révélations'); }
        if ($('r-jetons').checked) { partie.jetons = partie.jetons.filter(j => j.carte !== carte.id); touche.push('jetons'); }
        dessinerFog(); dessinerJetons(); dessinerPlan(); dessinerImages(); dessinerPins(); sauverPartie(true);
        fermerModale();
        toast(touche.length ? 'Réinitialisé : ' + touche.join(', ') + '.' : 'Rien à réinitialiser.');
      });
    });
  });
  /* Vignette carrée recadrée au centre, en data URL — un chemin de fichier local
     (file:///…) ne se charge jamais depuis une page servie en http(s) : on lit
     donc le fichier choisi et on l'embarque directement dans la session. */
  function vignette(dataUrl, taille) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const t = taille || 96;
        const c = document.createElement('canvas'); c.width = t; c.height = t;
        const ctx = c.getContext('2d');
        const s = Math.max(t / img.naturalWidth, t / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        ctx.drawImage(img, (t - w) / 2, (t - h) / 2, w, h);
        res(c.toDataURL('image/jpeg', .85));
      };
      img.onerror = () => rej(new Error('Image illisible.'));
      img.src = dataUrl;
    });
  }

  /* Une seule boîte de dialogue au lieu d'une chaîne de 4 popups navigateur (étiquette,
     adresse d'image, confirmation de fichier, confirmation PJ) : illisible sur mobile,
     bloquant, sans retour arrière possible. Portrait choisi dans la galerie du dépôt
     (comme les icônes d'image du plan) ou importé depuis l'appareil ; les deux restent
     facultatifs, un jeton sans image est un simple disque de couleur.
     jetonExistant (facultatif) : édite ce jeton au lieu d'en créer un — double-clic dessus
     sur le plan (voir plus haut) ; permet aussi de corriger sa case PJ sans le recréer, et
     de le supprimer. */
  function ouvrirDialogueJeton(jetonExistant) {
    ouvrirModale(jetonExistant ? 'Modifier le jeton' : 'Nouveau jeton', true, (corps) => {
      corps.innerHTML = `
        <div class="champ"><label>Étiquette</label><input id="j-nom" type="text" maxlength="2" placeholder="J"></div>
        <label class="coche"><input id="j-pj" type="checkbox"> PJ — suit le groupe de carte en carte</label>
        <p class="aide">Portrait (facultatif, sinon disque de couleur) :</p>
        <div id="j-preview"></div>
        <button id="j-depuis-appareil">📁 Depuis cet appareil</button>
        <div id="j-dossiers" class="fil-ariane"></div>
        <div id="j-grille" class="palette"></div>
        <div class="actions-modale">
          ${jetonExistant ? '<button id="j-supprimer" class="danger">✕ Supprimer</button>' : ''}
          <button id="j-annuler">Annuler</button>
          <button id="j-creer" class="primaire">${jetonExistant ? 'Enregistrer' : 'Créer'}</button>
        </div>`;
      $('j-nom').value = jetonExistant ? jetonExistant.nom : '';
      $('j-pj').checked = jetonExistant ? !!jetonExistant.pj : true;
      // un invité ne crée QUE des jetons PJ : la case n'a pas à se discuter
      if (vueJoueurs) { $('j-pj').checked = true; $('j-pj').closest('label').style.display = 'none'; }
      $('j-nom').focus();
      let img = jetonExistant ? (jetonExistant.img || null) : null;
      const preview = $('j-preview');
      const choisir = (src, libelle) => {
        img = src;
        preview.innerHTML = '';
        const ap = document.createElement('img'); ap.src = src; ap.alt = '';
        ap.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:50%;'
          + 'border:2px solid var(--or);vertical-align:middle;margin-right:6px';
        preview.appendChild(ap);
        preview.appendChild(document.createTextNode(libelle));
        preview.appendChild(bouton('✕', () => { img = null; preview.innerHTML = ''; }));
      };
      if (img) choisir(img, 'portrait actuel');
      construirePickerImages($('j-dossiers'), $('j-grille'), [], (im) => {
        // image de compte : réduite en vignette avant d'entrer dans l'état de partie
        // (sauvé à chaque mouvement) — une image du dépôt reste un simple chemin
        if (im.data) vignette(im.data).then(d => choisir(d, im.nom || 'image')).catch(() => toast('Image illisible.'));
        else choisir('images/' + im.fichier, im.nom || im.fichier);
      });
      $('j-depuis-appareil').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.addEventListener('change', () => {
          const f = input.files[0]; if (!f) return;
          const fr = new FileReader();
          fr.onload = () => vignette(fr.result).then(durl => choisir(durl, f.name)).catch(() => toast('Image illisible.'));
          fr.readAsDataURL(f);
        });
        input.click();
      });
      if (jetonExistant) $('j-supprimer').addEventListener('click', () => {
        partie.jetons = partie.jetons.filter(j => j.id !== jetonExistant.id);
        dessinerJetons(); sauverPartie(true); fermerModale();
        toast('Jeton supprimé.');
      });
      $('j-annuler').addEventListener('click', fermerModale);
      $('j-creer').addEventListener('click', () => {
        const nom = ($('j-nom').value || 'J').trim().slice(0, 2) || 'J';
        const pj = $('j-pj').checked;
        if (jetonExistant) {
          jetonExistant.nom = nom; jetonExistant.pj = pj; jetonExistant.img = img || undefined;
          dessinerJetons(); sauverPartie(true); fermerModale();
          toast('Jeton mis à jour' + (pj ? ' (PJ).' : '.'));
          return;
        }
        const r = scene.getBoundingClientRect();
        const c = versMonde(r.left + r.width / 2, r.top + r.height / 2);
        /* joueur invité : il n'écrit jamais l'état — la création part au MJ par la
           boîte aux lettres (comme les déplacements), le MJ l'applique et l'état
           officiel redescend vers tout le monde. */
        if (vueJoueurs && KJ.session && KJ.session.active() && !KJ.session.estMJ()) {
          KJ.session.envoyerMouvement({ creer: true, id: 'j' + Date.now(), nom: nom,
            img: img || null, x: Math.round(c.x), y: Math.round(c.y), carte: carte.id });
          fermerModale();
          toast('Jeton envoyé au MJ — il apparaît dans un instant.');
          return;
        }
        partie.jetons.push({
          id: 'j' + Date.now(), nom: nom, pj: pj,
          couleur: COULEURS[partie.jetons.length % COULEURS.length],
          img: img || undefined,
          x: Math.round(c.x), y: Math.round(c.y), carte: carte.id,
        });
        dessinerJetons(); sauverPartie(); fermerModale();
        toast('Jeton créé' + (pj ? ' (PJ).' : '.'));
      });
    });
  }
  /* + Jeton : un clic, un jeton PJ, c'est tout — pas de dialogue. Le renommer, lui donner
     un portrait, le marquer PNJ ou le supprimer se fait ensuite par double-clic dessus
     (ouvrirDialogueJeton, juste au-dessus), pas au moment de la création. Disponible aussi
     en préview locale (chaque joueur peut créer son propre jeton) — voir table.html, exempté
     du masquage de #barre-mj ; sauverPartie(true) pour que ça remonte bien jusqu'au MJ. */
  $('b-jeton').addEventListener('click', () => {
    const n = partie.jetons.filter(j => j.carte === carte.id).length + 1;
    const r = scene.getBoundingClientRect();
    const c = versMonde(r.left + r.width / 2, r.top + r.height / 2);
    partie.jetons.push({
      id: 'j' + Date.now(), nom: ('J' + n).slice(0, 2), pj: true,
      couleur: COULEURS[partie.jetons.length % COULEURS.length],
      x: Math.round(c.x), y: Math.round(c.y), carte: carte.id,
    });
    dessinerJetons(); sauverPartie(true);
    toast('Jeton PJ créé — double-clic dessus pour le personnaliser.');
  });

  /* Amène les jetons PJ sur la carte affichée (bouton, et après un passage de portail
     déclenché par un jeton PJ — voir trouverPortailProche). */
  function amenerPJ() {
    const pjs = partie.jetons.filter(j => j.pj);
    if (!pjs.length) return 0;
    const pas = cellule() || 40;
    pjs.forEach((j, i) => {
      j.carte = carte.id;
      j.x = Math.round(carte.taille.w / 2 + (i - (pjs.length - 1) / 2) * pas);
      j.y = Math.round(carte.taille.h - pas * .9);
    });
    dessinerJetons(); sauverPartie(); verifierDeclencheurs();
    return pjs.length;
  }
  $('b-amener').addEventListener('click', () => {
    const n = amenerPJ();
    toast(n ? n + ' jeton(s) de PJ amené(s) ici.' : 'Aucun jeton marqué « PJ ».');
  });
  $('b-vue').addEventListener('click', () => {
    const j = document.body.dataset.vue === 'joueurs';
    document.body.dataset.vue = j ? 'mj' : 'joueurs';
    $('b-vue').classList.toggle('actif', !j);
    $('b-vue').textContent = j ? 'Vue joueurs' : 'Vue MJ';
    // les jetons aussi : la préview doit cacher les non-PJ sous le brouillard comme
    // la vraie fenêtre joueurs, sinon elle ment sur ce que verront les joueurs
    dessinerPlan(); dessinerJetons();
  });
  $('b-cadrer').addEventListener('click', cadrer);
  if ($('b-cadrer-j')) $('b-cadrer-j').addEventListener('click', cadrer);
  /* L'aide vivait en bandeau permanent au bas de l'écran : toujours sous les yeux,
     jamais lue, et elle mangeait la carte. Un « ? » l'ouvre à la demande. */
  if ($('b-aide')) $('b-aide').addEventListener('click', () => {
    ouvrirModale('Aide — gestes et raccourcis', false, (corps) => {
      const d = document.createElement('div');
      d.className = 'aide-jeu';
      d.innerHTML =
          '<p><b>Se déplacer</b> — molette : zoom · glisser le fond : déplacer · au doigt : pincer et glisser.</p>'
        + '<p><b>Cartes</b> — clic sur un losange doré : changer de carte · un jeton PJ glissé sur un '
        + 'losange change de carte tout seul.</p>'
        + '<p><b>Jetons</b> — double-clic (ou double-tap) : modifier (étiquette, PJ, portrait, suppression) · '
        + 'clic droit (appui long) : retirer.</p>'
        + '<p><b>Révélations</b> — clic sur 🖼 : afficher l’image · clic droit sur 🖼 ou un secret : '
        + 'le révéler ou le cacher aux joueurs · les objets à révélation automatique se dévoilent '
        + 'quand un PJ entre dans la pièce.</p>'
        + '<p><b>Divers</b> — double-clic sur le fond : ping « regardez ici » · Ctrl+Z : annuler le '
        + 'dernier geste de brouillard · les ✳ dorés sont les sources de lumière posées dans l’éditeur.</p>'
        + '<p><b>Fenêtre pour la TV</b> — ajouter <b>?vue=joueurs</b> à l’adresse.</p>';
      corps.appendChild(d);
    });
  });
  const bs = $('b-suivre');
  if (bs) {
    // n'a de sens que dans une vraie fenêtre joueurs séparée (?vue=joueurs) : elle seule
    // reçoit les messages « cam » du MJ. Dans la préview locale (même fenêtre, via le
    // bouton Vue MJ/Vue joueurs), il n'y a rien à suivre — le montrer prête à confusion.
    if (!vueJoueurs) bs.style.display = 'none';
    else bs.addEventListener('click', () => {
      suivre = !suivre;
      bs.classList.toggle('actif', suivre);
      bs.textContent = suivre ? 'Suivre le MJ' : 'Vue libre';
    });
  }
  window.addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || vueJoueurs) return;
    if (e.key === 'g' || e.key === 'G') $('b-vue').click();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); annulerFog(); }
  });
  window.addEventListener('resize', () => { if (carte) cadrer(); });

  /* ---------------- démarrage ----------------
     Ouvert en « file:// » (double-clic sur le fichier), le navigateur interdit
     de lire cartes/index.json : les cartes de la campagne et donc les portails
     seraient absents sans explication. On le dit franchement. */
  if (location.protocol === 'file:') {
    const a = document.createElement('div');
    a.className = 'alerte';
    a.innerHTML = '<b>Ouvre la plateforme par le lanceur.</b> En accès direct au fichier, '
      + 'le navigateur refuse de charger les cartes de la campagne : les portails des escaliers '
      + 'resteront gris et inertes. Double-clique sur <code>Lancer la plateforme.bat</code>, '
      + 'puis va sur <code>http://127.0.0.1:8777/table.html</code>.';
    document.body.insertBefore(a, document.getElementById('scene'));
  }

  /* IMPORTANT : ce message ne doit JAMAIS remplacer le contenu de #scene
     (innerHTML) — ça détruirait les calques de rendu, et la carte transportée
     par la partie, qui arrive quelques instants PLUS TARD chez un joueur,
     serait dessinée dans des nœuds morts : écran définitivement vide. */
  chargerCatalogue().then(() => {
    /* On rejoint une partie : la carte vient de la partie elle-même. Charger
       d'abord une carte locale (première du site, ou dernière vue d'une autre
       partie) faisait apparaître un AUTRE lieu pendant une seconde ou deux
       avant l'arrivée de la vraie carte. On attend, message à l'appui. */
    if (codeSessionURL) return Promise.reject();
    const voulue = params.get('carte') || partie.carte;
    return chargerCarte(voulue);
  }).catch(() => {
    const p = document.createElement('p');
    p.id = 'scene-vide';
    p.style.cssText = 'position:absolute;top:16px;left:16px;z-index:5;'
      + 'font-family:var(--serif);font-style:italic;opacity:.7';
    p.textContent = codeSessionURL
      ? 'Connexion à la partie… la carte du MJ arrive.'
      : 'Aucune carte dans la bibliothèque. Crée-en une dans l’éditeur, puis reviens ici.';
    document.getElementById('scene').appendChild(p);
  });
  // indépendante du chargement de la carte : la galerie doit marcher même sans plan affiché
  chargerGalerie().catch(() => {});
  // les images du compte MJ : résolution des « img:<id> » et présence dans la galerie.
  // Aussi dans la fenêtre ?vue=joueurs du même navigateur (préview/TV du MJ) : elle
  // doit pouvoir résoudre les images que le MJ révèle.
  if (KJ.session && KJ.session.configuree() && KJ.session.mjProbable())
    chargerImagesCompte();

  /* ---------------- sessions multi-appareils ----------------
     L'état reçu du réseau suit le même chemin qu'un message BroadcastChannel :
     une seule écriture locale, pas de rediffusion (sauverPartie(false)). */
  /* Redessin COALESCÉ : les états arrivent jusqu'à 3/s (réseau) pendant que le MJ
     peint — reconstruire tout le SVG du plan à chaque fois saturait le téléphone
     des joueurs. Un seul redessin par frame, et le plan/les icônes (qui ne
     dépendent que des révélations) ne sont refaits que si elles ont changé. */
  let redessinPrevu = false;
  function planifierRedessin() {
    if (redessinPrevu) return;
    redessinPrevu = true;
    requestAnimationFrame(() => {
      redessinPrevu = false;
      if (!carte) return;
      dessinerFog(); dessinerJetons();
      const sig = carte.id + '|' + JSON.stringify(partie.reveles[carte.id] || [])
        + '|' + JSON.stringify(partie.masques[carte.id] || []);
      if (sig !== planifierRedessin._sig) {
        planifierRedessin._sig = sig;
        dessinerPlan(); dessinerImages(); dessinerPins();
      }
    });
  }
  function appliquerEtatDistant(etat) {
    if (!etat) return;
    const changeCarte = etat.carte && (!carte || etat.carte !== carte.id);
    partie = etat;
    // Firebase supprime les objets et tableaux VIDES à l'enregistrement : un état
    // sans brouillard peint, sans jeton ou sans révélation arrive ici amputé de ces
    // champs — et le premier accès plantait tout le redessin de la fenêtre joueur.
    if (!partie.fog) partie.fog = {};
    if (!partie.jetons) partie.jetons = [];
    if (!partie.reveles) partie.reveles = {};
    if (!partie.masques) partie.masques = {};
    sauverPartieBientot(false);
    if (changeCarte) chargerCarte(partie.carte).catch(() => {});
    else if (carte) planifierRedessin();
  }

  let mjPresent = null;   // côté joueur : le MJ est-il à la table ? (null = pas encore su)
  function majBadgeSession(nb) {
    const b = $('badge-session');
    if (!b) return;
    if (!KJ.session || !KJ.session.active()) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = '📡 ' + KJ.session.code()
      + (KJ.session.estMJ() ? ' · ' + (nb || 0) + ' joueur' + (nb > 1 ? 's' : '')
        : (mjPresent === false ? ' · MJ absent' : ''));
  }

  /* Branche la table sur la partie que le MJ vient d'ouvrir : présence des joueurs,
     boîte aux lettres des gestes, et état initial (celui CONSERVÉ par la base pour
     une reprise, ou l'état local publié pour une partie neuve). */
  function brancherPartie(etatConserve) {
    btnSession.classList.add('actif');
    majBadgeSession(0);
    KJ.session.surJoueurs(majBadgeSession);
    KJ.session.surMouvements((m) => {
      if (!m || !m.id) return;
      /* un joueur crée SON jeton : appliqué ici, chez le MJ — toujours PJ,
         portrait borné (vignette), jamais deux fois le même id (message rejoué) */
      if (m.creer) {
        if (!carte || partie.jetons.some(x => x.id === m.id)) return;
        partie.jetons.push({
          id: String(m.id), nom: String(m.nom || 'J').slice(0, 2), pj: true,
          couleur: COULEURS[partie.jetons.length % COULEURS.length],
          img: (typeof m.img === 'string' && m.img.length < 40000) ? m.img : undefined,
          x: +m.x || Math.round(carte.taille.w / 2),
          y: +m.y || Math.round(carte.taille.h / 2),
          carte: carte.id,   // toujours sur la carte affichée, où qu'en soit le joueur
        });
        dessinerJetons(); sauverPartie();
        toast('Un joueur a créé son jeton PJ.');
        return;
      }
      const j = partie.jetons.find(x => x.id === m.id);
      if (!j || !j.pj) return;   // seuls les jetons PJ sont déplaçables par les joueurs
      // le joueur a lâché son jeton sur un portail : le MJ traverse pour tout le
      // monde — la nouvelle carte part dans l'état officiel et chaque fenêtre suit
      if (m.portail) {
        const dest = resoudre(m.portail);   // par id OU par nom (vieilles cartes)
        if (!dest) { toast('Portail vers « ' + m.portail + ' » : carte introuvable.'); return; }
        toast('Les PJ passent : ' + dest.nom + '…');
        chargerCarte(dest.id).then(() => { amenerPJ(); sauverPartie(true); })
          .catch(() => toast('Carte « ' + m.portail + ' » introuvable.'));
        return;
      }
      /* un geste parti d'une carte qui n'est plus affichée (joueur en retard d'un
         état) ne doit pas téléporter le jeton hors de la carte courante */
      if (m.carte && carte && m.carte !== carte.id) return;
      j.x = m.x; j.y = m.y;
      dessinerJetons();
      verifierDeclencheurs();   // la révélation automatique se joue ici, chez le MJ
      sauverPartie();           // et l'état officiel redescend vers tous les joueurs
    });
    if (etatConserve) appliquerEtatDistant(etatConserve);   // reprise : la base fait foi
    else KJ.session.publier(partie);                        // partie neuve : l'état courant part
    // la carte affichée part aussi : c'est elle que les joueurs recevront —
    // après le chargement des images du compte, sinon elles partiraient « null »
    chargerImagesCompte().then(() => {
      if (carte && KJ.session.active() && KJ.session.estMJ())
        KJ.session.publierCartePartie(carte.id, JSON.stringify(carte), imagesDeCarte(carte));   // compact
    });
  }
  function annoncerCode(code, reprise) {
    const lien = location.origin + location.pathname + '?session=' + code;
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(lien).catch(() => {});
    alert((reprise ? 'Partie reprise : ' : 'Partie créée : ') + code + '\n\n'
      + 'Le code ne changera plus : les joueurs peuvent garder ce lien (copié)\n'
      + 'en favori pour toute la campagne :\n' + lien);
  }

  /* ---------------- écran « Partie » (MJ) ---------------- */
  function champModale(corps, label, type, placeholder) {
    const d = document.createElement('div'); d.className = 'champ';
    const l = document.createElement('label'); l.textContent = label;
    const i = document.createElement('input'); i.type = type || 'text';
    if (placeholder) i.placeholder = placeholder;
    d.appendChild(l); d.appendChild(i); corps.appendChild(d);
    return i;
  }
  function noteModale(corps, texte) {
    const p = document.createElement('p'); p.className = 'aide';
    p.textContent = texte; corps.appendChild(p);
    return p;
  }
  function rendreEcranPartie(corps) {
    corps.innerHTML = '';
    const attente = noteModale(corps, 'Connexion…');
    KJ.session.quiEstConnecte().then(email => {
      corps.innerHTML = '';
      if (!email) rendreConnexion(corps);
      else rendreParties(corps, email);
    }).catch(e => { attente.textContent = e.message; });
  }
  function rendreConnexion(corps) {
    noteModale(corps, 'Ton compte MJ garde tes parties et ta bibliothèque privées. '
      + 'Les joueurs, eux, n’ont besoin que du code de la partie — aucun compte.');
    const em = champModale(corps, 'E-mail', 'email');
    const mp = champModale(corps, 'Mot de passe', 'password');
    const err = noteModale(corps, ''); err.style.color = 'var(--sang)';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:7px;justify-content:flex-end;margin-top:12px';
    /* retour visible pendant la tentative (le chargement du SDK peut être long) :
       sans lui, une connexion lente semblait ignorée et on rafraîchissait la page */
    const tenter = (fn) => {
      if (co.disabled) return;
      if (!em.value.trim() || !mp.value) { err.style.color = 'var(--sang)'; err.textContent = 'E-mail et mot de passe requis.'; return; }
      err.style.color = 'var(--encre)'; err.textContent = 'Connexion…';
      co.disabled = true; cr.disabled = true;
      const lent = setTimeout(() => { err.textContent = 'Toujours en cours (réseau lent ?)… ça peut encore aboutir.'; }, 8000);
      fn(em.value, mp.value)
        .then(() => { clearTimeout(lent); rendreEcranPartie(corps); chargerImagesCompte(); })
        .catch(e => {
          clearTimeout(lent); co.disabled = false; cr.disabled = false;
          err.style.color = 'var(--sang)'; err.textContent = (e && e.message) || 'Connexion impossible.';
        });
    };
    const cr = bouton('Créer un compte', () => tenter(KJ.session.creerCompteMJ));
    actions.appendChild(cr);
    const co = bouton('Se connecter', () => tenter(KJ.session.connexionMJ));
    co.classList.add('actif');
    actions.appendChild(co);
    corps.appendChild(actions);
    mp.addEventListener('keydown', (e) => { if (e.key === 'Enter') co.click(); });
  }
  function rendreParties(corps, email) {
    const entete = document.createElement('div');
    entete.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px';
    const qui = document.createElement('span'); qui.className = 'aide';
    qui.style.margin = '0'; qui.textContent = email;   // le pseudo, jamais l'adresse complète
    entete.appendChild(qui);
    const bp = bouton('✎', () => {
      const nom = prompt('Ton pseudo (affiché à la place de l’adresse e-mail) :', email);
      if (nom === null || !nom.trim()) return;
      KJ.session.definirPseudo(nom).then(() => rendreEcranPartie(corps)).catch(e => alert(e.message));
    });
    bp.title = 'Changer de pseudo';
    entete.appendChild(bp);
    const esp = document.createElement('span'); esp.style.cssText = 'flex:1 1 auto';
    entete.appendChild(esp);
    entete.appendChild(bouton('Se déconnecter', () => {
      KJ.session.deconnexion().then(() => { majBadgeSession(0); btnSession.classList.remove('actif'); fermerModale(); toast('Déconnecté.'); });
    }));
    corps.appendChild(entete);

    if (KJ.session.active()) {
      const enCours = document.createElement('div');
      enCours.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px';
      const t = document.createElement('b'); t.textContent = 'À la table : partie ' + KJ.session.code();
      enCours.appendChild(t);
      enCours.appendChild(bouton('Quitter la table', () => {
        KJ.session.fermer().then(() => {
          majBadgeSession(0); btnSession.classList.remove('actif');
          toast('Table quittée — la partie et son état restent conservés.');
          rendreEcranPartie(corps);
        });
      }));
      corps.appendChild(enCours);
    }

    const listeEl = document.createElement('div');
    corps.appendChild(listeEl);
    const attente = noteModale(listeEl, 'Chargement des parties…');
    KJ.session.listerParties().then(parties => {
      listeEl.innerHTML = '';
      if (!parties.length)
        noteModale(listeEl, 'Aucune partie pour l’instant — crée la première ci-dessous.');
      for (const p of parties) {
        const ligne = document.createElement('div');
        ligne.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;'
          + 'border-bottom:1px solid var(--bord)';
        const inf = document.createElement('div');
        inf.style.cssText = 'flex:1 1 auto;min-width:0';
        const quand = p.modifiee ? new Date(p.modifiee).toLocaleDateString('fr-FR') : '';
        inf.innerHTML = '<b>' + R.esc(p.nom || 'Partie') + '</b>'
          + '<div class="aide" style="margin:0">code ' + R.esc(p.code) + (quand ? ' · ' + quand : '') + '</div>';
        ligne.appendChild(inf);
        const rep = bouton('▶ Reprendre', () => {
          rep.disabled = true;
          KJ.session.reprendrePartie(p.code).then(etat => {
            fermerModale(); brancherPartie(etat); annoncerCode(p.code, true);
          }).catch(e => { rep.disabled = false; alert(e.message); });
        });
        ligne.appendChild(rep);
        const sup = bouton('✕', () => {
          if (!confirm('Supprimer la partie « ' + (p.nom || p.code) + ' » ?\n\n'
            + 'Son brouillard, ses révélations et son code seront définitivement perdus.')) return;
          KJ.session.supprimerPartie(p.code).then(() => {
            majBadgeSession(0);
            if (!KJ.session.active()) btnSession.classList.remove('actif');
            rendreEcranPartie(corps);
          });
        });
        sup.className = 'danger';
        ligne.appendChild(sup);
        listeEl.appendChild(ligne);
      }
      const creation = document.createElement('div');
      creation.style.cssText = 'display:flex;gap:7px;margin-top:12px';
      const nom = document.createElement('input');
      nom.type = 'text'; nom.placeholder = 'Nom de la nouvelle partie (ex. Forêt Noire)';
      nom.style.cssText = 'flex:1 1 auto;min-width:0;background:#241d14;border:1px solid '
        + 'var(--bord-clair);border-radius:5px;color:var(--encre);padding:6px 9px';
      creation.appendChild(nom);
      const cr = bouton('＋ Créer', () => {
        cr.disabled = true;
        KJ.session.creerPartie(nom.value.trim() || 'Partie').then(code => {
          fermerModale(); brancherPartie(null); annoncerCode(code, false);
        }).catch(e => { cr.disabled = false; alert(e.message); });
      });
      creation.appendChild(cr);
      listeEl.appendChild(creation);
      noteModale(listeEl, 'Une partie garde son code et tout ce qui a été découvert '
        + 'd’une séance à l’autre. « Reprendre » te remet à la table telle que tu l’as laissée.');
    }).catch(e => { attente.textContent = e.message; });
  }

  const btnSession = $('b-session');
  if (btnSession) btnSession.addEventListener('click', () => {
    if (!KJ.session) return;
    if (!KJ.session.configuree()) {
      alert('Les parties multi-appareils ne sont pas encore configurées.\n\n'
        + 'Il manque la configuration Firebase dans js/firebase-config.js — voir ARCHITECTURE.md.');
      return;
    }
    ouvrirModale('Partie', false, rendreEcranPartie);
  });

  if (codeSessionURL && KJ.session) {
    /* Boutons réservés à la fenêtre d'invité : créer SON jeton PJ, et quitter la
       partie (pour, par exemple, se reconnecter ensuite en MJ depuis l'accueil). */
    $('b-jeton-joueur').hidden = false;
    $('b-jeton-joueur').addEventListener('click', () => {
      if (!carte) { toast('La carte du MJ n’est pas encore arrivée — réessaie dans un instant.'); return; }
      $('modale').classList.add('pour-joueur');   // seule modale autorisée côté joueur
      ouvrirDialogueJeton();
    });
    $('b-quitter-partie').hidden = false;
    $('b-quitter-partie').addEventListener('click', () => {
      if (!confirm('Quitter cette partie ?\n\nLe lien de la partie continue de marcher si tu veux revenir.')) return;
      Promise.resolve(KJ.session.fermer()).catch(() => {}).then(() => {
        try { localStorage.removeItem(CLE_PARTIE); } catch (e) {}
        location.replace('index.html');
      });
    });

    /* Si l'utilisateur connecté est le PROPRIÉTAIRE de cette partie, entrer par le
       code (ou le lien des joueurs) doit le ramener en MJ, pas en invité : on
       recharge la table en mode reprise (?partie=), qui n'impose pas la vue joueurs. */
    KJ.session.estProprietaire(codeSessionURL).catch(() => false).then(prop => {
    if (prop) {
      location.replace(location.pathname + '?partie=' + String(codeSessionURL).replace(/\D+/g, ''));
      return;
    }
    KJ.session.rejoindre(codeSessionURL, {
      onEtat: appliquerEtatDistant,
      // la carte affichée, transportée par la partie : si l'état l'attendait
      // (chargement resté vide faute de fichier), on la charge dès qu'elle arrive
      onCarte: (c) => {
        carteRecue = c;
        imagesPartie = c.images || {};   // les images du compte MJ que la carte référence
        // charge dès que rien (ou autre chose) n'est affiché — sans exiger que
        // l'état soit déjà arrivé : une partie à la carte publiée mais sans état
        // laissait sinon le joueur sur un écran vide définitif
        if ((!carte || carte.id !== c.id) && (!partie.carte || partie.carte === c.id))
          chargerCarte(c.id).catch(() => {});
        else if (carte && carte.id === c.id) dessinerImages();   // les icônes deviennent cliquables
      },
      onPing: (p) => { if (carte && p.carte === carte.id) montrerPing(p.x, p.y); },
      // la partie SURVIT aux absences du MJ : on montre la table telle qu'il l'a
      // laissée, on signale seulement s'il est là ou non
      onPresence: (present) => {
        if (mjPresent !== null)
          toast(present ? 'Le MJ est à la table.' : 'Le MJ a quitté la table — la partie reste consultable.');
        mjPresent = present;
        majBadgeSession(0);
      },
      onFin: () => {
        majBadgeSession(0);
        toast('Le MJ a supprimé cette partie.');
      },
    }).then(() => {
      majBadgeSession(0);
      toast('Partie rejointe : le MJ contrôle ce que tu vois.');
      // en réseau, cette fenêtre reflète le MJ : le suivi de caméra locale n'a pas de sens
      if ($('b-suivre')) $('b-suivre').style.display = 'none';
    }).catch(e => {
      const a = document.createElement('div');
      a.className = 'alerte';
      a.textContent = e.message;
      document.body.insertBefore(a, document.getElementById('scene'));
    });
    });   // fin de la vérification de propriété
  }

  /* Reprise directe par l'adresse (?partie=CODE) : la table du MJ, branchée sur sa
     partie — c'est ici qu'atterrit le propriétaire qui a suivi le lien des joueurs. */
  if (codePartieURL && !vueJoueurs && KJ.session && KJ.session.configuree()) {
    KJ.session.reprendrePartie(codePartieURL).then(etat => {
      brancherPartie(etat);
      toast('Partie ' + codePartieURL + ' reprise — tu es à la table en MJ.');
    }).catch(e => toast(e.message));
  }

  S.gererServiceWorker();

  /* Point d'observation pour le diagnostic (console du navigateur) :
     KJ_TABLE.catalogue → cartes connues ; KJ_TABLE.resoudre('etage') → cible d'une liaison. */
  window.KJ_TABLE = {
    get catalogue() { return catalogue; },
    get carte() { return carte; },
    resoudre: resoudre,
  };
})();
