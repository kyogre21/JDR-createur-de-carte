/* ============================================================
   Cartographe — moteur de rendu (modèle → SVG)
   Utilisé par l'éditeur, la table de jeu et l'export pour les PDF :
   une seule vérité graphique, donc un rendu identique partout.
   Expose window.KJ.rendu
   ============================================================ */
window.KJ = window.KJ || {};
KJ.rendu = (function () {

  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- symboles de mobilier ----------
     Dessinés dans une viewBox 0 0 100 100, étirés aux dimensions de l'objet.
     vector-effect garde une épaisseur de trait régulière malgré l'étirement. */
  const SYM = {
    lit: `<rect x="6" y="4" width="88" height="92"/><line x1="6" y1="30" x2="94" y2="30"/>`,
    table: `<rect x="4" y="10" width="92" height="80"/>`,
    tablelongue: `<rect x="2" y="14" width="96" height="72"/>`,
    chaise: `<rect x="14" y="14" width="72" height="72"/>`,
    coffre: `<rect x="6" y="12" width="88" height="76"/><line x1="6" y1="42" x2="94" y2="42"/>`,
    armoire: `<rect x="4" y="8" width="92" height="84"/><line x1="50" y1="8" x2="50" y2="92"/>`,
    tonneau: `<circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="24"/>`,
    athre: `<rect x="8" y="4" width="84" height="92"/><path d="M14 92 L44 10 M14 66 L34 10 M14 40 L24 10 M50 92 L80 40 M62 92 L86 62"/>`,
    paillasse: `<rect x="4" y="6" width="92" height="88"/><circle cx="50" cy="24" r="10"/><circle cx="50" cy="50" r="8"/><circle cx="50" cy="76" r="10"/>`,
    etagere: `<rect x="10" y="4" width="80" height="92"/><line x1="10" y1="30" x2="90" y2="30"/><line x1="10" y1="58" x2="90" y2="58"/><line x1="10" y1="82" x2="90" y2="82"/>`,
    tapis: `<rect x="2" y="2" width="96" height="96" rx="3" class="tapis-ext"/><rect x="12" y="12" width="76" height="76" class="tapis-int"/>`,
    autel: `<rect x="6" y="14" width="88" height="72"/><line x1="20" y1="14" x2="20" y2="86"/><line x1="80" y1="14" x2="80" y2="86"/>`,
    ecritoire: `<rect x="8" y="40" width="84" height="52"/><path d="M8 40 L50 10 L92 40 Z" fill="none"/><line x1="50" y1="10" x2="50" y2="40"/>`,
    escalier: `<rect x="6" y="2" width="88" height="96" fill="none"/>
      <line x1="6" y1="14" x2="94" y2="14"/><line x1="6" y1="26" x2="94" y2="26"/><line x1="6" y1="38" x2="94" y2="38"/>
      <line x1="6" y1="50" x2="94" y2="50"/><line x1="6" y1="62" x2="94" y2="62"/><line x1="6" y1="74" x2="94" y2="74"/>
      <line x1="6" y1="86" x2="94" y2="86"/><line x1="50" y1="88" x2="50" y2="20"/><polygon points="44,24 56,24 50,8" class="plein"/>`,
    /* volée en arc : demi-anneau (le côté plat est à gauche) + marches radiales */
    escalierdemi: `<path d="M50 4 A46 46 0 0 1 50 96 L50 74 A24 24 0 0 0 50 26 Z" fill="none"/>
      <line x1="59.9" y1="26.0" x2="67.6" y2="7.5"/><line x1="68.4" y1="31.6" x2="82.5" y2="17.5"/>
      <line x1="74.0" y1="40.1" x2="92.5" y2="32.4"/><line x1="76.0" y1="50.0" x2="96.0" y2="50.0"/>
      <line x1="74.0" y1="59.9" x2="92.5" y2="67.6"/><line x1="68.4" y1="68.4" x2="82.5" y2="82.5"/>
      <line x1="59.9" y1="74.0" x2="67.6" y2="92.5"/>`,
    puits: `<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="30"/><line x1="4" y1="50" x2="96" y2="50"/>`,
    /* trappe visible (à distinguer du calque « secret », réservé au MJ) : une porte au sol */
    trappe: `<rect x="8" y="8" width="84" height="84" rx="3"/><circle cx="50" cy="50" r="12" fill="none"/><line x1="50" y1="62" x2="50" y2="74"/>`,
    arbre: `<circle cx="50" cy="50" r="44"/><path d="M50 50 L50 96"/>`,
    maison: `<rect x="4" y="30" width="92" height="66"/><path d="M4 30 L50 4 L96 30"/>`,
    tableau: `<rect x="2" y="2" width="96" height="96"/><rect x="14" y="14" width="72" height="72"/>`,
    miroir: `<rect x="2" y="2" width="96" height="96" rx="6"/><ellipse cx="50" cy="50" rx="38" ry="44"/>`,
    statue: `<rect x="30" y="70" width="40" height="26"/><circle cx="50" cy="40" r="20"/><path d="M30 70 Q50 44 70 70" fill="none"/>`,
    tombe: `<path d="M20 96 L20 40 A30 30 0 0 1 80 40 L80 96 Z"/><line x1="50" y1="50" x2="50" y2="76"/><line x1="38" y1="60" x2="62" y2="60"/>`,
    /* colline : silhouette en courbes de niveau imbriquées (décor de carte extérieure) */
    colline: `<path d="M2 94 Q30 84 50 84 Q70 84 98 94" fill="none"/>
      <path d="M8 78 Q30 62 50 62 Q70 62 92 78" fill="none"/>
      <path d="M20 58 Q35 44 50 44 Q65 44 80 58" fill="none"/>
      <path d="M32 40 Q42 30 50 30 Q58 30 68 40" fill="none"/>`,
    /* ---- formes libres : marquer une case (« il y a quelque chose ici »)
       sans nommer l'objet — repères abstraits, comme l'astérisque de lumière ---- */
    frond:        `<circle cx="50" cy="50" r="42"/>`,
    frondplein:   `<circle cx="50" cy="50" r="40" class="plein"/>`,
    fcarre:       `<rect x="10" y="10" width="80" height="80"/>`,
    fcarreplein:  `<rect x="12" y="12" width="76" height="76" class="plein"/>`,
    ftriangle:    `<polygon points="50,8 92,88 8,88"/>`,
    flosange:     `<polygon points="50,6 94,50 50,94 6,50"/>`,
    fcroix:       `<path d="M16 16 L84 84 M84 16 L16 84"/>`,
    fplus:        `<path d="M50 8 L50 92 M8 50 L92 50"/>`,
    fetoile:      `<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>`,
    fpoint:       `<circle cx="50" cy="50" r="16" class="plein"/>`,
    fexclam:      `<path d="M50 8 L50 60"/><circle cx="50" cy="86" r="8" class="plein"/>`,
    fquest:       `<path d="M28 30 Q28 8 50 8 Q72 8 72 30 Q72 46 50 52 L50 62" fill="none"/><circle cx="50" cy="86" r="8" class="plein"/>`,
  };

  /* Feuille de style embarquée : rend le SVG exporté autonome
     (les cartes exportées s'ouvrent seules et s'impriment dans les PDF). */
  function styles(theme) {
    const t = theme || {};
    const parchemin = t.parchemin || '#221b11';
    const salle = t.salle || '#2f271a';
    const encre = t.encre || '#d3c5a4';
    const sang = t.sang || '#a8544c';
    const or = t.or || '#c9a227';
    return `
      .kj-fond{fill:${parchemin}}
      .kj-piece{fill:${salle};stroke:${encre};stroke-width:5;stroke-linejoin:miter}
      .kj-mur{stroke:${encre};fill:none;stroke-linecap:square}
      .kj-coupe{stroke:${salle};fill:none;stroke-linecap:butt}
      .kj-porte{stroke:${encre};stroke-width:1.8;fill:none}
      .kj-porte-secrete{stroke:${encre};stroke-width:1.8;fill:none;stroke-dasharray:5 4}
      .kj-fenetre{fill:${salle};stroke:${encre};stroke-width:1.4}
      .kj-grille{stroke:${encre};stroke-width:1;opacity:.09}
      .kj-obj{fill:${salle};stroke:${encre};stroke-width:1.4;vector-effect:non-scaling-stroke}
      .kj-obj .plein{fill:${encre};stroke:none}
      .kj-obj .tapis-ext{fill:${sang};fill-opacity:.15;stroke:${sang};stroke-opacity:.55}
      .kj-obj .tapis-int{fill:none;stroke:${sang};stroke-opacity:.4}
      .kj-num circle{fill:${sang};stroke:${encre};stroke-width:1}
      .kj-num text{fill:${parchemin};font:700 12px "Palatino Linotype",Georgia,serif;text-anchor:middle}
      .kj-txt-lbl{fill:${encre};font:italic 11.5px "Palatino Linotype",Georgia,serif;text-anchor:middle;
        letter-spacing:.08em;opacity:.8;font-variant:small-caps}
      .kj-txt-tiny{fill:${encre};font:italic 9px "Palatino Linotype",Georgia,serif;text-anchor:middle;opacity:.7}
      .kj-lum{stroke:${or};stroke-width:2;stroke-linecap:round;fill:none}
      .kj-portail-los{fill:${or};stroke:#0d0a07;stroke-width:1.5}
      .kj-portail-lbl{fill:${or};font:600 9px "Palatino Linotype",Georgia,serif;text-anchor:middle;
        font-variant:small-caps;letter-spacing:.06em}
      .kj-secret{fill:none;stroke:${sang};stroke-width:1.6;stroke-dasharray:4 3;pointer-events:all}
      .kj-secret-lbl{fill:${sang};font:italic 9px "Palatino Linotype",Georgia,serif;text-anchor:middle}
      .kj-image-cadre{fill:${salle};stroke:${or};stroke-width:1.6}
      .kj-image-glyphe{fill:none;stroke:${or};stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
      .kj-image-soleil{fill:${or};stroke:none}
      /* révélé aux joueurs (clic droit dessus, en mode Jeu) : même teinte verte que les
       * jetons de PJ, pour distinguer d'un coup d'œil ce que les joueurs voient déjà. */
      .kj-secret.revele{stroke:#7fa070}
      .kj-secret-lbl.revele{fill:#7fa070}
      .kj-image-cadre.revele{stroke:#7fa070}
    `;
  }

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* Sens de l'arc de débattement : déterminé par le produit vectoriel
     (gond → bout du battant) × (gond → autre extrémité de l'ouverture). */
  function battant(gx, gy, bx, by, fx, fy, r) {
    const cross = (bx - gx) * (fy - gy) - (by - gy) * (fx - gx);
    const sweep = cross > 0 ? 1 : 0;
    return `<line x1="${gx}" y1="${gy}" x2="${bx}" y2="${by}"/>`
         + `<path d="M${bx} ${by} A${r} ${r} 0 0 ${sweep} ${fx} ${fy}"/>`;
  }

  /* ---------- rendu par type ---------- */
  function unElement(el, opts) {
    const id = opts.ids ? ` data-id="${el.id}"` : '';
    switch (el.type) {

      case 'piece': {
        // défaut 2 : assez pour lire la structure sans manger la case (les cartes
        // existantes gardent leur ep enregistré, 5 pour les plus anciennes)
        const ep = ` style="stroke-width:${el.ep || 2}"`;
        let s = `<g${id} class="kj-el"><rect class="kj-piece"${ep} x="${el.x}" y="${el.y}" `
              + `width="${el.w}" height="${el.h}"/>`;
        if (el.nom) s += `<text class="kj-txt-lbl" x="${el.x + el.w / 2}" y="${el.y + 17}">${esc(el.nom)}</text>`;
        return s + `</g>`;
      }

      case 'mur':
        return `<g${id} class="kj-el"><line class="kj-mur" style="stroke-width:${el.ep || 2}" `
             + `x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}"/></g>`;

      case 'porte': {
        // secrète : indiscernable d'un mur plein côté joueurs (le mur reste donc intact)
        if (el.style === 'secrete' && opts.vueMJ === false) return '';
        const l = el.l, h = el.o === 'h';
        const a = h ? { x: el.x - l / 2, y: el.y } : { x: el.x, y: el.y - l / 2 };
        const b = h ? { x: el.x + l / 2, y: el.y } : { x: el.x, y: el.y + l / 2 };
        // 1) on « efface » le mur sur la largeur de l'ouverture
        let s = `<g${id} class="kj-el"><line class="kj-coupe" style="stroke-width:11" `
              + `x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
        if (el.style === 'secrete') {
          s += `<line class="kj-porte-secrete" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
        } else if (el.style === 'double') {
          const d = l / 2, m = { x: el.x, y: el.y };
          s += `<g class="kj-porte">`;
          s += battant(a.x, a.y, h ? a.x : a.x + el.sens * d, h ? a.y + el.sens * d : a.y, m.x, m.y, d);
          s += battant(b.x, b.y, h ? b.x : b.x + el.sens * d, h ? b.y + el.sens * d : b.y, m.x, m.y, d);
          s += `</g>`;
        } else {
          s += `<g class="kj-porte">`
             + battant(a.x, a.y, h ? a.x : a.x + el.sens * l, h ? a.y + el.sens * l : a.y, b.x, b.y, l)
             + `</g>`;
        }
        return s + `</g>`;
      }

      case 'fenetre': {
        const l = el.l, e = 10;
        const x = el.o === 'h' ? el.x - l / 2 : el.x - e / 2;
        const y = el.o === 'h' ? el.y - e / 2 : el.y - l / 2;
        const w = el.o === 'h' ? l : e, hh = el.o === 'h' ? e : l;
        return `<g${id} class="kj-el"><rect class="kj-fenetre" x="${x}" y="${y}" width="${w}" height="${hh}"/></g>`;
      }

      case 'objet': {
        const rot = el.rot ? ` transform="rotate(${el.rot} ${el.x} ${el.y})"` : '';
        // zone de clic invisible sur toute l'emprise : certains symboles (escaliers) ne
        // sont que des traits sans remplissage, quasi impossibles à toucher sinon.
        // stroke="none" explicite : sans ça, ce rect hérite du stroke de son groupe
        // parent .kj-obj (destiné au tracé du symbole) et devient un cadre bien visible
        // autour de tout symbole clairsemé (l'escalier en arc, par ex., n'a pas de forme
        // pleine qui le recouvre) — fill="transparent" seul ne suffit pas.
        const prise = opts.ids
          ? `<rect x="${el.x - el.w / 2}" y="${el.y - el.h / 2}" width="${el.w}" height="${el.h}" fill="transparent" stroke="none" pointer-events="all"/>`
          : '';
        return `<g${id} class="kj-el kj-obj"${rot}>` + prise
             + `<svg x="${el.x - el.w / 2}" y="${el.y - el.h / 2}" width="${el.w}" height="${el.h}" `
             + `viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible">`
             + (SYM[el.sym] || SYM.table) + `</svg></g>`;
      }

      case 'numero':
        return `<g${id} class="kj-el kj-num"><circle cx="${el.x}" cy="${el.y}" r="11"/>`
             + `<text x="${el.x}" y="${el.y + 4.5}">${esc(el.num)}</text></g>`;

      case 'texte': {
        const rot = el.rot ? ` transform="rotate(${el.rot} ${el.x} ${el.y})"` : '';
        return `<g${id} class="kj-el"${rot}><text class="kj-txt-${el.style === 'tiny' ? 'tiny' : 'lbl'}" `
             + `x="${el.x}" y="${el.y}">${esc(el.texte)}</text></g>`;
      }

      case 'lumiere':
        return `<g${id} class="kj-el kj-lum" transform="translate(${el.x} ${el.y})">`
             + `<line x1="0" y1="-6" x2="0" y2="6"/><line x1="-5.2" y1="-3" x2="5.2" y2="3"/>`
             + `<line x1="-5.2" y1="3" x2="5.2" y2="-3"/></g>`;

      /* En mode Jeu, la table dessine ses propres portails (cliquables) en HTML :
         elle passe portails:false pour ne pas les avoir en double. */
      case 'portail': {
        if (opts.portails === false) return '';
        let s = `<g${id} class="kj-el kj-portail" transform="translate(${el.x} ${el.y})">`
              + `<rect class="kj-portail-los" x="-8" y="-8" width="16" height="16" transform="rotate(45)"/>`;
        if (el.label) s += `<text class="kj-portail-lbl" x="0" y="22">${esc(el.label)}</text>`;
        return s + `</g>`;
      }

      case 'secret': {
        // révélé (opts.reveles, une session de table de jeu) : reste visible aux joueurs
        // en permanence, sans repasser par mj-only — un secret qu'ils ont découvert.
        const revele = !!(opts.reveles && opts.reveles.includes(el.id));
        const cls = 'kj-el' + (revele ? '' : ' mj-only');
        let s = `<g${id} class="${cls}"><rect class="kj-secret${revele ? ' revele' : ''}" `
              + `x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}"/>`;
        if (el.nature) s += `<text class="kj-secret-lbl${revele ? ' revele' : ''}" `
          + `x="${el.x + el.w / 2}" y="${el.y + el.h + 11}">${esc(el.nature)}</text>`;
        return s + `</g>`;
      }

      /* En mode Jeu, la table dessine ses propres icônes d'image (cliquables, en HTML) :
         elle passe images:false pour ne pas les avoir en double. */
      case 'image': {
        if (opts.images === false) return '';
        const revele = !!(opts.reveles && opts.reveles.includes(el.id));
        const cls = 'kj-el kj-image' + (revele ? '' : ' mj-only');
        return `<g${id} class="${cls}" transform="translate(${el.x} ${el.y})">`
             + `<rect class="kj-image-cadre${revele ? ' revele' : ''}" x="-13" y="-13" width="26" height="26" rx="5"/>`
             + `<path class="kj-image-glyphe" d="M-7 4 L-2 -3 L2 1 L6 -5 L9 4 Z"/>`
             + `<circle class="kj-image-soleil" cx="-4.5" cy="-6" r="2.1"/></g>`;
      }

      default: return '';
    }
  }

  function grilleSVG(carte) {
    const c = carte.grille.cell;
    if (!c) return '';
    let s = `<g class="kj-grille" data-role="grille">`;
    for (let x = c; x < carte.taille.w; x += c) s += `<line x1="${x}" y1="0" x2="${x}" y2="${carte.taille.h}"/>`;
    for (let y = c; y < carte.taille.h; y += c) s += `<line x1="0" y1="${y}" x2="${carte.taille.w}" y2="${y}"/>`;
    return s + `</g>`;
  }

  /* ---------- rendu complet ----------
     opts : { grille, calques:{id:bool}, vueMJ, ids, grain, theme } */
  function corps(carte, opts) {
    opts = Object.assign({ grille: true, vueMJ: true, ids: false, grain: true, calques: null }, opts);
    const vis = (idc) => !opts.calques || opts.calques[idc] !== false;
    const parC = KJ.modele.parCalque(carte);

    let s = `<rect class="kj-fond" x="0" y="0" width="${carte.taille.w}" height="${carte.taille.h}"/>`;
    if (opts.grain) s += `<rect x="0" y="0" width="${carte.taille.w}" height="${carte.taille.h}" filter="url(#kjGrain)"/>`;
    if (opts.grille && vis('grille')) s += grilleSVG(carte);

    for (const c of KJ.modele.CALQUES) {
      if (!vis(c.id)) continue;
      // un calque MJ se filtre élément par élément, pas en bloc : un élément révélé
      // (opts.reveles, une session de table de jeu) reste visible même hors vue MJ.
      if (c.mj && !opts.vueMJ) {
        s += `<g data-calque="${c.id}">`;
        for (const el of parC[c.id])
          if (opts.reveles && opts.reveles.includes(el.id)) s += unElement(el, opts);
        s += `</g>`;
        continue;
      }
      s += `<g data-calque="${c.id}">`;
      for (const el of parC[c.id]) s += unElement(el, opts);
      s += `</g>`;
    }
    return s;
  }

  function defs(theme) {
    return `<defs>
      <filter id="kjGrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/>
        <feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .38  0 0 0 0 .28  0 0 0 .09 0"/></filter>
    </defs><style>${styles(theme)}</style>`;
  }

  /* SVG autonome, prêt à enregistrer ou à insérer dans un PDF. */
  function svgString(carte, opts) {
    return `<svg xmlns="${NS}" viewBox="0 0 ${carte.taille.w} ${carte.taille.h}" `
         + `width="${carte.taille.w}" height="${carte.taille.h}">`
         + defs((opts || {}).theme) + corps(carte, opts) + `</svg>`;
  }

  /* Remplit un <svg> existant (utilisé par l'éditeur, qui ajoute ses poignées). */
  function dansSVG(svgEl, carte, opts) {
    svgEl.setAttribute('viewBox', `0 0 ${carte.taille.w} ${carte.taille.h}`);
    svgEl.innerHTML = defs((opts || {}).theme) + corps(carte, opts);
  }

  return { SYM, styles, defs, corps, svgString, dansSVG, unElement, esc };
})();
