# Quill Feed SDK

Post statement lines into Quill. Money out is negative cents. The feed does not pull from a bank. A connector, a CSV watcher, or this CLI posts to `POST /api/feed`.

The desk also has Bank login through Basiq. This SDK is the machine feed: logged-in posts use the desk session; connectors use the Bearer token. To post a test line without a bank, unlock Quill → Desk → Bank feed → Post a test line.

## Test ping

```bash
./jax-feed ping
```

From this repo, `LEDGER_FEED_TOKEN` loads from `/root/ledger/.env.local` if unset. Expect `{ "ok": true, "name": "Quill", "feed": true }`.

```bash
cd sdk/jax-feed
LEDGER_FEED_TOKEN=your-token node bin/jax-feed.mjs ping --url https://ledger-futuret3ch.vercel.app
```

## Post lines

```bash
./jax-feed post --on 2026-09-22 --desc "HOSTGATOR HOSTING" --cents -7500
./jax-feed post --file examples/transactions.json
```

```bash
LEDGER_FEED_TOKEN=your-token node bin/jax-feed.mjs post --url https://ledger-futuret3ch.vercel.app --file examples/transactions.json
```

From Node:

```js
import { JaxFeed } from './src/index.js';

const feed = new JaxFeed({
  baseUrl: 'https://ledger-futuret3ch.vercel.app',
  token: process.env.LEDGER_FEED_TOKEN,
});
await feed.ping();
await feed.post([
  { postedOn: '2026-09-22', description: 'HOSTGATOR HOSTING', amountCents: -7500 },
]);
```

`POST /api/feed` header: `Authorization: Bearer <token>`.
Body: `{ "transactions": [{ "postedOn": "YYYY-MM-DD", "description": "...", "amountCents": -7500, "reference": "" }] }`.

Lines already on the desk (same date, amount, description) are skipped. Open Quill → Desk to match them.
