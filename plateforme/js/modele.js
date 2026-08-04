/* ============================================================
   Cartographe — modèle de données
   Une carte est un objet JSON. Le SVG n'est qu'un rendu de cet objet
   (voir rendu.js), ce qui rend les cartes rééditables et versionnables.
   Chargé en script classique : expose window.KJ.modele
   ============================================================ */
window.KJ = window.KJ || {};
KJ.modele = (function () {

  const FORMAT = 1;
  let seq = 0;
  const uid = (p) => (p || 'e') + '_' + Date.now().toString(36) + (seq++).toString(36);

  /* ---------- palette de symboles de mobilier ----------
     w/h = dimensions par défaut en unités monde (1 case = 40 par défaut) */
  const SYMBOLES = [
    { id: 'lit',        nom: 'Lit',            w: 30, h: 55 },
    { id: 'table',      nom: 'Table',          w: 70, h: 34 },
    { id: 'tablelongue',nom: 'Table longue',   w: 200, h: 40 },
    { id: 'chaise',     nom: 'Chaise',         w: 14, h: 14 },
    { id: 'coffre',     nom: 'Coffre',         w: 26, h: 16 },
    { id: 'armoire',    nom: 'Armoire',        w: 34, h: 18 },
    { id: 'tonneau',    nom: 'Tonneau',        w: 18, h: 18 },
    { id: 'athre',      nom: 'Cheminée',       w: 20, h: 55 },
    { id: 'paillasse',  nom: "Paillasse d'alchimie", w: 26, h: 64 },
    { id: 'etagere',    nom: 'Étagère',        w: 12, h: 48 },
    { id: 'tapis',      nom: 'Tapis',          w: 60, h: 90 },
    { id: 'autel',      nom: 'Autel',          w: 40, h: 24 },
    { id: 'ecritoire',  nom: 'Écritoire',      w: 50, h: 32 },
    { id: 'escalier',   nom: 'Escalier droit', w: 40, h: 120 },
    { id: 'escalierdemi', nom: 'Escalier en arc', w: 116, h: 116 },
    { id: 'puits',      nom: 'Puits',          w: 30, h: 30 },
    { id: 'trappe',     nom: 'Trappe (visible)', w: 36, h: 36 },
    { id: 'arbre',      nom: 'Arbre',          w: 28, h: 28 },
    { id: 'maison',     nom: 'Maison (vue de dessus)', w: 44, h: 30 },
    { id: 'colline',    nom: 'Colline (courbes de niveau)', w: 220, h: 150 },
    { id: 'tableau',    nom: 'Tableau au mur', w: 32, h: 12 },
    { id: 'miroir',     nom: 'Miroir',         w: 26, h: 14 },
    { id: 'statue',     nom: 'Statue',         w: 26, h: 34 },
    { id: 'tombe',      nom: 'Tombe',          w: 24, h: 30 },
    // formes libres : marquer une case sans nommer l'objet (repères abstraits)
    { id: 'frond',       nom: 'Rond',           w: 20, h: 20 },
    { id: 'frondplein',  nom: 'Rond plein',     w: 16, h: 16 },
    { id: 'fcarre',      nom: 'Carré',          w: 20, h: 20 },
    { id: 'fcarreplein', nom: 'Carré plein',    w: 16, h: 16 },
    { id: 'ftriangle',   nom: 'Triangle',       w: 20, h: 20 },
    { id: 'flosange',    nom: 'Losange',        w: 20, h: 20 },
    { id: 'fcroix',      nom: 'Croix (X)',      w: 18, h: 18 },
    { id: 'fplus',       nom: 'Plus (+)',       w: 18, h: 18 },
    { id: 'fetoile',     nom: 'Étoile',         w: 20, h: 20 },
    { id: 'fpoint',      nom: 'Point',          w: 12, h: 12 },
    { id: 'fexclam',     nom: 'Marque « ! »',   w: 14, h: 20 },
    { id: 'fquest',      nom: 'Marque « ? »',   w: 14, h: 20 },
  ];
  const symbole = (id) => SYMBOLES.find(s => s.id === id) || SYMBOLES[0];

  /* ---------- calques ----------
     Chaque type d'élément appartient à un calque, ce qui pilote
     l'ordre de rendu et la visibilité (et le masquage en vue joueurs). */
  const CALQUES = [
    { id: 'structure',   nom: 'Murs & pièces', types: ['piece', 'mur', 'porte', 'fenetre'] },
    { id: 'mobilier',    nom: 'Mobilier',      types: ['objet'] },
    { id: 'annotations', nom: 'Annotations',   types: ['numero', 'texte', 'lumiere'] },
    { id: 'portails',    nom: 'Portails',      types: ['portail'] },
    // icônes vers une illustration (créature, lieu) : réservées au MJ, comme les secrets
    { id: 'illustrations', nom: 'Images',      types: ['image'], mj: true },
    { id: 'secrets',     nom: 'Secrets (MJ)',  types: ['secret'], mj: true },
  ];
  const calqueDe = (type) => (CALQUES.find(c => c.types.includes(type)) || CALQUES[0]).id;
  const estSecret = (type) => calqueDe(type) === 'secrets';

  /* ---------- création ---------- */
  function nouvelleCarte(o) {
    o = o || {};
    return {
      format: FORMAT,
      id: o.id || uid('carte'),
      nom: o.nom || 'Nouvelle carte',
      campagne: o.campagne || 'Forêt Noire',
      taille: { w: o.w || 800, h: o.h || 600 },
      grille: { cell: o.cell === undefined ? 40 : o.cell, metres: o.metres || 1.5 },
      elements: [],
      cle: [],            // [{ num, titre, desc }] — la clé numérotée du lieu
      pins: [],           // [{ x, y, vers, label }] — portails pour la table de jeu
      maj: Date.now(),
    };
  }

  /* Gabarits d'éléments : géométrie minimale + valeurs par défaut. */
  function nouvelElement(type, p) {
    p = p || {};
    const base = { id: uid(type), type: type };
    switch (type) {
      // ep : épaisseur des murs de la pièce (défaut 5). Un mur anormalement épais
      // est un indice narratif : il peut cacher un passage.
      case 'piece':   return Object.assign(base, { x: 0, y: 0, w: 160, h: 120, nom: '', ep: 5 }, p);
      case 'mur':     return Object.assign(base, { x1: 0, y1: 0, x2: 100, y2: 0, ep: 5 }, p);
      case 'porte':   return Object.assign(base, { x: 0, y: 0, o: 'h', l: 30, style: 'simple', sens: 1 }, p);
      case 'fenetre': return Object.assign(base, { x: 0, y: 0, o: 'h', l: 32 }, p);
      case 'objet': {
        const s = symbole(p.sym || 'table');
        return Object.assign(base, { sym: s.id, x: 0, y: 0, w: s.w, h: s.h, rot: 0 }, p);
      }
      case 'numero':  return Object.assign(base, { x: 0, y: 0, num: 1 }, p);
      case 'texte':   return Object.assign(base, { x: 0, y: 0, texte: 'Texte', style: 'lbl', rot: 0 }, p);
      case 'lumiere': return Object.assign(base, { x: 0, y: 0 }, p);
      // auto : révélation automatique aux joueurs quand un PJ entre dans la pièce qui
      // contient l'élément (voir table.js, verifierDeclencheurs) — activée par défaut ;
      // un élément qui ne doit jamais se révéler tout seul (une trappe secrète, par ex.)
      // la désactive et reste uniquement révélable à la main (clic droit, en mode Jeu).
      case 'secret':  return Object.assign(base, { x: 0, y: 0, w: 40, h: 20, nature: 'trappe', auto: true }, p);
      // portail : lien vers une autre carte (cliquable en mode Jeu)
      case 'portail': return Object.assign(base, { x: 0, y: 0, vers: '', label: '' }, p);
      // image : icône vers une illustration du dépôt (créature, lieu), cliquable en mode Jeu
      case 'image':   return Object.assign(base, { x: 0, y: 0, w: 26, h: 26, src: '', nom: '', auto: true }, p);
      default: throw new Error('Type inconnu : ' + type);
    }
  }

  /* ---------- manipulation ---------- */
  function ajouter(carte, el) { carte.elements.push(el); carte.maj = Date.now(); return el; }
  function supprimer(carte, id) {
    carte.elements = carte.elements.filter(e => e.id !== id);
    carte.maj = Date.now();
  }
  const trouver = (carte, id) => carte.elements.find(e => e.id === id);

  /* Boîte englobante d'un élément, en coordonnées monde.
     Sert au hit-testing, aux poignées et au déplacement. */
  function boite(el) {
    switch (el.type) {
      case 'piece': case 'secret':
        return { x: el.x, y: el.y, w: el.w, h: el.h };
      case 'objet': case 'image':
        return { x: el.x - el.w / 2, y: el.y - el.h / 2, w: el.w, h: el.h };
      case 'mur': {
        const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
        return { x: x - 4, y: y - 4, w: Math.abs(el.x2 - el.x1) + 8, h: Math.abs(el.y2 - el.y1) + 8 };
      }
      case 'porte': case 'fenetre': {
        const l = el.l, e = 12;
        return el.o === 'h'
          ? { x: el.x - l / 2, y: el.y - e / 2, w: l, h: e }
          : { x: el.x - e / 2, y: el.y - l / 2, w: e, h: l };
      }
      case 'numero':  return { x: el.x - 11, y: el.y - 11, w: 22, h: 22 };
      case 'portail': return { x: el.x - 11, y: el.y - 11, w: 22, h: 22 };
      case 'lumiere': return { x: el.x - 8, y: el.y - 8, w: 16, h: 16 };
      case 'texte':   return { x: el.x - 40, y: el.y - 9, w: 80, h: 18 };
      default:        return { x: el.x || 0, y: el.y || 0, w: 10, h: 10 };
    }
  }

  /* Déplacement relatif — chaque type a sa propre géométrie. */
  function deplacer(el, dx, dy) {
    if (el.type === 'mur') { el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy; }
    else { el.x += dx; el.y += dy; }
  }

  /* Éléments redimensionnables par poignée. */
  const redimensionnable = (el) => ['piece', 'objet', 'secret'].includes(el.type);

  /* ---------- ordre de rendu ---------- */
  function parCalque(carte) {
    const out = {};
    for (const c of CALQUES) out[c.id] = [];
    for (const el of carte.elements) out[calqueDe(el.type)].push(el);
    return out;
  }

  /* ---------- sérialisation / validation ---------- */
  function versJSON(carte) { return JSON.stringify(carte, null, 2); }

  function depuisJSON(txt) {
    const c = typeof txt === 'string' ? JSON.parse(txt) : txt;
    if (!c || typeof c !== 'object') throw new Error('Fichier illisible.');
    if (!c.taille || !Array.isArray(c.elements)) throw new Error('Ce fichier n’est pas une carte Cartographe.');
    // complétion défensive des champs ajoutés après coup
    c.format = c.format || FORMAT;
    c.id = c.id || uid('carte');
    c.nom = c.nom || 'Carte importée';
    c.grille = c.grille || { cell: 40, metres: 1.5 };
    if (c.grille.cell === undefined) c.grille.cell = 40;
    if (c.grille.metres === undefined) c.grille.metres = 1.5;
    c.cle = c.cle || [];
    for (const el of c.elements) if (!el.id) el.id = uid(el.type || 'e');
    /* Migration : les portails étaient stockés à part, dans « pins ». Ils sont
       désormais des éléments comme les autres — donc éditables, déplaçables,
       annulables. On convertit à la lecture : les anciens fichiers restent valides. */
    if (Array.isArray(c.pins) && c.pins.length) {
      for (const p of c.pins)
        c.elements.push(nouvelElement('portail', { x: p.x, y: p.y, vers: p.vers, label: p.label || '' }));
    }
    c.pins = [];
    /* Filet de sécurité : un élément ponctuel posé hors du plan (clic dans le fond du
       canevas, hors du parchemin) reste invisible et inatteignable dans l'éditeur — le
       viewBox du SVG le clippe — mais flotte, visible, en mode Jeu, où rien ne le clippe.
       poser() l'empêche désormais à la création ; ceci corrige les fichiers déjà touchés. */
    const PONCTUELS = ['objet', 'numero', 'texte', 'lumiere', 'portail', 'image'];
    for (const el of c.elements) {
      if (PONCTUELS.includes(el.type)) {
        el.x = Math.min(Math.max(el.x, 0), c.taille.w);
        el.y = Math.min(Math.max(el.y, 0), c.taille.h);
      }
    }
    return c;
  }

  /* ---------- campagnes ----------
     La campagne est le « dossier » d'une carte. Une carte sans campagne tombe
     dans un groupe nommé plutôt que de disparaître de l'affichage. */
  const SANS_CAMPAGNE = 'Sans campagne';
  function campagneDe(carte) {
    const c = ((carte && carte.campagne) || '').trim();
    return c || SANS_CAMPAGNE;
  }
  /* { "Forêt Noire": [carte, carte], "Autre": [carte] } */
  function parCampagne(cartes) {
    const g = {};
    for (const c of cartes) {
      const k = campagneDe(c);
      (g[k] = g[k] || []).push(c);
    }
    return g;
  }
  /* Noms de campagnes triés alphabétiquement, « Sans campagne » en dernier. */
  function listeCampagnes(cartes) {
    return Object.keys(parCampagne(cartes)).sort((a, b) => {
      if (a === SANS_CAMPAGNE) return 1;
      if (b === SANS_CAMPAGNE) return -1;
      return a.localeCompare(b, 'fr', { sensitivity: 'base' });
    });
  }

  /* ---------- aimantation ---------- */
  function snap(v, cell, demi) {
    if (!cell) return Math.round(v);
    const pas = demi ? cell / 2 : cell;
    return Math.round(v / pas) * pas;
  }

  return {
    FORMAT, SYMBOLES, CALQUES, symbole, calqueDe, estSecret,
    nouvelleCarte, nouvelElement, ajouter, supprimer, trouver,
    boite, deplacer, redimensionnable, parCalque,
    versJSON, depuisJSON, snap, uid,
    SANS_CAMPAGNE, campagneDe, parCampagne, listeCampagnes,
  };
})();
