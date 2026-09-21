import { CATEGORIES, DIRECTIONS, GST_MODES, RECURRENCES } from './catalog.js';
import { isIsoDate } from './dates.js';
import { dollarsToCents } from './money.js';

const HEADERS = [
  'direction',
  'vendor',
  'title',
  'amount',
  'gst',
  'first_due',
  'repeats',
  'category',
  'reference',
  'notes',
  'ends_on',
];

export function parseCsvTable(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function quote(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(quote).join(',')).join('\n') + '\n';
}

export function billsToCsv(bills) {
  const lines = [HEADERS];
  for (const b of bills) {
    lines.push([
      b.direction,
      b.vendor,
      b.title,
      (b.amountCents / 100).toFixed(2),
      b.gstMode,
      b.startsOn,
      b.recurrence,
      b.category,
      b.reference || '',
      b.notes || '',
      b.endsOn || '',
    ]);
  }
  return toCsv(lines);
}

/**
 * Turn a CSV into bill drafts. Does not invent ids.
 * `id` is filled by the caller. Returns { drafts, errors }.
 */
export function draftsFromCsv(text) {
  const table = parseCsvTable(text);
  if (!table.length) return { drafts: [], errors: [{ row: 1, message: 'The file is empty' }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = ['vendor', 'title', 'amount', 'first_due'].filter((h) => !header.includes(h));
  if (missing.length) {
    return { drafts: [], errors: [{ row: 1, message: `Missing column: ${missing.join(', ')}` }] };
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const cell = (cols, name) => (idx[name] == null ? '' : String(cols[idx[name]] ?? '').trim());
  const drafts = [];
  const errors = [];
  table.slice(1).forEach((cols, n) => {
    const row = n + 2;
    const amountCents = dollarsToCents(cell(cols, 'amount'));
    const direction = (cell(cols, 'direction') || 'out').toLowerCase();
    const gstMode = (cell(cols, 'gst') || 'none').toLowerCase();
    const recurrence = (cell(cols, 'repeats') || 'once').toLowerCase();
    const category = cell(cols, 'category') || 'Other';
    const startsOn = cell(cols, 'first_due');
    const endsOn = cell(cols, 'ends_on');
    const problems = [];
    if (!cell(cols, 'vendor')) problems.push('vendor is empty');
    if (!cell(cols, 'title')) problems.push('title is empty');
    if (amountCents == null) problems.push('amount is not a dollar value');
    if (!DIRECTIONS.includes(direction)) problems.push('direction must be out or in');
    if (!GST_MODES.includes(gstMode)) problems.push('gst must be none, inclusive, or exclusive');
    if (!RECURRENCES.includes(recurrence)) problems.push('repeats is not weekly, fortnightly, monthly, quarterly, yearly, or once');
    if (!CATEGORIES.includes(category)) problems.push('unknown category');
    if (!isIsoDate(startsOn)) problems.push('first_due must be YYYY-MM-DD');
    if (endsOn && !isIsoDate(endsOn)) problems.push('ends_on must be YYYY-MM-DD');
    if (endsOn && isIsoDate(startsOn) && endsOn < startsOn) problems.push('ends_on is before first_due');
    if (problems.length) {
      errors.push({ row, message: problems.join('; ') });
      return;
    }
    drafts.push({
      direction,
      vendor: cell(cols, 'vendor'),
      title: cell(cols, 'title'),
      amountCents,
      gstMode,
      startsOn,
      recurrence,
      category,
      reference: cell(cols, 'reference'),
      notes: cell(cols, 'notes'),
      endsOn: endsOn || null,
      paused: false,
    });
  });
  return { drafts, errors };
}

export const CSV_TEMPLATE = toCsv([HEADERS]);
