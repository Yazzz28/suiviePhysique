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
    lifestyle: null, // tables de l'export Samsung Health (nutrition, activité, sommeil...)
    fallbackComposition: [], // pesées de l'export santé, utilisées sans fichier de pesées
    files: [], // { name, type, count, error }
    period: 'all',
    settings: {
      heightCm: null, // déduite de l'IMC, modifiable
      targetWeight: null,
      sex: 'male',
      excludeOutliers: true, // exclure les mensurations douteuses des graphiques
      includeIncompleteMeals: true, // intégrer les jours de saisie de repas probablement incomplète
      targetDate: null, // date visée pour l'objectif de poids (budget calorique)
      plannedIntake: null, // apport prévu (kcal/j) : scénario de projection
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

  /** Pesées affichées : le fichier de pesées prime, sinon celles de l'export santé. */
  function composition() {
    return state.composition.length ? state.composition : state.fallbackComposition;
  }

  /** Date la plus récente toutes sources confondues : référence des filtres. */
  function latestDate() {
    const dates = [...composition(), ...state.measurements].map((r) => r.date.getTime());
    const lifestyleLatest = state.lifestyle && SP.analysis.lifestyle.latestDate(state.lifestyle);
    if (lifestyleLatest) dates.push(lifestyleLatest.getTime());
    return dates.length ? new Date(Math.max(...dates)) : null;
  }

  /**
   * Bornes de la période pour les données « mode de vie ». « Tout » démarre à
   * la première pesée (début du suivi), sinon aux 90 derniers jours de l'export.
   */
  function lifestyleRange(period, ref) {
    if (!state.lifestyle || !ref) return null;
    const to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59);
    const days = PERIODS[period] && PERIODS[period].days;
    const comp = composition();
    let from;
    if (days) from = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - (days - 1));
    else if (comp.length) from = new Date(comp[0].date.getFullYear(), comp[0].date.getMonth(), comp[0].date.getDate());
    else from = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 89);
    return { from, to };
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

    setData({ composition, measurements, lifestyle, fallbackComposition, files }) {
      state.composition = composition || [];
      state.measurements = measurements || [];
      state.lifestyle = lifestyle || null;
      state.fallbackComposition = fallbackComposition || [];
      state.files = files || [];
      SP.bus.emit('state:data');
    },

    hasData() {
      return composition().length > 0 || state.measurements.length > 0 || !!state.lifestyle;
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
      const comp = composition();
      return {
        composition: filterByPeriod(comp, state.period, ref),
        measurements: filterByPeriod(state.measurements, state.period, ref),
        compositionSource: state.composition.length ? 'file' : comp.length ? 'export' : null,
        lifestyle: state.lifestyle,
        lifestyleRange: lifestyleRange(state.period, ref),
        allComposition: comp,
        allMeasurements: state.measurements,
        settings: state.settings,
        period: state.period,
      };
    },
  };
})(window.SP);
