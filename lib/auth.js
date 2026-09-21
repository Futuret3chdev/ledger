import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 1;

export function signSession(secret, expMs) {
  const body = Buffer.from(JSON.stringify({ v: VERSION, exp: expMs })).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readSession(secret, token) {
  if (!secret || !token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expect = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
  if (!payload || payload.v !== VERSION || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Date.now()) return null;
  return payload;
}

export function codesMatch(input, expected) {
  const a = Buffer.from(String(input ?? ''));
  const b = Buffer.from(String(expected ?? ''));
  if (!expected || a.length === 0 || a.length !== b.length) {
    const dummy = Buffer.alloc(32, 1);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function readCookie(header, name) {
  if (!header) return '';
  const parts = header.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}
