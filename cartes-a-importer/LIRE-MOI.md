# Cartes de Cathay à importer (campagne « Roland »)

Trois fichiers, à importer depuis la bibliothèque avec le bouton **↑ Importer**
(il accepte plusieurs fichiers d'un coup). Ils partent dans ton compte, donc ils
seront disponibles sur tous tes appareils et transmis à tes joueurs en séance.

| Fichier | Ce que c'est |
|---|---|
| `cathay-marche.json` | **Cathay — Place du Marché** : place ronde pavée, statue au centre, 11 étals, 12 îlots bâtis, porte de ville au nord, 5 routes. Clé de 5 points. |
| `cathay-ville-haute.json` | **Cathay — Ville haute** : avenue dallée, place à fontaine, traiteur, herboriste, 3 boutiques de luxe, hôtel particulier, 4 maisons. Clé de 8 points. |
| `cathay-portails-rebranches.json` | **Ta carte Cathay existante**, avec les 5 portails rebranchés. Même id, donc l'import la remplace. |

## À propos du fichier Cathay

Les 5 portails pointaient tous vers `carte_mseakbnc1` — c'est-à-dire **dungeon K**,
le donjon de la campagne Mandalf. C'était un reste de mise en place.

Seuls les 5 champs `vers` ont été changés. Position des portails, fond d'image,
taille, grille, date de modification : tout est identique à l'octet.

| Portail | Avant | Après |
|---|---|---|
| Marché | dungeon K | `cathay-marche` ✅ existe |
| Ville haute | dungeon K | `cathay-ville-haute` ✅ existe |
| Ville moyenne | dungeon K | `cathay-ville-moyenne` ⏳ à créer |
| Ville basse | dungeon K | `cathay-ville-basse` ⏳ à créer |
| Caserne | dungeon K | `cathay-caserne` ⏳ à créer |

Un portail dont la carte n'existe pas encore est **inerte** : le losange s'affiche,
mais marcher dessus ne fait rien (pas d'erreur). Le jour où tu crées la carte de la
Ville moyenne, donne-lui l'id `cathay-ville-moyenne` et la liaison fonctionne sans
que tu aies à toucher au plan de Cathay.

Une copie de la carte Cathay **telle qu'elle était avant** est dans
`../sauvegardes/cathay_avant-rebranchement-portails_2026-08-07.json`.
