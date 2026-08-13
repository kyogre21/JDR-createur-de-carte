---
name: dev-mobile
description: Développer et VÉRIFIER le comportement mobile de Cartographie (bibliothèque, éditeur, table de jeu) — pièges de plateforme, cibles tactiles, PWA, et banc de mesure dans un vrai navigateur. À charger pour tout travail touchant au tactile, au petit écran, à l'installation de l'appli, ou dès qu'un problème est signalé « sur portable ».
---

# Développement mobile — Cartographie

Volet **technique** du mobile. Pour l'ergonomie, la hiérarchie des publics et l'habillage,
charger aussi `design-interface` : ce skill-ci ne parle que de ce qui se mesure et de ce qui
casse sur les plateformes réelles.

Règle d'or : **sur mobile, on ne raisonne pas, on mesure.** Le CSS a l'air juste et le
navigateur en fait autre chose. Un « ça devrait aller » sur une cible tactile est
systématiquement faux.

## 1. Le banc de mesure

Chrome est installé (`C:\Program Files\Google\Chrome\Application\chrome.exe`) et suffit.
Le banc vit dans le dossier de travail temporaire : `preparer-audit.js` + `sonde-mobile.html`
copient les pages, y injectent une sonde, et Chrome les rend à un viewport étroit.

```bash
node preparer-audit.js          # copie css/, js/ et les 3 pages, injecte la sonde
"$CHROME" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=3000 \
  --user-data-dir=... --window-size=500,800 --dump-dom "file:///.../index.html"
```

La sonde rapporte, pour chaque page : débordement horizontal, cibles tactiles sous 40 px,
champs sous 16 px, éléments interactifs qui se chevauchent, hauteur du corps contre le
viewport, `overscroll-behavior`, `touch-action` de la surface de carte, couleur de surbrillance
d'appui.

### Quatre pièges du banc, tous rencontrés

- **`--dump-dom` capture à la fin du chargement, avant les minuteurs.** Une sonde dans un
  `setTimeout` ne tire jamais. **La rendre synchrone.**
- **L'application réécrit le corps de la page** (porte d'entrée, écran de panne) et efface la
  sonde avant le dump. Écrire le résultat AUSSI dans un attribut de `<html>`, hors d'atteinte.
- **Capturer la sortie de `--dump-dom` depuis PowerShell rend une chaîne vide.** Passer par
  l'outil Bash et un `| node -e` pour l'extraction.
- **`fs.cpSync` du dossier complet fait planter node** (`STATUS_STACK_BUFFER_OVERRUN`) :
  `plateforme/images/` pèse 77 Mo. Ne copier que `css/`, `js/` et les pages.

### Fausse alerte à ne PAS « corriger »

Un élément dont le rectangle dépasse le bord droit **n'est pas forcément inatteignable** :
`#barre-mj` et `#outils` sont des conteneurs en `overflow-x:auto`, on y accède en faisant
défiler la barre. La sonde les signale, à tort. Vérifier le conteneur parent avant de toucher
à quoi que ce soit.

## 2. Pièges de plateforme, et ce que le projet en a décidé

**`overscroll-behavior`** — laissé à `auto`, tirer vers le bas **recharge la page**. À la
table, un déplacement de carte vers le bas devient une perte de session. `none` sur
`html,body`.

**Zoom d'iOS au focus** — un `input`/`select`/`textarea` sous **16 px** fait zoomer la page
au focus, et iOS ne dézoome jamais. Le panneau de l'éditeur en compte une quinzaine à
13,3 px. Sur mobile : `font-size:16px` sur tous les champs.

**`height:100%`** se résout sur le viewport *large* : la barre d'URL du téléphone masque alors
le bas de l'application. Préférer `100dvh` là où la hauteur pilote la mise en page.

**`safe-area-inset`** — encoche et barre gestuelle des iPhone recouvrent les barres collées
aux bords. Prévoir `env(safe-area-inset-*)` sur ce qui touche le haut ou le bas.

**`touch-action:none`** est OBLIGATOIRE sur `#canevas` et `#scene` : sans lui le navigateur
avale les gestes avant les `pointerdown`. C'est en place, ne pas retirer.

**`user-scalable=no` sur `editeur.html` et `table.html` est VOLONTAIRE** : ces pages
implémentent leur propre pincement, celui du navigateur le combattrait. iOS l'ignore de toute
façon depuis iOS 10 — donc le pincement maison doit rester correct par lui-même. Ne pas
« corriger » ces balises. `index.html` reste zoomable, c'est une page de texte.

**Surbrillance d'appui** — la valeur par défaut est un voile sombre, invisible sur un thème
sombre : aucun retour au doigt. Donner un `:active` explicite.

**Canvas et `devicePixelRatio`** — toujours multiplier la surface par le ratio et garder la
taille CSS (voir `qr.js`), sinon tout est flou sur téléphone.

## 3. Cibles tactiles

44 px est le minimum utilisable. Mais un retour utilisateur explicite existe : *« on ne voit
pas bien les boutons, la carte prend toute la place »* — donc **la hauteur des barres est un
compromis assumé**, pas un oubli. Arbitrage retenu :

- fiches de la bibliothèque et actions de joueur : **44 px**, elles ne coûtent rien ;
- barre MJ de la table : **34 px de haut** conservés pour rendre de la hauteur à la carte,
  mais **jamais moins de 40 px de large** — les boutons-icônes d'une trentaine de pixels
  étaient le vrai problème ;
- une action destructrice ne se met jamais au contact d'une action courante.

## 4. Ce qui ne se vérifie PAS ici

Le banc ne remplace pas un appareil. Ne jamais annoncer comme vérifié :

- le pincement à deux doigts et l'inertie réels ;
- l'invite d'installation PWA (`beforeinstallprompt` ne se déclenche pas en headless) ;
- la lecture d'un QR par un appareil photo ;
- le zoom d'iOS au focus (Chrome ne le reproduit pas — se fier à la règle des 16 px) ;
- l'encoche et la barre gestuelle.

Pour ces points : livrer, dire explicitement ce qui reste à confirmer, et demander ce que
l'utilisateur voit. Ne pas conclure à sa place.

## 5. Non négociable

**Aucune popup de navigateur.** `confirm`, `alert` et `prompt` sont interdits : illisibles sur
téléphone, muselables par un réglage du navigateur, et impossibles dans une application
empaquetée. Tout passe par `KJ.dlg.confirmer / info / saisir`. Cette exigence vient d'un
retour utilisateur direct et sans ambiguïté.

Corollaire : une confirmation coûte un geste. Si l'action est annulable (`↶`), supprimer la
confirmation et se reposer sur l'historique — c'est ce qui a été fait pour les jetons.
