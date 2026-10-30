// "-23.45" → -2345 sans passer par les flottants ; null si invalide.
export function toCents(amount) {
  const m = String(amount ?? '').trim().match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?\d*$/);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -cents : cents;
}

// Opération GoCardless → { id, date, amountCents, rawLabel } ; null si inutilisable.
export function mapTransaction(t) {
  const id = t?.transactionId ?? t?.internalTransactionId;
  const date = t?.bookingDate ?? t?.valueDate;
  const cents = toCents(t?.transactionAmount?.amount);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || cents === null || cents === 0) return null;
  if (t.transactionAmount.currency && t.transactionAmount.currency !== 'EUR') return null;
  const remittance = t.remittanceInformationUnstructured
    || (Array.isArray(t.remittanceInformationUnstructuredArray) ? t.remittanceInformationUnstructuredArray.join(' ') : '');
  const rawLabel = String(remittance || t.creditorName || t.debtorName || t.additionalInformation || 'OPERATION').replace(/\s+/g, ' ').trim();
  return { id: String(id), date, amountCents: cents, rawLabel };
}
