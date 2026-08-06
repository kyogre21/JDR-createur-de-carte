/* ============================================================
   Régénère images/index.json à partir de ce qui se trouve
   réellement dans plateforme/images/ (sous-dossiers compris).
   À lancer après avoir déposé des fichiers ou des dossiers d'images :
     node generer-catalogue-images.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const DOSSIER = path.join(__dirname, 'images');
const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const VIGNETTES = 'vignettes';   // sous-dossier généré par generer-vignettes.ps1

function lister(dir) {
  let out = [];
  for (const nom of fs.readdirSync(dir, { withFileTypes: true })) {
    if (nom.name === VIGNETTES) continue;   // jamais cataloguer les vignettes elles-mêmes
    const p = path.join(dir, nom.name);
    if (nom.isDirectory()) out = out.concat(lister(p));
    else if (EXT.has(path.extname(nom.name).toLowerCase())) out.push(p);
  }
  return out;
}

function joli(basename) {
  const sansExt = basename.replace(/\.[^.]+$/, '');
  return sansExt.charAt(0).toUpperCase() + sansExt.slice(1);
}

const fichiers = lister(DOSSIER).sort();
const images = fichiers.map((abs) => {
  const rel = path.relative(DOSSIER, abs).split(path.sep).join('/'); // toujours des / dans le JSON
  const dossier = path.dirname(rel);
  // dossier séparé (plutôt que mélangé au nom) : l'éditeur s'en sert pour proposer
  // un sélecteur de dossier dans le panneau, au lieu d'une seule liste à plat.
  /* vignette : version 160 px utilisée par les palettes (26 px à l'écran). On ne
     l'inscrit que si le fichier existe vraiment — sans elle, les palettes
     retombent sur l'original, donc le catalogue reste valable sans vignettes. */
  // l'extension d'origine reste dans le nom : « a.png » et « a.jpg » du même
  // dossier produisaient sinon la même vignette (l'une affichait l'autre)
  const vig = VIGNETTES + '/' + rel.replace(/\.([^./]+)$/, '.$1.jpg');
  const e = { fichier: rel, nom: joli(path.basename(rel)), dossier: dossier === '.' ? '' : dossier };
  if (fs.existsSync(path.join(DOSSIER, vig))) e.vignette = vig;
  return e;
});

const catalogue = {
  _lisez_moi: "Généré par generer-catalogue-images.js à partir du contenu de plateforme/images/. "
    + "Ne modifie ce fichier à la main que ponctuellement : relance le script après tout ajout, "
    + "il régénère la liste en entier.",
  images,
};

fs.writeFileSync(path.join(DOSSIER, 'index.json'), JSON.stringify(catalogue, null, 2) + '\n');
console.log(images.length + ' image(s) cataloguée(s) dans images/index.json.');
