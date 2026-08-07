/* Génère les deux cartes du quartier de Cathay (campagne « Roland ») et les écrit
   au format attendu par le compte MJ. N'écrit RIEN dans la base : produit deux
   fichiers JSON que l'on pousse ensuite via la CLI Firebase. */
const fs = require('fs');
const OUT = process.env.CLAUDE_JOB_DIR + '/tmp';
const CELL = 40, M_PAR_CASE = 1.5;
const ID_MARCHE = 'cathay-marche', ID_HAUTE = 'cathay-ville-haute';
const CAMPAGNE = 'Roland';

let n = 0;
const uid = (p) => p + '_c' + (n++).toString(36);
const rad = (d) => d * Math.PI / 180;
const R2 = (v) => Math.round(v);

function carte(id, nom, w, h) {
  return { format: 1, id, nom, campagne: CAMPAGNE, taille: { w, h },
    grille: { cell: CELL, metres: M_PAR_CASE }, elements: [], cle: [], pins: [], maj: Date.now() };
}
const push = (c, el) => { el.id = uid(el.type); c.elements.push(el); return el; };
const piece = (c, o) => push(c, Object.assign({ type: 'piece', ep: 2 }, o));
const voie  = (c, o) => push(c, Object.assign({ type: 'voie', l: 100, sol: 'pave' }, o));
const mur   = (c, o) => push(c, Object.assign({ type: 'mur', ep: 4 }, o));
const objet = (c, o) => push(c, Object.assign({ type: 'objet', rot: 0 }, o));
const porte = (c, o) => push(c, Object.assign({ type: 'porte', o: 'h', l: 40, style: 'simple', sens: 1 }, o));
const texte = (c, o) => push(c, Object.assign({ type: 'texte', taille: 20 }, o));
const num   = (c, o) => push(c, Object.assign({ type: 'numero' }, o));
const portail = (c, o) => push(c, Object.assign({ type: 'portail' }, o));
const lum   = (c, o) => push(c, Object.assign({ type: 'lumiere' }, o));

/* ---------- garde-fou de placement ----------
   Poser des arbres et des îlots « à l'œil » sur une carte que je ne vois pas donne
   des arbres au milieu des maisons. On teste donc chaque emprise contre ce qui est
   déjà posé : voies (bande), pièces (rectangle ou ellipse), et bord de carte. */
function distSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
// r = { x, y, w, h } en coordonnées monde ; marge = espace à laisser libre autour
function libre(c, r, marge) {
  const m = marge == null ? 24 : marge;
  if (r.x < m || r.y < m || r.x + r.w > c.taille.w - m || r.y + r.h > c.taille.h - m) return false;
  // quatre coins + centre : suffisant pour des emprises de cette taille
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
               [r.x + r.w / 2, r.y + r.h / 2]];
  for (const e of c.elements) {
    if (e.type === 'voie') {
      const demi = (e.l || 60) / 2 + m;
      if (pts.some(([x, y]) => distSegment(x, y, e.x1, e.y1, e.x2, e.y2) < demi)) return false;
    } else if (e.type === 'mur') {
      const demi = (e.ep || 2) / 2 + m;
      if (pts.some(([x, y]) => distSegment(x, y, e.x1, e.y1, e.x2, e.y2) < demi)) return false;
    } else if (e.type === 'piece') {
      if (e.forme === 'rond') {
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2, rx = e.w / 2 + m, ry = e.h / 2 + m;
        // un rectangle recoupe l'ellipse dès qu'un de ses coins est dedans, ou
        // que le centre de l'ellipse est dans le rectangle
        if (pts.some(([x, y]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1)) return false;
        if (cx > r.x - m && cx < r.x + r.w + m && cy > r.y - m && cy < r.y + r.h + m) return false;
      } else if (r.x < e.x + e.w + m && r.x + r.w > e.x - m
              && r.y < e.y + e.h + m && r.y + r.h > e.y - m) return false;
    }
  }
  return true;
}
// pose un objet centré en (x,y) seulement si son emprise est libre ; renvoie true si posé
function objetSiLibre(c, o, marge) {
  const r = { x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h };
  if (!libre(c, r, marge == null ? 16 : marge)) return false;
  objet(c, o); return true;
}

/* Semis balayé : plutôt que de deviner des positions une à une (et de voir le
   garde-fou en refuser la moitié), on balaie la carte et on garde ce qui tient.
   Déterministe — deux exécutions donnent la même carte. */
function semerIlots(c, tailles, max, noms) {
  const pas = 40; let n = 0;
  for (let y = 200; y < c.taille.h - 200 && n < max; y += pas) {
    for (let x = 40; x < c.taille.w - 200 && n < max; x += pas) {
      for (const [w, h] of tailles) {
        if (libre(c, { x, y, w, h }, 30)) {
          piece(c, { x, y, w, h, nom: noms[n] || '', ep: 3 });
          n++; break;
        }
      }
    }
  }
  return n;
}
/* ecart : distance minimale entre deux objets du même semis. Sans elle, le balayage
   pose tout dans les premières places libres trouvées et les arbres finissent en
   haie serrée au lieu d'être répartis. */
function semerObjets(c, sym, w, h, max, zone, ecart, marge) {
  const pas = 40, e = ecart == null ? 220 : ecart, poses = []; let n = 0;
  for (let y = zone[1]; y < zone[3] && n < max; y += pas)
    for (let x = zone[0]; x < zone[2] && n < max; x += pas) {
      if (poses.some(([px, py]) => Math.hypot(px - x, py - y) < e)) continue;
      if (objetSiLibre(c, { sym, x, y, w, h }, marge == null ? 20 : marge)) { poses.push([x, y]); n++; }
    }
  return n;
}

/* ============================================================
   1. LA PLACE DU MARCHÉ — place ronde pavée, statue au centre,
   étals sur le pourtour, routes rayonnantes, porte de ville au nord.
   ============================================================ */
function marche() {
  const c = carte(ID_MARCHE, 'Cathay — Place du Marché', 1600, 1600);
  const CX = 800, CY = 800, RP = 440;          // centre et rayon de la place

  // --- les routes d'abord (calque Sol, elles passent sous tout le reste) ---
  // largeur en cases : 2.5 pour les rues, 2 pour la porte (on s'y resserre)
  voie(c, { x1: CX, y1: 400, x2: CX, y2: 250, l: 110 });          // dedans, large
  voie(c, { x1: CX, y1: 260, x2: CX, y2: 0,   l: 80 });           // sous la porte, étroite
  const rayon = (a, l, jusqu) => {                                 // route partant de la place
    const x1 = R2(CX + Math.cos(rad(a)) * (RP - 25)), y1 = R2(CY + Math.sin(rad(a)) * (RP - 25));
    voie(c, { x1, y1, x2: jusqu[0], y2: jusqu[1], l });
  };
  rayon(315, 100, [1560, 40]);      // nord-est → ville moyenne
  rayon(0,   100, [1600, CY]);      // est       → caserne
  rayon(45,  100, [1520, 1520]);    // sud-est   → ville basse
  rayon(180, 100, [0, CY]);         // ouest     → ville haute

  // --- la place elle-même : ronde et pavée ---
  piece(c, { x: CX - RP, y: CY - RP, w: RP * 2, h: RP * 2, forme: 'rond', sol: 'pave', ep: 3, nom: '' });
  // socle du monument, dallé
  piece(c, { x: CX - 120, y: CY - 120, w: 240, h: 240, forme: 'rond', sol: 'dalle', ep: 2 });
  // 80×104 et non 120×152 : au-delà, le symbole s'étire et ne se lit plus comme une statue
  objet(c, { sym: 'statue', x: CX, y: CY - 6, w: 80, h: 104 });

  // --- les étals, tournés vers le centre, dans les intervalles entre les routes ---
  // rot = angle - 90 : l'auvent du symbole regarde vers le haut au repos
  const RE = 352;
  for (const a of [20, 45, 70, 110, 135, 160, 200, 225, 250, 292, 337]) {
    objet(c, { sym: 'etal', x: R2(CX + Math.cos(rad(a)) * RE), y: R2(CY + Math.sin(rad(a)) * RE),
               w: 92, h: 58, rot: R2(a - 90) });
    // marchandise au sol derrière l'étal (un peu plus loin du centre)
    if ([45, 135, 225, 337].includes(a))
      objet(c, { sym: 'caisses', x: R2(CX + Math.cos(rad(a)) * (RE + 56)),
                 y: R2(CY + Math.sin(rad(a)) * (RE + 56)), w: 40, h: 40, rot: R2(a - 90) });
  }
  // deux charrettes de maraîchers près de la route du nord
  objet(c, { sym: 'charrette', x: 640, y: 470, w: 78, h: 46, rot: 20 });
  objet(c, { sym: 'charrette', x: 985, y: 500, w: 78, h: 46, rot: -35 });

  // --- la porte nord : muraille, deux tours, l'ouverture au milieu ---
  mur(c, { x1: 0, y1: 170, x2: 700, y2: 170, ep: 16 });
  mur(c, { x1: 900, y1: 170, x2: 1600, y2: 170, ep: 16 });
  piece(c, { x: 640, y: 110, w: 120, h: 120, forme: 'rond', ep: 6, sol: 'dalle' });
  piece(c, { x: 840, y: 110, w: 120, h: 120, forme: 'rond', ep: 6, sol: 'dalle' });
  texte(c, { x: CX, y: 62, texte: 'PORTE NORD — sortie de la ville', taille: 24 });
  // un portail au seuil : franchir la porte, c'est revenir au plan de Cathay.
  // Posé SOUS la muraille, pas dessus : son étiquette se noyait dans le trait du mur.
  portail(c, { x: CX, y: 236, label: 'Plan de Cathay', vers: 'carte_msiuuvfl1' });

  /* --- les îlots bâtis autour de la place ---
     Sans eux, la place flottait dans le vide : on ne lisait pas une ville mais une
     esplanade. Chaque emprise est testée contre les routes, la muraille et les autres
     bâtiments — je ne les place pas « à l'œil ». */
  const NOMS_ILOTS = ['Auberge du Sanglier', '', 'Halle aux grains', '',
    'Corporation des drapiers', '', 'Comptoir du Sel', '', 'Corps de garde', '', '', ''];
  const poses = semerIlots(c, [[250, 200], [220, 170], [180, 150], [150, 130]], 12, NOMS_ILOTS);

  // --- panneaux des routes (les quartiers non encore cartographiés) ---
  texte(c, { x: 1400, y: 176, texte: '→ Ville moyenne', taille: 20 });
  texte(c, { x: 1440, y: 762, texte: '→ Caserne', taille: 20 });
  texte(c, { x: 1360, y: 1400, texte: '→ Ville basse', taille: 20 });
  texte(c, { x: 190, y: 762, texte: 'Ville haute ←', taille: 20 });
  portail(c, { x: 70, y: CY, label: 'Ville haute', vers: ID_HAUTE });

  // --- mobilier et vie de la place ---
  for (const a of [30, 150, 210, 330])
    objet(c, { sym: 'reverbere', x: R2(CX + Math.cos(rad(a)) * 250), y: R2(CY + Math.sin(rad(a)) * 250), w: 22, h: 22 });
  // pas d'element « Lumiere » : il se dessine comme un portail (meme losange dore)
  objet(c, { sym: 'banc', x: 640, y: 940, w: 60, h: 20, rot: -20 });
  objet(c, { sym: 'banc', x: 960, y: 940, w: 60, h: 20, rot: 20 });
  objet(c, { sym: 'parterre', x: 800, y: 1060, w: 130, h: 60 });
  /* Arbres : candidats testés un par un — les poser à l'aveugle en avait planté deux
     au milieu de la route de la Ville basse. Ceux qui ne tiennent pas sont abandonnés. */
  const arbres = semerObjets(c, 'arbre', 80, 80, 7, [80, 240, 1560, 1520], 300);
  /* La foule : les passants sont DANS la place (les étals sont sur le pourtour), donc
     on les laisse chevaucher la pièce ronde — mais pas les étals ni la statue. */
  for (const [x, y] of [[700, 620], [880, 640], [560, 760], [1010, 720], [660, 1010],
                        [900, 1030], [1040, 900], [520, 900], [800, 470], [1120, 1010],
                        [480, 620], [1140, 560], [740, 1120], [890, 560]])
    objet(c, { sym: 'passant', x, y, w: 24, h: 24 });
  console.log('  place du Marche : ' + poses + ' ilots batis, ' + arbres + ' arbres');

  texte(c, { x: 800, y: 1546, texte: 'PLACE DU MARCHÉ — Cathay', taille: 30 });

  // --- clé numérotée du lieu ---
  const pts = [
    [CX + 150, CY - 60, 'La statue du Fondateur',
     'Un marchand de pierre, la main tendue vers la Porte Nord. Le socle dallé sert de tribune '
     + 'au crieur public le matin, et de perchoir aux gamins le reste du jour. Une inscription '
     + 'usée : « À celui qui ouvrit la route ». Fouiller la base (DD moyen) révèle une cache '
     + 'où les voleurs à la tire déposent leurs prises en attendant le soir.'],
    [CX + 300, CY + 300, 'Les étals',
     'Onze échoppes tournées vers le centre : maraîchers et volailles au sud, poissons et sel '
     + 'à l’est, drapiers et cuirs à l’ouest, camelots au nord — c’est là qu’on trouve du '
     + 'douteux. Les prix baissent d’un quart la dernière heure avant la fermeture.'],
    [CX - 130, 250, 'La Porte Nord',
     'Deux tours et un passage de trois pas. Quatre gardes de faction, un sergent qui note les '
     + 'entrées. Péage d’un sou par charrette. Ils ferment au crépuscule ; après, il faut '
     + 'payer — ou connaître quelqu’un.'],
    [700, 500, 'Les charrettes des maraîchers',
     'Elles arrivent avant l’aube et repartent à midi. Se glisser dessous est le moyen le plus '
     + 'simple de sortir de la ville sans être vu (DD facile si l’on a distrait le charretier).'],
    [1000, 950, 'La foule',
     'Une trentaine de personnes en permanence, le triple les jours de marché. Toute poursuite '
     + 'ici se fait à mi-vitesse. Trois tire-laine opèrent en trio : l’un bouscule, l’autre '
     + 'coupe la bourse, le troisième l’emporte vers la Ville basse.'],
  ];
  pts.forEach(([x, y, titre, desc], i) => {
    num(c, { x, y, num: i + 1 });
    c.cle.push({ num: i + 1, titre, desc });
  });
  return c;
}

/* ============================================================
   2. LA VILLE HAUTE — quartier huppé : avenue dallée, place à fontaine,
   hôtels particuliers derrière leurs grilles, boutiques de luxe.
   ============================================================ */
function villeHaute() {
  const c = carte(ID_HAUTE, 'Cathay — Ville haute', 1600, 1200);
  const AV = 600;                     // ordonnée de l'avenue

  // --- voirie ---
  voie(c, { x1: 0, y1: AV, x2: 1600, y2: AV, l: 150, sol: 'dalle' });        // grande avenue
  voie(c, { x1: 500, y1: AV, x2: 500, y2: 0, l: 90, sol: 'dalle' });        // ruelle nord
  voie(c, { x1: 860, y1: AV, x2: 860, y2: 1200, l: 90, sol: 'dalle' });      // ruelle sud
  // place ornementale : un élargissement rond de l'avenue
  piece(c, { x: 640, y: AV - 170, w: 340, h: 340, forme: 'rond', sol: 'dalle', ep: 3 });
  objet(c, { sym: 'fontaine', x: 810, y: AV, w: 130, h: 130 });

  /* --- bâti ---
     Chaque bâtiment a sa porte sur l'avenue et son enseigne s'il vend quelque chose :
     un joueur doit pouvoir lire la rue sans que le MJ récite. */
  const batiments = [
    // [x, y, w, h, nom, sol, cote ('n' au nord de l'avenue / 's' au sud), enseigne]
    [ 60, 200, 300, 300, 'Le Traiteur du Cygne',   'bois', 'n', true],
    [1020, 180, 260, 280, 'Herboristerie Belladone', 'bois', 'n', true],
    [1320, 180, 220, 280, 'Orfèvrerie Vandelle',   '',     'n', true],
    [ 420,  60, 0, 0, '', '', '', false],        // remplacé plus bas (hôtel particulier)
    [ 100, 760, 300, 300, 'Maison Ferrand',       '',     's', false],
    [ 460, 780, 260, 260, 'Maison d’Aubigné',     '',     's', false],
    [1000, 760, 280, 280, 'Soieries d’Orient',    'bois', 's', true],
    [1340, 780, 200, 240, 'Parfumeur Lisandre',   'bois', 's', true],
  ].filter(b => b[2]);

  for (const [x, y, w, h, nom, sol, cote, ens] of batiments) {
    piece(c, { x, y, w, h, nom, sol: sol || undefined, ep: 3 });
    // porte au milieu du mur qui donne sur l'avenue
    const yp = cote === 'n' ? y + h : y;
    porte(c, { x: R2(x + w / 2), y: yp, o: 'h', l: 40, style: 'simple', sens: cote === 'n' ? -1 : 1 });
    if (ens) objet(c, { sym: 'enseigne', x: R2(x + w / 2) + 70, y: yp + (cote === 'n' ? -26 : 26),
                        w: 34, h: 24, rot: cote === 'n' ? 0 : 180 });
  }

  // l'hôtel particulier : corps de logis en retrait, cour, grille sur la rue
  piece(c, { x: 620, y: 90, w: 340, h: 230, nom: 'Hôtel de Rosemont', ep: 3 });
  porte(c, { x: 790, y: 320, o: 'h', l: 50, style: 'double', sens: 1 });
  piece(c, { x: 600, y: 320, w: 380, h: 90, sol: 'herbe', ep: 1 });         // la cour plantée
  for (const x of [640, 700, 760, 820, 880, 940])
    objet(c, { sym: 'grille', x, y: 414, w: 62, h: 16 });
  objet(c, { sym: 'parterre', x: 660, y: 360, w: 90, h: 46 });
  objet(c, { sym: 'parterre', x: 920, y: 360, w: 90, h: 46 });
  objet(c, { sym: 'arbre', x: 790, y: 362, w: 66, h: 66 });

  // --- mobilier de rue : lampadaires, bancs, plantations ---
  for (const x of [180, 400, 1120, 1340]) {
    objet(c, { sym: 'reverbere', x, y: AV - 100, w: 24, h: 24 });
    objet(c, { sym: 'reverbere', x, y: AV + 100, w: 24, h: 24 });
  }
  for (const x of [260, 1220]) {
    objet(c, { sym: 'banc', x, y: AV - 96, w: 62, h: 20 });
    objet(c, { sym: 'banc', x, y: AV + 96, w: 62, h: 20 });
  }
  /* Arbres d'alignement : testés un par un. Posés à AV+150 ils tombaient EN PLEIN
     MILIEU des maisons du sud (qui commencent à y=760) — d'où le garde-fou. */
  const arbresH = semerObjets(c, 'arbre', 64, 64, 8, [80, 60, 1520, 1140], 240, 12);
  // plantations de part et d'autre de la place, en retrait de son pourtour
  objet(c, { sym: 'parterre', x: 560, y: AV, w: 86, h: 44 });
  objet(c, { sym: 'parterre', x: 1060, y: AV, w: 86, h: 44 });
  // kiosque à musique : DÉCALÉ de la ruelle, sinon il barre la rue
  // kiosque a musique : pose au premier emplacement qui l accueille vraiment
  const kio = [[420, 470], [1180, 480], [700, 1120], [320, 180]]
    .some(([x, y]) => objetSiLibre(c, { sym: 'kiosque', x, y, w: 104, h: 104 }, 14));
  if (!kio) console.log('  (pas de place pour le kiosque a musique)');

  /* --- les habitants ---
     Un groupe de trois près de la fontaine : les dames qui badinent (point 7 de la clé).
     À CÔTÉ du bassin et non dessus — posées sur la fontaine, on ne distinguait plus rien. */
  for (const [x, y] of [[706, 556], [700, 606], [726, 650]])
    objet(c, { sym: 'passant', x, y, w: 28, h: 28 });
  for (const [x, y] of [[240, 566], [330, 636], [1130, 566], [1250, 640], [620, 660],
                        [1040, 500], [500, 340], [900, 700], [1400, 566], [160, 640]])
    objet(c, { sym: 'passant', x, y, w: 24, h: 24 });

  // --- liaisons ---
  texte(c, { x: 1480, y: AV - 100, texte: 'Marché →', taille: 22 });
  // x=1500 et non 1560 : l'étiquette du portail, centrée, était rognée par le bord
  portail(c, { x: 1500, y: AV, label: 'Place du Marché', vers: ID_MARCHE });
  texte(c, { x: 300, y: 1160, texte: 'VILLE HAUTE — Cathay', taille: 28 });

  // --- clé numérotée ---
  const pts = [
    [210, 470, 'Le Traiteur du Cygne',
     'Maître Ombeline fournit les tables de la Ville haute. Cuisine ouverte sur la cour, six '
     + 'commis, un livre de commandes qui dit exactement qui reçoit qui, et quand — le document '
     + 'le plus indiscret du quartier. Elle le prête à qui la fait rire ; elle le vend à personne.'],
    [1150, 440, 'Herboristerie Belladone',
     'Simples, onguents, et sous le comptoir de quoi faire dormir un cheval. Le vieil Absalon '
     + 'ne pose pas de questions mais note tout dans un registre chiffré. Vend un antidote '
     + 'universel hors de prix (40 po) qui fonctionne vraiment.'],
    [1430, 440, 'Orfèvrerie Vandelle',
     'Pièce unique en vitrine, deux gardes en livrée, coffre scellé au sol. On n’entre que sur '
     + 'recommandation. Vandelle estime et rachète — sans certificat, à un cinquième du prix, '
     + 'et il se souvient des visages.'],
    [1140, 1020, 'Soieries d’Orient',
     'Étoffes venues par la Porte Nord. L’arrière-boutique sert de salon où l’on parle affaires '
     + 'à voix basse ; le patron loue la pièce à l’heure et ne veut rien savoir de ce qui s’y dit.'],
    [1440, 1000, 'Parfumeur Lisandre',
     'Sait reconnaître un parfum sur un vêtement et dire à qui on l’a vendu. Une piste vivante '
     + 'pour un enquêteur — Lisandre parle volontiers, par vanité.'],
    [790, 200, 'Hôtel de Rosemont',
     'La grille est fermée, la cour plantée, le logis en retrait. La baronne de Rosemont reçoit '
     + 'trois fois la semaine. Deux hommes d’armes privés, une porte de service au nord par la '
     + 'ruelle. Escalader la grille : DD moyen, et les voisins regardent toujours.'],
    [806, 660, 'La fontaine et les dames',
     'Trois dames de la haute s’y retrouvent chaque après-midi pour badiner : Ysolde de Marsan, '
     + 'la jeune veuve Célie, et une cousine dont personne ne retient le nom. Elles savent tout '
     + 'du quartier avant tout le monde et le racontent à qui les amuse. Un PJ bien mis en tire '
     + 'trois rumeurs vraies et une fausse ; un PJ mal mis se fait éconduire — et signaler.'],
    [400, 700, 'Le guet privé',
     'Le quartier paie sa propre patrouille : deux hommes, une ronde toutes les vingt minutes. '
     + 'Ils ne verbalisent pas, ils raccompagnent — fermement — quiconque n’a pas l’air d’avoir '
     + 'les moyens d’être là.'],
  ];
  pts.forEach(([x, y, titre, desc], i) => {
    num(c, { x, y, num: i + 1 });
    c.cle.push({ num: i + 1, titre, desc });
  });
  return c;
}

const cartes = [marche(), villeHaute()];
const paquet = {};
for (const c of cartes) {
  paquet[c.id] = { id: c.id, nom: c.nom, campagne: c.campagne, maj: c.maj, json: JSON.stringify(c) };
  console.log(c.nom + ' : ' + c.elements.length + ' éléments, ' + c.cle.length + ' points de clé, '
    + c.taille.w + '×' + c.taille.h + ' px ('
    + Math.round(c.taille.w / CELL * M_PAR_CASE) + '×' + Math.round(c.taille.h / CELL * M_PAR_CASE) + ' m)');
  fs.writeFileSync(OUT + '/' + c.id + '.json', JSON.stringify(c, null, 1));
}
fs.writeFileSync(OUT + '/paquet-cartes.json', JSON.stringify(paquet));
console.log('\nÉcrit dans ' + OUT);
