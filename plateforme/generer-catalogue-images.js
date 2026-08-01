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

function lister(dir) {
  let out = [];
  for (const nom of fs.readdirSync(dir, { withFileTypes: true })) {
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
  return { fichier: rel, nom: joli(path.basename(rel)), dossier: dossier === '.' ? '' : dossier };
});

const catalogue = {
  _lisez_moi: "Généré par generer-catalogue-images.js à partir du contenu de plateforme/images/. "
    + "Ne modifie ce fichier à la main que ponctuellement : relance le script après tout ajout, "
    + "il régénère la liste en entier.",
  images,
};

fs.writeFileSync(path.join(DOSSIER, 'index.json'), JSON.stringify(catalogue, null, 2) + '\n');
console.log(images.length + ' image(s) cataloguée(s) dans images/index.json.');
