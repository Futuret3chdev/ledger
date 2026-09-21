import { addDays, addMonths } from './dates.js';
import { splitGst } from './money.js';

const MAX_STEPS = 2000;

export function stepDate(start, recurrence, index) {
  if (index === 0) return start;
  if (recurrence === 'once') return null;
  if (recurrence === 'weekly') return addDays(start, 7 * index);
  if (recurrence === 'fortnightly') return addDays(start, 14 * index);
  if (recurrence === 'monthly') return addMonths(start, index);
  if (recurrence === 'quarterly') return addMonths(start, index * 3);
  if (recurrence === 'yearly') return addMonths(start, index * 12);
  return null;
}

function paymentsFor(billId, payments) {
  const map = new Map();
  for (const p of payments || []) {
    if (p.billId !== billId) continue;
    map.set(p.occurrenceDate, (map.get(p.occurrenceDate) || 0) + p.amountCents);
  }
  return map;
}

function adjustmentsFor(billId, adjustments) {
  const map = new Map();
  for (const a of adjustments || []) {
    if (a.billId === billId) map.set(a.occurrenceDate, a);
  }
  return map;
}

/**
 * Every occurrence from the first due date through `until` (original date),
 * plus a year of buffer so a moved date can land inside the window.
 */
export function projectBill(bill, payments, adjustments, until) {
  const pays = paymentsFor(bill.id, payments);
  const adjs = adjustmentsFor(bill.id, adjustments);
  const stop = addDays(until, 366);
  const out = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const original = stepDate(bill.startsOn, bill.recurrence, i);
    if (!original) break;
    if (bill.endsOn && original > bill.endsOn) break;
    if (original > stop) break;
    const adj = adjs.get(original);
    const skipped = Boolean(adj?.skip);
    const date = !skipped && adj?.moveTo ? adj.moveTo : original;
    const basis = Number.isInteger(adj?.amountCents) ? adj.amountCents : bill.amountCents;
    const money = splitGst(basis, bill.gstMode);
    const paidCents = pays.get(original) || 0;
    const remainingCents = skipped ? 0 : Math.max(0, money.total - paidCents);
    out.push({
      billId: bill.id,
      direction: bill.direction,
      vendor: bill.vendor,
      title: bill.title,
      category: bill.category,
      recurrence: bill.recurrence,
      reference: bill.reference || '',
      originalDate: original,
      date,
      skipped,
      paused: Boolean(bill.paused),
      exGst: money.exGst,
      gst: money.gst,
      total: money.total,
      paidCents,
      remainingCents,
      extraCents: skipped ? 0 : Math.max(0, paidCents - money.total),
      divisionId: bill.divisionId || '',
      franchiseId: bill.franchiseId || '',
      supplierId: bill.supplierId || '',
      subcontractorId: bill.subcontractorId || '',
    });
    if (bill.recurrence === 'once') break;
  }
  return out;
}

export function projectBook(book, today, until) {
  const items = [];
  for (const bill of book.bills || []) {
    for (const item of projectBill(bill, book.payments, book.adjustments, until)) {
      if (bill.paused && item.originalDate > today) continue;
      items.push(item);
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.vendor.localeCompare(b.vendor) || a.title.localeCompare(b.title));
  return items;
}

export function itemStatus(item, today) {
  if (item.skipped) return 'skipped';
  if (item.total === 0 && item.paidCents === 0) {
    return item.date === today ? 'due' : 'scheduled';
  }
  if (item.paidCents >= item.total) return item.extraCents > 0 ? 'overpaid' : 'paid';
  if (item.paidCents > 0 && item.date < today) return 'partial-overdue';
  if (item.paidCents > 0) return 'partial';
  if (item.date < today) return 'overdue';
  if (item.date === today) return 'due';
  return 'scheduled';
}

export function openItems(items) {
  return items.filter((it) => !it.skipped && it.remainingCents > 0);
}

export function sumRemaining(items, direction) {
  return items.reduce((sum, it) => {
    if (direction && it.direction !== direction) return sum;
    return sum + it.remainingCents;
  }, 0);
}

export function inRange(items, from, to) {
  return items.filter((it) => it.date >= from && it.date <= to);
}

/** One card per bill. Repeats stay together instead of one row per date. */
export function seriesCards(items) {
  const order = [];
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.billId)) {
      map.set(item.billId, []);
      order.push(item.billId);
    }
    map.get(item.billId).push(item);
  }
  return order.map((id) => {
    const list = map.get(id).slice().sort((a, b) => a.date.localeCompare(b.date) || a.originalDate.localeCompare(b.originalDate));
    const open = list.filter((it) => !it.skipped && it.remainingCents > 0);
    const head = list[0];
    return {
      billId: id,
      vendor: head.vendor,
      title: head.title,
      category: head.category,
      recurrence: head.recurrence,
      direction: head.direction,
      reference: head.reference,
      items: list,
      open,
      remainingCents: open.reduce((sum, it) => sum + it.remainingCents, 0),
      gstCents: list.filter((it) => !it.skipped).reduce((sum, it) => sum + it.gst, 0),
      next: open[0] || list[0],
    };
  });
}

/** Earliest open date of each bill, so a monthly bill does not fill every group. */
export function nextOpenPerBill(items) {
  const seen = new Set();
  const out = [];
  const sorted = items.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const item of sorted) {
    if (seen.has(item.billId)) continue;
    seen.add(item.billId);
    out.push(item);
  }
  return out;
}
