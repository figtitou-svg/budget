import { EbError, KeyError, createClient, pickAspsp } from './enablebanking.js';
import { rowMapper, accountTag } from './map.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_CONSENT = 180 * DAY;
const KEEP_ROWS = 2000;
const MAX_PAGES = 20;
const RATE_LIMIT_BACKOFF = HOUR;
const DEAD_SESSION_CODES = new Set(['EXPIRED_SESSION', 'CLOSED_SESSION', 'REVOKED_SESSION', 'SESSION_DOES_NOT_EXIST']);

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

const dateOnly = (ms) => new Date(ms).toISOString().slice(0, 10);
const accountLabel = (a) => [a.cash_account_type, a.details || a.product, a.account_id?.iban ? `…${a.account_id.iban.slice(-4)}` : null].filter(Boolean).join(' ');

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
  if (!env.EB_APP_ID || !env.EB_PRIVATE_KEY) return json({ error: 'not_configured' }, 500);

  const kv = env.BUDGET;
  const read = async (key, fallback) => (await kv.get(key, 'json')) ?? fallback;
  const write = (key, value) => kv.put(key, JSON.stringify(value));
  const minRefresh = Number(env.MIN_REFRESH_MINUTES ?? 360) * MINUTE;
  const eb = () => createClient({ appId: env.EB_APP_ID, privateKey: env.EB_PRIVATE_KEY, fetchFn, now });
  const onlyTags = env.ACCOUNT_TAGS ? new Set(env.ACCOUNT_TAGS.split(',').map((s) => s.trim()).filter(Boolean)) : null;

  const expired = (state) => state.status === 'EX' || (state.expiresAt != null && state.expiresAt <= now);

  function view(state, cache, extra = {}) {
    let status = 'ok';
    if (!state.sessionId) status = state.pending ? 'pending' : 'not_linked';
    else if (expired(state)) status = 'expired';
    const rows = Object.values(cache.rows).sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      status,
      rows: status === 'ok' ? rows : [],
      updatedAt: cache.updatedAt,
      nextRefreshAt: Math.max(cache.updatedAt ? cache.updatedAt + minRefresh : now, cache.blockedUntil ?? 0),
      consentExpiresAt: state.expiresAt ?? null,
      accounts: (state.accounts ?? []).map(({ tag, label }) => ({ tag, label })),
      ...extra,
    };
  }

  const { pathname } = new URL(request.url);
  try {
    // 1) Démarre le consentement : renvoie l'adresse de la banque où envoyer l'utilisateur.
    if (request.method === 'POST' && pathname === '/api/link') {
      const client = eb();
      const aspsp = pickAspsp(await client.listAspsps('FR'), { name: env.ASPSP_NAME ?? 'Société Générale' });
      if (!aspsp) return json({ error: 'institution_not_found' }, 502);
      // Durée demandée : le maximum accepté par la banque (marge de 5 min), plafonné à 180 jours.
      const validity = Math.min((aspsp.maximum_consent_validity ?? 90 * 24 * 3600) * 1000, MAX_CONSENT);
      const state = crypto.randomUUID();
      const started = await client.startAuth({
        access: { valid_until: new Date(now + validity - 5 * MINUTE).toISOString().replace('Z', '+00:00') },
        aspsp: { name: aspsp.name, country: aspsp.country },
        state,
        redirect_url: env.APP_URL,
        psu_type: 'personal',
        language: 'fr',
      });
      await write('state', { ...(await read('state', {})), pending: { state, createdAt: now } });
      return json({ link: started.url });
    }

    // 2) Retour de la banque : l'app transmet le code reçu, qu'on échange contre une session.
    if (request.method === 'POST' && pathname === '/api/session') {
      const body = await request.json().catch(() => null);
      const current = await read('state', {});
      const p = current.pending;
      if (!p || typeof body?.code !== 'string' || typeof body?.state !== 'string' || !equal(body.state, p.state) || now - p.createdAt > HOUR) {
        return json({ error: 'invalid_link_state' }, 400);
      }
      let s;
      try {
        s = await eb().createSession(body.code);
      } catch (e) {
        if (e instanceof EbError && e.status >= 400 && e.status < 500) return json({ error: 'session_refused', code: e.code }, 400);
        throw e;
      }
      const accounts = (s.accounts ?? []).filter((a) => a.uid).map((a) => ({ uid: a.uid, tag: accountTag(a.identification_hash), label: accountLabel(a) }));
      const next = { sessionId: s.session_id, accounts, linkedAt: now, expiresAt: Date.parse(s.access?.valid_until) || now + 90 * DAY, status: 'LN' };
      await write('state', next);
      return json(view(next, await read('cache', { rows: {}, updatedAt: null, blockedUntil: null })));
    }

    // 3) Lecture : sert le cache, et ne questionne la banque que si le délai minimum est passé.
    if (request.method === 'GET' && (pathname === '/api/transactions' || pathname === '/api/status')) {
      let state = await read('state', {});
      const cache = await read('cache', { rows: {}, updatedAt: null, blockedUntil: null });
      if (!state.sessionId || expired(state)) return json(view(state, cache));
      const due = pathname === '/api/transactions' && (!cache.updatedAt || now - cache.updatedAt >= minRefresh) && !(cache.blockedUntil > now);
      if (!due) return json(view(state, cache));

      let warning;
      try {
        const client = eb();
        const first = !cache.updatedAt;
        const fresh = {};
        for (const account of (state.accounts ?? []).filter((a) => !onlyTags || onlyTags.has(a.tag))) {
          const map = rowMapper(account.tag);
          let key;
          for (let page = 0; page < MAX_PAGES; page++) {
            const r = await client.getTransactions(account.uid, {
              transaction_status: 'BOOK',
              ...(first ? { strategy: 'longest' } : { date_from: dateOnly(now - 30 * DAY) }),
              continuation_key: key,
            });
            for (const t of r?.transactions ?? []) {
              const row = map(t);
              if (row) fresh[row.id] = row;
            }
            key = r?.continuation_key;
            if (!key) break;
          }
        }
        const rows = Object.fromEntries(Object.entries({ ...cache.rows, ...fresh }).sort(([, a], [, b]) => (a.date < b.date ? 1 : -1)).slice(0, KEEP_ROWS));
        Object.assign(cache, { rows, updatedAt: now, blockedUntil: null });
      } catch (e) {
        if (!(e instanceof EbError)) throw e;
        if (e.status === 429 || e.code === 'ASPSP_RATE_LIMIT_EXCEEDED') {
          cache.blockedUntil = now + RATE_LIMIT_BACKOFF;
          warning = 'rate_limited';
        } else if (DEAD_SESSION_CODES.has(e.code)) {
          state = { ...state, status: 'EX' };
          await write('state', state);
        } else if (e.status === 401 || e.status === 403) {
          throw e; // problème de configuration (clé, identifiant) : on ne le masque pas
        } else {
          warning = 'upstream_error';
        }
      }
      await write('cache', cache);
      return json(view(state, cache, warning ? { warning } : {}));
    }

    return json({ error: 'not_found' }, 404);
  } catch (e) {
    if (e instanceof KeyError) return json({ error: 'bad_private_key', message: e.message }, 500);
    if (e instanceof EbError) return json({ error: 'upstream', upstreamStatus: e.status, upstreamCode: e.code }, 502);
    console.error(e);
    return json({ error: 'internal' }, 500);
  }
}

export default { fetch: (request, env) => handle(request, env) };
