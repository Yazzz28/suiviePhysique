/**
 * Registre (liste blanche) des tables Samsung Health exploitées.
 *
 * Seuls les fichiers dont la table figure ici sont lus. Tous les autres
 * (contacts du classement social, badges, préférences, etc.) ne sont jamais
 * ouverts. Chaque adaptateur transforme les lignes en enregistrements simples.
 */
(function (SP) {
  'use strict';

  const SHEALTH_APP = 'com.sec.android.app.shealth';
  const positive = (v) => (v !== null && v > 0 ? v : null);
  const msToMin = (v) => (v === null ? null : v / 60000);

  /**
   * Codes d'exercice connus : documentation Samsung (marche, course, vélo,
   * randonnée, natation) et séances identifiées par l'utilisateur (judo,
   * tennis de table). Les autres codes, dont 0 (personnalisé), sont « Indéterminé ».
   */
  const EXERCISE_TYPES = {
    1001: 'Marche',
    1002: 'Course',
    6004: 'Tennis de table',
    7003: 'Judo',
    11007: 'Vélo',
    13001: 'Randonnée',
    14001: 'Natation',
  };

  function exerciseLabel(code) {
    return EXERCISE_TYPES[code] || 'Indéterminé';
  }

  const MEAL_TYPES = {
    100001: 'Petit-déjeuner',
    100002: 'Déjeuner',
    100003: 'Dîner',
    100004: 'Collation matin',
    100005: 'Collation après-midi',
    100006: 'Collation soir',
  };

  const SLEEP_STAGES = { 40001: 'awake', 40002: 'light', 40003: 'deep', 40004: 'rem' };

  /** Mesure ponctuelle { date, value } à partir d'une colonne. */
  const point = (timeCol, valueCol, isDay = false) => (r) => {
    const date = isDay ? r.day(timeCol) : r.time(timeCol);
    const value = positive(r.num(valueCol)); // 0 = mesure échouée
    return date && value !== null ? { date, value } : null;
  };

  const SOURCES = [
    {
      table: 'com.samsung.health.weight',
      key: 'weights',
      label: 'Pesées',
      adapt: (r) => {
        const date = r.time('start_time');
        const weight = positive(r.num('weight'));
        if (!date || !weight) return null;
        const fatKg = r.num('body_fat_mass');
        const skeletalKg = r.num('skeletal_muscle_mass');
        const fromApp = r.str('pkg_name') === SHEALTH_APP;
        return {
          date,
          weight,
          fatPct: positive(r.num('body_fat')),
          fatKg: positive(fatKg),
          leanKg: positive(r.num('fat_free_mass')),
          skeletalKg: positive(skeletalKg),
          waterKg: positive(r.num('total_body_water')),
          bmr: positive(r.num('basal_metabolic_rate')),
          heightCm: positive(r.num('height')),
          // scale = balance ou app connectée ; watch = mesure d'impédance de la montre ; manual = saisie
          source: fromApp ? (fatKg !== null || skeletalKg !== null ? 'watch' : 'manual') : 'scale',
        };
      },
    },
    {
      table: 'com.samsung.health.height',
      key: 'heights',
      label: 'Taille',
      adapt: point('start_time', 'height'),
    },
    {
      table: 'com.samsung.health.nutrition',
      key: 'meals',
      label: 'Repas (nutriments)',
      adapt: (r) => {
        const date = r.time('start_time');
        const kcal = r.num('calorie');
        if (!date || kcal === null) return null;
        return {
          date,
          mealType: r.num('meal_type'),
          title: r.str('title'),
          kcal,
          protein: r.num('protein'),
          carbs: r.num('carbohydrate'),
          fat: r.num('total_fat'),
          satFat: r.num('saturated_fat'),
          sugar: r.num('sugar'),
          fiber: r.num('dietary_fiber'),
          sodium: r.num('sodium'),
        };
      },
    },
    {
      table: 'com.samsung.health.food_intake',
      key: 'foods',
      label: 'Aliments',
      adapt: (r) => {
        const date = r.time('start_time');
        const kcal = r.num('calorie');
        if (!date || kcal === null) return null;
        return { date, mealType: r.num('meal_type'), name: r.str('name') || 'Sans nom', kcal };
      },
    },
    {
      table: 'com.samsung.shealth.calories_burned.details',
      key: 'expenditure',
      label: 'Dépense énergétique',
      adapt: (r) => {
        const date = r.day('day_time');
        const rest = r.num('rest_calorie');
        if (!date || rest === null) return null;
        return {
          date,
          rest,
          active: r.num('active_calorie') || 0,
          tef: r.num('tef_calorie') || 0,
          exercise: r.num('total_exercise_calories'),
        };
      },
    },
    {
      table: 'com.samsung.shealth.step_daily_trend',
      key: 'steps',
      label: 'Pas',
      adapt: (r) => {
        const date = r.day('day_time');
        const steps = r.num('count');
        if (!date || steps === null) return null;
        return { date, source: r.num('source_type'), steps, distance: r.num('distance'), kcal: r.num('calorie') };
      },
    },
    {
      table: 'com.samsung.shealth.activity.day_summary',
      key: 'activity',
      label: 'Activité quotidienne',
      adapt: (r) => {
        const date = r.day('day_time');
        if (!date) return null;
        return {
          date,
          activeMin: msToMin(r.num('active_time')),
          walkMin: msToMin(r.num('walk_time')),
          runMin: msToMin(r.num('run_time')),
        };
      },
    },
    {
      table: 'com.samsung.shealth.tracker.floors_day_summary',
      key: 'floors',
      label: 'Étages',
      adapt: point('day_time', 'floor_count', true),
    },
    {
      table: 'com.samsung.shealth.exercise',
      key: 'sessions',
      label: 'Séances',
      adapt: (r) => {
        const start = r.time('start_time');
        const durationMin = msToMin(r.num('duration'));
        if (!start || !durationMin || durationMin < 1) return null;
        const type = r.num('exercise_type') || 0;
        const kcal = r.num('calorie');
        return {
          date: start,
          type,
          typeLabel: exerciseLabel(type),
          durationMin,
          kcal: kcal !== null ? kcal : r.num('total_calorie'),
          meanHr: positive(r.num('mean_heart_rate')),
          maxHr: positive(r.num('max_heart_rate')),
          distance: positive(r.num('distance')),
          vo2max: positive(r.num('vo2_max')),
        };
      },
    },
    {
      table: 'com.samsung.shealth.tracker.heart_rate',
      key: 'heartRate',
      label: 'Fréquence cardiaque',
      adapt: (r) => {
        const date = r.time('start_time');
        const hr = positive(r.num('heart_rate'));
        if (!date || !hr) return null;
        return { date, hr, min: positive(r.num('min')), max: positive(r.num('max')) };
      },
    },
    {
      table: 'com.samsung.shealth.stress',
      key: 'stress',
      label: 'Stress',
      adapt: (r) => {
        const date = r.time('start_time');
        const score = r.num('score');
        if (!date || score === null) return null;
        return { date, score, max: r.num('max') };
      },
    },
    {
      table: 'com.samsung.shealth.sleep',
      key: 'sleeps',
      label: 'Nuits',
      adapt: (r) => {
        const start = r.time('start_time');
        const end = r.time('end_time');
        if (!start || !end || end <= start) return null;
        const duration = positive(r.num('sleep_duration'));
        return {
          id: r.str('datauuid'),
          start,
          end,
          date: end,
          durationMin: duration || (end - start) / 60000,
          score: positive(r.num('sleep_score')),
          efficiency: positive(r.num('efficiency')),
          mental: positive(r.num('mental_recovery')),
          physical: positive(r.num('physical_recovery')),
          cycles: positive(r.num('sleep_cycle')),
        };
      },
    },
    {
      table: 'com.samsung.health.sleep_stage',
      key: 'stages',
      label: 'Phases de sommeil',
      adapt: (r) => {
        const start = r.time('start_time');
        const end = r.time('end_time');
        const stage = SLEEP_STAGES[r.num('stage')];
        if (!start || !end || !stage) return null;
        return { sleepId: r.str('sleep_id'), date: start, start, end, stage };
      },
    },
    {
      table: 'com.samsung.shealth.vitality_score',
      key: 'vitality',
      label: 'Score de vitalité',
      adapt: (r) => {
        const date = r.day('day_time');
        const total = r.num('total_score');
        if (!date || total === null) return null;
        return {
          date,
          total,
          sleepHr: positive(r.num('shr_value')),
          sleepHrv: positive(r.num('shrv_value')),
        };
      },
    },
    { table: 'com.samsung.shealth.tracker.oxygen_saturation', key: 'spo2', label: 'SpO2', adapt: point('start_time', 'spo2') },
    { table: 'com.samsung.health.respiratory_rate', key: 'respiration', label: 'Respiration', adapt: point('start_time', 'average') },
    { table: 'com.samsung.health.skin_temperature', key: 'skinTemp', label: 'Température cutanée', adapt: point('start_time', 'temperature') },
    { table: 'com.samsung.health.advanced_glycation_endproduct', key: 'ageIndex', label: 'Indice AGE', adapt: point('day_time', 'score', true) },
    { table: 'com.samsung.health.antioxidant', key: 'antioxidant', label: 'Antioxydants', adapt: point('start_time', 'antioxidant') },
    {
      table: 'com.samsung.shealth.mean_arterial_pressure',
      key: 'arterialPressure',
      label: 'Pression artérielle moyenne',
      // type 1 = mesure absolue en mmHg ; les autres types sont des écarts nocturnes à une référence
      adapt: (r) => (r.num('type') === 1 ? point('start_time', 'measurement')(r) : null),
    },
    {
      table: 'com.samsung.shealth.blood_pressure',
      key: 'bloodPressure',
      label: 'Tension',
      adapt: (r) => {
        const date = r.time('start_time');
        const systolic = positive(r.num('systolic'));
        const diastolic = positive(r.num('diastolic'));
        return date && systolic && diastolic ? { date, systolic, diastolic } : null;
      },
    },
    { table: 'com.samsung.health.water_intake', key: 'water', label: 'Eau bue', adapt: point('start_time', 'amount') },
    { table: 'com.samsung.health.caffeine_intake', key: 'caffeine', label: 'Caféine', adapt: point('start_time', 'amount') },
    { table: 'com.samsung.shealth.mood', key: 'mood', label: 'Humeur', adapt: point('start_time', 'mood_type') },
  ];

  const BY_TABLE = new Map(SOURCES.map((s) => [s.table, s]));

  /** Table déduite du nom de fichier « com.samsung.health.weight.20261109080225.csv ». */
  function tableFromFileName(name) {
    const m = /^(com\.samsung\.[a-z0-9_.]+?)\.\d{8,}\.csv$/i.exec(name);
    return m ? m[1] : null;
  }

  SP.parsers.samsung.sources = {
    SOURCES,
    BY_TABLE,
    MEAL_TYPES,
    EXERCISE_TYPES,
    exerciseLabel,
    tableFromFileName,
    find: (table) => BY_TABLE.get(table) || null,
  };
})(window.SP);
