---
name: plateforme-cartes
description: À utiliser pour TOUTE intervention sur Cartographe Knight, l'éditeur de cartes de JDR de ce projet — corrections, mais aussi nouvelles fonctionnalités, refontes de design/interaction, ajout d'un outil ou d'un type d'élément, symbole de mobilier, brouillard, portails, bibliothèque, stockage, publication. Déclencheurs : "ajoute un outil", "nouveau symbole", "l'éditeur/la table de jeu ne…", "le brouillard", "les portails", "publie la plateforme", "refonte", "nouvelle fonctionnalité", "change le design/l'interface/l'interaction", "grosse modification". Contient l'architecture, les invariants, une check-list avant un gros changement, le protocole de vérification obligatoire, et le journal des pièges déjà rencontrés — à consulter avant d'en refaire un.
---

# Cartographe Knight — développement de la plateforme

Application web **statique** (aucun serveur, aucune dépendance, aucun CDN) : éditeur de cartes
de jeu de rôle et table de jeu, pour la campagne Knight « La Forêt Noire ».
Contexte fonctionnel et mode d'emploi : `plateforme/README.md`.

## Invariant central — le format avant le dessin

**Une carte est un objet JSON ; le SVG n'est qu'un rendu de cet objet.** C'est ce qui rend les
cartes rééditables, diffables dans git et réutilisables dans les trois usages (éditeur, table de
jeu, PDF de Codex). Ne jamais écrire de SVG de carte à la main.

`js/rendu.js` est **la seule vérité graphique**, partagée par les trois usages. Donc :

| Pour… | Modifier… |
|---|---|
| l'apparence d'un élément (porte, mobilier, secret…) | `rendu.js` — jamais les fichiers de cartes |
| ajouter un **type** d'élément | `modele.js` (gabarit dans `nouvelElement`, `boite()`, calque dans `CALQUES`), puis `rendu.js` (`unElement`), puis un outil dans `editeur.js` |
| ajouter un **symbole de mobilier** | une entrée dans `M.SYMBOLES` (modele.js) + son tracé dans `R.SYM` (rendu.js), viewBox `0 0 100 100`, `vector-effect:non-scaling-stroke` |
| ajouter une **image** au catalogue | déposer le fichier (ou tout un dossier) dans `plateforme/images/`, puis `node generer-catalogue-images.js` — régénère `images/index.json` en entier à partir de ce qui s'y trouve, sous-dossiers compris ; jamais d'upload depuis l'appareil, pour rester fiable sur mobile |
| faire évoluer le format | migrer **à la lecture** dans `depuisJSON()` (voir la migration `pins` → éléments `portail`) : les anciens fichiers doivent rester valides |

## Avant un gros changement (design, fonctionnalité, interaction)

Ce projet a déjà changé de forme plusieurs fois (voir « Erreurs commises » plus bas) ; la
check-list ci-dessous synthétise ce qu'on a appris à chaque fois. Pour une modification qui
touche plus qu'une correction locale, parcourir dans l'ordre :

1. **Ça touche le format d'une carte ?** Repartir de l'invariant ci-dessus (le tableau). Un
   nouveau champ doit être lu par `depuisJSON()` de façon rétrocompatible — jamais supposer qu'un
   fichier existant l'a déjà.
2. **Ça touche l'apparence ou l'interactivité d'un élément ?** `rendu.js` est la seule vérité
   graphique, utilisée par les **trois** usages (éditeur, table, export SVG/PDF) — vérifier le
   rendu dans chacun, pas seulement celui qu'on a sous les yeux en développant. Un élément qui a
   besoin d'être cliquable en mode Jeu (comme les portails et les images) se dessine en HTML par
   `table.js`, pas dans le SVG (`images:false`/`portails:false` passés à `R.dansSVG`) : décider dès
   le départ si le nouvel élément suit ce même chemin.
3. **Ça ajoute quelque chose de visible sur le plan ou la table ?** Décider **explicitement** sa
   place dans l'ordre des couches (voir plus bas) et son statut MJ/joueurs : toujours visible ?
   réservé au MJ (`mj:true` dans `CALQUES`) ? révélable (voir `opts.reveles`, point 13 plus bas) ?
   Ne jamais laisser un élément « juste apparaître » sans avoir tranché cette question — c'est la
   source de la moitié des pièges listés plus bas.
4. **Ça ajoute un contrôle réservé au MJ dans `table.html` ?** Trois publics à distinguer, pas
   deux : vue MJ, préview locale du MJ (même fenêtre, `data-vue` bascule), et vraie fenêtre
   séparée (`?vue=joueurs`, classe `.fenetre-joueurs`). Un contrôle exempté pour la préview locale
   n'est **pas** automatiquement bloqué dans la vraie fenêtre séparée (et inversement) — les deux
   se décident indépendamment. Voir les points 9 et 12 plus bas ; c'est le piège le plus facile à
   refaire.
5. **Ça touche le style visuel ?** La charte vit à deux endroits qu'il faut garder synchronisés :
   les variables CSS de `commun.css` (`:root`, éditeur/bibliothèque/table) et `styles(theme)` dans
   `rendu.js` (le SVG des cartes, autonome, embarque sa propre feuille de style). Modifier l'un
   sans l'autre désynchronise l'interface et le rendu des cartes.
6. **Ça touche le mobile ?** L'appli est pensée pour être utilisée à table, sur téléphone —
   vérifier à ~500 px (le minimum que Chrome headless accepte, voir plus bas), et se méfier de
   `white-space:nowrap`/grilles CSS avec du texte variable (point 11).
7. **Avant de livrer** : le protocole de vérification obligatoire, plus bas, n'est pas
   optionnel pour un gros changement — un rendu qui a l'air bon dans un cas peut casser
   silencieusement un des deux autres usages, ou la vue joueurs, ou le mobile.
8. **Ça ajoute un bouton/contrôle, ou automatise un geste qui a un coût externe (déploiement,
   appel API payant, message envoyé) ?** Deux réflexes, dans cet ordre : (a) chercher d'abord si
   un bouton **déjà connu** de l'utilisateur peut simplement « faire mieux », avant de proposer un
   bouton voisin — un concept d'interface en plus est un coût, pas un simple ajout gratuit ; (b) si
   le geste a un coût externe, **demander la fréquence acceptable avant de concevoir**, ne jamais
   supposer que « automatique » est le bon défaut. Voir point 17 des erreurs commises — deux
   propositions rejetées coup sur coup pour ne pas avoir posé ces questions d'abord.

## Architecture

```
plateforme/
  index.html     bibliothèque (liste, import/export, diagnostic + réparation)
  editeur.html   création
  table.html     jeu : brouillard, jetons, portails, ping, mesure
  js/modele.js   format, calques, symboles, aimantation, migrations
  js/rendu.js    modèle → SVG (éditeur, table, export)
  js/stockage.js IndexedDB, import/export fichier, catalogue du dépôt, service worker
  js/editeur.js  outils, interactions, historique
  js/table.js    session de jeu
  cartes/*.json  cartes de la campagne + cartes/index.json (catalogue)
  images/*       illustrations (créatures, lieux) + images/index.json (catalogue)
```

Scripts **classiques** (pas de modules ES : ils sont bloqués en `file://`), namespace global `KJ`.

**Rangement** : le champ `carte.campagne` est le « dossier ». Les campagnes sont *déduites* des
cartes ; pour permettre un dossier **vide**, les noms créés par l'utilisateur sont aussi mémorisés
dans `localStorage` (`kj-campagnes`, API `S.campagnesDeclarees/declarerCampagne/oublierCampagne/
renommerCampagneDeclaree`). Toute liste de dossiers = déduites ∪ déclarées. Déplacement par
glisser-déposer HTML5 (fiche `draggable`, titre de dossier zone de dépôt) ; garder l'alternative
par dialogue, le glisser-déposer n'existant pas sur mobile. Helpers dans `modele.js` :
`campagneDe()`, `parCampagne()`, `listeCampagnes()` (« Sans campagne » toujours en dernier).
Le groupement est appliqué dans la bibliothèque (titres + filtre persisté dans
`kj-filtre-campagne`) et dans le sélecteur de la table (`<optgroup>`). Ne pas confondre avec
la section « Cartes fournies avec l'application », qui désigne le dépôt et non une campagne.

**Séparation des données** : une carte est une *donnée* (`cartes/*.json`, IndexedDB) ; le brouillard,
les jetons et les révélations sont une *session de partie* (`localStorage`, clé `kj-partie`, champs
`fog`/`jetons`/`reveles`). Modifier une carte ne doit jamais réinitialiser une partie en cours.

**Révélation d'un élément MJ (`opts.reveles`)** : deux déclencheurs, le même état. Manuel — clic
droit sur l'icône (voir `basculerRevele()`). Automatique — `verifierDeclencheurs()`, appelée après
tout déplacement de jeton PJ et au chargement d'une carte (jamais dans la vraie fenêtre séparée,
qui reste un pur miroir sans en être la source) : révèle un secret/une image dès qu'un jeton
`pj:true` entre dans la **pièce** qui le contient (repli en rayon ~2 cases si l'élément n'est dans
aucune pièce). C'est une approximation volontaire d'une ligne de vue, pas un vrai calcul optique
(voir README, « hors périmètre »). Permanent dans les deux cas : jamais re-caché automatiquement.
Le déclenchement **automatique** se désactive par élément (`el.auto === false` — le clic droit,
lui, marche toujours quel que soit `auto`) : `verifierDeclencheurs()` exclut ces éléments de ses
cibles, `auto` absent ou `true` = éligible (compatibilité avec les fichiers déjà existants — ne
jamais inverser cette valeur par défaut, ça changerait le comportement de tout élément déjà posé
sans `auto` explicite). Case correspondante dans le panneau de l'éditeur pour `secret`/`image` :
« Révélation automatique ». Utile pour un élément qui ne doit **jamais** se dévoiler tout seul
(une trappe cachée) à côté d'un autre qui le doit (une créature au détour d'un couloir).

**Réinitialiser une carte pour une nouvelle table** (`#b-reinitialiser`) : `partie.fog[carte.id]`,
`partie.reveles[carte.id]` et les jetons de cette carte repartent à zéro — jamais les autres
cartes. Nécessaire parce que fog/reveles/jetons sont une session persistante sans limite de
temps ; sans ce bouton, rejouer la même carte avec un groupe différent héritait silencieusement
du brouillard et des révélations du groupe précédent. Volontairement pas dans la liste
d'exceptions de `#barre-mj` pour la préview locale (point 9/12) : contrairement aux outils de
brouillard, ce n'est pas une action à faire devant les joueurs.
**Boîte à cases plutôt qu'un `confirm()` global** (voir `ouvrirModale`) : brouillard, révélations
et jetons se réinitialisent **indépendamment**, pas en bloc — le brouillard représente souvent
des heures d'exploration qu'un MJ ne veut pas perdre juste pour corriger une révélation isolée
(retour d'expérience direct : le premier jet, tout-ou-rien avec un `confirm()`, obligeait à
choisir entre garder le brouillard et corriger une révélation). Décochée par défaut pour cette
raison ; révélations et jetons cochés par défaut (le cas le plus courant). Un clic droit sur un
seul élément (`basculerRevele`) reste le chemin le plus rapide pour ne corriger que lui, sans
passer par cette boîte du tout.
**`+ Jeton` en préview locale, pas dans la vraie fenêtre séparée** : ajouté à la liste
d'exceptions de `#barre-mj` (point 9/12), mais la vraie fenêtre séparée reste bloquée en bloc par
`body.fenetre-joueurs #barre-mj{display:none}` — l'exception ne s'applique qu'à la préview
locale, ce n'était pas la peine de traiter les deux cas séparément ici, contrairement à
`#b-galerie`/`#b-vue` qui ont chacun besoin d'un masquage JS explicite pour la vraie fenêtre.
`sauverPartie(true)` sur la création, comme sur le déplacement (point 16) : un jeton créé côté
joueur doit remonter jusqu'au MJ.

**Les cartes : UNE seule source, les fichiers (`js/stockage.js`)** — invariant à ne pas casser.

Une carte = un fichier `cartes/<id>.json` (le nom de fichier est **toujours** `<id>.json`). Il
n'existe plus de bibliothèque IndexedDB en parallèle : ce doublon de stockage a été la cause
directe des points 17 et 19 ci-dessous, et sa suppression a été demandée explicitement
(*« je n'ai pas besoin de "fausse" version des cartes »*). **Ne pas réintroduire un stockage de
cartes dans le navigateur**, sous aucune forme (cache, brouillon, copie de travail).

API : `S.listerCartes()` / `chargerCarte(id)` / `enregistrerCarte(c)` / `supprimerCarte(id)` /
`peutModifier()`. Deux chemins de lecture derrière la même API :
- **dossier lié** (File System Access, Chromium PC) → lit/écrit les fichiers **du disque** ;
  `enregistrerCarte` écrit `cartes/<id>.json` puis **régénère** `cartes/index.json` à partir du
  contenu réel du dossier (pas de patch incrémental : la suppression d'un fichier se reflète
  toute seule) ;
- **sinon** (téléphone, navigateur non compatible) → lit les fichiers **servis en HTTP** via
  `cartes/index.json` (on ne peut pas lister un dossier en HTTP : d'où ce fichier), et
  `enregistrerCarte`/`supprimerCarte` **rejettent** avec `lecture seule`. L'interface doit alors
  masquer ses commandes d'édition (`peutModifier()` → `#grp-edition`, boutons de fiche) plutôt
  que d'écrire dans un coin invisible.

La liaison du dossier se propose au premier clic explicite sur **💾 Enregistrer** — jamais depuis
l'enregistrement automatique, qui n'a pas de geste utilisateur pour ouvrir un sélecteur de
fichier. Poignée persistée dans le store `parametres` d'IndexedDB (v2 du schéma) ; la permission
peut être perdue entre deux sessions (`queryPermission`) et ne peut être redemandée
(`requestPermission`) que depuis un geste réel.

**Tout ce qui touche IndexedDB passe par `avecDelai`** — et le garde est posé **dans
`dossierDepotActif()`**, passage obligé vers le dossier, plutôt que chez chaque appelant : un
garde par appelant est un garde qu'on oublie (constaté trois fois de suite dans la même session,
à chaque fois avec le même symptôme : blocage total et silencieux). `lierDossierDepot()` ne fait
pas non plus dépendre la liaison de la mémorisation de la poignée : si l'écriture IndexedDB
échoue, la liaison vaut au moins pour la session.

**Publication : entièrement manuelle, hors de l'appli — ne pas en refaire une dedans.** Une
version antérieure ajoutait un bouton `📲 Vers ton téléphone` (API GitHub, jeton personnel en
`localStorage`), supprimé à la demande explicite de l'utilisateur : *« tu va me supprimer ce
putain de bouton inutile »*. Il gère lui-même `git commit`/`git push`. Netlify est connecté au
dépôt et redéploie seul dès qu'il pousse. **Le seul bouton de sauvegarde de l'éditeur est
💾 Enregistrer** ; ne pas en ajouter un second, quel qu'en soit le prétexte.

**Ordre des couches en jeu** (non négociable, hérité de Foundry/Roll20) :
`plan < portails < images < brouillard < jetons < pings/mesure < interface`. Le brouillard couvre
le décor, les portails et les icônes d'image, jamais les jetons ni les pings. Les icônes d'image
(comme les portails) sont dessinées en HTML par `table.js`, pas par le SVG de `rendu.js`
(`images:false` passé à `R.dansSVG`) : c'est ce qui les rend cliquables sans dupliquer le rendu.
Elles sont réservées au MJ — masquées en vue joueurs par CSS, jamais par simple opacité, sinon
leur position serait un indice visible en transparence.

## Vérification obligatoire — ne jamais livrer sans avoir regardé

```bash
cd "C:/Projet/jdr créateur de carte/plateforme" && python -m http.server 8777
# IndexedDB et cartes/index.json sont bridés en file:// : toujours passer par http
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --window-size=1500,950 --user-data-dir="<profil unique>" --virtual-time-budget=8000 \
  --screenshot="<chemin absolu>.png" "http://127.0.0.1:8777/editeur.html?depot=manoir-cygnus-rdc.json"
```
puis **lire les PNG**. Vues à couvrir : éditeur, bibliothèque, table de jeu en vue MJ, table en
`?vue=joueurs`, et une largeur réduite. L'appel Bash demande `dangerouslyDisableSandbox: true`.

Pour les **interactions** (et pas seulement le rendu) : dupliquer la page en banc d'essai avec un
script qui simule des `PointerEvent` et publie son bilan dans `document.title` (récupérable via
`--dump-dom`), puis supprimer le fichier de test.

### Pièges de test vérifiés

- **Chrome headless impose une largeur minimale de ~500 px** : une capture demandée en 390 px est un
  recadrage trompeur d'une fenêtre plus large. Tester le mobile à 500 px, et mesurer
  `getBoundingClientRect()` avant de conclure à un bug de mise en page.
- **IndexedDB ne répond pas en headless** (avec ou sans `--virtual-time-budget`, ancien mode ou
  `--headless=new`) : tout code qui l'attend semble figé. D'où `S.avecDelai()`. Confirmé à
  nouveau en testant le lien disque + la publication (2026-08) : une promesse chaînée sur
  `S.dossierDepotActif()`/`S.enregistrer()` peut **ne jamais se résoudre**, même avec
  `--virtual-time-budget=15000` et un `setTimeout` réel de 6 s en aval — ce n'est pas juste
  « lent », ça peut rester figé indéfiniment. **Ne pas s'entêter** à isoler la cause en
  multipliant les bancs d'essai : dès qu'un test impliquant IndexedDB reste bloqué après une ou
  deux tentatives avec budget généreux, basculer sur la relecture attentive du code (le vrai
  filet de sécurité ici) et laisser la confirmation finale à un test manuel par l'utilisateur —
  conforme à la limite déjà documentée, pas un échec de méthode à corriger davantage.
  **Recette validée pour tester la bibliothèque locale** : copier `index.html` en page de banc
  d'essai et insérer, entre `stockage.js` et le script de la page, un stub qui remplace
  `S.lister/charger/enregistrer/supprimer` par une base en mémoire. Le produit n'est pas pollué,
  et les parcours (renommer une carte, renommer un dossier et vérifier la propagation) deviennent
  testables — un paramètre `?etape=N` permet d'enchaîner les scénarios dans des captures séparées.
- **Un `&&` entre deux commandes dont la première peut légitimement ne rien trouver** (ex. deux
  `grep`/`git show` à la suite) **coupe silencieusement la seconde** sans message d'erreur clair —
  vu en concluant à tort « aucune carte n'a d'image » après un `grep` sans résultat sur le premier
  fichier, qui a empêché le `grep` du second fichier de s'exécuter. Séparer les commandes (ou
  utiliser `;`) dès qu'un résultat vide d'une étape est un cas normal à ne pas court-circuiter.
- **Stubber `S.xxx` ne remplace PAS l'appel interne du même nom.** `stockage.js` est une IIFE :
  `purgerCopiesObsoletes` appelle le `supprimer` **interne**, pas `KJ.stockage.supprimer`.
  Réécrire la propriété exportée depuis un banc d'essai ne détourne donc rien de ce qui se passe
  à l'intérieur du module — le test paraît « passer » sans avoir exercé la moindre ligne visée.
  Pour tester du code interne à `stockage.js`, stubber **sous** lui (remplacer `window.indexedDB`)
  ou appeler directement la fonction exportée avec des données fabriquées. Corollaire : un test
  qui recopie la fonction dans le fichier de test ne teste que la copie, jamais le code livré —
  le dire explicitement plutôt que d'annoncer une vérification qui n'a pas eu lieu.
- Un `pointerdown` de test doit être émis **sur l'élément SVG visé** : sinon `closest('[data-id]')`
  ne trouve rien et la sélection échoue silencieusement.
- L'historique enregistre l'état **après** modification, via l'unique point d'entrée `apresModif()`.
  (Instantané pris *avant* = Ctrl+Z qui saute deux crans.)

## Erreurs commises ici — ne pas les refaire

1. **Service worker « cache d'abord »** : le navigateur resservait indéfiniment l'ancien code, y
   compris celui qui réinstallait le cache. Les corrections n'atteignaient jamais l'utilisateur, qui
   a cherché longtemps une fonction pourtant livrée. `sw.js` est désormais **réseau d'abord, cache en
   secours**, et `gererServiceWorker()` ne l'enregistre **jamais en local** (il purge et désinscrit).
   Ne jamais revenir à « cache d'abord » sur le HTML et les scripts.
2. **Dupliquer une carte en changeant son identifiant** cassait les liaisons entre cartes (les
   portails visaient l'ancien identifiant). Une copie locale **garde** l'identifiant : elle remplace
   la carte du dépôt, elle n'en crée pas un jumeau orphelin. La bibliothèque détecte les doublons et
   propose « Nettoyer et réparer ».
3. **Livrer deux applications séparées** (éditeur d'un côté, table de l'autre) : distinction
   technique sans sens pour l'utilisateur, qui cherchait le brouillard dans l'éditeur. Un manque
   fonctionnel doit être comblé dans l'outil, pas expliqué.
4. **Fonctions inaccessibles** : les portails existaient dans le format mais aucun outil ne
   permettait d'en créer. Vérifier qu'une donnée du format a toujours son moyen d'édition.
5. **Afficher deux fois la même carte** (copie de travail + originale du dépôt) : incompréhensible
   côté utilisateur, qui croit à des doublons et cherche à supprimer ce qui n'est pas supprimable.
   Règle : une copie locale **masque** l'originale (par identifiant ou par nom), et toute liste
   dérivée — notamment le sélecteur de campagne — se construit sur ce qui est **réellement
   affiché**, jamais sur les données brutes. Un filtre proposant une campagne dont aucune carte
   n'est visible est un bug.
6. **Un filtre persistant sans garde-fou** : le filtre de campagne était mémorisé en
   `localStorage`. Après masquage des cartes fournies, la campagne filtrée n'existait plus →
   bibliothèque vide, et le sélecteur étant masqué quand il n'y a qu'une campagne, l'utilisateur
   n'avait **aucun moyen de s'en sortir**. Règle : tout état persistant qui restreint un affichage
   doit être **validé au chargement** contre les valeurs réellement disponibles et réinitialisé
   sinon ; et tout état « vide » doit offrir une action de sortie visible.
7. **Rendre l'affichage en deux passes** (locales puis dépôt) : une fiche locale a besoin de savoir
   si une originale existe. Un seul point de rendu, après `Promise.all` des deux sources.
8. **Un élément ponctuel posé hors du plan (clic dans le fond du `#canevas`, hors du parchemin)
   devenait invisible et inatteignable dans l'éditeur** — le `viewBox` du SVG `#plan` le clippe —
   **mais flottait, visible, en mode Jeu**, où `#images`/`#pins` (des `div` HTML, pas du SVG) ne
   sont pas clippés à la même frontière. Un utilisateur qui cliquait à côté du plan perdait
   silencieusement un élément qu'il ne pouvait plus ni voir ni sélectionner pour le corriger.
   Corrigé à deux niveaux : `poser()` borne désormais le point à `[0,taille.w] × [0,taille.h]`
   avant toute pose (`objet`, `numero`, `texte`, `lumiere`, `portail`, `image`), et `depuisJSON()`
   fait de même à la lecture pour rattraper les fichiers déjà touchés. N'affecte pas les outils de
   tracé (`piece`, `mur`) — hors périmètre de ce correctif.
9. **Le bouton « Vue joueurs » (préview locale du MJ dans `table.html`) se cachait lui-même** :
   il vivait dans `#barre-mj`, entièrement masqué par `body[data-vue="joueurs"] #barre-mj{display:
   none}` dès qu'on cliquait dessus — aucun moyen d'y revenir depuis la même fenêtre, sinon
   recharger la page. Corrigé en excluant `#b-vue` du masquage. La vraie fenêtre joueurs
   (`?vue=joueurs`) le masque quand même, explicitement en JS au démarrage — elle n'a pas de
   « vue MJ » à laquelle revenir, contrairement à la préview locale du MJ.
   **Un MJ solo (portable sans second écran, écran montré directement aux joueurs)** a besoin de
   révéler le brouillard *depuis cette même préview* : `#barre-mj > *:not(...)` exempte donc
   aussi tout le cluster plan (`[data-o]` : déplacer/révéler/cacher/mesurer, `#b-annuler-fog`,
   `#b-couvrir`, `#b-decouvrir`, `#b-cadrer`), en plus de `#b-vue`. Le reste (jetons, galerie,
   éditer, bibliothèque) reste caché : ce sont des outils de préparation, sans rapport avec ce qui
   se montre à l'écran. Ça ne demandait aucun changement côté interactions : `pinceau()` et les
   handlers de pointeur ne vérifient que `vueJoueurs` (la vraie fenêtre séparée), jamais l'attribut
   `data-vue` local — seuls les boutons étaient cachés en trop.
   Attention à la syntaxe CSS d'une chaîne `:not()` : `#barre-mj > *:not(a):not(b)` doit être un
   **seul sélecteur composé sans espace** ; `#barre-mj > * :not(a)` (avec un espace) devient un
   sélecteur de **descendant** et ne matche plus rien de ce qu'on veut ici.
   Pareil pour **« Suivre le MJ »** (`#barre-joueurs`) : n'a d'effet que dans la vraie fenêtre
   séparée (elle seule reçoit les messages `cam` du MJ) ; masqué en JS quand `!vueJoueurs`, sinon
   un bouton qui ne fait visiblement rien dans la préview locale.
10. **La zone de clic invisible d'un `objet` (le `<rect fill="transparent">` posé sous chaque
    symbole, pour pouvoir cliquer même les symboles clairsemés comme l'escalier) devenait un
    cadre carré bien visible** : `fill="transparent"` ne suffit pas, sans `stroke="none"` explicite
    ce rect **hérite** le `stroke`/`stroke-width` de son groupe parent `.kj-obj` (prévu pour le
    tracé du symbole lui-même). Invisible sur la plupart des symboles, qui ont une forme pleine qui
    recouvre ce cadre — flagrant sur l'escalier en arc, dont le tracé (juste des traits) ne le
    recouvre pas. Symptôme signalé par l'utilisateur comme « un gros carré autour des escaliers »,
    permanent, sans lien avec la sélection — bien vérifier ces deux pistes avant de chercher
    ailleurs. Toute zone de clic invisible ajoutée plus tard doit fixer `stroke="none"` en plus de
    `fill="transparent"` : ne jamais compter sur l'absence d'attribut pour rester invisible sous un
    groupe parent qui, lui, a un style.
11. **`.palette` (grille CSS `repeat(3,1fr)`) déborde silencieusement avec un libellé un peu long** :
   `button` hérite `white-space:nowrap` de la règle de base, et un item de grille a par défaut
   `min-width:auto`, donc son *min-content* (le texte non coupé) prime sur `1fr` — tout le panneau
   déborde horizontalement. Invisible avec les libellés courts des symboles de mobilier, mais
   flagrant dès la palette d'images (libellés plus longs). Corrigé une fois pour toutes avec
   `min-width:0` sur `.palette button` + `white-space:normal` sur son `span` : à ne pas défaire, et
   à garder en tête pour toute future grille de boutons avec texte.
12. **En exemptant les outils de plan du masquage de `#barre-mj` pour la préview locale du MJ
    (point 9), ils fuyaient aussi dans la VRAIE fenêtre séparée** (`?vue=joueurs`) : `body[data-
    vue="joueurs"] #barre-mj > *:not(...)` ne distingue pas les deux, puisque `data-vue` vaut
    `"joueurs"` dans les deux cas. Une vraie fenêtre séparée ne doit pourtant avoir strictement
    aucun outil MJ — elle doit rester un pur miroir. D'où `document.body.classList.add
    ('fenetre-joueurs')`, posé une fois pour toutes par `table.js` **seulement** quand `vueJoueurs`
    (le paramètre d'URL) est vrai — jamais pour la préview locale, qui elle ne bascule que
    `data-vue`. Règle générale : **`data-vue` distingue MJ/joueurs pour l'affichage** (bascule
    aussi en préview locale), **`.fenetre-joueurs` distingue vraie fenêtre séparée/tout le reste**
    (jamais en préview locale) — les deux servent à des questions différentes, ne pas les
    confondre pour un nouvel élément à verrouiller. `body.fenetre-joueurs #barre-mj{display:none}`
    suffit à tout cacher d'un coup (un parent `display:none` masque ses enfants quel que soit leur
    propre `display`) — pas besoin de répéter la liste d'exceptions à l'envers.
13. **Élément MJ révélé aux joueurs (clic droit)** : filtré élément par élément dans `corps()`
    (`opts.reveles`, un tableau d'ids), pas par calque entier comme avant — sinon révéler *un*
    secret aurait révélé tous les secrets de la carte. Stocké dans `partie.reveles[carte.id]`
    (session de partie, comme `partie.fog` — jamais dans le fichier de la carte). Les icônes
    d'image utilisent la même distinction MJ/joueurs-locale/fenêtre-séparée que le point 12 :
    invisibles (`opacity:0`) tant que non révélées y compris en fenêtre séparée, mais cliquables
    (`pointer-events`) seulement hors fenêtre séparée — c'est le MJ, depuis son propre écran, qui
    déclenche, jamais la fenêtre miroir elle-même.
14. **Une chaîne de `prompt()`/`confirm()` natifs pour créer un jeton (étiquette, adresse
    d'image, confirmation de fichier, confirmation PJ — jusqu'à 4 popups à la suite)** :
    illisible sur mobile, bloquant, aucun retour en arrière possible. Remplacé par une seule
    boîte `#modale` (voir ci-dessous). Ne plus jamais enchaîner `prompt()`/`confirm()` pour un
    flux à plusieurs étapes dans `table.js` — toujours une boîte de dialogue.

**Boîte de dialogue générique (`table.js`)** : un seul `#modale`/`#modale-corps`, rempli par
`ouvrirModale(titre, large, construire)` — `construire(corps)` construit son propre contenu
(champs, boutons), fermeture par `fermerModale()`, Échap ou clic sur le fond. Sert à la galerie
d'images et à la création d'un jeton ; tout nouveau flux à plusieurs étapes doit passer par là,
jamais par `prompt()`/`confirm()`. Le sélecteur d'images navigable (dossiers + vignettes) est
factorisé dans `construirePickerImages(dEl, gEl, chemin, onChoisir)`, réutilisé par la galerie et
par le choix de portrait d'un jeton — `chemin` est un tableau **muté en place** (`splice`), pas
réassigné, pour que l'appelant garde toujours la même référence après un re-rendu.

**Portail déclenché par un jeton (pas seulement par un clic)** : `trouverPortailProche()` teste
la distance entre un jeton PJ tout juste lâché et chaque portail résolu (destination existante) ;
en dessous d'une case, `chargerCarte()` puis `amenerPJ()` (factorisée hors du bouton ⇄ PJ,
réutilisée ici) — tous les jetons PJ suivent, pas seulement celui qu'on a fait glisser. Réservé
aux jetons `pj:true` : un PNJ/monstre poussé près d'un portail ne doit rien déclencher.
15. **Le déclenchement du portail par un jeton ratait alors que le jeton semblait posé pile
    dessus** : la distance était testée **après** l'aimantation du jeton à la grille
    (`Math.round((x-c/2)/c)*c+c/2`, la case entière), alors que les portails s'aimantent eux à la
    **demi-case** (`acc(pt,true)` dans l'éditeur) — deux grilles décalées d'une demi-case. Un
    portail posé sur une position que le jeton ne peut jamais atteindre par aimantation restait
    hors d'un seuil pourtant généreux. Corrigé sur les deux plans : tester la position **brute**
    du dépôt (avant l'aimantation qui vient juste après, dans `fin()`), et élargir le seuil à une
    case entière plutôt qu'une demi-case — la précision au pixel près n'est pas réaliste pour un
    geste de glisser à la main (souris ou doigt). Réflexe pour toute détection de proximité entre
    deux éléments posés indépendamment : vérifier qu'ils utilisent la **même grille d'aimantation**
    avant de fixer un seuil, sinon un cas au pixel près peut rester structurellement inatteignable.
16. **Le vrai bug derrière le point 15 (l'utilisateur a dû insister — mon propre test ne l'avait
    pas détecté) : `.jeton{pointer-events:none}` était posé sur `body[data-vue="joueurs"]`, donc
    aussi sur la préview locale**, pas seulement la vraie fenêtre séparée — exactement le même
    oubli qu'au point 12 (barre d'outils), mais je ne l'avais pas généralisé aux jetons. Un clic
    réel n'atteignait donc jamais le code : `mode` ne passait jamais à `'jeton'`, tout le reste
    (déclenchement de portail y compris) ne s'exécutait tout simplement pas. **Piège méthodo à
    retenir** : `el.dispatchEvent(...)` directement sur l'élément **ignore `pointer-events` en
    CSS** (ce n'est pertinent que pour le hit-testing d'un vrai clic) — un banc d'essai qui
    dispatche sur la cible peut donc donner un faux positif si le point réel du bug est justement
    que l'élément ne peut jamais devenir la cible d'un clic. Corrigé en généralisant le point 12 :
    `body.fenetre-joueurs .jeton{pointer-events:none}`, pas `body[data-vue="joueurs"]`. Pour
    vérifier ce genre de correctif, mesurer `getComputedStyle(el).pointerEvents` en plus de
    simuler l'interaction — les deux, pas l'un à la place de l'autre.
    **Jeton PJ manipulable par les joueurs, y compris dans la vraie fenêtre séparée** (élargi au
    passage, dans le même geste) : exception par jeton (`[data-pj="true"]` reste cliquable, les
    autres non) plutôt qu'un verrou global comme les autres contrôles MJ — un jeton n'est pas un
    outil de préparation, c'est un élément que joueurs et MJ se partagent. `sauverPartie(diffuser)`
    a donc changé de sens : `true` force la diffusion même depuis `vueJoueurs` (un déplacement de
    jeton doit toujours remonter au MJ), `false` la supprime, `undefined` garde l'ancien
    comportement (jamais depuis la vraie fenêtre séparée) — à choisir consciemment pour toute
    nouvelle action qui doit (ou non) remonter depuis cette fenêtre.
17. **La copie locale masque le dépôt (point 2/5) n'est pas qu'un détail d'un seul appareil : PC
    et téléphone ont chacun leur propre IndexedDB, jamais synchronisée.** Ça a produit une longue
    confusion en session : l'utilisateur voyait « une vieille version » sur mobile après des
    correctifs pourtant bien commités et déployés (vérifié : `git fetch` + `git show
    origin/main:…` + le tableau de déploiements Netlify concordaient). La vraie cause n'était pas
    le cache du navigateur mobile (déjà purgé), mais des **images posées en direct dans
    l'éditeur sur PC**, enregistrées uniquement dans le IndexedDB de ce navigateur-là — jamais
    exportées ni commitées, donc absentes du dépôt et invisibles ailleurs. Piège méthodo : face à
    « ça n'a pas la dernière version », vérifier dans l'ordre (1) le contenu réellement poussé sur
    `origin/main` (`git fetch` avant de conclure — ne pas faire confiance à un `git status` local
    qui peut être propre sans avoir jamais été comparé au vrai remote), (2) le déploiement
    Netlify correspondant, (3) seulement ensuite le cache client. Un `&&` entre deux `git show`
    dans une même commande shell a fait échouer silencieusement le second sans message d'erreur
    clair (le premier `grep` sans résultat coupe la chaîne) — préférer des commandes séparées ou
    `;` quand un résultat vide de la première étape est un cas normal à ne pas court-circuiter.
    **Correctif structurel** (pas qu'un diagnostic), en deux temps — voir « Enregistrement et
    publication » plus bas pour le détail technique complet :
    - **Écriture directe sur disque** (File System Access API, Chromium PC uniquement) : le bouton
      **💾 Enregistrer** propose de lier le dossier `plateforme/` au tout premier clic explicite
      (jamais depuis l'enregistrement automatique, qui n'a pas de geste utilisateur pour autoriser
      un sélecteur de fichier), puis écrit `cartes/<id>.json` + `cartes/index.json` directement sur
      le disque à chaque sauvegarde suivante — plus de copie locale qui masque le dépôt sur la
      machine d'édition.
    - **Publication : essayée en un clic dans l'appli (bouton `📲 Vers ton téléphone`, API GitHub,
      jeton personnel), puis retirée à la demande explicite de l'utilisateur** — voir point 3 de
      « Enregistrement et publication » plus haut. **Ne pas la réintroduire d'initiative.** La
      publication se fait entièrement hors de l'appli, avec l'outil git de l'utilisateur.
    - **Trois leçons de conception à généraliser, pas seulement pour cette carte précise** :
      (1) ne jamais proposer d'automatiser un geste qui a un coût externe (déploiement, appel API
      payant) sans avoir d'abord demandé la fréquence acceptable — première proposition (tout
      publier à chaque sauvegarde) refusée pour cette raison ;
      (2) **un nouveau bouton à comprendre est lui-même un coût** : une version livrait un bouton
      séparé (« 🔗 Dossier », à 3 états) en plus de « 💾 Enregistrer » — réaction de l'utilisateur :
      *« c'est quoi ce bouton de merde »* / *« pourquoi tu ne peux pas faire les choses
      simplement »*. Corrigé en pliant la liaison de dossier **dans** le bouton Enregistrer
      existant, sans nouveau concept d'interface ;
      (3) **même correction appliquée, un deuxième bouton peut encore être « en trop » aux yeux de
      l'utilisateur** — le bouton de publication en un clic, pourtant simple et bien nommé, a
      quand même été jugé inutile une fois expliqué (l'utilisateur préfère gérer `git push`
      lui-même). Ne pas supposer qu'une fonctionnalité bien conçue est forcément désirée : quand
      l'utilisateur demande d'expliquer un bouton juste après l'avoir livré, c'est souvent le
      signe qu'il pèse la nécessité de le garder — écouter la suite plutôt que défendre le choix.
    - **Piège technique croisé en testant ce correctif** : `ouvrir()` (IndexedDB, `stockage.js`)
      ne mémorisait que la connexion **résolue** (`db`), pas la promesse d'ouverture **en cours** —
      deux appels concurrents avant la toute première résolution (ex. l'éditeur qui vérifie le
      dossier lié *et* enregistre la carte dans la même poignée de main) ouvraient deux connexions
      `indexedDB.open()` en parallèle. Corrigé en mémorisant aussi la promesse en vol
      (`ouvertureEnCours`), retournée telle quelle à tout appel concurrent. Réflexe pour toute
      fonction d'ouverture de ressource asynchrone avec cache : mémoriser la **promesse en cours**,
      pas seulement le résultat final, dès qu'elle peut être appelée deux fois avant sa résolution.
18. **La vérification du dossier lié (`S.dossierDepotActif()`, point 2 d'« Enregistrement et
    publication ») pouvait bloquer *tout* l'enregistrement en silence** — aucune erreur, aucun
    message, juste rien qui ne se passait au clic sur Enregistrer. Cause : cette fonction dépend
    d'IndexedDB, déjà documenté ailleurs dans ce fichier comme peu fiable (onglet concurrent qui
    bloque une montée de version, entre autres — voir les pièges de test plus haut) ; `S.avecDelai`
    existe justement pour ça, mais je ne l'avais appliqué qu'aux appels déjà connus pour poser
    problème (chargement de catalogues), pas à ce nouvel appel. L'utilisateur a d'abord été accusé
    à tort de ne pas avoir cliqué (*« tu me prend pour un con, BIEN SUR QUE J'AI CLIQUER »*) avant
    que je relise le code et trouve le vrai trou. **Réflexe à généraliser** : tout nouvel appel à
    une fonction de `stockage.js` qui touche IndexedDB doit passer par `S.avecDelai(...)` dès
    l'écriture initiale, pas seulement après qu'un symptôme le révèle — et avant de suspecter
    l'utilisateur d'une erreur de manipulation, relire le code du chemin concerné.

19. **« J'ai poussé mes modifications et je ne les vois pas » — cause finale : la copie locale
    masquait indéfiniment une carte du dépôt pourtant plus récente.** Le masquage (points 2/5)
    était inconditionnel : `if (!vus.has(c.id) && !noms.has(slug(c.nom)))`. Comme chaque appareil
    a son propre IndexedDB, un téléphone ayant ouvert une carte une fois affichait sa copie
    figée pour toujours, quels que soient les push suivants — **sans aucun signe visible**, ce
    qui a coûté une longue série d'échanges où le cache, Netlify et le navigateur ont tous été
    suspectés à tort (ils étaient corrects : `git show origin/main:…` et le tableau Netlify le
    confirmaient à chaque fois). Corrigé par `S.purgerCopiesObsoletes(locales, cartesDepot)`
    (stockage.js), appelée **avant** la fusion dans `index.html` et `table.js` : une copie locale
    strictement plus ancienne (`maj`) que la carte du dépôt correspondante (par id **ou** par nom)
    est supprimée — le dépôt contient déjà mieux. Une copie locale plus récente (travail en cours)
    est gardée ; une carte du dépôt sans `maj` ne périme jamais rien (rétrocompatibilité).
    **Conséquence à ne pas oublier** : l'éditeur pouvait alors ouvrir une carte vierge quand sa
    copie locale venait d'être purgée (`S.charger` → `null` → « Nouvelle carte », l'utilisateur
    croit son travail perdu). D'où le repli explicite sur `S.chargerDepot(id + '.json')` avant de
    créer une carte neuve. Règle générale : **toute suppression automatique de données locales
    doit s'accompagner d'un repli sur la source qui l'a rendue obsolète**, partout où ces données
    étaient lues.

20. **La vraie leçon des points 17 et 19 : la complexité venait d'un doublon de stockage, pas
    d'un enchaînement de bugs.** Bibliothèque IndexedDB *et* fichiers `cartes/*.json` coexistaient ;
    toute la machinerie qui a occupé une session entière — copies qui masquent l'originale,
    diagnostic de doublons/identifiants (`aReparer`/`reparer`), purge des copies périmées, section
    « Cartes fournies » distincte de « Mes cartes », repli de l'éditeur sur le dépôt — n'existait
    que pour faire cohabiter ces deux sources. Chaque correctif ajoutait un mécanisme au lieu
    d'enlever la cause. L'utilisateur a fini par poser la bonne question (*« pourquoi c'est si
    compliqué ? pourquoi ne pas avoir un système simple ? »*), et la réponse honnête était que
    la moitié du code servait à réparer une décision d'architecture, pas un besoin.
    **Supprimé** : le stockage IndexedDB des cartes (le magasin `cartes` est laissé en place mais
    plus jamais lu/écrit — on n'efface pas des données qui peuvent encore servir de secours), le
    diagnostic de doublons, la purge, la double section de la bibliothèque, l'ancienne API
    `S.enregistrer/charger/supprimer/lister`. **Réflexe à garder** : quand un troisième correctif
    de suite s'ajoute au même endroit, s'arrêter et se demander si ce n'est pas la structure qui
    est fausse — et proposer de l'enlever plutôt que d'empiler un garde-fou de plus.

21. **« Le jeton n'est pas cliquable au tactile » : la logique était bonne, la cible était trop
    petite.** Jetons (32 px), portails (18 px) et icônes d'image (26 px) vivent dans `#monde`, qui
    porte le `transform: scale(cam.s)` de la caméra — leur taille CSS est donc en unités *monde*,
    pas écran. Sur un plan dézoomé (le cas normal sur téléphone, où la carte entière doit tenir),
    un jeton tombe à **17 px à l'écran**, très en dessous des ~44 px qu'un doigt peut viser ; le
    code de glisser-déposer, lui, fonctionnait parfaitement (vérifié en simulant un
    `PointerEvent{pointerType:'touch'}` : le jeton se déplaçait bien). Corrigé par un halo
    `::before` transparent sur `.jeton/.pin/.img-pin`, contre-mis à l'échelle par
    `transform:scale(var(--inv))` — `--inv = 1/cam.s`, posé sur `#monde` par `appliquerCam()` —
    donc de **taille constante à l'écran** (mesuré : 40-42 px) sans rien changer au dessin.
    **Réflexe** : devant « ça ne réagit pas au doigt », mesurer `getBoundingClientRect()` de la
    cible **à la largeur mobile** avant de suspecter les gestionnaires d'événements ; et se
    rappeler que tout ce qui vit sous un conteneur mis à l'échelle a une taille écran variable.
    Le halo reste modeste (42 px) exprès : plus large, les halos de deux jetons sur des cases
    voisines se recouvriraient et on attraperait le mauvais.

## Style

Charte de la campagne : parchemin sombre (`--parchemin #221b11`), encre pâle (`--encre #d3c5a4`),
bordeaux (`--sang`) et or (`--or`) en accents. Interface sobre pour ne pas concurrencer la carte.
Textes d'interface en français, tutoiement, sans jargon technique.

## Publication

**État réel du déploiement** (pas une option parmi d'autres — c'est celle en place) : dépôt GitHub
`github.com/kyogre21/JDR-createur-de-carte`, branche `main`, connecté à **Netlify** (site
`resilient-faloodeh-377ce3.netlify.app`) avec auto-publish activé — tout push sur `main` redéploie
tout seul en quelques secondes. Vérifier l'état d'un déploiement : `git fetch origin main` puis
comparer avec `git log -1 origin/main`, et/ou l'onglet **Deploys** du tableau de bord Netlify (le
site donne son propre lien direct, pas la peine de le redemander à chaque session — le retrouver
dans l'historique de conversation ou le demander une fois).

**Netlify facture au déploiement : ne jamais proposer un mécanisme qui publie à chaque
sauvegarde ou à chaque frappe.** C'est une contrainte exprimée explicitement par l'utilisateur et
qui a fait rejeter une première proposition — la publication doit toujours rester un geste
compté et volontaire (voir « Enregistrement et publication » plus haut, et point 17 des erreurs
commises). Avant de proposer d'automatiser quoi que ce soit qui a un coût externe (déploiement,
appel API payant, envoi de message), demander la fréquence acceptable **avant** de concevoir, pas
après avoir livré quelque chose à corriger.

**L'appli ne publie jamais elle-même, y compris en un clic — ce point a été tranché, ne pas y
revenir sans qu'on le redemande.** Un bouton de publication en un clic (API GitHub) a été
construit puis retiré à la demande de l'utilisateur, qui préfère pousser lui-même avec son propre
outil git une fois les fichiers à jour sur le disque (voir point 2 d'« Enregistrement et
publication », et point 17 des erreurs commises). L'unique bouton de sauvegarde à conserver dans
l'éditeur est **💾 Enregistrer**.

**Diagnostiquer « ça n'a pas la dernière version » (mobile ou autre appareil), dans cet ordre** —
ne pas sauter directement à « c'est le cache » :
1. `git fetch origin main` puis vérifier le contenu réel poussé (`git show origin/main:chemin`) —
   ne jamais conclure sur un `git status` local seul, qui peut être propre sans jamais avoir été
   comparé au vrai remote.
2. Le tableau de bord Netlify (onglet Deploys) : le dernier déploiement correspond-il au bon
   commit, et est-il marqué « Published » ?
3. **Seulement ensuite**, le cache côté client (voir plus haut, IndexedDB par appareil — jamais
   synchronisée — et le cache du navigateur/service worker).

**Usage hors-ligne à table (mobile)** : le site fonctionne en PWA (`manifest.webmanifest` + `sw.js`,
réseau d'abord/cache en secours — voir erreur commise n°1). Un simple onglet de navigateur ouvert
en favori n'en profite pas pleinement : sur iOS en particulier, Safari purge le cache d'un site
non « installé » après une période d'inactivité. Toujours recommander **« Ajouter à l'écran
d'accueil »** (pas juste un favori) pour un usage fiable à table sans réseau. Pour vider un cache
mobile récalcitrant : sur Android, passer par les réglages **système** (Applications → l'appli du
navigateur → Stockage → Effacer les données), pas seulement le nettoyage interne du navigateur
(qui peut ne toucher que les cookies et laisser le Service Worker / Cache Storage intacts).

Ancienne alternative encore documentée dans `plateforme/README.md` mais non utilisée en pratique :
Netlify Drop (dépôt manuel d'une archive `cartographe-knight-a-deposer.zip`, sans lien avec le
dépôt git) — ne pas la proposer par défaut, le déploiement automatique décrit ci-dessus est déjà
en place et doit rester la référence.
