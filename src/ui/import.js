import { escapeHtml } from './format.js';
import { buildMapping } from '../core/mapping.js';

const ROLES = [['', 'Ignorer'], ['date', 'Date'], ['label', 'Libellé'], ['amount', 'Montant'], ['debit', 'Débit'], ['credit', 'Crédit']];

function mappingHtml(p) {
  const cols = Math.max(...p.preview.map((r) => r.length));
  const range = Array.from({ length: cols }, (_, i) => i);
  return `<section class="mapping">
    <h2>Aide-moi à lire ce fichier</h2>
    <p class="muted small">Je n’ai pas reconnu les colonnes de « ${escapeHtml(p.filename)} ». Indique ce que contient chaque colonne, je m’en souviendrai.</p>
    <div class="table-scroll"><table>
      <thead><tr>${range.map((i) => `<th><select data-col="${i}" aria-label="Contenu de la colonne ${i + 1}">${ROLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></th>`).join('')}</tr></thead>
      <tbody>${p.preview.map((r) => `<tr>${range.map((i) => `<td>${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="error" data-role="mapping-error" hidden></p>
    <div class="row"><button type="button" class="btn" data-action="cancel-mapping">Annuler</button><button type="button" class="btn primary" data-action="apply-mapping">Importer</button></div>
  </section>`;
}

function summaryHtml(s) {
  if (!s) return '';
  return `<section class="summary" role="status"><h2>Dernier import</h2><ul>
    <li><strong>${s.added}</strong> opérations ajoutées</li>
    <li><strong>${s.duplicates}</strong> doublons ignorés</li>
    ${s.skipped ? `<li><strong>${s.skipped}</strong> lignes ignorées (en-têtes, soldes…)</li>` : ''}
    ${s.removedDemo ? '<li>Données de démo retirées</li>' : ''}
    ${s.uncategorized ? `<li><strong>${s.uncategorized}</strong> non catégorisées → <a href="#mois" data-action="see-uncat">les classer</a></li>` : ''}
  </ul></section>`;
}

export function renderImport(root, ctx) {
  const { state } = ctx;
  const hasReal = state.transactions.some((t) => !t.demo);
  const hasDemo = state.transactions.some((t) => t.demo);
  const hasAny = state.transactions.length > 0;

  root.innerHTML = `<header class="page-head"><h1>Import</h1></header>
    ${state.pendingMapping ? mappingHtml(state.pendingMapping) : `
      <label class="btn primary big file-btn">Importer un relevé
        <input type="file" class="visually-hidden" accept=".csv,.ofx,.qfx,.txt,text/csv" data-action="file">
      </label>
      <p class="muted small">CSV ou OFX exporté depuis Société Générale. Rien ne quitte ton appareil.</p>`}
    ${summaryHtml(state.lastSummary)}
    <details class="help"><summary>Comment exporter mon relevé SG ?</summary><ol>
      <li>Connecte-toi sur <strong>particuliers.sg.fr</strong> depuis un navigateur et ouvre ton compte courant.</li>
      <li>Cherche « Télécharger » ou « Exporter mes opérations », choisis le format <strong>CSV</strong> (ou OFX / Money).</li>
      <li>Choisis la période, télécharge le fichier, puis importe-le ici.</li>
      <li>Tu peux réimporter des périodes qui se chevauchent : les doublons sont ignorés.</li>
    </ol></details>
    <h2>Catégories</h2>
    <ul class="cat-edit">${state.categories.map((c) => `<li>
      <input type="color" value="${escapeHtml(c.color)}" data-action="cat-color" data-id="${escapeHtml(c.id)}" aria-label="Couleur de ${escapeHtml(c.name)}">
      <span class="icon" aria-hidden="true">${escapeHtml(c.icon)}</span>
      <input type="text" value="${escapeHtml(c.name)}" maxlength="30" data-action="cat-name" data-id="${escapeHtml(c.id)}" aria-label="Nom de la catégorie">
    </li>`).join('')}</ul>
    <h2>Données</h2>
    <div class="stack">
      <button type="button" class="btn" data-action="export"${hasAny ? '' : ' disabled'}>Exporter une sauvegarde (JSON)</button>
      <label class="btn file-btn">Restaurer une sauvegarde
        <input type="file" class="visually-hidden" accept=".json,application/json" data-action="restore">
      </label>
      ${hasDemo ? '<button type="button" class="btn" data-action="remove-demo">Retirer les données de démo</button>' : ''}
      ${!hasAny ? '<button type="button" class="btn" data-action="demo">Charger des données de démo</button>' : ''}
      <button type="button" class="btn danger" data-action="clear"${hasAny ? '' : ' disabled'}>Tout effacer</button>
    </div>
    <p class="muted small">Tes données restent dans ce navigateur, sur cet appareil${hasReal ? '. Pense à exporter une sauvegarde de temps en temps' : ''}.</p>`;

  root.onchange = async (e) => {
    const el = e.target;
    const action = el.dataset.action;
    if (action === 'file' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      await ctx.run(() => ctx.actions.importFile(file), (r) => (r ? `${r.added} opérations ajoutées` : null));
    } else if (action === 'restore' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      let data;
      try {
        data = await ctx.actions.readBackup(file);
      } catch (err) {
        ctx.toast(err.message);
        return;
      }
      if (await ctx.sheet.confirm(`Remplacer toutes les données de cet appareil par cette sauvegarde (${data.transactions.length} opérations) ?`, 'Remplacer', 'Annuler')) {
        await ctx.run(() => ctx.actions.applyBackup(data), 'Sauvegarde restaurée');
      }
    } else if (action === 'cat-color' || action === 'cat-name') {
      const patch = action === 'cat-color' ? { color: el.value } : { name: el.value };
      await ctx.run(() => ctx.actions.saveCategory(el.dataset.id, patch), null);
    }
  };

  root.onclick = async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'apply-mapping': {
        const p = state.pendingMapping;
        const roles = [...root.querySelectorAll('select[data-col]')].map((s) => s.value);
        const { mapping, error } = buildMapping(roles, p.sep);
        if (error) {
          const box = root.querySelector('[data-role="mapping-error"]');
          box.textContent = error;
          box.hidden = false;
          return;
        }
        await ctx.run(() => ctx.actions.importBytes(p.bytes, { mapping }), (r) => `${r.added} opérations ajoutées`);
        break;
      }
      case 'cancel-mapping':
        state.pendingMapping = null;
        ctx.render();
        break;
      case 'export':
        await ctx.run(() => ctx.actions.downloadBackup(), 'Sauvegarde exportée');
        break;
      case 'demo':
        await ctx.run(() => ctx.actions.loadDemo(), 'Données de démo chargées');
        break;
      case 'remove-demo':
        await ctx.run(() => ctx.actions.removeDemo(), 'Données de démo retirées');
        break;
      case 'clear':
        if (await ctx.sheet.confirm('Effacer toutes les opérations, règles et réglages de cet appareil ? C’est définitif.', 'Tout effacer', 'Annuler')) {
          await ctx.run(() => ctx.actions.clearAll(), 'Données effacées');
        }
        break;
      case 'see-uncat':
        state.openCategory = 'out:autre';
        break;
    }
  };
}
