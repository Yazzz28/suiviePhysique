/**
 * « D'où vient ta variation d'aujourd'hui » : régression ridge de la variation
 * de poids J → J+1 sur ce qui s'est passé le jour J (glucides, sodium, apport,
 * pas, sommeil), en écart à ta moyenne.
 *
 * La qualité est mesurée par validation croisée « leave-one-out » : chaque jour
 * est prédit par un modèle entraîné sans lui. Si ce R² est trop faible ou s'il
 * y a trop peu de jours, le modèle n'est pas affiché : mieux vaut ne rien dire
 * que d'inventer une explication.
 */
(function (SP) {
  'use strict';

  const { mean, stdDev, isFiniteNumber, solveLinear, dayKey, DAY_MS } = SP.core.utils;

  const MIN_N = 20;
  const MIN_R2 = 0.05;
  const LAMBDA = 2; // régularisation (variables standardisées)

  const FEATURES = [
    { key: 'carbs', label: 'Glucides', unit: 'g' },
    { key: 'sodium', label: 'Sodium', unit: 'mg' },
    { key: 'kcalIn', label: 'Apport', unit: 'kcal' },
    { key: 'steps', label: 'Pas', unit: 'pas' },
    { key: 'sleepMin', label: 'Sommeil', unit: 'min' },
  ];

  /** Ajuste β (variables centrées-réduites) : (XᵀX + λI) β = Xᵀy. */
  function fit(X, y) {
    const p = X[0].length;
    const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? LAMBDA : 0)));
    const b = new Array(p).fill(0);
    X.forEach((row, r) => {
      for (let i = 0; i < p; i++) {
        b[i] += row[i] * y[r];
        for (let j = 0; j < p; j++) A[i][j] += row[i] * row[j];
      }
    });
    return solveLinear(A, b);
  }

  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

  /**
   * @param {object[]} days  table journalière (jours classés, poids du jour)
   */
  function analyze(days) {
    const byKey = new Map(days.map((d) => [d.key, d]));
    const rows = [];
    days.forEach((d) => {
      if (d.partial || d.logStatus !== 'complete' || !isFiniteNumber(d.weight)) return;
      const next = byKey.get(dayKey(new Date(d.date.getTime() + 1.5 * DAY_MS)));
      if (!next || !isFiniteNumber(next.weight)) return;
      rows.push({ day: d, y: next.weight - d.weight });
    });
    // Variables disponibles sur au moins 80 % des jours exploitables
    const features = FEATURES.filter((f) => rows.filter((r) => isFiniteNumber(r.day[f.key])).length >= rows.length * 0.8);
    const usable = rows.filter((r) => features.every((f) => isFiniteNumber(r.day[f.key])));
    const n = usable.length;
    if (n < MIN_N || !features.length) return { n, enough: false, minN: MIN_N };

    const stats = features.map((f) => {
      const v = usable.map((r) => r.day[f.key]);
      return { mean: mean(v), sd: stdDev(v) || 1 };
    });
    const z = (day) => features.map((f, i) => (day[f.key] - stats[i].mean) / stats[i].sd);
    const X = usable.map((r) => z(r.day));
    const yMean = mean(usable.map((r) => r.y));
    const y = usable.map((r) => r.y - yMean);

    const beta = fit(X, y);
    if (!beta) return { n, enough: false, minN: MIN_N };

    // Validation croisée leave-one-out
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      const Xi = X.filter((_, k) => k !== i);
      const yi = usable.filter((_, k) => k !== i).map((r) => r.y);
      const mi = mean(yi);
      const bi = fit(Xi, yi.map((v) => v - mi));
      if (!bi) continue;
      const pred = mi + dot(bi, X[i]);
      ssRes += (usable[i].y - pred) ** 2;
      ssTot += (usable[i].y - yMean) ** 2;
    }
    const r2loo = ssTot ? 1 - ssRes / ssTot : 0;

    // Contributions pour le dernier jour exploitable : hier → pesée d'aujourd'hui
    const lastRow = usable[usable.length - 1];
    const zLast = z(lastRow.day);
    const contributions = features
      .map((f, i) => ({
        ...f,
        value: lastRow.day[f.key],
        average: stats[i].mean,
        kg: beta[i] * zLast[i],
      }))
      .sort((a, b) => Math.abs(b.kg) - Math.abs(a.kg));

    return {
      n,
      enough: r2loo >= MIN_R2,
      minN: MIN_N,
      r2loo,
      features: features.map((f, i) => ({ ...f, kgPerSd: beta[i], sd: stats[i].sd })),
      latest: {
        date: lastRow.day.date,
        nextDate: new Date(lastRow.day.date.getTime() + DAY_MS),
        actual: lastRow.y,
        predicted: yMean + dot(beta, zLast),
        baseline: yMean,
        contributions,
      },
    };
  }

  SP.analysis.lifestyle.fluctuation = { analyze, MIN_N, MIN_R2 };
})(window.SP);
