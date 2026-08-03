---
name: design-interface
description: Concevoir et améliorer l'interface du Cartographe Knight (bibliothèque, éditeur, table de jeu) — sur PC et surtout sur mobile. À charger pour tout travail d'ergonomie, de mise en page, de lisibilité ou d'habillage.
---

# Design d'interface — Cartographe Knight

Rôle : designer d'interface du projet. L'application a trois pages (`index.html` bibliothèque,
`editeur.html` création, `table.html` jeu) et **trois publics** aux besoins très différents.
Le mobile n'est pas une déclinaison : c'est le terrain principal de jeu (les joueurs n'ont QUE
leur téléphone, et le MJ mène parfois du sien).

## Les trois publics, dans l'ordre de priorité mobile

1. **Joueur sur téléphone** (table.html?session=CODE, vue imposée) — il ne fait que : regarder,
   pincer/déplacer la carte, glisser SON jeton, taper une image révélée. Tout le reste doit
   disparaître de son écran, pas seulement être désactivé. Le moindre pixel d'interface en moins
   est gagné pour la carte.
2. **MJ sur téléphone** — mène une session en présentiel : changer de carte, peindre le
   brouillard, révéler (appui long), pinger (double-tap), déplacer des jetons. Les commandes
   doivent tomber sous le pouce, pas exiger de la précision.
3. **MJ sur PC** — prépare et mène ; seul public de l'éditeur. Densité acceptable, souris +
   clavier disponibles.

Avant toute proposition, dire pour lequel de ces publics on travaille. Une amélioration pour
l'un ne doit jamais dégrader les deux autres.

## Charte — ne pas réinventer

Tout est dans `plateforme/css/commun.css` (`:root`) : parchemin sombre `--parchemin #221b11`,
encre pâle `--encre #d3c5a4`, bordeaux `--sang #a8544c`, or `--or #c9a227`, fonds `--fond`,
`--panneau`, bordures `--bord`/`--bord-clair` ; UI en `--ui` (Bahnschrift), titres et noms de
lieux en `--serif` (Palatino, petites capitales pour la marque). C'est la charte des cartes de
campagne : l'interface reste **sobre et sombre pour ne jamais concurrencer la carte** — l'or
signale l'interactif et l'état actif, le bordeaux le danger/secret, rien d'autre n'a le droit
d'être saturé.

Règles d'usage : nouvelles couleurs interdites sans raison forte (en discuter d'abord) ; tout
nouveau composant se construit avec les variables existantes ; textes d'interface en français,
tutoiement, sans jargon (« Enregistrer », jamais « Sauvegarder les changements avec succès »).
Aucune dépendance : pas de CDN, pas de framework CSS, pas de police externe.

## Règles mobile (apprises ici, pas théoriques)

- **Cible tactile ≥ 44 px À L'ÉCRAN.** Attention au piège du zoom : tout ce qui vit dans
  `#monde` subit `transform:scale(cam.s)` — sa taille CSS est en unités monde, pas écran. La
  solution en place : halo `::before` contre-mis à l'échelle par `--inv = 1/cam.s` (posé par
  `appliquerCam()`). Toute nouvelle cible sur la carte DOIT reprendre ce mécanisme ; toute
  cible hors carte se mesure avec `getBoundingClientRect()` à 500 px de large.
- **`touch-action:none` sur la scène** = le navigateur ne synthétise plus rien de fiable :
  pas de double-clic garanti (d'où le double-tap détecté à la main dans `fin()`), zoom page
  désactivé (voulu). Ne jamais compter sur un geste synthétisé — l'implémenter avec les
  PointerEvents.
- **Gestes en place** (ne pas leur donner d'autre sens) : tap = agir (portail, image) ;
  glissé = déplacer (carte ou jeton) ; pincer = zoom ; double-tap = ping / édition de jeton
  (MJ) ; appui long = clic droit (révéler/cacher, supprimer avec confirmation au doigt).
- **Pas de survol porteur de sens** : `:hover` est un plus PC, jamais le seul chemin vers une
  information ou une action. Idem pour les raccourcis clavier (Ctrl+Z a son bouton).
- **Un élément plein écran ouvert par un geste** (lightbox, modale) doit ignorer les clics
  pendant ~500 ms après ouverture : le tap qui l'ouvre génère un clic fantôme qui la refermait
  (erreur n°22 du skill plateforme-cartes).
- **Une main, un pouce** : sur téléphone les commandes fréquentes vont en bas ou sur les bords,
  pas en haut au centre. La barre d'outils de la table se réorganise sous 820 px
  (`@media (max-width:820px)` dans table.html) — étendre ce point de rupture existant plutôt
  qu'en créer d'autres.
- **Jamais de défilement horizontal de page** ; le seul déplacement horizontal est celui de la
  carte dans la scène.

## Méthode de travail

1. **Auditer avant de dessiner.** Captures headless aux largeurs de référence :
   ```
   chrome --headless=new --screenshot=sortie.png --window-size=500,900 URL   (mobile)
   chrome --headless=new --screenshot=sortie.png --window-size=1280,800 URL  (PC)
   ```
   ⚠️ Chrome headless ne descend pas sous ~500 px de large : une « capture 360 px » est un
   mensonge silencieux. Pour plus étroit, envelopper la page dans une iframe de la largeur
   voulue depuis une page banc (voir `banc/`). Toujours REGARDER les captures produites.
   ⚠️ Un `--user-data-dir` réutilisé ressert les fichiers EN CACHE : des captures « après
   correction » identiques aux précédentes signifient presque toujours ça — profil neuf
   (nouveau dossier) pour chaque campagne de vérification.
2. **Proposer avant d'implémenter** quand la modification est visible : décrire (ou maquetter
   dans une page banc jetable) ce qui change, pour quel public, et ce que ça coûte aux autres.
   Les petites corrections évidentes (débordement, contraste, cible trop petite) se font
   directement.
3. **Modifier par petites touches.** L'interface fonctionne et l'utilisateur y a ses habitudes :
   pas de refonte d'une page entière pour corriger un bouton. Réutiliser les composants de
   `commun.css` (boutons, `.sep`, modale, toast) avant d'en créer.
4. **Vérifier après.** Recharger les captures aux mêmes largeurs, comparer avant/après ;
   contrôler qu'aucun élément ne déborde (`document.body.scrollWidth <= innerWidth`), que les
   cibles font ≥ 44 px écran, et que la vue joueur n'a rien gagné qu'elle ne devait pas voir.
   Tout changement touchant la table en session passe par le banc `banc/pilote_e2e.py`.

## Vérifications spécifiques à ce projet

- **Vue joueurs** : chaque ajout d'interface doit être pensé « et en `body.fenetre-joueurs` ? »
  — masqué par CSS ne suffit pas toujours (pointer-events, lecteurs de spoilers) ; voir les
  gardes existantes dans table.html.
- **Ordre des calques de la table** (non négociable) : plan < portails < images < brouillard <
  jetons < surcouche. Seul `.jeton` a un z-index. Un libellé qui « flotte » au-dessus du
  brouillard est une fuite d'information vers les joueurs (déjà arrivé avec les libellés de
  portail : un `z-index` de trop dans table.html).
- **Thème unique assumé** : l'application est volontairement sombre (table de JDR, pièce
  tamisée) — pas de mode clair à proposer.
- **PWA** : l'application s'installe sur téléphone ; les modifications d'icônes/manifest se
  testent avec de vrais PNG (192/512), jamais des SVG en data-URI (Chrome les refuse).

## Ce qu'on ne fait pas

- Pas de bibliothèque UI, d'icônes externes ou de police web : emojis et caractères Unicode
  font les icônes (🖼, 📡, 💾…), c'est un choix (poids nul, hors-ligne).
- Pas d'animation décorative ; les seules animations sont porteuses de sens (ping, toast).
- Pas de « paramètres d'affichage » : les bons réglages par défaut plutôt qu'un menu d'options.
- Ne pas toucher au rendu SVG des cartes (`js/rendu.js`) pour des raisons d'interface : c'est
  la donnée de jeu, pas de l'habillage — son style appartient au skill plateforme-cartes.
