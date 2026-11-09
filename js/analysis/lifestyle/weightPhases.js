/**
 * Cycles de poids sur tout l'historique : phases de perte et de reprise.
 *
 * Les pesées (toutes sources) sont moyennées par semaine, puis découpées par
 * un algorithme « zigzag » : un sommet ou un creux n'est retenu que si le
 * poids repart ensuite dans l'autre sens d'au moins `THRESHOLD_KG`. Un trou de
 * plus de `MAX_GAP_DAYS` sans pesée coupe la série (on ne relie pas deux
 * périodes sans savoir ce qui s'est passé entre les deux).
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber, weekStart, dayKey, DAY_MS } = SP.core.utils;

  const THRESHOLD_KG = 4;
  const MAX_GAP_DAYS = 120;
  const REGAIN_SHARE = 0.5; // délai pour reprendre la moitié du poids perdu

  /** Moyennes hebdomadaires triées. */
  function weekly(weights) {
    const map = new Map();
    weights.forEach((w) => {
      if (!isFiniteNumber(w.weight)) return;
      const k = dayKey(weekStart(w.date));
      if (!map.has(k)) map.set(k, { date: weekStart(w.date), values: [] });
      map.get(k).values.push(w.weight);
    });
    return [...map.values()].sort((a, b) => a.date - b.date).map((g) => ({ date: g.date, weight: mean(g.values) }));
  }

  /** Coupe la série aux trous de plus de MAX_GAP_DAYS. */
  function segments(points) {
    const out = [];
    let cur = [];
    points.forEach((p, i) => {
      if (i && (p.date - points[i - 1].date) / DAY_MS > MAX_GAP_DAYS) {
        out.push(cur);
        cur = [];
      }
      cur.push(p);
    });
    if (cur.length) out.push(cur);
    return out;
  }

  /**
   * Points de retournement (zigzag) d'un segment : un extrême est confirmé
   * quand le poids repart dans l'autre sens d'au moins THRESHOLD_KG.
   */
  function pivots(seg) {
    if (seg.length < 2) return [];
    const out = [seg[0]];
    let dir = 0; // 1 = montée, -1 = descente, 0 = pas encore de tendance
    let hi = seg[0];
    let lo = seg[0];
    let ext = seg[0];
    for (let i = 1; i < seg.length; i++) {
      const p = seg[i];
      if (dir === 0) {
        if (p.weight > hi.weight) hi = p;
        if (p.weight < lo.weight) lo = p;
        if (p.weight - lo.weight >= THRESHOLD_KG) {
          out[0] = lo;
          dir = 1;
          ext = p;
        } else if (hi.weight - p.weight >= THRESHOLD_KG) {
          out[0] = hi;
          dir = -1;
          ext = p;
        }
      } else if (dir === 1) {
        if (p.weight >= ext.weight) ext = p;
        else if (ext.weight - p.weight >= THRESHOLD_KG) {
          out.push(ext);
          dir = -1;
          ext = p;
        }
      } else if (p.weight <= ext.weight) ext = p;
      else if (p.weight - ext.weight >= THRESHOLD_KG) {
        out.push(ext);
        dir = 1;
        ext = p;
      }
    }
    if (out[out.length - 1] !== ext) out.push(ext);
    const last = seg[seg.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }

  function phaseFrom(a, b, ongoing, stepsByWeek) {
    const kg = b.weight - a.weight;
    const weeks = Math.max(1, (b.date - a.date) / (7 * DAY_MS));
    const steps = [];
    stepsByWeek.forEach((v, k) => {
      const t = new Date(k).getTime();
      if (t >= a.date.getTime() && t <= b.date.getTime()) steps.push(v);
    });
    return {
      type: kg < 0 ? 'loss' : 'gain',
      start: a,
      end: b,
      kg,
      weeks,
      ratePerWeek: kg / weeks,
      stepsMean: steps.length ? mean(steps) : null,
      ongoing,
    };
  }

  /**
   * @param {object[]} weights  toutes les pesées { date, weight }
   * @param {object[]} allDays  table journalière de tout l'historique (pas)
   */
  function analyze(weights, allDays = []) {
    const points = weekly(weights);
    if (points.length < 4) return null;
    const stepsByWeek = new Map();
    const stepLists = new Map();
    allDays.forEach((d) => {
      if (!isFiniteNumber(d.steps) || d.partial) return;
      const k = weekStart(d.date).getTime();
      if (!stepLists.has(k)) stepLists.set(k, []);
      stepLists.get(k).push(d.steps);
    });
    stepLists.forEach((v, k) => stepsByWeek.set(k, mean(v)));

    const segs = segments(points);
    const phases = [];
    segs.forEach((seg, si) => {
      const pv = pivots(seg);
      for (let i = 1; i < pv.length; i++) {
        const ongoing = si === segs.length - 1 && i === pv.length - 1;
        const ph = phaseFrom(pv[i - 1], pv[i], ongoing, stepsByWeek);
        // Variation trop faible pour une phase (fin de segment) : ignorée sauf phase en cours
        if (Math.abs(ph.kg) >= THRESHOLD_KG || ongoing) phases.push(ph);
      }
    });

    // Délai de reprise : après chaque perte terminée, première semaine où la moitié du poids perdu est revenue
    phases.forEach((ph) => {
      if (ph.type !== 'loss' || ph.ongoing) return;
      const level = ph.end.weight + REGAIN_SHARE * -ph.kg;
      const back = points.find((p) => p.date > ph.end.date && p.weight >= level);
      ph.regainHalfWeeks = back ? (back.date - ph.end.date) / (7 * DAY_MS) : null;
    });

    const current = phases.length ? phases[phases.length - 1] : null;
    const pastLosses = phases.filter((p) => p.type === 'loss' && !p.ongoing);
    const comparison =
      current && current.type === 'loss' && pastLosses.length
        ? {
            pastCount: pastLosses.length,
            pastRate: mean(pastLosses.map((p) => p.ratePerWeek)),
            pastWeeks: mean(pastLosses.map((p) => p.weeks)),
            pastKg: mean(pastLosses.map((p) => p.kg)),
            pastRegainWeeks: mean(pastLosses.map((p) => p.regainHalfWeeks).filter(isFiniteNumber)),
            regained: pastLosses.filter((p) => isFiniteNumber(p.regainHalfWeeks)).length,
            pastSteps: mean(pastLosses.map((p) => p.stepsMean).filter(isFiniteNumber)),
          }
        : null;

    return { points, phases, current, comparison, threshold: THRESHOLD_KG };
  }

  SP.analysis.lifestyle.weightPhases = { analyze, THRESHOLD_KG };
})(window.SP);
