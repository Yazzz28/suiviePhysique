/**
 * État applicatif — UNIQUEMENT en mémoire.
 * Aucune persistance (pas de localStorage / sessionStorage / IndexedDB / cache) :
 * un rechargement de la page remet tout à zéro.
 */
(function (SP) {
  'use strict';

  const { DAY_MS } = SP.core.utils;

  const PERIODS = {
    all: { label: 'Tout', days: null },
    90: { label: '90 j', days: 90 },
    30: { label: '30 j', days: 30 },
    14: { label: '14 j', days: 14 },
    7: { label: '7 j', days: 7 },
  };

  const initial = () => ({
    composition: [], // pesées, triées par date croissante
    measurements: [], // mensurations, triées par date croissante
    files: [], // { name, type, count, error }
    period: 'all',
    settings: {
      heightCm: null, // déduite de l'IMC, modifiable
      targetWeight: null,
      sex: 'male',
      excludeOutliers: true, // exclure les mensurations douteuses des graphiques
    },
  });

  let state = initial();

  function filterByPeriod(records, period, referenceDate) {
    const days = PERIODS[period] && PERIODS[period].days;
    if (!days || !referenceDate) return records;
    const from = referenceDate.getTime() - (days - 1) * DAY_MS;
    const fromDay = new Date(from);
    fromDay.setHours(0, 0, 0, 0);
    return records.filter((r) => r.date >= fromDay);
  }

  /** Date la plus récente toutes sources confondues : référence des filtres. */
  function latestDate() {
    const dates = [...state.composition, ...state.measurements].map((r) => r.date.getTime());
    return dates.length ? new Date(Math.max(...dates)) : null;
  }

  SP.core.state = {
    PERIODS,

    get() {
      return state;
    },

    reset() {
      state = initial();
      SP.bus.emit('state:reset');
    },

    setData({ composition, measurements, files }) {
      state.composition = composition || [];
      state.measurements = measurements || [];
      state.files = files || [];
      SP.bus.emit('state:data');
    },

    setPeriod(period) {
      if (!PERIODS[period] || period === state.period) return;
      state.period = period;
      SP.bus.emit('state:period', period);
    },

    setSetting(key, value, { silent = false } = {}) {
      state.settings[key] = value;
      if (!silent) SP.bus.emit('state:settings', { key, value });
    },

    /** Données filtrées selon la période active. */
    view() {
      const ref = latestDate();
      return {
        composition: filterByPeriod(state.composition, state.period, ref),
        measurements: filterByPeriod(state.measurements, state.period, ref),
        allComposition: state.composition,
        allMeasurements: state.measurements,
        settings: state.settings,
        period: state.period,
      };
    },
  };
})(window.SP);
