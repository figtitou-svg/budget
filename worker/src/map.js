// "23.45" → 2345 sans passer par les flottants ; null si invalide.
export function toCents(amount) {
  const m = String(amount ?? '').trim().match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?\d*$/);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -cents : cents;
}

const label = (t, debit) => {
  const text = Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : '';
  const party = debit ? t.creditor?.name : t.debtor?.name;
  return String(text || party || t.note || 'OPERATION').replace(/\s+/g, ' ').trim();
};

// Fabrique la conversion « opération Enable Banking → { id, date, amountCents, rawLabel } » pour un compte.
// `tag` identifie le compte de façon stable d'une session à l'autre (extrait de identification_hash).
// Les opérations en attente sont ignorées : elles n'ont pas d'identifiant durable.
export function rowMapper(tag) {
  const seen = new Map();
  return (t) => {
    if (t?.status !== 'BOOK') return null;
    const date = t.booking_date ?? t.transaction_date ?? t.value_date;
    const raw = toCents(t.transaction_amount?.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || raw === null || raw === 0) return null;
    if (t.transaction_amount.currency && t.transaction_amount.currency !== 'EUR') return null;
    // Le montant est donné positif : c'est credit_debit_indicator qui dit le sens.
    const debit = t.credit_debit_indicator === 'DBIT';
    const amountCents = t.credit_debit_indicator ? (debit ? -Math.abs(raw) : Math.abs(raw)) : raw;
    const rawLabel = label(t, amountCents < 0);
    let id;
    if (t.entry_reference) {
      id = `${tag}:${t.entry_reference}`;
    } else {
      const fp = `${tag}|${date}|${amountCents}|${rawLabel}`;
      const n = (seen.get(fp) ?? 0) + 1;
      seen.set(fp, n);
      id = `${fp}#${n}`;
    }
    return { id, date, amountCents, rawLabel };
  };
}

// Partie stable d'identification_hash (le préfixe est identique pour tous les comptes).
export const accountTag = (hash) => String(hash ?? '').split('.').pop().slice(0, 12);
