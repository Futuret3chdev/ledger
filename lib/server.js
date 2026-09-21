import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { codesMatch, readCookie, readSession, signSession } from './auth.js';
import { addAsk, checkPass, publicKeeper, signupKeeper } from './practice.js';
import { loadBook, loadPractice, saveBook, savePractice, storageMode } from './store.js';
import { emptyBook, normalizeBook, ValidationError } from './validate.js';

const COOKIE = 'ledger_session';
const MONTH = 30 * 24 * 60 * 60;

export function loadLocalEnv() {
  if (process.env.VERCEL) return;
  const file = path.join(process.cwd(), '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (headers) {
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
}

function cookie(token) {
  const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${token ? MONTH : 0}`];
  if (process.env.VERCEL) parts.push('Secure');
  return parts.join('; ');
}

function sessionOk(req) {
  const secret = process.env.LEDGER_SESSION_SECRET || '';
  const token = readCookie(req.headers.cookie || '', COOKIE);
  return Boolean(readSession(secret, token));
}

async function readJson(req) {
  if (req.body != null && req.body !== '') {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.length > 1_000_000) {
    const err = new Error('That upload is too large');
    err.status = 413;
    throw err;
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function handle(req, res) {
  loadLocalEnv();
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, name: 'JAX', by: 'Futuret3ch and MemeTorrent' });
    }
    if (pathname === '/api/session' && req.method === 'GET') {
      if (!process.env.LEDGER_ACCESS_CODE || !process.env.LEDGER_SESSION_SECRET) {
        return send(res, 503, { error: 'JAX access is not configured' });
      }
      if (!sessionOk(req)) return send(res, 401, { error: 'Locked' });
      return send(res, 200, { ok: true });
    }
    if (pathname === '/api/session' && req.method === 'POST') {
      const code = process.env.LEDGER_ACCESS_CODE;
      const secret = process.env.LEDGER_SESSION_SECRET;
      if (!code || !secret) return send(res, 503, { error: 'Ledger access is not configured' });
      const body = await readJson(req);
      if (!codesMatch(body.code, code)) return send(res, 401, { error: 'That code is not right' });
      const token = signSession(secret, Date.now() + MONTH * 1000);
      return send(res, 200, { ok: true }, { 'set-cookie': cookie(token) });
    }
    if (pathname === '/api/session' && req.method === 'DELETE') {
      return send(res, 200, { ok: true }, { 'set-cookie': cookie('') });
    }
    if (pathname === '/api/state' && (req.method === 'GET' || req.method === 'PUT')) {
      if (storageMode() === 'missing') return send(res, 503, { error: 'Storage is not connected' });
      if (!sessionOk(req)) return send(res, 401, { error: 'Locked' });
      if (req.method === 'GET') {
        const book = await loadBook();
        return send(res, 200, book.bills ? book : emptyBook());
      }
      const body = await readJson(req);
      const normalized = normalizeBook(body);
      const saved = await saveBook(normalized);
      return send(res, 200, saved);
    }
    if (pathname === '/api/feed' && req.method === 'POST') {
      const feedToken = process.env.LEDGER_FEED_TOKEN || '';
      if (!feedToken) return send(res, 503, { error: 'No bank feed is connected' });
      if (storageMode() === 'missing') return send(res, 503, { error: 'Storage is not connected' });
      const header = req.headers.authorization || '';
      const presented = header.replace(/^Bearer\s+/i, '');
      if (!codesMatch(presented, feedToken)) return send(res, 401, { error: 'Feed token is not right' });
      const body = await readJson(req);
      const current = await loadBook();
      const incoming = Array.isArray(body.transactions) ? body.transactions : null;
      if (!incoming) return send(res, 400, { error: 'Send a transactions list' });
      const seen = new Set((current.transactions || []).map((row) => `${row.postedOn}|${row.amountCents}|${row.description}`));
      const added = [];
      for (const row of incoming) {
        const key = `${row.postedOn}|${row.amountCents}|${row.description}`;
        if (seen.has(key)) continue;
        seen.add(key);
        added.push({
          id: row.id || `feed_${Date.now().toString(36)}_${added.length}`,
          postedOn: row.postedOn,
          description: row.description,
          amountCents: row.amountCents,
          reference: row.reference || '',
          matchBillId: '',
          matchOccurrence: '',
          createdAt: new Date().toISOString(),
        });
      }
      const normalized = normalizeBook({ ...current, transactions: [...(current.transactions || []), ...added] });
      const saved = await saveBook(normalized);
      return send(res, 200, { added: added.length, version: saved.version });
    }
    if (pathname === '/api/keepers' && req.method === 'GET') {
      const practice = await loadPractice();
      return send(res, 200, { keepers: (practice.keepers || []).map(publicKeeper) });
    }
    if (pathname === '/api/keepers' && req.method === 'POST') {
      const body = await readJson(req);
      const practice = await loadPractice();
      const next = signupKeeper(practice, body, `keep_${crypto.randomUUID()}`);
      const saved = await savePractice(next);
      return send(res, 200, { ok: true, keeper: publicKeeper(saved.keepers.at(-1)) });
    }
    if (pathname === '/api/asks' && req.method === 'POST') {
      const body = await readJson(req);
      const practice = await loadPractice();
      const next = addAsk(practice, body, `ask_${crypto.randomUUID()}`);
      const saved = await savePractice(next);
      return send(res, 200, { ok: true, id: saved.asks.at(-1).id });
    }
    if (pathname === '/api/keeper-box' && req.method === 'POST') {
      const body = await readJson(req);
      const practice = await loadPractice();
      const email = String(body.email || '').trim().toLowerCase();
      const keeper = (practice.keepers || []).find((row) => row.email === email);
      if (!keeper || !checkPass(body.passphrase, keeper.pass)) {
        return send(res, 401, { error: 'That email or passphrase is not right' });
      }
      const asks = (practice.asks || []).filter((ask) => ask.keeperId === keeper.id);
      return send(res, 200, { keeper: publicKeeper(keeper), asks });
    }
    if (pathname === '/api/practice' && req.method === 'GET') {
      if (!sessionOk(req)) return send(res, 401, { error: 'Locked' });
      const practice = await loadPractice();
      return send(res, 200, {
        keepers: (practice.keepers || []).map((row) => ({ ...publicKeeper(row), email: row.email, phone: row.phone, createdAt: row.createdAt })),
        asks: practice.asks || [],
      });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof ValidationError) return send(res, 400, { error: err.message });
    if (err instanceof SyntaxError) return send(res, 400, { error: 'That was not valid JSON' });
    if (err?.code === 'CONFLICT') return send(res, 409, { error: err.message, book: err.book });
    if (err?.code === 'NO_STORAGE') return send(res, 503, { error: err.message });
    if (err?.status === 413) return send(res, 413, { error: err.message });
    console.error(err);
    return send(res, 500, { error: 'The desk could not be saved' });
  }
}
