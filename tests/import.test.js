import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, parseStatement, toTransactions } from '../src/core/import.js';

const SG = [
  '="000123456789";Compte Bancaire;Solde au 24/10/2026;1 234,56 EUR',
  "Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise",
  '12/10/2026;CARTE X1234 12/10 CARREFOUR;CARTE X1234 12/10 CARREFOUR CITY LYON;-23,45;EUR',
  '11/10/2026;VIR RECU 1234567;VIR RECU 1234567 DE: CAF DU RHONE MOTIF: ALLOCATION;120,00;EUR',
  '10/10/2026;CARTE X1234 10/10 TRUC;CARTE X1234 10/10 TRUC BIZARRE;-7,00;EUR',
].join('\r\n');
const latin1 = (s) => new Uint8Array(Buffer.from(s, 'latin1'));
const NOW = '2026-10-24T08:00:00.000Z';

test('importe un CSV SG en Latin-1', () => {
  const plan = planImport(latin1(SG), { importedAt: NOW });
  assert.equal(plan.added.length, 3);
  assert.equal(plan.duplicateCount, 0);
  assert.equal(plan.uncategorizedCount, 1);
  const [carrefour, caf] = plan.added;
  assert.equal(carrefour.merchant, 'CARREFOUR CITY');
  assert.equal(carrefour.categoryId, 'courses');
  assert.equal(carrefour.categorySource, 'default');
  assert.equal(carrefour.importedAt, NOW);
  assert.match(carrefour.id, /^2026-10-12\|-2345\|.+#1$/);
  assert.equal(caf.categoryId, 'revenus');
});

test('réimporter le même relevé n’ajoute rien', () => {
  const first = planImport(latin1(SG), { importedAt: NOW });
  const again = planImport(latin1(SG), { existingIds: new Set(first.added.map((t) => t.id)) });
  assert.equal(again.added.length, 0);
  assert.equal(again.duplicateCount, 3);
});

test('applique les règles apprises', () => {
  const plan = planImport(latin1(SG), { rules: new Map([['CARREFOUR CITY', 'loisirs']]) });
  assert.equal(plan.added[0].categoryId, 'loisirs');
  assert.equal(plan.added[0].categorySource, 'rule');
});

test('refuse un fichier binaire et un fichier vide', () => {
  assert.throws(() => parseStatement(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02])), { code: 'NOT_TEXT' });
  assert.throws(() => parseStatement(new Uint8Array()), { code: 'EMPTY' });
  assert.throws(() => parseStatement(new TextEncoder().encode('  \n ')), { code: 'EMPTY' });
});

test('reconnaît l’OFX', () => {
  const ofx = 'OFXHEADER:100\n<OFX><STMTTRN><DTPOSTED>20261001<TRNAMT>-9.99<NAME>NETFLIX.COM</STMTTRN></OFX>';
  const plan = planImport(new TextEncoder().encode(ofx));
  assert.equal(plan.added.length, 1);
  assert.equal(plan.added[0].categoryId, 'abonnements');
});

test('passe le mapping au lecteur CSV', () => {
  const bytes = new TextEncoder().encode('Jour;Opération;Valeur\n12/10/2026;LIDL;-5,00');
  assert.throws(() => planImport(bytes), { code: 'NO_HEADER' });
  const plan = planImport(bytes, { mapping: { sep: ';', date: 0, labels: [1], amount: 2 } });
  assert.equal(plan.added[0].categoryId, 'courses');
  assert.equal(plan.skipped, 1);
});

test('toTransactions est réutilisable par une autre source', () => {
  const [t] = toTransactions([{ date: '2026-10-01', amountCents: -1599, rawLabel: 'PRLV SEPA FREE MOBILE' }], new Map(), NOW);
  assert.deepEqual(Object.keys(t).sort(), ['amountCents', 'categoryId', 'categorySource', 'date', 'id', 'importedAt', 'merchant', 'rawLabel']);
  assert.equal(t.categoryId, 'factures');
});
