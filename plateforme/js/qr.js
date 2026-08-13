/* ============================================================
   Cartographe — générateur de QR code
   Chargé en script classique : expose window.KJ.qr

   POURQUOI ÉCRIRE ÇA PLUTÔT QUE D'APPELER UN SERVICE :
   - l'application est autonome et doit fonctionner hors ligne (service worker) ;
   - envoyer l'URL d'une partie à un service tiers, c'est la publier.

   Portée volontairement limitée : mode OCTET, correction d'erreur M, versions 1 à 10
   (jusqu'à 216 octets, soit une URL de 216 caractères). C'est tout ce dont on a
   besoin pour un lien de partie, et ça évite des tables de dix fois la taille.
   Conforme ISO/IEC 18004 — vérifié module par module contre une implémentation
   de référence (voir les tests).
   ============================================================ */
window.KJ = window.KJ || {};
KJ.qr = (function () {

  /* ---------- arithmétique de Galois GF(256), polynôme 0x11d ----------
     Reed-Solomon travaille dans ce corps : les tables d'exponentielle et de
     logarithme évitent de refaire les multiplications à la main. */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function tables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  // polynôme générateur de degré n (produit des (x - α^i))
  function generateur(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const suivant = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        suivant[j] ^= g[j];
        suivant[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = suivant;
    }
    return g;
  }
  // reste de la division du message par le générateur = codets de correction
  function correction(donnees, nbEc) {
    const g = generateur(nbEc);
    const reste = new Uint8Array(nbEc);
    for (const octet of donnees) {
      const facteur = octet ^ reste[0];
      reste.copyWithin(0, 1);
      reste[nbEc - 1] = 0;
      if (facteur !== 0)
        for (let i = 0; i < nbEc; i++) reste[i] ^= mul(g[i + 1], facteur);
    }
    return reste;
  }

  /* ---------- tables de la norme (correction M, versions 1 à 10) ----------
     [ec par bloc, nb blocs groupe 1, données par bloc g1, nb blocs g2, données g2]
     Somme (g1×d1 + g2×d2) = capacité en octets de données de la version. */
  const VERSIONS = {
    1:  [10, 1, 16, 0, 0],
    2:  [16, 1, 28, 0, 0],
    3:  [26, 1, 44, 0, 0],
    4:  [18, 2, 32, 0, 0],
    5:  [24, 2, 43, 0, 0],
    6:  [16, 4, 27, 0, 0],
    7:  [18, 4, 31, 0, 0],
    8:  [22, 2, 38, 2, 39],
    9:  [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
  };
  const capacite = (v) => { const [, b1, d1, b2, d2] = VERSIONS[v]; return b1 * d1 + b2 * d2; };
  // centres des motifs d'alignement (aucun en version 1)
  const ALIGNEMENTS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };
  const VERSION_MAX = 10;

  /* ---------- texte → octets (UTF-8) ---------- */
  function enOctets(texte) {
    const s = String(texte);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    // repli : encodage UTF-8 à la main (environnements sans TextEncoder)
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  }

  /* ---------- flux de bits ---------- */
  function Bits() { this.octets = []; this.n = 0; }
  Bits.prototype.pousser = function (valeur, largeur) {
    for (let i = largeur - 1; i >= 0; i--) {
      if ((this.n & 7) === 0) this.octets.push(0);
      if ((valeur >>> i) & 1) this.octets[this.octets.length - 1] |= 0x80 >>> (this.n & 7);
      this.n++;
    }
  };

  /* ---------- suite de codets : en-tête, remplissage, correction, entrelacement ---------- */
  function codets(texte) {
    const donnees = enOctets(texte);
    let version = 0;
    for (let v = 1; v <= VERSION_MAX; v++) {
      // en-tête = 4 bits de mode + compteur (8 bits jusqu'à la v9, 16 ensuite)
      const enTete = 4 + (v < 10 ? 8 : 16);
      if (Math.ceil((enTete + donnees.length * 8) / 8) <= capacite(v)) { version = v; break; }
    }
    if (!version) {
      // capacité réelle : les octets utiles, en-tête déduit — et non les codets bruts
      const max = Math.floor((capacite(VERSION_MAX) * 8 - (4 + 16)) / 8);
      throw new Error('QR : ' + donnees.length + ' octets, trop long (' + max + ' maximum)');
    }

    const total = capacite(version);
    const b = new Bits();
    b.pousser(4, 4);                                    // mode octet
    b.pousser(donnees.length, version < 10 ? 8 : 16);
    for (const o of donnees) b.pousser(o, 8);
    // terminateur (jusqu'à 4 bits), puis calage sur l'octet
    b.pousser(0, Math.min(4, total * 8 - b.n));
    while (b.n & 7) b.pousser(0, 1);
    // remplissage alterné imposé par la norme
    const bourrage = [0xec, 0x11];
    for (let i = 0; b.octets.length < total; i++) b.octets.push(bourrage[i & 1]);

    // découpage en blocs, correction par bloc, puis entrelacement
    const [nbEc, b1, d1, b2, d2] = VERSIONS[version];
    const blocs = [], ecs = [];
    let p = 0;
    for (let i = 0; i < b1 + b2; i++) {
      const taille = i < b1 ? d1 : d2;
      const bloc = Uint8Array.from(b.octets.slice(p, p + taille));
      p += taille;
      blocs.push(bloc); ecs.push(correction(bloc, nbEc));
    }
    const suite = [];
    for (let i = 0; i < Math.max(d1, d2); i++)
      for (const bloc of blocs) if (i < bloc.length) suite.push(bloc[i]);
    for (let i = 0; i < nbEc; i++) for (const ec of ecs) suite.push(ec[i]);
    return { version: version, octets: Uint8Array.from(suite) };
  }

  /* ---------- informations de format et de version (codes BCH) ---------- */
  function bchFormat(donnees) {          // 5 bits → 15 bits, générateur 0x537
    let v = donnees << 10;
    for (let i = 14; i >= 10; i--) if ((v >>> i) & 1) v ^= 0x537 << (i - 10);
    return ((donnees << 10) | v) ^ 0x5412;   // masque imposé par la norme
  }
  function bchVersion(v) {               // 6 bits → 18 bits, générateur 0x1f25
    let x = v << 12;
    for (let i = 17; i >= 12; i--) if ((x >>> i) & 1) x ^= 0x1f25 << (i - 12);
    return (v << 12) | x;
  }

  /* ---------- construction de la matrice ---------- */
  function matriceVide(n) {
    const m = [], reserve = [];
    for (let i = 0; i < n; i++) { m.push(new Uint8Array(n)); reserve.push(new Uint8Array(n)); }
    return { m: m, reserve: reserve, n: n };
  }
  function poserMotifs(g, version) {
    const n = g.n, m = g.m, r = g.reserve;
    const bloc = (x0, y0, w, h, val) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++)
        if (x >= 0 && y >= 0 && x < n && y < n) { m[y][x] = val; r[y][x] = 1; }
    };
    // trois motifs de repérage + leurs séparateurs
    for (const [cx, cy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      bloc(cx - 1, cy - 1, 9, 9, 0);
      bloc(cx, cy, 7, 7, 1); bloc(cx + 1, cy + 1, 5, 5, 0); bloc(cx + 2, cy + 2, 3, 3, 1);
    }
    // motifs de synchronisation (ligne et colonne 6)
    for (let i = 8; i < n - 8; i++) {
      const v = i % 2 === 0 ? 1 : 0;
      m[6][i] = v; r[6][i] = 1;
      m[i][6] = v; r[i][6] = 1;
    }
    // motifs d'alignement, sauf là où ils recouvriraient un motif de repérage
    const a = ALIGNEMENTS[version];
    for (const cy of a) for (const cx of a) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === a[a.length - 1])
          || (cy === 6 && cx === a[a.length - 1])) continue;
      bloc(cx - 2, cy - 2, 5, 5, 1); bloc(cx - 1, cy - 1, 3, 3, 0); bloc(cx, cy, 1, 1, 1);
    }
    // module toujours noir + zones réservées aux informations de format
    m[n - 8][8] = 1; r[n - 8][8] = 1;
    for (let i = 0; i < 9; i++) { r[8][i] = 1; r[i][8] = 1; }
    for (let i = 0; i < 8; i++) { r[8][n - 1 - i] = 1; r[n - 1 - i][8] = 1; }
    // informations de version (à partir de la version 7)
    if (version >= 7) {
      const bits = bchVersion(version);
      for (let i = 0; i < 18; i++) {
        const b = (bits >>> i) & 1;
        m[Math.floor(i / 3)][n - 11 + (i % 3)] = b; r[Math.floor(i / 3)][n - 11 + (i % 3)] = 1;
        m[n - 11 + (i % 3)][Math.floor(i / 3)] = b; r[n - 11 + (i % 3)][Math.floor(i / 3)] = 1;
      }
    }
  }
  // parcours en zigzag : colonnes par paires, de droite à gauche, en sautant la colonne 6
  function poserDonnees(g, octets) {
    const n = g.n, m = g.m, r = g.reserve;
    let bit = 0, montant = true;
    const total = octets.length * 8;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;           // la colonne de synchronisation ne compte pas
      for (let k = 0; k < n; k++) {
        const y = montant ? n - 1 - k : k;
        for (const x of [col, col - 1]) {
          if (r[y][x]) continue;
          let v = 0;
          if (bit < total) v = (octets[bit >>> 3] >>> (7 - (bit & 7))) & 1;
          m[y][x] = v; bit++;
        }
      }
      montant = !montant;
    }
  }
  const MASQUES = [
    (i, j) => (i + j) % 2 === 0,
    (i, j) => i % 2 === 0,
    (i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
  ];
  /* Pénalités de la norme : on essaie les 8 masques et on garde le moins pénalisé.
     C'est ce qui évite les grandes plages uniformes et les motifs qui imitent un
     repère — donc les codes que les lecteurs peinent à accrocher. */
  function penalite(m, n) {
    let p = 0;
    // 1. suites de 5 modules identiques ou plus
    for (let i = 0; i < n; i++)
      for (const ligne of [true, false]) {
        let precedent = -1, suite = 0;
        for (let j = 0; j < n; j++) {
          const v = ligne ? m[i][j] : m[j][i];
          if (v === precedent) suite++;
          else { if (suite >= 5) p += 3 + (suite - 5); precedent = v; suite = 1; }
        }
        if (suite >= 5) p += 3 + (suite - 5);
      }
    // 2. carrés 2×2 de même couleur
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
      const v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) p += 3;
    }
    // 3. motifs 1:1:3:1:1 suivis (ou précédés) de 4 modules clairs
    const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++)
      for (const ligne of [true, false]) {
        let egalA = true, egalB = true;
        for (let k = 0; k < 11; k++) {
          const v = ligne ? m[i][j + k] : m[j + k][i];
          if (v !== A[k]) egalA = false;
          if (v !== B[k]) egalB = false;
        }
        if (egalA) p += 40;
        if (egalB) p += 40;
      }
    // 4. écart à 50 % de modules sombres
    let sombres = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sombres += m[i][j];
    p += Math.floor(Math.abs(sombres * 100 / (n * n) - 50) / 5) * 10;
    return p;
  }
  /* Les 15 bits de format sont écrits DEUX FOIS, et l'ordre compte : le bit 0 est le
     bit de poids faible, et chaque copie le parcourt dans un sens différent. Les avoir
     intervertis donnait un code illisible — et écrasait au passage le module toujours
     sombre, que la copie verticale ne doit pas atteindre. */
  function poserFormat(m, n, masque) {
    const bits = bchFormat((0 /* niveau M = 00 */ << 3) | masque);
    for (let i = 0; i < 15; i++) {
      const b = (bits >>> i) & 1;
      // copie verticale, colonne 8 : du haut vers le bas, en sautant la ligne 6
      if (i < 6) m[i][8] = b;
      else if (i < 8) m[i + 1][8] = b;
      else m[n - 15 + i][8] = b;
      // copie horizontale, ligne 8 : depuis le bord droit, puis retour vers la gauche
      if (i < 8) m[8][n - 1 - i] = b;
      else if (i === 8) m[8][7] = b;
      else m[8][14 - i] = b;
    }
  }

  /* Matrice de modules du QR code : tableau n×n de 0 (clair) et 1 (sombre),
     SANS marge — c'est à l'affichage d'ajouter la zone de silence. */
  function matrice(texte) {
    const { version, octets } = codets(texte);
    let meilleure = null, meilleurScore = Infinity;
    for (let masque = 0; masque < 8; masque++) {
      const g = matriceVide(17 + 4 * version);
      poserMotifs(g, version);
      poserDonnees(g, octets);
      for (let i = 0; i < g.n; i++) for (let j = 0; j < g.n; j++)
        if (!g.reserve[i][j] && MASQUES[masque](i, j)) g.m[i][j] ^= 1;
      poserFormat(g.m, g.n, masque);
      const score = penalite(g.m, g.n);
      if (score < meilleurScore) { meilleurScore = score; meilleure = g.m; }
    }
    return meilleure;
  }

  /* ---------- rendu ----------
     Toujours SOMBRE SUR CLAIR, avec la zone de silence de 4 modules : beaucoup de
     lecteurs refusent un code inversé ou collé au bord, et l'application a un thème
     sombre — il ne faut donc surtout pas reprendre ses couleurs ici. */
  const MARGE = 4;

  function dansCanvas(canvas, texte, opts) {
    opts = opts || {};
    const m = matrice(texte);
    const n = m.length, tot = n + MARGE * 2;
    // taille de module ENTIÈRE : un module à 3,7 px donne des bords baveux que les
    // lecteurs accrochent mal
    const cible = opts.taille || 240;
    const echelle = Math.max(2, Math.floor(cible / tot));
    const px = tot * echelle;
    const ratio = (window.devicePixelRatio || 1);
    canvas.width = px * ratio; canvas.height = px * ratio;
    canvas.style.width = px + 'px'; canvas.style.height = px + 'px';
    const c = canvas.getContext('2d');
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, px, px);
    c.fillStyle = '#000000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      if (m[y][x]) c.fillRect((x + MARGE) * echelle, (y + MARGE) * echelle, echelle, echelle);
    return px;
  }

  return { matrice: matrice, dansCanvas: dansCanvas, MARGE: MARGE };
})();
