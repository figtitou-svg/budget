import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImportError } from '../src/core/errors.js';

test('ImportError porte un code, un message et des détails', () => {
  const e = new ImportError('NO_ROWS', 'Aucune opération', { a: 1 });
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'ImportError');
  assert.equal(e.code, 'NO_ROWS');
  assert.equal(e.message, 'Aucune opération');
  assert.deepEqual(e.details, { a: 1 });
  assert.deepEqual(new ImportError('X', 'y').details, {});
});
