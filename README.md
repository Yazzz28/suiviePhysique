# Suivi Physique

Application web (HTML / CSS / JS, sans serveur) pour analyser l'évolution de ton corps à partir de tes **pesées** (poids et composition corporelle), de tes **mensurations** (tours en cm) et, en option, de ton **export Samsung Health** (repas, activité, sommeil, stress, cœur).

**Tes données ne sont jamais stockées** : pas de localStorage, pas de base locale, aucun envoi réseau. Elles sont traitées en mémoire dans ton navigateur ; recharger la page efface tout. Seul le **code** de l'app est mis en cache, pour qu'elle fonctionne hors connexion.

## Utilisation

1. Ouvre `index.html` dans ton navigateur (double-clic suffit). Aucune connexion internet n'est nécessaire en local : toutes les librairies sont incluses dans le projet.
2. Dépose tes fichiers dans la zone d'import : pesées, mensurations et/ou le dossier d'export Samsung Health, séparément ou **tout d'un coup** (glisser-déposer de fichiers ou d'un dossier, ou bouton « Choisir un dossier »). Le type de chaque fichier est reconnu par son contenu.

### Export Samsung Health

Dans l'app Samsung Health : *Paramètres › Télécharger les données personnelles*, puis décompresse l'archive et dépose le dossier.

- **Liste blanche** : seuls ≈ 25 tableaux utiles sont lus (`js/parsers/samsung/samsungSources.js`). Les autres fichiers (contacts du classement social, badges, préférences…) ne sont **jamais ouverts**, et les sous-dossiers `jsons/` et `files/` (détails binaires) sont ignorés.
- Les horaires de l'export sont en UTC : ils sont convertis à l'heure locale de la mesure (colonne `time_offset`).
- Le dernier jour de l'export (en cours au moment de l'export) est exclu des moyennes journalières.
- Sans fichier de pesées, les pesées présentes dans l'export (balance connectée, montre) sont utilisées, à partir de la reprise du suivi actuel (après la dernière pause de plus de 45 jours).

### Sur Android

- **Importer un dossier** fonctionne aussi sur téléphone (Chrome) : choisis le dossier de l'export.
- **Partager** (app installée) : dans Mes fichiers, sélectionne les fichiers puis *Partager › Suivi Physique*. Le service worker reçoit les fichiers (`share_target` du manifeste), les garde **en mémoire** le temps que la page les récupère, puis les oublie ; rien n'est écrit dans le cache ni sur le disque.

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

Deux vues, comme deux pages : **Essentiel** (par défaut, les cartes clés) et **Toutes les analyses** (adresse `#analyses`, le bouton retour ramène à l'Essentiel). Une seule page HTML : les données n'étant jamais enregistrées, changer de fichier obligerait à les réimporter. Pour qu'une carte apparaisse dans l'Essentiel, lui ajouter l'attribut `data-essential`.

- **Lecture du jour** : la dernière pesée comparée à la tendance des 21 jours précédents et à la fluctuation normale, avec une interprétation et la fourchette normale pour le lendemain.
- **Résumé** : indicateurs clés, jauge de progression vers l'objectif, analyse rédigée (rythme en kg et en % du poids, composition de la perte et alerte de perte musculaire sur 4 semaines, détection de stagnation, déficit estimé, projection et fourchette de dates, prochain jalon, assiduité), jalons (records, paliers de 5 kg, catégories d'IMC franchies et prévues) et bilan mensuel.
- **Poids** : courbe avec tendance lissée sans retard (régression locale) et sa bande de fluctuation normale, projection non linéaire partant de la tendance avec la zone probable des pesées, paliers de 5 kg, objectif, record, week-ends et scénario « si tu manges X kcal/j » (réglage *Apport prévu*). Variation du jour expliquée (régression ridge validée par validation croisée, affichée seulement si elle prédit mieux que le hasard). Projection (bilan énergétique : la perte ralentit à mesure que la dépense baisse, ≈ 22 kcal/j par kg perdu d'après Hall et al., Lancet 2011), déficit calorique estimé, vitesse de perte observée vs attendue, rythme en % du poids par semaine (zone conseillée 0,5-1 %), IMC, variations quotidiennes et hebdomadaires, distribution des variations, effet du jour de la semaine, heure de pesée, calendrier.
- **Composition** : origine de la variation de poids (graisse / muscle / eau), répartition, trajectoire gras / maigre, carte FMI × FFMI (Kelly 2009), part de gras dans la perte, masse grasse, muscle, masse maigre, FFMI, graisse viscérale, eau, protéines, os, métabolisme.
- **Mensurations** : détection des mesures douteuses (tendance robuste de Theil-Sen, valeurs exclues des graphiques au choix), évolution de chaque zone, matrice des variations zones × dates, profil radar, variations, cm perdus par kg perdu, asymétries gauche/droite, ratios (taille/hauteur, taille/hanches, forme en V), BRI et ABSI, estimation US Navy du % de graisse.
- **Silhouette** : reconstruction de face et de profil (courbes du dos, fessiers, bras) à partir des tours (squelette commun à toutes les dates : seule l'épaisseur des tissus varie), superposition de toutes les dates, comparaison annotée, avant / après à curseur, carte de chaleur des variations, animation dans le temps et export PNG.
- **Nutrition** *(export santé)* : apport par jour (jours de saisie probablement incomplète repérés), macronutriments et part de l'énergie vs plages de référence, protéines en g/kg (repère 1,6-2,2 g/kg en perte de poids), calories par repas et par jour de semaine, fibres, sucres, sodium, aliments les plus caloriques.
- **Bilan énergétique** : apport vs dépense estimée par la montre (repos, activité, digestion), bilan du jour, perte prédite par la saisie vs perte réelle, dépense « réelle » déduite de la pente du poids vs dépense de la montre. Calculé sur la période de saisie régulière en cours.
- **Activité** : pas (objectif 10 000), minutes actives, séances par semaine et par type, VO2max, étages, pas par jour de semaine, dernières séances.
- **Sommeil & récupération** : durée et phases par nuit, horaires de coucher / lever et régularité, hypnogramme des 7 dernières nuits, score, efficacité, récupération, FC et VFC pendant le sommeil, score de vitalité.
- **Stress & cœur** : stress quotidien, carte heure × jour de semaine, FC de repos estimée, SpO2, respiration, température cutanée, indice AGE, pression artérielle moyenne, mesures ponctuelles.
- **Analyses avancées** *(export santé)* :
  - cycles de poids depuis le début de l'historique (phases de perte / reprise détectées par zigzag ≥ 4 kg), phase actuelle comparée aux régimes précédents et délai de reprise ;
  - budget calorique pour atteindre l'objectif à la *Date cible* (même modèle que la projection), fourchette conseillée 0,5-1 %/semaine, plancher de sécurité ;
  - adaptation métabolique (dépense réelle vs baisse attendue de 22 kcal/j par kg perdu), semaine type et coût du week-end ;
  - protéines repas par repas (repère 25 g), densité protéique des aliments (g pour 100 kcal), repas les plus protéinés ;
  - mouvement spontané (pas hors séances vs apport), efficacité cardio à la marche, score de récupération, nuits atypiques ;
  - rythmes de vie (fenêtre alimentaire, repas tardif → sommeil, nuit courte → journée, stress → alimentation, décalage du week-end) ;
  - records personnels et même mois d'une année à l'autre.
- **Corrélations** : matrice de Pearson entre métriques du jour et variation de poids du lendemain (au moins 10 jours en commun), nuages de points des liens les plus marqués.
- **Historique long terme** : moyennes mensuelles sur tout l'export (poids, pas, FC de repos, stress, sommeil, apport).
- **Données** : tableaux bruts, dont un tableau « mode de vie » jour par jour.

**Rapport imprimable / PDF** : bouton « Rapport PDF » (ou Ctrl+P), puis « Enregistrer en PDF ». Le rapport est le tableau de bord lui-même mis en page pour l'A4 (page de garde, sommaire, thème clair, graphiques redessinés en haute résolution) : toute nouvelle section y figure automatiquement. Pour masquer un contrôle à l'impression, lui ajouter la classe `no-print` (voir `css/print.css`).

Un filtre de période (tout / 90 / 30 / 14 / 7 jours) et un thème clair/sombre sont disponibles.

## Structure

```
index.html
css/   variables (tokens, thèmes) · base · layout · components · charts
js/
  core/        namespace + bus d'événements, utilitaires, état en mémoire
  parsers/     lecture CSV, détection du type de fichier
    samsung/   export Samsung Health : lecture générique, liste blanche des tables, chargement
  analysis/    métriques dérivées, tendances, analyse rédigée
    lifestyle/ table journalière, bilan énergétique, nutrition, activité, sommeil, corrélations, historique
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
