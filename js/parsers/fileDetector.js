/**
 * Lit les fichiers déposés (FileReader, en mémoire) et détecte leur type
 * d'après le contenu, quel que soit le nom ou l'ordre.
 */
(function (SP) {
  'use strict';

  const { composition, measurements } = SP.parsers;

  function readText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
      reader.readAsText(file, 'utf-8');
    });
  }

  function detect(text) {
    if (composition.isComposition(text)) return 'composition';
    if (measurements.isMeasurements(text)) return 'measurements';
    return null;
  }

  /**
   * @param {File[]} files
   * @returns {Promise<{composition: object[], measurements: object[], files: object[]}>}
   */
  async function loadFiles(files) {
    const result = { composition: [], measurements: [], files: [] };

    for (const file of files) {
      const status = { name: file.name, type: null, count: 0, error: null };
      try {
        const text = await readText(file);
        status.type = detect(text);
        if (status.type === 'composition') {
          result.composition = mergeByDate(result.composition, composition.parse(text));
          status.count = result.composition.length;
        } else if (status.type === 'measurements') {
          result.measurements = mergeByDate(result.measurements, measurements.parse(text));
          status.count = result.measurements.length;
        } else {
          throw new Error("Format non reconnu (ni pesées ni mensurations).");
        }
      } catch (err) {
        status.error = err.message;
      }
      result.files.push(status);
    }
    return result;
  }

  /** Fusionne deux listes en dédoublonnant sur l'horodatage exact. */
  function mergeByDate(existing, incoming) {
    const map = new Map(existing.map((r) => [r.date.getTime(), r]));
    incoming.forEach((r) => map.set(r.date.getTime(), r));
    return [...map.values()].sort((a, b) => a.date - b.date);
  }

  SP.parsers.fileDetector = { loadFiles, detect };
})(window.SP);
