/**
 * Semaine type : bilan énergétique moyen par jour de semaine et coût du
 * week-end (samedi + dimanche) en jours de déficit de semaine.
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber } = SP.core.utils;
  const { trends } = SP.analysis;

  /**
   * @param {object[]} energyDays  jours classés par energy.analyze (balance)
   * @param {object[]} daily       pesées journalières (hausse du lundi)
   */
  function analyze(energyDays, daily) {
    const days = energyDays.filter((d) => d.logStatus === 'complete' && isFiniteNumber(d.balance));
    if (days.length < 7) return null;
    const byWeekday = Array.from({ length: 7 }, (_, i) => {
      const list = days.filter((d) => (d.date.getDay() + 6) % 7 === i);
      return { index: i, balance: mean(list.map((d) => d.balance)), intake: mean(list.map((d) => d.kcalIn)), n: list.length };
    });
    const week = days.filter((d) => ![0, 6].includes(d.date.getDay()));
    const weekend = days.filter((d) => [0, 6].includes(d.date.getDay()));
    const wk = mean(week.map((d) => d.balance));
    const we = mean(weekend.map((d) => d.balance));
    // Jours de déficit de semaine « effacés » par les 2 jours de week-end
    const erased = isFiniteNumber(wk) && isFiniteNumber(we) && wk < 0 && we > wk ? (2 * (we - wk)) / -wk : null;
    const effect = trends.weekdayEffect(trends.dayOverDay(daily || [], 'weight'));
    return {
      byWeekday,
      weekBalance: wk,
      weekendBalance: we,
      weekIntake: mean(week.map((d) => d.kcalIn)),
      weekendIntake: mean(weekend.map((d) => d.kcalIn)),
      nWeek: week.length,
      nWeekend: weekend.length,
      erasedDays: erased,
      mondayDelta: effect[0] && effect[0].count >= 3 ? effect[0].avg : null,
      mondayCount: effect[0] ? effect[0].count : 0,
    };
  }

  SP.analysis.lifestyle.weekPattern = { analyze };
})(window.SP);
