# Cartographe Knight

Éditeur de cartes de jeu de rôle pour la campagne **La Forêt Noire** (Knight JDR).
Application entièrement statique : aucun serveur, aucun compte, aucun abonnement.

Projet autonome : `C:/Projet/jdr créateur de carte/` — volontairement séparé du dossier de
campagne `C:/Projet/jdr/`, avec son propre dépôt git. L'outil et le contenu de jeu
évoluent chacun de leur côté.

```
plateforme/
  index.html          bibliothèque de cartes
  editeur.html        éditeur (création)
  table.html          table de jeu (brouillard, jetons)
  css/commun.css
  js/modele.js        format de carte (la référence)
  js/rendu.js         modèle → SVG (éditeur, table de jeu, PDF)
  js/stockage.js      IndexedDB + import/export de fichiers
  js/editeur.js       outils et interactions d'édition
  js/table.js         brouillard, jetons, portails, ping, mesure
  cartes/             cartes de la campagne (source de vérité, versionnée)
  images/             illustrations (créatures, lieux) + images/index.json (catalogue)
  manifest.webmanifest, sw.js   installation mobile + hors-ligne
```

## Les deux modes

**Éditeur** (`editeur.html`) — on dessine : pièces (épaisseur de murs réglable), murs, portes
et fenêtres qui s'accrochent au mur le plus proche, mobilier (24 symboles, dont une colline en
courbes de niveau pour les cartes extérieures), numéros liés à la
clé du lieu, libellés, sources de lumière, secrets réservés au MJ, et portails vers les autres
cartes. Enregistrement automatique, plus un bouton **💾 Enregistrer** qui force l'écriture et
le confirme. La **clé numérotée** se remplit dans le panneau de droite (titre + description) et
accompagne la carte dans les exports.

## Où vivent les cartes : dans les fichiers, et nulle part ailleurs

**Une carte = un fichier `cartes/<id>.json`.** Il n'y a pas de « copie de travail » cachée dans
le navigateur, pas de version « fournie » à côté d'une version « à moi » : ce que tu vois dans la
bibliothèque est exactement ce que tu commiteras.

| Appareil | Ce qu'il lit | Peut modifier ? |
|---|---|---|
| PC (Chrome, Edge, Brave) avec le dossier lié | les fichiers **du disque** | oui |
| Téléphone, ou navigateur non compatible | les fichiers **servis par le site** | non — lecture seule |

**Lier le dossier** : au premier clic sur **💾 Enregistrer**, l'éditeur demande une fois de
choisir le dossier `plateforme` (celui qui contient `cartes`). Ensuite, chaque enregistrement
écrit directement `cartes/<id>.json` et régénère `cartes/index.json`. Rien d'autre à faire.

**Publier** : entièrement manuel, avec ton outil git habituel. Une fois les fichiers à jour sur
le disque, `git commit` puis `git push` quand tu veux — Netlify redéploie tout seul derrière, et
le téléphone voit la mise à jour. L'appli ne se connecte jamais d'elle-même à un service distant :
aucun déploiement ne part sans que tu l'aies décidé.

**Sur le téléphone**, l'appli est explicitement en lecture seule : on y joue et on y consulte. Les
boutons de création/modification n'y apparaissent pas, plutôt que d'enregistrer dans un coin
invisible que personne ne retrouverait ensuite.

**Table de jeu** (`table.html`) — on joue : **brouillard de guerre** au pinceau
(☀ Révéler / ☁ Cacher, « Tout couvrir », « Tout révéler »), jetons déplaçables aimantés
à la grille, portails pour passer d'une carte à l'autre, ping au double-clic, mesure en
cases et en mètres.

Les **portails** se posent dans l'éditeur (outil ◈ Portail) et deviennent cliquables en mode
Jeu : ce sont les losanges étiquetés sur les escaliers. **Doré = cliquable**, la carte de
destination existe ; **gris = inerte**, la carte visée manque à la bibliothèque. Ils vivent
sous le brouillard, donc invisibles pour les joueurs tant que la zone n'est pas révélée.
Penser à poser le portail de retour sur l'autre carte.

En jeu, **Ctrl+Z (ou ↶) annule le dernier geste de brouillard** — indispensable quand un
coup de pinceau dévoile une pièce entière.

Sur la TV ou un second écran, ouvre la même page avec **`?vue=joueurs`** : brouillard
opaque, aucun outil, secrets masqués, et tout se synchronise en direct avec ta fenêtre
(brouillard, jetons, changement de carte, cadrage). Cette synchronisation fonctionne
**entre fenêtres d'un même ordinateur** ; jouer à distance depuis plusieurs appareils
demanderait un serveur.

Une carte est une **donnée** ; le brouillard et les jetons sont une **session de partie**,
stockés à part (`localStorage`). Modifier une carte dans l'éditeur ne remet donc pas à zéro
une partie en cours.

## Comment ouvrir l'application

Il n'y a **aucun logiciel à installer**, ni sur l'ordinateur ni sur le téléphone : c'est un
site web. On l'ouvre donc toujours par une adresse.

| Depuis… | Adresse à ouvrir | Conditions |
|---|---|---|
| l'ordinateur | `http://127.0.0.1:8777/` | double-cliquer d'abord sur `Lancer la plateforme.bat` |
| un téléphone, à la maison | `http://<IP du PC>:8777/` (affichée par le lanceur) | même Wi-Fi, PC allumé, fenêtre du lanceur ouverte |
| un téléphone, n'importe où | l'adresse `https://….netlify.app` | rien d'autre — c'est la voie recommandée |

**Le fichier `.bat` ne sert que sur Windows** : le copier sur un téléphone n'a aucun effet,
un téléphone ne sait pas exécuter un script Windows. Il démarre seulement le serveur local
sur l'ordinateur.

**Pour que ça ressemble à une vraie application sur le téléphone** : ouvre l'adresse, puis
menu du navigateur → *Ajouter à l'écran d'accueil* (Android/Chrome) ou *Partager → Sur l'écran
d'accueil* (iPhone/Safari). Une icône apparaît ; l'application s'ouvre alors en plein écran,
sans barre d'adresse, et fonctionne même **sans réseau** une fois visitée.

## Utiliser en local

**Double-clique sur `Lancer la plateforme.bat`** (dans le dossier parent). Il démarre un
petit serveur local et ouvre la bibliothèque dans le navigateur. Garde la fenêtre noire
ouverte pendant la partie ; la fermer arrête le serveur.

Adresses :

| | |
|---|---|
| Bibliothèque | `http://127.0.0.1:8777/` |
| Éditeur | `http://127.0.0.1:8777/editeur.html` |
| Table de jeu | `http://127.0.0.1:8777/table.html` |
| Vue joueurs (TV) | `http://127.0.0.1:8777/table.html?vue=joueurs` |

**N'ouvre pas les fichiers en double-cliquant dessus.** En accès direct (`file://`), le
navigateur refuse de lire `cartes/index.json` : les cartes de la campagne n'apparaissent
pas et **les portails des escaliers restent gris et inertes**. Les pages affichent un
bandeau d'avertissement dans ce cas.

Équivalent en ligne de commande :
```bash
cd plateforme
python -m http.server 8777
```

## Ranger les cartes par campagne

Chaque carte porte une **campagne**, qui lui sert de dossier. Le champ se saisit dans
l'éditeur (panneau *Carte* → **Campagne**), avec suggestion des campagnes déjà utilisées ;
le laisser vide range la carte dans « Sans campagne ».

**Créer un dossier** : bouton **🗀 Nouvelle campagne** dans l'en-tête. Le dossier apparaît
vide, prêt à recevoir des cartes ; un bouton ✕ le supprime tant qu'il est vide (les cartes,
elles, ne sont jamais supprimées par cette action).

**Déposer des cartes dans un dossier** : **fais glisser une carte sur le titre du dossier**.
Le titre s'éclaire quand le dépôt est possible. Sur mobile, où le glisser-déposer n'existe pas,
passe par **✎ Renommer** sur la carte et choisis la campagne.

**Gérer les dossiers depuis la bibliothèque** (sans ouvrir l'éditeur) :
- sur une carte, **✎ Renommer** ouvre une boîte de dialogue : nom de la carte et campagne, avec
  suggestion des campagnes existantes. Saisir un nom inédit **crée** le dossier ; laisser vide
  range dans « Sans campagne » ;
- sur un titre de dossier, **✎ Renommer le dossier** renomme la campagne et **déplace toutes ses
  cartes** d'un coup.

Ces actions ne concernent que *Mes cartes*. Une carte fournie avec l'application doit d'abord
être ouverte (elle est alors copiée dans ta bibliothèque) pour devenir modifiable.

**Pourquoi les cartes fournies n'ont pas de bouton de suppression** : elles ne sont pas dans ta
bibliothèque, elles viennent de fichiers du dépôt (`cartes/*.json`) — les effacer n'aurait aucun
effet durable, elles reviendraient au rechargement. Pour en retirer une définitivement, il faut
supprimer son fichier et sa ligne dans `cartes/index.json`, puis commiter.

**Pas de doublon à l'écran** : dès que tu possèdes une copie de travail d'une carte fournie
(même identifiant ou même nom), l'originale disparaît de la section « Cartes fournies » — sinon
la même carte apparaîtrait deux fois. Le filtre de campagne ne propose lui aussi que des
campagnes réellement affichées. Supprimer ta copie fait réapparaître l'originale : rien n'est
perdu, et le bouton de suppression le dit.

Ce classement se retrouve partout :
- **bibliothèque** : les cartes sont groupées par campagne, avec le nombre de cartes, et un
  sélecteur en en-tête permet de n'afficher qu'une campagne (choix mémorisé) ;
- **table de jeu** : le sélecteur de carte est groupé par campagne.

Le sélecteur de filtre n'apparaît qu'à partir de deux campagnes — inutile d'encombrer avant.

## Le format de carte

Une carte est un fichier JSON. Le SVG n'est qu'un *rendu* : c'est ce qui rend les cartes
rééditables, versionnables (un JSON se relit et se diffe dans git) et réutilisables dans
les trois usages — éditeur, table de jeu, PDF de Codex.

```json
{
  "id": "manoir-cygnus-rdc",
  "nom": "Manoir Cygnus — Rez-de-chaussée",
  "taille": { "w": 560, "h": 466 },
  "grille": { "cell": 40, "metres": 1.5 },
  "elements": [
    { "type": "piece",   "x": 40, "y": 40, "w": 480, "h": 120, "nom": "Salle à manger" },
    { "type": "porte",   "x": 300, "y": 400, "o": "h", "l": 60, "style": "double", "sens": -1 },
    { "type": "objet",   "sym": "lit", "x": 484, "y": 194, "w": 28, "h": 52, "rot": 0 },
    { "type": "secret",  "x": 286, "y": 250, "w": 28, "h": 40, "nature": "trappe ?" },
    { "type": "portail", "x": 258, "y": 330, "vers": "manoir-cygnus-etage", "label": "Étage" }
  ],
  "cle":  [ { "num": 1, "titre": "Grand hall", "desc": "…" } ]
}
```

Le champ `campagne` sert de dossier (voir plus haut).

Types d'éléments : `piece`, `mur`, `porte`, `fenetre`, `objet`, `numero`, `texte`,
`lumiere`, `portail`, `secret`, `image`. `grille.cell = 0` = carte d'extérieur (ni grille ni aimantation) ;
`cell = 40` avec `metres = 1.5` = plan tactique à l'échelle Knight.

Les éléments du calque **secrets** ne sortent qu'en vue MJ : ils disparaissent de la vue
joueurs, des miniatures et des exports en vue joueurs.

## Ajouter une carte au dépôt (elle devient visible partout, mobile compris)

1. Dans l'éditeur : **↓ JSON**.
2. Déposer le fichier dans `plateforme/cartes/`.
3. Ajouter une ligne dans `cartes/index.json`.
4. `git commit && git push` — le site se redéploie, la carte apparaît sur tous les appareils.

C'est le principe : **git est la base de données**. Gratuit, versionné, sans serveur.

## Montrer une image (créature, lieu) sur une carte

L'outil **🖼 Image** pose une petite icône à un endroit précis du plan ; en mode Jeu, un clic
dessus affiche l'illustration en grand par-dessus la carte (le plan reste visible en dessous,
un clic ailleurs referme). Pratique pour montrer à la volée le portrait d'une créature ou une
vue d'un lieu sans quitter la carte.

Ces icônes sont **réservées au MJ** : invisibles côté joueurs (`?vue=joueurs`), comme les
secrets — leur seule présence serait un indice. **Clic droit dessus (ou sur un secret) pour la
révéler aux joueurs en permanence** — voir plus bas.

Comme pour les cartes, les images viennent du **dépôt**, jamais d'un import depuis l'appareil :
ça marche pareil sur mobile que sur PC, sans manipulation de fichiers à chaque partie.

1. Dépose des fichiers image (jpg/png/webp) dans `plateforme/images/` — **des dossiers entiers
   fonctionnent aussi**, y compris imbriqués, pour ranger par campagne ou par thème (ex.
   `images/Knight/`, `images/Legendary lands/Campagne oiseau/`).
2. Régénère le catalogue :
   ```bash
   cd plateforme && node generer-catalogue-images.js
   ```
   Il scanne tout `plateforme/images/` (sous-dossiers compris) et réécrit `images/index.json` en
   entier — pas besoin d'éditer ce fichier à la main.
3. `git commit && git push` — les images apparaissent dans le panneau de l'outil Image sur tous
   les appareils.
4. Dans l'éditeur, outil **🖼 Image** : le panneau de droite s'ouvre sur la racine du dépôt, avec
   les dossiers en vignettes — clique dedans pour naviguer, un fil d'ariane en haut permet de
   remonter. Choisis une image, puis clique sur le plan pour poser son icône. La sélectionner
   permet de changer sa légende ou l'image choisie.

### Révéler un secret ou une image aux joueurs

Une icône d'image ou un secret posé sur le plan reste invisible aux joueurs par défaut — mais
**clic droit dessus, en mode Jeu (vue MJ), bascule sa visibilité en permanence**. Une fois
révélé, il reste visible aux joueurs (teinté en vert côté MJ pour le distinguer d'un coup
d'œil), y compris sur une vraie fenêtre séparée (`?vue=joueurs`, TV ou second écran) : c'est le
sens même de « rendre visible ».

C'est une **session de partie** (comme le brouillard), pas une donnée de la carte : révéler un
secret ne modifie pas le fichier de la carte, et se réinitialise avec la partie. Re-clic droit
dessus pour le cacher de nouveau.

**Révélation automatique** : dès qu'un jeton marqué **PJ** entre dans la **pièce** qui contient
un secret ou une image, il se révèle tout seul (un message le confirme), sans clic droit — utile
pour une créature ou un indice qui doit apparaître dès que le groupe pénètre quelque part, sans
que le MJ ait à y penser. Approximation volontaire d'une ligne de vue (une pièce fermée = un
champ de vision) : le vrai calcul optique, plus coûteux, reste hors périmètre de ce projet (voir
plus bas). Un élément posé hors de toute pièce (couloir, extérieur) se révèle par proximité
(~2 cases) à la place. Comme le clic droit, c'est permanent : le groupe qui ressort de la pièce
ne re-cache rien.

**Désactiver la révélation automatique pour un élément précis** : dans l'éditeur, sélectionne le
secret ou l'image, décoche **« Révélation automatique »**. Utile pour un secret qui ne doit
jamais se dévoiler tout seul (une trappe cachée dans un mur, par ex.) — le clic droit en mode
Jeu reste toujours possible pour le révéler à la main, seul le déclenchement automatique par
un jeton PJ est coupé. Cochée par défaut, pour tout nouvel élément comme pour les anciens.

**Repartir à neuf pour une nouvelle table** : bouton **↺ Réinitialiser cette carte**, en mode
Jeu (vue MJ). Une case à cocher par catégorie — **brouillard** (décochée par défaut : ça
représente souvent des heures d'exploration, pas la peine de le perdre pour corriger une
révélation isolée), **révélations** et **jetons** (cochées par défaut, le cas le plus courant en
rejouant la carte avec un nouveau groupe) — coche seulement ce que tu veux remettre à zéro. Ne
touche que la carte affichée, jamais les autres cartes de la campagne. Pour ne corriger qu'un
seul élément sans tout ça, plus rapide : clic droit dessus (voir plus haut), ça ne touche pas au
brouillard.

### Créer un jeton, changer de carte en marchant sur un portail

**+ Jeton** pose immédiatement un jeton PJ (étiquette J1, J2… automatique) — un clic, rien
d'autre. Pour lui donner un nom, un portrait ou le marquer PNJ, **double-clic dessus** ensuite ;
clic droit dessus le supprime directement, sans rien demander.

**Un jeton PJ glissé sur un losange doré change de carte tout seul**, comme si le groupe montait
l'escalier : la nouvelle carte se charge, et tous les jetons marqués PJ y sont amenés avec lui
(même comportement que le bouton ⇄ PJ). Pas besoin de cliquer sur le losange séparément.

**Les joueurs peuvent déplacer leur propre jeton PJ**, y compris depuis une vraie fenêtre
séparée (`?vue=joueurs`, TV ou second écran) — un jeton qui n'est pas marqué PJ, lui, n'y est
jamais manipulable, pour ne pas déranger la mise en scène du MJ (les PNJ et monstres restent
sous son seul contrôle). Cette fenêtre reste sans aucun autre outil MJ ; seul le déplacement
d'un jeton PJ y est permis, et se répercute normalement du côté du MJ.

**+ Jeton reste aussi accessible depuis la préview locale du MJ** (le bouton Vue joueurs/Vue MJ,
même écran) — pratique quand chaque joueur crée lui-même son jeton sur l'écran partagé, sans
repasser par le MJ. Pas dans la vraie fenêtre séparée, celle-ci reste volontairement sans aucun
outil de création.

**Vérifie l'image avant de t'y fier** : un nom de fichier peut tromper (par exemple, dans ce
projet, `Nihil.png` est en réalité l'illustration d'un personnage bouffon sans rapport, pas de
l'entité qui porte ce nom).

**Montrer une image sans plan** (un PNJ important apparaît, pas besoin de carte à cet instant) :
bouton **🖼 Galerie** dans la table de jeu (mode MJ). Il ouvre le même catalogue avec le même
sélecteur de dossier, mais sans passer par une icône posée sur un plan — un clic sur une
vignette affiche directement l'image en grand. Comme les icônes, la galerie est réservée au MJ
et invisible en vue joueurs.

## Publier gratuitement (et l'installer sur mobile)

**Le dépôt est en place** : <https://github.com/kyogre21/JDR-createur-de-carte> (privé),
branche `main`. Pour publier une mise à jour :
```bash
cd "C:/Projet/jdr créateur de carte"
git add -A && git commit -m "…" && git push
```

**Encore plus simple, sans git :** l'archive `cartographe-knight-a-deposer.zip` (à la racine
du projet, régénérable) se glisse directement sur [app.netlify.com/drop](https://app.netlify.com/drop)
— mise en ligne immédiate, sans compte. Il faut redéposer l'archive à chaque mise à jour.

### Netlify — recommandé
Gratuit, accepte les dépôts **privés**, redéploie à chaque `git push`.
1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
2. **Deploy with GitHub**, autoriser, choisir `JDR-createur-de-carte`.
3. Un seul réglage compte : **Publish directory** = `plateforme`.
   Laisser *Build command* **vide** et *Base directory* vide.
4. **Deploy** → adresse en `https://<nom>.netlify.app` (renommable dans *Site configuration*).

### Sans aucun compte : Netlify Drop
Glisser `cartographe-knight-a-deposer.zip` sur [app.netlify.com/drop](https://app.netlify.com/drop).
En ligne immédiatement ; il faut redéposer l'archive à chaque mise à jour
(`python creer-archive.py` la régénère).

### Cloudflare — attention
**Pages est déprécié depuis avril 2025** : l'entrée « Workers & Pages » a disparu du tableau de
bord pour les nouveaux projets. Il faut passer par *Workers + static assets*, ce qui demande
l'outil `wrangler` et un fichier de configuration — inutilement compliqué pour un site statique.

### Installer sur le téléphone de quelqu'un d'autre

L'application est un site : **toute personne à qui tu donnes l'adresse peut l'ouvrir et
l'installer** sur son propre téléphone, sans compte ni magasin d'applications. Il faut juste
l'adresse `https://….netlify.app` — l'installation exige `https`, donc elle ne fonctionne pas
via l'adresse locale `192.168.x.x`.

- **Android / Chrome** : menu ⋮ → *Installer l'application* (ou *Ajouter à l'écran d'accueil*).
- **iPhone / Safari** : bouton Partager → *Sur l'écran d'accueil*. À faire depuis Safari.

Chacun obtient une icône et une application en plein écran. Attention : **chaque appareil a
sa propre session de jeu** (son brouillard, ses jetons). Le partage en direct entre plusieurs
appareils demanderait un service de synchronisation — voir « Suites possibles ».

### Installer sur le téléphone
Ouvrir l'adresse dans Chrome (Android) ou Safari (iOS) → menu → **Ajouter à l'écran
d'accueil**. L'application s'ouvre alors en plein écran et **fonctionne hors-ligne**
(service worker), ce qui est précieux à table quand le réseau manque.

Attention : le cache hors-ligne (service worker) est **actuellement désactivé**. Une version
précédente resservait indéfiniment l'ancien code, y compris celui qui réinstallait le cache :
les corrections n'arrivaient jamais jusqu'au navigateur. `sw.js` est donc devenu un script
d'autodestruction qui purge tout et se désinscrit. À la publication, on remettra un cache
versionné, en « réseau d'abord » sur le HTML.

## Où vivent les données

| Donnée | Emplacement | Portée |
|---|---|---|
| Cartes en cours d'édition | IndexedDB du navigateur | l'appareil et le navigateur utilisés |
| Cartes de la campagne | `cartes/*.json` dans git | tous les appareils, versionné |
| Export SVG | fichier téléchargé | pour les PDF de Codex |
| Bloc de scène | presse-papier | à coller dans la table de jeu |

Un navigateur ne partage pas son IndexedDB avec un autre appareil : pour retrouver une
carte sur le téléphone, elle doit passer par le dépôt (ou par un export/import de fichier).

## Raccourcis clavier

`V` choisir · `P` pièce · `M` mur · `D` porte · `F` fenêtre · `O` objet · `N` numéro ·
`T` texte · `L` lumière · `S` secret · `W` portail · `I` image · `Ctrl+Z` / `Ctrl+Y` annuler / refaire ·
`Suppr` supprimer · `R` tourner un objet · `X` inverser l'ouverture d'une porte ·
`Maj` (maintenu) désactive l'aimantation · `Échap` désélectionner.

Molette : zoom · glisser le fond : déplacer · clic droit : supprimer l'élément visé ·
deux doigts : zoom tactile.

## Ce qui n'est pas (encore) fait

Manques connus, par ordre d'utilité :

1. **Carte manquante de la campagne** : la cave (le portail « Village » du rez-de-chaussée
   pointe désormais vers `village.json`, qui existe).
2. **Image de fond** dans une carte (plan scanné, illustration) : le format le prévoit,
   l'éditeur ne l'expose pas encore.
3. **Publication** : rien n'est en ligne. Il faut un dépôt git puis Cloudflare Pages
   (voir plus bas) — c'est ce qui donnera l'accès depuis le téléphone.
4. **Les sources de lumière ne percent pas le brouillard** : les ✷ sont décoratives.
5. **Les murs n'arrêtent pas la révélation** : le pinceau traverse les cloisons. Le vrai
   calcul de ligne de vue est volontairement hors périmètre (c'est le poste le plus coûteux).
6. **Export PNG** (seuls JSON et SVG existent) ; **duplication** d'une carte depuis la
   bibliothèque ; **grille hexagonale** pour les cartes de région. (Le renommage et le
   rangement par campagne, eux, sont faits — bouton **✎ Renommer** dans la bibliothèque.)
7. **Synchronisation multi-appareils** : la vue joueurs fonctionne entre fenêtres d'un même
   ordinateur, pas entre machines. Demanderait un serveur.
8. **Hors périmètre assumé** : dés, fiches de personnage, ordre d'initiative — ce n'est pas
   un VTT complet, et c'est un choix.

## Suites possibles

- Import d'une **image de fond** dans une carte (plan scanné, illustration).
- Sources de lumière qui percent le brouillard (halos autour des torches).
- Tuiles réutilisables (un modèle de chambre qu'on repose).
- Synchronisation multi-appareils : n'est utile que pour jouer à distance ; demande un
  backend (Supabase ou Cloudflare D1, tous deux avec une offre gratuite).
