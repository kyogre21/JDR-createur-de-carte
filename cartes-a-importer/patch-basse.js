/* Deux retouches demandées sur la Ville basse TELLE QU'ELLE EST dans le compte :
   1. supprimer le canal (et ce qui n'a plus de sens sans lui : les deux ponts, son
      libellé, son point de clé, et les mentions du canal dans les autres points) ;
   2. éloigner la Boucherie de la Taverne « Le Magne ».
   Le reste de la carte n'est pas touché — y compris les modifications de l'utilisateur. */
const fs = require('fs');
const OUT = process.env.CLAUDE_JOB_DIR + '/tmp';
const rec = JSON.parse(fs.readFileSync(OUT + '/basse-live.json', 'utf8'));
const c = JSON.parse(rec.json);
const CEL = c.grille.cell;              // 10 px par case dans la version de l'utilisateur
const K = (cases) => cases * CEL;
const avant = c.elements.length;
const journal = [];

/* ---------- 1. LE CANAL ---------- */
const canaux = c.elements.filter(e => e.type === 'voie' && e.sol === 'eau');
const yCanal = canaux.length ? (canaux[0].y1 + canaux[0].y2) / 2 : null;
const aVirer = new Set(canaux.map(e => e.id));
// les ponts n'ont plus rien à franchir
for (const e of c.elements)
  if (e.type === 'objet' && e.sym === 'pont') aVirer.add(e.id);
// le libellé « le Canal noir »
for (const e of c.elements)
  if (e.type === 'texte' && /canal/i.test(e.texte || '')) aVirer.add(e.id);
journal.push('canal supprime : ' + canaux.length + ' voie(s) d eau, '
  + c.elements.filter(e => e.sym === 'pont').length + ' pont(s), '
  + c.elements.filter(e => e.type === 'texte' && /canal/i.test(e.texte || '')).length + ' libelle(s)');

/* Le point de clé du canal disparaît, et les suivants sont renumérotés : une clé
   qui saute du 6 au 8 est une clé cassée. */
const iCanal = c.cle.findIndex(k => /canal/i.test(k.titre));
if (iCanal >= 0) {
  const numMort = c.cle[iCanal].num;
  for (const e of c.elements) if (e.type === 'numero' && e.num === numMort) aVirer.add(e.id);
  c.cle.splice(iCanal, 1);
  // décale tout ce qui vient après, dans la clé ET sur le plan
  c.cle.forEach(k => { if (k.num > numMort) k.num -= 1; });
  for (const e of c.elements) if (e.type === 'numero' && e.num > numMort) e.num -= 1;
  journal.push('point de cle ' + numMort + ' (le canal) retire, points suivants renumerotes');
}

/* Les autres points parlaient du canal : sans lui, ces phrases sont fausses. */
const REECRITURES = [
  [/Une trappe sous le billot descend\s*à une cave qui rejoint le canal\./,
   'Une trappe sous le billot descend à une cave qui rejoint les égouts.'],
  [/Le puits est profond de dix mètres et communique avec la nappe du\s*canal — on y a déjà repêché plus qu’un seau\./,
   'Le puits est profond de dix mètres et donne sur une nappe souterraine — on y a déjà repêché plus qu’un seau.'],
  [/La bande du canal/, 'La bande de la Basse'],
  [/menés par un receleur qui tient la table du\s*fond de la Tonne Percée/,
   'menés par un receleur qui tient la table du fond de la Tonne Percée'],
];
let reecrits = 0;
for (const k of c.cle) for (const [re, par] of REECRITURES) {
  for (const champ of ['titre', 'desc']) {
    const av = k[champ];
    k[champ] = k[champ].replace(re, par);
    if (k[champ] !== av) reecrits++;
  }
}
journal.push(reecrits + ' mention(s) du canal reecrite(s) dans la cle');

/* ---------- 2. LA BOUCHERIE ---------- */
const magne = c.elements.find(e => e.nom && /Magne/.test(e.nom));
const bouch = c.elements.find(e => e.nom && /Boucherie/.test(e.nom));
const cx = (e) => e.x + e.w / 2, cy = (e) => e.y + e.h / 2;
const ecartAvant = Math.round(Math.hypot(cx(bouch) - cx(magne), cy(bouch) - cy(magne)) / CEL);

// ce qui accompagne la boucherie : sa porte, son enseigne, son numéro
const proche = (e, ref, d) => Math.hypot((e.x || 0) - ref.x, (e.y || 0) - ref.y) < d;
const numBouch = (c.cle.find(k => /Boucherie/.test(k.titre)) || {}).num;
const suite = {
  porte: c.elements.find(e => e.type === 'porte'
    && Math.abs(e.x - cx(bouch)) < K(2) && Math.abs(e.y - (bouch.y + bouch.h)) < K(2)),
  enseigne: c.elements.find(e => e.type === 'objet' && e.sym === 'enseigne'
    && proche(e, { x: bouch.x + bouch.w, y: bouch.y + bouch.h }, K(3))),
  numero: c.elements.find(e => e.type === 'numero' && e.num === numBouch),
};

/* Emplacement d'arrivée : cherché, pas devine. Il doit border la Rue Basse, être
   loin du Magne, et ne heurter aucun LIEU NOMMÉ ni aucune voie. Les masures
   anonymes qui gênent sont supprimées — c'est du remplissage, pas du contenu. */
const nommes = c.elements.filter(e => e.type === 'piece' && e.nom && e !== bouch);
const voies = c.elements.filter(e => e.type === 'voie' && !aVirer.has(e.id));
const masures = c.elements.filter(e => e.type === 'piece' && !e.nom && e.forme !== 'rond');
function distSeg(px, py, v) {
  const dx = v.x2 - v.x1, dy = v.y2 - v.y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - v.x1) * dx + (py - v.y1) * dy) / L2)) : 0;
  return Math.hypot(px - (v.x1 + t * dx), py - (v.y1 + t * dy));
}
function evaluer(x, y) {
  const r = { x, y, w: bouch.w, h: bouch.h };
  const m = K(0.7);
  if (r.x < m || r.y < m || r.x + r.w > c.taille.w - m || r.y + r.h > c.taille.h - m) return null;
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
               [r.x + r.w / 2, r.y + r.h / 2]];
  for (const v of voies) if (pts.some(([px, py]) => distSeg(px, py, v) < v.l / 2 + K(0.15))) return null;
  for (const b of nommes)
    if (r.x < b.x + b.w + m && r.x + r.w > b.x - m && r.y < b.y + b.h + m && r.y + r.h > b.y - m) return null;
  // masures a evacuer
  const gene = masures.filter(b => r.x < b.x + b.w + m && r.x + r.w > b.x - m
    && r.y < b.y + b.h + m && r.y + r.h > b.y - m);
  return { r, gene };
}
// on balaie les deux rives de la Rue Basse, d'est en ouest, en exigeant 18 cases
// d'écart minimum avec la taverne
const yRue = 26 * CEL;
let cible = null;
const candidats = [];
for (let x = c.taille.w - K(10); x > K(2) && !cible; x -= K(1))
  for (const y of [yRue - K(1.75) - bouch.h, yRue + K(1.75)]) {
    const ev = evaluer(x, y);
    if (!ev) continue;
    const d = Math.hypot(x + bouch.w / 2 - cx(magne), y + bouch.h / 2 - cy(magne)) / CEL;
    candidats.push({ ev, d });
    if (d >= 18 && ev.gene.length <= 3) { cible = { ev, d }; break; }
  }
if (!cible && candidats.length) cible = candidats.sort((a, b) => b.d - a.d)[0];

if (cible) {
  const { r, gene } = cible.ev;
  const dx = r.x - bouch.x, dy = r.y - bouch.y;
  bouch.x = r.x; bouch.y = r.y;
  for (const e of [suite.porte, suite.enseigne, suite.numero])
    if (e) { e.x += dx; e.y += dy; }
  // la porte doit rester sur la façade qui donne sur la rue
  if (suite.porte) {
    const nord = r.y + r.h < yRue;
    suite.porte.y = nord ? r.y + r.h : r.y;
    suite.porte.x = r.x + r.w / 2;
    if (suite.enseigne) {
      suite.enseigne.x = r.x + r.w - K(1.2);
      suite.enseigne.y = suite.porte.y + (nord ? -K(1.1) : K(1.1));
      suite.enseigne.rot = nord ? 0 : 180;
    }
  }
  gene.forEach(b => aVirer.add(b.id));
  journal.push('Boucherie deplacee en ' + r.x + ',' + r.y + ' — ecart au Magne : '
    + ecartAvant + ' -> ' + Math.round(cible.d) + ' cases ; '
    + gene.length + ' masure(s) anonyme(s) evacuee(s)');
} else journal.push('(!) aucun emplacement trouve pour la Boucherie');

/* ---------- application ---------- */
c.elements = c.elements.filter(e => !aVirer.has(e.id));
console.log('Retouches :');
journal.forEach(l => console.log('  - ' + l));
console.log('  elements : ' + avant + ' -> ' + c.elements.length);
console.log('  points de cle : ' + c.cle.length + '  (' + c.cle.map(k => k.num).join(',') + ')');

fs.writeFileSync(OUT + '/cathay-ville-basse-v2.json', JSON.stringify(c, null, 1));
fs.writeFileSync(OUT + '/paquet-basse-v2.json', JSON.stringify({
  'cathay-ville-basse': { id: c.id, nom: rec.nom, campagne: rec.campagne, maj: Date.now(),
    json: JSON.stringify(c) } }));

/* ---------- 3. RATTRAPAGE DES TAILLES DE TEXTE ----------
   La carte a été livrée à cell=20 puis ramenée à cell=10 : la conversion de l'éditeur
   ne mettait pas les tailles de texte à l'échelle (corrigé depuis dans editeur.js).
   Les libellés sont donc restés deux fois trop gros et le titre débordait à gauche. */
const CELL_ORIGINE = 20;
const kTexte = CEL / CELL_ORIGINE;
if (kTexte !== 1) {
  let nb = 0;
  for (const e of c.elements) {
    if (e.type === 'texte' && e.taille) { e.taille = Math.max(6, Math.round(e.taille * kTexte)); nb++; }
    if (e.nomTaille) { e.nomTaille = Math.max(6, Math.round(e.nomTaille * kTexte)); nb++; }
  }
  console.log('  - ' + nb + ' taille(s) de texte remise(s) a l echelle (x' + kTexte + ')');
  // le titre, désormais plus petit, peut retrouver une marge confortable
  const titre = c.elements.find(e => e.type === 'texte' && /VILLE BASSE/.test(e.texte || ''));
  if (titre) { titre.x = Math.round(K(11)); console.log('  - titre recale (il etait rogne par le bord gauche)'); }
  fs.writeFileSync(OUT + '/cathay-ville-basse-v2.json', JSON.stringify(c, null, 1));
  fs.writeFileSync(OUT + '/paquet-basse-v2.json', JSON.stringify({
    'cathay-ville-basse': { id: c.id, nom: rec.nom, campagne: rec.campagne, maj: Date.now(),
      json: JSON.stringify(c) } }));
}
