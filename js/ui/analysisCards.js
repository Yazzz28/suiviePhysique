/**
 * Cartes rédigées des analyses avancées : budget calorique, variation du jour
 * expliquée, phase actuelle vs régimes précédents, détail des phases, records,
 * rythmes de vie, aliments, nuits atypiques.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, isFiniteNumber, escapeHtml } = SP.core.utils;
  const kit = SP.charts.kit;

  const host = (id) => document.getElementById(id);

  /** Affiche ou masque la carte qui contient `id`, et règle sa présence dans la vue Essentiel. */
  function show(id, visible, essential) {
    const el = host(id);
    const card = el && el.closest('.card');
    if (!card) return;
    card.classList.toggle('hidden', !visible);
    if (essential !== undefined) card.toggleAttribute('data-essential', !!essential);
  }

  const fact = (label, value, note) =>
    `<div class="fact"><span class="fact__label">${label}</span><span class="fact__value">${value}</span>${note ? `<span class="fact__note">${note}</span>` : ''}</div>`;

  /* ---------- Budget calorique ---------- */
  function renderBudget(ls, settings) {
    const b = ls.budget;
    show('budget', !!b);
    if (!b) return;
    const facts = [
      fact('Dépense réelle estimée', `${fmt(b.tdee, 0)} kcal/j`, ls.tdeeSource === 'adaptive' ? 'apport saisi − bilan déduit du poids' : 'estimation de la montre'),
      fact('Pour perdre 0,5 à 1 % du poids / semaine', `${fmt(b.recommended.low, 0)} à ${fmt(b.recommended.high, 0)} kcal/j`, 'rythme conseillé pour préserver le muscle'),
      fact('Pour stabiliser', `${fmt(b.maintenance, 0)} kcal/j`, 'au poids actuel'),
    ];
    let plan = '';
    const p = b.plan;
    if (p && p.invalid === 'past') plan = '<p class="callout callout--warn">La date cible est déjà passée : choisis une date future dans les réglages.</p>';
    else if (p) {
      const warnings = [];
      if (p.belowFloor) warnings.push(`moins de ${fmt(p.floor, 0)} kcal/j, minimum usuel sans suivi médical`);
      if (p.tooFast) warnings.push(`rythme de départ ${fmt(p.startRatePct, 1)} % du poids par semaine, au-delà du 1 % conseillé`);
      plan = `<p class="callout ${warnings.length ? 'callout--warn' : 'callout--good'}">
          Pour <strong>${fmt(settings.targetWeight, 1)} kg le ${fmtDate(settings.targetDate, 'long')}</strong> (${fmt(p.delta, 1)} kg en ${fmt(p.days, 0)} jours) :
          <strong>${fmt(p.intake, 0)} kcal/j</strong>, soit un déficit de départ de ${fmt(p.deficit, 0)} kcal/j (${fmtDelta(-p.startRatePerWeek, 2)} kg/sem. au début, puis moins vite).
          ${warnings.length ? `<br>Attention : ${warnings.join(' ; ')}. Une date plus lointaine serait plus réaliste.` : ''}</p>`;
    } else if (isFiniteNumber(settings.targetWeight)) {
      plan = '<p class="muted">Ajoute une <strong>date cible</strong> dans les réglages pour connaître l’apport qui y mène.</p>';
    } else {
      plan = '<p class="muted">Renseigne un <strong>objectif de poids</strong> et une <strong>date cible</strong> dans les réglages pour calculer ton budget.</p>';
    }
    const note =
      ls.energy.includeIncomplete && ls.energy.counts.incomplete > 0
        ? `<p class="muted fact__foot">Jours de saisie incomplète intégrés (${ls.energy.counts.incomplete}) : la dépense réelle est probablement sous-estimée. Désactive « Intégrer les jours incomplets » pour un budget plus juste.</p>`
        : '';
    host('budget').innerHTML = `<div class="facts">${facts.join('')}</div>${plan}${note}`;
  }

  /* ---------- Variation du jour expliquée ---------- */
  function renderFluctuation(ls) {
    const f = ls.fluctuation;
    show('fluctuation', !!f && f.n > 0, !!f && f.enough);
    if (!f || !f.n) return;
    if (!f.enough) {
      host('fluctuation').innerHTML = `<p class="muted">${
        f.n < f.minN
          ? `Pas encore assez de jours avec repas saisis et pesées consécutives (${f.n} sur ${f.minN} nécessaires).`
          : `Sur ${f.n} jours, tes repas, tes pas et ton sommeil n'expliquent pas encore tes variations d'un jour à l'autre mieux que le hasard (validation croisée). Elles viennent surtout de l'eau et du transit, sans lien régulier avec ce que tu saisis : c'est plutôt une bonne nouvelle, il n'y a pas de « mauvaise habitude » qui fait monter la balance.`
      }</p>`;
      return;
    }
    const l = f.latest;
    const rows = l.contributions
      .filter((c) => Math.abs(c.kg) >= 0.03)
      .map(
        (c) =>
          `<li><span>${escapeHtml(c.label)} : ${fmt(c.value, 0)} ${c.unit} (ta moyenne ${fmt(c.average, 0)})</span><strong class="${c.kg > 0 ? 'delta--bad' : 'delta--good'}">${fmtDelta(c.kg, 2)} kg</strong></li>`
      )
      .join('');
    host('fluctuation').innerHTML = `<p>Pesée du ${fmtDate(l.nextDate, 'weekday')} : <strong>${fmtDelta(l.actual, 2)} kg</strong> par rapport à la veille ;
      le modèle en attendait <strong>${fmtDelta(l.predicted, 2)} kg</strong> d'après la journée du ${fmtDate(l.date, 'weekday')}.</p>
      <ul class="contrib">${rows || '<li>Journée proche de tes habitudes : rien de marquant.</li>'}</ul>
      <p class="muted fact__foot">Modèle appris sur ${f.n} jours, explique ${fmt(f.r2loo * 100, 0)} % des variations (validation croisée). Effets d'eau et de transit, pas de graisse.</p>`;
  }

  /* ---------- Phase actuelle vs précédentes ---------- */
  function renderPhaseCurrent(ls) {
    const ph = ls.phases;
    const cur = ph && ph.current;
    show('phase-current', !!cur);
    if (!cur) return;
    const c = ph.comparison;
    const facts = [
      fact(
        cur.type === 'loss' ? 'Phase de perte en cours' : 'Phase de reprise en cours',
        `${fmtDelta(cur.kg, 1)} kg en ${fmt(cur.weeks, 0)} sem.`,
        `depuis le ${fmtDate(cur.start.date, 'long')} (${fmt(cur.start.weight, 1)} kg) · ${fmtDelta(cur.ratePerWeek, 2)} kg/sem.`
      ),
    ];
    let verdict = '';
    if (c) {
      facts.push(
        fact(`Tes ${c.pastCount} pertes précédentes`, `${fmtDelta(c.pastKg, 1)} kg en ${fmt(c.pastWeeks, 0)} sem.`, `${fmtDelta(c.pastRate, 2)} kg/sem. en moyenne${isFiniteNumber(c.pastSteps) ? ` · ${fmt(c.pastSteps, 0)} pas/j` : ''}`)
      );
      if (c.regained) facts.push(fact('Après ces pertes', `${c.regained} sur ${c.pastCount} reprises`, `la moitié du poids perdu revenue en ${fmt(c.pastRegainWeeks, 0)} sem. en moyenne`));
      const faster = cur.ratePerWeek < c.pastRate * 1.2;
      verdict = `<p class="callout ${faster ? 'callout--warn' : 'callout--good'}">${
        faster
          ? `Tu perds ${fmt(cur.ratePerWeek / c.pastRate, 1)} fois plus vite que lors de tes régimes précédents.`
          : 'Ton rythme actuel est comparable à tes pertes précédentes.'
      } ${
        c.regained
          ? 'Tes pertes passées ont toutes été suivies d’une reprise : le moment clé sera la sortie de régime. Prévoir une phase de stabilisation (remonter progressivement vers ta dépense réelle) aide à la garder.'
          : ''
      }</p>`;
    }
    host('phase-current').innerHTML = `<div class="facts">${facts.join('')}</div>${verdict}`;
  }

  function renderPhaseTable(ls) {
    const ph = ls.phases;
    show('phase-table', !!ph && ph.phases.length > 0);
    if (!ph || !ph.phases.length) return;
    const rows = [...ph.phases]
      .reverse()
      .map(
        (p) => `<tr class="${p.type === 'loss' ? 'cell-down' : 'cell-up'}">
          <td>${p.type === 'loss' ? 'Perte' : 'Reprise'}${p.ongoing ? ' (en cours)' : ''}</td>
          <td>${fmtDate(p.start.date, 'month')}</td><td>${fmtDate(p.end.date, 'month')}</td>
          <td>${fmt(p.start.weight, 1)} → ${fmt(p.end.weight, 1)}</td><td>${fmtDelta(p.kg, 1)} kg</td>
          <td>${fmt(p.weeks, 0)} sem.</td><td>${fmtDelta(p.ratePerWeek, 2)}</td><td>${fmt(p.stepsMean, 0)}</td>
          <td>${isFiniteNumber(p.regainHalfWeeks) ? fmt(p.regainHalfWeeks, 0) + ' sem.' : p.type === 'loss' && !p.ongoing ? 'pas encore' : '—'}</td></tr>`
      )
      .join('');
    host('phase-table').innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Phase</th><th>Début</th><th>Fin</th><th>Poids (kg)</th><th>Variation</th><th>Durée</th><th>kg/sem.</th><th>Pas/j</th><th>Reprise de la moitié</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- Records ---------- */
  function renderRecords(ls) {
    const r = ls.records;
    show('records', !!r && r.list.length > 0);
    if (!r || !r.list.length) return;
    const items = r.list
      .map((x) =>
        fact(
          x.label,
          `${fmt(x.value, x.decimals)} ${x.unit}`,
          x.month ? fmtDate(x.date, 'month') : `${x.note ? x.note + ' ' : 'le '}${fmtDate(x.date, 'long')}`
        )
      )
      .join('');
    const years = r.yearlyMin.length > 1 ? `<p class="muted fact__foot">Poids le plus bas par année : ${r.yearlyMin.map((y) => `${y.year} ${fmt(y.weight, 1)} kg`).join(' · ')}</p>` : '';
    host('records').innerHTML = `<div class="facts facts--grid">${items}</div>${years}`;
  }

  /* ---------- Rythmes de vie ---------- */
  const groupLine = (label, g, fields) =>
    `<div class="compare__row"><span class="compare__label">${label} <span class="muted">(${g.n} j)</span></span>${fields
      .map(([name, value]) => `<span class="compare__value"><span class="muted">${name}</span> ${value}</span>`)
      .join('')}</div>`;

  const caution = (...groups) => (groups.some((g) => !g.enough) ? '<p class="muted fact__foot">Moins de 5 jours dans un groupe : pas encore concluant.</p>' : '');

  function renderRhythms(ls) {
    const r = ls.rhythms;
    if (!r) {
      ['rh-late', 'rh-nights', 'rh-stress', 'rh-jetlag'].forEach((id) => show(id, false));
      return;
    }
    const L = r.lateMeal;
    show('rh-late', L.late.n + L.early.n > 0);
    host('rh-late').innerHTML =
      groupLine(`Dernier repas avant ${L.hour} h`, L.early, [['score', fmt(L.early.score, 0)], ['durée', kit.fmtDuration(L.early.minutes)]]) +
      groupLine(`Après ${L.hour} h`, L.late, [['score', fmt(L.late.score, 0)], ['durée', kit.fmtDuration(L.late.minutes)]]) +
      caution(L.late, L.early);

    const N = r.nights;
    show('rh-nights', N.short.n + N.good.n > 0);
    host('rh-nights').innerHTML =
      groupLine('Après une nuit de 7 h ou plus', N.good, [['apport', fmt(N.good.kcal, 0) + ' kcal'], ['pas', fmt(N.good.steps, 0)], ['stress', fmt(N.good.stress, 0)]]) +
      groupLine('Après une nuit de moins de 6 h 30', N.short, [['apport', fmt(N.short.kcal, 0) + ' kcal'], ['pas', fmt(N.short.steps, 0)], ['stress', fmt(N.short.stress, 0)]]) +
      caution(N.short, N.good);

    const S = r.stress;
    show('rh-stress', !!S);
    if (S) {
      host('rh-stress').innerHTML =
        groupLine('Jours les plus calmes', S.low, [['stress', fmt(S.low.stress, 0)], ['apport', fmt(S.low.kcal, 0) + ' kcal'], ['collations', fmt(S.low.snacks, 0) + ' kcal']]) +
        groupLine('Jours les plus stressés', S.high, [['stress', fmt(S.high.stress, 0)], ['apport', fmt(S.high.kcal, 0) + ' kcal'], ['collations', fmt(S.high.snacks, 0) + ' kcal']]) +
        caution(S.low, S.high);
    }

    const J = r.jetlag;
    show('rh-jetlag', !!J);
    if (J) {
      const h = Math.abs(J.hours);
      host('rh-jetlag').innerHTML = `<p><strong>${fmt(h, 1)} h</strong> de décalage : le milieu de ta nuit est ${J.hours >= 0 ? 'plus tard' : 'plus tôt'} le week-end (${J.nWeekend} nuits) qu'en semaine (${J.nWeek} nuits).</p>
        <p class="muted fact__foot">${h >= 1 ? 'Au-delà d’1 h, on parle de « jet-lag social » : il est associé à plus de fatigue en début de semaine.' : 'Rythme régulier entre semaine et week-end.'}</p>`;
    }
  }

  /* ---------- Aliments ---------- */
  function renderFoods(ls) {
    const p = ls.protein;
    show('protein-foods', !!p && (p.best.length > 0 || p.traps.length > 0));
    if (p && (p.best.length || p.traps.length)) {
      const list = (items, cls) =>
        `<ol class="rank-list">${items
          .map(
            (f) => `<li class="rank-list__item"><span class="rank-list__name">${escapeHtml(f.name)}</span>
              <span class="rank-list__bar ${cls}"><span style="width:${Math.min(100, (f.density / 25) * 100).toFixed(0)}%"></span></span>
              <span class="rank-list__value">${fmt(f.density, 1)} g · ${fmt(f.kcal, 0)} kcal</span></li>`
          )
          .join('')}</ol>`;
      host('protein-foods').innerHTML =
        (p.best.length ? `<h4 class="subhead">Les plus protéinés pour leurs calories</h4>${list(p.best, 'rank-list__bar--good')}` : '') +
        (p.traps.length ? `<h4 class="subhead">Beaucoup de calories, peu de protéines</h4>${list(p.traps, 'rank-list__bar--warn')}` : '');
    }
    show('best-meals', !!p && p.bestMeals.length > 0);
    if (p && p.bestMeals.length) {
      host('best-meals').innerHTML = `<ul class="meal-list">${p.bestMeals
        .map(
          (m) => `<li><span class="meal-list__head"><strong>${fmt(m.protein, 0)} g</strong> pour ${fmt(m.kcal, 0)} kcal · ${escapeHtml(m.label)} du ${fmtDate(m.date)}</span>
            <span class="muted">${m.foods.length ? m.foods.slice(0, 5).map(escapeHtml).join(', ') : 'aliments non détaillés'}</span></li>`
        )
        .join('')}</ul>`;
    }
  }

  /* ---------- Nuits atypiques ---------- */
  function renderAtypical(ls) {
    const r = ls.recovery;
    const has = !!r && (r.scores.length > 0 || r.atypical.length > 0);
    show('atypical-nights', has);
    if (!has) return;
    host('atypical-nights').innerHTML = r.atypical.length
      ? `<ul class="meal-list">${r.atypical
          .map((a) => `<li><span class="meal-list__head"><strong>${fmtDate(a.date, 'weekday')}</strong></span><span class="muted">${a.signs.map(escapeHtml).join(' · ')}</span></li>`)
          .join('')}</ul>
        <p class="muted fact__foot">Fatigue, alcool, repas tardif, début de maladie ou stress peuvent produire ce profil. Ce n'est pas un diagnostic.</p>`
      : '<p class="muted">Aucune nuit atypique sur la période : ta FC de repos, ta température et ta respiration restent dans ta normale.</p>';
  }

  const CARD_IDS = ['budget', 'fluctuation', 'phase-current', 'phase-table', 'records', 'rh-late', 'rh-nights', 'rh-stress', 'rh-jetlag', 'protein-foods', 'best-meals', 'atypical-nights'];

  function render(ctx) {
    const ls = ctx.lifestyle;
    if (!ls) {
      CARD_IDS.forEach((id) => show(id, false)); // sans export santé : cartes masquées
      return;
    }
    renderBudget(ls, ctx.settings);
    renderFluctuation(ls);
    renderPhaseCurrent(ls);
    renderPhaseTable(ls);
    renderRecords(ls);
    renderRhythms(ls);
    renderFoods(ls);
    renderAtypical(ls);
  }

  SP.ui.analysisCards = { render };
})(window.SP);
