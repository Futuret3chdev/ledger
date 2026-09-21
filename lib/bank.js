import { parseCsvTable } from './csv.js';
import { isIsoDate } from './dates.js';
import { dollarsToCents } from './money.js';

function auDate(value) {
  const s = String(value || '').trim();
  if (isIsoDate(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  let day = Number(m[1]);
  let month = Number(m[2]);
  const year = Number(m[3]);
  if (day > 12 && month <= 12) {
    /* already day/month */
  } else if (month > 12 && day <= 12) {
    const swap = day;
    day = month;
    month = swap;
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

function signedAmount(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  const cents = dollarsToCents(s.replace(/[()]/g, '').replace(/^-/, ''));
  if (cents == null) return null;
  return negative ? -cents : cents;
}

/**
 * Statement rows. Amount is signed: money out is negative.
 * Accepts date,description,amount or date,description,debit,credit.
 * Dates are YYYY-MM-DD or day/month/year.
 */
export function draftsFromStatement(text) {
  const table = parseCsvTable(text);
  if (!table.length) return { drafts: [], errors: [{ row: 1, message: 'The file is empty' }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const dateCol = ['date', 'posted', 'posted_on', 'transaction date'].find((n) => idx[n] != null);
  const descCol = ['description', 'narrative', 'details', 'memo'].find((n) => idx[n] != null);
  if (dateCol == null || descCol == null) {
    return { drafts: [], errors: [{ row: 1, message: 'Need a date column and a description column' }] };
  }
  const cell = (cols, name) => (idx[name] == null ? '' : String(cols[idx[name]] ?? '').trim());
  const drafts = [];
  const errors = [];
  table.slice(1).forEach((cols, n) => {
    const row = n + 2;
    const postedOn = auDate(cell(cols, dateCol));
    const description = cell(cols, descCol);
    let amountCents = null;
    if (idx.amount != null || idx['amount aud'] != null) {
      amountCents = signedAmount(cell(cols, idx.amount != null ? 'amount' : 'amount aud'));
    } else if (idx.debit != null || idx.credit != null) {
      const debit = signedAmount(cell(cols, 'debit'));
      const credit = signedAmount(cell(cols, 'credit'));
      if (debit) amountCents = -Math.abs(debit);
      else if (credit) amountCents = Math.abs(credit);
      else amountCents = 0;
    }
    const problems = [];
    if (!postedOn) problems.push('date must be YYYY-MM-DD or day/month/year');
    if (!description) problems.push('description is empty');
    if (amountCents == null || amountCents === 0) problems.push('amount is empty');
    if (problems.length) {
      errors.push({ row, message: problems.join('; ') });
      return;
    }
    drafts.push({
      postedOn,
      description,
      amountCents,
      reference: cell(cols, 'reference'),
    });
  });
  return { drafts, errors };
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
  return Math.abs(Math.round(ms / 86400000));
}

/**
 * How well a statement line fits an open bill date.
 * 0.60 same remaining amount, 0.35 vendor name in the description, 0.05 date within 3 days.
 * This is a rule, not a model. 0.95 means amount and vendor both matched and the date is close.
 */
export function matchScore(txn, item) {
  if (!item || item.skipped || item.remainingCents <= 0) return 0;
  const wanted = item.direction === 'out' ? -item.remainingCents : item.remainingCents;
  let score = 0;
  if (txn.amountCents === wanted) score += 0.6;
  else if (Math.abs(Math.abs(txn.amountCents) - item.remainingCents) <= 1) score += 0.4;
  const desc = String(txn.description || '').toLowerCase();
  const vendor = String(item.vendor || '').toLowerCase().trim();
  if (vendor && desc.includes(vendor)) score += 0.35;
  else {
    const token = vendor.split(/\s+/).find((part) => part.length > 3) || '';
    if (token && desc.includes(token)) score += 0.2;
  }
  const days = daysBetween(txn.postedOn, item.date);
  if (days <= 3) score += 0.05;
  return Math.round(Math.min(1, score) * 100) / 100;
}

export function bestMatch(txn, items) {
  let best = null;
  let score = 0;
  for (const item of items) {
    const next = matchScore(txn, item);
    if (next > score) {
      score = next;
      best = item;
    }
  }
  return { item: best, score };
}
