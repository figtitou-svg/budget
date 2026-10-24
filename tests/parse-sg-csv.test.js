import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseDate, splitCsvLine, detectColumns, joinLabels, parseSgCsv } from '../src/core/parse-sg-csv.js';

test('parseAmount lit les formats français et anglais', () => {
  const cases = [['-23,45', -2345], ['1 234,56', 123456], ['1.234,56', 123456], ['12.5', 1250], ['+3', 300],
    ['1 000,00', 100000], ['-5,20 EUR', -520], ['12,00 €', 1200], ['', null], ['abc', null], [undefined, null]];
  for (const [input, expected] of cases) assert.equal(parseAmount(input), expected, String(input));
});

test('parseDate normalise en YYYY-MM-DD et rejette les dates impossibles', () => {
  assert.equal(parseDate('12/10/2026'), '2026-10-12');
  assert.equal(parseDate('1/2/26'), '2026-02-01');
  assert.equal(parseDate('2026-10-12'), '2026-10-12');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('13/13/2026'), null);
  assert.equal(parseDate('x'), null);
});

test('splitCsvLine gère guillemets, ="…" et séparateur dans un champ', () => {
  assert.deepEqual(splitCsvLine('="12/10/2026";"CARTE X1234 LIDL; LYON";"a ""b"""', ';'),
    ['12/10/2026', 'CARTE X1234 LIDL; LYON', 'a "b"']);
});

test('joinLabels garde le libellé le plus complet et ajoute les compléments', () => {
  assert.equal(joinLabels(['CARTE X1234 12/10 CARREFOUR', 'CARTE X1234 12/10 CARREFOUR CITY LYON']), 'CARTE X1234 12/10 CARREFOUR CITY LYON');
  assert.equal(joinLabels(['UBER EATS', 'CARTE X1234 14/10 UBER *EATS PARIS']), 'CARTE X1234 14/10 UBER *EATS PARIS');
  assert.equal(joinLabels(['PRLV SEPA', 'FREE MOBILE']), 'PRLV SEPA FREE MOBILE');
  assert.equal(joinLabels(['', '  ']), '');
});

const SG_CLASSIQUE = [
  '="000123456789";Compte Bancaire;Solde au 24/10/2026;1 234,56 EUR',
  '',
  "Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise",
  '12/10/2026;CARTE X1234 12/10 CARREFOUR;CARTE X1234 12/10 CARREFOUR CITY LYON;-23,45;EUR',
  '11/10/2026;VIR RECU 1234567;VIR RECU 1234567 DE: CAF DU RHONE MOTIF: ALLOCATION;120,00;EUR',
  '10/10/2026;PRLV SEPA FREE MOBILE;PRLV SEPA FREE MOBILE ECH/101026 ID EMETTEUR/FR12ZZZ;-15,99;EUR',
  '',
].join('\r\n');

test('lit le format SG classique', () => {
  const { rows, skipped } = parseSgCsv(SG_CLASSIQUE);
  assert.equal(skipped, 0);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { date: '2026-10-12', amountCents: -2345, rawLabel: 'CARTE X1234 12/10 CARREFOUR CITY LYON' });
  assert.equal(rows[1].amountCents, 12000);
  assert.equal(rows[2].rawLabel, 'PRLV SEPA FREE MOBILE ECH/101026 ID EMETTEUR/FR12ZZZ');
});

test('lit le format Débit/Crédit et préfère la date d’opération', () => {
  const text = [
    'Date de comptabilisation;Libellé simplifié;Libellé opération;Référence;Débit;Crédit;Date opération',
    '15/10/2026;UBER EATS;CARTE X1234 14/10 UBER *EATS PARIS;REF1;-18,90;;14/10/2026',
    '16/10/2026;SALAIRE;VIR RECU DE: ACME MOTIF: SALAIRE;REF2;;850,00;16/10/2026',
    'Solde au 16/10/2026;;;;;;',
  ].join('\n');
  const { rows, skipped } = parseSgCsv(text);
  assert.equal(skipped, 1);
  assert.deepEqual(rows[0], { date: '2026-10-14', amountCents: -1890, rawLabel: 'CARTE X1234 14/10 UBER *EATS PARIS' });
  assert.deepEqual(rows[1], { date: '2026-10-16', amountCents: 85000, rawLabel: 'VIR RECU DE: ACME MOTIF: SALAIRE' });
});

test('débit positif est quand même une dépense', () => {
  const text = 'Date;Libellé;Débit;Crédit\n01/10/2026;LOYER;380,00;';
  assert.equal(parseSgCsv(text).rows[0].amountCents, -38000);
});

test('cellules entre guillemets et montants suffixés EUR', () => {
  const text = ['"Date";"Libellé";"Montant"', '="12/10/2026";"CARTE X1234 12/10 LIDL; LYON";"-5,20 EUR"'].join('\n');
  assert.deepEqual(parseSgCsv(text).rows, [{ date: '2026-10-12', amountCents: -520, rawLabel: 'CARTE X1234 12/10 LIDL; LYON' }]);
});

test('detectColumns renvoie null sans colonne date', () => {
  assert.equal(detectColumns(['Jour', 'Opération', 'Valeur']), null);
  assert.deepEqual(detectColumns(['Date', 'Libellé', 'Montant']), { date: 0, labels: [1], amount: 2 });
});

test('en-tête inconnu → NO_HEADER avec aperçu', () => {
  const text = 'Jour;Opération;Valeur\n12/10/2026;LIDL;-5,00\n13/10/2026;SNCF;-20,00';
  assert.throws(() => parseSgCsv(text), (e) => {
    assert.equal(e.code, 'NO_HEADER');
    assert.equal(e.details.sep, ';');
    assert.equal(e.details.preview.length, 3);
    assert.deepEqual(e.details.preview[1], ['12/10/2026', 'LIDL', '-5,00']);
    return true;
  });
});

test('avec un mapping, lit les lignes et ignore l’en-tête', () => {
  const text = 'Jour;Opération;Valeur\n12/10/2026;LIDL;-5,00\n13/10/2026;SNCF;-20,00';
  const { rows, skipped } = parseSgCsv(text, { mapping: { sep: ';', date: 0, labels: [1], amount: 2 } });
  assert.equal(rows.length, 2);
  assert.equal(skipped, 1);
  assert.deepEqual(rows[1], { date: '2026-10-13', amountCents: -2000, rawLabel: 'SNCF' });
});

test('aucune ligne exploitable → NO_ROWS', () => {
  assert.throws(() => parseSgCsv('Date;Libellé;Montant\n'), { code: 'NO_ROWS' });
});
