# JAX Feed SDK

Post statement lines into JAX. Money out is negative cents. The feed does not pull from a bank. Your connector (Basiq, a CSV watcher, or your own code) calls this.

## Test ping

```bash
cd sdk/jax-feed
LEDGER_FEED_TOKEN=your-token node bin/jax-feed.mjs ping --url https://ledger-futuret3ch.vercel.app
```

Expect `{ "ok": true, "name": "JAX", "feed": true }`.

## Post lines

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

Lines already on the desk (same date, amount, description) are skipped. Open JAX → Desk to match them.
