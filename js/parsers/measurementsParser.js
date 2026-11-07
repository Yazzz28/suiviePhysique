/**
 * Parser des mensurations. Deux formats acceptés :
 *  1. Export (sans en-tête, paires clé:valeur) :
 *       \t2026-11-07 07:14:27\t,Rapport taille / hanches(cm):0.76,Cou(cm):36.4,...
 *  2. Tableau classique avec en-tête (modèle téléchargeable, saisie Excel) :
 *       Date;Heure;Rapport taille / hanches;Cou(cm);Épaule(cm);...
 */
(function (SP) {
  'use strict';

  const { splitLines, splitCsvLine, detectSeparator, parseNumber, normalizeLabel, parseDateTime } = SP.parsers.csvUtils;

  /** Zones connues : clé interne -> libellé normalisé (avant "(cm)"). */
  const ZONES = [
    { key: 'whr', match: 'rapport taille / hanches', raw: 'Rapport taille / hanches', label: 'Rapport taille/hanches', unit: '', side: null },
    { key: 'neck', match: 'cou', raw: 'Cou', label: 'Cou', unit: 'cm', side: null },
    { key: 'shoulder', match: 'epaule', raw: 'Épaule', label: 'Épaules', unit: 'cm', side: null },
    { key: 'bicepsL', match: 'l-biceps', raw: 'L-Biceps', label: 'Biceps gauche', unit: 'cm', side: 'L' },
    { key: 'bicepsR', match: 'r-biceps', raw: 'R-Biceps', label: 'Biceps droit', unit: 'cm', side: 'R' },
    { key: 'chest', match: 'poitrine', raw: 'Poitrine', label: 'Poitrine', unit: 'cm', side: null },
    { key: 'waist', match: 'taille', raw: 'Taille', label: 'Taille', unit: 'cm', side: null },
    { key: 'abdomen', match: 'abdomen', raw: 'Abdomen', label: 'Abdomen', unit: 'cm', side: null },
    { key: 'hip', match: 'hanche', raw: 'Hanche', label: 'Hanches', unit: 'cm', side: null },
    { key: 'thighL', match: 'l-cuisse', raw: 'L-Cuisse', label: 'Cuisse gauche', unit: 'cm', side: 'L' },
    { key: 'thighR', match: 'r-cuisse', raw: 'R-Cuisse', label: 'Cuisse droite', unit: 'cm', side: 'R' },
    { key: 'calfL', match: 'l-mollet', raw: 'L-Mollet', label: 'Mollet gauche', unit: 'cm', side: 'L' },
    { key: 'calfR', match: 'r-mollet', raw: 'R-Mollet', label: 'Mollet droit', unit: 'cm', side: 'R' },
  ];

  /** Zones en cm uniquement (sans le ratio). */
  const CM_ZONES = ZONES.filter((z) => z.unit === 'cm');

  /** En-tête du modèle tabulaire téléchargeable. */
  const TEMPLATE_HEADER = ['Date', 'Heure', ...ZONES.map((z) => (z.unit ? `${z.raw}(cm)` : z.raw))];

  function zoneFromLabel(rawLabel) {
    const label = normalizeLabel(String(rawLabel).replace(/\(.*?\)/g, ''));
    return ZONES.find((z) => z.match === label) || null;
  }

  /** Format tabulaire : 1re ligne = en-tête contenant « Date » et au moins une zone connue. */
  function isTabular(firstLine) {
    const cells = splitCsvLine(firstLine, detectSeparator(firstLine));
    return cells.some((c) => normalizeLabel(c) === 'date') && cells.some((c) => zoneFromLabel(c));
  }

  function isMeasurements(text) {
    const head = text.slice(0, 2000);
    if (/\(cm\)\s*:/i.test(head)) return true;
    return isTabular(splitLines(head)[0] || '');
  }

  function parseTabular(lines) {
    const sep = detectSeparator(lines[0]);
    const header = splitCsvLine(lines[0], sep);
    const dateIdx = header.findIndex((h) => normalizeLabel(h) === 'date');
    const timeIdx = header.findIndex((h) => ['heure', 'temps'].includes(normalizeLabel(h)));
    const columns = header.map(zoneFromLabel);
    return lines.slice(1).map((line) => {
      const cells = splitCsvLine(line, sep);
      const date = parseDateTime(cells[dateIdx] || '', timeIdx >= 0 ? cells[timeIdx] : '');
      if (!date) return null;
      const rec = { date };
      columns.forEach((zone, i) => {
        if (zone) rec[zone.key] = parseNumber(cells[i]);
      });
      return rec;
    });
  }

  function parseLine(line) {
    // Le premier champ contient la date (entourée de tabulations), le reste des paires "Libellé(cm):valeur".
    const parts = line.split(',');
    const dateMatch = parts[0].match(/(\d{4}[-./]\d{1,2}[-./]\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?)?/);
    if (!dateMatch) return null;
    const date = parseDateTime(dateMatch[1], dateMatch[2]);
    if (!date) return null;

    const rec = { date };
    for (let i = 1; i < parts.length; i++) {
      const sepIdx = parts[i].lastIndexOf(':');
      if (sepIdx < 0) continue;
      const zone = zoneFromLabel(parts[i].slice(0, sepIdx));
      if (zone) rec[zone.key] = parseNumber(parts[i].slice(sepIdx + 1));
    }
    return rec;
  }

  function parse(text) {
    const lines = splitLines(text);
    const rows = lines.length && isTabular(lines[0]) ? parseTabular(lines) : lines.map(parseLine);
    const records = rows
      .filter((rec) => rec && CM_ZONES.some((z) => rec[z.key] !== null && rec[z.key] !== undefined));

    if (!records.length) throw new Error('Aucune mensuration lisible dans le fichier.');
    records.sort((a, b) => a.date - b.date);
    return records;
  }

  SP.parsers.measurements = { isMeasurements, parse, ZONES, CM_ZONES, TEMPLATE_HEADER };
})(window.SP);
