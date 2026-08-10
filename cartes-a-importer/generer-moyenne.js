/* Cathay — Ville moyenne. Le quartier des artisans qui ont réussi : rues droites et
   larges (ni les ruelles de la Basse, ni l'avenue dallée de la Haute), une église qui
   domine son parvis, une auberge à cour, des boutiques et des habitations.

   Tout est défini EN CASES et converti en pixels à la fin. */
const fs = require('fs');
const OUT = process.env.CLAUDE_JOB_DIR + '/tmp';
const CELL = 20, M_PAR_CASE = 1.5;
const LARG = 56, HAUT = 44;                  // → 84 × 66 m
const ID = 'cathay-ville-moyenne';
const CAMPAGNE = 'Roland';

let n = 0;
const uid = (p) => p + '_m' + (n++).toString(36);
const K = (v) => Math.round(v * CELL);

const c = { format: 1, id: ID, nom: 'Cathay — Ville moyenne', campagne: CAMPAGNE,
  taille: { w: LARG * CELL, h: HAUT * CELL }, grille: { cell: CELL, metres: M_PAR_CASE },
  elements: [], cle: [], pins: [], maj: Date.now() };

const push = (el) => { el.id = uid(el.type); c.elements.push(el); return el; };
const piece = (x, y, w, h, o) => push(Object.assign({ type: 'piece', ep: 2,
  x: K(x), y: K(y), w: K(w), h: K(h) }, o));
const voie = (x1, y1, x2, y2, l, sol) => push({ type: 'voie',
  x1: K(x1), y1: K(y1), x2: K(x2), y2: K(y2), l: K(l), sol });
const objet = (sym, x, y, w, h, rot) => push({ type: 'objet', sym,
  x: K(x), y: K(y), w: K(w), h: K(h), rot: rot || 0 });
const porte = (x, y, or, l, style) => push({ type: 'porte', x: K(x), y: K(y),
  o: or, l: K(l), style: style || 'simple', sens: 1 });
const texte = (x, y, t, taille) => push({ type: 'texte', x: K(x), y: K(y), texte: t,
  taille: Math.round(taille * CELL / 20) });
const portail = (x, y, label, vers) => push({ type: 'portail', x: K(x), y: K(y), label, vers });
const numero = (x, y, num) => push({ type: 'numero', x: K(x), y: K(y), num });

/* ---------- garde-fou de placement (en cases) ----------
   surVoie : le mobilier de rue est censé être sur la chaussée ; on ne vérifie alors
   que les bâtiments. Une FAÇADE doit toucher la rue, donc les voies ne réclament
   qu'un cheveu de dégagement, pas la marge complète. */
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function libre(r, marge, surVoie) {
  const m = marge == null ? 0.6 : marge;
  if (r.x < m || r.y < m || r.x + r.w > LARG - m || r.y + r.h > HAUT - m) return false;
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
               [r.x + r.w / 2, r.y + r.h / 2], [r.x + r.w / 2, r.y], [r.x + r.w / 2, r.y + r.h],
               [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2]];
  for (const e of c.elements) {
    if (e.type === 'voie') {
      if (surVoie) continue;
      const demi = (e.l / CELL) / 2 + 0.15;
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
   1. LA VOIRIE — des rues droites et larges. C'est la signature du quartier :
   on n'y tend pas d'embuscade comme en Ville basse, et on n'y parade pas comme
   en Ville haute. On y travaille et on y circule.
   ============================================================ */
const RUE = 14;                              // la rue principale, d'est en ouest
const AXE_O = 12, AXE_E = 42;                // les deux axes nord-sud
voie(0, RUE, LARG, RUE, 2.5, 'pave');
voie(AXE_O, 0, AXE_O, HAUT, 2.5, 'pave');    // ← descend vers la Place du Marché
voie(AXE_E, 0, AXE_E, HAUT, 2, 'pave');
voie(0, 35, LARG, 35, 1.5, 'terre');         // desserte arrière, derrière l'église
voie(28, 35, 28, HAUT, 1.5, 'terre');

/* ============================================================
   2. L'ÉGLISE DE CAREL — plan en croix, face au nord sur son parvis.
   Composée de volumes qui se TOUCHENT sans se chevaucher (nef, clocher, deux
   chapelles) : c'est ce qui donne la silhouette cruciforme sans empiler les pièces.
   ============================================================ */
const PARVIS = piece(17, 15.6, 18, 3.2, { sol: 'pave', ep: 1 });
const CLOCHER = piece(24.5, 18.8, 4, 2.6, { ep: 4, sol: 'dalle' });
const NEF = piece(22, 21.4, 9, 13, { nom: 'Église de Carel', sol: 'dalle', ep: 4 });
const CHAP_O = piece(18, 25, 4, 5, { sol: 'dalle', ep: 3 });
const CHAP_E = piece(31, 25, 4, 5, { sol: 'dalle', ep: 3 });
porte(26.5, 21.4, 'h', 2, 'double');         // le grand portail, sous le clocher
porte(22, 27.5, 'v', 1.4, 'simple');         // vers la chapelle ouest
porte(31, 27.5, 'v', 1.4, 'simple');         // vers la chapelle est
objet('autel', 26.5, 32.4, 3, 1.8, 0);
objet('etagere', 24, 24, 0.9, 3.4, 0);       // stalles
objet('etagere', 29, 24, 0.9, 3.4, 0);
// pas de tapis : son style sort en rouge vif et volait la vedette a l eglise

// le presbytère : Carel habite à côté de son église, pas dedans
piece(36.5, 21.4, 5, 5, { nom: 'Presbytère', ep: 2, sol: 'bois' });
porte(39, 21.4, 'h', 1.4, 'simple');
objet('parterre', 39, 27.4, 3.4, 1.8, 0);

/* ============================================================
   3. L'AUBERGE — sur la rue principale, avec sa cour et ses écuries.
   ============================================================ */
const AUB = piece(44.5, 16, 9.5, 7.5, { nom: 'Auberge des Trois Clés', sol: 'bois', ep: 3, nomPos: 'bas' });
porte(49.2, 16, 'h', 1.6, 'simple');
objet('enseigne', 53, 17.1, 1.6, 1.3, 180);
const COUR = piece(44.5, 24.5, 9.5, 5, { nom: 'Cour et écuries', sol: 'terre', ep: 2 });
objet('charrette', 46.5, 27, 3, 1.8, 0);
objet('tonneau', 52.6, 26, 1.2, 1.2, 0);
objet('tonneau', 52.6, 27.6, 1.2, 1.2, 0);
objet('caisses', 50.5, 28.4, 1.4, 1.4, 0);

/* ============================================================
   4. LES BOUTIQUES — alignées sur la rue principale, côté nord.
   ============================================================ */
const BOUTIQUES = [
  [2.5, 6.5, 7, 6.2,  'Tailleur Mestre'],
  [15.5, 6.5, 7, 6.2, 'Mercerie Palot'],
  [24, 6.5, 6.5, 6.2, 'Chandelier Brenn'],
  [32.5, 6.5, 6.5, 6.2, 'Cordonnier Vidal'],
  [44.5, 6.5, 8, 6.2, 'Libraire Ancel'],
];
for (const [x, y, w, h, nom] of BOUTIQUES) {
  piece(x, y, w, h, { nom, sol: 'bois', ep: 2 });
  porte(x + w / 2, y + h, 'h', 1.4, 'simple');           // porte sur la rue, au sud
  objet('enseigne', x + w - 1.2, y + h - 1.1, 1.5, 1.2, 0);
}

/* ============================================================
   5. LES HABITATIONS — maisons régulières, plus grandes et plus espacées que les
   masures de la Ville basse. Le balayage remplit ce qui reste entre les rues.
   ============================================================ */
function semerMaisons(tailles, max) {
  let k = 0;
  for (let y = 1; y < HAUT - 3 && k < max; y += 1)
    for (let x = 1; x < LARG - 3 && k < max; x += 1)
      for (const [w, h] of tailles)
        // on garde le bas de la carte libre : c est la que se pose le titre
        if (y + h <= HAUT - 3.4 && libre({ x, y, w, h }, 0.9)) { piece(x, y, w, h, { ep: 2 }); k++; break; }
  return k;
}
const maisons = semerMaisons([[7, 6], [6, 5], [5, 4.5]], 22);

/* ============================================================
   6. LA VIE DU QUARTIER
   ============================================================ */
// une fontaine sur le parvis : le point de rencontre du quartier
objet('fontaine', 20, 17.2, 2.6, 2.6, 0);
let mobilier = 0;
// deux bancs et la fontaine sur le parvis : pose DIRECTE, ils y sont voulus
objet('banc', 22.5, 17.6, 2.2, .7, 0);
objet('banc', 31, 17.6, 2.2, .7, 0);
// bordure nord de la rue principale (chaussee 12.75..15.25) : y=13.4 laisse les facades
for (const [x, y] of [[8, 13.4], [20, 13.4], [33, 13.4], [46, 13.4], [12, 24], [12, 38], [42, 24], [42, 38]])
  if (objetSiLibre('reverbere', x, y, 1, 1, 0, .05, true)) mobilier++;
for (const [x, y] of [[9.5, 14.4], [37, 14.4], [12, 30], [42, 30]])
  if (objetSiLibre('charrette', x, y, 3, 1.8, 10, .05, true)) mobilier++;
for (const [x, y] of [[15.5, 20], [36.5, 19], [6.5, 20], [51, 33], [6, 33], [28, 40]])
  if (objetSiLibre('arbre', x, y, 2.6, 2.6, 0, .2, true)) mobilier++;
for (const [x, y] of [[21, 14], [29, 14], [45, 14], [12, 20], [12, 39], [42, 20],
                      [42, 39], [26, 17], [31, 17.2], [18.5, 17.6], [35, 36], [20, 36], [6, 14.6]])
  objet('passant', x, y, .8, .8, 0);

/* ============================================================
   7. LIAISONS ET LÉGENDES
   ============================================================ */
portail(AXE_O, HAUT - 1.2, 'Place du Marché', 'cathay-marche');
texte(AXE_O + 6.5, HAUT - 1.6, 'Place du Marché ↓', 18);
texte(LARG - 9, RUE - 1.4, 'RUE DES MERCIERS', 18);
texte(40, HAUT - 1.4, 'VILLE MOYENNE — Cathay', 24);

/* ============================================================
   8. LA CLÉ
   ============================================================ */
const CLE = [
  [49, 19.5, 'Auberge des Trois Clés',
   'Douze chambres propres, une salle où l’on peut parler sans crier, et une cour '
   + 'fermée la nuit — c’est là que descendent les marchands de passage et les gens qui '
   + 'ont de quoi payer mais pas de quoi se faire remarquer. L’aubergiste Ombrine loue '
   + 'aussi l’écurie à la journée et garde les bagages sans poser de questions. Elle '
   + 'tient un registre des arrivées que la garde peut consulter, et un second qu’elle '
   + 'ne montre à personne.'],
  [26.5, 26, 'Église de Carel',
   'La plus grande bâtisse du quartier : nef de neuf pas sur treize, clocher sur le '
   + 'portail, deux chapelles latérales. On y baptise, on y marie et on y enterre toute '
   + 'la Ville moyenne, et une partie de la Basse qui n’a pas d’église à elle. Le '
   + 'clocher voit par-dessus les toits : c’est le meilleur poste d’observation du '
   + 'quartier, et le seul moyen de voir venir quelque chose depuis la Porte Nord. '
   + 'Les chapelles latérales ferment à clé ; la nef reste ouverte jour et nuit.'],
  [38.8, 23.9, 'Le presbytère — Carel',
   'Carel tient l’église et vit ici, mur à mur avec elle. Il connaît chaque famille du '
   + 'quartier, ses dettes et ses secrets de confession — il ne les vend pas, mais il '
   + 'les pèse, et il choisit ses camps. Il abrite qui le lui demande dans les chapelles, '
   + 'y compris quand la garde cherche. Il attend qu’on lui rende ces services.'],
  [20, 19.8, 'Le parvis et la fontaine',
   'Le seul vrai dégagement du quartier : marché aux herbes le matin, badauds le reste '
   + 'du jour, annonces publiques depuis les marches de l’église. Toute nouvelle qui '
   + 'entre en Ville moyenne passe par ici avant midi.'],
  [28, 9.6, 'La rue des Merciers',
   'Cinq boutiques alignées : tailleur, mercerie, chandelier, cordonnier, libraire. Des '
   + 'artisans propriétaires de leur échoppe — ni les pauvres de la Basse, ni les '
   + 'fournisseurs de la Haute. Ils ouvrent au jour et ferment au crépuscule, tiennent '
   + 'des comptes écrits, et se connaissent tous. Faire fabriquer quelque chose ici '
   + 'coûte le prix juste et prend le temps qu’il faut.'],
  [48.5, 10.5, 'Libraire Ancel',
   'Livres, cartes, actes recopiés. Ancel sait lire quatre langues et fait l’écrivain '
   + 'pour ceux qui ne savent pas — donc il a copié la moitié des contrats du quartier '
   + 'et se souvient de ce qu’ils disaient. Il vend des cartes de la région, dont une '
   + 'de la ville qui est presque à jour.'],
  [7, 22, 'Les habitations',
   'Des maisons à un étage, une famille par maison, une courette derrière. On y dort la '
   + 'nuit et on y travaille le jour — la plupart de ces murs abritent un atelier au '
   + 'rez-de-chaussée. Le quartier se surveille lui-même : un inconnu qui rôde est '
   + 'remarqué en moins d’une heure et signalé à Carel ou à la garde.'],
  [28, 37, 'La desserte arrière',
   'La ruelle de terre qui passe derrière l’église et les maisons : livraisons, fosses, '
   + 'et le seul chemin pour entrer dans le quartier sans être vu de la rue principale. '
   + 'Elle est large d’une case et demie — on peut y passer une charrette, contrairement '
   + 'aux ruelles de la Ville basse.'],
];
CLE.forEach(([x, y, titre, desc], i) => { numero(x, y, i + 1); c.cle.push({ num: i + 1, titre, desc }); });

/* ---------- sortie ---------- */
const nommes = c.elements.filter(e => e.type === 'piece' && e.nom).length;
console.log(c.nom);
console.log('  ' + c.taille.w + '×' + c.taille.h + ' px  (cell=' + CELL + ' → ' + LARG + '×' + HAUT
  + ' cases = ' + Math.round(LARG * M_PAR_CASE) + '×' + Math.round(HAUT * M_PAR_CASE) + ' m)');
console.log('  ' + c.elements.length + ' elements, ' + c.cle.length + ' points de cle');
console.log('  ' + nommes + ' lieux nommes, ' + maisons + ' habitations semees, '
  + mobilier + ' elements de mobilier de rue');
fs.writeFileSync(OUT + '/' + ID + '.json', JSON.stringify(c, null, 1));
fs.writeFileSync(OUT + '/paquet-moyenne.json', JSON.stringify({
  [ID]: { id: ID, nom: c.nom, campagne: c.campagne, maj: c.maj, json: JSON.stringify(c) } }));
