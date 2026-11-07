/**
 * « Lecture du jour » : interprète la dernière pesée par rapport à la tendance.
 *
 * - Tendance : régression sur les 21 jours précédents, SANS la pesée du jour
 *   (sinon elle tirerait la tendance vers elle), évaluée à la date du jour.
 *   Une moyenne glissante, elle, serait en retard sur une perte régulière.
 * - Fluctuation normale : écart-type des pesées autour de cette tendance.
 * - Pas de « signal d'eau » : le % et la masse d'eau de la balance sont en
 *   grande partie calculés à partir du poids lui-même ; ils suivent donc
 *   mécaniquement la pesée et ne permettent pas de détecter une rétention.
 */
(function (SP) {
  'use strict';

  const { linearRegression, stdDev, isFiniteNumber, daysBetween, startOfDay, DAY_MS } = SP.core.utils;

  const WINDOW_DAYS = 21;
  const MIN_POINTS = 7;

  function read(daily) {
    const rows = daily.filter((d) => isFiniteNumber(d.weight));
    if (rows.length < MIN_POINTS + 1) return null;
    const today = rows[rows.length - 1];
    const from = startOfDay(today.date).getTime() - WINDOW_DAYS * DAY_MS;
    const history = rows.slice(0, -1).filter((d) => d.date.getTime() >= from);
    if (history.length < MIN_POINTS) return null;

    const t0 = history[0].date.getTime();
    const x = (date) => (date.getTime() - t0) / DAY_MS;
    const reg = linearRegression(history.map((d) => ({ x: x(d.date), y: d.weight })));
    if (!reg) return null;
    const trendAt = (date) => reg.intercept + reg.slope * x(date);

    const residuals = history.map((d) => d.weight - trendAt(d.date));
    const sd = Math.max(0.2, stdDev(residuals) || 0); // plancher : précision de la balance
    const trend = trendAt(today.date);
    const deviation = today.weight - trend;
    const z = deviation / sd;

    const previous = rows[rows.length - 2];
    const tomorrow = new Date(today.date.getTime() + DAY_MS);
    const tomorrowTrend = trendAt(tomorrow);

    let level = 'normal';
    if (Math.abs(z) > 2) level = 'strong';
    else if (Math.abs(z) > 1) level = 'notable';

    return {
      date: today.date,
      weight: today.weight,
      trend,
      deviation,
      sd,
      z,
      level,
      direction: deviation < 0 ? 'below' : 'above',
      slopePerWeek: reg.slope * 7,
      previous: previous ? { weight: previous.weight, date: previous.date, gap: daysBetween(previous.date, today.date) } : null,
      tomorrow: { date: tomorrow, low: tomorrowTrend - sd, high: tomorrowTrend + sd, trend: tomorrowTrend },
      windowDays: WINDOW_DAYS,
    };
  }

  SP.analysis.dailyReading = { read };
})(window.SP);
