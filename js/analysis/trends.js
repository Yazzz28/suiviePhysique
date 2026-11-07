/**
 * Tendances temporelles : régression, rythme, projection, regroupements
 * hebdomadaires, régularité des pesées, effet jour de la semaine.
 */
(function (SP) {
  'use strict';

  const { DAY_MS, linearRegression, mean, stdDev, isFiniteNumber, weekStart, daysBetween, dayKey, startOfDay } =
    SP.core.utils;

  /**
   * Régression linéaire de `key` en fonction du temps (jours).
   * Retourne { slopePerDay, slopePerWeek, r2, at(date) }.
   */
  function trend(records, key) {
    const pts = records.filter((r) => isFiniteNumber(r[key]));
    if (pts.length < 2) return null;
    const t0 = pts[0].date.getTime();
    const reg = linearRegression(pts.map((r) => ({ x: (r.date.getTime() - t0) / DAY_MS, y: r[key] })));
    if (!reg) return null;
    return {
      slopePerDay: reg.slope,
      slopePerWeek: reg.slope * 7,
      r2: reg.r2,
      t0,
      at: (date) => reg.intercept + reg.slope * ((date.getTime() - t0) / DAY_MS),
    };
  }

  /** Tendance sur les N derniers jours seulement. */
  function recentTrend(records, key, days) {
    if (!records.length) return null;
    const lastDate = records[records.length - 1].date;
    const from = startOfDay(lastDate).getTime() - (days - 1) * DAY_MS;
    return trend(records.filter((r) => r.date.getTime() >= from), key);
  }

  /** Date estimée d'atteinte d'une cible selon la tendance. */
  function projectTarget(tr, currentDate, target) {
    if (!tr || !isFiniteNumber(target) || tr.slopePerDay === 0) return null;
    const current = tr.at(currentDate);
    const days = (target - current) / tr.slopePerDay;
    if (days < 0 || !Number.isFinite(days) || days > 3650) return null;
    return { date: new Date(currentDate.getTime() + days * DAY_MS), days };
  }

  /** Moyennes par semaine (lundi) et variation vs semaine précédente. */
  function weekly(records, key) {
    const groups = new Map();
    records.forEach((r) => {
      if (!isFiniteNumber(r[key])) return;
      const ws = weekStart(r.date);
      const k = ws.getTime();
      if (!groups.has(k)) groups.set(k, { week: ws, values: [] });
      groups.get(k).values.push(r[key]);
    });
    const list = [...groups.values()].sort((a, b) => a.week - b.week);
    return list.map((g, i) => {
      const avg = mean(g.values);
      const prev = i > 0 ? mean(list[i - 1].values) : null;
      return { week: g.week, avg, count: g.values.length, delta: prev === null ? null : avg - prev };
    });
  }

  /** Variation jour après jour (uniquement entre jours consécutifs). */
  function dayOverDay(daily, key) {
    const out = [];
    for (let i = 1; i < daily.length; i++) {
      const a = daily[i - 1];
      const b = daily[i];
      if (!isFiniteNumber(a[key]) || !isFiniteNumber(b[key])) continue;
      const gap = daysBetween(a.date, b.date);
      out.push({ date: b.date, delta: b[key] - a[key], gap, perDay: (b[key] - a[key]) / gap });
    }
    return out;
  }

  function extremes(records, key) {
    const pts = records.filter((r) => isFiniteNumber(r[key]));
    if (!pts.length) return null;
    let min = pts[0];
    let max = pts[0];
    pts.forEach((r) => {
      if (r[key] < min[key]) min = r;
      if (r[key] > max[key]) max = r;
    });
    return { min, max };
  }

  /** Régularité : jours pesés, taux d'assiduité, plus longue série. */
  function adherence(daily) {
    if (!daily.length) return null;
    const span = daysBetween(daily[0].date, daily[daily.length - 1].date) + 1;
    const keys = new Set(daily.map((d) => dayKey(d.date)));
    let best = 0;
    let current = 0;
    let currentEnd = 0;
    const cursor = startOfDay(daily[0].date);
    for (let i = 0; i < span; i++) {
      if (keys.has(dayKey(cursor))) {
        current++;
        best = Math.max(best, current);
        currentEnd = current;
      } else {
        current = 0;
        currentEnd = 0;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return { days: keys.size, span, rate: keys.size / span, bestStreak: best, currentStreak: currentEnd };
  }

  /** Variation moyenne selon le jour de la semaine (Lun..Dim). */
  function weekdayEffect(dod) {
    const buckets = Array.from({ length: 7 }, () => []);
    dod.filter((d) => d.gap === 1).forEach((d) => buckets[(d.date.getDay() + 6) % 7].push(d.delta));
    return buckets.map((values) => ({ avg: mean(values), count: values.length }));
  }

  /** Volatilité : écart-type des variations quotidiennes. */
  function volatility(dod) {
    return stdDev(dod.filter((d) => d.gap === 1).map((d) => d.delta));
  }

  SP.analysis.trends = {
    trend,
    recentTrend,
    projectTarget,
    weekly,
    dayOverDay,
    extremes,
    adherence,
    weekdayEffect,
    volatility,
  };
})(window.SP);
