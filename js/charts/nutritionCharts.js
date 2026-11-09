/**
 * Section Nutrition : apport par jour, macronutriments, protéines par kg,
 * répartition par repas, jour de semaine, fibres / sucres / sodium, aliments.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, isFiniteNumber, withAlpha, escapeHtml, DAY_MS } = SP.core.utils;
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;

  /** Couleurs fixes des macronutriments (cohérentes avec la composition : protéines = magenta, graisse = orange). */
  function macroColors(t) {
    return { protein: t.series[4], carbs: t.series[3], fat: t.series[1] };
  }

  const MACRO_LABELS = { protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides' };
  // Plages de référence de la part d'énergie (apports adultes, AMDR)
  const MACRO_RANGES = { protein: [10, 35], carbs: [45, 65], fat: [20, 35] };

  function renderIntake({ lifestyle }) {
    const t = theme.tokens();
    const { days, energy } = lifestyle;
    const rows = energy.days.filter((d) => isFiniteNumber(d.kcalIn));
    kit.dailyBars('c-kcal-in', rows, {
      accessor: (d) => d.kcalIn,
      label: 'Apport saisi',
      unit: 'kcal',
      color: t.series[1],
      barColor: (d) => (d.logStatus === 'complete' ? withAlpha(t.series[1], 0.55) : withAlpha(t.axis, 0.6)),
      legendId: 'lg-kcal-in',
      legendExtra: [
        { label: 'Apport saisi', color: withAlpha(t.series[1], 0.55), box: true },
        { label: 'Saisie probablement incomplète', color: withAlpha(t.axis, 0.6), box: true },
      ],
      refs: isFiniteNumber(energy.meanTdee) ? [{ label: `Dépense moyenne (montre) ${fmt(energy.meanTdee, 0)} kcal`, value: energy.meanTdee, color: t.series[0] }] : [],
    });
    kit.toggleCard('c-kcal-in', rows.length > 0 && days.length > 0);
  }

  function renderMacros({ lifestyle }) {
    const t = theme.tokens();
    const colors = macroColors(t);
    const rows = lifestyle.energy.days.filter((d) => d.logStatus === 'complete' && isFiniteNumber(d.protein));
    kit.toggleCard('c-macros', rows.length > 0);
    if (!rows.length) return;
    const minX = rows[0].date.getTime() - DAY_MS / 2;
    const maxX = rows[rows.length - 1].date.getTime() + DAY_MS / 2;
    const datasets = ['protein', 'carbs', 'fat'].map((k) => ({
      label: MACRO_LABELS[k],
      data: rows.map((d) => ({ x: d.date.getTime(), y: (d[k] || 0) * SP.analysis.lifestyle.nutrition.KCAL_PER_G[k], g: d[k] })),
      backgroundColor: colors[k],
      borderRadius: 0,
      barPercentage: 0.9,
      categoryPercentage: 1,
    }));
    theme.setLegend('lg-macros', datasets.map((d) => ({ label: d.label, color: d.backgroundColor, box: true })));
    theme.create('c-macros', {
      type: 'bar',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: { ...theme.timeScale(minX, maxX), stacked: true },
          y: theme.valueScale({ stacked: true, beginAtZero: true, ticks: { maxTicksLimit: 6, callback: (v) => fmt(v, 0) + ' kcal' } }),
        },
        plugins: {
          tooltip: {
            ...kit.xTooltip('kcal', 0),
            callbacks: {
              title: (items) => (items.length ? fmtDate(new Date(items[0].parsed.x), 'weekday') : ''),
              label: (ctx) => ` ${ctx.dataset.label} : ${fmt(ctx.raw.g, 0)} g (${fmt(ctx.parsed.y, 0)} kcal)`,
            },
          },
        },
      },
    });
  }

  function renderMacroShare({ lifestyle }) {
    const t = theme.tokens();
    const n = lifestyle.nutrition;
    kit.toggleCard('c-macro-share', !!n);
    if (!n) return;
    const colors = macroColors(t);
    const keys = ['protein', 'carbs', 'fat'];
    theme.create('c-macro-share', {
      type: 'bar',
      data: {
        labels: keys.map((k) => `${MACRO_LABELS[k]} (${fmt(n.macros[k], 0)} g/j)`),
        datasets: [
          {
            label: "Part de l'énergie",
            data: keys.map((k) => n.energyShare[k]),
            backgroundColor: keys.map((k) => colors[k]),
            borderRadius: 4,
            maxBarThickness: 28,
          },
          {
            // Plage de référence : trait fin par-dessus la barre
            label: 'Plage de référence',
            data: keys.map((k) => MACRO_RANGES[k]),
            backgroundColor: withAlpha(t.text, 0.55),
            borderRadius: 3,
            barThickness: 6,
            grouped: false,
            order: 0,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: theme.valueScale({ min: 0, max: 70, ticks: { callback: (v) => v + ' %' } }),
          y: { grid: { display: false } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const k = keys[ctx.dataIndex];
                if (ctx.datasetIndex === 1) return ` Plage de référence : ${MACRO_RANGES[k][0]} à ${MACRO_RANGES[k][1]} %`;
                return ` ${fmt(n.energyShare[k], 0)} % de l'énergie (${fmt(n.macros[k], 0)} g/jour)`;
              },
            },
          },
        },
      },
    });
    theme.setLegend('lg-macro-share', [
      { label: 'Ta répartition', color: t.series[4], box: true },
      { label: 'Plage de référence adulte', color: withAlpha(t.text, 0.55), box: true },
    ]);
  }

  function renderProteinPerKg({ lifestyle }) {
    const t = theme.tokens();
    const n = lifestyle.nutrition;
    const pts = n ? n.proteinPerKg.map((p) => ({ x: p.date.getTime(), y: p.value })) : [];
    kit.toggleCard('c-protein-kg', pts.length > 0);
    if (!pts.length) return;
    kit.lines(
      'c-protein-kg',
      [
        { label: 'Protéines', data: pts, color: t.series[4], points: true, showLine: false },
        { label: 'Moyenne 7 j', data: kit.rolling7(pts), color: t.series[4] },
      ],
      {
        unit: 'g/kg',
        decimals: 2,
        y: { min: 0, suggestedMax: 2.4 },
        bands: [{ from: 1.6, to: 2.2, color: withAlpha(t.good, 0.12), label: 'Repère en perte de poids (1,6-2,2 g/kg)' }],
      }
    );
  }

  function renderMeals({ lifestyle }) {
    const t = theme.tokens();
    const n = lifestyle.nutrition;
    const meals = n ? n.meals : [];
    kit.toggleCard('c-meals', meals.length > 0);
    if (!meals.length) return;
    theme.create('c-meals', {
      type: 'bar',
      data: {
        labels: meals.map((m) => m.label),
        datasets: [{ label: 'kcal / jour', data: meals.map((m) => m.perDay), backgroundColor: t.series[1], borderRadius: 4, maxBarThickness: 26 }],
      },
      options: {
        indexAxis: 'y',
        scales: { x: theme.valueScale({ beginAtZero: true, ticks: { callback: (v) => fmt(v, 0) + ' kcal' } }), y: { grid: { display: false } } },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const m = meals[ctx.dataIndex];
                return ` ${fmt(m.perDay, 0)} kcal/jour en moyenne · saisi ${fmt(m.frequency * 100, 0)} % des jours`;
              },
            },
          },
        },
      },
    });
  }

  function renderWeekday({ lifestyle }) {
    const t = theme.tokens();
    const n = lifestyle.nutrition;
    kit.toggleCard('c-nutri-weekday', !!n);
    if (n) kit.weekdayBars('c-nutri-weekday', n.weekday.map((w) => ({ value: w.kcal, n: w.n })), { label: 'Apport', unit: 'kcal', color: t.series[1] });
  }

  function renderMicro({ lifestyle }) {
    const t = theme.tokens();
    const rows = lifestyle.energy.days.filter((d) => d.logStatus === 'complete');
    const specs = [
      { id: 'c-fiber', key: 'fiber', label: 'Fibres', unit: 'g', ref: { label: 'Repère 30 g', value: 30, color: t.good } },
      { id: 'c-sugar', key: 'sugar', label: 'Sucres', unit: 'g' },
      { id: 'c-sodium', key: 'sodium', label: 'Sodium', unit: 'mg', ref: { label: 'Maximum OMS 2 000 mg', value: 2000, color: t.critical } },
    ];
    specs.forEach((s) => {
      const has = rows.some((d) => isFiniteNumber(d[s.key]) && d[s.key] > 0);
      kit.toggleCard(s.id, has);
      if (has) kit.dailyBars(s.id, rows, { accessor: (d) => d[s.key], label: s.label, unit: s.unit, color: t.series[2], refs: s.ref ? [s.ref] : [] });
    });
  }

  function renderTopFoods({ lifestyle }) {
    const host = document.getElementById('top-foods');
    if (!host) return;
    const n = lifestyle.nutrition;
    const list = n ? n.topFoods : [];
    kit.toggleCard('top-foods', list.length > 0);
    if (!list.length) return;
    const max = list[0].kcal;
    host.innerHTML = `<ol class="rank-list">${list
      .map(
        (f) => `<li class="rank-list__item">
          <span class="rank-list__name">${escapeHtml(f.name)}</span>
          <span class="rank-list__bar"><span style="width:${((f.kcal / max) * 100).toFixed(1)}%"></span></span>
          <span class="rank-list__value">${fmt(f.kcal, 0)} kcal · ${f.count}×</span>
        </li>`
      )
      .join('')}</ol>
      <p class="muted rank-list__note">${fmt((list.reduce((s, f) => s + f.kcal, 0) / n.foodsKcal) * 100, 0)} % des kcal saisies sur la période viennent de ces ${list.length} aliments.</p>`;
  }

  function render(ctx) {
    renderIntake(ctx);
    renderMacros(ctx);
    renderMacroShare(ctx);
    renderProteinPerKg(ctx);
    renderMeals(ctx);
    renderWeekday(ctx);
    renderMicro(ctx);
    renderTopFoods(ctx);
  }

  SP.charts.nutrition = { render };
})(window.SP);
