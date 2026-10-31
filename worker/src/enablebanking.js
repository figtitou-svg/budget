// Client minimal de l'API Enable Banking (https://enablebanking.com/docs/api/latest/).
// Toute la connaissance de l'API est ici : si Enable Banking change, c'est le seul fichier à adapter.
const BASE = 'https://api.enablebanking.com';

export class EbError extends Error {
  constructor(status, body) {
    super(`Enable Banking ${status}`);
    this.status = status;
    this.body = body;
    this.code = body?.error; // ex. EXPIRED_SESSION, ASPSP_RATE_LIMIT_EXCEEDED
  }
}

export class KeyError extends Error {}

const enc = new TextEncoder();

const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Clé privée de l'application (PEM PKCS#8, telle que téléchargée depuis le Control Panel).
export function pemToDer(pem) {
  const text = String(pem ?? '').replace(/\\n/g, '\n');
  if (/BEGIN RSA PRIVATE KEY/.test(text)) {
    throw new KeyError('Clé au format PKCS#1 : convertis-la avec « openssl pkcs8 -topk8 -nocrypt -in cle.pem -out cle-pkcs8.pem ».');
  }
  const m = text.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (!m) throw new KeyError('Clé privée illisible : un fichier PEM « BEGIN PRIVATE KEY » est attendu.');
  try {
    return Uint8Array.from(atob(m[1].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  } catch {
    throw new KeyError('Clé privée illisible : contenu base64 invalide.');
  }
}

// JWT RS256 : en-tête { typ, alg, kid = id de l'application }, corps { iss, aud, iat, exp }.
export async function signJwt({ appId, privateKey, now = Date.now(), ttl = 3600 }) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(now / 1000);
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId })));
  const body = b64url(enc.encode(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + ttl })));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

export function createClient({ appId, privateKey, fetchFn = fetch, now = Date.now() }) {
  let jwt;
  async function call(path, { method = 'GET', body, query } = {}) {
    jwt ??= await signJwt({ appId, privateKey, now });
    const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
    const res = await fetchFn(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { authorization: `Bearer ${jwt}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* corps non JSON */ }
    if (!res.ok) throw new EbError(res.status, data);
    return data;
  }
  return {
    listAspsps: async (country) => (await call('/aspsps', { query: { country } }))?.aspsps ?? [],
    // → { url, authorization_id } : adresse chez la banque où envoyer l'utilisateur
    startAuth: (body) => call('/auth', { method: 'POST', body }),
    // → { session_id, accounts: [{ uid, identification_hash, ... }], access: { valid_until } }
    createSession: (code) => call('/sessions', { method: 'POST', body: { code } }),
    // → { transactions: [...], continuation_key }
    getTransactions: (uid, query) => call(`/accounts/${encodeURIComponent(uid)}/transactions`, { query }),
  };
}

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Choisit la banque par son nom (sans accents ni casse) parmi celles qui acceptent ce type d'utilisateur.
export function pickAspsp(list, { name, psuType = 'personal' }) {
  return list.find((a) => fold(a.name) === fold(name) && (a.psu_types ?? []).includes(psuType)) ?? null;
}
