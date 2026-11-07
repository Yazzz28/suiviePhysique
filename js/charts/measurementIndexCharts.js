/**
 * Indices issus des mensurations : cm perdus par kg, BRI, ABSI,
 * matrice des variations zones × dates.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, mixHex, clamp, withAlpha, isFiniteNumber, escapeHtml } = SP.core.utils;
  const { CM_ZONES } = SP.parsers.measurements;
  const { metrics } = SP.analysis;
  const theme = SP.charts.theme;
  const { lineChart } = SP.charts.composition;

  /** Barres : cm perdus par kg perdu, zone par zone (pente tour / poids). */
  function renderCmPerKg({ measurements }) {
    const t = theme.tokens();
    const rows = metrics.cmPerKg(measurements, CM_ZONES).sort((a, b) => b.slope - a.slope);
    const empty = document.getElementById('cm-per-kg-empty');
    if (empty) empty.classList.toggle('hidden', rows.length > 0);
    if (!rows.length) return;
    theme.create('c-cm-per-kg', {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            label: 'cm par kg',
            data: rows.map((r) => r.slope),
            backgroundColor: rows.map((r) => (r.slope >= 0 ? t.down : t.up)),
            barThickness: 14,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: theme.valueScale({ ticks: { callback: (v, _i, ticks) => fmt(v, theme.tickDecimals(ticks)) + ' cm/kg' } }),
          y: { grid: { display: false }, border: { display: false } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = rows[ctx.dataIndex];
                const verb = r.slope >= 0 ? 'diminue' : 'augmente';
                return [
                  ` ${r.label} ${verb} de ${fmt(Math.abs(r.slope), 2)} cm par kg perdu`,
                  ` Fiabilité R² ${fmt(r.r2, 2)} (${r.n} relevés)`,
                ];
              },
            },
          },
        },
      },
    });
    theme.setLegend('lg-cm-per-kg', [
      { label: 'Diminue quand le poids baisse', color: t.down, box: true },
      { label: 'Augmente quand le poids baisse', color: t.up, box: true },
    ]);
  }

  /**
   * BRI et ABSI : deux indices de forme, chacun sur son propre graphique (une seule échelle).
   * Seuils BRI : relation en U avec la mortalité (Zhang et al., JAMA Netw Open 2024),
   * risque accru sous 3,4 et à partir de 6,9.
   */
  function renderShapeIndices({ measurements }) {
    const t = theme.tokens();
    lineChart('c-bri', measurements, [{ key: 'bri', label: 'BRI', color: t.series[0] }], {
      decimals: 2,
      bands: [
        { from: 0, to: 3.4, color: withAlpha(t.warning, 0.1), label: 'Très bas (< 3,4)' },
        { from: 6.9, to: 30, color: withAlpha(t.critical, 0.1), label: 'Risque accru (≥ 6,9)' },
      ],
    });
    lineChart('c-absi', measurements, [{ key: 'absi', label: 'ABSI', color: t.series[0] }], { decimals: 4 });
  }

  /** Couleur divergente (baisse bleue, hausse rouge) d'une variation relative. */
  function cellColor(pct, t) {
    const k = clamp(Math.abs(pct) / 8, 0, 1);
    return mixHex(t.mid, pct < 0 ? t.down : t.up, k);
  }

  /** Matrice HTML : zones en lignes, dates en colonnes, % vs premier relevé. */
  function renderMatrix({ measurements }) {
    const host = document.getElementById('meas-matrix');
    if (!host || !measurements.length) return;
    const t = theme.tokens();
    const first = measurements[0];
    const head = `<tr><th>Zone</th>${measurements.map((m) => `<th>${fmtDate(m.date)}</th>`).join('')}</tr>`;
    const rows = CM_ZONES.map((z) => {
      const cells = measurements
        .map((m) => {
          const v = m[z.key];
          const base = first[z.key];
          if (!isFiniteNumber(v) || !isFiniteNumber(base) || !base) return '<td class="matrix__cell">—</td>';
          const pct = ((v - base) / base) * 100;
          const strong = Math.abs(pct) > 5;
          const tip = `${z.label} · ${fmtDate(m.date, 'long')} : ${fmt(v, 1)} cm (${fmtDelta(v - base, 1)} cm, ${fmtDelta(pct, 1)} %)`;
          return `<td class="matrix__cell" style="background:${cellColor(pct, t)};${strong ? 'color:#fff' : ''}" data-tip="${escapeHtml(tip)}">${fmtDelta(pct, 1)}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${escapeHtml(z.label)}</th>${cells}</tr>`;
    }).join('');
    host.innerHTML = `<table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    SP.ui.tooltip.bind(host, '[data-tip]');
  }

  function render(ctx) {
    if (!ctx.measurements.length) return;
    renderCmPerKg(ctx);
    renderShapeIndices(ctx);
    renderMatrix(ctx);
  }

  SP.charts.measurementIndices = { render };
})(window.SP);
