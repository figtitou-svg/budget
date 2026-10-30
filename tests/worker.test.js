import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, mapTransaction } from '../worker/src/map.js';
import { pickInstitution } from '../worker/src/gocardless.js';
import { handle } from '../worker/src/index.js';

test('toCents sans erreur de flottant', () => {
  assert.equal(toCents('-23.45'), -2345);
  assert.equal(toCents('0.1'), 10);
  assert.equal(toCents('1200'), 120000);
  assert.equal(toCents('+5.5'), 550);
  assert.equal(toCents('19.999'), 1999);
  for (const bad of ['', 'abc', null, '1,5']) assert.equal(toCents(bad), null, String(bad));
});

test('mapTransaction : champs GoCardless → ligne de l’app', () => {
  const row = mapTransaction({ transactionId: 'T1', bookingDate: '2026-10-12', transactionAmount: { amount: '-23.45', currency: 'EUR' }, remittanceInformationUnstructured: 'CARTE X1234  12/10 CARREFOUR CITY' });
  assert.deepEqual(row, { id: 'T1', date: '2026-10-12', amountCents: -2345, rawLabel: 'CARTE X1234 12/10 CARREFOUR CITY' });
  assert.equal(mapTransaction({ internalTransactionId: 'I', valueDate: '2026-10-01', transactionAmount: { amount: '5', currency: 'EUR' }, creditorName: 'Jean' }).rawLabel, 'Jean');
  assert.equal(mapTransaction({ transactionId: 'T', bookingDate: '2026-10-01', transactionAmount: { amount: '5', currency: 'EUR' }, remittanceInformationUnstructuredArray: ['A', 'B'] }).rawLabel, 'A B');
  assert.equal(mapTransaction({ bookingDate: '2026-10-01', transactionAmount: { amount: '5', currency: 'EUR' } }), null); // sans id
  assert.equal(mapTransaction({ transactionId: 'T', bookingDate: '2026-10-01', transactionAmount: { amount: '5', currency: 'USD' } }), null);
  assert.equal(mapTransaction({ transactionId: 'T', bookingDate: 'hier', transactionAmount: { amount: '5', currency: 'EUR' } }), null);
});

test('pickInstitution préfère Société Générale particuliers', () => {
  const list = [{ id: 'BNP', name: 'BNP Paribas' }, { id: 'SOCIETE_GENERALE_ENTREPRISES', name: 'Société Générale Entreprises' }, { id: 'SOCIETE_GENERALE_SOGEFRPP', name: 'Société Générale' }];
  assert.equal(pickInstitution(list).id, 'SOCIETE_GENERALE_SOGEFRPP');
  assert.equal(pickInstitution([{ id: 'X', name: 'Autre' }]), null);
});

// --- Worker de bout en bout avec un KV et un GoCardless factices ---
const kvStub = () => {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => void m.set(k, v) };
};

function setup({ requisition = { status: 'LN', accounts: ['ACC'] }, transactionsStatus = 200 } = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    const path = url.replace('https://bankaccountdata.gocardless.com/api/v2', '');
    calls.push(`${init.method} ${path}`);
    const reply = (status, body) => new Response(JSON.stringify(body), { status });
    if (path.startsWith('/token/new/')) return reply(200, { access: 'ACCESS', access_expires: 86400 });
    if (path.startsWith('/institutions/')) return reply(200, [{ id: 'SOCIETE_GENERALE_SOGEFRPP', name: 'Société Générale' }]);
    if (path === '/requisitions/') return reply(201, { id: 'REQ', link: 'https://bank.example/consent', status: 'CR' });
    if (path.startsWith('/requisitions/REQ')) return reply(200, requisition);
    if (path.startsWith('/accounts/ACC/transactions')) {
      if (transactionsStatus !== 200) return reply(transactionsStatus, { detail: 'x' });
      return reply(200, { transactions: { booked: [{ transactionId: 'T1', bookingDate: '2026-10-12', transactionAmount: { amount: '-23.45', currency: 'EUR' }, remittanceInformationUnstructured: 'CARREFOUR' }], pending: [{ transactionId: 'P', bookingDate: '2026-10-13', transactionAmount: { amount: '-1', currency: 'EUR' } }] } });
    }
    return reply(404, {});
  };
  const env = { BUDGET: kvStub(), APP_TOKEN: 'secret', GC_SECRET_ID: 'i', GC_SECRET_KEY: 'k', APP_URL: 'https://app/', APP_ORIGIN: 'https://app', MIN_REFRESH_MINUTES: '360' };
  const req = (path, { method = 'GET', token = 'secret' } = {}) => new Request(`https://w.example${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const call = async (path, now, opts) => { const r = await handle(req(path, opts), env, { now, fetchFn }); return { status: r.status, body: await r.json(), headers: r.headers }; };
  return { env, calls, call };
}
const T0 = Date.parse('2026-10-30T08:00:00Z');
const H = 3_600_000;

test('worker : refuse sans jeton ou avec un mauvais jeton, et si APP_TOKEN est absent', async () => {
  const { call, env } = setup();
  assert.equal((await call('/api/status', T0, { token: '' })).status, 401);
  assert.equal((await call('/api/status', T0, { token: 'nope' })).status, 401);
  delete env.APP_TOKEN;
  assert.equal((await call('/api/status', T0, { token: '' })).status, 401);
});

test('worker : CORS limité à l’origine de l’app', async () => {
  const { call } = setup();
  const r = await call('/api/status', T0);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://app');
});

test('worker : non connecté puis lien de consentement', async () => {
  const { call, calls } = setup();
  assert.equal((await call('/api/transactions', T0)).body.status, 'not_linked');
  const link = await call('/api/link', T0, { method: 'POST' });
  assert.equal(link.body.link, 'https://bank.example/consent');
  assert.ok(calls.some((c) => c.startsWith('POST /requisitions/')));
});

test('worker : consentement en cours → pending, sans rien lire', async () => {
  const { call, calls } = setup({ requisition: { status: 'UA', accounts: [] } });
  await call('/api/link', T0, { method: 'POST' });
  const r = await call('/api/transactions', T0 + H);
  assert.equal(r.body.status, 'pending');
  assert.deepEqual(r.body.rows, []);
  assert.ok(!calls.some((c) => c.includes('/transactions')));
});

test('worker : lit la banque, ignore les opérations en attente, puis protège le quota', async () => {
  const { call, calls } = setup();
  await call('/api/link', T0, { method: 'POST' });
  const first = await call('/api/transactions', T0 + H);
  assert.equal(first.body.status, 'ok');
  assert.deepEqual(first.body.rows, [{ id: 'T1', date: '2026-10-12', amountCents: -2345, rawLabel: 'CARREFOUR' }]);
  const reads = () => calls.filter((c) => c.includes('/accounts/')).length;
  assert.equal(reads(), 1);
  // 5 h plus tard : servi depuis le cache, aucun appel banque
  const cached = await call('/api/transactions', T0 + 6 * H);
  assert.equal(cached.body.rows.length, 1);
  assert.equal(reads(), 1);
  assert.equal(cached.body.nextRefreshAt, T0 + 7 * H);
  // 6 h après la première lecture : nouvelle lecture autorisée
  await call('/api/transactions', T0 + 7 * H + 1);
  assert.equal(reads(), 2);
});

test('worker : 429 de la banque → cache conservé, pause d’une heure', async () => {
  const ok = setup();
  await ok.call('/api/link', T0, { method: 'POST' });
  await ok.call('/api/transactions', T0 + H);
  const limited = setup({ transactionsStatus: 429 });
  limited.env.BUDGET = ok.env.BUDGET; // même cache
  const r = await limited.call('/api/transactions', T0 + 8 * H);
  assert.equal(r.body.warning, 'rate_limited');
  assert.equal(r.body.rows.length, 1);
  const again = await limited.call('/api/transactions', T0 + 8 * H + 10 * 60_000);
  assert.equal(again.body.warning, undefined);
  assert.equal(limited.calls.filter((c) => c.includes('/accounts/')).length, 1);
});

test('worker : accès refusé par la banque ou consentement de 90 jours dépassé → expired', async () => {
  const denied = setup({ transactionsStatus: 409 });
  await denied.call('/api/link', T0, { method: 'POST' });
  assert.equal((await denied.call('/api/transactions', T0 + H)).body.status, 'expired');
  assert.equal((await denied.call('/api/status', T0 + 2 * H)).body.status, 'expired');

  const old = setup();
  await old.call('/api/link', T0, { method: 'POST' });
  await old.call('/api/transactions', T0 + H);
  const r = await old.call('/api/transactions', T0 + 91 * 24 * H);
  assert.equal(r.body.status, 'expired');
  assert.deepEqual(r.body.rows, []);
});
