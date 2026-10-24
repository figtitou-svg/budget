import { escapeHtml } from './format.js';

export function createSheets(doc = document) {
  const sheet = doc.getElementById('sheet');
  const confirmDialog = doc.getElementById('confirm');

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
  });

  function open(html, onMount) {
    const body = doc.createElement('div');
    body.className = 'sheet-body';
    body.innerHTML = `${html}<button type="button" class="btn ghost" data-close>Fermer</button>`;
    sheet.replaceChildren(body);
    sheet.showModal();
    const close = () => sheet.close();
    onMount?.(body, close);
    return close;
  }

  function confirm(message, yes = 'Confirmer', no = 'Annuler') {
    return new Promise((resolve) => {
      confirmDialog.innerHTML = `<form method="dialog" class="sheet-body"><p>${escapeHtml(message)}</p>`
        + `<div class="row"><button class="btn" value="no">${escapeHtml(no)}</button>`
        + `<button class="btn primary" value="yes">${escapeHtml(yes)}</button></div></form>`;
      confirmDialog.returnValue = '';
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'yes'), { once: true });
      confirmDialog.showModal();
    });
  }

  return { open, confirm };
}
