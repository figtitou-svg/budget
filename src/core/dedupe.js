export function fingerprint({ date, amountCents, rawLabel }) {
  return `${date}|${amountCents}|${String(rawLabel).toUpperCase().replace(/\s+/g, ' ').trim()}`;
}

export function assignIds(rows) {
  const counts = new Map();
  return rows.map((r) => {
    const fp = fingerprint(r);
    const n = (counts.get(fp) ?? 0) + 1;
    counts.set(fp, n);
    return { ...r, id: `${fp}#${n}` };
  });
}

export function splitNew(transactions, existingIds) {
  const added = [];
  const duplicates = [];
  for (const t of transactions) (existingIds.has(t.id) ? duplicates : added).push(t);
  return { added, duplicates };
}
