/**
 * Graphiques des analyses avancées : adaptation métabolique, semaine type,
 * protéines par repas, mouvement spontané, récupération, efficacité cardio,
 * fenêtre alimentaire, cycles de poids, même mois d'une année à l'autre.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, isFiniteNumber, withAlpha, DAY_MS } = SP.core.utils;
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
  };

  function renderAdaptation({ lifestyle }) {
    const t = theme.tokens();
    const a = lifestyle.adaptation;
    kit.toggleCard('c-adaptation', !!a);
    if (!a) return;
    kit.lines(
      'c-adaptation',
      [
        { label: 'Dépense réelle estimée', data: a.series.map((p) => ({ x: p.date.getTime(), y: p.adaptive })), color: t.series[6] },
        { label: 'Attendue avec le poids perdu', data: a.series.map((p) => ({ x: p.date.getTime(), y: p.expected })), color: t.textSecondary, dashed: true },
      ],
      { unit: 'kcal', legendId: 'lg-adaptation' }
    );
    const verdict =
      a.gap < -150
        ? 'ta dépense baisse plus que prévu : ton corps économise (adaptation), à surveiller'
        : a.gap > 150
          ? 'ta dépense se maintient mieux que prévu'
          : 'ta dépense suit la baisse attendue, sans adaptation marquée';
    setText('adaptation-sub', `Écart actuel ${fmtDelta(a.gap, 0)} kcal/j après ${fmt(a.lost, 1)} kg perdus : ${verdict}. Estimation sur 21 jours glissants, à lire comme une tendance.`);
  }

  function renderWeekBalance({ lifestyle }) {
    const t = theme.tokens();
    const w = lifestyle.weekPattern;
    kit.toggleCard('c-week-balance', !!w);
    if (!w) return;
    theme.create('c-week-balance', {
      type: 'bar',
      data: {
        labels: kit.WEEKDAYS,
        datasets: [
          {
            label: 'Bilan moyen',
            data: w.byWeekday.map((d) => d.balance),
            backgroundColor: w.byWeekday.map((d) => (isFiniteNumber(d.balance) && d.balance > 0 ? t.up : withAlpha(t.down, d.index >= 5 ? 0.55 : 0.9))),
            borderRadius: 4,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        scales: { x: { grid: { display: false } }, y: theme.valueScale({ ticks: { callback: (v) => fmtDelta(v, 0) + ' kcal' } }) },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = w.byWeekday[ctx.dataIndex];
                return ` Bilan ${fmtDelta(d.balance, 0)} kcal · apport ${fmt(d.intake, 0)} kcal (${d.n} jours)`;
              },
            },
          },
        },
      },
    });
    let text = `Semaine ${fmtDelta(w.weekBalance, 0)} kcal/j (${w.nWeek} j) · week-end ${fmtDelta(w.weekendBalance, 0)} kcal/j (${w.nWeekend} j)`;
    if (isFiniteNumber(w.erasedDays) && w.erasedDays >= 0.25) text += ` : ton week-end efface l'équivalent de ${fmt(w.erasedDays, 1)} jour(s) de déficit de semaine`;
    else text += ' : pas d’effet week-end marqué';
    if (isFiniteNumber(w.mondayDelta)) text += `. Pesée du lundi : ${fmtDelta(w.mondayDelta, 2)} kg en moyenne vs dimanche.`;
    setText('week-balance-sub', text);
  }

  function renderProteinMeals({ lifestyle }) {
    const t = theme.tokens();
    const p = lifestyle.protein;
    kit.toggleCard('c-protein-meals', !!p && p.byType.length > 0);
    if (!p || !p.byType.length) return;
    theme.create('c-protein-meals', {
      type: 'bar',
      data: {
        labels: p.byType.map((b) => b.label),
        datasets: [
          {
            label: 'Protéines moyennes',
            data: p.byType.map((b) => b.protein),
            backgroundColor: p.byType.map((b) => (b.protein >= p.threshold ? t.series[4] : withAlpha(t.series[4], 0.5))),
            borderRadius: 4,
            maxBarThickness: 40,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: theme.valueScale({ beginAtZero: true, suggestedMax: 35, ticks: { callback: (v) => v + ' g' } }),
        },
        plugins: {
          spBands: { bands: [{ from: p.threshold, to: 200, color: withAlpha(t.good, 0.1), label: `${p.threshold} g et plus` }] },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const b = p.byType[ctx.dataIndex];
                return ` ${fmt(b.protein, 0)} g en moyenne · ${b.reached} repas sur ${b.n} atteignent ${p.threshold} g`;
              },
            },
          },
        },
      },
    });
    setText('protein-meals-sub', `${p.reached} repas sur ${p.meals} (plus de 150 kcal) atteignent ${p.threshold} g de protéines, soit ${fmt((p.reached / p.meals) * 100, 0)} %.`);
  }

  function renderSpontaneous({ lifestyle }) {
    const t = theme.tokens();
    const s = lifestyle.spontaneous;
    kit.toggleCard('c-spontaneous', !!s);
    if (!s) return;
    const steps = s.weeks.map((w) => ({ x: w.date.getTime() + 3.5 * DAY_MS, y: w.steps }));
    const intake = s.weeks.filter((w) => isFiniteNumber(w.intake)).map((w) => ({ x: w.date.getTime() + 3.5 * DAY_MS, y: w.intake }));
    theme.setLegend('lg-spontaneous', [
      { label: 'Pas hors séances (moyenne/jour)', color: withAlpha(t.series[2], 0.6), box: true },
      { label: 'Apport moyen (kcal/j)', color: t.series[1] },
    ]);
    theme.create('c-spontaneous', {
      type: 'bar',
      data: {
        datasets: [
          { type: 'bar', label: 'Pas hors séances', data: steps, backgroundColor: withAlpha(t.series[2], 0.6), borderRadius: 3, barPercentage: 0.8, categoryPercentage: 1, yAxisID: 'y' },
          { type: 'line', label: 'Apport moyen', data: intake, borderColor: t.series[1], backgroundColor: t.series[1], pointRadius: 3, yAxisID: 'y2' },
        ],
      },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(steps[0].x - 4 * DAY_MS, steps[steps.length - 1].x + 4 * DAY_MS),
          y: theme.valueScale({ beginAtZero: true, ticks: { callback: (v) => fmt(v, 0) } }),
          y2: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { callback: (v) => fmt(v, 0) + ' kcal', maxTicksLimit: 5 } },
        },
        plugins: { tooltip: kit.xTooltip('', 0) },
      },
    });
    const change = s.firstHalf ? ((s.secondHalf - s.firstHalf) / s.firstHalf) * 100 : 0;
    let text = `${fmt(s.firstHalf, 0)} → ${fmt(s.secondHalf, 0)} pas/jour hors séances entre la 1re et la 2e moitié de la période`;
    text += Math.abs(change) >= 10 ? ` (${fmtDelta(change, 0)} %).` : ', stable.';
    if (isFiniteNumber(s.r)) {
      const rTxt = `r = ${fmtDelta(s.r, 2)}, ${s.nPairs} sem.`;
      if (s.r > 0.3) text += ` Les semaines où tu manges moins, tu bouges aussi moins (${rTxt}) : compensation possible, garde un œil sur tes pas.`;
      else if (s.r < -0.3) text += ` Les semaines où tu manges moins, tu bouges plutôt plus (${rTxt}) : pas de compensation.`;
      else text += ` Pas de lien net entre ce que tu manges et ton mouvement (${rTxt}).`;
    }
    setText('spontaneous-sub', text);
  }

  function renderRecovery({ lifestyle }) {
    const t = theme.tokens();
    const r = lifestyle.recovery;
    const pts = r ? r.scores.map((s) => ({ x: s.date.getTime(), y: s.score })) : [];
    kit.toggleCard('c-recovery-score', pts.length > 0);
    if (pts.length) {
      kit.lines('c-recovery-score', [{ label: 'Récupération', data: pts, color: t.series[2], points: true }], {
        y: { min: 0, max: 100 },
        bands: [
          { from: 0, to: 35, color: withAlpha(t.warning, 0.1), label: 'Basse' },
          { from: 65, to: 100, color: withAlpha(t.good, 0.1), label: 'Bonne' },
        ],
        tooltip: {
          ...kit.xTooltip('', 0),
          callbacks: {
            title: (items) => (items.length ? fmtDate(new Date(items[0].parsed.x), 'weekday') : ''),
            label: (ctx) => {
              const s = r.scores[ctx.dataIndex];
              return [` Score ${fmt(s.score, 0)} / 100`, ...s.parts.map((p) => `  ${p.label} : ${fmt(p.value, 0)} (normale ${fmt(p.usual, 0)})`)];
            },
          },
        },
      });
      const today = r.today;
      if (today) {
        const level = today.score >= 65 ? 'bonne' : today.score <= 35 ? 'basse' : 'moyenne';
        setText('recovery-sub', `Dernière mesure (${fmtDate(today.date, 'weekday')}) : ${fmt(today.score, 0)} / 100, récupération ${level}. 50 = ta normale des 30 jours précédents.`);
      }
    }
    const e = r && r.efficiency;
    kit.toggleCard('c-cardio-eff', !!e);
    if (e) {
      const data = e.points.map((p) => ({ x: p.date.getTime(), y: p.value }));
      kit.lines(
        'c-cardio-eff',
        [
          { label: 'Marches', data, color: withAlpha(t.series[6], 0.6), points: true, showLine: false },
          { label: 'Moyenne 7 j', data: kit.rolling7(data), color: t.series[6] },
        ],
        { decimals: 2, tick: (v) => fmt(v, 2) }
      );
      if (isFiniteNumber(e.changePerMonthPct)) {
        setText(
          'cardio-eff-sub',
          `${e.n} marches de plus de 10 min · ${fmtDelta(e.changePerMonthPct, 1)} % par mois : ${
            e.changePerMonthPct > 1 ? 'ta forme cardio progresse' : e.changePerMonthPct < -1 ? 'ton efficacité baisse (fatigue, chaleur, dénivelé ?)' : 'stable'
          }.`
        );
      }
    }
  }

  function renderEatingWindow({ lifestyle }) {
    const t = theme.tokens();
    const r = lifestyle.rhythms;
    const rows = r ? r.windows : [];
    kit.toggleCard('c-eating-window', rows.length > 0);
    if (!rows.length) return;
    const minX = rows[0].date.getTime() - DAY_MS / 2;
    const maxX = rows[rows.length - 1].date.getTime() + DAY_MS / 2;
    theme.create('c-eating-window', {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Fenêtre alimentaire',
            data: rows.map((w) => ({ x: w.date.getTime(), y: [w.first, Math.max(w.last, w.first + 0.25)] })),
            backgroundColor: rows.map((w) => (w.last >= r.lateMeal.hour ? withAlpha(t.series[1], 0.75) : withAlpha(t.series[3], 0.65))),
            borderRadius: 3,
            barPercentage: 0.7,
            categoryPercentage: 1,
          },
        ],
      },
      options: {
        scales: {
          x: theme.timeScale(minX, maxX),
          y: theme.valueScale({ reverse: true, min: 6, max: 24, ticks: { stepSize: 2, callback: (v) => kit.fmtClock(v) } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => fmtDate(new Date(items[0].parsed.x), 'weekday'),
              label: (ctx) => {
                const [a, b] = ctx.raw.y;
                return ` Premier repas ${kit.fmtClock(a)} · dernier ${kit.fmtClock(b)} (${fmt(b - a, 1)} h)`;
              },
            },
          },
        },
      },
    });
    setText(
      'eating-window-sub',
      `En moyenne de ${kit.fmtClock(r.firstMean)} à ${kit.fmtClock(r.lastMean)}, soit ${fmt(r.windowMean, 1)} h · orange = dernier repas après ${r.lateMeal.hour} h.`
    );
  }

  function renderPhases({ lifestyle }) {
    const t = theme.tokens();
    const ph = lifestyle.phases;
    kit.toggleCard('c-phases', !!ph);
    if (!ph) return;
    // Pas de ligne inventée dans les périodes sans pesée (plus de 8 semaines) : la série est coupée
    const GAP_MS = 56 * DAY_MS;
    const pts = [];
    ph.points.forEach((p, i) => {
      const prev = ph.points[i - 1];
      if (prev && p.date - prev.date > GAP_MS) pts.push({ x: (p.date.getTime() + prev.date.getTime()) / 2, y: null });
      pts.push({ x: p.date.getTime(), y: p.weight });
    });
    const datasets = [{ label: 'Poids (moyenne de la semaine)', data: pts, borderColor: withAlpha(t.textSecondary, 0.5), borderWidth: 1.2, pointRadius: 0, spanGaps: false }];
    ph.phases.forEach((p) => {
      const seg = [];
      ph.points
        .filter((q) => q.date >= p.start.date && q.date <= p.end.date)
        .forEach((q, i, arr) => {
          if (i && q.date - arr[i - 1].date > GAP_MS) seg.push({ x: (q.date.getTime() + arr[i - 1].date.getTime()) / 2, y: null });
          seg.push({ x: q.date.getTime(), y: q.weight });
        });
      datasets.push({
        label: p.type === 'loss' ? 'Perte' : 'Reprise',
        data: seg,
        borderColor: p.type === 'loss' ? t.down : t.up,
        borderWidth: p.ongoing ? 3.5 : 2.5,
        pointRadius: 0,
        spanGaps: false,
        phase: p,
      });
    });
    theme.setLegend('lg-phases', [
      { label: 'Phase de perte', color: t.down },
      { label: 'Phase de reprise', color: t.up },
      { label: 'Semaines hors phase', color: withAlpha(t.textSecondary, 0.5) },
    ]);
    theme.create('c-phases', {
      type: 'line',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: {
            ...theme.timeScale(pts[0].x, pts[pts.length - 1].x),
            afterBuildTicks: (axis) => {
              const ticks = [];
              for (let y = new Date(axis.min).getFullYear() + 1; y <= new Date(axis.max).getFullYear(); y++) ticks.push({ value: new Date(y, 0, 1).getTime() });
              axis.ticks = ticks;
            },
            ticks: { maxRotation: 0, callback: (v) => String(new Date(v).getFullYear()) },
          },
          y: theme.valueScale({ ticks: { callback: (v) => fmt(v, 0) + ' kg' } }),
        },
        plugins: {
          tooltip: {
            mode: 'nearest',
            intersect: false,
            callbacks: {
              title: (items) => (items.length ? `Semaine du ${fmtDate(new Date(items[0].parsed.x), 'long')}` : ''),
              label: (ctx) => {
                const p = ctx.dataset.phase;
                if (!p) return ` ${fmt(ctx.parsed.y, 1)} kg`;
                return ` ${p.type === 'loss' ? 'Perte' : 'Reprise'} : ${fmtDelta(p.kg, 1)} kg en ${fmt(p.weeks, 0)} sem. (${fmtDelta(p.ratePerWeek, 2)} kg/sem.)`;
              },
            },
          },
        },
      },
    });
  }

  function renderSameMonth({ lifestyle }) {
    const t = theme.tokens();
    const rec = lifestyle.records;
    const sm = rec ? rec.sameMonth : {};
    const years = [...new Set([...(sm.weight || []), ...(sm.steps || [])].map((p) => p.year))].sort();
    kit.toggleCard('c-same-month', years.length >= 2);
    if (years.length < 2) return;
    const val = (list, y) => {
      const p = (list || []).find((q) => q.year === y);
      return p ? p.value : null;
    };
    theme.setLegend('lg-same-month', [
      { label: 'Poids moyen (kg)', color: t.series[0], box: true },
      { label: 'Pas par jour', color: t.series[2] },
    ]);
    theme.create('c-same-month', {
      type: 'bar',
      data: {
        labels: years.map(String),
        datasets: [
          { type: 'bar', label: 'Poids moyen', data: years.map((y) => val(sm.weight, y)), backgroundColor: withAlpha(t.series[0], 0.7), borderRadius: 4, maxBarThickness: 30, yAxisID: 'y' },
          { type: 'line', label: 'Pas par jour', data: years.map((y) => val(sm.steps, y)), borderColor: t.series[2], backgroundColor: t.series[2], pointRadius: 4, spanGaps: true, yAxisID: 'y2' },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: theme.valueScale({ ticks: { callback: (v) => fmt(v, 0) + ' kg' } }),
          y2: { position: 'right', beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { callback: (v) => fmt(v, 0), maxTicksLimit: 5 } },
        },
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: { label: (ctx) => (ctx.parsed.y === null ? null : ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y, ctx.datasetIndex === 0 ? 1 : 0)}`) },
          },
        },
      },
    });
    setText('same-month-sub', `Mois de ${rec.monthName}, d'une année à l'autre (poids : barres · pas : courbe). Le mois en cours peut être incomplet.`);
  }

  function render(ctx) {
    if (!ctx.lifestyle) return;
    renderAdaptation(ctx);
    renderWeekBalance(ctx);
    renderProteinMeals(ctx);
    renderSpontaneous(ctx);
    renderRecovery(ctx);
    renderEatingWindow(ctx);
    renderPhases(ctx);
    renderSameMonth(ctx);
  }

  SP.charts.insights = { render };
})(window.SP);
