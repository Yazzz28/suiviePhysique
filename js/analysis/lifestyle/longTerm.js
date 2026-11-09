/**
 * Historique long terme : moyennes mensuelles sur tout l'export, quelle que
 * soit la période sélectionnée (poids, pas, FC de repos, stress, sommeil).
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber } = SP.core.utils;

  const METRICS = [
    { key: 'weight', label: 'Poids', unit: 'kg', decimals: 1 },
    { key: 'steps', label: 'Pas / jour', unit: 'pas', decimals: 0 },
    { key: 'hrRest', label: 'FC de repos', unit: 'bpm', decimals: 0 },
    { key: 'stressAvg', label: 'Stress moyen', unit: '', decimals: 0 },
    { key: 'sleepHours', label: 'Sommeil', unit: 'h', decimals: 1 },
    { key: 'kcalIn', label: 'Apport saisi', unit: 'kcal', decimals: 0 },
  ];

  const MIN_DAYS_PER_MONTH = 3;

  /**
   * @param {object[]} days     table journalière sur tout l'historique
   * @param {object[]} weights  toutes les pesées (toutes sources)
   */
  function monthly(days, weights) {
    const months = new Map();
    const bucket = (date) => {
      const k = `${date.getFullYear()}-${date.getMonth()}`;
      if (!months.has(k)) months.set(k, { date: new Date(date.getFullYear(), date.getMonth(), 15), values: {} });
      return months.get(k);
    };
    const push = (date, key, value) => {
      if (!isFiniteNumber(value)) return;
      const b = bucket(date);
      (b.values[key] = b.values[key] || []).push(value);
    };
    days.forEach((d) => {
      if (d.partial) return;
      push(d.date, 'steps', d.steps);
      push(d.date, 'hrRest', d.hrRest);
      push(d.date, 'stressAvg', d.stressAvg);
      push(d.date, 'sleepHours', isFiniteNumber(d.sleepMin) ? d.sleepMin / 60 : null);
      push(d.date, 'kcalIn', d.logStatus === 'complete' ? d.kcalIn : null);
    });
    (weights || []).forEach((w) => push(w.date, 'weight', w.weight));

    const rows = [...months.values()].sort((a, b) => a.date - b.date);
    const series = {};
    METRICS.forEach((m) => {
      const minN = m.key === 'weight' ? 1 : MIN_DAYS_PER_MONTH;
      series[m.key] = rows
        .filter((r) => (r.values[m.key] || []).length >= minN)
        .map((r) => ({ date: r.date, value: mean(r.values[m.key]), n: r.values[m.key].length }));
    });
    return { metrics: METRICS.filter((m) => series[m.key].length >= 2), series };
  }

  SP.analysis.lifestyle.longTerm = { monthly, METRICS };
})(window.SP);
