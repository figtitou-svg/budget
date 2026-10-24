import { escapeHtml, formatDay, formatEuros } from './format.js';

export function openCategoryPicker(ctx, txId) {
  const { state } = ctx;
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return;
  const others = state.transactions.filter((t) => t.merchant === tx.merchant && t.id !== tx.id).length;
  const chips = state.categories.map((c) => `<button type="button" class="chip${c.id === tx.categoryId ? ' selected' : ''}" data-cat="${escapeHtml(c.id)}">`
    + `<span class="dot" style="background:${escapeHtml(c.color)}"></span>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</button>`).join('');
  ctx.sheet.open(
    `<h2>${escapeHtml(tx.merchant)}</h2>`
    + `<p class="muted">${formatDay(tx.date)} · ${formatEuros(tx.amountCents, { signed: true })}</p>`
    + `<p class="raw">${escapeHtml(tx.rawLabel)}</p>`
    + `<div class="cat-grid">${chips}</div>`,
    (body, close) => {
      body.addEventListener('click', async (e) => {
        const chip = e.target.closest('[data-cat]');
        if (!chip) return;
        const categoryId = chip.dataset.cat;
        close();
        if (categoryId === tx.categoryId) return;
        const name = state.categories.find((c) => c.id === categoryId)?.name ?? categoryId;
        const question = others > 0
          ? `Ranger aussi les ${others} autres opérations « ${tx.merchant} » dans ${name}, ainsi que les prochaines ?`
          : `Ranger aussi les prochaines opérations « ${tx.merchant} » dans ${name} ?`;
        const all = await ctx.sheet.confirm(question, 'Oui, toutes', 'Seulement celle-ci');
        ctx.run(() => ctx.actions.recategorize(tx.id, categoryId, { all }), all ? `Règle enregistrée pour ${tx.merchant}` : 'Catégorie modifiée');
      });
    },
  );
}
