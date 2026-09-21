import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { codesMatch, readCookie, readSession, signSession } from './auth.js';
import { loadBook, saveBook, storageMode } from './store.js';
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
    if (!process.env[key]) process.env[key] = value;
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
      return send(res, 200, { ok: true, name: 'Ledger', by: 'Futuret3ch' });
    }
    if (pathname === '/api/session' && req.method === 'GET') {
      if (!process.env.LEDGER_ACCESS_CODE || !process.env.LEDGER_SESSION_SECRET) {
        return send(res, 503, { error: 'Ledger access is not configured' });
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
