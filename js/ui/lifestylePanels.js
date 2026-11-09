/**
 * Panneaux « mode de vie » hors graphiques : cartes KPI du résumé, tableau
 * journalier, contexte de la veille pour la lecture du jour.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, isFiniteNumber, dayKey, DAY_MS } = SP.core.utils;
  const kit = SP.charts.kit;

  function kpi(label, value, unit, meta, essential = false) {
    return `<div class="card kpi"${essential ? ' data-essential' : ''}><span class="kpi__label">${label}</span>
      <span class="kpi__value">${value}<span class="kpi__unit">${unit}</span></span>
      ${meta ? `<span class="kpi__meta">${meta}</span>` : ''}</div>`;
  }

  /** Cartes de synthèse affichées dans le Résumé. */
  function renderKpis(host, lifestyle) {
    if (!host) return;
    if (!lifestyle) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    const { energy, nutrition, activity, sleep, stressHeart } = lifestyle;
    const html = [];
    if (isFiniteNumber(energy.meanIntake)) html.push(kpi('Apport moyen', fmt(energy.meanIntake, 0), 'kcal/j', `${energy.counts.complete} jours de saisie complète`, true));
    if (isFiniteNumber(energy.adaptiveTdee)) html.push(kpi('Dépense réelle estimée', fmt(energy.adaptiveTdee, 0), 'kcal/j', `Montre : ${fmt(energy.meanTdee, 0)} kcal/j`, true));
    if (nutrition && isFiniteNumber(nutrition.proteinPerKgMean))
      html.push(kpi('Protéines', fmt(nutrition.proteinPerKgMean, 2), 'g/kg', `${fmt(nutrition.macros.protein, 0)} g/jour en moyenne`));
    if (isFiniteNumber(activity.stepsMean))
      html.push(kpi('Pas', fmt(activity.stepsMean, 0), '/ jour', `Objectif ${fmt(activity.stepGoal, 0)} atteint ${activity.goalDays} j sur ${activity.stepDays}`, true));
    if (sleep) html.push(kpi('Sommeil', kit.fmtDuration(sleep.durationMean), '', `${sleep.nights} nuits · ${sleep.shortNights} sous 7 h`));
    if (stressHeart && isFiniteNumber(stressHeart.stressMean)) html.push(kpi('Stress moyen', fmt(stressHeart.stressMean, 0), '/ 100', `${stressHeart.stressDays} jours mesurés`));
    if (stressHeart && isFiniteNumber(stressHeart.hrRestMean)) html.push(kpi('FC de repos', fmt(stressHeart.hrRestMean, 0), 'bpm', 'Estimée : heure la plus basse du jour'));
    host.innerHTML = html.join('');
    host.classList.toggle('hidden', !html.length);
  }

  /** Contexte de la veille (et de la nuit) pour la lecture du jour. Aucune relation de cause affirmée. */
  function readingContext(lifestyle, readingDate) {
    if (!lifestyle || !readingDate) return null;
    const byKey = new Map(lifestyle.days.map((d) => [d.key, d]));
    const today = byKey.get(dayKey(readingDate));
    const yesterday = byKey.get(dayKey(new Date(readingDate.getTime() - DAY_MS / 2)));
    const items = [];
    if (yesterday) {
      if (isFiniteNumber(yesterday.kcalIn) && !yesterday.lowLog) items.push(`Hier : ${fmt(yesterday.kcalIn, 0)} kcal saisies`);
      else if (isFiniteNumber(yesterday.kcalIn)) items.push(`Hier : saisie probablement incomplète (${fmt(yesterday.kcalIn, 0)} kcal)`);
      if (isFiniteNumber(yesterday.carbs) && !yesterday.lowLog) items.push(`${fmt(yesterday.carbs, 0)} g de glucides`);
      if (isFiniteNumber(yesterday.steps)) items.push(`${fmt(yesterday.steps, 0)} pas`);
      if (isFiniteNumber(yesterday.sessionsMin) && yesterday.sessionsMin > 0) items.push(`${fmt(yesterday.sessionsMin, 0)} min de séance`);
    }
    if (today && isFiniteNumber(today.sleepMin)) items.push(`nuit de ${kit.fmtDuration(today.sleepMin)}`);
    return items.length ? items.join(' · ') : null;
  }

  /** Tableau jour par jour, du plus récent au plus ancien. */
  function renderTable(host, lifestyle) {
    const card = document.getElementById('card-lifestyle-table');
    if (!host) return;
    if (!lifestyle || !lifestyle.days.length) {
      if (card) card.classList.add('hidden');
      host.innerHTML = '';
      return;
    }
    if (card) card.classList.remove('hidden');
    const cols = [
      ['Apport', (d) => (isFiniteNumber(d.kcalIn) ? fmt(d.kcalIn, 0) + (d.lowLog ? ' *' : '') : '—')],
      ['Prot. g', (d) => fmt(d.protein, 0)],
      ['Gluc. g', (d) => fmt(d.carbs, 0)],
      ['Lip. g', (d) => fmt(d.fat, 0)],
      ['Dépense', (d) => fmt(d.tdee, 0)],
      ['Bilan', (d) => fmt(d.balance, 0)],
      ['Pas', (d) => fmt(d.steps, 0)],
      ['Actif min', (d) => fmt(d.activeMin, 0)],
      ['Séances min', (d) => (d.sessionsMin ? fmt(d.sessionsMin, 0) : '—')],
      ['Sommeil', (d) => kit.fmtDuration(d.sleepMin)],
      ['Score', (d) => fmt(d.sleepScore, 0)],
      ['Stress', (d) => fmt(d.stressAvg, 0)],
      ['FC repos', (d) => fmt(d.hrRest, 0)],
      ['Poids', (d) => fmt(d.weight, 1)],
    ];
    const rows = [...lifestyle.days]
      .reverse()
      .map((d) => `<tr><td>${fmtDate(d.date, 'weekday')}${d.partial ? ' (en cours)' : ''}</td>${cols.map(([, f]) => `<td>${f(d)}</td>`).join('')}</tr>`)
      .join('');
    host.innerHTML = `<div class="table-wrap table-scroll"><table class="data-table">
      <thead><tr><th>Date</th>${cols.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted rank-list__note">* saisie probablement incomplète (moins de ${fmt(lifestyle.energy.threshold, 0)} kcal) : ${
        lifestyle.energy.includeIncomplete ? 'intégrée aux moyennes' : 'exclue des moyennes'
      } (interrupteur en Nutrition et Bilan énergétique).</p>`;
  }

  SP.ui.lifestylePanels = { renderKpis, renderTable, readingContext };
})(window.SP);
