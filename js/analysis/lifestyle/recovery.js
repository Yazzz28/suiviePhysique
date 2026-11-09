/**
 * Forme et récupération :
 * - efficacité cardio : vitesse de marche rapportée à l'effort cardiaque
 *   (FC moyenne − FC de repos). Si elle monte, tu marches aussi vite pour
 *   un cœur moins sollicité : ta forme progresse.
 * - score de récupération (0-100) : VFC, FC de repos et sommeil du jour
 *   comparés à ta propre moyenne des 30 jours précédents.
 * - nuits atypiques : FC de repos nettement au-dessus de ta normale avec
 *   température cutanée ou respiration elles aussi en hausse. Signal de
 *   fatigue, d'alcool, de maladie ou de stress possible, jamais un diagnostic.
 */
(function (SP) {
  'use strict';

  const { mean, stdDev, isFiniteNumber, linearRegression, dayKey, DAY_MS } = SP.core.utils;

  const BASELINE_DAYS = 30;
  const MIN_BASELINE = 7;
  const WALK_TYPE = 1001;
  const MIN_WALK_MIN = 10;

  const COMPONENTS = [
    { key: 'sleepHrv', label: 'Variabilité cardiaque', sign: 1 },
    { key: 'hrRest', label: 'FC de repos', sign: -1 },
    { key: 'sleepMin', label: 'Durée de sommeil', sign: 1 },
    { key: 'sleepScore', label: 'Score de sommeil', sign: 1 },
  ];

  /** Moyenne et écart-type des `BASELINE_DAYS` jours précédant l'index i. */
  function baseline(series, i, key) {
    const from = series[i].date.getTime() - BASELINE_DAYS * DAY_MS;
    const values = [];
    for (let j = i - 1; j >= 0 && series[j].date.getTime() >= from; j--) {
      if (isFiniteNumber(series[j][key])) values.push(series[j][key]);
    }
    if (values.length < MIN_BASELINE) return null;
    return { mean: mean(values), sd: Math.max(stdDev(values) || 0, 1e-6) };
  }

  const clampZ = (z) => Math.max(-2.5, Math.min(2.5, z));

  function recoveryScores(allDays) {
    const out = [];
    allDays.forEach((d, i) => {
      const parts = [];
      COMPONENTS.forEach((c) => {
        if (!isFiniteNumber(d[c.key])) return;
        const b = baseline(allDays, i, c.key);
        if (!b) return;
        parts.push({ ...c, z: clampZ(((d[c.key] - b.mean) / b.sd) * c.sign), value: d[c.key], usual: b.mean });
      });
      if (parts.length < 2) return;
      const score = Math.max(0, Math.min(100, 50 + 15 * mean(parts.map((p) => p.z))));
      out.push({ date: d.date, score, parts });
    });
    return out;
  }

  /** Mesures nocturnes rattachées au jour du réveil (début de mesure le soir). */
  function byWakeDay(list) {
    const map = new Map();
    (list || []).forEach((p) => map.set(dayKey(new Date(p.date.getTime() + 12 * 3600 * 1000)), p.value));
    return map;
  }

  function atypicalNights(allDays, vitals) {
    const temp = byWakeDay(vitals.skinTemp);
    const resp = byWakeDay(vitals.respiration);
    const series = allDays.map((d) => ({ date: d.date, key: d.key, hrRest: d.hrRest, temp: temp.get(d.key), resp: resp.get(d.key) }));
    const out = [];
    series.forEach((d, i) => {
      if (!isFiniteNumber(d.hrRest)) return;
      const b = baseline(series, i, 'hrRest');
      if (!b) return;
      const zHr = (d.hrRest - b.mean) / b.sd;
      if (zHr <= 1.5) return;
      const signs = [`FC de repos ${Math.round(d.hrRest)} bpm (normale ${Math.round(b.mean)})`];
      ['temp', 'resp'].forEach((k) => {
        if (!isFiniteNumber(d[k])) return;
        const bk = baseline(series, i, k);
        if (bk && (d[k] - bk.mean) / bk.sd > 1) {
          signs.push(k === 'temp' ? `température cutanée +${(d[k] - bk.mean).toFixed(1)} °C` : `respiration +${(d[k] - bk.mean).toFixed(1)}/min`);
        }
      });
      if (signs.length >= 2) out.push({ date: d.date, signs });
    });
    return out;
  }

  /** Marches : vitesse (km/h) pour 10 bpm au-dessus de la FC de repos. */
  function cardioEfficiency(sessions, allDays) {
    const restByDay = new Map(allDays.filter((d) => isFiniteNumber(d.hrRest)).map((d) => [d.key, d.hrRest]));
    const restMean = mean([...restByDay.values()]);
    const pts = (sessions || [])
      .filter((s) => s.type === WALK_TYPE && s.durationMin >= MIN_WALK_MIN && isFiniteNumber(s.meanSpeed) && isFiniteNumber(s.meanHr))
      .map((s) => {
        const rest = restByDay.get(dayKey(s.date)) || restMean;
        const effort = s.meanHr - rest;
        return isFiniteNumber(rest) && effort > 5 ? { date: s.date, value: ((s.meanSpeed * 3.6) / effort) * 10, speed: s.meanSpeed * 3.6, hr: s.meanHr } : null;
      })
      .filter(Boolean);
    if (pts.length < 5) return null;
    const t0 = pts[0].date.getTime();
    const reg = linearRegression(pts.map((p) => ({ x: (p.date.getTime() - t0) / DAY_MS, y: p.value })));
    const m = mean(pts.map((p) => p.value));
    return { points: pts, mean: m, changePerMonthPct: reg && m ? ((reg.slope * 30) / m) * 100 : null, n: pts.length };
  }

  /**
   * @param {object[]} allDays   table journalière de tout l'historique
   * @param {object} p           { sessions, vitals, range }
   */
  function analyze(allDays, { sessions, vitals, range }) {
    const scores = recoveryScores(allDays);
    const inRange = (d) => d.date >= range.from && d.date <= range.to;
    return {
      scores: scores.filter(inRange),
      today: scores.length ? scores[scores.length - 1] : null,
      atypical: atypicalNights(allDays, vitals).filter(inRange),
      efficiency: cardioEfficiency((sessions || []).filter(inRange), allDays),
    };
  }

  SP.analysis.lifestyle.recovery = { analyze, COMPONENTS };
})(window.SP);
