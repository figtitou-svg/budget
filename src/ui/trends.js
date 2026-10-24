import { trend, listMonths } from '../core/stats.js';
import { INCOME_CATEGORY_IDS } from '../core/categories.js';
import { stackedBarsSvg } from './charts.js';
import { formatEuros, formatMonth, formatMonthShort, escapeHtml } from './format.js';

export function renderTrends(root, ctx) {
  const { state } = ctx;
  if (!state.transactions.length) {
    root.innerHTML = `<section class="empty"><h1>Évolution</h1>
      <p class="muted">Importe un relevé pour voir l’évolution de tes dépenses mois par mois.</p>
      <a class="btn primary" href="#import">Importer un relevé</a></section>`;
    return;
  }
  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const cat = (id) => byId.get(id) ?? { id, name: id, color: '#999999', icon: '•' };
  const end = listMonths(state.transactions)[0];
  const t = trend(state.transactions, end, state.trendWindow, state.trendCategory || null);
  const options = state.categories.filter((c) => !INCOME_CATEGORY_IDS.includes(c.id))
    .map((c) => `<option value="${escapeHtml(c.id)}"${state.trendCategory === c.id ? ' selected' : ''}>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
  const chart = stackedBarsSvg({
    labels: t.months.map(formatMonthShort),
    series: t.series.map((s) => ({ values: s.values, color: cat(s.categoryId).color, title: cat(s.categoryId).name })),
    averageCents: t.averageCents,
  });
  const dash = '—';

  root.innerHTML = `<header class="page-head"><h1>Évolution</h1></header>
    <div class="controls">
      <div class="seg" role="group" aria-label="Période">${[6, 12].map((n) => `<button type="button" data-action="window" data-n="${n}" aria-pressed="${state.trendWindow === n}">${n} mois</button>`).join('')}</div>
      <select data-action="category" aria-label="Catégorie"><option value="">Toutes les catégories</option>${options}</select>
    </div>
    <section class="chart">${chart}</section>
    <section class="cards">
      <div class="card"><span>${formatMonth(end)}</span><strong>${formatEuros(t.currentCents)}</strong></div>
      <div class="card"><span>Moyenne</span><strong>${t.averageCents == null ? dash : formatEuros(t.averageCents)}</strong></div>
      <div class="card"><span>Écart</span><strong class="${(t.deltaCents ?? 0) > 0 ? 'neg' : 'pos'}">${t.deltaCents == null ? dash : formatEuros(t.deltaCents, { signed: true })}</strong></div>
    </section>
    <p class="muted small">Moyenne des mois précédents de la période (ligne pointillée). Un écart positif = tu dépenses plus que d’habitude.</p>
    ${t.series.length ? `<h2>Par catégorie</h2><ul class="legend">${t.series.map((s) => `<li><span class="dot" style="background:${escapeHtml(cat(s.categoryId).color)}"></span>${escapeHtml(cat(s.categoryId).name)}<span>${formatEuros(s.total)}</span></li>`).join('')}</ul>` : '<p class="empty-month">Aucune dépense sur la période.</p>'}`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-action="window"]');
    if (!b) return;
    state.trendWindow = Number(b.dataset.n);
    ctx.render();
  };
  root.onchange = (e) => {
    if (!e.target.matches('[data-action="category"]')) return;
    state.trendCategory = e.target.value;
    ctx.render();
  };
}
