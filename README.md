# Suivi Physique

Application web (HTML / CSS / JS, sans serveur) pour analyser l'évolution de ton corps à partir de deux fichiers CSV : tes **pesées** (poids et composition corporelle) et tes **mensurations** (tours en cm).

**Tes données ne sont jamais stockées** : pas de localStorage, pas de base locale, aucun envoi réseau. Elles sont traitées en mémoire dans ton navigateur ; recharger la page efface tout. Seul le **code** de l'app est mis en cache, pour qu'elle fonctionne hors connexion.

## Utilisation

1. Ouvre `index.html` dans ton navigateur (double-clic suffit). Aucune connexion internet n'est nécessaire en local : toutes les librairies sont incluses dans le projet.
2. Dépose tes fichiers CSV (un seul ou les deux). Le type de chaque fichier est détecté automatiquement.

### Installer sur mobile

L'app est une PWA installable depuis sa version en ligne (GitHub Pages) :

- **Android (Chrome)** : menu ⋮ → *Installer l'application*.
- **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.

Après la première ouverture, l'app fonctionne **hors connexion** : le service worker ([sw.js](sw.js)) garde en cache les fichiers de l'app (HTML, CSS, JS, icônes), jamais tes CSV.

Quand une nouvelle version est publiée, un bandeau *Nouvelle version disponible* propose de recharger.

**Publier une mise à jour** : à chaque modification d'un fichier de l'app, incrémenter `CACHE_VERSION` dans `sw.js` (`v1` → `v2`…), sinon les appareils déjà installés garderont l'ancienne version. Tout nouveau fichier doit aussi être ajouté à la liste `APP_FILES`.

### Pas de balance connectée ?

Sur l'écran d'accueil, télécharge les modèles vides :

- `modele-pesees.csv` : seules **La date** et **Poids(kg)** sont obligatoires. Renseigne l'**IMC** pour que ta taille soit déduite (sinon saisis-la dans l'app).
- `modele-mensurations.csv` : **Date** + au moins un tour en cm. Gauche (`L-`) et droite (`R-`) séparés pour biceps, cuisses et mollets.

Remplis-les dans Excel, LibreOffice ou Google Sheets (une ligne par mesure) et enregistre en CSV.
Formats acceptés : séparateur `;` ou `,`, décimales `89,9` ou `89.9`, dates `07/11/2026` ou `2026-11-07`, heure facultative.

## Ce que l'app affiche

- **Résumé** : indicateurs clés, jauge de progression vers l'objectif et analyse rédigée (rythme, composition de la perte, déficit estimé, projection et fourchette de dates, assiduité).
- **Poids** : courbe avec moyenne 7 jours, tendance observée et projection non linéaire avec fourchette probable (bilan énergétique : la perte ralentit à mesure que la dépense baisse, ≈ 22 kcal/j par kg perdu d'après Hall et al., Lancet 2011), déficit calorique estimé, vitesse de perte observée vs attendue, IMC, variations quotidiennes et hebdomadaires, distribution des variations, effet du jour de la semaine, heure de pesée, calendrier.
- **Composition** : origine de la variation de poids (graisse / muscle / eau), répartition, trajectoire gras / maigre, carte FMI × FFMI (Kelly 2009), part de gras dans la perte, masse grasse, muscle, masse maigre, FFMI, graisse viscérale, eau, protéines, os, métabolisme.
- **Mensurations** : évolution de chaque zone, matrice des variations zones × dates, profil radar, variations, cm perdus par kg perdu, asymétries gauche/droite, ratios (taille/hauteur, taille/hanches, forme en V), BRI et ABSI, estimation US Navy du % de graisse.
- **Silhouette** : reconstruction de face et de profil (courbes du dos, fessiers, bras) à partir des tours (squelette commun à toutes les dates : seule l'épaisseur des tissus varie), superposition de toutes les dates, comparaison annotée, avant / après à curseur, carte de chaleur des variations, animation dans le temps et export PNG.
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
