import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auMobile, consentUrl, rowsFromTransactions } from '../lib/basiq.js';

const dir = await mkdtemp(path.join(tmpdir(), 'jax-bank-'));
process.env.LEDGER_DATA_FILE = path.join(dir, 'ledger.json');
process.env.LEDGER_ACCESS_CODE = 'desk-test-code';
process.env.LEDGER_SESSION_SECRET = 'desk-test-secret';
process.env.BLOB_READ_WRITE_TOKEN = '';
process.env.BASIQ_API_KEY = '';
delete process.env.VERCEL;

function json(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const users = new Map();

globalThis.jaxFetch = async (url, options = {}) => {
  const u = new URL(url, 'https://au-api.basiq.io');
  const method = (options.method || 'GET').toUpperCase();
  const body = String(options.body || '');
  if (u.pathname === '/token' && method === 'POST') {
    if (body.includes('CLIENT_ACCESS')) return json(200, { access_token: 'cli-token' });
    return json(200, { access_token: 'srv-token' });
  }
  if (u.pathname === '/users' && method === 'POST') {
    const payload = JSON.parse(body);
    const id = 'user12345678';
    users.set(id, payload);
    return json(200, { id, email: payload.email, mobile: payload.mobile });
  }
  if (u.pathname.startsWith('/users/') && method === 'GET' && u.pathname.endsWith('/connections')) {
    return json(200, {
      type: 'list',
      data: [{ id: 'conn01ab', status: 'active', institution: { name: 'Hooli', shortName: 'Hooli' } }],
      links: {},
    });
  }
  if (u.pathname.startsWith('/users/') && method === 'GET' && u.pathname.endsWith('/accounts')) {
    return json(200, {
      type: 'list',
      data: [{ id: 'acc001ab', name: 'Spending', accountNo: '12345678', balance: '240.50', connection: 'conn01ab' }],
      links: {},
    });
  }
  if (u.pathname.startsWith('/users/') && method === 'GET' && u.pathname.includes('/transactions')) {
    return json(200, {
      type: 'list',
      data: [
        {
          id: 'tx0001ab',
          status: 'posted',
          description: 'HOSTGATOR HOSTING',
          postDate: '2026-09-22T02:00:00Z',
          amount: '-75.00',
          account: 'acc001ab',
        },
      ],
      links: {},
    });
  }
  if (u.pathname.startsWith('/users/') && method === 'GET') {
    const id = u.pathname.split('/')[2];
    if (!users.has(id)) return json(404, { data: [{ title: 'Not found' }] });
    return json(200, { id, ...users.get(id) });
  }
  if (u.pathname.startsWith('/users/') && method === 'DELETE') {
    users.delete(u.pathname.split('/')[2]);
    return json(204, {});
  }
  return json(404, { error: 'not mocked ' + method + ' ' + u.pathname });
};

const { handle } = await import('../lib/server.js');

function call(method, url, { body, cookie } = {}) {
  const req = {
    method,
    url,
    headers: cookie ? { cookie } : {},
    body,
  };
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(payload) {
      this.raw = payload;
      this.body = payload ? JSON.parse(payload) : null;
    },
  };
  return handle(req, res).then(() => res);
}

test('AU mobiles normalise and Basiq rows become signed cents', () => {
  assert.equal(auMobile('0412 345 678'), '+61412345678');
  assert.equal(auMobile('+61412345678'), '+61412345678');
  assert.equal(auMobile('02 1234 5678'), '');
  const rows = rowsFromTransactions([
    { id: 'tx0001ab', status: 'posted', description: 'HOSTGATOR HOSTING', postDate: '2026-09-22T02:00:00Z', amount: '-75.00' },
    { id: 'skip', status: 'pending', description: 'HOLD', postDate: '2026-09-22T02:00:00Z', amount: '-1.00' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountCents, -7500);
  assert.equal(rows[0].postedOn, '2026-09-22');
  assert.equal(rows[0].id, 'basiq_tx0001ab');
});

test('consent URL is Basiq home with connect action', () => {
  const url = consentUrl('cli-token');
  assert.match(url, /^https:\/\/consent\.basiq\.io\/home\?/);
  assert.match(url, /token=cli-token/);
  assert.match(url, /action=connect/);
  assert.equal(url.includes('redirect='), false);
});

test('bank login is off until a Basiq key is set', async () => {
  const locked = await call('GET', '/api/bank');
  assert.equal(locked.statusCode, 401);
  const ok = await call('POST', '/api/session', { body: { code: 'desk-test-code' } });
  const cookie = ok.headers['set-cookie'].split(';')[0];
  const status = await call('GET', '/api/bank', { cookie });
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.configured, false);
  const denied = await call('POST', '/api/bank', { cookie, body: { action: 'connect', email: 'a@b.co', mobile: '0412345678' } });
  assert.equal(denied.statusCode, 503);
});

test('connect a bank, pull statements, then disconnect', async () => {
  process.env.BASIQ_API_KEY = 'test-basiq-key';
  const ok = await call('POST', '/api/session', { body: { code: 'desk-test-code' } });
  const cookie = ok.headers['set-cookie'].split(';')[0];

  const started = await call('POST', '/api/bank', {
    cookie,
    body: { action: 'connect', email: 'desk@futuret3ch.com.au', mobile: '0412345678' },
  });
  assert.equal(started.statusCode, 200, started.body?.error);
  assert.match(started.body.url, /consent\.basiq\.io\/home/);
  assert.match(started.body.url, /cli-token/);
  assert.match(started.body.url, /action=connect/);
  assert.equal(started.body.bank.connected, true);

  const pulled = await call('POST', '/api/bank', { cookie, body: { action: 'sync' } });
  assert.equal(pulled.statusCode, 200, pulled.body?.error);
  assert.equal(pulled.added ?? pulled.body.added, 1);
  assert.equal(pulled.body.bank.connections[0].institution, 'Hooli');
  assert.equal(pulled.body.bank.connections[0].accounts[0].masked, '••••5678');

  const state = await call('GET', '/api/state', { cookie });
  assert.equal(state.body.transactions.length, 1);
  assert.equal(state.body.transactions[0].description, 'HOSTGATOR HOSTING');
  assert.equal(state.body.transactions[0].amountCents, -7500);

  const again = await call('POST', '/api/bank', { cookie, body: { action: 'sync' } });
  assert.equal(again.body.added, 0);

  const cut = await call('POST', '/api/bank', { cookie, body: { action: 'disconnect' } });
  assert.equal(cut.statusCode, 200);
  assert.equal(cut.body.bank.connected, false);
  const after = await call('GET', '/api/state', { cookie });
  assert.equal(after.body.transactions.length, 1);
  process.env.BASIQ_API_KEY = '';
});

test.after(async () => {
  delete globalThis.jaxFetch;
  await rm(dir, { recursive: true, force: true });
});
