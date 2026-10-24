export function buildMapping(roles, sep) {
  const first = (role) => roles.indexOf(role);
  const all = (role) => roles.map((r, i) => (r === role ? i : -1)).filter((i) => i >= 0);
  const date = first('date');
  const labels = all('label');
  if (date < 0) return { error: 'Choisis la colonne Date.' };
  if (!labels.length) return { error: 'Choisis au moins une colonne Libellé.' };
  if (first('amount') >= 0) return { mapping: { sep, date, labels, amount: first('amount') } };
  const debit = first('debit');
  const credit = first('credit');
  if (debit >= 0 || credit >= 0) return { mapping: { sep, date, labels, debit: debit >= 0 ? debit : null, credit: credit >= 0 ? credit : null } };
  return { error: 'Choisis la colonne Montant (ou Débit / Crédit).' };
}
