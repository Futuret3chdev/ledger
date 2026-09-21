/** Calendar dates as YYYY-MM-DD. Arithmetic is UTC so a day never drifts. */

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  const dt = parseISODate(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatISODate(dt);
}

/** Add calendar months, keeping the original day-of-month or the last day. */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return formatISODate(dt);
}

export function todayInZone(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const ZONE = 'Australia/Melbourne';

export function todayMelbourne(now = new Date()) {
  return todayInZone(ZONE, now);
}

/** Monday on or before `iso`. Weeks on this desk start Monday. */
export function mondayOnOrBefore(iso) {
  const day = parseISODate(iso).getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  return addDays(iso, delta);
}

export function longDate(iso) {
  const dt = parseISODate(iso);
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export function shortDate(iso) {
  const dt = parseISODate(iso);
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

/** Australian BAS quarters: Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun. */
export function quarterRange(today) {
  const [y, m] = today.split('-').map(Number);
  let startMonth = 1;
  if (m >= 7 && m <= 9) startMonth = 7;
  else if (m >= 10) startMonth = 10;
  else if (m <= 3) startMonth = 1;
  else startMonth = 4;
  const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
  const end = addDays(addMonths(start, 3), -1);
  return { start, end };
}
