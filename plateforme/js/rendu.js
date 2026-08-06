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
    /* pont / passerelle vu de dessus : deux garde-corps + planches — un OBJET,
       pas de la structure : aucun mur, aucune logique de pièce, les révélations
       au passage des PJ (proximité) fonctionnent normalement dessus */
    pont: `<line x1="10" y1="2" x2="10" y2="98"/><line x1="90" y1="2" x2="90" y2="98"/>
      <line x1="10" y1="14" x2="90" y2="14"/><line x1="10" y1="30" x2="90" y2="30"/>
      <line x1="10" y1="46" x2="90" y2="46"/><line x1="10" y1="62" x2="90" y2="62"/>
      <line x1="10" y1="78" x2="90" y2="78"/><line x1="10" y1="92" x2="90" y2="92"/>`,
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
      .kj-fenetre{fill:${salle};stroke:${encre};stroke-width:1.8}
      .kj-grille{stroke:${encre};stroke-width:1;opacity:.09}
      /* trait à 2.4 : à 1.4 les symboles (mobilier, formes) devenaient filiformes
         dès qu'on dézoomait — le trait ne suit pas le zoom (non-scaling-stroke) */
      .kj-obj{fill:${salle};stroke:${encre};stroke-width:2.4;vector-effect:non-scaling-stroke}
      .kj-obj *{vector-effect:non-scaling-stroke}
      .kj-obj .plein{fill:${encre};stroke:none}
      .kj-obj .tapis-ext{fill:${sang};fill-opacity:.15;stroke:${sang};stroke-opacity:.55}
      .kj-obj .tapis-int{fill:none;stroke:${sang};stroke-opacity:.4}
      .kj-num circle{fill:${sang};stroke:${encre};stroke-width:1}
      .kj-num text{fill:${parchemin};font:700 12px "Palatino Linotype",Georgia,serif;text-anchor:middle}
      /* halo couleur de salle derrière les lettres (paint-order) : le nom reste
         lisible posé sur du mobilier, une grille ou un mur */
      .kj-txt-lbl{fill:${encre};font:italic 11.5px "Palatino Linotype",Georgia,serif;text-anchor:middle;
        letter-spacing:.08em;opacity:.85;font-variant:small-caps;
        paint-order:stroke;stroke:${salle};stroke-width:3;stroke-linejoin:round}
      .kj-txt-tiny{fill:${encre};font:italic 9px "Palatino Linotype",Georgia,serif;text-anchor:middle;opacity:.75;
        paint-order:stroke;stroke:${salle};stroke-width:2.4;stroke-linejoin:round}
      .kj-lum{stroke:${or};stroke-width:2;stroke-linecap:round;fill:none}
      .kj-portail-los{fill:${or};stroke:#0d0a07;stroke-width:1.5}
      .kj-portail-lbl{fill:${or};font:600 9px "Palatino Linotype",Georgia,serif;text-anchor:middle;
        font-variant:small-caps;letter-spacing:.06em}
      .kj-zone-cachee{opacity:.45}
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
        // existantes gardent leur ep enregistré, 5 pour les plus anciennes).
        // Le NOM de la pièce est dessiné à part, après toute la structure (voir corps) :
        // la découpe d'une porte ne doit pas le gommer.
        const ep = ` style="stroke-width:${el.ep || 2}"`;
        return `<g${id} class="kj-el"><rect class="kj-piece"${ep} x="${el.x}" y="${el.y}" `
              + `width="${el.w}" height="${el.h}"/></g>`;
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
        if (el.style === 'passage') {
          // passage ouvert : juste le trou dans le mur, ni battant ni menuiserie
        } else if (el.style === 'secrete') {
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
        // taille et couleur au choix (en plus des deux styles de base) ; les
        // anciens textes, sans ces champs, gardent exactement leur rendu
        let inline = '';
        if (el.taille) inline += `font-size:${el.taille}px;`;
        if (el.couleur) inline += `fill:${el.couleur};`;
        const st = inline ? ` style="${inline}"` : '';
        return `<g${id} class="kj-el"${rot}><text class="kj-txt-${el.style === 'tiny' ? 'tiny' : 'lbl'}"${st} `
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

  /* ---------- nom d'une pièce ----------
     Taille : manuelle (nomTaille) sinon AUTO, calculée pour tenir dans la largeur
     de la pièce (bornée 7–16 px). Un nom vraiment trop long pour sa pièce est
     coupé en deux lignes au plus près du milieu plutôt que rétréci à l'infini.
     Position (nomPos) : haut (défaut), centre ou bas. */
  function labelPiece(el) {
    const marge = 12, larg = Math.max(20, el.w - marge);
    const taillePour = (txt) => larg / (0.62 * Math.max(1, txt.length));
    const couperEnDeux = (nom) => {   // coupe au plus près du milieu, sur une espace
      const mots = nom.split(' ');
      let best = 1, ecart = Infinity;
      for (let i = 1; i < mots.length; i++) {
        const d = Math.abs(mots.slice(0, i).join(' ').length - mots.slice(i).join(' ').length);
        if (d < ecart) { ecart = d; best = i; }
      }
      return [mots.slice(0, best).join(' '), mots.slice(best).join(' ')];
    };
    let lignes = [el.nom], taille;
    if (el.nomTaille) {
      taille = el.nomTaille;
      // taille imposée : si le nom déborde de la pièce à cette taille, on coupe
      if (taillePour(el.nom) < taille && el.nom.indexOf(' ') > 0) lignes = couperEnDeux(el.nom);
    } else {
      taille = Math.max(7, Math.min(16, taillePour(el.nom)));
      if (taillePour(el.nom) < 7.5 && el.nom.indexOf(' ') > 0) {
        lignes = couperEnDeux(el.nom);
        const long = lignes[0].length >= lignes[1].length ? lignes[0] : lignes[1];
        taille = Math.max(7, Math.min(16, taillePour(long)));
      }
    }
    const interligne = taille * 1.15, bloc = interligne * (lignes.length - 1);
    const pos = el.nomPos || 'haut';
    let y0;
    if (pos === 'centre') y0 = el.y + el.h / 2 - bloc / 2 + taille * .35;
    else if (pos === 'bas') y0 = el.y + el.h - 8 - bloc;
    else y0 = el.y + 6 + taille;
    const x = el.x + el.w / 2;
    return `<text class="kj-txt-lbl" style="font-size:${taille}px" x="${x}" y="${y0}">`
      + lignes.map((l, i) => i ? `<tspan x="${x}" dy="${interligne}">${esc(l)}</tspan>` : esc(l)).join('')
      + `</text>`;
  }

  /* ---------- rendu complet ----------
     opts : { grille, calques:{id:bool}, vueMJ, ids, grain, theme } */
  const optsDefaut = (opts) => Object.assign({ grille: true, vueMJ: true, ids: false, grain: true, calques: null }, opts);
  /* Le SOCLE (fond, grain, grille) ne dépend que de la taille, de la grille et des
     options — pas des éléments. Séparé des calques pour que dansSVG puisse le
     garder en place pendant l'édition (voir plus bas). */
  // fond d'image de la carte (carte.fond = { src, opacite }) : src peut être une
  // référence de compte « img:<id> », résolue par l'appelant via opts.resoudreSrc
  function srcFond(carte, opts) {
    const f = carte.fond;
    if (!f || !f.src) return '';
    return opts.resoudreSrc ? (opts.resoudreSrc(f.src) || '') : f.src;
  }
  function socle(carte, opts) {
    const vis = (idc) => !opts.calques || opts.calques[idc] !== false;
    let s = `<rect class="kj-fond" x="0" y="0" width="${carte.taille.w}" height="${carte.taille.h}"/>`;
    const fond = srcFond(carte, opts);
    if (fond) {
      const op = (carte.fond.opacite != null && carte.fond.opacite < 1) ? ` opacity="${carte.fond.opacite}"` : '';
      s += `<image href="${esc(fond)}" x="0" y="0" width="${carte.taille.w}" height="${carte.taille.h}" `
         + `preserveAspectRatio="none"${op}/>`;
    }
    if (opts.grain) s += `<rect x="0" y="0" width="${carte.taille.w}" height="${carte.taille.h}" filter="url(#kjGrain)"/>`;
    if (opts.grille && vis('grille')) s += grilleSVG(carte);
    return s;
  }
  function calquesSVG(carte, opts) {
    const vis = (idc) => !opts.calques || opts.calques[idc] !== false;
    const parC = KJ.modele.parCalque(carte);
    let s = '';
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
      for (const el of parC[c.id]) {
        /* el.cache : « zone cachée » — un élément normal (pièce, mur, porte, objet…)
           que les joueurs ne doivent pas voir tant qu'il n'est pas révélé (une pièce
           derrière un mur secret, par ex.). Vue MJ : estompé, pour le repérer d'un
           coup d'œil. Vue joueurs : absent, sauf révélé en session (opts.reveles). */
        const revele = !!(opts.reveles && opts.reveles.includes(el.id));
        if (el.cache && !opts.vueMJ && !revele) continue;
        // révélé en session : redevient un élément normal, y compris côté MJ
        if (el.cache && opts.vueMJ && !revele) s += `<g class="kj-zone-cachee">` + unElement(el, opts) + `</g>`;
        else s += unElement(el, opts);
      }
      s += `</g>`;
      /* Les NOMS de pièces se dessinent après toute la structure : sinon la découpe
         d'une porte posée sur le mur du haut (trait couleur de salle, épais) vient
         gommer les premières lettres du libellé. */
      if (c.id === 'structure') {
        s += `<g data-calque="noms-pieces">`;
        for (const el of parC[c.id]) {
          if (el.type !== 'piece' || !el.nom) continue;
          const revele = !!(opts.reveles && opts.reveles.includes(el.id));
          if (el.cache && !opts.vueMJ && !revele) continue;
          const txt = labelPiece(el);
          s += (el.cache && opts.vueMJ && !revele) ? `<g class="kj-zone-cachee">${txt}</g>` : txt;
        }
        s += `</g>`;
      }
    }
    return s;
  }
  function corps(carte, opts) {
    opts = optsDefaut(opts);
    return socle(carte, opts) + calquesSVG(carte, opts);
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

  /* Remplit un <svg> existant (éditeur et table). Redessin en trois étages :
     - les DEFS (filtre de grain + feuille de style) : injectés UNE seule fois —
       les recréer re-rastérisait le bruit et invalidait le style de tout le
       document à chaque frame de déplacement ;
     - le SOCLE (fond/grain/grille) : régénéré seulement quand sa signature change
       (taille, cases, options) — 200 lignes de grille ne bougent pas quand on
       déplace un mur ;
     - les CALQUES d'éléments : seuls eux sont reconstruits à chaque appel. */
  function dansSVG(svgEl, carte, opts) {
    opts = optsDefaut(opts);
    svgEl.setAttribute('viewBox', `0 0 ${carte.taille.w} ${carte.taille.h}`);
    let gSocle = svgEl._kjSocle, gCalques = svgEl._kjCalques;
    if (!gSocle || gSocle.ownerSVGElement !== svgEl || !gCalques) {
      svgEl.innerHTML = defs(opts.theme) + '<g data-kj="socle"></g><g data-kj="calques"></g>';
      gSocle = svgEl._kjSocle = svgEl.querySelector('g[data-kj="socle"]');
      gCalques = svgEl._kjCalques = svgEl.querySelector('g[data-kj="calques"]');
      svgEl._kjSigSocle = null;
    }
    /* Repli : si les deux groupes n'ont pas pu être retrouvés, on retombe sur le
       rendu en un seul bloc. Sans ce garde, l'échec tuait TOUT le rendu de la
       carte (exception à chaque redessin) au lieu de coûter un peu de vitesse. */
    if (!gSocle || !gCalques) {
      svgEl._kjSocle = svgEl._kjCalques = null;
      svgEl.innerHTML = defs(opts.theme) + socle(carte, opts) + calquesSVG(carte, opts);
      return;
    }
    const vis = (idc) => !opts.calques || opts.calques[idc] !== false;
    // la longueur du fond RÉSOLU entre dans la signature : le socle se régénère
    // quand la donnée arrive (compte chargé après le premier rendu)
    const fond = srcFond(carte, opts);
    const sigSocle = [carte.taille.w, carte.taille.h, carte.grille.cell,
      !!opts.grain, !!(opts.grille && vis('grille')),
      fond.length, carte.fond ? carte.fond.opacite : '',
      opts.theme ? JSON.stringify(opts.theme) : ''].join('|');
    if (svgEl._kjSigSocle !== sigSocle) {
      svgEl._kjSigSocle = sigSocle;
      gSocle.innerHTML = socle(carte, opts);
    }
    gCalques.innerHTML = calquesSVG(carte, opts);
  }

  return { SYM, styles, defs, corps, svgString, dansSVG, unElement, esc };
})();
