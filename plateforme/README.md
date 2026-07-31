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
  manifest.webmanifest, sw.js   installation mobile + hors-ligne
```

## Les deux modes

**Éditeur** (`editeur.html`) — on dessine : pièces (épaisseur de murs réglable), murs, portes
et fenêtres qui s'accrochent au mur le plus proche, mobilier (17 symboles), numéros liés à la
clé du lieu, libellés, sources de lumière, secrets réservés au MJ, et portails vers les autres
cartes. Enregistrement automatique, plus un bouton **💾 Enregistrer** qui force l'écriture et
le confirme. La **clé numérotée** se remplit dans le panneau de droite (titre + description) et
accompagne la carte dans les exports.

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

**Gérer les dossiers depuis la bibliothèque** (sans ouvrir l'éditeur) :
- sur une carte, **✎ Renommer** ouvre une boîte de dialogue : nom de la carte et campagne, avec
  suggestion des campagnes existantes. Saisir un nom inédit **crée** le dossier ; laisser vide
  range dans « Sans campagne » ;
- sur un titre de dossier, **✎ Renommer le dossier** renomme la campagne et **déplace toutes ses
  cartes** d'un coup.

Ces actions ne concernent que *Mes cartes*. Une carte fournie avec l'application doit d'abord
être ouverte (elle est alors copiée dans ta bibliothèque) pour devenir modifiable.

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
`lumiere`, `portail`, `secret`. `grille.cell = 0` = carte d'extérieur (ni grille ni aimantation) ;
`cell = 40` avec `metres = 1.5` = plan tactique à l'échelle Knight.

Les éléments du calque **secrets** ne sortent qu'en vue MJ : ils disparaissent de la vue
joueurs, des miniatures et des exports en vue joueurs.

## Ajouter une carte au dépôt (elle devient visible partout, mobile compris)

1. Dans l'éditeur : **↓ JSON**.
2. Déposer le fichier dans `plateforme/cartes/`.
3. Ajouter une ligne dans `cartes/index.json`.
4. `git commit && git push` — le site se redéploie, la carte apparaît sur tous les appareils.

C'est le principe : **git est la base de données**. Gratuit, versionné, sans serveur.

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
`T` texte · `L` lumière · `S` secret · `W` portail · `Ctrl+Z` / `Ctrl+Y` annuler / refaire ·
`Suppr` supprimer · `R` tourner un objet · `X` inverser l'ouverture d'une porte ·
`Maj` (maintenu) désactive l'aimantation · `Échap` désélectionner.

Molette : zoom · glisser le fond : déplacer · clic droit : supprimer l'élément visé ·
deux doigts : zoom tactile.

## Ce qui n'est pas (encore) fait

Manques connus, par ordre d'utilité :

1. **Cartes manquantes de la campagne** : le village et la cave. Le portail « Village »
   du rez-de-chaussée reste donc gris.
2. **Image de fond** dans une carte (plan scanné, illustration) : le format le prévoit,
   l'éditeur ne l'expose pas encore.
3. **Publication** : rien n'est en ligne. Il faut un dépôt git puis Cloudflare Pages
   (voir plus bas) — c'est ce qui donnera l'accès depuis le téléphone.
4. **Les sources de lumière ne percent pas le brouillard** : les ✷ sont décoratives.
5. **Les murs n'arrêtent pas la révélation** : le pinceau traverse les cloisons. Le vrai
   calcul de ligne de vue est volontairement hors périmètre (c'est le poste le plus coûteux).
6. **Export PNG** (seuls JSON et SVG existent) ; **duplication** et **renommage** d'une
   carte depuis la bibliothèque ; **grille hexagonale** pour les cartes de région.
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
