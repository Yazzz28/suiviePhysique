/**
 * Records personnels sur tout l'historique et comparaison du mois en cours
 * d'une année à l'autre.
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber, weekStart, dayKey, DAY_MS } = SP.core.utils;

  /** Plus longue série de jours consécutifs vérifiant `test`. */
  function longestStreak(days, test) {
    let best = { length: 0, end: null };
    let cur = 0;
    days.forEach((d, i) => {
      const prev = days[i - 1];
      const consecutive = prev && Math.round((d.date - prev.date) / DAY_MS) === 1;
      cur = test(d) ? (consecutive ? cur + 1 : 1) : 0;
      if (cur > best.length) best = { length: cur, end: d.date };
    });
    return best;
  }

  /**
   * @param {object[]} allDays  table journalière de tout l'historique
   * @param {object[]} weights  toutes les pesées
   * @param {object} monthly    longTerm.monthly(...) (séries mensuelles)
   */
  function analyze(allDays, weights, monthly) {
    const full = allDays.filter((d) => !d.partial);
    const list = [];
    const best = (arr, f, cmp) => arr.reduce((b, d) => (isFiniteNumber(f(d)) && (!b || cmp(f(d), f(b))) ? d : b), null);

    const stepDay = best(full, (d) => d.steps, (a, b) => a > b);
    if (stepDay) list.push({ label: 'Plus de pas en un jour', value: stepDay.steps, unit: 'pas', decimals: 0, date: stepDay.date });

    const weeks = new Map();
    full.forEach((d) => {
      if (!isFiniteNumber(d.steps)) return;
      const k = dayKey(weekStart(d.date));
      if (!weeks.has(k)) weeks.set(k, { date: weekStart(d.date), total: 0, n: 0 });
      const w = weeks.get(k);
      w.total += d.steps;
      w.n++;
    });
    const bestWeek = [...weeks.values()].filter((w) => w.n === 7).reduce((b, w) => (!b || w.total > b.total ? w : b), null);
    if (bestWeek) list.push({ label: 'Meilleure semaine de pas', value: bestWeek.total, unit: 'pas', decimals: 0, date: bestWeek.date, note: 'semaine du' });

    const hrSeries = (monthly && monthly.series.hrRest) || [];
    const lowHr = best(hrSeries, (m) => m.value, (a, b) => a < b);
    if (lowHr) list.push({ label: 'FC de repos la plus basse (moyenne du mois)', value: lowHr.value, unit: 'bpm', decimals: 0, date: lowHr.date, month: true });

    const sleepNight = best(full, (d) => d.sleepScore, (a, b) => a > b);
    if (sleepNight) list.push({ label: 'Meilleur score de sommeil', value: sleepNight.sleepScore, unit: '/ 100', decimals: 0, date: sleepNight.date });

    const logStreak = longestStreak(full, (d) => d.logStatus === 'complete');
    if (logStreak.length >= 2) list.push({ label: 'Plus longue série de repas saisis', value: logStreak.length, unit: 'jours', decimals: 0, date: logStreak.end, note: "jusqu'au" });

    const weighDays = new Set((weights || []).map((w) => dayKey(w.date)));
    const weighStreak = longestStreak(allDays, (d) => weighDays.has(d.key));
    if (weighStreak.length >= 2) list.push({ label: 'Plus longue série de pesées', value: weighStreak.length, unit: 'jours', decimals: 0, date: weighStreak.end, note: "jusqu'au" });

    // Poids le plus bas de chaque année
    const byYear = new Map();
    (weights || []).forEach((w) => {
      const y = w.date.getFullYear();
      if (!byYear.has(y) || w.weight < byYear.get(y).weight) byYear.set(y, w);
    });
    const yearlyMin = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, w]) => ({ year, weight: w.weight, date: w.date }));

    // Même mois, d'une année à l'autre
    const lastDate = allDays.length ? allDays[allDays.length - 1].date : new Date();
    const month = lastDate.getMonth();
    const sameMonth = {};
    ['weight', 'steps', 'hrRest', 'sleepHours'].forEach((k) => {
      const s = ((monthly && monthly.series[k]) || []).filter((p) => p.date.getMonth() === month);
      if (s.length >= 2) sameMonth[k] = s.map((p) => ({ year: p.date.getFullYear(), value: p.value, n: p.n }));
    });

    return { list, yearlyMin, sameMonth, month, monthName: new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(lastDate) };
  }

  SP.analysis.lifestyle.records = { analyze };
})(window.SP);
