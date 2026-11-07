/**
 * Parser de l'export "pesées" (composition corporelle).
 * En-tête : N°,La date,Temps,Poids(kg),IMC,Pourcentage de graisse corporelle(%),...
 */
(function (SP) {
  'use strict';

  const { splitLines, splitCsvLine, detectSeparator, parseNumber, normalizeLabel, parseDateTime } = SP.parsers.csvUtils;

  /**
   * Définition des champs : clé interne -> préfixe du libellé normalisé.
   * L'ordre compte (le premier préfixe qui matche gagne).
   */
  const FIELDS = [
    { key: 'weight', match: 'poids(kg)' },
    { key: 'bmi', match: 'imc' },
    { key: 'fatPct', match: 'pourcentage de graisse corporelle' },
    { key: 'fatKg', match: 'masse grasse corporelle' },
    { key: 'musclePct', match: 'pourcentage de masse musculaire' },
    { key: 'muscleKg', match: 'masse musculaire(kg)' },
    { key: 'skeletalPct', match: 'pourcentage des muscles squelettiques' },
    { key: 'skeletalKg', match: 'masse musculaire squelettique' },
    { key: 'bonePct', match: 'pourcentage osseux' },
    { key: 'boneKg', match: 'masse osseuse' },
    { key: 'proteinPct', match: 'pourcentage de proteines' },
    { key: 'proteinKg', match: 'masse proteique' },
    { key: 'waterPct', match: 'pourcentage d eau corporelle' },
    { key: 'waterKg', match: 'masse d eau corporelle' },
    { key: 'leanKg', match: 'poids hors masse grasse' },
    { key: 'subcutPct', match: 'gras sous-cutane' },
    { key: 'visceral', match: 'graisse viscerale' },
    { key: 'bmr', match: 'metabolisme de base' },
    { key: 'metaAge', match: 'age metabolique' },
  ];

  /** Libellés affichables, réutilisés par les graphiques et tableaux. */
  const LABELS = {
    weight: { label: 'Poids', unit: 'kg', decimals: 2 },
    bmi: { label: 'IMC', unit: '', decimals: 1 },
    fatPct: { label: 'Graisse corporelle', unit: '%', decimals: 1 },
    fatKg: { label: 'Masse grasse', unit: 'kg', decimals: 2 },
    musclePct: { label: 'Masse musculaire', unit: '%', decimals: 1 },
    muscleKg: { label: 'Masse musculaire', unit: 'kg', decimals: 2 },
    skeletalPct: { label: 'Muscles squelettiques', unit: '%', decimals: 1 },
    skeletalKg: { label: 'Muscle squelettique', unit: 'kg', decimals: 2 },
    bonePct: { label: 'Os', unit: '%', decimals: 1 },
    boneKg: { label: 'Masse osseuse', unit: 'kg', decimals: 2 },
    proteinPct: { label: 'Protéines', unit: '%', decimals: 1 },
    proteinKg: { label: 'Masse protéique', unit: 'kg', decimals: 2 },
    waterPct: { label: 'Eau corporelle', unit: '%', decimals: 1 },
    waterKg: { label: "Masse d'eau", unit: 'kg', decimals: 2 },
    leanKg: { label: 'Masse maigre', unit: 'kg', decimals: 2 },
    subcutPct: { label: 'Gras sous-cutané', unit: '%', decimals: 1 },
    visceral: { label: 'Graisse viscérale', unit: '', decimals: 0 },
    bmr: { label: 'Métabolisme de base', unit: 'kcal', decimals: 0 },
    metaAge: { label: 'Âge métabolique', unit: 'ans', decimals: 0 },
  };

  /**
   * En-tête du modèle téléchargeable (identique à l'export).
   * Seules « La date » et « Poids(kg) » sont obligatoires ; « -- » ou vide = inconnu.
   */
  const TEMPLATE_HEADER = [
    'N°', 'La date', 'Temps', 'Poids(kg)', 'IMC', 'Pourcentage de graisse corporelle(%)',
    'Masse grasse corporelle(kg)', 'Pourcentage de masse musculaire(%)', 'Masse musculaire(kg)',
    'Pourcentage des muscles squelettiques(%)', 'Masse musculaire squelettique(kg)', 'Pourcentage osseux(%)',
    'Masse osseuse(kg)', 'Pourcentage de protéines(%)', 'Masse protéique(kg)', 'Pourcentage d’eau corporelle(%)',
    'Masse d’eau corporelle(kg)', 'Poids hors masse grasse(kg)', 'Gras sous-cutané(%)', 'Graisse viscérale',
    'Métabolisme de base(kcal)', 'Âge métabolique',
  ];

  function isComposition(text) {
    const head = normalizeLabel(text.slice(0, 600));
    return head.includes('poids(kg)') && head.includes('imc');
  }

  function parse(text) {
    const lines = splitLines(text);
    if (lines.length < 2) throw new Error('Fichier de pesées vide.');

    const sep = detectSeparator(lines[0]);
    const header = splitCsvLine(lines[0], sep).map(normalizeLabel);
    const dateIdx = header.findIndex((h) => h === 'la date' || h === 'date');
    const timeIdx = header.findIndex((h) => h === 'temps' || h === 'heure');
    if (dateIdx < 0) throw new Error('Colonne de date introuvable dans le fichier de pesées.');

    const columns = {};
    FIELDS.forEach(({ key, match }) => {
      const idx = header.findIndex((h, i) => h.startsWith(match) && !Object.values(columns).includes(i));
      if (idx >= 0) columns[key] = idx;
    });
    if (columns.weight === undefined) throw new Error('Colonne "Poids(kg)" introuvable.');

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i], sep);
      const date = parseDateTime(cells[dateIdx], timeIdx >= 0 ? cells[timeIdx] : '');
      if (!date) continue;
      const rec = { date };
      Object.entries(columns).forEach(([key, idx]) => {
        rec[key] = parseNumber(cells[idx]);
      });
      if (rec.weight === null) continue;
      rec.hasComposition = rec.fatPct !== null && rec.fatPct !== undefined;
      records.push(rec);
    }

    records.sort((a, b) => a.date - b.date);
    return records;
  }

  SP.parsers.composition = { isComposition, parse, LABELS, TEMPLATE_HEADER };
})(window.SP);
