# Suivi Physique

Application web (HTML / CSS / JS, sans serveur) pour analyser l'évolution de ton corps à partir de deux fichiers CSV : tes **pesées** (poids et composition corporelle) et tes **mensurations** (tours en cm).

**Rien n'est stocké** : pas de localStorage, pas de cache, aucun envoi réseau de tes données. Tout est traité en mémoire dans ton navigateur ; recharger la page efface tout.

## Utilisation

1. Ouvre `index.html` dans ton navigateur (double-clic suffit). Aucune connexion internet n'est nécessaire en local : toutes les librairies sont incluses dans le projet.
2. Dépose tes fichiers CSV (un seul ou les deux). Le type de chaque fichier est détecté automatiquement.

### Installer sur mobile

L'app est une PWA installable depuis sa version en ligne (GitHub Pages) :

- **Android (Chrome)** : menu ⋮ → *Installer l'application*.
- **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.

Le service worker ne met **rien en cache** : il sert uniquement à rendre l'app installable. Une connexion internet reste nécessaire pour ouvrir la version en ligne.

### Pas de balance connectée ?

Sur l'écran d'accueil, télécharge les modèles vides :

- `modele-pesees.csv` : seules **La date** et **Poids(kg)** sont obligatoires. Renseigne l'**IMC** pour que ta taille soit déduite (sinon saisis-la dans l'app).
- `modele-mensurations.csv` : **Date** + au moins un tour en cm. Gauche (`L-`) et droite (`R-`) séparés pour biceps, cuisses et mollets.

Remplis-les dans Excel, LibreOffice ou Google Sheets (une ligne par mesure) et enregistre en CSV.
Formats acceptés : séparateur `;` ou `,`, décimales `89,9` ou `89.9`, dates `07/11/2026` ou `2026-11-07`, heure facultative.

## Ce que l'app affiche

- **Résumé** : indicateurs clés et analyse rédigée (rythme, composition de la perte, projection vers un objectif, assiduité).
- **Poids** : courbe avec moyenne 7 jours, tendance et projection, IMC, variations quotidiennes et hebdomadaires, effet du jour de la semaine, heure de pesée, calendrier.
- **Composition** : origine de la variation de poids (graisse / muscle / eau), répartition, masse grasse, muscle, masse maigre, FFMI, graisse viscérale, eau, protéines, os, métabolisme.
- **Mensurations** : évolution de chaque zone, profil radar, variations, asymétries gauche/droite, ratios (taille/hauteur, taille/hanches, forme en V), estimation US Navy du % de graisse.
- **Silhouette** : reconstruction de face à partir des tours, superposition de toutes les dates, comparaison départ/sélection annotée, carte de chaleur des variations et animation dans le temps.
- **Données** : tableaux bruts.

Un filtre de période (tout / 90 / 30 / 14 / 7 jours) et un thème clair/sombre sont disponibles.

## Structure

```
index.html
css/   variables (tokens, thèmes) · base · layout · components · charts
js/
  core/        namespace + bus d'événements, utilitaires, état en mémoire
  parsers/     lecture CSV, détection du type de fichier
  analysis/    métriques dérivées, tendances, analyse rédigée
  charts/      graphiques Chart.js par section, calendrier
  silhouette/  modèle anatomique, rendu SVG, vue interactive
  ui/          dépôt de fichiers, modèles CSV, KPI, tableaux, filtres, info-bulles
  app.js       orchestration
```

## Dépendances

Hébergées dans `js/vendor/` (aucun script chargé depuis un CDN, pour qu'un tiers compromis ne puisse pas exécuter de code dans la page). Licences MIT, en-têtes conservés.

| Fichier | Version | SHA-256 |
|---|---|---|
| `chart.umd.js` | Chart.js 4.4.1 | `74401d738dd3e03ee5dfb3b6841210fe2c4ead8a960c4011ca4ba0b78a9fd8f3` |
| `chartjs-plugin-zoom.min.js` | chartjs-plugin-zoom 2.0.1 | `503c709802be285c676afe0369bf5f72066d0b0c23929188c3158f35c0327a9c` |
| `hammer.min.js` | Hammer.js 2.0.8 (paquet npm ; l'en-tête du fichier indique 2.0.7) | `7953631f0e54794d2352a3cfa591c0914d73e14f90141058e3cf16bee7939bcf` |

Empreintes vérifiées identiques entre jsDelivr et unpkg au moment de l'import.
