/**
 * Calculateur de tailles de vêtements à partir des mensurations.
 *
 * Barèmes : guides de tailles européens standard (FR/EU). Les marques varient,
 * les résultats sont des repères, pas des garanties.
 *
 * Règles :
 * - Un vêtement doit aller à TOUTES les mesures qui le concernent : la taille
 *   retenue est la plus grande parmi celles imposées par chaque mesure, et la
 *   mesure « limitante » est indiquée.
 * - Hauts : la poitrine, mais aussi le ventre s'il est plus large.
 * - Pantalons homme : le tour de taille à l'endroit où le pantalon est porté
 *   (taille naturelle par défaut, ou nombril) ; les hanches donnent un conseil.
 *   Pantalons femme : tour de taille ET hanches (barèmes femme fondés sur les hanches).
 */
(function (SP) {
  'use strict';

  const { fmt, isFiniteNumber, clamp } = SP.core.utils;

  /** Génère des tranches régulières : [{ label, min, max }]. */
  function steps(labels, firstMin, width) {
    return labels.map((label, i) => ({ label: String(label), min: firstMin + i * width, max: firstMin + (i + 1) * width }));
  }

  /** Tailles W26 à W50 : la taille Wn couvre [n + offset − 0,5 ; n + offset + 0,5[ pouces. */
  function inchSizes(offset) {
    const out = [];
    for (let n = 26; n <= 50; n++) {
      out.push({ label: `W${n}`, min: (n + offset - 0.5) * 2.54, max: (n + offset + 0.5) * 2.54 });
    }
    return out;
  }

  const FR_MEN = [38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64];
  const FR_WOMEN = [34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54];

  const CHARTS = {
    // Hauts homme (t-shirt, pull, sweat) : tour de poitrine, tranches de 8 cm
    topMen: steps(['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'], 80, 8),
    // Veste / costume homme : taille FR ≈ tour de poitrine / 2, tranches de 4 cm
    jacketMen: steps([44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66], 86, 4),
    // Pantalon homme : tour de taille (où le pantalon est porté), tranches de 4 cm
    pantsWaistMen: steps(FR_MEN, 74, 4),
    // Pantalon homme : tour de hanches, tranches de 4 cm
    pantsHipMen: steps(FR_MEN, 90, 4),
    // Col de chemise (cm) : tour de cou + ~1 cm d'aisance, arrondi au-dessus
    collar: steps([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48], 34, 1),
    // Hauts femme : tour de poitrine, tranches de 4 cm puis 6 cm
    topWomen: [
      ...steps([34, 36, 38, 40, 42, 44], 80, 4),
      ...steps([46, 48, 50, 52, 54], 104, 6),
    ],
    // Pantalon femme : tour de taille et de hanches
    pantsWaistWomen: [...steps(FR_WOMEN.slice(0, 6), 62, 4), ...steps(FR_WOMEN.slice(6), 86, 6)],
    pantsHipWomen: [...steps(FR_WOMEN.slice(0, 6), 86, 4), ...steps(FR_WOMEN.slice(6), 110, 6)],
    // Jean (taille US) : W = tour de taille en pouces, calculé directement depuis la mesure
    // (la règle « FR − 10 » dérive dans les grandes tailles).
    jeansWaist: inchSizes(0),
    // Hanches d'un jean coupe droite ≈ W + 8 pouces (homme), W + 10 (femme)
    jeansHipMen: inchSizes(8),
    jeansHipWomen: inchSizes(10),
  };

  /** Lettre usuelle d'une taille FR femme. */
  const WOMEN_LETTER = { 34: 'XS', 36: 'S', 38: 'M', 40: 'M', 42: 'L', 44: 'XL', 46: 'XXL', 48: '3XL', 50: '4XL', 52: '5XL', 54: '6XL' };

  /** Lettre usuelle d'un col de chemise. */
  function collarLetter(collar) {
    const c = Number(collar);
    if (c <= 38) return 'S';
    if (c <= 40) return 'M';
    if (c <= 42) return 'L';
    if (c <= 44) return 'XL';
    if (c <= 46) return 'XXL';
    return '3XL';
  }

  /** Entrejambe estimé à partir de la taille (≈ 45 % chez l'adulte), en pouces. */
  const inseamInches = (heightCm) => (isFiniteNumber(heightCm) ? Math.round((heightCm * 0.45) / 2.54) : null);

  /**
   * Position d'une mesure dans un barème.
   * near : 'up' si proche de la taille au-dessus, 'down' si proche de celle en dessous.
   */
  function lookup(chart, value) {
    if (!isFiniteNumber(value)) return null;
    let index = chart.findIndex((s) => value < s.max);
    let outOfRange = null;
    if (index === -1) {
      index = chart.length - 1;
      outOfRange = 'above';
    } else if (value < chart[0].min) {
      index = 0;
      outOfRange = 'below';
    }
    const size = chart[index];
    const position = clamp((value - size.min) / (size.max - size.min), 0, 1);
    let near = null;
    if (!outOfRange && position >= 0.8 && index < chart.length - 1) near = 'up';
    if (!outOfRange && position <= 0.2 && index > 0) near = 'down';
    return { chart, index, size, value, position, near, outOfRange };
  }

  /**
   * Combine plusieurs contraintes (une par mesure) : la plus grande taille l'emporte.
   * constraints : [{ chart, value, label }]
   */
  function fitAll(constraints) {
    const results = constraints
      .map((c) => ({ ...c, fit: lookup(c.chart, c.value) }))
      .filter((c) => c.fit);
    if (!results.length) return null;
    const limiting = results.reduce((a, b) => (b.fit.index > a.fit.index ? b : a));
    return { limiting, all: results };
  }

  /** Tour de taille utilisé pour un pantalon selon l'endroit où il est porté. */
  function pantsWaist(m, rise) {
    if (rise === 'natural') return isFiniteNumber(m.waist) ? m.waist : m.abdomen;
    return isFiniteNumber(m.abdomen) ? m.abdomen : m.waist;
  }

  const RISE_LABEL = { navel: 'au nombril', natural: 'à la taille naturelle' };

  /**
   * Recommandations pour un relevé.
   * Retourne une liste : { id, garment, size, alt, fit (résultat limitant), all, hints[] }.
   */
  function recommend(m, { sex = 'male', heightCm, rise = 'natural' } = {}) {
    if (!m) return [];
    const out = [];
    const waistForPants = pantsWaist(m, rise);
    const riseLabel = RISE_LABEL[rise] || RISE_LABEL.navel;

    if (sex === 'female') {
      const top = fitAll([
        { chart: CHARTS.topWomen, value: m.chest, label: 'Poitrine' },
        { chart: CHARTS.topWomen, value: m.abdomen, label: 'Ventre' },
      ]);
      if (top) {
        const fr = top.limiting.fit.size.label;
        out.push({ id: 'top', garment: 'Haut, t-shirt, pull', size: WOMEN_LETTER[fr] || fr, alt: `FR ${fr}`, ...top });
      }
      const pants = fitAll([
        { chart: CHARTS.pantsWaistWomen, value: waistForPants, label: `Tour de taille (${riseLabel})` },
        { chart: CHARTS.pantsHipWomen, value: m.hip, label: 'Hanches' },
      ]);
      if (pants) {
        const fr = Number(pants.limiting.fit.size.label);
        const inseam = inseamInches(heightCm);
        out.push({ id: 'pants', garment: 'Pantalon, jupe', size: String(fr), alt: `${WOMEN_LETTER[fr] || ''}`, ...pants });
        const jeans = fitAll([
          { chart: CHARTS.jeansWaist, value: waistForPants, label: `Tour de taille (${riseLabel})` },
          { chart: CHARTS.jeansHipWomen, value: m.hip, label: 'Hanches' },
        ]);
        if (jeans) {
          out.push({
            id: 'jeans',
            garment: 'Jean (taille US)',
            size: jeans.limiting.fit.size.label,
            alt: inseam ? `L${inseam} : longueur de jambe en pouces, estimée d'après ta taille` : '',
            ...jeans,
          });
        }
      }
      if (top) {
        out.push({
          id: 'jacket',
          garment: 'Veste, manteau',
          size: `FR ${top.limiting.fit.size.label}`,
          alt: '',
          ...top,
          hints: ['Pour porter un pull épais dessous, prends la taille au-dessus.'],
        });
      }
      return out;
    }

    // ---- Homme
    const top = fitAll([
      { chart: CHARTS.topMen, value: m.chest, label: 'Poitrine' },
      { chart: CHARTS.topMen, value: m.abdomen, label: 'Ventre' },
    ]);
    if (top) out.push({ id: 'top', garment: 'T-shirt, pull, sweat', size: top.limiting.fit.size.label, alt: '', ...top });

    // Pantalon homme : les guides homme sont organisés par tour de taille. Les hanches
    // ne sont qu'un conseil : la ceinture ne suit pas un tour horizontal (elle passe
    // souvent sous le ventre) et les tissus stretch absorbent l'écart.
    const pants = fitAll([{ chart: CHARTS.pantsWaistMen, value: waistForPants, label: `Tour de taille (${riseLabel})` }]);
    if (pants) {
      const fr = Number(pants.limiting.fit.size.label);
      const inseam = inseamInches(heightCm);
      const hipFit = lookup(CHARTS.pantsHipMen, m.hip);
      const hipHint = (sizeLabel) =>
        hipFit && hipFit.index > pants.limiting.fit.index
          ? [
              `Hanches ${fmt(m.hip, 1)} cm (repère ${sizeLabel}) : si ça serre aux hanches ou aux cuisses, ` +
                'prends une coupe athletic / tapered, du stretch, ou la taille au-dessus.',
            ]
          : [];
      out.push({ id: 'pants', garment: 'Pantalon', size: String(fr), alt: 'Taille française', ...pants, hints: hipHint(hipFit ? hipFit.size.label : '') });
      const jeans = fitAll([{ chart: CHARTS.jeansWaist, value: waistForPants, label: `Tour de taille (${riseLabel})` }]);
      if (jeans) {
        const jeansHip = lookup(CHARTS.jeansHipMen, m.hip);
        out.push({
          id: 'jeans',
          garment: 'Jean (taille US)',
          size: jeans.limiting.fit.size.label,
          alt: inseam ? `L${inseam} : longueur de jambe en pouces, estimée d'après ta taille` : '',
          ...jeans,
          hints: hipHint(jeansHip ? jeansHip.size.label : ''),
        });
      }
    }

    const shirt = fitAll([{ chart: CHARTS.collar, value: m.neck, label: 'Cou' }]);
    if (shirt) {
      const collar = shirt.limiting.fit.size.label;
      const hints = [];
      if (isFiniteNumber(m.abdomen) && isFiniteNumber(m.chest) && m.abdomen - m.chest > 5) {
        hints.push('Ventre plus large que la poitrine : préfère une coupe droite (regular) à une coupe cintrée (slim).');
      }
      out.push({ id: 'shirt', garment: 'Chemise (col)', size: `${collar} cm`, alt: `Taille ${collarLetter(collar)}`, ...shirt, hints });
    }

    const jacket = fitAll([{ chart: CHARTS.jacketMen, value: m.chest, label: 'Poitrine' }]);
    if (jacket) {
      const hints = [];
      const bellyFirst = isFiniteNumber(m.abdomen) && isFiniteNumber(m.chest) && m.abdomen > m.chest;
      if (bellyFirst) {
        hints.push('Ventre plus large que la poitrine : vise une coupe « confort » (drop 4) ou la taille au-dessus pour fermer la veste.');
      }
      out.push({
        id: 'jacket',
        garment: 'Veste, costume',
        size: jacket.limiting.fit.size.label,
        alt: 'Taille française',
        ...jacket,
        hints,
        suppressNear: bellyFirst ? 'down' : null, // évite deux conseils contradictoires
      });
    }
    return out;
  }

  /**
   * Élasticité typique de chaque tour par rapport au poids :
   * variation relative du tour = élasticité × variation relative du poids.
   * Le ventre et la taille (graisse centrale) réagissent le plus (≈ 1 cm par kg),
   * le cou, les épaules et les mollets le moins. Valeurs-repères volontairement
   * stables : extrapoler les pentes mesurées sur quelques relevés serait trop bruité.
   */
  const ELASTICITY = {
    abdomen: 0.85,
    waist: 0.85,
    hip: 0.6,
    chest: 0.6,
    thighL: 0.6,
    thighR: 0.6,
    bicepsL: 0.5,
    bicepsR: 0.5,
    neck: 0.4,
    shoulder: 0.3,
    calfL: 0.3,
    calfR: 0.3,
  };

  /** Mensurations estimées à un poids cible (perte uniquement). */
  function predictAtWeight(latest, currentWeight, targetWeight) {
    if (!latest || !isFiniteNumber(currentWeight) || !isFiniteNumber(targetWeight) || targetWeight >= currentWeight) return null;
    const relative = (targetWeight - currentWeight) / currentWeight;
    const predicted = { ...latest, weight: targetWeight };
    Object.entries(ELASTICITY).forEach(([key, e]) => {
      if (isFiniteNumber(latest[key])) predicted[key] = latest[key] * (1 + e * relative);
    });
    return predicted;
  }

  SP.analysis.sizing = { recommend, predictAtWeight, lookup, CHARTS, RISE_LABEL, ELASTICITY };
})(window.SP);
