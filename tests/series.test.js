import assert from 'node:assert/strict';
import test from 'node:test';
import { bestMatch, draftsFromStatement, matchScore } from '../lib/bank.js';
import { kmRateCents, mileageClaim } from '../lib/rates.js';
import { nextOpenPerBill, projectBook, seriesCards } from '../lib/schedule.js';
import { basWorksheet } from '../lib/tax.js';
import { normalizeBook } from '../lib/validate.js';

const host = {
  id: 'bill_host_001',
  direction: 'out',
  vendor: 'HOSTGATOR',
  title: 'domain hosting',
  category: 'Software',
  amountCents: 7500,
  gstMode: 'none',
  startsOn: '2026-09-22',
  recurrence: 'monthly',
  endsOn: null,
  reference: '',
  notes: '',
  paused: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

test('a monthly bill is one card with each date inside it', () => {
  const book = { bills: [host], payments: [], adjustments: [] };
  const items = projectBook(book, '2026-09-22', '2026-12-21').filter((item) => item.date <= '2026-12-21');
  const cards = seriesCards(items);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].vendor, 'HOSTGATOR');
  assert.equal(cards[0].items.length, 3);
  assert.equal(cards[0].remainingCents, 22500);
  assert.deepEqual(
    cards[0].items.map((item) => item.date),
    ['2026-09-22', '2026-10-22', '2026-11-22']
  );
  const next = nextOpenPerBill(items.filter((item) => item.remainingCents > 0));
  assert.equal(next.length, 1);
  assert.equal(next[0].date, '2026-09-22');
});

test('statement CSV keeps the sign and a high score needs the vendor and the amount', () => {
  const csv = ['date,description,amount', '22/09/2026,HOSTGATOR HOSTING,-75.00', '23/09/2026,COFFEE,-4.50'].join('\n');
  const { drafts, errors } = draftsFromStatement(csv);
  assert.equal(errors.length, 0);
  assert.equal(drafts[0].postedOn, '2026-09-22');
  assert.equal(drafts[0].amountCents, -7500);
  const item = { direction: 'out', vendor: 'HOSTGATOR', remainingCents: 7500, total: 7500, date: '2026-09-22', skipped: false };
  assert.equal(matchScore(drafts[0], item), 1);
  assert.ok(matchScore(drafts[1], item) < 0.95);
  assert.equal(bestMatch(drafts[0], [item]).item.vendor, 'HOSTGATOR');
});

test('BAS cash basis uses the payment date and GST-free sales stay out of 1A', () => {
  const sale = {
    ...host,
    id: 'bill_sale_001',
    direction: 'in',
    vendor: 'North Client',
    title: 'Retainer',
    category: 'Client',
    amountCents: 11000,
    gstMode: 'inclusive',
    recurrence: 'once',
  };
  const book = normalizeBook({
    version: 0,
    deskName: 'Futuret3ch',
    profile: { gstBasis: 'cash', gstRegistered: true },
    bills: [sale],
    payments: [
      {
        id: 'pay_sale_0001',
        billId: sale.id,
        occurrenceDate: '2026-09-22',
        paidOn: '2026-09-22',
        amountCents: 11000,
        method: 'bank',
        reference: '',
        createdAt: '2026-09-22T00:00:00.000Z',
      },
    ],
    adjustments: [],
  });
  const bas = basWorksheet(book, '2026-09-22');
  assert.equal(bas.basis, 'cash');
  assert.equal(bas.g1, 11000);
  assert.equal(bas.label1A, 1000);
  assert.equal(bas.label1B, 0);
  assert.equal(kmRateCents('2026-09-22'), 91);
  const claim = mileageClaim([
    { id: 'trip_one_001', occurredOn: '2026-08-01', kilometres: 4000, purpose: 'Client' },
    { id: 'trip_two_001', occurredOn: '2026-08-02', kilometres: 2000, purpose: 'Client' },
  ]);
  assert.equal(claim.kilometres, 5000);
  assert.equal(claim.cents, 5000 * 91);
});
