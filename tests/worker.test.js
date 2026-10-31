import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, rowMapper, accountTag } from '../worker/src/map.js';
import { pemToDer, signJwt, pickAspsp, KeyError } from '../worker/src/enablebanking.js';
import { handle } from '../worker/src/index.js';

// Clé de test : paire RSA fraîchement générée, exportée comme le fait le Control Panel (PKCS#8 PEM).
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
export const TEST_PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const APP_ID = '002ee6b7-3313-49f2-966e-f856478d7a3f';

test('toCents sans erreur de flottant', () => {
  assert.equal(toCents('23.45'), 2345);
  assert.equal(toCents('-23.45'), -2345);
  assert.equal(toCents('0.1'), 10);
  assert.equal(toCents('1200'), 120000);
  assert.equal(toCents('19.999'), 1999);
  for (const bad of ['', 'abc', null, '1,5']) assert.equal(toCents(bad), null, String(bad));
});

const tx = (extra) => ({ status: 'BOOK', booking_date: '2026-10-12', transaction_amount: { amount: '23.45', currency: 'EUR' }, credit_debit_indicator: 'DBIT', entry_reference: 'E1', remittance_information: ['CARTE X1234  12/10 CARREFOUR CITY'], ...extra });

test('rowMapper : le sens vient de credit_debit_indicator, pas du signe', () => {
  const map = rowMapper('TAG');
  assert.deepEqual(map(tx()), { id: 'TAG:E1', date: '2026-10-12', amountCents: -2345, rawLabel: 'CARTE X1234 12/10 CARREFOUR CITY' });
  assert.equal(map(tx({ credit_debit_indicator: 'CRDT', entry_reference: 'E2' })).amountCents, 2345);
  assert.equal(map(tx({ transaction_amount: { amount: '-23.45', currency: 'EUR' }, entry_reference: 'E3' })).amountCents, -2345);
});

test('rowMapper : libellé de repli, dates de repli, opérations ignorées', () => {
  const map = rowMapper('T');
  assert.equal(map(tx({ remittance_information: [], creditor: { name: 'Boulangerie' }, entry_reference: 'a' })).rawLabel, 'Boulangerie');
  assert.equal(map(tx({ remittance_information: undefined, credit_debit_indicator: 'CRDT', debtor: { name: 'Jean' }, entry_reference: 'b' })).rawLabel, 'Jean');
  assert.equal(map(tx({ remittance_information: ['A', 'B'], entry_reference: 'c' })).rawLabel, 'A B');
  assert.equal(map(tx({ booking_date: undefined, transaction_date: '2026-10-10', entry_reference: 'd' })).date, '2026-10-10');
  assert.equal(map(tx({ status: 'PDNG', entry_reference: 'e' })), null);
  assert.equal(map(tx({ transaction_amount: { amount: '5.00', currency: 'USD' }, entry_reference: 'f' })), null);
  assert.equal(map(tx({ booking_date: 'hier', transaction_date: undefined, value_date: undefined, entry_reference: 'g' })), null);
  assert.equal(map(tx({ transaction_amount: { amount: '0.00', currency: 'EUR' }, entry_reference: 'h' })), null);
});

test('rowMapper : sans entry_reference, ids déterministes numérotés', () => {
  const map = rowMapper('T');
  const a = map(tx({ entry_reference: undefined }));
  const b = map(tx({ entry_reference: undefined }));
  assert.notEqual(a.id, b.id);
  assert.ok(a.id.endsWith('#1') && b.id.endsWith('#2'));
});

test('accountTag : garde la partie propre au compte', () => {
  assert.equal(accountTag('WwpbCiJhY2NvdW50.ABCDEFGHIJKLMNOP='), 'ABCDEFGHIJKL');
  assert.notEqual(accountTag('PREFIX.AAAAAAAAAAAAAAAA'), accountTag('PREFIX.BBBBBBBBBBBBBBBB'));
});

test('signJwt : RS256, en-tête kid, corps conforme, signature vérifiable', async () => {
  const jwt = await signJwt({ appId: APP_ID, privateKey: TEST_PEM, now: 1_700_000_000_000 });
  const [h, b, s] = jwt.split('.');
  const dec = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { typ: 'JWT', alg: 'RS256', kid: APP_ID });
  assert.deepEqual(dec(b), { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: 1_700_000_000, exp: 1_700_003_600 });
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${b}`)));
  assert.ok(!jwt.includes('=') && !jwt.includes('+') && !jwt.includes('/'));
});

test('pemToDer : clé PKCS#1, texte quelconque et \\n littéraux', () => {
  assert.throws(() => pemToDer('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----'), (e) => e instanceof KeyError && /openssl pkcs8/.test(e.message));
  assert.throws(() => pemToDer('n importe quoi'), KeyError);
  assert.throws(() => pemToDer(''), KeyError);
  assert.deepEqual(pemToDer(TEST_PEM.replaceAll('\n', '\\n')), pemToDer(TEST_PEM)); // secret saisi avec des \n échappés
});

test('pickAspsp : Société Générale particuliers, sans accents ni casse', () => {
  const list = [
    { name: 'Société Générale Entreprises', psu_types: ['business'] },
    { name: 'Société Générale', psu_types: ['business'] },
    { name: 'Société Générale', psu_types: ['personal'], id: 'ok' },
  ];
  assert.equal(pickAspsp(list, { name: 'societe generale' }).id, 'ok');
  assert.equal(pickAspsp(list, { name: 'BNP Paribas' }), null);
});

// --- Worker de bout en bout avec un KV et une API Enable Banking factices ---
const kvStub = () => {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
};
const T0 = Date.parse('2026-10-30T08:00:00Z');
const H = 3_600_000;
const DAY = 24 * H;
const HASH = (c) => `WwpbCiJhY2NvdW50.${c.repeat(20)}`;

function setup({ transactions, key = TEST_PEM } = {}) {
  const calls = [];
  const behaviour = { transactions: transactions ?? (async () => ({ status: 200, body: { transactions: [tx({ entry_reference: 'T1' })], continuation_key: null } })) };
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    calls.push({ method: init.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization });
    const reply = (status, body) => new Response(JSON.stringify(body), { status });
    if (u.pathname === '/aspsps') return reply(200, { aspsps: [{ name: 'Société Générale Entreprises', country: 'FR', psu_types: ['business'], maximum_consent_validity: 100 }, { name: 'Société Générale', country: 'FR', psu_types: ['personal'], maximum_consent_validity: 15552000 }] });
    if (u.pathname === '/auth') return reply(200, { url: 'https://bank.example/consent', authorization_id: 'A1' });
    if (u.pathname === '/sessions') {
      return init.body && JSON.parse(init.body).code === 'GOOD'
        ? reply(200, { session_id: 'S1', accounts: [{ uid: 'U1', identification_hash: HASH('A'), cash_account_type: 'CACC', account_id: { iban: 'FR7600000000001234' } }, { uid: 'U2', identification_hash: HASH('B'), cash_account_type: 'CARD', details: 'Carte' }], access: { valid_until: new Date(T0 + 170 * DAY).toISOString() } })
        : reply(422, { error: 'WRONG_AUTHORIZATION_CODE', message: 'wrong' });
    }
    const m = u.pathname.match(/^\/accounts\/(U\d)\/transactions$/);
    if (m) { const r = await behaviour.transactions(m[1], Object.fromEntries(u.searchParams)); return reply(r.status, r.body); }
    return reply(404, {});
  };
  const env = { BUDGET: kvStub(), APP_TOKEN: 'secret', EB_APP_ID: APP_ID, EB_PRIVATE_KEY: key, APP_URL: 'https://app/', APP_ORIGIN: 'https://app', MIN_REFRESH_MINUTES: '360' };
  const call = async (path, now, { method = 'GET', token = 'secret', body } = {}) => {
    const req = new Request(`https://w.example${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const r = await handle(req, env, { now, fetchFn });
    return { status: r.status, body: await r.json(), headers: r.headers };
  };
  // Parcours complet : lien → retour de la banque (état renvoyé tel quel) → session.
  const link = async (now = T0) => {
    await call('/api/link', now, { method: 'POST' });
    const state = calls.findLast((c) => c.path === '/auth').body.state;
    return call('/api/session', now, { method: 'POST', body: { code: 'GOOD', state } });
  };
  return { env, calls, call, link, behaviour };
}

test('worker : refuse sans jeton, avec un mauvais jeton, ou sans APP_TOKEN ; CORS limité', async () => {
  const { call, env } = setup();
  assert.equal((await call('/api/status', T0, { token: '' })).status, 401);
  assert.equal((await call('/api/status', T0, { token: 'nope' })).status, 401);
  const ok = await call('/api/status', T0);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app');
  delete env.APP_TOKEN;
  assert.equal((await call('/api/status', T0, { token: '' })).status, 401);
});

test('worker : non configuré ou clé illisible → erreur claire, pas de secret dans la réponse', async () => {
  const none = setup();
  delete none.env.EB_PRIVATE_KEY;
  assert.equal((await none.call('/api/status', T0)).body.error, 'not_configured');
  const bad = setup({ key: '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----' });
  const r = await bad.call('/api/link', T0, { method: 'POST' });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, 'bad_private_key');
  assert.ok(!JSON.stringify(r.body).includes('AAAA'));
});

test('worker : démarre le consentement avec les bons paramètres', async () => {
  const { call, calls } = setup();
  assert.equal((await call('/api/transactions', T0)).body.status, 'not_linked');
  const r = await call('/api/link', T0, { method: 'POST' });
  assert.equal(r.body.link, 'https://bank.example/consent');
  const auth = calls.find((c) => c.path === '/auth');
  assert.equal(auth.method, 'POST');
  assert.match(auth.auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.deepEqual(auth.body.aspsp, { name: 'Société Générale', country: 'FR' }); // pas la version « Entreprises »
  assert.equal(auth.body.psu_type, 'personal');
  assert.equal(auth.body.redirect_url, 'https://app/');
  assert.match(auth.body.state, /^[0-9a-f-]{36}$/);
  const until = Date.parse(auth.body.access.valid_until);
  assert.ok(until < T0 + 15552000 * 1000, 'ne dépasse pas la durée maximale de la banque');
  assert.ok(until > T0 + 170 * DAY);
  assert.equal((await call('/api/transactions', T0 + H)).body.status, 'pending');
});

test('worker : le code de retour n’est accepté qu’avec le bon état, une seule fois', async () => {
  const { call, calls } = setup();
  await call('/api/link', T0, { method: 'POST' });
  const state = calls.find((c) => c.path === '/auth').body.state;
  assert.equal((await call('/api/session', T0, { method: 'POST', body: { code: 'GOOD', state: 'autre' } })).status, 400);
  assert.equal((await call('/api/session', T0, { method: 'POST', body: { code: 'GOOD' } })).status, 400);
  assert.equal((await call('/api/session', T0 + 2 * H, { method: 'POST', body: { code: 'GOOD', state } })).status, 400); // trop tard
  const bad = await call('/api/session', T0, { method: 'POST', body: { code: 'MAUVAIS', state } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'WRONG_AUTHORIZATION_CODE');
  const ok = await call('/api/session', T0, { method: 'POST', body: { code: 'GOOD', state } });
  assert.equal(ok.body.status, 'ok');
  assert.deepEqual(ok.body.accounts.map((a) => a.label), ['CACC …1234', 'CARD Carte']);
  assert.equal((await call('/api/session', T0, { method: 'POST', body: { code: 'GOOD', state } })).status, 400); // état consommé
});

test('worker : première lecture « longest », puis cache, puis date_from sur 30 jours', async () => {
  const { call, calls, link } = setup();
  await link();
  const first = await call('/api/transactions', T0 + H);
  assert.equal(first.body.status, 'ok');
  assert.equal(first.body.rows.length, 2); // même opération sur les deux comptes, identifiants distincts
  const reads = () => calls.filter((c) => c.path.endsWith('/transactions'));
  assert.equal(reads().length, 2);
  assert.equal(reads()[0].query.strategy, 'longest');
  assert.equal(reads()[0].query.transaction_status, 'BOOK');
  assert.equal(reads()[0].query.date_from, undefined);
  await call('/api/transactions', T0 + 6 * H); // 5 h après : cache
  assert.equal(reads().length, 2);
  const again = await call('/api/transactions', T0 + 7 * H + 1);
  assert.equal(reads().length, 4);
  assert.equal(reads()[2].query.strategy, undefined);
  assert.equal(reads()[2].query.date_from, '2026-09-30');
  assert.equal(again.body.rows.length, 2); // pas de doublon
});

test('worker : suit la pagination et ne lit que les comptes demandés', async () => {
  const pages = { U1: [{ transactions: [tx({ entry_reference: 'P1' })], continuation_key: 'k2' }, { transactions: [tx({ entry_reference: 'P2' })], continuation_key: null }] };
  const { call, link, env, behaviour } = setup();
  const seen = [];
  behaviour.transactions = async (uid, q) => { seen.push([uid, q.continuation_key]); const p = pages.U1; return { status: 200, body: q.continuation_key ? p[1] : p[0] }; };
  await link();
  env.ACCOUNT_TAGS = 'AAAAAAAAAAAA';
  const r = await call('/api/transactions', T0 + H);
  assert.deepEqual(r.body.rows.map((x) => x.id).sort(), ['AAAAAAAAAAAA:P1', 'AAAAAAAAAAAA:P2']);
  assert.deepEqual(seen, [['U1', undefined], ['U1', 'k2']]);
});

test('worker : limite de débit → cache conservé, pause d’une heure', async () => {
  const { call, link, behaviour, calls } = setup();
  await link();
  await call('/api/transactions', T0 + H);
  behaviour.transactions = async () => ({ status: 429, body: { error: 'ASPSP_RATE_LIMIT_EXCEEDED', message: 'x' } });
  const limited = await call('/api/transactions', T0 + 8 * H);
  assert.equal(limited.body.warning, 'rate_limited');
  assert.equal(limited.body.rows.length, 2);
  const n = calls.filter((c) => c.path.endsWith('/transactions')).length;
  const again = await call('/api/transactions', T0 + 8 * H + 10 * 60_000);
  assert.equal(again.body.warning, undefined);
  assert.equal(calls.filter((c) => c.path.endsWith('/transactions')).length, n);
});

test('worker : session révoquée ou consentement dépassé → expired', async () => {
  const revoked = setup();
  await revoked.link();
  revoked.behaviour.transactions = async () => ({ status: 401, body: { error: 'REVOKED_SESSION', message: 'x' } });
  assert.equal((await revoked.call('/api/transactions', T0 + H)).body.status, 'expired');
  assert.equal((await revoked.call('/api/status', T0 + 2 * H)).body.status, 'expired');

  const old = setup();
  await old.link();
  await old.call('/api/transactions', T0 + H);
  const r = await old.call('/api/transactions', T0 + 171 * DAY);
  assert.equal(r.body.status, 'expired');
  assert.deepEqual(r.body.rows, []);
});

test('worker : une erreur de configuration (401 sans code de session) n’est pas masquée', async () => {
  const { call, link, behaviour } = setup();
  await link();
  behaviour.transactions = async () => ({ status: 401, body: { error: 'UNAUTHORIZED_ACCESS', message: 'x' } });
  const r = await call('/api/transactions', T0 + H);
  assert.equal(r.status, 502);
  assert.equal(r.body.upstreamStatus, 401);
});
