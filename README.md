# Ledger

Bill and payment desk for Futuret3ch. Schedule money going out and money coming in, in Australian dollars, then record what was actually paid.

Dates use Melbourne time. Monthly and quarterly dates keep the same day of the month, or the last day when the month is shorter. A payment stays on the due date you record it against and does not pay the next one. GST uses the ATO one-eleventh rule for tax-inclusive amounts.

There is no sample data. The desk starts empty.

## Use

Unlock with the access code, then add a bill. Choose **We pay** or **They pay us**, the amount, GST, the first due date, and how it repeats. Due shows what is still open. Schedule shows the window ahead, including dates already paid. Paid lists each recorded payment.

Import a CSV with the columns in the blank template (`direction`, `vendor`, `title`, `amount`, `gst`, `first_due`, `repeats`, `category`, `reference`, `notes`, `ends_on`). Import adds those rows. A JSON backup can replace the desk.

## Storage

Production stores the desk in a private Vercel Blob. The access code and session secret are project environment variables: `LEDGER_ACCESS_CODE` and `LEDGER_SESSION_SECRET`. They are not in this repository.

Local development uses `data/ledger.json` unless `BLOB_READ_WRITE_TOKEN` is set. Copy those variables into `.env.local` (gitignored) before `npm run dev`.

```bash
npm test
npm run dev
```
