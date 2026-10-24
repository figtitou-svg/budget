import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapping } from '../src/core/mapping.js';

test('mapping avec montant', () => {
  assert.deepEqual(buildMapping(['date', 'label', '', 'amount', 'label'], ';'),
    { mapping: { sep: ';', date: 0, labels: [1, 4], amount: 3 } });
});
test('mapping débit / crédit', () => {
  assert.deepEqual(buildMapping(['label', 'date', 'debit', 'credit'], ','),
    { mapping: { sep: ',', date: 1, labels: [0], debit: 2, credit: 3 } });
  assert.deepEqual(buildMapping(['label', 'date', 'debit'], ';').mapping.credit, null);
});
test('erreurs explicites', () => {
  assert.equal(buildMapping(['label', 'amount'], ';').error, 'Choisis la colonne Date.');
  assert.equal(buildMapping(['date', 'amount'], ';').error, 'Choisis au moins une colonne Libellé.');
  assert.equal(buildMapping(['date', 'label'], ';').error, 'Choisis la colonne Montant (ou Débit / Crédit).');
});
