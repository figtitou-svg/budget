import { monthSummary, shiftMonth, transactionsFor, listMonths } from '../core/stats.js';
import { donutSvg } from './charts.js';
import { formatEuros, formatMonth, formatDay, formatPercent, escapeHtml } from './format.js';
import { openCategoryPicker } from './category-sheet.js';

function renderEmpty(root, ctx) {
  root.innerHTML = `<section class="empty">
    <div class="empty-icon" aria-hidden="true">📊</div>
    <h1>Où part ton argent ?</h1>
    <p class="muted">Importe ton relevé Société Générale (CSV ou OFX), ou note tes dépenses au fil de l’eau avec le bouton +, pour voir tes dépenses par catégorie, mois par mois.</p>
    <a class="btn primary" href="#import">Importer un relevé</a>
    <button type="button" class="btn" data-action="demo">Essayer avec des données de démo</button>
  </section>`;
  root.onclick = (e) => {
    if (e.target.closest('[data-action="demo"]')) ctx.run(() => ctx.actions.loadDemo(), 'Données de démo chargées');
  };
}

export function renderMonth(root, ctx) {
  const { state } = ctx;
  if (!state.transactions.length) return renderEmpty(root, ctx);

  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const cat = (id) => byId.get(id) ?? { id, name: id, color: '#999999', icon: '•' };
  const months = listMonths(state.transactions);
  const s = monthSummary(state.transactions, state.month);

  const txList = (list) => `<ul class="tx-list">${list.map((t) => `<li><button type="button" class="tx" data-action="tx" data-id="${escapeHtml(t.id)}">`
    + `<span class="tx-date">${formatDay(t.date)}</span>`
    + `<span class="tx-merchant">${escapeHtml(t.merchant)}${t.categorySource === 'manual' ? ' ✎' : ''}${t.manualEntry ? ' <span class="badge">saisie</span>' : ''}</span>`
    + `<span class="tx-amount${t.amountCents > 0 ? ' pos' : ''}">${formatEuros(t.amountCents, { signed: true })}</span></button></li>`).join('')}</ul>`;

  const row = (g, sign) => {
    const c = cat(g.categoryId);
    const key = `${sign}:${g.categoryId}`;
    const open = state.openCategory === key;
    return `<li class="cat-row"><button type="button" class="cat-btn" data-action="toggle" data-key="${escapeHtml(key)}" aria-expanded="${open}">`
      + `<span class="dot" style="background:${escapeHtml(c.color)}"></span>`
      + `<span class="cat-name">${escapeHtml(c.icon)} ${escapeHtml(c.name)} <span class="muted small">· ${g.count}</span></span>`
      + `<span class="cat-amount">${formatEuros(g.totalCents)}</span>`
      + `<span class="cat-share">${formatPercent(g.share)}</span>`
      + `<span class="bar"><span style="width:${(g.share * 100).toFixed(1)}%;background:${escapeHtml(c.color)}"></span></span></button>`
      + `${open ? txList(transactionsFor(state.transactions, state.month, g.categoryId, sign)) : ''}</li>`;
  };

  const details = s.count === 0
    ? '<p class="empty-month">Aucune opération ce mois-ci.</p>'
    : `<section class="donut-wrap">${donutSvg(
      s.expenses.map((g) => ({ value: g.totalCents, color: cat(g.categoryId).color, label: cat(g.categoryId).name })),
      { label: formatEuros(s.spentCents), sublabel: 'dépensés' },
    )}</section>
      ${s.expenses.length ? `<h2>Dépenses</h2><ul class="cat-list">${s.expenses.map((g) => row(g, 'out')).join('')}</ul>` : ''}
      ${s.income.length ? `<h2>Entrées</h2><ul class="cat-list">${s.income.map((g) => row(g, 'in')).join('')}</ul>` : ''}`;

  root.innerHTML = `<header class="month-nav">
      <button type="button" class="icon-btn" data-action="prev" aria-label="Mois précédent" ${state.month > months.at(-1) ? '' : 'disabled'}>‹</button>
      <h1>${formatMonth(state.month)}</h1>
      <button type="button" class="icon-btn" data-action="next" aria-label="Mois suivant" ${state.month < months[0] ? '' : 'disabled'}>›</button>
    </header>
    <section class="cards">
      <div class="card"><span>Dépensé</span><strong>${formatEuros(s.spentCents)}</strong></div>
      <div class="card"><span>Reçu</span><strong class="pos">${formatEuros(s.incomeCents)}</strong></div>
      <div class="card"><span>Solde</span><strong class="${s.balanceCents >= 0 ? 'pos' : 'neg'}">${formatEuros(s.balanceCents, { signed: true })}</strong></div>
    </section>
    ${details}`;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'prev' || action === 'next') {
      state.month = shiftMonth(state.month, action === 'prev' ? -1 : 1);
      state.openCategory = null;
      ctx.render();
    } else if (action === 'toggle') {
      state.openCategory = state.openCategory === el.dataset.key ? null : el.dataset.key;
      ctx.render();
    } else if (action === 'tx') {
      openCategoryPicker(ctx, el.dataset.id);
    }
  };
}
