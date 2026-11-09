/**
 * Chargement d'un export Samsung Health (dossier complet ou fichiers choisis).
 *
 * - Seules les tables de la liste blanche (samsungSources.js) sont lues ;
 *   les autres fichiers ne sont jamais ouverts (sauf les 200 premiers octets
 *   d'un CSV renommé, pour reconnaître sa table).
 * - Les CSV qui ne viennent pas de Samsung Health sont renvoyés à l'appelant
 *   (pesées / mensurations) : un seul champ peut tout recevoir.
 * - Tout reste en mémoire.
 */
(function (SP) {
  'use strict';

  const { csv, sources } = SP.parsers.samsung;
  const { dayKey } = SP.core.utils;

  const isCsv = (file) => /\.csv$/i.test(file.name);

  function readText(file) {
    if (file.text) return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
      reader.readAsText(file, 'utf-8');
    });
  }

  /** Table d'un fichier : par son nom, sinon par sa première ligne (fichier renommé). */
  async function identify(file) {
    const byName = sources.tableFromFileName(file.name);
    if (byName) return byName;
    const head = await readText(file.slice(0, 200));
    return csv.tableName(head);
  }

  /** Laisse le navigateur respirer entre deux gros fichiers (barre de progression fluide). */
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

  /**
   * @param {File[]} files
   * @param {(done:number, total:number, label:string) => void} [onProgress]
   * @returns {Promise<{data: object, tables: object[], ignored: number, others: File[]}>}
   */
  async function load(files, onProgress = () => {}) {
    const wanted = [];
    const others = [];
    let ignored = 0;

    for (const file of files) {
      if (!isCsv(file)) {
        ignored++;
        continue;
      }
      const table = await identify(file);
      if (!table) others.push(file);
      else if (sources.find(table)) wanted.push({ file, source: sources.find(table) });
      else ignored++;
    }

    const data = {};
    const tables = [];
    for (let i = 0; i < wanted.length; i++) {
      const { file, source } = wanted[i];
      onProgress(i, wanted.length, source.label);
      await nextFrame();
      const status = { name: file.name, label: source.label, key: source.key, count: 0, error: null };
      try {
        const parsed = csv.parse(await readText(file));
        const records = parsed ? csv.map(parsed, source.adapt) : [];
        data[source.key] = (data[source.key] || []).concat(records);
        status.count = records.length;
      } catch (err) {
        status.error = err.message;
      }
      tables.push(status);
    }
    onProgress(wanted.length, wanted.length, '');
    return { data: normalize(data), tables, ignored, others };
  }

  /** Une valeur par jour pour les tables journalières (doublons d'appareils). */
  function onePerDay(records, score) {
    const best = new Map();
    records.forEach((r) => {
      const k = dayKey(r.date);
      const cur = best.get(k);
      if (!cur || score(r) > score(cur)) best.set(k, r);
    });
    return [...best.values()];
  }

  function normalize(data) {
    const out = { ...data };
    // Pas : la source « -2 » est le total fusionné de tous les appareils
    if (out.steps) out.steps = onePerDay(out.steps, (r) => (r.source === -2 ? 1e9 : 0) + r.steps);
    if (out.expenditure) out.expenditure = onePerDay(out.expenditure, (r) => r.rest + r.active);
    if (out.activity) out.activity = onePerDay(out.activity, (r) => r.activeMin || 0);
    if (out.floors) out.floors = onePerDay(out.floors, (r) => r.value);
    if (out.vitality) out.vitality = onePerDay(out.vitality, (r) => r.total);
    Object.values(out).forEach((list) => list.sort((a, b) => a.date - b.date));
    return out;
  }

  /**
   * Ajoute un nouvel import aux données déjà chargées : une table présente
   * dans le nouvel import remplace l'ancienne (un export plus récent contient
   * tout l'historique), les autres sont conservées.
   */
  function merge(existing, incoming) {
    return { ...existing, ...incoming };
  }

  SP.parsers.samsung.loader = { load, merge };
})(window.SP);
