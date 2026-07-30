/* ============================================================
   Cartographe Knight — éditeur
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
  let vueMJ = true;
  let cam = { s: 1, tx: 0, ty: 0 };
  const calquesVis = { grille: true, structure: true, mobilier: true, annotations: true, secrets: true };

  const OUTILS = [
    { id: 'select',  ic: '✥', nom: 'Choisir',  k: 'v' },
    { id: 'piece',   ic: '▭', nom: 'Pièce',    k: 'p' },
    { id: 'mur',     ic: '▬', nom: 'Mur',      k: 'm' },
    { id: 'porte',   ic: '◠', nom: 'Porte',    k: 'd' },
    { id: 'fenetre', ic: '▥', nom: 'Fenêtre',  k: 'f' },
    { id: 'objet',   ic: '⬓', nom: 'Objet',    k: 'o' },
    { id: 'numero',  ic: '①', nom: 'Numéro',   k: 'n' },
    { id: 'texte',   ic: 'T', nom: 'Texte',    k: 't' },
    { id: 'lumiere', ic: '✷', nom: 'Lumière',  k: 'l' },
    { id: 'secret',  ic: '⌗', nom: 'Secret',   k: 's' },
    { id: 'portail', ic: '◈', nom: 'Portail',  k: 'w' },
  ];

  /* Cartes disponibles comme destinations de portail (bibliothèque + campagne). */
  let destinations = [];
  function chargerDestinations() {
    return Promise.all([
      S.avecDelai(S.lister(), 1500, []),
      S.avecDelai(S.catalogueDepot(), 2500, [])
        .then(cat => Promise.all(cat.map(e => S.chargerDepot(e.fichier).catch(() => null))))
        .then(l => l.filter(Boolean)),
    ]).then(([loc, dep]) => {
      const vus = new Set();
      destinations = [];
      for (const c of loc.concat(dep)) {
        if (vus.has(c.id) || c.id === carte.id) continue;
        vus.add(c.id);
        destinations.push({ id: c.id, nom: c.nom });
      }
    });
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
      s += `<rect class="cadre" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" `
         + `style="stroke-width:${1.5 * k}"/>`;
      if (M.redimensionnable(el)) {
        const r = 5 * k;
        const coins = [['nw', b.x, b.y], ['ne', b.x + b.w, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h]];
        for (const [c, x, y] of coins)
          s += `<circle class="poignee" data-coin="${c}" cx="${x}" cy="${y}" r="${r}" `
             + `style="stroke-width:${1.5 * k}"/>`;
      }
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
      accSurbrillance = null, libre = false, pointeurs = new Map(), pinch = null;

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
    } else if ((mode === 'move' && depart.bouge) || mode === 'resize') {
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

  function redimensionner(el, coin, pt) {
    const b = depart.b;
    let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
    const px = acc(pt.x), py = acc(pt.y);
    if (coin.includes('w')) x1 = px; else x2 = px;
    if (coin.includes('n')) y1 = py; else y2 = py;
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.max(Math.abs(x2 - x1), 6), h = Math.max(Math.abs(y2 - y1), 6);
    if (el.type === 'objet') { el.x = x + w / 2; el.y = y + h / 2; el.w = w; el.h = h; }
    else { el.x = x; el.y = y; el.w = w; el.h = h; }
  }

  function poser(pt) {
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

  function majPanneau() {
    const p = $('props'); p.innerHTML = '';
    const el = sel && M.trouver(carte, sel);
    $('t-props').textContent = el ? 'Élément — ' + el.type : 'Élément';

    if (outil === 'objet' && !el) { palette(p); return; }
    if (!el) {
      p.innerHTML = '<p class="vide">Aucune sélection.</p>'
        + '<p class="aide">Choisis un outil à gauche, puis trace ou pose sur le plan. '
        + 'Clic droit sur un élément pour le supprimer.</p>';
      if (outil === 'objet') palette(p);
      return;
    }

    if (el.type === 'piece') {
      p.appendChild(champ('Nom', inputTxt(el.nom, v => el.nom = v)));
      p.appendChild(champ('X / Y', duo(el.x, el.y, (a, b) => { el.x = a; el.y = b; })));
      p.appendChild(champ('L / H', duo(el.w, el.h, (a, b) => { el.w = a; el.h = b; })));
      p.appendChild(champ('Murs (ép.)', inputNum(el.ep === undefined ? 5 : el.ep, v => el.ep = Math.max(1, v))));
      p.appendChild(champ('Cases', txtInfo(`${(el.w / (cell() || 40)).toFixed(1)} × ${(el.h / (cell() || 40)).toFixed(1)}`)));
      p.appendChild(champ('Mètres', txtInfo(`${(el.w / (cell() || 40) * carte.grille.metres).toFixed(1)} × ${(el.h / (cell() || 40) * carte.grille.metres).toFixed(1)} m`)));
    } else if (el.type === 'mur') {
      p.appendChild(champ('Épaisseur', inputNum(el.ep, v => el.ep = Math.max(1, v))));
    } else if (el.type === 'porte') {
      p.appendChild(champ('Style', select(el.style, [['simple', 'Simple'], ['double', 'Double'], ['secrete', 'Secrète']], v => el.style = v)));
      p.appendChild(champ('Largeur', inputNum(el.l, v => el.l = Math.max(8, v))));
      p.appendChild(champ('Orientation', select(el.o, [['h', 'Horizontale'], ['v', 'Verticale']], v => el.o = v)));
      p.appendChild(bouton('⇄ Inverser l’ouverture (X)', () => { el.sens = -el.sens; apresModif(); dessiner(); }));
    } else if (el.type === 'fenetre') {
      p.appendChild(champ('Largeur', inputNum(el.l, v => el.l = Math.max(8, v))));
      p.appendChild(champ('Orientation', select(el.o, [['h', 'Horizontale'], ['v', 'Verticale']], v => el.o = v)));
    } else if (el.type === 'objet') {
      p.appendChild(champ('Symbole', select(el.sym, M.SYMBOLES.map(s => [s.id, s.nom]), v => {
        const s = M.symbole(v); el.sym = v; el.w = s.w; el.h = s.h;
      })));
      p.appendChild(champ('L / H', duo(el.w, el.h, (a, b) => { el.w = a; el.h = b; })));
      p.appendChild(champ('Rotation', inputNum(el.rot || 0, v => el.rot = v, 15)));
      p.appendChild(bouton('↻ Tourner de 15° (R)', () => { el.rot = ((el.rot || 0) + 15) % 360; apresModif(); dessiner(); }));
    } else if (el.type === 'numero') {
      p.appendChild(champ('Numéro', inputNum(el.num, v => el.num = v)));
    } else if (el.type === 'texte') {
      p.appendChild(champ('Texte', inputTxt(el.texte, v => el.texte = v)));
      p.appendChild(champ('Style', select(el.style, [['lbl', 'Libellé de salle'], ['tiny', 'Petite note']], v => el.style = v)));
      p.appendChild(champ('Rotation', inputNum(el.rot || 0, v => el.rot = v, 15)));
    } else if (el.type === 'portail') {
      if (!destinations.length) {
        p.appendChild(document.createRange().createContextualFragment(
          '<p class="aide">Aucune autre carte disponible : crée d’abord la carte de destination, '
          + 'puis reviens poser le portail.</p>'));
      } else {
        p.appendChild(champ('Mène à', select(el.vers, destinations.map(d => [d.id, d.nom]), v => {
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
      p.appendChild(champ('L / H', duo(el.w, el.h, (a, b) => { el.w = a; el.h = b; })));
      p.appendChild(document.createRange().createContextualFragment(
        '<p class="aide">Les secrets ne sont visibles qu’en vue MJ : ils disparaissent de la vue joueurs et des exports en vue joueurs.</p>'));
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
    for (const s of M.SYMBOLES) {
      const b = document.createElement('button');
      b.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${R.SYM[s.id] || ''}</svg>`
        + `<span>${s.nom}</span>`;
      if (s.id === symChoisi) b.classList.add('actif');
      b.addEventListener('click', () => { symChoisi = s.id; majPanneau(); });
      g.appendChild(b);
    }
    p.appendChild(g);
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

  function majCartePanneau() {
    const c = $('carte-props'); c.innerHTML = '';
    c.appendChild(champ('Largeur', inputNum(carte.taille.w, v => carte.taille.w = Math.max(100, v))));
    c.appendChild(champ('Hauteur', inputNum(carte.taille.h, v => carte.taille.h = Math.max(100, v))));
    c.appendChild(champ('Case (px)', inputNum(carte.grille.cell, v => carte.grille.cell = Math.max(0, v))));
    c.appendChild(champ('Case (m)', inputNum(carte.grille.metres, v => carte.grille.metres = v || 1.5, .1)));
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
  function ecrire() {
    return S.enregistrer(carte).then(() => {
      try { localStorage.setItem('kj-derniere-carte', carte.id); } catch (e) {}
      $('etat').textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR');
      majLienJouer();
    }).catch(e => { $('etat').textContent = 'Échec de l’enregistrement : ' + e; throw e; });
  }
  function enregistrerPlusTard() {
    clearTimeout(tmr);
    $('etat').textContent = 'Modifié…';
    tmr = setTimeout(() => ecrire().catch(() => {}), 500);
  }
  function enregistrerMaintenant() {
    clearTimeout(tmr);
    ecrire().then(() => toast('Carte enregistrée dans la bibliothèque.'))
            .catch(() => toast('Échec de l’enregistrement.'));
  }
  function majLienJouer() { $('b-jouer').href = 'table.html?carte=' + encodeURIComponent(carte.id); }
  /* Un seul point d'entrée après chaque modification : complète la clé,
     enregistre l'état dans l'historique (instantané APRÈS modification), sauvegarde. */
  function apresModif() { majCle(); pousser(); enregistrerPlusTard(); }

  /* ---------------- export scène (table de jeu) ---------------- */
  function blocScene() {
    const svg = R.svgString(carte, { vueMJ: true, grille: true })
      .replace('<svg ', `<svg width="${carte.taille.w}" height="${carte.taille.h}" `);
    return `<div class="scene" data-id="${S.slug(carte.nom)}" data-nom="${carte.nom}" `
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
  function choisirOutil(id) {
    outil = id;
    document.querySelectorAll('#outils button').forEach(b => b.classList.toggle('actif', b.dataset.outil === id));
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
    if (e.key === 'Escape') { sel = null; majPanneau(); dessinerEdition(); return; }
    const o = OUTILS.find(x => x.k === e.key.toLowerCase());
    if (o) choisirOutil(o.id);
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
  }

  const p = new URLSearchParams(location.search);
  const idDepot = p.get('depot'), id = p.get('id');
  if (idDepot) {
    S.chargerDepot(idDepot).then(demarrer).catch(() => demarrer(M.nouvelleCarte({ nom: 'Nouvelle carte' })));
  } else if (id === 'nouveau') {
    demarrer(M.nouvelleCarte({ nom: 'Nouvelle carte', w: 560, h: 466, cell: 40 }));
  } else {
    let cible = id;
    try { cible = cible || localStorage.getItem('kj-derniere-carte'); } catch (e) {}
    (cible ? S.charger(cible) : Promise.resolve(null))
      .then(c => demarrer(c ? M.depuisJSON(c) : M.nouvelleCarte({ nom: 'Nouvelle carte', w: 560, h: 466, cell: 40 })))
      .catch(() => demarrer(M.nouvelleCarte({ nom: 'Nouvelle carte', w: 560, h: 466, cell: 40 })));
  }
  construireOutils();

  S.gererServiceWorker();
})();
