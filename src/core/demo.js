import { toTransactions } from './import.js';
import { shiftMonth } from './stats.js';

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoRows(endMonth, { months = 6, seed = 42, maxDay = 28 } = {}) {
  const rnd = mulberry32(seed);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const euros = (a, b) => -Math.round((a + rnd() * (b - a)) * 100);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const rows = [];
  for (let k = months - 1; k >= 0; k--) {
    const month = shiftMonth(endMonth, -k);
    const last = k === 0 ? Math.min(maxDay, 28) : 28;
    const dd = (d) => `${String(d).padStart(2, '0')}/${month.slice(5)}`;
    const add = (day, amountCents, label) => {
      if (day > last) return;
      rows.push({ date: `${month}-${String(day).padStart(2, '0')}`, amountCents, rawLabel: label });
    };
    const card = (day, amountCents, shop) => add(day, amountCents, `CARTE X1234 ${dd(day)} ${shop}`);

    add(1, 45000, 'VIR RECU 4512 DE: PARENTS MOTIF: VIREMENT MENSUEL');
    add(5, 18200, 'VIR RECU 7781 DE: CAF DU RHONE MOTIF: APL');
    add(3, -38000, 'PRLV SEPA CROUS LYON ECH/030 ID EMETTEUR/FR45ZZZ001');
    add(8, -1599, 'PRLV SEPA FREE MOBILE ECH/080 ID EMETTEUR/FR12ZZZ123456');
    card(12, -1199, 'SPOTIFY');
    card(15, -1399, 'NETFLIX.COM');
    card(2, -2520, 'TCL AGENCE');
    for (let i = int(6, 9); i > 0; i--) card(int(1, 28), euros(8, 55), pick(['CARREFOUR CITY LYON', 'LIDL', 'MONOPRIX LYON', 'AUCHAN', 'BOULANGERIE PAUL']));
    for (let i = int(2, 6); i > 0; i--) card(int(1, 28), euros(6, 24), pick(['UBER *EATS PARIS', 'DELIVEROO', 'MCDONALDS', 'CROUS RESTO U']));
    for (let i = int(1, 2); i > 0; i--) card(int(1, 28), euros(8, 30), pick(['PATHE BELLECOUR', 'BAR LE COMPTOIR', 'BOWLING STAR']));
    for (let i = int(0, 2); i > 0; i--) card(int(1, 28), euros(15, 60), pick(['AMAZON PAYMENTS', 'DECATHLON', 'FNAC']));
    if (rnd() < 0.5) card(int(1, 28), euros(20, 70), 'SNCF INTERNET');
    if (rnd() < 0.4) card(int(1, 28), euros(5, 25), 'PHARMACIE DU CENTRE');
    if (rnd() < 0.5) add(int(1, 28), pick([-2000, -4000]), `CARTE X1234 RETRAIT DAB ${dd(int(1, 28))} LYON`);
    if (rnd() < 0.5) add(int(1, 28), euros(10, 30), 'VIR EUROPEEN EMIS POUR: LUCAS MARTIN MOTIF: CADEAU');
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function demoTransactions(today, rules, importedAt = new Date().toISOString()) {
  const rows = demoRows(today.slice(0, 7), { maxDay: Number(today.slice(8, 10)) });
  return toTransactions(rows, rules, importedAt).map((t) => ({ ...t, demo: true }));
}
