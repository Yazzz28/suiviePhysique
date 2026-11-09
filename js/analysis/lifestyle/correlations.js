/**
 * Corrélations entre les métriques du jour J et la variation de poids
 * J -> J+1 (et entre métriques). Coefficient de Pearson, avec le nombre de
 * jours utilisés : une corrélation ne prouve pas une cause, et peu de jours
 * donnent des coefficients instables.
 */
(function (SP) {
  'use strict';

  const { isFiniteNumber, dayKey, DAY_MS } = SP.core.utils;

  const MIN_N = 10;

  const VARIABLES = [
    { key: 'kcalIn', label: 'Apport (kcal)', short: 'Apport', completeOnly: true },
    { key: 'protein', label: 'Protéines (g)', short: 'Protéines', completeOnly: true },
    { key: 'carbs', label: 'Glucides (g)', short: 'Glucides', completeOnly: true },
    { key: 'sodium', label: 'Sodium (mg)', short: 'Sodium', completeOnly: true },
    { key: 'tdee', label: 'Dépense (kcal)', short: 'Dépense' },
    { key: 'steps', label: 'Pas', short: 'Pas' },
    { key: 'activeMin', label: 'Minutes actives', short: 'Actif' },
    { key: 'sleepMin', label: 'Sommeil (min)', short: 'Sommeil' },
    { key: 'sleepScore', label: 'Score de sommeil', short: 'Score sommeil' },
    { key: 'stressAvg', label: 'Stress moyen', short: 'Stress' },
    { key: 'hrRest', label: 'FC de repos', short: 'FC repos' },
  ];

  const TARGET = { key: 'nextWeightDelta', label: 'Variation de poids le lendemain (kg)', short: 'Δ poids J+1' };

  function pearson(pairs) {
    const n = pairs.length;
    if (n < 3) return null;
    let sx = 0;
    let sy = 0;
    pairs.forEach(([x, y]) => {
      sx += x;
      sy += y;
    });
    const mx = sx / n;
    const my = sy / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    pairs.forEach(([x, y]) => {
      sxy += (x - mx) * (y - my);
      sxx += (x - mx) ** 2;
      syy += (y - my) ** 2;
    });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }

  function valueOf(day, v) {
    if (v.completeOnly && day.logStatus !== 'complete') return null;
    if (day.partial && v.key !== 'sleepMin' && v.key !== 'sleepScore') return null;
    return isFiniteNumber(day[v.key]) ? day[v.key] : null;
  }

  /** Ajoute la variation de poids du lendemain à chaque jour. */
  function withNextDelta(days) {
    const byKey = new Map(days.map((d) => [d.key, d]));
    return days.map((d) => {
      const next = byKey.get(dayKey(new Date(d.date.getTime() + DAY_MS * 1.5)));
      const delta = next && isFiniteNumber(next.weight) && isFiniteNumber(d.weight) ? next.weight - d.weight : null;
      return { ...d, nextWeightDelta: delta };
    });
  }

  function analyze(days) {
    const rows = withNextDelta(days);
    const vars = VARIABLES.filter((v) => rows.filter((d) => valueOf(d, v) !== null).length >= MIN_N);
    if (!vars.length) return null;
    const all = [...vars, TARGET];
    const get = (d, v) => (v === TARGET ? (isFiniteNumber(d.nextWeightDelta) ? d.nextWeightDelta : null) : valueOf(d, v));

    const cell = (a, b) => {
      const pairs = rows.map((d) => [get(d, a), get(d, b)]).filter(([x, y]) => x !== null && y !== null);
      const r = pairs.length >= MIN_N ? pearson(pairs) : null;
      return { r, n: pairs.length, pairs };
    };

    const matrix = vars.map((a) => all.map((b) => (a === b ? { r: 1, n: null, pairs: [] } : cell(a, b))));
    const withWeight = vars
      .map((v, i) => ({ variable: v, ...matrix[i][all.length - 1] }))
      .filter((c) => isFiniteNumber(c.r))
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    return { vars, columns: all, matrix, withWeight, minN: MIN_N, target: TARGET };
  }

  /** Lecture qualitative d'un coefficient. */
  function strength(r) {
    const a = Math.abs(r);
    if (a < 0.1) return 'aucun lien';
    if (a < 0.3) return 'lien faible';
    if (a < 0.5) return 'lien modéré';
    return 'lien fort';
  }

  SP.analysis.lifestyle.correlations = { analyze, pearson, strength, VARIABLES, TARGET, MIN_N };
})(window.SP);
