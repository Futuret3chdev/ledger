import { addDays, addMonths, quarterRange } from './dates.js';
import { projectBook } from './schedule.js';
import { mileageClaim } from './rates.js';

export function financialYear(today, startMonth = 7) {
  const [y, m] = today.split('-').map(Number);
  const startYear = m >= startMonth ? y : y - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const end = addDays(addMonths(start, 12), -1);
  return { start, end, label: `${startYear}–${String(startYear + 1).slice(-2)}` };
}

function inWindow(date, from, to) {
  return date >= from && date <= to;
}

/**
 * BAS figures from the desk.
 * Accrual uses the due date. Cash uses the day the payment was recorded.
 * GST-free sales sit in G1 and not in 1A. Input-taxed purchases are not in 1B.
 * This prepares the numbers. It does not lodge with the ATO.
 */
export function basWorksheet(book, today) {
  const quarter = quarterRange(today);
  const basis = book.profile?.gstBasis === 'cash' ? 'cash' : 'accrual';
  const items = projectBook(book, today, quarter.end).filter((item) => !item.skipped);
  const sales = { exGst: 0, gst: 0, total: 0 };
  const purchases = { exGst: 0, gst: 0, total: 0 };
  const g1 = { total: 0 };

  if (basis === 'accrual') {
    for (const item of items) {
      if (!inWindow(item.date, quarter.start, quarter.end)) continue;
      const bucket = item.direction === 'in' ? sales : purchases;
      const countsGst = item.gst > 0;
      if (item.direction === 'in') g1.total += item.total;
      if (countsGst) {
        bucket.exGst += item.exGst;
        bucket.gst += item.gst;
        bucket.total += item.total;
      }
    }
  } else {
    const byKey = new Map(items.map((item) => [`${item.billId}:${item.originalDate}`, item]));
    for (const payment of book.payments || []) {
      if (!inWindow(payment.paidOn, quarter.start, quarter.end)) continue;
      const item = byKey.get(`${payment.billId}:${payment.occurrenceDate}`);
      if (!item) continue;
      const share = item.total > 0 ? payment.amountCents / item.total : 0;
      const gst = Math.round(item.gst * share);
      const total = Math.min(payment.amountCents, item.total);
      const exGst = Math.max(0, total - gst);
      if (item.direction === 'in') g1.total += total;
      if (item.gst > 0) {
        const bucket = item.direction === 'in' ? sales : purchases;
        bucket.exGst += exGst;
        bucket.gst += gst;
        bucket.total += total;
      }
    }
  }

  return {
    quarter,
    basis,
    g1: g1.total,
    label1A: sales.gst,
    label1B: purchases.gst,
    netGst: sales.gst - purchases.gst,
    sales,
    purchases,
  };
}

export function yearTotals(book, today) {
  const year = financialYear(today, book.profile?.yearStartMonth || 7);
  const items = projectBook(book, today, year.end).filter((item) => !item.skipped && item.date >= year.start && item.date <= year.end);
  const income = items.filter((item) => item.direction === 'in').reduce((sum, item) => sum + item.exGst, 0);
  const expenses = items.filter((item) => item.direction === 'out').reduce((sum, item) => sum + item.exGst, 0);
  const byCategory = new Map();
  for (const item of items) {
    const key = `${item.direction}:${item.category}`;
    byCategory.set(key, (byCategory.get(key) || 0) + item.exGst);
  }
  const mileage = mileageClaim((book.trips || []).filter((trip) => trip.occurredOn >= year.start && trip.occurredOn <= year.end));
  return { year, income, expenses, profit: income - expenses, byCategory: [...byCategory.entries()], mileage };
}

export function spendBy(items, key, names) {
  const map = new Map();
  for (const item of items) {
    const id = item[key] || '';
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + item.remainingCents);
  }
  return [...map.entries()].map(([id, cents]) => ({
    id,
    name: names.get(id) || id,
    cents,
  }));
}
