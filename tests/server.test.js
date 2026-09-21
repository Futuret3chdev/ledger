import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dir = await mkdtemp(path.join(tmpdir(), 'ledger-'));
process.env.LEDGER_DATA_FILE = path.join(dir, 'ledger.json');
process.env.LEDGER_ACCESS_CODE = 'desk-test-code';
process.env.LEDGER_SESSION_SECRET = 'desk-test-secret';
process.env.BLOB_READ_WRITE_TOKEN = '';
delete process.env.VERCEL;

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

test('session, save, and conflict', async () => {
  const locked = await call('GET', '/api/state');
  assert.equal(locked.statusCode, 401);

  const bad = await call('POST', '/api/session', { body: { code: 'nope' } });
  assert.equal(bad.statusCode, 401);

  const ok = await call('POST', '/api/session', { body: { code: 'desk-test-code' } });
  assert.equal(ok.statusCode, 200);
  const cookie = ok.headers['set-cookie'].split(';')[0];

  const empty = await call('GET', '/api/state', { cookie });
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.body.bills.length, 0);
  assert.equal(empty.body.deskName, 'Futuret3ch');

  const bill = {
    id: 'bill_server_1',
    direction: 'out',
    vendor: 'Origin',
    title: 'Power',
    category: 'Utilities',
    amountCents: 18450,
    gstMode: 'inclusive',
    startsOn: '2026-10-06',
    recurrence: 'quarterly',
    endsOn: null,
    reference: '',
    notes: '',
    paused: false,
    createdAt: '2026-09-22T01:00:00.000Z',
    updatedAt: '2026-09-22T01:00:00.000Z',
  };
  const saved = await call('PUT', '/api/state', {
    cookie,
    body: { ...empty.body, bills: [bill] },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.version, 1);
  assert.equal(saved.body.bills[0].vendor, 'Origin');

  const stale = await call('PUT', '/api/state', {
    cookie,
    body: { ...empty.body, bills: [] },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.body.book.bills.length, 1);

  const again = await call('GET', '/api/state', { cookie });
  assert.equal(again.body.version, 1);
  assert.equal(again.body.bills[0].title, 'Power');
});

test.after(async () => {
  await rm(dir, { recursive: true, force: true });
});
