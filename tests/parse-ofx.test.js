import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOfx, parseOfx } from '../src/core/parse-ofx.js';

const SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261012
<TRNAMT>-23.45
<FITID>1
<NAME>CARTE X1234 12/10 CARREFOUR
<MEMO>CARREFOUR CITY LYON
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261011120000[+1:CET]
<TRNAMT>120,00
<NAME>VIR RECU DE: CAF DU RHONE
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('détecte l’OFX', () => {
  assert.equal(isOfx(SGML), true);
  assert.equal(isOfx('<?xml version="1.0"?><OFX></OFX>'), true);
  assert.equal(isOfx('Date;Libellé;Montant'), false);
});

test('lit l’OFX SGML', () => {
  const { rows, skipped } = parseOfx(SGML);
  assert.equal(skipped, 0);
  assert.deepEqual(rows, [
    { date: '2026-10-12', amountCents: -2345, rawLabel: 'CARTE X1234 12/10 CARREFOUR CARREFOUR CITY LYON' },
    { date: '2026-10-11', amountCents: 12000, rawLabel: 'VIR RECU DE: CAF DU RHONE' },
  ]);
});

test('lit l’OFX XML et décode les entités', () => {
  const xml = '<OFX><STMTTRN><DTPOSTED>20260930</DTPOSTED><TRNAMT>-9.99</TRNAMT><NAME>NETFLIX &amp; CO</NAME></STMTTRN>'
    + '<STMTTRN><DTPOSTED>20260931</DTPOSTED><TRNAMT>-1.00</TRNAMT><NAME>BAD DATE</NAME></STMTTRN></OFX>';
  const { rows, skipped } = parseOfx(xml);
  assert.deepEqual(rows, [{ date: '2026-09-30', amountCents: -999, rawLabel: 'NETFLIX & CO' }]);
  assert.equal(skipped, 1);
});

test('sans opération → NO_ROWS', () => {
  assert.throws(() => parseOfx('<OFX></OFX>'), { code: 'NO_ROWS' });
});
