import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, addMonths, mondayOnOrBefore, quarterRange } from '../lib/dates.js';
import { dollarsToCents, splitGst } from '../lib/money.js';
import { itemStatus, projectBill, projectBook, sumRemaining } from '../lib/schedule.js';

const bill = (over = {}) => ({
  id: 'bill_rent_01',
  direction: 'out',
  vendor: 'Harbour Rent',
  title: 'Studio',
  category: 'Rent',
  amountCents: 200000,
  gstMode: 'none',
  startsOn: '2026-01-31',
  recurrence: 'monthly',
  endsOn: null,
  reference: '',
  notes: '',
  paused: false,
  ...over,
});

test('monthly dates keep the anniversary day and clamp short months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2028-02-29', 12), '2029-02-28');
});

test('fortnightly and weekly steps', () => {
  const items = projectBill(
    bill({ recurrence: 'fortnightly', startsOn: '2026-09-01', endsOn: '2026-09-29' }),
    [],
    [],
    '2026-10-01'
  );
  assert.deepEqual(
    items.map((i) => i.originalDate),
    ['2026-09-01', '2026-09-15', '2026-09-29']
  );
  assert.equal(addDays('2026-09-28', 7), '2026-10-05');
});

test('a once bill does not repeat and an end date is inclusive', () => {
  const once = projectBill(bill({ recurrence: 'once', startsOn: '2026-05-01' }), [], [], '2027-05-01');
  assert.equal(once.length, 1);
  const ended = projectBill(bill({ startsOn: '2026-01-31', endsOn: '2026-03-31' }), [], [], '2026-12-31');
  assert.deepEqual(
    ended.map((i) => i.date),
    ['2026-01-31', '2026-02-28', '2026-03-31']
  );
});

test('pause hides future dates and keeps an unpaid past date', () => {
  const book = {
    bills: [bill({ paused: true, startsOn: '2026-09-01' })],
    payments: [],
    adjustments: [],
  };
  const items = projectBook(book, '2026-09-20', '2026-12-01');
  assert.deepEqual(
    items.map((i) => i.date),
    ['2026-09-01']
  );
  assert.equal(itemStatus(items[0], '2026-09-20'), 'overdue');
});

test('skip, move, partial payment, and overpayment', () => {
  const id = 'bill_rent_01';
  const items = projectBill(
    bill({ startsOn: '2026-09-01', amountCents: 10000, gstMode: 'none' }),
    [
      { billId: id, occurrenceDate: '2026-10-01', amountCents: 4000 },
      { billId: id, occurrenceDate: '2026-11-01', amountCents: 12000 },
    ],
    [
      { billId: id, occurrenceDate: '2026-09-01', skip: true },
      { billId: id, occurrenceDate: '2026-12-01', moveTo: '2026-12-05' },
      { billId: id, occurrenceDate: '2027-01-01', amountCents: 5000 },
    ],
    '2027-01-15'
  );
  const by = Object.fromEntries(items.map((i) => [i.originalDate, i]));
  assert.equal(by['2026-09-01'].skipped, true);
  assert.equal(by['2026-09-01'].remainingCents, 0);
  assert.equal(itemStatus(by['2026-10-01'], '2026-10-15'), 'partial-overdue');
  assert.equal(by['2026-10-01'].remainingCents, 6000);
  assert.equal(itemStatus(by['2026-11-01'], '2026-10-15'), 'overpaid');
  assert.equal(by['2026-11-01'].extraCents, 2000);
  assert.equal(by['2026-11-01'].remainingCents, 0);
  assert.equal(by['2026-12-01'].date, '2026-12-05');
  assert.equal(by['2027-01-01'].total, 5000);
});

test('paying one month does not pay the next', () => {
  const id = 'bill_rent_01';
  const items = projectBill(
    bill({ startsOn: '2026-09-01', amountCents: 10000 }),
    [{ billId: id, occurrenceDate: '2026-09-01', amountCents: 10000 }],
    [],
    '2026-11-01'
  );
  assert.equal(itemStatus(items[0], '2026-09-02'), 'paid');
  assert.equal(items[0].remainingCents, 0);
  assert.equal(itemStatus(items[1], '2026-09-02'), 'scheduled');
  assert.equal(items[1].remainingCents, 10000);
  assert.equal(items[1].originalDate, '2026-10-01');
});

test('GST inclusive is one eleventh and exclusive adds ten percent', () => {
  assert.deepEqual(splitGst(11000, 'inclusive'), { exGst: 10000, gst: 1000, total: 11000 });
  assert.deepEqual(splitGst(1000, 'inclusive'), { exGst: 909, gst: 91, total: 1000 });
  assert.deepEqual(splitGst(10000, 'exclusive'), { exGst: 10000, gst: 1000, total: 11000 });
  assert.deepEqual(splitGst(15, 'exclusive'), { exGst: 15, gst: 2, total: 17 });
  assert.equal(dollarsToCents('1,200.50'), 120050);
  assert.equal(dollarsToCents('$89'), 8900);
  assert.equal(dollarsToCents('10.5'), 1050);
  assert.equal(dollarsToCents('10.555'), null);
  assert.equal(dollarsToCents('-4'), null);
});

test('money in and money out stay separate', () => {
  const book = {
    bills: [
      bill({ id: 'bill_out_001', amountCents: 5000, startsOn: '2026-09-22', recurrence: 'once' }),
      bill({
        id: 'bill_in_0001',
        direction: 'in',
        vendor: 'North Client',
        title: 'Retainer',
        category: 'Client',
        amountCents: 8000,
        startsOn: '2026-09-22',
        recurrence: 'once',
      }),
    ],
    payments: [],
    adjustments: [],
  };
  const items = projectBook(book, '2026-09-22', '2026-09-22');
  assert.equal(sumRemaining(items, 'out'), 5000);
  assert.equal(sumRemaining(items, 'in'), 8000);
});

test('Melbourne week and BAS quarter boundaries', () => {
  assert.equal(mondayOnOrBefore('2026-09-22'), '2026-09-21');
  assert.equal(mondayOnOrBefore('2026-09-21'), '2026-09-21');
  assert.deepEqual(quarterRange('2026-09-22'), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(quarterRange('2026-01-15'), { start: '2026-01-01', end: '2026-03-31' });
  assert.deepEqual(quarterRange('2026-04-01'), { start: '2026-04-01', end: '2026-06-30' });
});
