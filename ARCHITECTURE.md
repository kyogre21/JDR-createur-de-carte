# Architecture — Cartographe

Document de référence : où vivent les données, pourquoi, et vers quoi on va.
Rédigé après revue complète (août 2026), à maintenir à chaque évolution structurante.

## Le besoin (formulé par le MJ)

> Une application qui permet, lors de sessions **en présentiel**, de montrer des cartes aux
> moments importants. Les joueurs **rejoignent la session ouverte par le MJ** — sur leur
> téléphone — et reçoivent d'office la **vue joueurs** ; le MJ garde la **vue MJ** et choisit
> ce qu'il révèle et quand.

## L'état actuel : trois flux, dont un seul incomplet

### 1. Création des cartes — sain, mais mal expliqué

```
Éditeur (PC) ──💾──► fichiers cartes/*.json du dépôt ──Publier.bat──► GitHub (historique) + Firebase Hosting
```

Une carte = un fichier JSON, versionné dans git ; le SVG n'est qu'un rendu. Le bouton
💾 écrit **directement dans le dossier du dépôt** (dossier « lié » une fois pour toutes) —
il n'y a **ni cache navigateur, ni copie de travail invisible** : ce que la bibliothèque
affiche est exactement le contenu du disque.

Ce qui a créé la confusion : l'enregistrement (💾, local, immédiat) et la **publication**
(git push, manuelle, invisible depuis l'appli) sont deux gestes distincts, et le second
n'était matérialisé nulle part. → corrigé par `Publier sur le site.bat` (un double-clic =
commit + push = site à jour). Une page web ne peut pas pousser dans git elle-même ; ce
raccourci est le pont honnête entre les deux mondes.

Ce flux **reste local par choix** : les cartes sont des fichiers qu'on possède, qu'on
versionne et qu'on relit — pas des enregistrements dans une base qu'on ne sait pas ouvrir.

### 2. Distribution — déjà en ligne, rien à changer

```
PC ──firebase deploy──► Firebase Hosting (https, PWA installable) ──► partout
(GitHub garde l’historique ; Netlify abandonné : builds facturés au crédit)
```

Les téléphones lisent les cartes servies par le site, en lecture seule assumée.
En-têtes `no-cache` sur pages/code (leçon apprise), cache long sur les images.

### 3. Session de jeu — le maillon local à remplacer

```
état de partie (brouillard, jetons, carte affichée, révélations)
        └── localStorage + BroadcastChannel  ⇒  UN SEUL ordinateur
```

C'est **le seul** endroit où « local » est un défaut : la vue joueurs ne fonctionne
qu'entre fenêtres du même PC. Rien d'autre ne bloque le multi-appareils.

## Architecture cible

```
                    ┌────────────────────────────────────────────┐
  PC du MJ          │   Service de synchronisation (temps réel)  │
  éditeur ──git──►  │   • 1 session = 1 code court (ex. ROI-482) │
  Netlify (cartes,  │   • le MJ seul écrit ; les joueurs lisent  │
  images, appli)    │   • contenu : état de partie uniquement    │
        │           └────────────▲───────────────▲───────────────┘
        ▼                        │               │
  téléphone joueur A      téléphone joueur B   PC du MJ (vue MJ)
  (appli installée,       (vue joueurs         écrit l'état
  vue joueurs forcée)     forcée)
```

Principes non négociables :
- **Les cartes ne transitent jamais par le service** : elles viennent du site, comme
  aujourd'hui. Seul l'état de partie (petit : cercles de brouillard, jetons, id de carte,
  révélations) est synchronisé.
- **Écriture réservée au MJ** (règles de sécurité côté service) : pas de conflits à gérer,
  un joueur ne peut rien casser ni rien dévoiler.
- **Rejoindre = entrer un code** (ou ouvrir un lien `…/table.html?session=ROI-482`) :
  arrivée forcée en vue joueurs, aucune inscription.
- **Sans session, rien ne change** : la table locale (TV, `?vue=joueurs`) continue de
  fonctionner hors ligne exactement comme aujourd'hui. Le service est une couche optionnelle.

### Choix du service : Firebase Realtime Database (recommandé)

| Critère | Firebase RTDB | Supabase | Relais local (PC du MJ) |
|---|---|---|---|
| Veille des projets gratuits | non | pause après 1 sem. d'inactivité | — |
| Compte requis pour les joueurs | non (anonyme) | non | non |
| Fonctionne avec l'appli installée (https) | oui | oui | **non** (mixed content : une page https ne peut pas parler à un serveur local non chiffré) |
| Dépendance à un tiers | Google | Supabase | aucune |
| Internet requis à la table | oui | oui | non |

Le relais local serait le plus « propre » (aucun tiers) mais condamne l'appli installée :
les joueurs devraient naviguer vers `http://192.168…` au lieu d'ouvrir leur icône.
Firebase permet : même appli pour tout le monde, même adresse, et ça couvrira le jeu à
distance sans retravail. La pause hebdomadaire de Supabase est rédhibitoire pour un rythme
de campagne (une session par semaine ou quinzaine).

### Découpage du chantier

1. **Couche session** (`js/session.js`) : créer/rejoindre/quitter, publication de l'état
   par le MJ, abonnement côté joueurs. L'état échangé reprend tel quel le format de
   `partie` (localStorage) — pas de nouveau format.
2. **Interface** : bouton « Ouvrir une session » (vue MJ) → code affiché en grand ;
   écran « Rejoindre » (code) ; bandeau discret « session ROI-482 · 3 joueurs ».
3. **Sécurité** : règles Firebase — seul le créateur de la session (identifiant anonyme)
   écrit ; les sessions expirent (nettoyage automatique après ~24 h).
4. **Dégradé** : si le service est injoignable, retour au mode local actuel, en le disant.

## Risques et dettes identifiés à la revue

- `plateforme/images/` pèse **52 Mo** dans git : chaque déploiement les re-traite, et d'anciens
  binaires resteront dans l'historique pour toujours. À compresser (JPEG ~1200 px) avant que ça
  n'enfle. Ne jamais rendre ce dépôt public : illustrations sous droits (Project Moon, Knight).
- Le README contenait des sections périmées (publication « pas encore faite », mention
  d'IndexedDB pour les cartes) : corrigées lors de cette revue. Le README est la référence
  fonctionnelle — le tenir à jour fait partie de toute livraison.
- `sw.js` : réseau d'abord, cache en secours. Ne jamais revenir à « cache d'abord » (déjà
  causé deux pannes de « correctif fantôme »).

## Étape franchie (2026-08) : comptes MJ, parties persistantes, bibliothèque privée

Le modèle « session jetable » a été remplacé :

- **Compte MJ** (e-mail + mot de passe, Firebase Auth) : les parties et la LISTE des
  cartes vivent dans l'espace privé `mj/<uid>` de la base. Les joueurs restent des
  invités anonymes — un code suffit.
- **Parties persistantes** (`parties/<code>`) : le code à 4 chiffres est STABLE pour
  toute la campagne ; brouillard, révélations et jetons sont conservés d'une séance à
  l'autre (« Reprendre » remet la table telle qu'elle a été laissée). Quitter la table
  ne détruit rien ; `mjEnLigne` signale seulement la présence du MJ. Seule la
  suppression explicite efface une partie. Création réservée aux comptes
  (`sign_in_provider === 'password'` dans les règles).
- **Bibliothèque privée (niveau 1)** : `cartes/index.json` n'est PLUS déployé
  (ignore de firebase.json) — sans la liste, rien n'est découvrable ni parcourable.
  L'index privé est poussé automatiquement depuis le PC (dossier lié + connecté)
  vers `mj/<uid>/cartes`, et lu par les autres appareils du MJ. Les fichiers
  `cartes/<id>.json` restent servis à qui connaît l'adresse EXACTE : c'est de la
  discrétion, pas un coffre-fort — le niveau 2 (cartes dans la base, vrai secret,
  vrai multi-MJ) reste à faire si le besoin se confirme.
- **Porte d'entrée** (`index.html`) : sans dossier lié ni compte, on ne voit que
  « Rejoindre une partie » et « Espace MJ » ; la table d'un joueur charge les cartes
  demandées par l'état du MJ directement par fichier (pas de catalogue côté invité).
- Le flux d'édition PC (dossier lié → fichiers → git) est INCHANGÉ.

## Étape 2 (2026-08) : les cartes vivent dans le compte

Le dossier local n'est plus un passage obligé — verdict utilisateur : « il faut que tout
se fasse automatiquement, sinon c'est inutile ».

- **Bibliothèque en ligne** : chaque carte est stockée dans `mj/<uid>/cartes/<id>`
  sous forme de **chaîne JSON intacte** (jamais l'objet : Firebase ampute les champs
  vides). Créée/modifiée n'importe où (Firefox compris), une carte est disponible sur
  tous les appareils du MJ. C'est la source de vérité.
- **Le dossier lié devient un bonus** : s'il existe (PC Chromium), chaque
  enregistrement y écrit AUSSI le fichier (copie git), et les fichiers locaux plus
  récents migrent automatiquement vers le compte au listage.
- **La carte affichée voyage avec la partie** (`parties/<code>/carte`, publiée par le
  MJ à chaque changement) : les joueurs invités n'ont ni compte ni bibliothèque, et
  les cartes récentes n'existent plus en fichiers publiés. Le fetch direct
  `cartes/<id>.json` reste un dernier recours pour les anciennes cartes déployées.
- **Marqueur local `kj-mj-connecte`** : posé à la connexion, retiré à la déconnexion.
  Il évite aux visiteurs/invités de payer l'initialisation du SDK juste pour apprendre
  qu'il n'y a rien à attendre — et aux pages du MJ d'expirer leurs délais au premier
  démarrage à froid.
- Import en lot (`↑ Importer`, multi-fichiers) = chemin de migration depuis n'importe
  quel navigateur.

## Les images ne sont plus publiées sur le site

`firebase.json` exclut `images/**` du déploiement, au même titre que
`cartes/index.json`. Raison : le site est public, donc tout fichier publié est
librement téléchargeable par n'importe qui — y compris les illustrations sous
droits (Project Moon, Knight) et les visuels d'une campagne en cours. Un autre MJ
qui crée un compte voyait la bibliothèque d'images personnelle du premier.

Conséquences, à garder en tête :

- **`plateforme/images/` reste utile en LOCAL** (serveur `Lancer la plateforme.bat`) :
  aperçu pleine qualité, tri par dossiers, et c'est là que vivent les originaux.
- **En ligne, seules les images de COMPTE existent** (`mj/<uid>/images`, dossier
  « 👤 Mes images ») : privées par construction, et transportées aux joueurs avec
  la carte qui les référence.
- Donc **une image posée sur une carte doit venir du compte** (`src: "img:<id>"`).
  Une carte qui référence `images/…` s'affichera en local mais pas en ligne.
