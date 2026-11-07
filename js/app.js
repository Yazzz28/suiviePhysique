/**
 * Orchestration : fichiers -> parsing -> état mémoire -> analyses -> rendu.
 */
(function (SP) {
  'use strict';

  const state = SP.core.state;
  const { metrics, insights } = SP.analysis;
  const { fmtDate, isFiniteNumber } = SP.core.utils;
  const $ = (id) => document.getElementById(id);

  /* ---------------- Chargement ---------------- */

  async function handleFiles(files) {
    const status = $('file-status');
    status.innerHTML = '<p class="muted">Lecture des fichiers…</p>';
    const result = await SP.parsers.fileDetector.loadFiles(files);
    SP.ui.dropzone.renderStatus(status, result.files);

    if (!result.composition.length && !result.measurements.length) return;

    state.setData(result);
    const height = metrics.deriveHeightCm(result.composition);
    if (height) state.setSetting('heightCm', height, { silent: true });
    syncSettingsInputs();
    showDashboard(true);
    renderAll();
  }

  function showDashboard(visible) {
    $('welcome').classList.toggle('hidden', visible);
    $('dashboard').classList.toggle('hidden', !visible);
    $('btn-reload').classList.toggle('hidden', !visible);
    window.scrollTo({ top: 0 });
  }

  function reset() {
    SP.silhouette.view.stop();
    SP.charts.theme.destroyAll();
    state.reset();
    $('file-status').innerHTML = '';
    showDashboard(false);
  }

  /* ---------------- Contexte de rendu ---------------- */

  function buildContext() {
    const v = state.view();
    const { heightCm, sex } = v.settings;
    const composition = metrics.enrichComposition(v.composition, heightCm);
    const daily = metrics.dailyAverages(composition);
    const firstWeight = v.allComposition.find((r) => isFiniteNumber(r.weight));
    // Poids associé à chaque relevé de mensurations (sur toutes les pesées, pas seulement la période)
    const weightAt = metrics.weightLookup(metrics.dailyAverages(v.allComposition));
    return {
      composition,
      daily,
      startWeight: firstWeight ? firstWeight.weight : null,
      projection: SP.analysis.projection.build({ daily, composition }),
      measurements: metrics.enrichMeasurements(v.measurements, heightCm, sex, weightAt),
      settings: v.settings,
      period: v.period,
    };
  }

  /** Isole chaque bloc : une erreur dans un graphique n'empêche pas les autres. */
  function safe(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[SuiviPhysique] Échec du rendu « ${name} »`, err);
    }
  }

  function renderAll() {
    SP.charts.theme.applyDefaults();
    SP.charts.theme.destroyAll();
    const ctx = buildContext();
    const hasComp = ctx.composition.length > 0;
    const hasFull = ctx.composition.some((r) => r.hasComposition);
    const hasMeas = ctx.measurements.length > 0;

    toggleSection('weight', hasComp);
    toggleSection('composition', hasFull);
    toggleSection('measurements', hasMeas);
    toggleSection('silhouette', hasMeas);
    toggleSection('sizes', hasMeas);

    renderSubtitle(ctx);
    safe('kpi', () => SP.ui.kpiCards.render($('kpis'), ctx));
    safe('insights', () => renderInsights(ctx));
    if (hasComp) {
      safe('poids', () => SP.charts.weight.render(ctx));
      safe('dynamique', () => SP.charts.dynamics.render(ctx));
      safe('calendrier', () => SP.charts.calendar.render(ctx));
    }
    if (hasFull) {
      safe('composition', () => SP.charts.composition.render(ctx));
      safe('cartes de composition', () => SP.charts.compositionMap.render(ctx));
    }
    if (hasMeas) {
      safe('mensurations', () => SP.charts.measurements.render(ctx));
      safe('indices de mensurations', () => SP.charts.measurementIndices.render(ctx));
      safe('silhouette', () => SP.silhouette.view.render(ctx));
      safe('tailles', () => SP.ui.sizeCards.render(ctx));
    }
    safe('tableaux', () => {
      SP.ui.tables.renderMeasurements($('table-measurements'), ctx.measurements);
      SP.ui.tables.renderComposition($('table-composition'), ctx.composition);
    });
  }

  function toggleSection(name, visible) {
    const section = $(`section-${name}`);
    const link = document.querySelector(`.app-nav__link[href="#section-${name}"]`);
    if (section) section.classList.toggle('hidden', !visible);
    if (link) link.classList.toggle('hidden', !visible);
  }

  function renderSubtitle({ composition, measurements }) {
    const dates = [...composition, ...measurements].map((r) => r.date.getTime());
    if (!dates.length) return;
    const from = new Date(Math.min(...dates));
    const to = new Date(Math.max(...dates));
    $('summary-subtitle').textContent =
      `Du ${fmtDate(from, 'long')} au ${fmtDate(to, 'long')} · ${composition.length} pesées · ${measurements.length} relevés de mensurations`;
  }

  function renderInsights(ctx) {
    const list = insights.build(ctx);
    $('insights').innerHTML = list.length
      ? list
          .map(
            (it) =>
              `<li class="insight insight--${it.tone}"><span class="insight__icon" aria-hidden="true">${it.icon}</span><span>${it.html}</span></li>`
          )
          .join('')
      : '<li class="muted">Pas assez de données sur cette période.</li>';
  }

  /* ---------------- Réglages (en mémoire) ---------------- */

  function syncSettingsInputs() {
    const s = state.get().settings;
    $('input-height').value = isFiniteNumber(s.heightCm) ? s.heightCm : '';
    $('input-target').value = isFiniteNumber(s.targetWeight) ? s.targetWeight : '';
    $('input-sex').value = s.sex;
    $('input-rise').value = s.rise;
  }

  function bindSettings() {
    const num = (el) => {
      const v = parseFloat(String(el.value).replace(',', '.'));
      return Number.isFinite(v) ? v : null;
    };
    $('input-height').addEventListener('change', (e) => {
      const v = num(e.target);
      if (v && v > 100 && v < 250) state.setSetting('heightCm', v);
      else syncSettingsInputs();
    });
    $('input-target').addEventListener('change', (e) => state.setSetting('targetWeight', num(e.target)));
    $('input-sex').addEventListener('change', (e) => state.setSetting('sex', e.target.value));
    $('input-rise').addEventListener('change', (e) => state.setSetting('rise', e.target.value));
  }

  /* ---------------- Thème clair / sombre (non persisté) ---------------- */

  function bindThemeToggle() {
    $('btn-theme').addEventListener('click', () => {
      const root = document.documentElement;
      const isDark =
        root.dataset.theme === 'dark' ||
        (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = isDark ? 'light' : 'dark';
      if (state.get().composition.length || state.get().measurements.length) renderAll();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!document.documentElement.dataset.theme && state.get().files.length) renderAll();
    });
  }

  /* ---------------- Navigation active ---------------- */

  function bindNavHighlight() {
    const links = [...document.querySelectorAll('.app-nav__link')];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === `#${entry.target.id}`));
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    document.querySelectorAll('.section').forEach((s) => observer.observe(s));
  }

  /* ---------------- Démarrage ---------------- */

  function init() {
    if (!window.Chart) {
      $('cdn-error').classList.remove('hidden');
    } else if (window.ChartZoom) {
      window.Chart.register(window.ChartZoom);
    }

    SP.ui.dropzone.bind({ zone: $('dropzone'), input: $('file-input'), onFiles: handleFiles });
    SP.ui.templates.bind($('welcome'));
    SP.ui.dateFilter.bind($('period-filter'));
    $('btn-reload').addEventListener('click', reset);
    bindSettings();
    bindThemeToggle();
    bindNavHighlight();

    SP.bus.on('state:period', renderAll);
    SP.bus.on('state:settings', () => {
      if (state.get().files.length) renderAll();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.SP);
