import { escapeHtml } from './format.js';
import { parseAmountCents } from '../core/manual.js';

export function openAddExpense(ctx) {
  const { state } = ctx;
  const options = state.categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
  ctx.sheet.open(
    `<h2>Nouvelle opération</h2>
    <form class="stack" data-form novalidate>
      <div class="seg full" role="group" aria-label="Type">
        <button type="button" data-kind="out" aria-pressed="true">Dépense</button>
        <button type="button" data-kind="in" aria-pressed="false">Entrée</button>
      </div>
      <label class="field">Montant (€)<input name="amount" inputmode="decimal" autocomplete="off" placeholder="12,50" required></label>
      <label class="field">Commerçant ou libellé<input name="label" type="text" autocomplete="off" maxlength="60" placeholder="Boulangerie, Uber, Carrefour…" required></label>
      <label class="field">Date<input name="date" type="date" value="${escapeHtml(ctx.today())}" max="${escapeHtml(ctx.today())}" required></label>
      <label class="field">Catégorie<select name="category"><option value="">Automatique (selon le libellé)</option>${options}</select></label>
      <p class="error" data-error hidden></p>
      <button type="submit" class="btn primary">Ajouter</button>
    </form>`,
    (body, close) => {
      const form = body.querySelector('[data-form]');
      const error = body.querySelector('[data-error]');
      let kind = 'out';
      body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-kind]');
        if (!btn) return;
        kind = btn.dataset.kind;
        body.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = form.elements;
        const cents = parseAmountCents(f.amount.value);
        const label = f.label.value.trim();
        const problem = cents === null ? 'Montant invalide (ex. 12,50).'
          : !label ? 'Indique un commerçant ou un libellé.'
            : !f.date.value ? 'Indique une date.' : '';
        error.textContent = problem;
        error.hidden = !problem;
        if (problem) return;
        close();
        ctx.run(
          () => ctx.actions.addManual({ amountCents: kind === 'out' ? -cents : cents, label, date: f.date.value, categoryId: f.category.value }),
          'Opération ajoutée',
        );
      });
      form.elements.amount.focus();
    },
  );
}
