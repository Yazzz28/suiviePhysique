/**
 * Service worker — mise en cache du CODE de l'application uniquement.
 *
 * - Les données de l'utilisateur (CSV) ne passent jamais par ici : elles sont
 *   lues via FileReader, en mémoire, et ne sont ni requêtées ni stockées.
 * - Seuls les fichiers de l'app (même origine, requêtes GET) sont mis en cache.
 *
 * Mises à jour : incrémenter CACHE_VERSION à chaque déploiement qui modifie
 * un fichier de l'app. Le navigateur détecte alors un nouveau service worker,
 * l'installe en attente, et la page propose « Recharger ». À l'activation,
 * les anciens caches sont supprimés.
 */
const CACHE_VERSION = 'v14';
const CACHE_PREFIX = 'suivi-physique-';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

/** Fichiers pré-chargés à l'installation (chemins relatifs à ce fichier). */
const APP_FILES = [
  './',
  'index.html',
  'manifest.json',
  'css/variables.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/charts.css',
  'css/print.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/vendor/chart.umd.js',
  'js/vendor/hammer.min.js',
  'js/vendor/chartjs-plugin-zoom.min.js',
  'js/core/namespace.js',
  'js/core/utils.js',
  'js/core/state.js',
  'js/parsers/csvUtils.js',
  'js/parsers/compositionParser.js',
  'js/parsers/measurementsParser.js',
  'js/parsers/fileDetector.js',
  'js/analysis/metrics.js',
  'js/analysis/trends.js',
  'js/analysis/projection.js',
  'js/analysis/quality.js',
  'js/analysis/milestones.js',
  'js/analysis/dailyReading.js',
  'js/analysis/insights.js',
  'js/charts/chartTheme.js',
  'js/charts/weightCharts.js',
  'js/charts/compositionCharts.js',
  'js/charts/measurementCharts.js',
  'js/charts/measurementIndexCharts.js',
  'js/charts/dynamicsCharts.js',
  'js/charts/compositionMapCharts.js',
  'js/charts/calendarHeatmap.js',
  'js/silhouette/bodyModel.js',
  'js/silhouette/profileModel.js',
  'js/silhouette/silhouetteRenderer.js',
  'js/silhouette/exportPng.js',
  'js/silhouette/silhouetteView.js',
  'js/ui/tooltip.js',
  'js/ui/dropzone.js',
  'js/ui/templates.js',
  'js/ui/kpiCards.js',
  'js/ui/tables.js',
  'js/ui/summaryPanels.js',
  'js/ui/dailyReadingCard.js',
  'js/ui/printReport.js',
  'js/ui/dateFilter.js',
  'js/parsers/samsung/samsungCsv.js',
  'js/parsers/samsung/samsungSources.js',
  'js/parsers/samsung/samsungLoader.js',
  'js/analysis/lifestyle/dailyLifestyle.js',
  'js/analysis/lifestyle/energyBalance.js',
  'js/analysis/lifestyle/nutritionStats.js',
  'js/analysis/lifestyle/activityStats.js',
  'js/analysis/lifestyle/sleepStressStats.js',
  'js/analysis/lifestyle/correlations.js',
  'js/analysis/lifestyle/longTerm.js',
  'js/analysis/lifestyle/lifestyle.js',
  'js/charts/lifestyleKit.js',
  'js/charts/nutritionCharts.js',
  'js/charts/energyCharts.js',
  'js/charts/activityCharts.js',
  'js/charts/sleepCharts.js',
  'js/charts/heartCharts.js',
  'js/charts/correlationCharts.js',
  'js/charts/longTermCharts.js',
  'js/ui/lifestylePanels.js',
  'js/app.js',
  'js/pwa.js',
];

const INDEX_URL = new URL('index.html', self.location).href;

self.addEventListener('install', (event) => {
  // `cache: 'reload'` contourne le cache HTTP pour pré-charger les versions à jour.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
  );
  // Pas de skipWaiting ici : une nouvelle version attend l'accord de l'utilisateur.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Le Cache API est partagé par toute l'origine (yazzz28.github.io) :
      // ne supprimer QUE les anciennes versions de cette app, jamais les caches des autres projets.
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** La page demande d'activer la version en attente (bouton « Recharger »). */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigation : toujours la page de l'app en cache (fonctionne hors ligne).
  if (request.mode === 'navigate') {
    event.respondWith(caches.match(INDEX_URL).then((cached) => cached || fetch(request)));
    return;
  }

  // Fichiers de l'app : cache d'abord, réseau en secours (et mise en cache).
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
