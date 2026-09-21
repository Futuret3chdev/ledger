# JAX

Books for the MT ECO SYSTEM, by Futuret3ch and MemeTorrent. Schedule money going out and money coming in, in Australian dollars, then record what was actually paid.

Dates use Melbourne time. Monthly and quarterly dates keep the same day of the month, or the last day when the month is shorter. A payment stays on the due date you record it against and does not pay the next one. GST uses the ATO one-eleventh rule for tax-inclusive amounts.

There is no sample data. The desk starts empty.

## Use

Unlock with the access code, then add a bill. Choose **We pay** or **They pay us**, the amount, GST, the first due date, and how it repeats. Due shows the next open date of each bill. Plan groups a repeat onto one card. Tax builds a BAS worksheet from the desk. Desk holds the business profile and statement import.

JAX matching is a rule: remaining amount, vendor name in the description, date within three days. It is not a trained model. There is no bank login in the desk. `POST /api/feed` accepts statement lines from a logged-in desk session, or with `Authorization: Bearer` when `LEDGER_FEED_TOKEN` is set. Test from Desk → Bank feed, or `./jax-feed ping` then `./jax-feed post --on YYYY-MM-DD --desc TEXT --cents -7500`.

Sole traders, partnerships, companies, and trusts can hold employees and subcontractors. Businesses, companies, and partnerships can also hold divisions and franchises.

This app can be installed from the browser on a phone or a computer. It is not listed on the Apple App Store or Google Play.

Import a CSV with the columns in the blank template (`direction`, `vendor`, `title`, `amount`, `gst`, `first_due`, `repeats`, `category`, `reference`, `notes`, `ends_on`). Import adds those rows. A JSON backup can replace the desk.

## Storage

Production stores the desk in a private Vercel Blob. The access code and session secret are project environment variables: `LEDGER_ACCESS_CODE` and `LEDGER_SESSION_SECRET`. They are not in this repository.

Local development uses `data/ledger.json` unless `BLOB_READ_WRITE_TOKEN` is set. Copy those variables into `.env.local` (gitignored) before `npm run dev`.

```bash
npm test
npm run dev
```
