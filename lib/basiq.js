/** Basiq Open Banking (API 3.0). Consent UI at consent.basiq.io. */

const BASE = 'https://au-api.basiq.io';
const CONSENT = 'https://consent.basiq.io/home';
const VERSION = '3.0';
const RETURN_URL = 'https://ledger-futuret3ch.vercel.app/app?bank=return';

const tokenCache = new Map();

function resolveFetch(fetchImpl) {
  return fetchImpl || globalThis.jaxFetch || fetch;
}

export class BasiqError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'BasiqError';
    this.status = status;
  }
}

export function basiqConfigured() {
  return Boolean(basicKey());
}

function basicKey() {
  return String(process.env.BASIQ_API_KEY || '')
    .trim()
    .replace(/^Basic\s+/i, '');
}

function detail(data, fallback) {
  const row = Array.isArray(data?.data) ? data.data[0] : null;
  return row?.detail || row?.title || data?.message || data?.error || fallback;
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new BasiqError(detail(data, `Basiq ${res.status}`), res.status >= 400 && res.status < 600 ? res.status : 502);
  return data;
}

export async function basiqToken(scope, userId = '', fetchImpl) {
  const f = resolveFetch(fetchImpl);
  const key = basicKey();
  if (!key) throw new BasiqError('Bank login is not configured', 503);
  const cacheKey = `${scope}:${userId}`;
  if (f === fetch) {
    const hit = tokenCache.get(cacheKey);
    if (hit && hit.exp > Date.now()) return hit.token;
  }
  const body = new URLSearchParams({ scope });
  if (userId) body.set('userId', userId);
  const data = await parse(
    await f(`${BASE}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'basiq-version': VERSION,
      },
      body: body.toString(),
    })
  );
  const token = data.access_token || data.accessToken || '';
  if (!token) throw new BasiqError('Basiq did not return a token', 502);
  if (f === fetch) tokenCache.set(cacheKey, { token, exp: Date.now() + 50 * 60 * 1000 });
  return token;
}

async function authed(fetchImpl, token, method, path, body) {
  return parse(
    await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'basiq-version': VERSION,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
}

export function auMobile(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/[^\d+]/g, '');
  if (/^\+61[4]\d{8}$/.test(digits)) return digits;
  if (/^61[4]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[4]\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  if (/^4\d{8}$/.test(digits)) return `+61${digits}`;
  return '';
}

export function consentUrl(clientToken) {
  const url = new URL(CONSENT);
  url.searchParams.set('token', clientToken);
  url.searchParams.set('action', 'connect');
  return url.toString();
}

export async function createBasiqUser({ email, mobile }, fetchImpl) {
  const f = resolveFetch(fetchImpl);
  const token = await basiqToken('SERVER_ACCESS', '', f);
  const data = await authed(f, token, 'POST', '/users', { email, mobile });
  if (!data.id) throw new BasiqError('Basiq did not return a user', 502);
  return data;
}

export async function getBasiqUser(userId, fetchImpl) {
  const f = resolveFetch(fetchImpl);
  const token = await basiqToken('SERVER_ACCESS', '', f);
  return authed(f, token, 'GET', `/users/${encodeURIComponent(userId)}`);
}

export async function deleteBasiqUser(userId, fetchImpl) {
  const f = resolveFetch(fetchImpl);
  const token = await basiqToken('SERVER_ACCESS', '', f);
  const res = await f(`${BASE}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'basiq-version': VERSION },
  });
  if (res.status === 404) return;
  await parse(res);
}

export async function clientAccessUrl(userId, fetchImpl) {
  const token = await basiqToken('CLIENT_ACCESS', userId, resolveFetch(fetchImpl));
  return consentUrl(token);
}

function collection(data) {
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

async function listAll(fetchImpl, token, path) {
  const out = [];
  let next = path;
  for (let page = 0; page < 20 && next; page++) {
    const data = await authed(fetchImpl, token, 'GET', next);
    out.push(...collection(data));
    const link = data?.links?.next || '';
    if (!link) break;
    next = String(link).replace(BASE, '');
    if (!next.startsWith('/')) break;
  }
  return out;
}

export async function listConnections(userId, fetchImpl) {
  const f = resolveFetch(fetchImpl);
  const token = await basiqToken('SERVER_ACCESS', '', f);
  return listAll(f, token, `/users/${encodeURIComponent(userId)}/connections`);
}

export async function listAccounts(userId, fetchImpl) {
  const f = resolveFetch(fetchImpl);
  const token = await basiqToken('SERVER_ACCESS', '', f);
  return listAll(f, token, `/users/${encodeURIComponent(userId)}/accounts`);
}

export async function listTransactions(userId, fromDate, fetchImpl) {
  const f = resolveFetch(fetchImpl);
  const token = await basiqToken('SERVER_ACCESS', '', f);
  const clause = fromDate
    ? `transaction.postDate.gteq('${fromDate}'),transaction.status.eq('posted')`
    : `transaction.status.eq('posted')`;
  const filter = `?limit=500&filter=${encodeURIComponent(clause)}`;
  return listAll(f, token, `/users/${encodeURIComponent(userId)}/transactions${filter}`);
}

export function postedOnMelbourne(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    const slice = String(iso).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : '';
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

export function dollarsToSignedCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n * 100);
}

export function jaxIdFromBasiq(id) {
  const raw = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  const value = `basiq_${raw}`.slice(0, 80);
  return value.length >= 8 ? value : '';
}

function institutionName(row) {
  const inst = row?.institution;
  if (inst && typeof inst === 'object') return inst.shortName || inst.name || inst.id || '';
  return String(inst || '');
}

function maskAccount(no) {
  const s = String(no || '').replace(/\s/g, '');
  if (s.length <= 4) return s;
  return `••••${s.slice(-4)}`;
}

export function snapshotFromBasiq({ userId, email, mobile, connections, accounts }) {
  const accByConn = new Map();
  for (const acc of accounts || []) {
    const connId = acc.connection || acc.connectionId || '';
    const list = accByConn.get(connId) || [];
    list.push({
      id: String(acc.id || '').slice(0, 80),
      name: String(acc.name || acc.accountNo || 'Account').slice(0, 80),
      masked: maskAccount(acc.accountNo),
      balanceCents: dollarsToSignedCents(acc.balance) || 0,
    });
    accByConn.set(connId, list);
  }
  return {
    provider: 'basiq',
    userId,
    email,
    mobile,
    lastSyncAt: new Date().toISOString(),
    connections: (connections || []).map((row) => ({
      id: String(row.id || '').slice(0, 80),
      institution: institutionName(row).slice(0, 80),
      status: String(row.status || '').slice(0, 40),
      accounts: accByConn.get(row.id) || [],
    })),
  };
}

export function rowsFromTransactions(list) {
  const rows = [];
  for (const row of list || []) {
    if (row.status && row.status !== 'posted') continue;
    const amountCents = dollarsToSignedCents(row.amount);
    const postedOn = postedOnMelbourne(row.postDate || row.transactionDate || row.date);
    const description = String(row.description || '').trim().slice(0, 180);
    if (amountCents == null || !postedOn || !description) continue;
    const id = jaxIdFromBasiq(row.id);
    rows.push({
      id: id || undefined,
      postedOn,
      description,
      amountCents,
      reference: String(row.account || row.connection || '').slice(0, 80),
    });
  }
  return rows;
}

export async function connectBank({ email, mobile, userId }, fetchImpl) {
  const mail = String(email || '').trim().toLowerCase();
  const phone = auMobile(mobile);
  if (!mail || !mail.includes('@')) throw new BasiqError('Enter the email on this desk', 400);
  if (!phone) throw new BasiqError('Enter an Australian mobile so the bank can send a code', 400);
  let id = String(userId || '').trim();
  if (id) {
    try {
      await getBasiqUser(id, fetchImpl);
    } catch (err) {
      if (err.status !== 404) throw err;
      id = '';
    }
  }
  if (!id) {
    const user = await createBasiqUser({ email: mail, mobile: phone }, fetchImpl);
    id = user.id;
  }
  const url = await clientAccessUrl(id, fetchImpl);
  return { userId: id, email: mail, mobile: phone, url };
}

export async function pullBank(userId, fromDate, fetchImpl) {
  const id = String(userId || '').trim();
  if (!id) throw new BasiqError('Connect a bank first', 400);
  const [connections, accounts, transactions] = await Promise.all([
    listConnections(id, fetchImpl),
    listAccounts(id, fetchImpl),
    listTransactions(id, fromDate, fetchImpl),
  ]);
  return {
    connections,
    accounts,
    rows: rowsFromTransactions(transactions),
  };
}
