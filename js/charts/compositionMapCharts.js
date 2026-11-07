/**
 * Cartes de composition : trajectoire gras / maigre, carte FMI × FFMI,
 * part de gras dans la perte cumulée.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, mean, withAlpha, isFiniteNumber, weekStart } = SP.core.utils;
  const theme = SP.charts.theme;

  /**
   * Catégories de l'indice de masse grasse (FMI, kg/m²) — Kelly et al., 2009.
   */
  const FMI_BANDS = {
    male: [
      { from: 0, to: 3, label: 'Déficit' },
      { from: 3, to: 6, label: 'Normal' },
      { from: 6, to: 9, label: 'Excès' },
      { from: 9, to: 12, label: 'Obésité I' },
      { from: 12, to: 15, label: 'Obésité II' },
      { from: 15, to: 60, label: 'Obésité III' },
    ],
    female: [
      { from: 0, to: 5, label: 'Déficit' },
      { from: 5, to: 9, label: 'Normal' },
      { from: 9, to: 13, label: 'Excès' },
      { from: 13, to: 17, label: 'Obésité I' },
      { from: 17, to: 21, label: 'Obésité II' },
      { from: 21, to: 60, label: 'Obésité III' },
    ],
  };

  /** Moyennes hebdomadaires de plusieurs clés (réduit le bruit de l'impédancemètre). */
  function weeklyMeans(rows, keys) {
    const groups = new Map();
    rows.forEach((r) => {
      const k = weekStart(r.date).getTime();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, list]) => {
        const out = { date: new Date(k), count: list.length };
        keys.forEach((key) => (out[key] = mean(list.map((r) => r[key]))));
        return out;
      })
      .filter((w) => keys.every((key) => isFiniteNumber(w[key])));
  }

  /** Plugin : flèche au bout de chaque segment d'un tracé de points reliés. */
  const arrows = {
    id: 'spArrows',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      chart.data.datasets.forEach((ds, di) => {
        if (!ds.spArrows) return;
        const pts = chart.getDatasetMeta(di).data;
        ctx.save();
        ctx.fillStyle = ds.borderColor;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len < 14) continue;
          // Pointe placée juste avant le point d'arrivée
          const tipX = b.x - Math.cos(angle) * 6;
          const tipY = b.y - Math.sin(angle) * 6;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - Math.cos(angle - 0.45) * 8, tipY - Math.sin(angle - 0.45) * 8);
          ctx.lineTo(tipX - Math.cos(angle + 0.45) * 8, tipY - Math.sin(angle + 0.45) * 8);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      });
    },
  };

  /** Plugin : étiquettes directes sur le premier et le dernier point. */
  const endLabels = {
    id: 'spEndLabels',
    afterDatasetsDraw(chart) {
      const tokens = theme.tokens();
      const ctx = chart.ctx;
      chart.data.datasets.forEach((ds, di) => {
        if (!ds.spEndLabels) return;
        const pts = chart.getDatasetMeta(di).data;
        if (pts.length < 2) return;
        ctx.save();
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = tokens.textSecondary;
        [
          [pts[0], ds.spEndLabels[0]],
          [pts[pts.length - 1], ds.spEndLabels[1]],
        ].forEach(([p, text], i) => {
          const right = p.x < (chart.chartArea.left + chart.chartArea.right) / 2;
          ctx.textAlign = right ? 'left' : 'right';
          // Départ au-dessus du point, arrivée en dessous : jamais sur le tracé
          ctx.fillText(text, p.x + (right ? 9 : -9), i === 0 ? p.y - 9 : p.y + 17);
        });
        ctx.restore();
      });
    },
  };

  function pathDataset(points, color, labels) {
    return {
      label: 'Trajectoire',
      data: points,
      showLine: true,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      tension: 0,
      pointRadius: points.map((_, i) => (i === 0 || i === points.length - 1 ? 5 : 3)),
      pointHoverRadius: 7,
      spArrows: true,
      spEndLabels: labels,
    };
  }

  /** Trajectoire hebdomadaire : masse grasse (x) vs masse maigre (y). */
  function renderTrajectory({ daily }) {
    const t = theme.tokens();
    const weeks = weeklyMeans(daily.filter((r) => r.hasComposition), ['fatKg', 'leanKg', 'weight']);
    if (weeks.length < 2) return;
    const points = weeks.map((w) => ({ x: w.fatKg, y: w.leanKg, date: w.date, weight: w.weight }));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    // Bornes arrondies au demi-kg, avec une marge proportionnelle à l'étendue
    const pad = (arr) => Math.max(0.4, (Math.max(...arr) - Math.min(...arr)) * 0.25);
    const lo = (arr) => Math.floor((Math.min(...arr) - pad(arr)) * 2) / 2;
    const hi = (arr) => Math.ceil((Math.max(...arr) + pad(arr)) * 2) / 2;
    theme.create('c-traj', {
      type: 'scatter',
      data: { datasets: [pathDataset(points, t.series[0], [`Sem. ${fmtDate(points[0].date)}`, `Sem. ${fmtDate(points[points.length - 1].date)}`])] },
      options: {
        scales: {
          x: theme.valueScale({
            type: 'linear',
            min: lo(xs),
            max: hi(xs),
            title: { display: true, text: 'Masse grasse (kg) →', color: t.muted },
            ticks: { callback: (v, _i, ticks) => fmt(v, theme.tickDecimals(ticks)) },
          }),
          y: theme.valueScale({
            min: lo(ys),
            max: hi(ys),
            title: { display: true, text: 'Masse maigre (kg) →', color: t.muted },
            ticks: { callback: (v, _i, ticks) => fmt(v, theme.tickDecimals(ticks)) },
          }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => 'Semaine du ' + fmtDate(items[0].raw.date, 'long'),
              label: (ctx) => [
                ` Masse grasse : ${fmt(ctx.raw.x, 2)} kg`,
                ` Masse maigre : ${fmt(ctx.raw.y, 2)} kg`,
                ` Poids moyen : ${fmt(ctx.raw.weight, 2)} kg`,
              ],
            },
          },
        },
      },
      plugins: [arrows, endLabels],
    });
  }

  /** Carte FMI × FFMI avec catégories de FMI et lignes d'IMC constant. */
  function renderFmiMap({ daily, settings }) {
    const t = theme.tokens();
    const weeks = weeklyMeans(daily.filter((r) => r.hasComposition), ['fmi', 'ffmi']);
    if (weeks.length < 1) return;
    const points = weeks.map((w) => ({ x: w.ffmi, y: w.fmi, date: w.date }));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = Math.floor(Math.min(...xs) - 2);
    const xMax = Math.ceil(Math.max(...xs) + 2);
    const yMin = Math.max(0, Math.floor(Math.min(...ys) - 4));
    const yMax = Math.ceil(Math.max(...ys) + 2);
    const tint = [t.series[0], t.good, t.warning, t.serious, t.critical, t.critical];
    const alphas = [0.06, 0.1, 0.12, 0.1, 0.1, 0.16];
    const bands = (FMI_BANDS[settings.sex] || FMI_BANDS.male).map((b, i) => ({
      ...b,
      color: withAlpha(tint[i], alphas[i]),
    }));

    /** Lignes d'IMC constant : FMI + FFMI = IMC. */
    const bmiLines = {
      id: 'spBmiLines',
      beforeDatasetsDraw(chart) {
        const { x, y } = chart.scales;
        const ctx = chart.ctx;
        const { left, right, top, bottom } = chart.chartArea;
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, right - left, bottom - top);
        ctx.clip();
        ctx.strokeStyle = t.axis;
        ctx.fillStyle = t.muted;
        ctx.lineWidth = 1;
        ctx.font = '10px system-ui, sans-serif';
        [18.5, 25, 30, 35, 40, 45].forEach((bmi) => {
          const x1 = xMin;
          const x2 = xMax;
          ctx.beginPath();
          ctx.moveTo(x.getPixelForValue(x1), y.getPixelForValue(bmi - x1));
          ctx.lineTo(x.getPixelForValue(x2), y.getPixelForValue(bmi - x2));
          ctx.stroke();
          // Étiquette à l'entrée de la ligne dans le cadre
          const labelX = Math.max(x1, bmi - yMax) + 0.3;
          const px = x.getPixelForValue(labelX);
          const py = y.getPixelForValue(bmi - labelX);
          if (px > left && px < right - 40 && py > top + 10 && py < bottom) {
            ctx.fillText(`IMC ${fmt(bmi, bmi % 1 ? 1 : 0)}`, px + 3, py - 3);
          }
        });
        ctx.restore();
      },
    };

    theme.create('c-fmi-map', {
      type: 'scatter',
      data: { datasets: [pathDataset(points, t.series[0], [fmtDate(points[0].date), fmtDate(points[points.length - 1].date)])] },
      options: {
        scales: {
          x: theme.valueScale({
            type: 'linear',
            min: xMin,
            max: xMax,
            title: { display: true, text: 'FFMI — masse maigre / taille² (kg/m²)', color: t.muted },
          }),
          y: theme.valueScale({
            min: yMin,
            max: yMax,
            title: { display: true, text: 'FMI — masse grasse / taille² (kg/m²)', color: t.muted },
          }),
        },
        plugins: {
          spBands: { bands },
          tooltip: {
            callbacks: {
              title: (items) => 'Semaine du ' + fmtDate(items[0].raw.date, 'long'),
              label: (ctx) => [
                ` FMI : ${fmt(ctx.raw.y, 1)} kg/m²`,
                ` FFMI : ${fmt(ctx.raw.x, 1)} kg/m²`,
                ` IMC : ${fmt(ctx.raw.x + ctx.raw.y, 1)}`,
              ],
            },
          },
        },
      },
      plugins: [bmiLines, arrows, endLabels],
    });
  }

  /** Part de gras dans la perte cumulée depuis la première pesée complète. */
  function renderFatShare({ daily }) {
    const t = theme.tokens();
    const full = daily.filter((r) => r.hasComposition);
    if (full.length < 3) return;
    const base = full[0];
    const MIN_LOSS = 0.5; // en dessous, le ratio n'a pas de sens (bruit)
    const data = full
      .map((r) => {
        const dW = r.weight - base.weight;
        if (dW > -MIN_LOSS) return null;
        return { x: r.date.getTime(), y: ((r.fatKg - base.fatKg) / dW) * 100, dW, dFat: r.fatKg - base.fatKg };
      })
      .filter(Boolean);
    if (data.length < 2) return;
    theme.create('c-fat-share', {
      type: 'line',
      data: { datasets: [{ label: 'Part de gras', data, borderColor: t.series[1] }] },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(data[0].x, data[data.length - 1].x),
          y: theme.valueScale({ min: 0, max: 100, ticks: { stepSize: 25, callback: (v) => v + ' %' } }),
        },
        plugins: {
          spBands: {
            bands: [
              { from: 50, to: 100, color: withAlpha(t.good, 0.08), label: 'Surtout du gras' },
              { from: 0, to: 50, color: withAlpha(t.warning, 0.1), label: 'Surtout de la masse maigre' },
            ],
          },
          tooltip: {
            ...theme.timeTooltip(),
            callbacks: {
              ...theme.timeTooltip().callbacks,
              label: (ctx) => [
                ` Part de gras : ${fmt(ctx.parsed.y, 0)} %`,
                ` ${fmtDelta(ctx.raw.dFat, 1)} kg de gras sur ${fmtDelta(ctx.raw.dW, 1)} kg`,
              ],
            },
          },
        },
      },
    });
  }

  function render(ctx) {
    renderTrajectory(ctx);
    renderFmiMap(ctx);
    renderFatShare(ctx);
  }

  SP.charts.compositionMap = { render, FMI_BANDS };
})(window.SP);
