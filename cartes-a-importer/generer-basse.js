/* Cathay — Ville basse. Quartier pauvre et dense : ruelles étroites propices aux
   embuscades, un canal, deux tavernes, des commerces, et la route de la caserne au sud.

   TOUT est défini EN CASES et converti en pixels à la fin (CELL). C'est ce qui permet
   de livrer la carte à la même échelle que dungeon K et la Ville haute (cell=20) sans
   avoir à retoucher une seule coordonnée : une ruelle large d'une case le reste. */
const fs = require('fs');
const OUT = process.env.CLAUDE_JOB_DIR + '/tmp';
const CELL = 20, M_PAR_CASE = 1.5;
const LARG = 76, HAUT = 60;                  // en cases → 114 × 90 m
const ID = 'cathay-ville-basse';
const CAMPAGNE = 'Roland';

let n = 0;
const uid = (p) => p + '_b' + (n++).toString(36);
const K = (v) => Math.round(v * CELL);       // cases → pixels

const c = { format: 1, id: ID, nom: 'Cathay — Ville basse', campagne: CAMPAGNE,
  taille: { w: LARG * CELL, h: HAUT * CELL }, grille: { cell: CELL, metres: M_PAR_CASE },
  elements: [], cle: [], pins: [], maj: Date.now() };

const push = (el) => { el.id = uid(el.type); c.elements.push(el); return el; };
// tous les helpers prennent des CASES
const piece = (x, y, w, h, o) => push(Object.assign({ type: 'piece', ep: 2,
  x: K(x), y: K(y), w: K(w), h: K(h) }, o));
const voie = (x1, y1, x2, y2, l, sol) => push({ type: 'voie',
  x1: K(x1), y1: K(y1), x2: K(x2), y2: K(y2), l: K(l), sol: sol });
const objet = (sym, x, y, w, h, rot) => push({ type: 'objet', sym: sym,
  x: K(x), y: K(y), w: K(w), h: K(h), rot: rot || 0 });
const porte = (x, y, or, l, style) => push({ type: 'porte', x: K(x), y: K(y),
  o: or, l: K(l), style: style || 'simple', sens: 1 });
const texte = (x, y, t, taille) => push({ type: 'texte', x: K(x), y: K(y), texte: t,
  taille: Math.round(taille * CELL / 20) });
const portail = (x, y, label, vers) => push({ type: 'portail', x: K(x), y: K(y), label, vers });
const numero = (x, y, num) => push({ type: 'numero', x: K(x), y: K(y), num });

/* ---------- garde-fou de placement (en cases) ---------- */
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
/* r et marge en CASES.
   surVoie : le mobilier de rue (charrette, caisses, banc, réverbère) est PRÉCISÉMENT
   censé être sur la chaussée. Sans cette distinction le garde-fou les refusait tous
   — il ne doit vérifier que les bâtiments pour eux. */
function libre(r, marge, surVoie) {
  const m = marge == null ? 0.6 : marge;
  if (r.x < m || r.y < m || r.x + r.w > LARG - m || r.y + r.h > HAUT - m) return false;
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
               [r.x + r.w / 2, r.y + r.h / 2], [r.x + r.w / 2, r.y], [r.x + r.w / 2, r.y + r.h],
               [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2]];
  for (const e of c.elements) {
    if (e.type === 'voie') {
      if (surVoie) continue;
      const demi = (e.l / CELL) / 2 + m;
      if (pts.some(([x, y]) => distSeg(x, y, e.x1 / CELL, e.y1 / CELL, e.x2 / CELL, e.y2 / CELL) < demi))
        return false;
    } else if (e.type === 'piece') {
      const ex = e.x / CELL, ey = e.y / CELL, ew = e.w / CELL, eh = e.h / CELL;
      if (r.x < ex + ew + m && r.x + r.w > ex - m && r.y < ey + eh + m && r.y + r.h > ey - m)
        return false;
    }
  }
  return true;
}
function objetSiLibre(sym, x, y, w, h, rot, marge, surVoie) {
  if (!libre({ x: x - w / 2, y: y - h / 2, w, h }, marge == null ? 0.4 : marge, surVoie)) return false;
  objet(sym, x, y, w, h, rot); return true;
}

/* ============================================================
   1. LA VOIRIE — d'abord, parce que tout le reste s'y adosse.
   ============================================================ */
const RUE = 26, CANAL = 44;                  // ordonnées (cases) de la rue et du canal

// la Rue Basse : seule voie large du quartier, elle le traverse d'est en ouest
voie(0, RUE, LARG, RUE, 3, 'pave');
// le canal : eau stagnante, coupe le quartier en deux
voie(0, CANAL, LARG, CANAL, 3.5, 'eau');
// la montée vers le Marché (nord-ouest) et la descente vers la Caserne (sud)
voie(14, RUE, 11, 0, 2.5, 'pave');
voie(58, RUE, 58, HAUT, 2.5, 'pave');
// une traverse qui relie la rue au canal, puis franchit le pont de l'ouest
voie(20, RUE, 20, HAUT - 4, 2, 'pave');

/* --- LES RUELLES : 1 case de large, terre battue. Le cœur du quartier.
   Certaines débouchent, d'autres non : les IMPASSES sont le terrain d'embuscade
   (voir la clé, point 6). Une ruelle d'une case = deux personnes de front, pas trois. */
const RUELLES = [
  // au nord de la rue : trame serrée avec deux impasses
  [6, 4, 6, RUE], [24, 7, 24, RUE], [44, 9, 44, RUE], [68, 4, 68, RUE],
  [6, 14, 24, 14], [44, 12, 68, 12], [24, 19, 44, 19],
  [32, RUE, 32, 17], [52, RUE, 52, 13],                    // ← impasses
  // entre la rue et le canal
  [10, RUE, 10, CANAL], [30, RUE, 30, 39], [48, RUE, 48, CANAL], [70, RUE, 70, CANAL],
  [10, 34, 30, 34], [48, 36, 70, 36], [30, 31, 42, 31],
  [40, RUE, 40, 33], [64, CANAL, 64, 30],                  // ← impasses
  // au sud du canal : quelques masures et l'arrière du poste de garde
  [30, 48, 30, HAUT - 3], [30, 52, 52, 52], [46, 52, 46, 48],
];
for (const [x1, y1, x2, y2] of RUELLES) voie(x1, y1, x2, y2, 1, 'terre');

// les ponts sur le canal, aux deux seuls points de franchissement
objet('pont', 20, CANAL, 2.6, 4.6, 0);
objet('pont', 58, CANAL, 2.6, 4.6, 0);

/* ============================================================
   2. LES ÉTABLISSEMENTS NOMMÉS — posés en premier, aux bons endroits :
   les tavernes et boutiques choisissent leur emplacement, pas le remplissage.
   ============================================================ */
// [x, y, w, h, nom, sol, cote ('n'/'s' par rapport à la rue), enseigne]
const LIEUX = [
  [16, 17, 13, 7.5, 'Taverne « Le Magne »', 'bois', 'n', true],
  [34, 17, 8.5, 7.5, 'Boucherie Tarnec',    'bois', 'n', true],
  [54, 18, 8, 6.5,   'Herboristerie',       'bois', 'n', true],
  [60, 28, 7.5, 6,   'Fripier Vasco',       '',     's', true],
  [12, 28, 7, 6,     'Poissonnier',         '',     's', true],
  [72, 18, 0, 0, '', '', '', false],                       // écarté (hors trame)
];
const poses = [];
for (const [x, y, w, h, nom, sol, cote, ens] of LIEUX) {
  if (!w) continue;
  const el = piece(x, y, w, h, { nom, sol: sol || undefined, ep: 3 });
  poses.push(nom);
  // porte sur la Rue Basse
  const yp = cote === 'n' ? y + h : y;
  porte(x + w / 2, yp, 'h', 1.4, 'simple');
  if (ens) objet('enseigne', x + w - 1.2, yp + (cote === 'n' ? -1.1 : 1.1), 1.5, 1.2, cote === 'n' ? 0 : 180);
}

/* « La Tonne Percée » : la taverne miteuse ne donne PAS sur la rue — elle se cache
   au fond d'une impasse. C'est tout l'intérêt du lieu, et ça se lit sur le plan. */
const TONNE = piece(33.5, 28.5, 9, 5.5, { nom: 'La Tonne Percée', sol: 'bois', ep: 3 });
porte(38, 31.2, 'v', 1.4, 'simple');          // porte à l'est, sur l'impasse x=40
objet('enseigne', 39, 29.6, 1.5, 1.2, 90);
objet('tonneau', 39.2, 33, 1.2, 1.2, 0);
objet('tonneau', 37.6, 33.2, 1.1, 1.1, 0);

// le poste de garde, au sud, sur la route de la caserne
piece(52, 53, 9, 5, { nom: 'Poste de garde', ep: 3 });
porte(56.5, 53, 'h', 1.4, 'simple');

/* ============================================================
   3. LA PLACE DU PUITS — le seul dégagement du quartier, point de rencontre.
   ============================================================ */
/* Emplacement CHOISI PAR TEST : posée à l'aveugle, la place chevauchait Le Magne.
   On essaie plusieurs creux de la trame et on garde le premier qui tient vraiment. */
let placePuits = null;
for (const [x, y, w, h] of [[21.5, 28.5, 7, 4.5], [42.5, 20, 7, 4.5], [21.5, 36, 7, 4.5],
                            [50, 28.5, 7, 4.5], [12, 19, 7, 4.5]]) {
  if (libre({ x, y, w, h }, 0.5)) {
    piece(x, y, w, h, { forme: 'rond', sol: 'pave', ep: 2 });
    placePuits = [x + w / 2, y + h / 2];
    objet('puits', placePuits[0], placePuits[1], 2.2, 2.2, 0);
    break;
  }
}
if (!placePuits) { placePuits = [27, 30]; console.log('  (!) aucun creux pour la place du puits'); }

/* ============================================================
   4. LE REMPLISSAGE — masures anonymes. Le balayage prend ce qui reste entre
   les ruelles : c'est lui qui fabrique la densité, pas une liste écrite à la main.
   ============================================================ */
function semerMasures(tailles, max, noms) {
  let k = 0;
  for (let y = 2; y < HAUT - 4 && k < max; y += 1)
    for (let x = 1; x < LARG - 4 && k < max; x += 1)
      for (const [w, h] of tailles)
        if (libre({ x, y, w, h }, 0.7)) {
          piece(x, y, w, h, { nom: noms[k] || '', ep: 2 });
          k++; break;
        }
  return k;
}
const NOMS_MASURES = ['Prêteur sur gages', '', 'Ferrailleur', '', 'Boulanger Sourde',
  '', '', 'Tanneur', '', '', 'Écrivain public', '', '', '', '', '', '', '', '', '',
  '', '', '', '', '', '', '', '', '', ''];
const masures = semerMasures([[8, 6], [6.5, 5], [5, 4.5], [4, 3.5]], 30, NOMS_MASURES);

/* ============================================================
   5. LA VIE DU QUARTIER
   ============================================================ */
// mobilier de rue : sur la chaussée (surVoie = true), mais jamais dans un mur
const charrettes = [[24, 26], [50, 26], [66, 26.8], [20, 36]].filter(([x, y]) =>
  objetSiLibre('charrette', x, y, 3, 1.8, 12, 0.25, true)).length;
const caisses = (() => { let k = 0;
  for (const [x, y] of [[15, 25], [36, 25], [56, 25], [45, 27.2], [63, 27.2],
                        [10, 34], [48, 36], [30, 50], [20, 42], [70, 30]])
    if (objetSiLibre('caisses', x, y, 1.3, 1.3, 0, 0.15, true)) k++;
  return k; })();
// deux bancs près du puits, deux réverbères sur la rue : le quartier est mal éclairé,
// c'est voulu — les ruelles n'en ont aucun
objetSiLibre('banc', placePuits[0] - 2.2, placePuits[1] + 1.4, 2, .7, 0, .15, true);
objetSiLibre('banc', placePuits[0] + 2.2, placePuits[1] + 1.4, 2, .7, 0, .15, true);
objetSiLibre('reverbere', 14, 24.6, .9, .9, 0, .1, true);
objetSiLibre('reverbere', 58, 24.6, .9, .9, 0, .1, true);
// arbres : rares et rabougris, sur les berges du canal
const arbres = [[8, 46.6], [38, 46.6], [68, 46.6], [26, 41.4]].filter(([x, y]) =>
  objetSiLibre('arbre', x, y, 2.4, 2.4, 0, 0.25, true)).length;
// les habitants : sur la rue et autour du puits, pas dans les ruelles (elles sont vides
// — c'est ce qui les rend inquiétantes)
const PASSANTS = [[10, 25], [19, 25], [28, 25.2], [37, 25], [47, 25.2], [55, 25], [65, 25],
                  [24, 22], [29, 21.5], [26, 24], [43, 27], [52, 27.3], [70, 27],
                  [20, 30], [59, 48], [21, 47]];
for (const [x, y] of PASSANTS) objet('passant', x, y, .8, .8, 0);

/* ============================================================
   6. LIAISONS ET LÉGENDES
   ============================================================ */
/* Le portail porte DÉJÀ son étiquette : le texte en doublon se superposait à elle.
   Idem pour « Caserne ↓ », qui tombait dans le Poste de garde. */
portail(11, 1.4, 'Place du Marché', 'cathay-marche');
portail(58, HAUT - 1.4, 'Caserne', 'cathay-caserne');
texte(47, RUE + 0.9, 'RUE BASSE', 22);          // sous la rue, hors de l'Herboristerie
texte(13, HAUT - 1.6, 'VILLE BASSE — Cathay', 26);
texte(46, CANAL - 1.6, 'le Canal noir', 18);

/* ============================================================
   7. LA CLÉ — ce qui rend la carte jouable.
   ============================================================ */
const CLE = [
  [22, 21, 'Taverne « Le Magne »',
   'Le cœur du quartier : trente personnes le soir, deux salles, une arrière-cour qui '
   + 'donne sur la ruelle nord. Magne lui-même tient le comptoir — un ancien portefaix, '
   + 'énorme, qui sait qui dort où et le dit pour trois chopes. Il ne tolère aucune lame '
   + 'sortie chez lui et fait respecter ça lui-même. Refuge sûr : tant que les PJ sont '
   + 'chez Magne, personne ne vient les chercher.'],
  [38, 21, 'Boucherie Tarnec',
   'Crochets, billot, saumure. Tarnec découpe la nuit parce qu’il fait plus frais. Pour '
   + 'quinze sous il fait disparaître ce qu’on lui apporte et ne demande rien — mais il '
   + 's’en souvient, et il parle si la garde insiste. Une trappe sous le billot descend '
   + 'à une cave qui rejoint le canal.'],
  [58, 21.5, 'Herboristerie',
   'Devanture honnête : tisanes, cataplasmes, onguents. Sous le comptoir, de quoi faire '
   + 'dormir, vomir ou taire. La vieille Sève vend à qui saigne déjà et pose peu de '
   + 'questions, mais note chaque visage. Elle connaît l’herboriste de la Ville haute et '
   + 'la déteste.'],
  [37, 30, 'La Tonne Percée',
   'La taverne miteuse, au fond de l’impasse — on n’y arrive pas par hasard. Douze places, '
   + 'du vin coupé, et la table du fond réservée au receleur du quartier (point 9). '
   + 'C’est ici qu’on achète une information, un passe-partout ou un couteau. Toute '
   + 'bagarre y tourne au général en deux rounds. NOM PROVISOIRE : à changer si tu en as '
   + 'un meilleur, c’est un simple libellé.'],
  [placePuits[0] - 2.5, placePuits[1] + 0.2, 'Le puits communal',
   'Le seul dégagement du quartier, et donc le seul endroit où tout le monde se croise. '
   + 'Les rumeurs y circulent avant partout ailleurs : trois d’affilée pour qui aide à '
   + 'porter un seau. Le puits est profond de dix mètres et communique avec la nappe du '
   + 'canal — on y a déjà repêché plus qu’un seau.'],
  [52, 16, 'Les impasses',
   'Quatre ruelles ne débouchent pas : elles sont là pour ça. Une ruelle fait UNE case de '
   + 'large — deux personnes de front au maximum, pas de troisième, pas de contournement, '
   + 'aucune ligne de vue au-delà du premier angle. Pour tendre une embuscade : les '
   + 'guetteurs aux angles, la sortie bloquée derrière. Repérer le piège avant d’entrer '
   + 'demande un jet difficile ; une fois engagé, il faut passer sur quelqu’un.'],
  [46, 45.6, 'Le Canal noir',
   'Eau lente, un mètre cinquante de fond, et tout ce qu’on veut oublier. Deux ponts '
   + 'seulement (ouest et sud) : ce sont les goulets du quartier, et la garde le sait — '
   + 'bloquer les deux referme la Ville basse comme une nasse. Nager est possible mais on '
   + 'ressort couvert d’une odeur que tout le monde reconnaît.'],
  [56, 51.4, 'Le poste de garde du sud',
   'Six hommes en rotation, sur la route de la caserne. Ils se sont installés là exprès : '
   + 'de la caserne, on est en Ville basse en quatre minutes. Ils patrouillent la Rue '
   + 'Basse toutes les demi-heures mais n’entrent JAMAIS dans les ruelles à moins de '
   + 'quatre. Le sergent Bracque se laisse acheter, pas son caporal.'],
  [40, 31.6, 'La bande du canal',
   'Une quinzaine de gamins et trois adultes, menés par un receleur qui tient la table du '
   + 'fond de la Tonne Percée. Ils vivent du marché (les tire-laine du point 5 de la Place '
   + 'du Marché, ce sont eux) et connaissent chaque impasse. Hostiles si on les gêne, '
   + 'achetables toujours, loyaux jamais. Ils constituent la meilleure source '
   + 'd’information du quartier et le plus sûr moyen d’être suivi.'],
];
CLE.forEach(([x, y, titre, desc], i) => { numero(x, y, i + 1); c.cle.push({ num: i + 1, titre, desc }); });

/* ---------- sortie ---------- */
const impasses = RUELLES.length;
console.log(c.nom);
console.log('  ' + c.taille.w + '×' + c.taille.h + ' px  (cell=' + CELL + ' → ' + LARG + '×' + HAUT
  + ' cases = ' + Math.round(LARG * M_PAR_CASE) + '×' + Math.round(HAUT * M_PAR_CASE) + ' m)');
console.log('  ' + c.elements.length + ' elements, ' + c.cle.length + ' points de cle');
console.log('  ' + impasses + ' segments de ruelle, ' + masures + ' masures semees, '
  + poses.length + ' commerces nommes, ' + charrettes + ' charrettes, ' + caisses + ' tas de caisses, '
  + arbres + ' arbres');
fs.writeFileSync(OUT + '/' + ID + '.json', JSON.stringify(c, null, 1));
fs.writeFileSync(OUT + '/paquet-basse.json', JSON.stringify({
  [ID]: { id: ID, nom: c.nom, campagne: c.campagne, maj: c.maj, json: JSON.stringify(c) } }));
