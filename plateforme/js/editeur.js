/* ============================================================
   Cartographe — éditeur
   Dessine des plans de JDR : pièces, murs, portes, mobilier,
   annotations, secrets. Exporte en JSON (source), SVG (PDF)
   et en scène pour la table de jeu.
   ============================================================ */
(function () {
  const M = KJ.modele, R = KJ.rendu, S = KJ.stockage;
  const $ = (id) => document.getElementById(id);
  const canevas = $('canevas'), monde = $('monde'), plan = $('plan'), edition = $('edition');

  /* ---------------- état ---------------- */
  let carte = M.nouvelleCarte({ nom: 'Nouvelle carte' });
  let sel = null;                 // id de l'élément sélectionné
  let outil = 'select';
  let symChoisi = 'table';
  let imgCatalogue = [];          // images/index.json : illustrations disponibles dans le dépôt
  let imgChoisi = null;
  let imgChemin = [];             // navigation dans le catalogue (chemin de dossiers) ; [] = racine
  let imgFiltre = '';             // recherche d'image par nom, tous dossiers confondus
  let imgCompte = null;           // images du compte MJ (null = pas de compte connecté)
  let imgDossiersCompte = [];     // dossiers déclarés du compte (existent même vides)
  let vueMJ = true;
  let cam = { s: 1, tx: 0, ty: 0 };
  const calquesVis = { grille: true, structure: true, mobilier: true, annotations: true, secrets: true };

  /* La barre reste courte : Construire regroupe pièce/mur/porte/fenêtre (choix
     dans le panneau), et lumière + portail vivent dans la palette d'Objet. Les
     raccourcis directs (P, M, D, F, L, W) continuent de marcher. */
  const OUTILS = [
    { id: 'select',     ic: '✥', nom: 'Sélectionner', k: 'v' },
    { id: 'multi',      ic: '🖱', nom: 'Multi-sélection', k: 'g' },
    { id: 'construire', ic: '▭', nom: 'Construire', k: 'c' },
    { id: 'objet',      ic: '⬓', nom: 'Objet',    k: 'o' },
    { id: 'numero',     ic: '①', nom: 'Numéro',   k: 'n' },
    { id: 'texte',      ic: 'T', nom: 'Texte',    k: 't' },
    { id: 'secret',     ic: '⌗', nom: 'Secret',   k: 's' },
    { id: 'image',      ic: '🖼', nom: 'Image',   k: 'i' },
  ];
  const SOUS_CONSTRUIRE = [
    { id: 'piece',   ic: '▭', nom: 'Pièce' },
    { id: 'mur',     ic: '▬', nom: 'Mur / trait' },
    { id: 'porte',   ic: '◠', nom: 'Porte' },
    { id: 'fenetre', ic: '▥', nom: 'Fenêtre' },
  ];
  const SOUS_OBJET = [
    { id: 'lumiere', ic: '✷', nom: 'Lumière' },
    { id: 'portail', ic: '◈', nom: 'Portail' },
  ];
  const RACCOURCIS = { p: 'piece', m: 'mur', d: 'porte', f: 'fenetre', l: 'lumiere', w: 'portail' };
  // à quel bouton de la barre appartient l'outil réellement actif ?
  const groupeDe = (id) => SOUS_CONSTRUIRE.some(s => s.id === id) ? 'construire'
    : SOUS_OBJET.some(s => s.id === id) ? 'objet' : id;
  let dernierConstruire = 'piece';   // sous-outil retrouvé en revenant sur Construire

  /* Cartes disponibles comme destinations de portail (bibliothèque + campagne). */
  let destinations = [];
  let campagnesConnues = [];
  function chargerDestinations() {
    return S.avecDelai(S.listerCartes(), 3000, []).then(toutes => {
      campagnesConnues = M.listeCampagnes(toutes.concat([carte]));
      destinations = toutes
        .filter(c => c.id !== carte.id)
        .map(c => ({ id: c.id, nom: c.nom, campagne: M.campagneDe(c) }));
      majCartePanneau();
    });
  }

  /* Illustrations disponibles (créatures, lieux) : catalogue du dépôt, plus les
     images du compte MJ (importées depuis l'appareil, compressées, stockées dans
     l'espace du compte — voir session.listerImagesMJ). */
  function chargerImages() {
    const depot = S.avecDelai(S.catalogueImages(), 1500, []).then(l => {
      imgCatalogue = l;
      if (!imgChoisi && l.length) imgChoisi = l[0];
    });
    // seulement si un compte est vraisemblablement connecté : pas question de
    // charger le SDK Firebase pour un visiteur anonyme qui n'en a pas besoin
    const compte = (KJ.session && KJ.session.configuree() && KJ.session.mjProbable())
      ? Promise.all([
          KJ.session.listerImagesMJ().then(l => { imgCompte = l; }),
          KJ.session.dossiersImagesMJ().then(l => { imgDossiersCompte = l; }),
        ]).catch(() => {})
      : Promise.resolve();
    return Promise.all([depot, compte]);
  }

  /* ---------------- historique (snapshots) ---------------- */
  let histo = [], hpos = -1;
  function pousser() {
    histo = histo.slice(0, hpos + 1);
    histo.push(JSON.stringify(carte));
    if (histo.length > 60) histo.shift();
    hpos = histo.length - 1;
    majBoutonsHisto();
  }
  function annuler() {
    if (hpos <= 0) return;
    hpos--; carte = JSON.parse(histo[hpos]); sel = null;
    tout(); majBoutonsHisto(); enregistrerPlusTard();
  }
  function refaire() {
    if (hpos >= histo.length - 1) return;
    hpos++; carte = JSON.parse(histo[hpos]); sel = null;
    tout(); majBoutonsHisto(); enregistrerPlusTard();
  }
  function majBoutonsHisto() {
    $('b-undo').disabled = hpos <= 0;
    $('b-redo').disabled = hpos >= histo.length - 1;
  }

  /* ---------------- caméra ---------------- */
  function applyCam() {
    monde.style.transform = `translate(${cam.tx}px,${cam.ty}px) scale(${cam.s})`;
    dessinerEdition();
  }
  function cadrer() {
    const vw = canevas.clientWidth, vh = canevas.clientHeight;
    cam.s = Math.min(vw / carte.taille.w, vh / carte.taille.h) * 0.9;
    cam.tx = (vw - carte.taille.w * cam.s) / 2;
    cam.ty = (vh - carte.taille.h * cam.s) / 2;
    applyCam();
  }
  function toMonde(cx, cy) {
    const r = canevas.getBoundingClientRect();
    return { x: (cx - r.left - cam.tx) / cam.s, y: (cy - r.top - cam.ty) / cam.s };
  }
  const cell = () => carte.grille.cell || 0;
  function acc(v, demi) { return libre ? Math.round(v) : M.snap(v, cell(), demi); }

  /* ---------------- rendu ---------------- */
  let besoinDessin = false;
  function dessinerPlus() {
    if (besoinDessin) return;
    besoinDessin = true;
    requestAnimationFrame(() => { besoinDessin = false; dessiner(); });
  }
  function dessiner() {
    plan.setAttribute('width', carte.taille.w);
    plan.setAttribute('height', carte.taille.h);
    R.dansSVG(plan, carte, { ids: true, vueMJ: vueMJ, grille: calquesVis.grille, calques: calquesVis });
    dessinerEdition();
  }
  function dessinerEdition() {
    edition.setAttribute('viewBox', `0 0 ${carte.taille.w} ${carte.taille.h}`);
    edition.setAttribute('width', carte.taille.w);
    edition.setAttribute('height', carte.taille.h);
    const k = 1 / Math.max(cam.s, .0001);
    let s = '';
    const el = sel && M.trouver(carte, sel);
    if (el) {
      const b = M.boite(el);
      // le cadre et les poignées doivent tourner avec l'objet (même pivot, même angle
      // que rendu.js), sinon ils restent axés sur le monde alors que l'objet est pivoté.
      const rot = (el.type === 'objet' && el.rot) ? el.rot : 0;
      const grp = rot ? ` transform="rotate(${rot} ${el.x} ${el.y})"` : '';
      s += `<g${grp}>`;
      s += `<rect class="cadre" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" `
         + `style="stroke-width:${1.5 * k}"/>`;
      if (M.redimensionnable(el)) {
        const r = 5 * k;
        const coins = [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h]];
        for (const [c, x, y] of coins)
          s += `<circle class="poignee" data-coin="${c}" cx="${x}" cy="${y}" r="${r}" `
             + `style="stroke-width:${1.5 * k}"/>`;
      }
      s += `</g>`;
    }
    // multi-sélection : un cadre pointillé par élément pris dans le rectangle
    for (const id of selMulti) {
      const e = M.trouver(carte, id); if (!e) continue;
      const b = M.boite(e);
      s += `<rect class="cadre" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" `
         + `style="stroke-width:${1.5 * k};stroke-dasharray:${4 * k} ${3 * k}"/>`;
    }
    if (apercu) s += apercu(k);
    if (accSurbrillance) s += accSurbrillance(k);
    edition.innerHTML = s;
  }

  /* ---------------- accroche aux murs ----------------
     Retourne le point projeté + l'orientation + le sens d'ouverture
     du bord de pièce (ou du mur) le plus proche : la pose des portes
     et des fenêtres devient magnétique. */
  function accrocheMur(pt) {
    const seuil = Math.max(cell() || 20, 18);
    let best = null;
    const test = (x, y, o, sens, d) => {
      if (d < seuil && (!best || d < best.d)) best = { x, y, o, sens, d };
    };
    for (const el of carte.elements) {
      if (el.type === 'piece') {
        const { x, y, w, h } = el;
        if (pt.x >= x - seuil && pt.x <= x + w + seuil) {
          test(Math.min(Math.max(pt.x, x), x + w), y,     'h',  1, Math.abs(pt.y - y));         // nord
          test(Math.min(Math.max(pt.x, x), x + w), y + h, 'h', -1, Math.abs(pt.y - (y + h)));  // sud
        }
        if (pt.y >= y - seuil && pt.y <= y + h + seuil) {
          test(x,     Math.min(Math.max(pt.y, y), y + h), 'v',  1, Math.abs(pt.x - x));         // ouest
          test(x + w, Math.min(Math.max(pt.y, y), y + h), 'v', -1, Math.abs(pt.x - (x + w)));   // est
        }
      } else if (el.type === 'mur') {
        const horiz = Math.abs(el.y2 - el.y1) < Math.abs(el.x2 - el.x1);
        if (horiz) {
          const y = (el.y1 + el.y2) / 2;
          if (pt.x >= Math.min(el.x1, el.x2) && pt.x <= Math.max(el.x1, el.x2))
            test(pt.x, y, 'h', 1, Math.abs(pt.y - y));
        } else {
          const x = (el.x1 + el.x2) / 2;
          if (pt.y >= Math.min(el.y1, el.y2) && pt.y <= Math.max(el.y1, el.y2))
            test(x, pt.y, 'v', 1, Math.abs(pt.x - x));
        }
      }
    }
    return best;
  }

  /* ---------------- interactions ---------------- */
  let mode = null, depart = null, elDrag = null, coin = null, apercu = null,
      accSurbrillance = null, libre = false, pointeurs = new Map(), pinch = null,
      selMulti = [];   // multi-sélection (outil 🖱) : ids des éléments pris dans le rectangle

  canevas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    try { canevas.setPointerCapture(e.pointerId); } catch (err) {}
    pointeurs.set(e.pointerId, e);
    if (pointeurs.size === 2) { mode = 'pinch'; pinch = null; return; }

    const pt = toMonde(e.clientX, e.clientY);
    const poi = e.target.closest('.poignee');
    const cible = e.target.closest('[data-id]');

    if (poi && sel) {
      mode = 'resize'; coin = poi.dataset.coin; elDrag = M.trouver(carte, sel);
      depart = { b: Object.assign({}, M.boite(elDrag)) };
      return;
    }

    /* Multi-sélection : glisser sur la sélection = tout déplacer ;
       glisser ailleurs = tracer un nouveau rectangle de sélection. */
    if (outil === 'multi') {
      if (selMulti.length && dansSelection(pt)) {
        mode = 'move-multi'; depart = { pt: pt, bouge: 0 };
      } else {
        selMulti = []; majPanneau();
        mode = 'trace-sel'; depart = { x: pt.x, y: pt.y };
        apercu = (k) => {
          const x2 = depart.x2 == null ? depart.x : depart.x2, y2 = depart.y2 == null ? depart.y : depart.y2;
          return `<rect class="apercu" x="${Math.min(depart.x, x2)}" y="${Math.min(depart.y, y2)}" `
            + `width="${Math.abs(x2 - depart.x)}" height="${Math.abs(y2 - depart.y)}" style="stroke-width:${1.5 * k}"/>`;
        };
        dessinerEdition();
      }
      return;
    }

    if (outil === 'select') {
      if (cible) {
        sel = cible.dataset.id;
        elDrag = M.trouver(carte, sel);
        mode = 'move'; depart = { pt: pt, bouge: 0 };
        majPanneau(); dessinerEdition();
      } else {
        sel = null; majPanneau();
        mode = 'pan'; depart = { x: e.clientX - cam.tx, y: e.clientY - cam.ty };
        canevas.classList.add('pan');
        dessinerEdition();
      }
      return;
    }

    // outils de tracé / de pose
    if (outil === 'piece' || outil === 'secret') {
      mode = 'trace-rect'; depart = { x: acc(pt.x), y: acc(pt.y) };
      apercu = (k) => `<rect class="apercu" x="${Math.min(depart.x, depart.x2 || depart.x)}" `
        + `y="${Math.min(depart.y, depart.y2 || depart.y)}" `
        + `width="${Math.abs((depart.x2 || depart.x) - depart.x)}" `
        + `height="${Math.abs((depart.y2 || depart.y) - depart.y)}" style="stroke-width:${1.5 * k}"/>`;
      return;
    }
    if (outil === 'mur') {
      mode = 'trace-mur'; depart = { x: acc(pt.x), y: acc(pt.y) };
      apercu = (k) => `<line class="apercu" x1="${depart.x}" y1="${depart.y}" `
        + `x2="${depart.x2 == null ? depart.x : depart.x2}" y2="${depart.y2 == null ? depart.y : depart.y2}" `
        + `style="stroke-width:${Math.max(5, 2 * k)}"/>`;
      return;
    }
    // pose immédiate
    poser(pt);
    mode = null;
  });

  canevas.addEventListener('pointermove', (e) => {
    if (pointeurs.has(e.pointerId)) pointeurs.set(e.pointerId, e);

    if (mode === 'pinch' && pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      if (pinch) {
        const r = canevas.getBoundingClientRect();
        const w = toMonde(pinch.mid.x, pinch.mid.y);
        cam.s = Math.min(12, Math.max(.08, cam.s * (d / pinch.d)));
        cam.tx = mid.x - r.left - w.x * cam.s;
        cam.ty = mid.y - r.top - w.y * cam.s;
        applyCam();
      }
      pinch = { d, mid };
      return;
    }

    const pt = toMonde(e.clientX, e.clientY);

    // aperçu d'accroche pour porte / fenêtre, même sans bouton enfoncé
    if (!mode && (outil === 'porte' || outil === 'fenetre')) {
      const a = accrocheMur(pt);
      accSurbrillance = a ? ((k) => {
        const l = 30;
        return a.o === 'h'
          ? `<line class="accroche" x1="${a.x - l / 2}" y1="${a.y}" x2="${a.x + l / 2}" y2="${a.y}" style="stroke-width:${3 * k}"/>`
          : `<line class="accroche" x1="${a.x}" y1="${a.y - l / 2}" x2="${a.x}" y2="${a.y + l / 2}" style="stroke-width:${3 * k}"/>`;
      }) : null;
      dessinerEdition();
      return;
    }

    if (mode === 'pan') {
      cam.tx = e.clientX - depart.x; cam.ty = e.clientY - depart.y; applyCam();
    } else if (mode === 'move' && elDrag) {
      const dx = acc(pt.x - depart.pt.x, true), dy = acc(pt.y - depart.pt.y, true);
      if (dx || dy) {
        M.deplacer(elDrag, dx, dy);
        depart.pt = { x: depart.pt.x + dx, y: depart.pt.y + dy };
        depart.bouge++;
        dessinerPlus();
      }
    } else if (mode === 'move-multi') {
      const dx = acc(pt.x - depart.pt.x, true), dy = acc(pt.y - depart.pt.y, true);
      if (dx || dy) {
        for (const id of selMulti) { const el = M.trouver(carte, id); if (el) M.deplacer(el, dx, dy); }
        depart.pt = { x: depart.pt.x + dx, y: depart.pt.y + dy };
        depart.bouge++;
        dessinerPlus();
      }
    } else if (mode === 'trace-sel') {
      depart.x2 = pt.x; depart.y2 = pt.y;
      dessinerEdition();
    } else if (mode === 'resize' && elDrag) {
      redimensionner(elDrag, coin, pt);
      dessinerPlus();
    } else if (mode === 'trace-rect' || mode === 'trace-mur') {
      depart.x2 = acc(pt.x); depart.y2 = acc(pt.y);
      if (mode === 'trace-mur' && !libre) {   // mur orthogonal par défaut
        if (Math.abs(depart.x2 - depart.x) >= Math.abs(depart.y2 - depart.y)) depart.y2 = depart.y;
        else depart.x2 = depart.x;
      }
      dessinerEdition();
    }
  });

  function finir(e) {
    pointeurs.delete(e.pointerId);
    if (mode === 'pinch') {
      if (pointeurs.size < 2) { pinch = null; mode = pointeurs.size ? 'pan' : null;
        if (mode === 'pan') { const p = [...pointeurs.values()][0]; depart = { x: p.clientX - cam.tx, y: p.clientY - cam.ty }; } }
      return;
    }
    if (mode === 'trace-rect' && depart.x2 != null) {
      const x = Math.min(depart.x, depart.x2), y = Math.min(depart.y, depart.y2);
      const w = Math.abs(depart.x2 - depart.x), h = Math.abs(depart.y2 - depart.y);
      const min = Math.max((cell() || 20) / 2, 8);
      if (w >= min && h >= min) {
        const el = M.ajouter(carte, M.nouvelElement(outil, { x, y, w, h }));
        sel = el.id; majPanneau(); apresModif();
      }
    } else if (mode === 'trace-mur' && depart.x2 != null) {
      if (Math.hypot(depart.x2 - depart.x, depart.y2 - depart.y) >= 10) {
        const el = M.ajouter(carte, M.nouvelElement('mur', { x1: depart.x, y1: depart.y, x2: depart.x2, y2: depart.y2 }));
        sel = el.id; majPanneau(); apresModif();
      }
    } else if (mode === 'trace-sel' && depart.x2 != null) {
      const r = { x: Math.min(depart.x, depart.x2), y: Math.min(depart.y, depart.y2),
                  w: Math.abs(depart.x2 - depart.x), h: Math.abs(depart.y2 - depart.y) };
      selMulti = carte.elements.filter(el => {
        const b = M.boite(el);
        return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
      }).map(el => el.id);
      if (selMulti.length)
        toast(selMulti.length + ' élément' + (selMulti.length > 1 ? 's' : '')
          + ' — glisse la sélection pour déplacer, Suppr pour supprimer, Échap pour finir.');
      majPanneau();
    } else if ((mode === 'move' && depart.bouge) || mode === 'resize'
      || (mode === 'move-multi' && depart.bouge)) {
      apresModif();
    }
    apercu = null; mode = null; depart = null; elDrag = null; coin = null;
    canevas.classList.remove('pan');
    dessiner();
  }
  canevas.addEventListener('pointerup', finir);
  canevas.addEventListener('pointercancel', finir);

  canevas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canevas.getBoundingClientRect();
    const w = toMonde(e.clientX, e.clientY);
    cam.s = Math.min(12, Math.max(.08, cam.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    cam.tx = e.clientX - r.left - w.x * cam.s;
    cam.ty = e.clientY - r.top - w.y * cam.s;
    applyCam();
  }, { passive: false });

  canevas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const cible = e.target.closest('[data-id]');
    if (cible) { M.supprimer(carte, cible.dataset.id); if (sel === cible.dataset.id) sel = null;
      majPanneau(); apresModif(); dessiner(); }
  });

  /* Point monde → repère local d'un objet pivoté (rotation inverse autour de son
     centre) : permet de redimensionner un objet tourné avec le même calcul
     axis-aligned que les autres, sans que les poignées « répondent » dans le
     mauvais sens dès que l'objet n'est plus à 0°. */
  function versLocal(pt, deg, centre) {
    if (!deg) return pt;
    const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const dx = pt.x - centre.x, dy = pt.y - centre.y;
    return { x: centre.x + dx * cos + dy * sin, y: centre.y - dx * sin + dy * cos };
  }

  function redimensionner(el, coin, pt) {
    const b = depart.b;
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    const p = (el.type === 'objet' && el.rot) ? versLocal(pt, el.rot, { x: el.x, y: el.y }) : pt;
    const px = acc(p.x), py = acc(p.y);
    if (coin.includes('w')) x1 = px; else x2 = px;
    if (coin.includes('n')) y1 = py; else y2 = py;
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.max(Math.abs(x2 - x1), 6), h = Math.max(Math.abs(y2 - y1), 6);
    if (el.type === 'objet') { el.x = x + w / 2; el.y = y + h / 2; el.w = w; el.h = h; }
    else { el.x = x; el.y = y; el.w = w; el.h = h; }
  }

  function poser(pt) {
    // le canevas déborde du plan (fond gris de #canevas visible autour du parchemin
    // quand on est dézoomé) : un clic là créait un élément hors cadre, invisible dans
    // l'éditeur (clippé par le viewBox du SVG) mais flottant en mode Jeu (rien ne l'y
    // clippe) — un élément qu'on ne pouvait plus ni voir ni sélectionner pour le corriger.
    pt = { x: Math.min(Math.max(pt.x, 0), carte.taille.w), y: Math.min(Math.max(pt.y, 0), carte.taille.h) };
    let el;
    if (outil === 'porte' || outil === 'fenetre') {
      const a = accrocheMur(pt);
      const p = a ? { x: Math.round(a.x), y: Math.round(a.y), o: a.o, sens: a.sens || 1 }
                  : { x: acc(pt.x, true), y: acc(pt.y, true), o: 'h', sens: 1 };
      if (outil === 'porte') el = M.nouvelElement('porte', Object.assign(p, { l: cell() || 30 }));
      else el = M.nouvelElement('fenetre', { x: p.x, y: p.y, o: p.o, l: (cell() || 32) * .8 });
    } else if (outil === 'objet') {
      el = M.nouvelElement('objet', { sym: symChoisi, x: acc(pt.x, true), y: acc(pt.y, true) });
    } else if (outil === 'numero') {
      const max = carte.elements.filter(e => e.type === 'numero').reduce((m, e) => Math.max(m, +e.num || 0), 0);
      el = M.nouvelElement('numero', { x: acc(pt.x, true), y: acc(pt.y, true), num: max + 1 });
      carte.cle.push({ num: max + 1, titre: '', desc: '' });
    } else if (outil === 'texte') {
      const t = prompt('Texte :', '');
      if (!t) return;
      el = M.nouvelElement('texte', { x: Math.round(pt.x), y: Math.round(pt.y), texte: t });
    } else if (outil === 'lumiere') {
      el = M.nouvelElement('lumiere', { x: acc(pt.x, true), y: acc(pt.y, true) });
    } else if (outil === 'portail') {
      const d = destinations[0];
      el = M.nouvelElement('portail', {
        x: acc(pt.x, true), y: acc(pt.y, true),
        vers: d ? d.id : '', label: d ? d.nom.replace(/^.*—\s*/, '') : 'Sortie',
      });
    } else if (outil === 'image') {
      if (!imgChoisi) { toast('Choisis d’abord une image dans le panneau, à droite.'); return; }
      el = M.nouvelElement('image', {
        x: acc(pt.x, true), y: acc(pt.y, true),
        src: srcPose(imgChoisi), nom: imgChoisi.nom || '',
      });
    } else return;
    M.ajouter(carte, el);
    sel = el.id;
    majPanneau(); apresModif(); dessiner();
  }

  /* ---------------- panneaux ---------------- */
  function champ(label, input) {
    const d = document.createElement('div'); d.className = 'champ';
    const l = document.createElement('label'); l.textContent = label;
    d.appendChild(l); d.appendChild(input); return d;
  }
  function inputNum(val, onch, pas) {
    const i = document.createElement('input');
    i.type = 'number';
    // pas fractionnaire (mètres par case, rotation…) : on ne doit pas arrondir la valeur affichée
    i.value = (pas && pas < 1) ? val : Math.round(val);
    i.step = pas || 1;
    i.addEventListener('change', () => { onch(+i.value); apresModif(); dessiner(); });
    return i;
  }
  function inputTxt(val, onch) {
    const i = document.createElement('input');
    i.type = 'text'; i.value = val || '';
    i.addEventListener('change', () => { onch(i.value); apresModif(); dessiner(); });
    return i;
  }
  function select(val, opts, onch) {
    const s = document.createElement('select');
    for (const [v, t] of opts) {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      if (v === val) o.selected = true; s.appendChild(o);
    }
    s.addEventListener('change', () => { onch(s.value); apresModif(); dessiner(); });
    return s;
  }
  function bouton(txt, onc, cls) {
    const b = document.createElement('button'); b.textContent = txt;
    if (cls) b.className = cls;
    b.addEventListener('click', onc); return b;
  }
  function caseACocher(label, val, onch) {
    const l = document.createElement('label'); l.className = 'coche';
    const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!val;
    i.addEventListener('change', () => { onch(i.checked); apresModif(); dessiner(); });
    l.appendChild(i); l.appendChild(document.createTextNode(label));
    return l;
  }

  /* Taille exprimée en CASES quand la carte a une grille : on pense « une porte
     d'une case », jamais « une porte de 8 px ». Sans grille (extérieurs), les px
     restent la seule unité disponible. */
  function champCases(label, valPx, onchPx, minPx) {
    const cel = cell();
    if (!cel) {
      return champ(label + ' (px)', inputNum(valPx, v => onchPx(Math.max(minPx || 1, v))));
    }
    const i = document.createElement('input');
    i.type = 'number';
    i.value = +(valPx / cel).toFixed(2);
    i.step = .5; i.min = .25;
    i.addEventListener('change', () => {
      onchPx(Math.max(minPx || 1, Math.round(+i.value * cel)));
      apresModif(); dessiner(); majPanneau();
    });
    return champ(label + ' (cases)', i);
  }

  function majPanneau() {
    const p = $('props'); p.innerHTML = '';

    /* Multi-sélection active : un panneau de GROUPE — chaque champ s'applique
       à tous les éléments sélectionnés qui portent cet attribut. */
    if (selMulti.length) {
      const els = selMulti.map(id => M.trouver(carte, id)).filter(Boolean);
      $('t-props').textContent = 'Sélection — ' + els.length + ' élément' + (els.length > 1 ? 's' : '');
      const NOMS = { piece: 'pièce(s)', mur: 'mur(s)', porte: 'porte(s)', fenetre: 'fenêtre(s)',
        objet: 'objet(s)', numero: 'numéro(s)', texte: 'texte(s)', lumiere: 'lumière(s)',
        portail: 'portail(s)', secret: 'secret(s)', image: 'image(s)' };
      const parType = {};
      els.forEach(e => parType[e.type] = (parType[e.type] || 0) + 1);
      const resume = document.createElement('p'); resume.className = 'aide';
      resume.textContent = Object.keys(parType).map(t => parType[t] + ' ' + (NOMS[t] || t)).join(', ')
        + '. Chaque réglage s’applique à toute la sélection.';
      p.appendChild(resume);

      const avecEp = els.filter(e => e.type === 'mur' || e.type === 'piece');
      if (avecEp.length)
        p.appendChild(champ('Épaisseur', inputNum(avecEp[0].ep === undefined ? 2 : avecEp[0].ep,
          v => avecEp.forEach(e => e.ep = Math.max(1, v)))));
      const avecL = els.filter(e => e.type === 'porte' || e.type === 'fenetre');
      if (avecL.length)
        p.appendChild(champCases('Largeur', avecL[0].l, v => avecL.forEach(e => e.l = v), 6));
      const portes = els.filter(e => e.type === 'porte');
      if (portes.length)
        p.appendChild(champ('Style', select(portes[0].style,
          [['simple', 'Simple'], ['double', 'Double'], ['passage', 'Passage ouvert'], ['secrete', 'Secrète']],
          v => portes.forEach(e => e.style = v))));
      const objets = els.filter(e => e.type === 'objet');
      if (objets.length)
        p.appendChild(champ('Rotation', inputNum(objets[0].rot || 0,
          v => objets.forEach(e => e.rot = v), 15)));
      // toute une zone d'un coup : la pièce cachée ET ses murs, portes, mobilier
      const cachables = els.filter(e => e.type !== 'secret' && e.type !== 'image');
      if (cachables.length)
        p.appendChild(caseACocher('Caché aux joueurs (révélable en jeu)',
          cachables.every(e => e.cache),
          v => { cachables.forEach(e => { e.cache = v || undefined; if (!v) e.auto = undefined; }); majPanneau(); }));
      const caches = cachables.filter(e => e.cache);
      if (caches.length)
        p.appendChild(caseACocher('Révélation auto des éléments cachés (PJ dans la pièce)',
          caches.every(e => e.auto === true),
          v => caches.forEach(e => e.auto = v ? true : undefined)));

      p.appendChild(bouton('✕ Supprimer la sélection (Suppr)', () => {
        if (!confirm('Supprimer les ' + els.length + ' éléments sélectionnés ?')) return;
        for (const e of els) M.supprimer(carte, e.id);
        selMulti = []; sel = null; majPanneau(); apresModif(); dessiner();
      }, 'danger'));
      return;
    }

    const el = sel && M.trouver(carte, sel);
    $('t-props').textContent = el ? 'Élément — ' + el.type : 'Élément';

    if (groupeDe(outil) === 'construire' && !el) { paletteConstruire(p); return; }
    if (groupeDe(outil) === 'objet' && !el) { palette(p); return; }
    if (outil === 'image' && !el) { paletteImages(p); return; }
    if (!el) {
      p.innerHTML = '<p class="vide">Aucune sélection.</p>'
        + '<p class="aide">Choisis un outil à gauche, puis trace ou pose sur le plan. '
        + 'Clic droit sur un élément pour le supprimer.</p>';
      if (outil === 'objet') palette(p);
      if (outil === 'image') paletteImages(p);
      return;
    }

    if (el.type === 'piece') {
      p.appendChild(champ('Nom', inputTxt(el.nom, v => el.nom = v)));
      // 0 = taille AUTO : calculée pour tenir dans la largeur de la pièce
      p.appendChild(champ('Taille nom', inputNum(el.nomTaille || 0,
        v => el.nomTaille = v > 0 ? v : undefined)));
      p.appendChild(champ('Position nom', select(el.nomPos || 'haut',
        [['haut', 'En haut'], ['centre', 'Au centre'], ['bas', 'En bas']],
        v => el.nomPos = v === 'haut' ? undefined : v)));
      p.appendChild(champCases('Largeur', el.w, v => el.w = v, 8));
      p.appendChild(champCases('Hauteur', el.h, v => el.h = v, 8));
      p.appendChild(champ('Murs (ép.)', inputNum(el.ep === undefined ? 2 : el.ep, v => el.ep = Math.max(1, v))));
    } else if (el.type === 'mur') {
      p.appendChild(champ('Épaisseur', inputNum(el.ep, v => el.ep = Math.max(1, v))));
    } else if (el.type === 'porte') {
      p.appendChild(champ('Style', select(el.style, [['simple', 'Simple'], ['double', 'Double'],
        ['passage', 'Passage ouvert'], ['secrete', 'Secrète']], v => el.style = v)));
      p.appendChild(champCases('Largeur', el.l, v => el.l = v, 6));
      p.appendChild(champ('Orientation', select(el.o, [['h', 'Horizontale'], ['v', 'Verticale']], v => el.o = v)));
      p.appendChild(bouton('⇄ Inverser l’ouverture (X)', () => { el.sens = -el.sens; apresModif(); dessiner(); }));
    } else if (el.type === 'fenetre') {
      p.appendChild(champCases('Largeur', el.l, v => el.l = v, 6));
      p.appendChild(champ('Orientation', select(el.o, [['h', 'Horizontale'], ['v', 'Verticale']], v => el.o = v)));
    } else if (el.type === 'objet') {
      p.appendChild(champ('Symbole', select(el.sym, M.SYMBOLES.map(s => [s.id, s.nom]), v => {
        const s = M.symbole(v); el.sym = v; el.w = s.w; el.h = s.h;
      })));
      p.appendChild(champCases('Largeur', el.w, v => el.w = v, 6));
      p.appendChild(champCases('Hauteur', el.h, v => el.h = v, 6));
      p.appendChild(champ('Rotation', inputNum(el.rot || 0, v => el.rot = v, 15)));
      p.appendChild(bouton('↻ Tourner de 15° (R)', () => { el.rot = ((el.rot || 0) + 15) % 360; apresModif(); dessiner(); }));
    } else if (el.type === 'numero') {
      p.appendChild(champ('Numéro', inputNum(el.num, v => el.num = v)));
    } else if (el.type === 'texte') {
      p.appendChild(champ('Texte', inputTxt(el.texte, v => el.texte = v)));
      p.appendChild(champ('Style', select(el.style, [['lbl', 'Libellé de salle'], ['tiny', 'Petite note']], v => el.style = v)));
      // 0 = taille du style choisi (11.5 px pour un libellé, 9 px pour une note)
      p.appendChild(champ('Taille (px)', inputNum(el.taille || 0,
        v => el.taille = v > 0 ? v : undefined)));
      p.appendChild(champ('Couleur', select(el.couleur || '',
        [['', 'Encre (défaut)'], ['#c9a227', 'Or'], ['#a8544c', 'Rouge'], ['#7fa070', 'Vert'], ['#6d8fb0', 'Bleu']],
        v => el.couleur = v || undefined)));
      p.appendChild(champ('Rotation', inputNum(el.rot || 0, v => el.rot = v, 15)));
    } else if (el.type === 'portail') {
      // une valeur inconnue des destinations (carte pas encore créée, ou renommée) ne doit
      // jamais faire retomber le <select> en silence sur une autre destination : on l'ajoute
      // en option, visiblement marquée, pour que « Mène à » affiche toujours la vraie cible.
      const options = destinations.map(d => [d.id, d.nom]);
      const connue = destinations.some(d => d.id === el.vers);
      if (el.vers && !connue) options.unshift([el.vers, '⚠ « ' + el.vers + ' » — carte introuvable']);
      if (!options.length) {
        p.appendChild(document.createRange().createContextualFragment(
          '<p class="aide">Aucune autre carte disponible : crée d’abord la carte de destination, '
          + 'puis reviens poser le portail.</p>'));
      } else {
        p.appendChild(champ('Mène à', select(el.vers, options, v => {
          el.vers = v;
          const d = destinations.find(x => x.id === v);
          if (d && !el.label) el.label = d.nom.replace(/^.*—\s*/, '');
        })));
      }
      p.appendChild(champ('Étiquette', inputTxt(el.label, v => el.label = v)));
      p.appendChild(document.createRange().createContextualFragment(
        '<p class="aide">En mode Jeu, un clic sur ce losange bascule sur la carte de destination. '
        + 'Pose-le sur l’escalier ou la porte concernée, et pense au portail de retour sur l’autre carte.</p>'));
    } else if (el.type === 'secret') {
      p.appendChild(champ('Nature', inputTxt(el.nature, v => el.nature = v)));
      p.appendChild(champCases('Largeur', el.w, v => el.w = v, 6));
      p.appendChild(champCases('Hauteur', el.h, v => el.h = v, 6));
      p.appendChild(caseACocher('Révélation automatique (un PJ entre dans la pièce)',
        el.auto !== false, v => el.auto = v));
      p.appendChild(document.createRange().createContextualFragment(
        '<p class="aide">Les secrets ne sont visibles qu’en vue MJ : ils disparaissent de la vue joueurs et '
        + 'des exports en vue joueurs. Décoche la révélation automatique pour un secret qui ne doit jamais '
        + 'se dévoiler tout seul (une trappe cachée, par ex.) — clic droit dessus, en mode Jeu, reste toujours '
        + 'possible pour le révéler à la main.</p>'));
    } else if (el.type === 'image') {
      const prev = document.createElement('img');
      prev.src = resoudreSrc(el.src); prev.alt = el.nom || '';
      prev.style.cssText = 'width:100%;max-height:160px;object-fit:contain;border-radius:5px;'
        + 'display:block;margin-bottom:8px;border:1px solid var(--bord-clair);background:#000';
      p.appendChild(prev);
      p.appendChild(champ('Légende', inputTxt(el.nom, v => el.nom = v)));
      p.appendChild(caseACocher('Révélation automatique (un PJ entre dans la pièce)',
        el.auto !== false, v => el.auto = v));
      p.appendChild(document.createRange().createContextualFragment(
        '<p class="aide">Cette icône n’apparaît qu’en vue MJ (éditeur et table de jeu), jamais en vue '
        + 'joueurs. En mode Jeu, un clic dessus affiche l’image en grand par-dessus le plan.</p>'));
      const chLbl = document.createElement('p'); chLbl.className = 'aide'; chLbl.textContent = 'Remplacer par :';
      p.appendChild(chLbl);
      paletteImages(p, (im) => {
        el.src = srcPose(im);
        apresModif(); dessiner(); majPanneau();
      }, el.src);
    }
    /* Zone cachée : l'élément (pièce, mur, porte…) est invisible côté joueurs tant
       que le MJ ne l'a pas révélé en jeu — pour la pièce derrière un mur secret.
       Secrets et images sont déjà réservés au MJ, la case serait redondante. */
    if (el.type !== 'secret' && el.type !== 'image') {
      p.appendChild(caseACocher('Caché aux joueurs (révélable en jeu)', !!el.cache,
        v => { el.cache = v || undefined; if (!v) el.auto = undefined; majPanneau(); }));
      // l'inverse des secrets : ici l'automatisme est OPT-IN, jamais par défaut
      if (el.cache)
        p.appendChild(caseACocher('Révélation automatique (un PJ entre dans la pièce)',
          el.auto === true, v => el.auto = v ? true : undefined));
    }
    p.appendChild(bouton('✕ Supprimer (Suppr)', () => {
      M.supprimer(carte, el.id); sel = null; majPanneau(); apresModif(); dessiner();
    }, 'danger'));
  }
  function txtInfo(t) { const i = document.createElement('input'); i.value = t; i.disabled = true; return i; }
  function duo(a, b, onch) {
    const w = document.createElement('span'); w.style.display = 'flex'; w.style.gap = '5px'; w.style.flex = '1';
    const ia = inputNum(a, v => onch(v, b)), ib = inputNum(b, v => onch(a, v));
    w.appendChild(ia); w.appendChild(ib); return w;
  }

  function palette(p) {
    const t = document.createElement('p'); t.className = 'aide';
    t.textContent = 'Choisis un symbole, puis clique sur le plan pour le poser.';
    p.appendChild(t);
    const g = document.createElement('div'); g.className = 'palette';
    // lumière et portail : posés comme des objets, rangés dans la même palette
    for (const sp of SOUS_OBJET) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="ic-dossier">${sp.ic}</span><span>${sp.nom}</span>`;
      if (outil === sp.id) b.classList.add('actif');
      b.addEventListener('click', () => choisirOutil(sp.id));
      g.appendChild(b);
    }
    for (const s of M.SYMBOLES) {
      const b = document.createElement('button');
      b.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${R.SYM[s.id] || ''}</svg>`
        + `<span>${s.nom}</span>`;
      if (s.id === symChoisi && outil === 'objet') b.classList.add('actif');
      b.addEventListener('click', () => {
        symChoisi = s.id;
        if (outil !== 'objet') choisirOutil('objet'); else majPanneau();
      });
      g.appendChild(b);
    }
    p.appendChild(g);
  }

  /* Palette de construction : pièce, mur, porte, fenêtre sous un seul bouton
     de la barre — l'outil réellement actif reste piece/mur/porte/fenetre. */
  function paletteConstruire(p) {
    const t = document.createElement('p'); t.className = 'aide';
    t.textContent = 'Choisis quoi construire, puis trace sur le plan. '
      + 'Les portes et fenêtres s’aimantent au mur le plus proche.';
    p.appendChild(t);
    const g = document.createElement('div'); g.className = 'palette';
    for (const s of SOUS_CONSTRUIRE) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="ic-dossier">${s.ic}</span><span>${s.nom}</span>`;
      if (s.id === outil) b.classList.add('actif');
      b.addEventListener('click', () => choisirOutil(s.id));
      g.appendChild(b);
    }
    p.appendChild(g);
  }

  /* Palette d'illustrations (catalogue du dépôt, images/index.json). Sans onPick,
     choisit l'image à poser (outil Image) ; avec onPick, sert à remplacer l'image
     d'un élément déjà posé (voir majPanneau, cas 'image'). Navigation par dossiers
     (fil d'ariane + sous-dossiers cliquables, via imgChemin) : avec des images rangées
     en sous-dossiers dans plateforme/images/, il faut pouvoir descendre dedans, pas
     seulement choisir parmi un premier niveau à plat. */
  /* Une image du dépôt a un .fichier (chemin sous images/), une image de compte un
     .id et un .data (data URL compressée). Sur la carte on n'écrit JAMAIS le blob :
     une image de compte est référencée « img:<id> » — la carte reste légère, l'image
     n'existe qu'en un exemplaire dans le compte. (Les vieilles cartes qui embarquent
     encore un data: complet restent lues telles quelles.) */
  const MES_IMAGES = '🖼 Mes images';
  const srcAffichage = (im) => im.data || ('images/' + im.fichier);
  const srcPose = (im) => im.id ? 'img:' + im.id : 'images/' + im.fichier;
  function resoudreSrc(src) {
    if (!src || src.indexOf('img:') !== 0) return src;
    const im = (imgCompte || []).find(x => 'img:' + x.id === src);
    return im ? im.data : '';
  }

  function paletteImages(p, onPick, actifSrc) {
    onPick = onPick || ((im) => { imgChoisi = im; majPanneau(); });
    if (actifSrc === undefined) actifSrc = imgChoisi && srcPose(imgChoisi);

    p.appendChild(filAriane(imgChemin, (c) => { imgChemin = c; majPanneau(); }));

    /* Recherche par nom, dans TOUS les dossiers à la fois : avec des dizaines
       d'images, descendre dossier par dossier ne suffit plus. Le champ ne
       redessine que la grille (jamais tout le panneau) pour garder le focus. */
    const rech = document.createElement('input');
    rech.type = 'search'; rech.className = 'recherche-images';
    rech.placeholder = '🔎 Chercher (tous dossiers)…';
    rech.value = imgFiltre;
    p.appendChild(rech);

    const t = document.createElement('p'); t.className = 'aide';
    p.appendChild(t);
    const zone = document.createElement('div');
    p.appendChild(zone);

    function tuile(im, g) {
      const b = document.createElement('button');
      b.innerHTML = `<img src="${srcAffichage(im)}" alt="">` + `<span>${im.nom || im.fichier || 'Image'}</span>`;
      if (srcPose(im) === actifSrc) b.classList.add('actif');
      b.addEventListener('click', () => onPick(im));
      if (im.id) {   // image de compte : glissable vers un dossier
        b.draggable = true;
        b.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', im.id);
          e.dataTransfer.effectAllowed = 'move';
        });
      }
      if (im.id) b.addEventListener('contextmenu', (e) => {   // image de compte : clic droit = supprimer
        e.preventDefault();
        if (!confirm('Supprimer « ' + (im.nom || 'cette image') + ' » de ton compte ?\n\n'
          + 'Les icônes déjà posées sur des cartes ne pourront plus l’afficher.')) return;
        KJ.session.supprimerImageMJ(im.id)
          .then(() => { imgCompte = (imgCompte || []).filter(x => x.id !== im.id); majPanneau(); })
          .catch(() => toast('Suppression impossible — vérifie ta connexion.'));
      });
      g.appendChild(b);
    }

    function grille() {
      zone.innerHTML = '';
      const filtre = imgFiltre.trim().toLowerCase();
      const g = document.createElement('div'); g.className = 'palette';

      if (filtre) {
        const images = imgCatalogue.concat(imgCompte || []).filter(im =>
          (im.nom || '').toLowerCase().includes(filtre)
          || (im.fichier || '').toLowerCase().includes(filtre));
        t.textContent = images.length
          ? images.length + ' image' + (images.length > 1 ? 's' : '') + ' — clique sur le plan pour poser son icône.'
          : 'Aucune image ne correspond à « ' + imgFiltre.trim() + ' ».';
        for (const im of images) tuile(im, g);

      } else if (imgChemin[0] === MES_IMAGES) {
        /* Dossiers dans « Mes images » : déclarés dans le compte (ils existent même
           vides) + déduits des images. Glisser une vignette sur un dossier l'y range. */
        const sousChemin = imgChemin.slice(1);
        const cibleDepot = (b, dossierCible) => {
          b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('actif'); });
          b.addEventListener('dragleave', () => b.classList.remove('actif'));
          b.addEventListener('drop', (e) => {
            e.preventDefault(); b.classList.remove('actif');
            deplacerImageCompte(e.dataTransfer.getData('text/plain'), dossierCible);
          });
        };
        const imp = document.createElement('button'); imp.className = 'dossier';
        imp.innerHTML = '<span class="ic-dossier">↑</span><span>Importer ici</span>';
        imp.addEventListener('click', () => importerImagesCompte(sousChemin.join('/')));
        g.appendChild(imp);
        if (!sousChemin.length) {
          const nd = document.createElement('button'); nd.className = 'dossier';
          nd.innerHTML = '<span class="ic-dossier">🗀＋</span><span>Nouveau dossier</span>';
          nd.addEventListener('click', () => {
            const nom = (prompt('Nom du dossier :') || '').trim().replace(/\//g, '-');
            if (!nom) return;
            KJ.session.declarerDossierImagesMJ(nom).then(() => {
              if (!imgDossiersCompte.includes(nom)) imgDossiersCompte.push(nom);
              imgChemin = [MES_IMAGES, nom]; majPanneau();
            }).catch(() => toast('Création impossible — connecte-toi (🛡 Espace MJ).'));
          });
          g.appendChild(nd);
        } else {
          // remonter d'un cran — et cible de dépôt pour sortir une image du dossier
          const up = document.createElement('button'); up.className = 'dossier';
          up.innerHTML = '<span class="ic-dossier">⬆</span><span>Dossier parent</span>';
          up.addEventListener('click', () => { imgChemin = imgChemin.slice(0, -1); majPanneau(); });
          cibleDepot(up, sousChemin.slice(0, -1).join('/'));
          g.appendChild(up);
        }
        const arbo = S.arboreImages(imgCompte || [], sousChemin);
        const dossiers = arbo.dossiers.slice();
        if (!sousChemin.length)
          for (const d of imgDossiersCompte) if (!dossiers.includes(d)) dossiers.push(d);
        dossiers.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
        for (const d of dossiers) {
          const b = document.createElement('button'); b.className = 'dossier';
          b.innerHTML = `<span class="ic-dossier">🗀</span><span>${d}</span>`;
          b.addEventListener('click', () => { imgChemin = imgChemin.concat([d]); majPanneau(); });
          cibleDepot(b, sousChemin.concat([d]).join('/'));
          b.addEventListener('contextmenu', (e) => {   // clic droit : supprimer un dossier vide
            e.preventDefault();
            const chemin = sousChemin.concat([d]).join('/');
            const plein = (imgCompte || []).some(x => x.dossier === chemin || (x.dossier || '').indexOf(chemin + '/') === 0);
            if (plein) { toast('Dossier non vide : déplace ou supprime ses images d’abord.'); return; }
            if (sousChemin.length || !imgDossiersCompte.includes(d)) return;
            if (!confirm('Supprimer le dossier vide « ' + d + ' » ?')) return;
            KJ.session.oublierDossierImagesMJ(d).then(() => {
              imgDossiersCompte = imgDossiersCompte.filter(x => x !== d); majPanneau();
            }).catch(() => toast('Suppression impossible.'));
          });
          g.appendChild(b);
        }
        for (const im of arbo.images) tuile(im, g);
        t.textContent = imgCompte === null
          ? 'Connecte-toi (bibliothèque → 🛡 Espace MJ), puis reviens ici importer tes images.'
          : ((imgCompte.length || sousChemin.length || dossiers.length)
            ? 'Glisse une vignette sur un dossier pour l’y ranger. Clic droit sur une vignette : la supprimer.'
            : 'Aucune image pour l’instant : « Importer ici » (elles sont compressées automatiquement).');

      } else {
        const { dossiers, images } = S.arboreImages(imgCatalogue, imgChemin);
        if (!imgChemin.length) {
          const b = document.createElement('button'); b.className = 'dossier';
          b.innerHTML = '<span class="ic-dossier">👤</span><span>Mes images</span>';
          b.addEventListener('click', () => { imgChemin = [MES_IMAGES]; majPanneau(); });
          g.appendChild(b);
        }
        t.textContent = (!dossiers.length && !images.length && imgChemin.length) ? 'Dossier vide.'
          : 'Choisis une image (ou un dossier), puis clique sur le plan pour poser son icône.';
        for (const d of dossiers) {
          const b = document.createElement('button'); b.className = 'dossier';
          b.innerHTML = `<span class="ic-dossier">🗀</span><span>${d}</span>`;
          b.addEventListener('click', () => { imgChemin = imgChemin.concat([d]); majPanneau(); });
          g.appendChild(b);
        }
        for (const im of images) tuile(im, g);
      }
      zone.appendChild(g);
    }
    rech.addEventListener('input', () => { imgFiltre = rech.value; grille(); });
    grille();
  }

  /* Import d'images dans le compte MJ : réduction ~512 px + JPEG compressé AVANT
     l'envoi — le but est un visuel d'ambiance, pas une affiche ; la place de la
     base est réservée en priorité aux cartes. */
  function comprimerImage(fichier) {
    return new Promise((res, rej) => {
      const lecteur = new FileReader();
      lecteur.onload = () => {
        const img = new Image();
        img.onload = () => {
          const MAX = 512;
          const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * s));
          c.height = Math.max(1, Math.round(img.naturalHeight * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', .62));
        };
        img.onerror = () => rej(new Error('image illisible : ' + fichier.name));
        img.src = lecteur.result;
      };
      lecteur.onerror = () => rej(new Error('lecture impossible : ' + fichier.name));
      lecteur.readAsDataURL(fichier);
    });
  }
  function deplacerImageCompte(id, dossier) {
    if (!id) return;
    KJ.session.modifierImageMJ(id, { dossier: dossier || '' })
      .then(() => {
        const im = (imgCompte || []).find(x => x.id === id);
        if (im) im.dossier = dossier || '';
        majPanneau();
        toast(dossier ? 'Image rangée dans « ' + dossier + ' ».' : 'Image sortie du dossier.');
      })
      .catch(() => toast('Déplacement impossible — vérifie ta connexion.'));
  }

  function importerImagesCompte(dossier) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.addEventListener('change', () => {
      const fichiers = Array.from(inp.files || []);
      if (!fichiers.length) return;
      toast('Import de ' + fichiers.length + ' image' + (fichiers.length > 1 ? 's' : '') + '…');
      let chaine = Promise.resolve(0);
      for (const f of fichiers) {
        chaine = chaine.then((n) =>
          comprimerImage(f)
            .then(data => KJ.session.enregistrerImageMJ(f.name.replace(/\.[^.]+$/, ''), data, dossier || ''))
            .then(() => n + 1)
            .catch(e => { toast('Échec — ' + (e && e.message || e)); return n; }));
      }
      chaine.then((n) => {
        if (!n) return;
        return KJ.session.listerImagesMJ()
          .then(l => { imgCompte = l; majPanneau(); toast(n + ' image' + (n > 1 ? 's' : '') + ' importée' + (n > 1 ? 's' : '') + ' dans ton compte.'); });
      });
    });
    inp.click();
  }
  /* Fil d'ariane générique (dossiers d'images) : chemin = tableau de segments,
     onNav(nouveauChemin) est appelé au clic sur un cran (y compris la racine). */
  function filAriane(chemin, onNav) {
    const fil = document.createElement('div'); fil.className = 'fil-ariane';
    const racine = bouton('🗀 Toutes', () => onNav([]));
    if (!chemin.length) racine.classList.add('actif');
    fil.appendChild(racine);
    chemin.forEach((seg, i) => {
      const sep = document.createElement('span'); sep.className = 'fil-sep'; sep.textContent = '›';
      fil.appendChild(sep);
      const b = bouton(seg, () => onNav(chemin.slice(0, i + 1)));
      if (i === chemin.length - 1) b.classList.add('actif');
      fil.appendChild(b);
    });
    return fil;
  }

  function majCalques() {
    const c = $('calques'); c.innerHTML = '';
    const lignes = [['grille', 'Grille']].concat(M.CALQUES.map(x => [x.id, x.nom]));
    for (const [id, nom] of lignes) {
      const l = document.createElement('label'); l.className = 'coche';
      const i = document.createElement('input'); i.type = 'checkbox'; i.checked = calquesVis[id] !== false;
      i.addEventListener('change', () => { calquesVis[id] = i.checked; dessiner(); });
      l.appendChild(i); l.appendChild(document.createTextNode(nom));
      c.appendChild(l);
    }
  }

  /* Changer la taille des cases : une carte est pensée en CASES, pas en pixels.
     On propose donc de convertir toute la géométrie (× nouvelle/ancienne) pour
     qu'une salle de 5 × 4 cases reste une salle de 5 × 4 cases — c'est ce qui
     évitait de désaligner une carte en changeant d'échelle en cours de route. */
  function changerCase(nouv) {
    const ancien = carte.grille.cell;
    carte.grille.cell = nouv;
    if (ancien && nouv && nouv !== ancien && carte.elements.length
      && confirm('Adapter toute la carte à la nouvelle taille de case ?\n\n'
        + 'OUI (conseillé) : tout est converti, chaque salle garde son nombre de cases.\n'
        + 'NON : rien ne bouge en pixels — les éléments ne tomberont plus sur la grille.')) {
      const k = nouv / ancien, n = (v) => Math.round(v * k);
      carte.taille.w = n(carte.taille.w); carte.taille.h = n(carte.taille.h);
      for (const e of carte.elements) {
        for (const cle of ['x', 'y', 'x1', 'y1', 'x2', 'y2'])
          if (e[cle] !== undefined) e[cle] = n(e[cle]);
        if (e.type === 'piece' || e.type === 'secret' || e.type === 'objet') { e.w = n(e.w); e.h = n(e.h); }
        if (e.l) e.l = Math.max(4, n(e.l));
        if (e.ep) e.ep = Math.max(1, Math.round(e.ep * k));
      }
    }
    majCartePanneau();
  }

  /* Recoller tous les éléments à la grille : chaque BORD est aimanté à la ligne la
     plus proche (jamais x et largeur séparément) — deux éléments qui partageaient
     une coordonnée la partagent encore, donc les portes restent sur leurs murs.
     Rattrape une carte dessinée sur une autre échelle de cases. */
  function realignerGrille() {
    const cel = cell();
    if (!cel) { toast('Pas de grille sur cette carte (case = 0).'); return; }
    if (!confirm('Réaligner tous les éléments sur la grille de ' + cel + ' px ?\n\n'
      + 'Chaque bord rejoint la ligne de grille la plus proche (au pire une demi-case).')) return;
    const s = (v, pas) => Math.round(v / (pas || cel)) * (pas || cel);
    for (const e of carte.elements) {
      if (e.type === 'piece' || e.type === 'secret') {
        const x2 = s(e.x + e.w), y2 = s(e.y + e.h);
        e.x = s(e.x); e.y = s(e.y);
        e.w = Math.max(cel, x2 - e.x); e.h = Math.max(cel, y2 - e.y);
      } else if (e.type === 'mur') {
        e.x1 = s(e.x1); e.y1 = s(e.y1); e.x2 = s(e.x2); e.y2 = s(e.y2);
      } else if (e.type === 'porte' || e.type === 'fenetre') {
        // l'axe posé SUR le mur rejoint la case entière (les murs y sont),
        // la position le long du mur la demi-case ; ouverture = au moins une case
        if (e.o === 'h') { e.y = s(e.y); e.x = s(e.x, cel / 2); }
        else { e.x = s(e.x); e.y = s(e.y, cel / 2); }
        if (e.l) e.l = Math.max(cel, s(e.l));
      }
    }
    apresModif(); dessiner(); majCartePanneau();
    toast('Tout est réaligné sur la grille.');
  }

  function majCartePanneau() {
    const c = $('carte-props'); c.innerHTML = '';
    /* La campagne sert de dossier : les cartes en sont regroupées partout
       (bibliothèque, sélecteur de la table de jeu). */
    const camp = document.createElement('input');
    camp.type = 'text'; camp.value = carte.campagne || '';
    camp.placeholder = M.SANS_CAMPAGNE;
    camp.setAttribute('list', 'liste-campagnes');
    camp.addEventListener('change', () => {
      carte.campagne = camp.value.trim();
      apresModif(); dessiner();
      toast(carte.campagne ? 'Carte rangée dans « ' + carte.campagne + ' ».'
                           : 'Carte sans campagne.');
    });
    let dl = $('liste-campagnes');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'liste-campagnes'; document.body.appendChild(dl); }
    dl.innerHTML = campagnesConnues.filter(x => x !== M.SANS_CAMPAGNE)
      .map(x => '<option value="' + x.replace(/"/g, '&quot;') + '">').join('');
    c.appendChild(champ('Campagne', camp));
    /* La taille de la carte se pense en cases (le pixel n'est qu'un détail
       technique) : deux champs explicites quand il y a une grille, les pixels
       en secours pour les cartes sans grille (extérieurs). */
    if (carte.grille.cell) {
      c.appendChild(champ('Largeur case', inputNum(
        Math.round(carte.taille.w / carte.grille.cell),
        v => { carte.taille.w = Math.max(4, Math.round(v)) * carte.grille.cell; majCartePanneau(); })));
      c.appendChild(champ('Hauteur case', inputNum(
        Math.round(carte.taille.h / carte.grille.cell),
        v => { carte.taille.h = Math.max(4, Math.round(v)) * carte.grille.cell; majCartePanneau(); })));
    } else {
      c.appendChild(champ('Largeur (px)', inputNum(carte.taille.w, v => carte.taille.w = Math.max(100, v))));
      c.appendChild(champ('Hauteur (px)', inputNum(carte.taille.h, v => carte.taille.h = Math.max(100, v))));
    }
    c.appendChild(champ('Case (px)', inputNum(carte.grille.cell, v => changerCase(Math.max(0, v)))));
    c.appendChild(champ('Case (m)', inputNum(carte.grille.metres, v => carte.grille.metres = v || 1.5, .1)));
    if (carte.grille.cell)
      c.appendChild(bouton('⌗ Réaligner tout sur la grille', realignerGrille));
    c.appendChild(bouton('🖱 Tout sélectionner (Ctrl+A)', toutSelectionner));
    const info = document.createElement('p'); info.className = 'aide';
    info.textContent = carte.grille.cell
      ? `Plan tactique : ${(carte.taille.w / carte.grille.cell * carte.grille.metres).toFixed(0)} × `
        + `${(carte.taille.h / carte.grille.cell * carte.grille.metres).toFixed(0)} m.`
      : 'Case à 0 : carte d’extérieur, sans grille ni aimantation.';
    c.appendChild(info);
  }

  function majCle() {
    const c = $('cle'); c.innerHTML = '';
    const nums = carte.elements.filter(e => e.type === 'numero').map(e => +e.num).sort((a, b) => a - b);
    // entrées orphelines : le numéro a été supprimé du plan, la description restait
    const orphelines = carte.cle.filter(k => !nums.includes(+k.num));
    if (!nums.length) {
      c.innerHTML = '<p class="vide">Pose des numéros sur le plan pour construire la clé.</p>';
    }
    for (const n of nums) {
      let entree = carte.cle.find(k => +k.num === n);
      if (!entree) { entree = { num: n, titre: '', desc: '' }; carte.cle.push(entree); }
      const l = document.createElement('div'); l.className = 'cle-ligne';
      const b = document.createElement('div'); b.className = 'num'; b.textContent = n;
      const col = document.createElement('div');
      col.style.cssText = 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px';
      const i = document.createElement('input');
      i.type = 'text'; i.placeholder = 'Nom du lieu'; i.value = entree.titre || '';
      i.addEventListener('change', () => { entree.titre = i.value; enregistrerPlusTard(); });
      // la description part dans les exports et les PDF de Codex : elle doit être saisissable ici
      const d = document.createElement('textarea');
      d.placeholder = 'Description pour le MJ…'; d.rows = 2; d.value = entree.desc || '';
      d.style.cssText = 'background:#241d14;border:1px solid var(--bord-clair);border-radius:4px;'
        + 'color:var(--encre);padding:4px 6px;font:12.5px var(--serif);resize:vertical';
      d.addEventListener('change', () => { entree.desc = d.value; enregistrerPlusTard(); });
      col.appendChild(i); col.appendChild(d);
      l.appendChild(b); l.appendChild(col); c.appendChild(l);
    }
    if (orphelines.length) {
      const av = document.createElement('p'); av.className = 'aide';
      av.innerHTML = orphelines.length + ' entrée(s) sans numéro sur le plan ('
        + orphelines.map(o => o.num).join(', ') + ').';
      c.appendChild(av);
      c.appendChild(bouton('✕ Retirer ces entrées', () => {
        carte.cle = carte.cle.filter(k => nums.includes(+k.num));
        apresModif(); majCle();
      }, 'danger'));
    }
    const a = document.createElement('p'); a.className = 'aide';
    a.textContent = 'Cette clé accompagne la carte dans les exports et les PDF de Codex.';
    c.appendChild(a);
  }

  /* ---------------- enregistrement ----------------
     L'éditeur enregistre tout seul après chaque modification ; le bouton
     « Enregistrer » force l'écriture immédiate et le confirme visiblement. */
  let tmr = null;
  function toast(txt) {
    const t = $('toast');
    t.textContent = txt; t.classList.add('vu');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('vu'), 1800);
  }
  const RATE = Symbol('delai-depasse');
  /* Écrit la carte : bibliothèque en ligne (compte MJ connecté) et/ou fichier
     cartes/<id>.json du dossier lié — voir stockage.enregistrerCarte. En lecture
     seule (ni l'un ni l'autre), on le dit franchement plutôt que d'enregistrer dans
     un stockage invisible — c'est exactement ce faux filet qui faisait croire à des
     modifications enregistrées puis introuvables ailleurs. */
  function ecrire() {
    return S.avecDelai(S.enregistrerCarte(carte), 9000, RATE).then((r) => {
      if (r === RATE) throw new Error('l’enregistrement n’a pas répondu');
      try { localStorage.setItem('kj-derniere-carte', carte.id); } catch (e) {}
      majLienJouer();
      $('etat').textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR')
        + ' (bibliothèque en ligne et/ou dossier lié)';
    }).catch(e => {
      const lectureSeule = e && /lecture seule/.test(e.message || '');
      $('etat').textContent = lectureSeule
        ? 'Lecture seule : ni compte MJ connecté, ni dossier lié — rien n’a été enregistré.'
        : 'Échec de l’enregistrement : ' + (e && e.message || e);
      throw e;
    });
  }
  function enregistrerPlusTard() {
    clearTimeout(tmr);
    $('etat').textContent = 'Modifié…';
    tmr = setTimeout(() => { tmr = null; ecrire().catch(() => {}); }, 500);
  }
  /* Filet de sécurité : sans ça, une modification suivie de près par un clic sur
     « ▶ Jouer »/« ☰ Cartes », un rechargement ou une fermeture d'onglet perd les
     500 dernières millisecondes d'édition — le minuteur n'a pas eu le temps de se
     déclencher. visibilitychange se déclenche même quand l'onglet passe en arrière-
     plan (mobile compris) ; pagehide couvre la navigation qui ne masque pas l'onglet. */
  function forcerEnregistrement() {
    if (tmr) { clearTimeout(tmr); tmr = null; ecrire().catch(() => {}); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') forcerEnregistrement();
  });
  window.addEventListener('pagehide', forcerEnregistrement);
  /* Au tout premier clic explicite sur Enregistrer (jamais depuis l'enregistrement
     automatique, qui n'a pas de geste utilisateur pour autoriser le sélecteur de
     dossier), propose de lier le dossier plateforme/ sur ce PC — un seul geste,
     pas un bouton séparé à comprendre. Un refus (Échap sur le sélecteur) n'est
     redemandé qu'à la prochaine visite de la page, pas à chaque clic. */
  function enregistrerMaintenant() {
    clearTimeout(tmr);
    // avec un compte MJ connecté, l'enregistrement va dans la bibliothèque en ligne :
    // rien à lier, ça marche dans tous les navigateurs. Le dossier lié (Chromium)
    // reste proposé sinon — et alimente de toute façon la copie git quand il existe.
    const pConnecte = (window.KJ && KJ.session && KJ.session.configuree() && KJ.session.mjProbable())
      ? KJ.session.quiEstConnecte().catch(() => null) : Promise.resolve(null);
    S.avecDelai(pConnecte, 8000, null).then(connecte => {
      if (connecte)
        return ecrire().then(() => toast('Carte enregistrée dans ta bibliothèque en ligne.'));
      if (!S.depotPrisEnCharge()) {
        toast('Connecte-toi à ton compte MJ (bibliothèque → 🛡 Espace MJ) pour enregistrer '
          + 'tes cartes en ligne — disponible dans tous les navigateurs.');
        return;
      }
      // le sélecteur de dossier n'a le droit de s'ouvrir que depuis un vrai clic :
      // c'est donc ici, et seulement ici, qu'on propose de lier le dossier.
      return S.avecDelai(S.dossierDepotActif(false), 1500, null)
        .then(poignee => poignee || S.lierDossierDepot())
        .then(() => ecrire())
        .then(() => toast('Carte enregistrée.'));
    }).catch((e) => {
      if (e && e.name === 'AbortError') return;   // dossier non choisi : silence
      toast('Échec de l’enregistrement — vérifie ta connexion ou le dossier choisi.');
    });
  }
  function majLienJouer() { $('b-jouer').href = 'table.html?carte=' + encodeURIComponent(carte.id); }
  /* Un seul point d'entrée après chaque modification : complète la clé,
     enregistre l'état dans l'historique (instantané APRÈS modification), sauvegarde. */
  function apresModif() { majCle(); pousser(); enregistrerPlusTard(); }

  /* ---------------- export scène (table de jeu) ---------------- */
  function blocScene() {
    const svg = R.svgString(carte, { vueMJ: true, grille: true })
      .replace('<svg ', `<svg width="${carte.taille.w}" height="${carte.taille.h}" `);
    return `<div class="scene" data-id="${S.slug(carte.nom)}" data-nom="${R.esc(carte.nom)}" `
      + `data-w="${carte.taille.w}" data-h="${carte.taille.h}" data-cell="${carte.grille.cell}">\n`
      + svg + `\n</div>`;
  }

  /* ---------------- barre d'outils ---------------- */
  function construireOutils() {
    const c = $('outils'); c.innerHTML = '';
    for (const o of OUTILS) {
      const b = document.createElement('button');
      b.innerHTML = `<b>${o.ic}</b><span>${o.nom}</span>`;
      b.title = o.nom + ' (' + o.k.toUpperCase() + ')';
      b.dataset.outil = o.id;
      if (o.id === outil) b.classList.add('actif');
      b.addEventListener('click', () => choisirOutil(o.id));
      c.appendChild(b);
    }
  }
  /* Le point de départ d'un glisser est-il sur la sélection multiple ?
     (boîte de chaque élément sélectionné, avec une petite marge de prise) */
  function dansSelection(pt) {
    return selMulti.some((id) => {
      const el = M.trouver(carte, id); if (!el) return false;
      const b = M.boite(el);
      return pt.x >= b.x - 6 && pt.x <= b.x + b.w + 6 && pt.y >= b.y - 6 && pt.y <= b.y + b.h + 6;
    });
  }

  /* Ctrl+A (ou le bouton du panneau Carte) : tout sélectionner d'un coup —
     l'outil 🖱 fait le reste (glisser pour déplacer, Suppr, Échap). */
  function toutSelectionner() {
    choisirOutil('multi');   // vide selMulti, donc on le remplit après
    selMulti = carte.elements.map(e => e.id);
    toast('Tout est sélectionné (' + selMulti.length + ' éléments) : '
      + 'glisse la sélection pour déplacer — Échap pour terminer.');
    majPanneau(); dessinerEdition();
  }

  function choisirOutil(id) {
    if (id === 'construire') id = dernierConstruire;
    outil = id;
    if (groupeDe(id) === 'construire') dernierConstruire = id;
    // un outil de pose affiche sa palette : garder un élément sélectionné la masquerait
    if (id !== 'select' && id !== 'multi') sel = null;
    selMulti = []; canevas.classList.toggle('lasso', id === 'multi');
    const grp = groupeDe(id);
    document.querySelectorAll('#outils button').forEach(b => b.classList.toggle('actif', b.dataset.outil === grp));
    accSurbrillance = null;
    canevas.classList.toggle('pan', id === 'select');
    majPanneau(); dessinerEdition();
  }

  /* ---------------- clavier ---------------- */
  window.addEventListener('keydown', (e) => {
    const dansChamp = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Shift') libre = true;
    if (dansChamp) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); annuler(); return; }
    if (ctrl && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); refaire(); return; }
    if (ctrl && (e.key === 's' || e.key === 'S')) { e.preventDefault(); enregistrerMaintenant(); return; }
    if (ctrl && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); toutSelectionner(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selMulti.length) {
      e.preventDefault();
      if (!confirm('Supprimer les ' + selMulti.length + ' éléments sélectionnés ?')) return;
      for (const id of selMulti) M.supprimer(carte, id);
      selMulti = []; sel = null; majPanneau(); apresModif(); dessiner();
      return;
    }
    const el = sel && M.trouver(carte, sel);
    if ((e.key === 'Delete' || e.key === 'Backspace') && el) {
      e.preventDefault(); M.supprimer(carte, el.id); sel = null; majPanneau(); apresModif(); dessiner(); return;
    }
    if ((e.key === 'r' || e.key === 'R') && el && el.type === 'objet') {
      el.rot = ((el.rot || 0) + 15) % 360; apresModif(); dessiner(); majPanneau(); return;
    }
    if ((e.key === 'x' || e.key === 'X') && el && el.type === 'porte') {
      el.sens = -el.sens; apresModif(); dessiner(); return;
    }
    if (e.key === 'Escape') { selMulti = []; sel = null; majPanneau(); dessinerEdition(); return; }
    const o = OUTILS.find(x => x.k === e.key.toLowerCase());
    if (o) choisirOutil(o.id);
    else if (RACCOURCIS[e.key.toLowerCase()]) choisirOutil(RACCOURCIS[e.key.toLowerCase()]);
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') libre = false; });

  /* ---------------- démarrage ---------------- */
  function tout() {
    $('nom-carte').value = carte.nom;
    majLienJouer();
    dessiner(); majPanneau(); majCalques(); majCartePanneau(); majCle();
  }

  $('nom-carte').addEventListener('change', (e) => { carte.nom = e.target.value || 'Sans titre'; enregistrerPlusTard(); });
  $('b-enregistrer').addEventListener('click', enregistrerMaintenant);
  $('b-undo').addEventListener('click', annuler);
  $('b-redo').addEventListener('click', refaire);
  $('b-cadrer').addEventListener('click', cadrer);
  $('b-panneau').addEventListener('click', () => {
    $('panneau').classList.toggle('replie');
    setTimeout(dessinerEdition, 60);
  });
  $('b-vue').addEventListener('click', () => {
    vueMJ = !vueMJ;
    $('b-vue').classList.toggle('actif', vueMJ);
    $('b-vue').textContent = vueMJ ? 'Vue MJ' : 'Vue joueurs';
    dessiner();
  });
  $('b-json').addEventListener('click', () => S.exporterJSON(carte));
  $('b-svg').addEventListener('click', () => S.exporterSVG(carte, { vueMJ: vueMJ, grille: calquesVis.grille }));
  $('b-scene').addEventListener('click', () => {
    const txt = blocScene();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt)
        .then(() => $('etat').textContent = 'Bloc de scène copié : collez-le dans la table de jeu.')
        .catch(() => S.telecharger(S.slug(carte.nom) + '-scene.html', txt, 'text/html'));
    } else S.telecharger(S.slug(carte.nom) + '-scene.html', txt, 'text/html');
  });
  window.addEventListener('resize', () => dessinerEdition());

  function demarrer(c) {
    carte = c; sel = null; histo = []; hpos = -1; pousser();
    tout(); cadrer();
    chargerDestinations().then(() => { if (sel) majPanneau(); }).catch(() => {});
    chargerImages().then(() => { if (outil === 'image') majPanneau(); }).catch(() => {});
  }

  const p = new URLSearchParams(location.search);
  const neuve = () => M.nouvelleCarte({ nom: 'Nouvelle carte', w: 560, h: 466, cell: 40 });
  // ?depot=xxx.json : ancienne forme des liens, gardée valide (les favoris existent)
  const idDepot = (p.get('depot') || '').replace(/\.json$/i, ''), id = p.get('id');
  if (id === 'nouveau') {
    demarrer(neuve());
  } else {
    let cible = idDepot || id;
    try { cible = cible || localStorage.getItem('kj-derniere-carte'); } catch (e) {}
    (cible ? S.avecDelai(S.chargerCarte(cible), 4000, null) : Promise.resolve(null))
      .then(c => demarrer(c || neuve()))
      .catch(() => demarrer(neuve()));
  }
  construireOutils();

  S.gererServiceWorker();
})();
