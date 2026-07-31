/* ============================================================
   Cartographe Knight — mode Jeu (table virtuelle légère)
   Lit les cartes de la bibliothèque (IndexedDB) et du dépôt,
   ajoute brouillard de guerre, jetons, portails, ping et mesure.
   L'état de partie est distinct des cartes : une carte est une donnée,
   le brouillard et les jetons sont une session.
   ============================================================ */
(function () {
  const M = KJ.modele, R = KJ.rendu, S = KJ.stockage;
  const $ = (id) => document.getElementById(id);
  const scene = $('scene'), monde = $('monde'), plan = $('plan'), fog = $('fog'),
        pinsEl = $('pins'), jetonsEl = $('jetons'), regle = $('regle'), sur = $('sur');

  const QUAL = 2, PINCEAU = 26, CLE_PARTIE = 'kj-partie';
  const params = new URLSearchParams(location.search);
  const vueJoueurs = params.get('vue') === 'joueurs';
  if (vueJoueurs) document.body.dataset.vue = 'joueurs';
  const canal = ('BroadcastChannel' in window) ? new BroadcastChannel(CLE_PARTIE) : null;

  const COULEURS = ['#c9a227', '#6d8fb0', '#7fa070', '#a8544c', '#9aa0a6', '#b08fc9'];

  /* ---------------- état ---------------- */
  let carte = null;                 // carte affichée (données)
  let catalogue = [];               // [{ id, nom, source:'locale'|'depot', ref }]
  let partie = { carte: null, fog: {}, jetons: [] };
  try { const s = localStorage.getItem(CLE_PARTIE); if (s) partie = JSON.parse(s); } catch (e) {}

  function sauverPartie(diffuser) {
    try { localStorage.setItem(CLE_PARTIE, JSON.stringify(partie)); } catch (e) {}
    if (diffuser !== false && canal && !vueJoueurs) canal.postMessage({ t: 'partie', partie: partie });
  }
  const opsFog = () => (partie.fog[carte.id] = partie.fog[carte.id] || []);
  const cellule = () => (carte.grille.cell || 0);

  /* ---------------- caméra ---------------- */
  let cam = { s: 1, tx: 0, ty: 0 }, suivre = true;
  function appliquerCam() {
    monde.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})`;
    if (canal && !vueJoueurs) {
      const r = scene.getBoundingClientRect();
      canal.postMessage({ t: 'cam', cx: (r.width / 2 - cam.tx) / cam.s, cy: (r.height / 2 - cam.ty) / cam.s, s: cam.s });
    }
  }
  function cadrer() {
    const r = scene.getBoundingClientRect();
    cam.s = Math.min(r.width / carte.taille.w, r.height / carte.taille.h) * 0.94;
    cam.tx = (r.width - carte.taille.w * cam.s) / 2;
    cam.ty = (r.height - carte.taille.h * cam.s) / 2;
    appliquerCam();
  }
  function versMonde(cx, cy) {
    const r = scene.getBoundingClientRect();
    return { x: (cx - r.left - cam.tx) / cam.s, y: (cy - r.top - cam.ty) / cam.s };
  }

  /* ---------------- brouillard ---------------- */
  function dessinerFog() {
    const w = carte.taille.w, h = carte.taille.h;
    fog.width = w * QUAL; fog.height = h * QUAL;
    fog.style.width = w + 'px'; fog.style.height = h + 'px';
    const c = fog.getContext('2d');
    c.setTransform(QUAL, 0, 0, QUAL, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#080a12';   // noir légèrement bleuté : se distingue mieux du parchemin
    c.fillRect(0, 0, w, h);
    for (const op of opsFog()) {
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
  }
  function pinceau(m, x, y) {
    opsFog().push({ m: m, x: Math.round(x), y: Math.round(y), r: PINCEAU });
    dessinerFog(); sauverPartie();
  }
  /* Un coup de pinceau malheureux dévoile une pièce entière : il faut pouvoir
     revenir en arrière. On retire le dernier geste (une traînée = plusieurs
     touches, on remonte donc jusqu'au marqueur de début de geste). */
  let marqueursFog = [];
  function debutGesteFog() { marqueursFog.push(opsFog().length); if (marqueursFog.length > 40) marqueursFog.shift(); }
  function annulerFog() {
    const ops = opsFog();
    if (!ops.length) { toast('Rien à annuler.'); return; }
    const depuis = marqueursFog.length ? marqueursFog.pop() : ops.length - 1;
    ops.length = Math.max(0, depuis);
    dessinerFog(); sauverPartie();
    toast('Dernier geste de brouillard annulé.');
  }

  /* ---------------- rendu ---------------- */
  function dessinerPlan() {
    plan.setAttribute('width', carte.taille.w);
    plan.setAttribute('height', carte.taille.h);
    R.dansSVG(plan, carte, { vueMJ: document.body.dataset.vue === 'mj', grille: true, portails: false });
  }
  function dessinerJetons() {
    jetonsEl.innerHTML = '';
    for (const j of partie.jetons) {
      if (j.carte !== carte.id) continue;
      const d = document.createElement('div');
      d.className = 'jeton'; d.dataset.id = j.id;
      d.style.left = j.x + 'px'; d.style.top = j.y + 'px';
      if (j.img) d.style.backgroundImage = `url("${j.img}")`;
      else { d.style.background = j.couleur; d.textContent = j.nom; }
      jetonsEl.appendChild(d);
    }
  }
  /* Résolution d'une liaison : par identifiant, sinon par nom (ou son slug).
     Si plusieurs cartes correspondent, la version locale — celle que le MJ
     édite — a la priorité sur celle du dépôt. */
  function resoudre(vers) {
    if (!vers) return null;
    const v = S.slug(vers);
    const cands = catalogue.filter(c => c.id === vers || S.slug(c.id) === v || S.slug(c.nom) === v);
    if (!cands.length) return null;
    return cands.find(c => c.source === 'locale') || cands[0];
  }

  function dessinerPins() {
    pinsEl.innerHTML = '';
    const portails = carte.elements.filter(e => e.type === 'portail');
    for (const p of portails) {
      const dest = resoudre(p.vers);
      const d = document.createElement('div');
      d.className = 'pin' + (dest ? '' : ' inerte');
      d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
      if (dest) d.dataset.vers = dest.id;
      d.title = dest ? 'Aller à : ' + dest.nom : 'Carte « ' + p.vers + ' » absente de la bibliothèque';
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
    return Promise.all([
      S.avecDelai(S.lister(), 1500, []),          // ne jamais rester bloqué sur le stockage local
      S.avecDelai(S.catalogueDepot(), 2500, []),
    ]).then(([locales, depot]) => {
      catalogue = locales.map(c => ({ id: c.id, nom: c.nom, campagne: c.campagne, source: 'locale' }));
      const vus = new Set(catalogue.map(c => c.id));
      const noms = new Set(catalogue.map(c => S.slug(c.nom)));
      return Promise.all(depot.map(e => S.chargerDepot(e.fichier).catch(() => null)))
        .then(cartes => {
          cartes.filter(Boolean).forEach(c => {
            // une carte de travail locale masque celle du dépôt (même identifiant
            // OU même nom) : jamais deux entrées pour un même lieu dans le sélecteur
            if (!vus.has(c.id) && !noms.has(S.slug(c.nom)))
              catalogue.push({ id: c.id, nom: c.nom, campagne: c.campagne, source: 'depot', fichier: c.id, carte: c });
          });
          /* Sélecteur groupé par campagne : le MJ retrouve ses lieux par aventure. */
          const sel = $('choix-carte'); sel.innerHTML = '';
          const groupes = M.parCampagne(catalogue.map(c => ({ campagne: c.campagne, _ref: c })));
          for (const nom of M.listeCampagnes(catalogue)) {
            const g = document.createElement('optgroup');
            g.label = nom;
            for (const item of groupes[nom]) {
              const c = item._ref;
              const o = document.createElement('option');
              o.value = c.id;
              o.textContent = c.nom;
              g.appendChild(o);
            }
            sel.appendChild(g);
          }
        });
    });
  }
  function chargerCarte(id) {
    const e = catalogue.find(c => c.id === id) || catalogue[0];
    if (!e) return Promise.reject(new Error('Aucune carte disponible.'));
    const p = e.source === 'depot' ? Promise.resolve(e.carte) : S.charger(e.id).then(M.depuisJSON);
    return p.then(c => {
      carte = c;
      partie.carte = c.id;
      $('choix-carte').value = c.id;
      $('b-editer').href = 'editeur.html?' + (e.source === 'depot' ? 'depot=' + encodeURIComponent(c.id) + '.json' : 'id=' + encodeURIComponent(c.id));
      dessinerPlan(); dessinerFog(); dessinerJetons(); dessinerPins();
      /* Sur téléphone, la barre d'outils se réorganise après le premier calcul de
         mise en page : on recadre une fois les dimensions définitives connues. */
      cadrer();
      requestAnimationFrame(cadrer);
      setTimeout(cadrer, 150);
      sauverPartie();
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
      const changeCarte = m.partie.carte !== (carte && carte.id);
      partie = m.partie;
      if (changeCarte) chargerCarte(partie.carte).catch(() => {});
      else { dessinerFog(); dessinerJetons(); }
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
      try { partie = JSON.parse(e.newValue); dessinerFog(); dessinerJetons(); } catch (err) {}
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
  scene.addEventListener('dblclick', (e) => {
    const w = versMonde(e.clientX, e.clientY);
    montrerPing(w.x, w.y);
    if (canal) canal.postMessage({ t: 'ping', x: w.x, y: w.y, carte: carte.id });
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
  let mode = null, dep = null, jDrag = null, bouge = 0, mesure = null, pincePrec = null, pinEnCours = null;

  scene.addEventListener('pointerdown', (e) => {
    if (e.button === 2 || !carte) return;
    try { scene.setPointerCapture(e.pointerId); } catch (err) {}
    actifs.set(e.pointerId, e);
    if (actifs.size === 2) { mode = 'pince'; pincePrec = null; return; }

    const w = versMonde(e.clientX, e.clientY);
    const jet = e.target.closest('.jeton');
    const pin = e.target.closest('.pin');
    bouge = 0;

    if (!vueJoueurs && pin && pin.dataset.vers) { mode = 'pin'; pinEnCours = pin.dataset.vers; return; }
    if (!vueJoueurs && jet && outil === 'deplacer') {
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
    } else if (mode === 'pin') {
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
      const c = cellule();
      if (bouge > 2 && c) {
        jDrag.x = Math.round((jDrag.x - c / 2) / c) * c + c / 2;
        jDrag.y = Math.round((jDrag.y - c / 2) / c) * c + c / 2;
      }
      dessinerJetons(); sauverPartie(); jDrag = null;
    }
    if (mode === 'pin' && pinEnCours) {
      if (bouge <= 2) chargerCarte(pinEnCours).catch(() => toast('Carte introuvable.'));
      pinEnCours = null;
    }
    if (mode === 'mesure') {
      setTimeout(() => { regle.innerHTML = ''; const l = $('etiquette'); if (l) l.remove(); }, 1200);
      mesure = null;
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
    const jet = e.target.closest('.jeton');
    if (jet) {
      partie.jetons = partie.jetons.filter(j => j.id !== jet.dataset.id);
      dessinerJetons(); sauverPartie();
    }
  });

  /* ---------------- commandes ---------------- */
  $('choix-carte').addEventListener('change', (e) => chargerCarte(e.target.value).catch(() => toast('Chargement impossible.')));
  $('b-annuler-fog').addEventListener('click', annulerFog);
  $('b-couvrir').addEventListener('click', () => { partie.fog[carte.id] = []; dessinerFog(); sauverPartie(); toast('Carte entièrement recouverte.'); });
  $('b-decouvrir').addEventListener('click', () => {
    partie.fog[carte.id] = [{ m: 'reveal', x: carte.taille.w / 2, y: carte.taille.h / 2,
      r: Math.max(carte.taille.w, carte.taille.h) }];
    dessinerFog(); sauverPartie(); toast('Terrain entièrement révélé.');
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

  $('b-jeton').addEventListener('click', () => {
    const nom = (prompt('Étiquette du jeton (1-2 caractères) :', 'E') || '').trim().slice(0, 2);
    if (!nom) return;
    const creerJeton = (img) => {
      const pj = confirm('Est-ce un PJ ?\n\nOK = PJ (suivra le groupe de carte en carte)\nAnnuler = PNJ ou ennemi');
      const r = scene.getBoundingClientRect();
      const c = versMonde(r.left + r.width / 2, r.top + r.height / 2);
      partie.jetons.push({
        id: 'j' + Date.now(), nom: nom, pj: pj,
        couleur: COULEURS[partie.jetons.length % COULEURS.length],
        img: img || undefined,
        x: Math.round(c.x), y: Math.round(c.y), carte: carte.id,
      });
      dessinerJetons(); sauverPartie();
    };
    const url = (prompt('Image du jeton : colle une adresse http(s) (vide = choisir un fichier '
      + 'sur cet appareil, ou passer) :', '') || '').trim();
    if (/^https?:\/\//i.test(url)) { creerJeton(url); return; }
    if (url) toast('Adresse ignorée : seule une adresse http(s) fonctionne ici, pas un chemin local.');
    if (!confirm('Choisir une image sur cet appareil pour ce jeton ?\n\n'
        + 'OK = ouvrir le sélecteur de fichier\nAnnuler = disque de couleur uni')) { creerJeton(''); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', () => {
      const f = input.files[0];
      if (!f) { creerJeton(''); return; }
      const fr = new FileReader();
      fr.onload = () => vignette(fr.result).then(creerJeton).catch(() => creerJeton(''));
      fr.onerror = () => creerJeton('');
      fr.readAsDataURL(f);
    });
    input.addEventListener('cancel', () => creerJeton(''));
    input.click();
  });
  $('b-amener').addEventListener('click', () => {
    const pjs = partie.jetons.filter(j => j.pj);
    if (!pjs.length) { toast('Aucun jeton marqué « PJ ».'); return; }
    const pas = cellule() || 40;
    pjs.forEach((j, i) => {
      j.carte = carte.id;
      j.x = Math.round(carte.taille.w / 2 + (i - (pjs.length - 1) / 2) * pas);
      j.y = Math.round(carte.taille.h - pas * .9);
    });
    dessinerJetons(); sauverPartie(); toast(pjs.length + ' jeton(s) de PJ amené(s) ici.');
  });
  $('b-vue').addEventListener('click', () => {
    const j = document.body.dataset.vue === 'joueurs';
    document.body.dataset.vue = j ? 'mj' : 'joueurs';
    $('b-vue').classList.toggle('actif', !j);
    $('b-vue').textContent = j ? 'Vue joueurs' : 'Vue MJ';
    dessinerPlan();
  });
  $('b-cadrer').addEventListener('click', cadrer);
  const bs = $('b-suivre');
  if (bs) bs.addEventListener('click', () => {
    suivre = !suivre;
    bs.classList.toggle('actif', suivre);
    bs.textContent = suivre ? 'Suivre le MJ' : 'Vue libre';
  });
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

  chargerCatalogue().then(() => {
    const voulue = params.get('carte') || partie.carte;
    return chargerCarte(voulue);
  }).catch(() => {
    document.getElementById('scene').innerHTML =
      '<p style="padding:24px;font-family:var(--serif);font-style:italic;opacity:.7">'
      + 'Aucune carte dans la bibliothèque. Crée-en une dans l’éditeur, puis reviens ici.</p>';
  });

  S.gererServiceWorker();

  /* Point d'observation pour le diagnostic (console du navigateur) :
     KJ_TABLE.catalogue → cartes connues ; KJ_TABLE.resoudre('etage') → cible d'une liaison. */
  window.KJ_TABLE = {
    get catalogue() { return catalogue; },
    get carte() { return carte; },
    resoudre: resoudre,
  };
})();
