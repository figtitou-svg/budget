import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileKv } from '../worker/src/file-kv.js';
import { createApp, envFromProcess } from '../worker/node-server.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'budget-kv-'));

test('file-kv : persiste entre deux instances, sans fichier temporaire résiduel', async () => {
  const path = join(tmp(), 'sous', 'state.json');
  const a = createFileKv(path);
  assert.equal(await a.get('x'), null);
  await a.put('x', JSON.stringify({ n: 1 }));
  await a.put('y', JSON.stringify([2]));
  const b = createFileKv(path);
  assert.deepEqual(await b.get('x'), { n: 1 });
  assert.deepEqual(await b.get('y'), [2]);
  assert.deepEqual(readdirSync(join(path, '..')), ['state.json']);
});

test('file-kv : écritures simultanées toutes conservées', async () => {
  const path = join(tmp(), 'state.json');
  const kv = createFileKv(path);
  await Promise.all(Array.from({ length: 20 }, (_, i) => kv.put(`k${i}`, JSON.stringify(i))));
  const again = createFileKv(path);
  for (let i = 0; i < 20; i++) assert.equal(await again.get(`k${i}`), i);
});

test('file-kv : fichier corrompu → erreur explicite, pas d’écrasement silencieux', async () => {
  const path = join(tmp(), 'state.json');
  writeFileSync(path, '{pas du json');
  await assert.rejects(createFileKv(path).get('x'), /illisible/);
  assert.equal(readFileSync(path, 'utf8'), '{pas du json');
});

const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const baseEnv = (dir) => {
  const keyFile = join(dir, 'k.pem');
  writeFileSync(keyFile, PEM, { mode: 0o600 });
  return { EB_APP_ID: 'app', EB_PRIVATE_KEY_FILE: keyFile, APP_TOKEN: 'secret', APP_URL: 'https://app/', APP_ORIGIN: 'https://app', DATA_FILE: join(dir, 's.json') };
};

test('envFromProcess refuse de démarrer sans configuration, lit la clé depuis un fichier', () => {
  assert.throws(() => envFromProcess({ APP_URL: 'x' }), /EB_APP_ID.*APP_TOKEN.*EB_PRIVATE_KEY_FILE/);
  const env = envFromProcess(baseEnv(tmp()));
  assert.equal(env.MIN_REFRESH_MINUTES, '360');
  assert.match(env.EB_PRIVATE_KEY, /BEGIN PRIVATE KEY/);
  assert.throws(() => envFromProcess({ ...baseEnv(tmp()), EB_PRIVATE_KEY_FILE: '/inexistant/k.pem' }), /ENOENT/);
});

test('serveur HTTP : auth, CORS, corps POST transmis, et une seule lecture banque pour deux requêtes simultanées', async () => {
  const bank = [];
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    bank.push(`${init.method} ${u.pathname}`);
    const r = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (u.pathname === '/aspsps') return r({ aspsps: [{ name: 'Société Générale', country: 'FR', psu_types: ['personal'], maximum_consent_validity: 15552000 }] });
    if (u.pathname === '/auth') return r({ url: 'https://bank.example/c', authorization_id: 'A' });
    if (u.pathname === '/sessions') return r({ session_id: 'S', accounts: [{ uid: 'U1', identification_hash: 'P.AAAAAAAAAAAAAAAA' }], access: { valid_until: new Date(Date.now() + 86_400_000 * 100).toISOString() } });
    if (u.pathname === '/accounts/U1/transactions') {
      await new Promise((ok) => setTimeout(ok, 30)); // laisse la 2e requête arriver pendant la lecture
      return r({ transactions: [{ status: 'BOOK', booking_date: '2026-10-12', entry_reference: 'T1', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '5.00', currency: 'EUR' }, remittance_information: ['X'] }] });
    }
    return r({}, 404);
  };
  const env = envFromProcess(baseEnv(tmp()));
  const server = createApp(env, { fetchFn });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { token = 'secret', method = 'GET', body } = {}) => fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  try {
    assert.equal((await req('/api/status', { token: '' })).status, 401);
    assert.equal((await req('/api/status', { token: 'wrong' })).status, 401);
    const pre = await fetch(`${base}/api/transactions`, { method: 'OPTIONS' });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://app');
    assert.equal((await (await req('/api/link', { method: 'POST' })).json()).link, 'https://bank.example/c');
    const state = (await env.BUDGET.get('state')).pending.state;
    const linked = await (await req('/api/session', { method: 'POST', body: { code: 'GOOD', state } })).json(); // corps POST bien transmis
    assert.equal(linked.status, 'ok');
    const [a, b] = await Promise.all([req('/api/transactions'), req('/api/transactions')]);
    assert.equal((await a.json()).rows.length, 1);
    assert.equal((await b.json()).rows.length, 1);
    assert.equal(bank.filter((p) => p.includes('/accounts/')).length, 1);
  } finally {
    server.close();
  }
});
