---
name: plateforme-cartes
description: À utiliser pour toute intervention sur Cartographe Knight, l'éditeur de cartes de JDR de ce projet — ajouter un outil ou un type d'élément, un symbole de mobilier, corriger le rendu, le brouillard, les portails, la bibliothèque, le stockage, publier le site. Déclencheurs : "ajoute un outil", "nouveau symbole", "l'éditeur/la table de jeu ne…", "le brouillard", "les portails", "publie la plateforme". Contient l'architecture, les invariants et le protocole de vérification obligatoire.
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
| faire évoluer le format | migrer **à la lecture** dans `depuisJSON()` (voir la migration `pins` → éléments `portail`) : les anciens fichiers doivent rester valides |

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
```

Scripts **classiques** (pas de modules ES : ils sont bloqués en `file://`), namespace global `KJ`.

**Séparation des données** : une carte est une *donnée* (`cartes/*.json`, IndexedDB) ; le brouillard
et les jetons sont une *session de partie* (`localStorage`, clé `kj-partie`). Modifier une carte ne
doit jamais réinitialiser une partie en cours.

**Ordre des couches en jeu** (non négociable, hérité de Foundry/Roll20) :
`plan < portails < brouillard < jetons < pings/mesure < interface`. Le brouillard couvre le décor
et les portails, jamais les jetons ni les pings.

## Vérification obligatoire — ne jamais livrer sans avoir regardé

```bash
cd "C:/Projet/cartographe-knight/plateforme" && python -m http.server 8777
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
- **IndexedDB ne répond pas sous `--virtual-time-budget`** : tout code qui l'attend semble figé.
  D'où `S.avecDelai()` — et l'impossibilité de simuler la bibliothèque locale en headless. Tester
  ces cas en exposant la logique (`window.KJ_TABLE`) et en lui injectant un état.
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

## Style

Charte de la campagne : parchemin sombre (`--parchemin #221b11`), encre pâle (`--encre #d3c5a4`),
bordeaux (`--sang`) et or (`--or`) en accents. Interface sobre pour ne pas concurrencer la carte.
Textes d'interface en français, tutoiement, sans jargon technique.

## Publication

Site statique → `plateforme/` est la racine à publier. Dépôt git déjà initialisé.
Voir `plateforme/README.md` : Netlify Drop (immédiat, archive `cartographe-knight-a-deposer.zip`)
ou Cloudflare Pages connecté au dépôt (mises à jour automatiques, gratuit même en dépôt privé).
Régénérer l'archive après modification.
