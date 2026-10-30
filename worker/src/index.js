import { GcError, requestToken, listInstitutions, createRequisition, getRequisition, getTransactions, pickInstitution } from './gocardless.js';
import { mapTransaction } from './map.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const CONSENT_DAYS = 90; // durée de consentement PSD2 par défaut
const KEEP_ROWS = 2000;
const RATE_LIMIT_BACKOFF = 60 * MINUTE;
const DEAD_STATUSES = new Set(['EX', 'SU', 'RJ']);

const equal = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

function authorized(request, env) {
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return Boolean(env.APP_TOKEN) && equal(given, env.APP_TOKEN);
}

export async function handle(request, env, { now = Date.now(), fetchFn = fetch } = {}) {
  const cors = {
    'access-control-allow-origin': env.APP_ORIGIN ?? '',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);

  const kv = env.BUDGET;
  const read = async (key, fallback) => (await kv.get(key, 'json')) ?? fallback;
  const write = (key, value) => kv.put(key, JSON.stringify(value));
  const minRefresh = Number(env.MIN_REFRESH_MINUTES ?? 360) * MINUTE;

  async function accessToken() {
    const cached = await read('token', null);
    if (cached && cached.expiresAt > now + MINUTE) return cached.access;
    const t = await requestToken(fetchFn, env.GC_SECRET_ID, env.GC_SECRET_KEY);
    await write('token', { access: t.access, expiresAt: now + (t.access_expires ?? 3600) * 1000 });
    return t.access;
  }

  // Tant que le consentement n'est pas terminé, demande à GoCardless où il en est.
  async function linkState() {
    const state = await read('state', {});
    if (!state.requisitionId || state.status === 'LN' || DEAD_STATUSES.has(state.status)) return state;
    const r = await getRequisition(fetchFn, await accessToken(), state.requisitionId);
    const next = { ...state, status: r.status, accountIds: r.accounts ?? [] };
    if (r.status === 'LN') next.linkedAt = now;
    await write('state', next);
    return next;
  }

  const consentExpiresAt = (state) => (state.linkedAt ? state.linkedAt + CONSENT_DAYS * DAY : null);
  const expired = (state) => DEAD_STATUSES.has(state.status) || (consentExpiresAt(state) !== null && consentExpiresAt(state) <= now);

  function view(state, cache, extra = {}) {
    const rows = Object.values(cache.rows).sort((a, b) => (a.date < b.date ? 1 : -1));
    const nextRefreshAt = Math.max(cache.updatedAt ? cache.updatedAt + minRefresh : now, cache.blockedUntil ?? 0);
    let status = 'ok';
    if (!state.requisitionId) status = 'not_linked';
    else if (expired(state)) status = 'expired';
    else if (state.status !== 'LN') status = 'pending';
    return { status, rows: status === 'ok' ? rows : [], updatedAt: cache.updatedAt, nextRefreshAt, consentExpiresAt: consentExpiresAt(state), ...extra };
  }

  const { pathname } = new URL(request.url);
  try {
    if (request.method === 'POST' && pathname === '/api/link') {
      const token = await accessToken();
      const institutionId = env.INSTITUTION_ID || pickInstitution(await listInstitutions(fetchFn, token))?.id;
      if (!institutionId) return json({ error: 'institution_not_found' }, 502);
      const r = await createRequisition(fetchFn, token, { redirect: env.APP_URL, institutionId, reference: `budget-${now}` });
      await write('state', { requisitionId: r.id, status: r.status ?? 'CR', accountIds: [] });
      return json({ link: r.link });
    }

    if (request.method === 'GET' && (pathname === '/api/transactions' || pathname === '/api/status')) {
      let state = await linkState();
      const cache = await read('cache', { rows: {}, updatedAt: null, blockedUntil: null });
      if (state.status !== 'LN' || expired(state)) return json(view(state, cache));
      const due = pathname === '/api/transactions' && (!cache.updatedAt || now - cache.updatedAt >= minRefresh) && !(cache.blockedUntil > now);
      if (!due) return json(view(state, cache));

      let warning;
      try {
        const token = await accessToken();
        const fresh = {};
        for (const accountId of state.accountIds) {
          const { transactions } = await getTransactions(fetchFn, token, accountId);
          for (const t of transactions?.booked ?? []) {
            const row = mapTransaction(t);
            if (row) fresh[row.id] = row;
          }
        }
        const rows = Object.fromEntries(Object.entries({ ...cache.rows, ...fresh }).sort(([, a], [, b]) => (a.date < b.date ? 1 : -1)).slice(0, KEEP_ROWS));
        Object.assign(cache, { rows, updatedAt: now, blockedUntil: null });
      } catch (e) {
        if (!(e instanceof GcError)) throw e;
        if (e.status === 429) {
          cache.blockedUntil = now + RATE_LIMIT_BACKOFF;
          warning = 'rate_limited';
        } else if (e.status === 401 || e.status === 403 || e.status === 409) {
          state = { ...state, status: 'EX' };
          await write('state', state);
        } else {
          warning = 'upstream_error';
        }
      }
      await write('cache', cache);
      return json(view(state, cache, warning ? { warning } : {}));
    }

    return json({ error: 'not_found' }, 404);
  } catch (e) {
    if (e instanceof GcError) return json({ error: 'upstream', upstreamStatus: e.status }, 502);
    console.error(e);
    return json({ error: 'internal' }, 500);
  }
}

export default { fetch: (request, env) => handle(request, env) };
