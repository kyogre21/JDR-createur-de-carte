# Cathay — Ville basse (campagne « Roland »)

Deux fichiers à importer depuis la bibliothèque avec **↑ Importer** (il en accepte
plusieurs d'un coup). Regarde `apercu-ville-basse.png` avant, pour ne pas importer
à l'aveugle.

| Fichier | Ce que c'est |
|---|---|
| `cathay-ville-basse.json` | **La nouvelle carte.** 76 × 60 cases (114 × 90 m) à `cell=20`, comme dungeon K et la Ville haute. |
| `marche-plus-portail-basse.json` | **Ton Marché**, avec un portail « Ville basse » ajouté au bout de la route du sud-est. Même id, donc l'import le remplace. |

## À propos du fichier du Marché

Il part de **ta** version redimensionnée (600 × 600, `cell=15`), pas de la mienne.
Un seul élément est ajouté : le portail en `536,536`, au bout de la route qui portait
déjà le panneau « → Ville basse ». 83 éléments → 84, et **aucune** autre différence —
vérifié élément par élément. Tes renommages de portails sont conservés.

Copie de l'état actuel : `../sauvegardes/marche_avant-portail-ville-basse_2026-08-07.json`

## Ce qu'il reste à brancher toi-même

Sur la vue d'ensemble `Cathay`, le portail **« ville basse »** pointe encore vers
`dungeon K`. Passe-le sur `cathay-ville-basse`. Idem pour « ville moyenne » et
« Caserne » quand tu créeras ces cartes — utilise les ids `cathay-ville-moyenne` et
`cathay-caserne`, la Ville basse a déjà son portail vers la caserne qui les attend.

## Ce qu'il y a sur la carte

**La trame de ruelles** est le vrai contenu : 21 segments larges d'**une case**, dont
**cinq impasses**. Une case, c'est deux personnes de front au maximum, pas de
contournement, aucune ligne de vue au-delà du premier angle. C'est vérifié
automatiquement, pas juste voulu.

**Le Canal noir** coupe le quartier en deux avec **seulement deux ponts** : bloquer
les deux referme la Ville basse comme une nasse, et la garde le sait.

**Les lieux demandés :** Taverne « Le Magne » (refuge sûr, Magne sait qui dort où),
Boucherie Tarnec (trappe sous le billot vers le canal), Herboristerie (la vieille
Sève, et ce qu'il y a sous le comptoir), **« La Tonne Percée »** — la taverne miteuse,
volontairement placée **au fond d'une impasse** et non sur la rue : on n'y arrive pas
par hasard.

**Le nom « La Tonne Percée » est provisoire**, tu n'en avais pas. Renomme-la quand tu
veux, c'est un simple libellé.

**Ajouté pour densifier :** le canal et ses ponts, la place du puits (le seul
dégagement, donc le carrefour des rumeurs), le poste de garde du sud, et les
commerces — prêteur sur gages, ferrailleur, boulanger, tanneur, écrivain public,
fripier, poissonnier — plus une trentaine de masures anonymes.

**La clé compte 9 points** avec du contenu jouable : le point 6 donne les règles
d'embuscade dans les ruelles, le point 9 relie la bande du canal aux tire-laine de
la Place du Marché.

## Le générateur

`generer-basse.js` est le script qui a produit la carte. Tout y est défini **en
cases**, converti en pixels à la fin : changer `CELL` en tête de fichier régénère la
même carte à une autre échelle sans toucher une coordonnée. Utile quand tu voudras la
Ville moyenne ou la Caserne.
