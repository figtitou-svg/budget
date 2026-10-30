// Client minimal de l'API « Bank Account Data » de GoCardless (ex-Nordigen).
// Toute la connaissance de l'API est ici : si GoCardless change, c'est le seul fichier à adapter.
const BASE = 'https://bankaccountdata.gocardless.com/api/v2';

export class GcError extends Error {
  constructor(status, body) {
    super(`GoCardless ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function call(fetchFn, path, { token, method = 'GET', body } = {}) {
  const res = await fetchFn(`${BASE}${path}`, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* corps non JSON */ }
  if (!res.ok) throw new GcError(res.status, data);
  return data;
}

// { access, access_expires } — access_expires en secondes.
export const requestToken = (fetchFn, secretId, secretKey) =>
  call(fetchFn, '/token/new/', { method: 'POST', body: { secret_id: secretId, secret_key: secretKey } });

export const listInstitutions = (fetchFn, token, country = 'fr') => call(fetchFn, `/institutions/?country=${country}`, { token });

export const createRequisition = (fetchFn, token, { redirect, institutionId, reference }) =>
  call(fetchFn, '/requisitions/', { token, method: 'POST', body: { redirect, institution_id: institutionId, reference, user_language: 'FR' } });

// { status: 'CR'|'UA'|'LN'|'EX'|'SU'|'RJ'…, accounts: [id] }
export const getRequisition = (fetchFn, token, id) => call(fetchFn, `/requisitions/${encodeURIComponent(id)}/`, { token });

// { transactions: { booked: [...], pending: [...] } }
export const getTransactions = (fetchFn, token, accountId) => call(fetchFn, `/accounts/${encodeURIComponent(accountId)}/transactions/`, { token });

// Choisit « Société Générale » (particuliers) parmi les banques françaises proposées.
export function pickInstitution(list) {
  const sg = list.filter((i) => /soci[eé]t[eé] g[eé]n[eé]rale/i.test(i.name ?? ''));
  return sg.find((i) => /SOGEFRPP/.test(i.id)) ?? sg[0] ?? null;
}
