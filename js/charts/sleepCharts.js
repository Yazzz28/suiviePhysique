/**
 * Section Sommeil & récupération : durée et phases par nuit, horaires de
 * coucher / lever, score et récupération, hypnogramme des dernières nuits,
 * FC et VFC pendant le sommeil, score de vitalité.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, isFiniteNumber, withAlpha, escapeHtml, DAY_MS } = SP.core.utils;
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;
  const { SLEEP_TARGET_MIN } = SP.analysis.lifestyle.sleepStress;

  const STAGES = [
    { key: 'deep', label: 'Profond' },
    { key: 'light', label: 'Léger' },
    { key: 'rem', label: 'Paradoxal' },
    { key: 'awake', label: 'Éveil' },
  ];

  /** Phases : du plus profond (foncé) au plus léger ; l'éveil en orange pour se détacher. */
  function stageColors(t) {
    return { deep: t.seq[4], light: t.seq[1], rem: t.series[6], awake: t.series[1] };
  }

  function nights(lifestyle) {
    return lifestyle.days.filter((d) => isFiniteNumber(d.sleepMin));
  }

  function renderDuration({ lifestyle }) {
    const t = theme.tokens();
    const rows = nights(lifestyle);
    kit.toggleCard('c-sleep-dur', rows.length > 0);
    if (!rows.length) return;
    const colors = stageColors(t);
    const staged = rows.some((d) => d.stages);
    const minX = rows[0].date.getTime() - DAY_MS / 2;
    const maxX = rows[rows.length - 1].date.getTime() + DAY_MS / 2;
    const toH = (m) => m / 60;
    const datasets = staged
      ? STAGES.map((s) => ({
          label: s.label,
          data: rows.map((d) => ({ x: d.date.getTime(), y: d.stages ? toH(d.stages[s.key]) : 0 })),
          backgroundColor: colors[s.key],
          stack: 'sleep',
          barPercentage: 0.9,
          categoryPercentage: 1,
          borderRadius: 0,
        }))
      : [];
    // Nuits sans détail des phases (anciennes montres, nuits saisies) : durée seule
    if (rows.some((d) => !d.stages)) {
      datasets.push({
        label: 'Sans détail des phases',
        data: rows.map((d) => ({ x: d.date.getTime(), y: d.stages ? 0 : toH(d.sleepMin) })),
        backgroundColor: withAlpha(t.series[6], 0.35),
        stack: 'sleep',
        barPercentage: 0.9,
        categoryPercentage: 1,
        borderRadius: 0,
      });
    }
    datasets.push(kit.refLine('7 h', SLEEP_TARGET_MIN / 60, minX, maxX, t.textSecondary));
    theme.setLegend('lg-sleep-dur', [
      ...(staged ? STAGES.map((s) => ({ label: s.label, color: colors[s.key], box: true })) : []),
      ...(rows.some((d) => !d.stages) ? [{ label: 'Sans détail des phases', color: withAlpha(t.series[6], 0.35), box: true }] : []),
      { label: 'Repère 7 h', color: t.textSecondary, dashed: true },
    ]);
    theme.create('c-sleep-dur', {
      type: 'bar',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: { ...theme.timeScale(minX, maxX), stacked: true },
          y: theme.valueScale({ stacked: true, beginAtZero: true, ticks: { callback: (v) => fmt(v, 0) + ' h' } }),
        },
        plugins: {
          tooltip: {
            ...kit.xTooltip('', 0),
            callbacks: {
              title: (items) => (items.length ? `Nuit jusqu'au ${fmtDate(new Date(items[0].parsed.x), 'weekday')}` : ''),
              label: (ctx) => (ctx.parsed.y > 0 ? ` ${ctx.dataset.label} : ${kit.fmtDuration(ctx.parsed.y * 60)}` : null),
              footer: (items) => {
                const d = rows.find((r) => r.date.getTime() === items[0].parsed.x);
                return d ? `Total ${kit.fmtDuration(d.sleepMin)}${isFiniteNumber(d.sleepScore) ? ` · score ${fmt(d.sleepScore, 0)}` : ''}` : '';
              },
            },
          },
        },
      },
    });
  }

  /** Barres flottantes coucher -> lever (axe en heures, au-delà de minuit = 24 + h). */
  function renderTimes({ lifestyle }) {
    const t = theme.tokens();
    const rows = nights(lifestyle).filter((d) => isFiniteNumber(d.bedtime));
    kit.toggleCard('c-sleep-times', rows.length > 0);
    if (!rows.length) return;
    const wake = (d) => (d.waketime < d.bedtime - 12 ? d.waketime + 24 : d.waketime);
    const minX = rows[0].date.getTime() - DAY_MS / 2;
    const maxX = rows[rows.length - 1].date.getTime() + DAY_MS / 2;
    const lo = Math.floor(Math.min(...rows.map((d) => d.bedtime)));
    const hi = Math.ceil(Math.max(...rows.map(wake)));
    theme.create('c-sleep-times', {
      type: 'bar',
      data: {
        datasets: [
          {
            label: 'Sommeil',
            data: rows.map((d) => ({ x: d.date.getTime(), y: [d.bedtime, wake(d)] })),
            backgroundColor: withAlpha(t.series[6], 0.6),
            borderRadius: 3,
            barPercentage: 0.7,
            categoryPercentage: 1,
          },
        ],
      },
      options: {
        scales: {
          x: theme.timeScale(minX, maxX),
          y: theme.valueScale({ reverse: true, min: lo, max: hi, ticks: { stepSize: 1, callback: (v) => kit.fmtClock(v) } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => `Nuit jusqu'au ${fmtDate(new Date(items[0].parsed.x), 'weekday')}`,
              label: (ctx) => {
                const [a, b] = ctx.raw.y;
                return ` Coucher ${kit.fmtClock(a)} · lever ${kit.fmtClock(b)}`;
              },
            },
          },
        },
      },
    });
    const s = lifestyle.sleep;
    const sub = document.getElementById('sleep-times-sub');
    if (sub && s) {
      sub.textContent = `Coucher moyen ${kit.fmtClock(s.bedtimeMean)} (± ${fmt((s.bedtimeSd || 0) * 60, 0)} min) · lever moyen ${kit.fmtClock(s.waketimeMean)} (± ${fmt(
        (s.waketimeSd || 0) * 60,
        0
      )} min). Moins l'écart est grand, plus le rythme est régulier.`;
    }
  }

  function renderScores({ lifestyle }) {
    const t = theme.tokens();
    const rows = nights(lifestyle);
    const score = kit.points(rows, (d) => d.sleepScore);
    const eff = kit.points(rows, (d) => d.sleepEff);
    kit.toggleCard('c-sleep-score', score.length + eff.length > 0);
    if (score.length + eff.length) {
      kit.lines(
        'c-sleep-score',
        [
          { label: 'Score de sommeil', data: score, color: t.series[6], points: true },
          { label: 'Efficacité (%)', data: eff, color: t.series[2], points: true },
        ],
        { legendId: 'lg-sleep-score', y: { suggestedMin: 40, suggestedMax: 100 } }
      );
    }
    const mental = kit.points(rows, (d) => d.sleepMental);
    const physical = kit.points(rows, (d) => d.sleepPhysical);
    kit.toggleCard('c-recovery', mental.length + physical.length > 0);
    if (mental.length + physical.length) {
      kit.lines(
        'c-recovery',
        [
          { label: 'Récupération mentale', data: mental, color: t.series[4], points: true },
          { label: 'Récupération physique', data: physical, color: t.series[0], points: true },
        ],
        { legendId: 'lg-recovery', y: { suggestedMin: 40, suggestedMax: 100 } }
      );
    }
  }

  /** Hypnogramme SVG des dernières nuits : une ligne par nuit, phases en couleur. */
  function renderHypnogram({ lifestyle }) {
    const host = document.getElementById('hypnogram');
    if (!host) return;
    const s = lifestyle.sleep;
    const list = s ? s.hypnogram : [];
    kit.toggleCard('hypnogram', list.length > 0);
    if (!list.length) return;
    const t = theme.tokens();
    const colors = stageColors(t);
    // Fenêtre horaire commune : du coucher le plus tôt au lever le plus tard
    const startH = Math.floor(Math.min(...list.map((d) => d.bedtime)));
    const endH = Math.ceil(Math.max(...list.map((d) => (d.waketime < d.bedtime - 12 ? d.waketime + 24 : d.waketime))));
    const span = Math.max(1, endH - startH);
    const W = 640;
    const LABEL = 92;
    const ROW = 26;
    const H = list.length * ROW + 22;
    const x = (date, ref) => {
      let h = (date - ref) / 3600000 + startH;
      return LABEL + ((h - startH) / span) * (W - LABEL - 8);
    };
    const rows = list
      .map((d, i) => {
        // Référence : minuit précédant le coucher + heure de début de fenêtre
        const bed = d.sleepStart;
        const base = new Date(bed.getFullYear(), bed.getMonth(), bed.getDate() - (d.bedtime >= 24 ? 1 : 0), startH);
        const y = i * ROW + 4;
        const segs = d.stages.segments
          .map((sg) => {
            const x1 = x(sg.start, base);
            const x2 = x(sg.end, base);
            return `<rect x="${x1.toFixed(1)}" y="${y}" width="${Math.max(0.6, x2 - x1).toFixed(1)}" height="${ROW - 8}" fill="${colors[sg.stage]}"><title>${
              STAGES.find((st) => st.key === sg.stage).label
            } · ${kit.fmtClock(sg.start.getHours() + sg.start.getMinutes() / 60)}-${kit.fmtClock(sg.end.getHours() + sg.end.getMinutes() / 60)}</title></rect>`;
          })
          .join('');
        return `<text x="0" y="${y + ROW / 2}" class="hypno__label">${escapeHtml(fmtDate(d.date, 'weekday'))}</text>${segs}`;
      })
      .join('');
    let ticks = '';
    for (let h = startH; h <= endH; h += 2) {
      const px = LABEL + ((h - startH) / span) * (W - LABEL - 8);
      ticks += `<line x1="${px}" x2="${px}" y1="0" y2="${H - 18}" class="hypno__grid"/><text x="${px}" y="${H - 4}" class="hypno__tick">${kit.fmtClock(h)}</text>`;
    }
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="hypno" role="img" aria-label="Phases de sommeil des dernières nuits">${ticks}${rows}</svg>`;
    theme.setLegend('lg-hypnogram', STAGES.map((st) => ({ label: st.label, color: colors[st.key], box: true })));
  }

  function renderVitality({ lifestyle }) {
    const t = theme.tokens();
    const rows = lifestyle.days;
    const hr = kit.points(rows, (d) => d.sleepHr);
    const hrv = kit.points(rows, (d) => d.sleepHrv);
    kit.toggleCard('c-sleep-hr', hr.length + hrv.length > 0);
    if (hr.length + hrv.length) {
      kit.lines(
        'c-sleep-hr',
        [
          { label: 'FC pendant le sommeil (bpm)', data: hr, color: t.series[7], points: true },
          { label: 'VFC pendant le sommeil (ms)', data: hrv, color: t.series[2], points: true },
        ],
        { legendId: 'lg-sleep-hr' }
      );
    }
    const vit = kit.points(rows, (d) => d.vitality);
    kit.toggleCard('c-vitality', vit.length > 0);
    if (vit.length) kit.lines('c-vitality', [{ label: 'Score de vitalité', data: vit, color: t.series[6], points: true }], { y: { suggestedMin: 50, suggestedMax: 100 } });
  }

  function render(ctx) {
    renderDuration(ctx);
    renderTimes(ctx);
    renderScores(ctx);
    renderHypnogram(ctx);
    renderVitality(ctx);
  }

  SP.charts.sleep = { render, STAGES };
})(window.SP);
