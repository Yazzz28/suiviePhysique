/**
 * Thème Chart.js partagé : couleurs lues depuis les variables CSS,
 * axes temporels sans adaptateur, crosshair, registre des instances.
 */
(function (SP) {
  'use strict';

  const { fmtDate, fmt, DAY_MS } = SP.core.utils;
  const registry = new Map();

  /** Lit les tokens CSS courants (light/dark). */
  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();
    const series = Array.from({ length: 8 }, (_, i) => v(`--series-${i + 1}`));
    return {
      surface: v('--surface-1'),
      page: v('--page'),
      text: v('--text-primary'),
      textSecondary: v('--text-secondary'),
      muted: v('--text-muted'),
      grid: v('--grid'),
      axis: v('--axis'),
      series,
      seq: [v('--seq-100'), v('--seq-250'), v('--seq-400'), v('--seq-550'), v('--seq-700')],
      down: v('--div-down'),
      downSoft: v('--div-down-soft'),
      mid: v('--div-mid'),
      upSoft: v('--div-up-soft'),
      up: v('--div-up'),
      good: v('--good'),
      warning: v('--warning'),
      serious: v('--serious'),
      critical: v('--critical'),
    };
  }

  /** Couleur fixe par entité (ne dépend jamais du rang). */
  const ENTITY_SLOT = {
    weight: 0,
    fatKg: 1,
    fatPct: 1,
    muscleKg: 2,
    musclePct: 2,
    waterKg: 3,
    waterPct: 3,
    proteinKg: 4,
    proteinPct: 4,
    boneKg: 5,
    bonePct: 5,
    leanKg: 6,
    skeletalKg: 7,
    skeletalPct: 7,
  };

  function colorFor(entity, t = tokens()) {
    return t.series[ENTITY_SLOT[entity] ?? 0];
  }

  /** Plugin : ligne verticale qui suit le survol. */
  const crosshair = {
    id: 'spCrosshair',
    afterDatasetsDraw(chart) {
      const active = chart.tooltip && chart.tooltip.getActiveElements();
      if (!active || !active.length || chart.config.type === 'bar') return;
      const x = active[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = tokens().axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  /**
   * Plugin : bandes horizontales de zones (IMC, viscérale...).
   * options.plugins.spBands = [{ from, to, color, label }]
   */
  const bands = {
    id: 'spBands',
    beforeDatasetsDraw(chart, _args, opts) {
      const list = opts && opts.bands;
      if (!list || !list.length) return;
      const y = chart.scales.y;
      const { left, right, top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      const t = tokens();
      ctx.save();
      list.forEach((b) => {
        const y1 = Math.max(top, y.getPixelForValue(b.to));
        const y2 = Math.min(bottom, y.getPixelForValue(b.from));
        if (y2 <= top || y1 >= bottom || y2 - y1 <= 0) return;
        ctx.fillStyle = b.color;
        ctx.fillRect(left, y1, right - left, y2 - y1);
        if (b.label) {
          ctx.fillStyle = t.muted;
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText(b.label, right - 6, y1 + 4);
        }
      });
      ctx.restore();
    },
  };

  let registered = false;
  let printMode = false;
  let screenPixelRatio = null;

  /**
   * Mode impression : pas d'animation (tout est dessiné immédiatement, avant
   * l'impression) et résolution doublée pour des graphiques nets en PDF.
   */
  function setPrintMode(on) {
    printMode = on;
  }

  function applyDefaults() {
    if (!window.Chart) return;
    const t = tokens();
    const C = window.Chart;
    if (!registered) {
      C.register(crosshair, bands);
      registered = true;
    }
    C.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    C.defaults.font.size = 11;
    C.defaults.color = t.muted;
    C.defaults.borderColor = t.grid;
    C.defaults.maintainAspectRatio = false;
    C.defaults.animation.duration = printMode ? 0 : 350;
    if (screenPixelRatio === null) screenPixelRatio = C.defaults.devicePixelRatio;
    C.defaults.devicePixelRatio = printMode ? 2 : screenPixelRatio;
    C.defaults.elements.line.borderWidth = 2;
    C.defaults.elements.line.tension = 0.25;
    C.defaults.elements.line.cubicInterpolationMode = 'monotone'; // jamais de dépassement entre deux points
    C.defaults.elements.point.radius = 0;
    C.defaults.elements.point.hoverRadius = 5;
    C.defaults.elements.point.hitRadius = 10;
    C.defaults.elements.bar.borderRadius = 4;
    C.defaults.plugins.legend.display = false;
    Object.assign(C.defaults.plugins.tooltip, {
      backgroundColor: t.text,
      titleColor: t.page,
      bodyColor: t.page,
      footerColor: t.page,
      padding: 10,
      cornerRadius: 6,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
      boxPadding: 4,
      usePointStyle: true,
    });
  }

  /** Échelle X temporelle (linéaire en ms, libellés FR, pas adaptatif). */
  function timeScale(minMs, maxMs, extra = {}) {
    const span = (maxMs - minMs) / DAY_MS;
    const step = span <= 10 ? 1 : span <= 31 ? 3 : span <= 70 ? 7 : span <= 200 ? 14 : 30;
    return {
      type: 'linear',
      min: minMs,
      max: maxMs,
      grid: { display: false },
      border: { color: tokens().axis },
      ticks: {
        stepSize: step * DAY_MS,
        maxRotation: 0,
        autoSkipPadding: 12,
        callback: (v) => fmtDate(new Date(v)),
      },
      ...extra,
    };
  }

  function valueScale(extra = {}) {
    return {
      grid: { color: tokens().grid, drawTicks: false },
      border: { display: false },
      ticks: { padding: 8, maxTicksLimit: 6 },
      ...extra,
    };
  }

  /** Nombre de décimales adapté au pas entre deux graduations. */
  function tickDecimals(ticks) {
    if (!ticks || ticks.length < 2) return 1;
    const step = Math.abs(ticks[1].value - ticks[0].value);
    if (!step) return 1;
    return Math.max(0, Math.min(3, Math.ceil(-Math.log10(step) - 1e-9)));
  }

  /** Tooltip titre = date longue pour les axes temporels. */
  function timeTooltip(unit = '', decimals = 1) {
    return {
      mode: 'index',
      intersect: false,
      callbacks: {
        title: (items) => (items.length ? fmtDate(new Date(items[0].parsed.x), 'weekday') : ''),
        label: (ctx) => {
          if (ctx.parsed.y === null || ctx.parsed.y === undefined) return null;
          return ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y, decimals)}${unit ? ' ' + unit : ''}`;
        },
      },
    };
  }

  /** Crée (ou recrée) un graphique attaché à un canvas. */
  function create(canvasId, config) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;
    const chart = new window.Chart(canvas, config);
    registry.set(canvasId, chart);
    return chart;
  }

  function destroy(canvasId) {
    if (registry.has(canvasId)) {
      registry.get(canvasId).destroy();
      registry.delete(canvasId);
    }
  }

  function destroyAll() {
    [...registry.keys()].forEach(destroy);
  }

  /** Construit une légende HTML (identité jamais portée par la couleur seule). */
  function legendHtml(items) {
    return items
      .map(
        (it) =>
          `<span class="chart-legend__item"><span class="chart-legend__swatch ${
            it.box ? 'chart-legend__swatch--box' : ''
          } ${it.dashed ? 'chart-legend__swatch--dash' : ''}" style="background:${it.color};border-color:${
            it.color
          }"></span>${it.label}</span>`
      )
      .join('');
  }

  function setLegend(elementId, items) {
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = legendHtml(items);
  }

  SP.charts.theme = {
    setPrintMode,
    tokens,
    colorFor,
    applyDefaults,
    timeScale,
    valueScale,
    timeTooltip,
    tickDecimals,
    create,
    destroy,
    destroyAll,
    setLegend,
  };
})(window.SP);
