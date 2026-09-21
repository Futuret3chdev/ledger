import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JaxFeed } from '../sdk/jax-feed/src/index.js';

const dir = await mkdtemp(path.join(tmpdir(), 'jax-feed-'));
process.env.LEDGER_DATA_FILE = path.join(dir, 'ledger.json');
process.env.LEDGER_ACCESS_CODE = 'desk-test-code';
process.env.LEDGER_SESSION_SECRET = 'desk-test-secret';
process.env.LEDGER_FEED_TOKEN = 'feed-test-token';
process.env.BLOB_READ_WRITE_TOKEN = '';
delete process.env.VERCEL;

const { handle } = await import('../lib/server.js');

function fetchImpl(url, options = {}) {
  const body = options.body ? JSON.parse(options.body) : undefined;
  const req = {
    method: options.method || 'GET',
    url: new URL(url, 'http://localhost').pathname,
    headers: Object.fromEntries(Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v])),
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
  return handle(req, res).then(() => ({
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    json: async () => res.body,
  }));
}

test('feed SDK pings and posts', async () => {
  const feed = new JaxFeed({ baseUrl: 'http://localhost', token: 'feed-test-token', fetchImpl });
  const ping = await feed.ping();
  assert.equal(ping.ok, true);
  assert.equal(ping.feed, true);
  const posted = await feed.post([
    { postedOn: '2026-09-22', description: 'HOSTGATOR HOSTING', amountCents: -7500 },
  ]);
  assert.equal(posted.added, 1);
  const again = await feed.post([
    { postedOn: '2026-09-22', description: 'HOSTGATOR HOSTING', amountCents: -7500 },
  ]);
  assert.equal(again.added, 0);
});

test('feed SDK rejects a bad token', async () => {
  const feed = new JaxFeed({ baseUrl: 'http://localhost', token: 'wrong-token-xx', fetchImpl });
  await assert.rejects(() => feed.ping(), /not right|401/);
});

test.after(async () => {
  await rm(dir, { recursive: true, force: true });
});
