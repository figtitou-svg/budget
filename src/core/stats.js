export const monthOf = (date) => date.slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function listMonths(txs) {
  return [...new Set(txs.map((t) => monthOf(t.date)))].sort().reverse();
}

function groupByCategory(list, total) {
  const map = new Map();
  for (const t of list) {
    const g = map.get(t.categoryId) ?? { categoryId: t.categoryId, totalCents: 0, count: 0 };
    g.totalCents += Math.abs(t.amountCents);
    g.count++;
    map.set(t.categoryId, g);
  }
  return [...map.values()]
    .sort((a, b) => b.totalCents - a.totalCents)
    .map((g) => ({ ...g, share: total ? g.totalCents / total : 0 }));
}

export function monthSummary(txs, month) {
  const inMonth = txs.filter((t) => monthOf(t.date) === month);
  const out = inMonth.filter((t) => t.amountCents < 0);
  const inc = inMonth.filter((t) => t.amountCents > 0);
  const spentCents = out.reduce((s, t) => s - t.amountCents, 0);
  const incomeCents = inc.reduce((s, t) => s + t.amountCents, 0);
  return {
    month,
    spentCents,
    incomeCents,
    balanceCents: incomeCents - spentCents,
    count: inMonth.length,
    expenses: groupByCategory(out, spentCents),
    income: groupByCategory(inc, incomeCents),
  };
}

export function transactionsFor(txs, month, categoryId, sign) {
  return txs
    .filter((t) => monthOf(t.date) === month && t.categoryId === categoryId && (sign === 'out' ? t.amountCents < 0 : t.amountCents > 0))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function trend(txs, endMonth, count, categoryId = null) {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - count + 1));
  const index = new Map(months.map((m, i) => [m, i]));
  const byCat = new Map();
  for (const t of txs) {
    if (t.amountCents >= 0 || (categoryId && t.categoryId !== categoryId)) continue;
    const i = index.get(monthOf(t.date));
    if (i === undefined) continue;
    const values = byCat.get(t.categoryId) ?? Array(count).fill(0);
    values[i] -= t.amountCents;
    byCat.set(t.categoryId, values);
  }
  const series = [...byCat]
    .map(([id, values]) => ({ categoryId: id, values, total: values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  const totals = months.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const firstMonth = listMonths(txs).at(-1);
  const previous = months.slice(0, -1).map((m, i) => [m, totals[i]]).filter(([m]) => firstMonth && m >= firstMonth);
  const averageCents = previous.length ? Math.round(previous.reduce((s, [, v]) => s + v, 0) / previous.length) : null;
  const currentCents = totals[count - 1];
  return { months, series, totals, averageCents, currentCents, deltaCents: averageCents == null ? null : currentCents - averageCents };
}
