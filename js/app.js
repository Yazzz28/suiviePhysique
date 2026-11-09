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

  /**
   * Un seul point d'entrée pour tout ce qui est déposé : dossier d'export
   * Samsung Health, fichiers de pesées / mensurations, ou un mélange.
   * Les nouveaux fichiers s'ajoutent à ceux déjà chargés.
   */
  async function handleFiles(files) {
    const status = $('file-status');
    status.innerHTML = '<p class="muted">Lecture des fichiers…</p>';
    const exp = await SP.parsers.samsung.loader.load(files, (done, total, label) =>
      SP.ui.dropzone.renderProgress(status, done, total, label)
    );
    const body = exp.others.length
      ? await SP.parsers.fileDetector.loadFiles(exp.others)
      : { composition: [], measurements: [], files: [] };
    SP.ui.dropzone.renderStatus(status, body.files, exp.tables.length ? exp : null);

    const cur = state.get();
    const { mergeByDate } = SP.parsers.fileDetector;
    const composition = mergeByDate(cur.composition, body.composition);
    const measurements = mergeByDate(cur.measurements, body.measurements);
    const hasExport = exp.tables.some((t) => t.count > 0);
    const lifestyle = hasExport ? SP.parsers.samsung.loader.merge(cur.lifestyle || {}, exp.data) : cur.lifestyle;
    if (!composition.length && !measurements.length && !lifestyle) return;

    const height =
      metrics.deriveHeightCm(composition) || (lifestyle && SP.analysis.lifestyle.latestHeight(lifestyle)) || cur.settings.heightCm;
    state.setData({
      composition,
      measurements,
      lifestyle,
      fallbackComposition: lifestyle ? SP.analysis.lifestyle.fallbackComposition(lifestyle.weights, height) : [],
      files: [...cur.files, ...body.files, ...exp.tables.map((t) => ({ name: t.name, type: 'export', count: t.count, error: t.error }))],
    });
    if (height) state.setSetting('heightCm', height, { silent: true });
    syncSettingsInputs();
    showDashboard(true);
    renderAll();
  }

  function showDashboard(visible) {
    $('welcome').classList.toggle('hidden', visible);
    $('dashboard').classList.toggle('hidden', !visible);
    $('btn-reload').classList.toggle('hidden', !visible);
    $('btn-report').classList.toggle('hidden', !visible);
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
    // Toutes les pesées (jalons, poids associé aux mensurations), indépendamment de la période
    const allDaily = metrics.dailyAverages(metrics.enrichComposition(v.allComposition, heightCm));
    const weightAt = metrics.weightLookup(allDaily);
    // Qualité des mensurations : analysée sur tous les relevés (tendance plus robuste)
    const quality = SP.analysis.quality.analyze(v.allMeasurements);
    const usable = v.settings.excludeOutliers ? SP.analysis.quality.clean(v.measurements, quality) : v.measurements;
    const weightTrend = SP.analysis.trends.smooth(daily, 'weight');
    const projection = SP.analysis.projection.build({ daily, composition, w0: weightTrend ? weightTrend.last : null });
    let lifestyle = null;
    if (v.lifestyle && v.lifestyleRange) {
      try {
        lifestyle = SP.analysis.lifestyle.build({
          data: v.lifestyle,
          range: v.lifestyleRange,
          allDaily,
          rho: projection ? projection.rho : null,
          includeIncomplete: v.settings.includeIncompleteMeals,
          settings: v.settings,
          weightNow: weightTrend ? weightTrend.last : null,
          daily,
        });
      } catch (err) {
        console.error('[SuiviPhysique] Analyse de l\'export santé impossible', err);
      }
    }
    return {
      lifestyle,
      weightTrend,
      compositionSource: v.compositionSource,
      composition,
      daily,
      allDaily,
      startWeight: firstWeight ? firstWeight.weight : null,
      projection,
      records: SP.analysis.milestones.records(allDaily, { heightCm, projection }),
      quality,
      measurements: metrics.enrichMeasurements(usable, heightCm, sex, weightAt),
      rawMeasurements: metrics.enrichMeasurements(v.measurements, heightCm, sex, weightAt),
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
    resetChartCards();
    const ctx = buildContext();
    const hasComp = ctx.composition.length > 0;
    const hasFull = ctx.composition.some((r) => r.hasComposition);
    const hasMeas = ctx.measurements.length > 0;

    toggleSection('weight', hasComp);
    toggleSection('composition', hasFull);
    toggleSection('measurements', hasMeas);
    toggleSection('silhouette', hasMeas);
    const ls = ctx.lifestyle;
    toggleSection('nutrition', !!ls && ls.has.nutrition);
    toggleSection('energy', !!ls && ls.has.energy);
    toggleSection('activity', !!ls && ls.has.activity);
    toggleSection('sleep', !!ls && ls.has.sleep);
    toggleSection('heart', !!ls && ls.has.heart);
    toggleSection('correlations', !!ls && !!ls.correlations);
    toggleSection('history', !!ls && ((!!ls.history && ls.history.metrics.length > 0) || !!ls.phases));
    toggleSection('rhythms', !!ls && !!ls.rhythms && (ls.rhythms.windows.length > 0 || !!ls.rhythms.jetlag));

    renderSubtitle(ctx);
    safe('lecture du jour', () => {
      const reading = SP.analysis.dailyReading.read(ctx.allDaily);
      const context = reading ? SP.ui.lifestylePanels.readingContext(ls, reading.date) : null;
      SP.ui.dailyReadingCard.render($('daily-reading'), reading, context);
    });
    safe('kpi', () => SP.ui.kpiCards.render($('kpis'), ctx));
    safe('kpi mode de vie', () => SP.ui.lifestylePanels.renderKpis($('lifestyle-kpis'), ls));
    safe('insights', () => renderInsights(ctx));
    safe('jalons', () => SP.ui.summaryPanels.renderMilestones($('milestones'), ctx.records));
    safe('bilan mensuel', () => SP.ui.summaryPanels.renderMonthly($('monthly'), SP.analysis.milestones.monthly(ctx.daily, ctx.measurements)));
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
      safe('qualité', () => SP.ui.summaryPanels.renderQuality($('quality'), ctx.quality, ctx.settings.excludeOutliers));
      safe('mensurations', () => SP.charts.measurements.render(ctx));
      safe('indices de mensurations', () => SP.charts.measurementIndices.render(ctx));
      safe('silhouette', () => SP.silhouette.view.render(ctx));
    }
    if (ls) {
      if (ls.has.nutrition) safe('nutrition', () => SP.charts.nutrition.render(ctx));
      if (ls.has.energy) safe('bilan énergétique', () => SP.charts.energy.render(ctx));
      if (ls.has.activity) safe('activité', () => SP.charts.activity.render(ctx));
      if (ls.has.sleep) safe('sommeil', () => SP.charts.sleep.render(ctx));
      if (ls.has.heart) safe('stress et cœur', () => SP.charts.heart.render(ctx));
      if (ls.correlations) safe('corrélations', () => SP.charts.correlations.render(ctx));
      if (ls.history) safe('historique', () => SP.charts.longTerm.render(ctx));
      safe('analyses avancées', () => SP.charts.insights.render(ctx));
    }
    safe("cartes d'analyse", () => SP.ui.analysisCards.render(ctx));
    safe('tableaux', () => {
      toggleCard('table-measurements', ctx.rawMeasurements.length > 0);
      toggleCard('table-composition', ctx.composition.length > 0);
      SP.ui.tables.renderMeasurements($('table-measurements'), ctx.rawMeasurements, ctx.quality);
      SP.ui.tables.renderComposition($('table-composition'), ctx.composition);
      SP.ui.lifestylePanels.renderTable($('table-lifestyle'), ls);
    });
    hideEmptyChartCards();
    SP.ui.viewSwitch.apply();
  }

  /** Cartes de graphiques : réaffichées avant chaque rendu… */
  function resetChartCards() {
    document.querySelectorAll('#dashboard .card').forEach((card) => {
      if (card.querySelector('canvas')) card.classList.remove('hidden');
    });
  }

  /** …puis masquées si aucun de leurs graphiques n'a de données (métrique absente des fichiers). */
  function hideEmptyChartCards() {
    if (!window.Chart) return;
    document.querySelectorAll('#dashboard .section:not(.hidden) .card').forEach((card) => {
      const canvases = [...card.querySelectorAll('canvas')];
      if (canvases.length && !canvases.some((c) => window.Chart.getChart(c))) card.classList.add('hidden');
    });
  }

  function toggleCard(id, visible) {
    const card = $(id) && $(id).closest('.card');
    if (card) card.classList.toggle('hidden', !visible);
  }

  function toggleSection(name, visible) {
    const section = $(`section-${name}`);
    const link = document.querySelector(`.app-nav__link[href="#section-${name}"]`);
    if (section) section.classList.toggle('hidden', !visible);
    if (link) link.classList.toggle('hidden', !visible);
  }

  function renderSubtitle({ composition, measurements, lifestyle, compositionSource }) {
    const dates = [...composition, ...measurements].map((r) => r.date.getTime());
    if (lifestyle) dates.push(lifestyle.range.from.getTime(), lifestyle.range.to.getTime());
    if (!dates.length) return;
    const from = new Date(Math.min(...dates));
    const to = new Date(Math.max(...dates));
    const parts = [`Du ${fmtDate(from, 'long')} au ${fmtDate(to, 'long')}`];
    if (composition.length) parts.push(`${composition.length} pesées${compositionSource === 'export' ? ' (export santé)' : ''}`);
    if (measurements.length) parts.push(`${measurements.length} relevés de mensurations`);
    if (lifestyle) parts.push(`${lifestyle.days.length} jours de données santé`);
    $('summary-subtitle').textContent = parts.join(' · ');
  }

  function renderInsights(ctx) {
    const list = insights.build(ctx);
    $('insights').innerHTML = list.length
      ? list
          .map(
            (it) =>
              `<li class="insight insight--${it.tone}"${it.essential ? ' data-essential' : ''}><span class="insight__icon" aria-hidden="true">${it.icon}</span><span>${it.html}</span></li>`
          )
          .join('')
      : '<li class="muted">Pas assez de données sur cette période.</li>';
  }

  /* ---------------- Réglages (en mémoire) ---------------- */

  function syncSettingsInputs() {
    const s = state.get().settings;
    $('input-height').value = isFiniteNumber(s.heightCm) ? s.heightCm : '';
    $('input-target').value = isFiniteNumber(s.targetWeight) ? s.targetWeight : '';
    $('input-target-date').value = s.targetDate ? SP.core.utils.dayKey(s.targetDate) : '';
    $('input-planned-intake').value = isFiniteNumber(s.plannedIntake) ? s.plannedIntake : '';
    $('input-sex').value = s.sex;
    $('input-exclude-outliers').checked = s.excludeOutliers;
    document.querySelectorAll('[data-setting="includeIncompleteMeals"]').forEach((el) => {
      el.checked = s.includeIncompleteMeals;
    });
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
    $('input-target-date').addEventListener('change', (e) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.target.value);
      state.setSetting('targetDate', m ? new Date(+m[1], +m[2] - 1, +m[3]) : null);
    });
    $('input-planned-intake').addEventListener('change', (e) => {
      const v = num(e.target);
      state.setSetting('plannedIntake', v && v >= 500 && v <= 8000 ? v : null);
    });
    $('input-sex').addEventListener('change', (e) => state.setSetting('sex', e.target.value));
    $('input-exclude-outliers').addEventListener('change', (e) => state.setSetting('excludeOutliers', e.target.checked));
    // Même réglage affiché en Nutrition et en Bilan énergétique : les interrupteurs restent synchronisés
    document.querySelectorAll('[data-setting="includeIncompleteMeals"]').forEach((el) =>
      el.addEventListener('change', (e) => {
        state.setSetting('includeIncompleteMeals', e.target.checked);
        syncSettingsInputs();
      })
    );
  }

  /* ---------------- Thème clair / sombre (non persisté) ---------------- */

  function bindThemeToggle() {
    $('btn-theme').addEventListener('click', () => {
      const root = document.documentElement;
      const isDark =
        root.dataset.theme === 'dark' ||
        (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = isDark ? 'light' : 'dark';
      if (state.hasData()) renderAll();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!document.documentElement.dataset.theme && state.hasData()) renderAll();
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

    SP.ui.dropzone.bind({
      zone: $('dropzone'),
      input: $('file-input'),
      filesButton: $('btn-files'),
      folderInput: $('folder-input'),
      folderButton: $('btn-folder'),
      onFiles: handleFiles,
    });
    SP.ui.templates.bind($('welcome'));
    SP.ui.dateFilter.bind($('period-filter'));
    SP.ui.viewSwitch.bind();
    // Fichiers reçus par Partager › Suivi Physique (Android, app installée)
    SP.ui.shareReceiver.init(handleFiles, (message) => SP.ui.dropzone.renderError($('file-status'), message));
    $('btn-reload').addEventListener('click', reset);
    SP.ui.printReport.bind($('btn-report'));
    bindSettings();
    bindThemeToggle();
    bindNavHighlight();

    SP.bus.on('state:period', renderAll);
    SP.bus.on('state:settings', () => {
      if (state.hasData()) renderAll();
    });
  }

  // API minimale pour les modules qui doivent redessiner la page (rapport imprimable)
  SP.app = { renderAll };

  document.addEventListener('DOMContentLoaded', init);
})(window.SP);
