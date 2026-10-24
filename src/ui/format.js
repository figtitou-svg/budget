const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const EUR_SIGNED = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const utc = (y, m, d = 1) => new Date(Date.UTC(y, m - 1, d));

export function formatEuros(cents, { signed = false } = {}) {
  return (signed ? EUR_SIGNED : EUR).format(cents / 100);
}

export function formatMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return MONTH.format(utc(y, m));
}

export function formatMonthShort(month) {
  const [y, m] = month.split('-').map(Number);
  return MONTH_SHORT.format(utc(y, m));
}

export function formatDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return DAY.format(utc(y, m, d));
}

export function formatPercent(share) {
  if (share > 0 && share < 0.005) return '<1 %';
  return `${Math.round(share * 100)} %`;
}

const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML[c]);
}
