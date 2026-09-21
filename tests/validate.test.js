import assert from 'node:assert/strict';
import test from 'node:test';
import { codesMatch, readSession, signSession } from '../lib/auth.js';
import { draftsFromCsv } from '../lib/csv.js';
import { ValidationError, normalizeBook } from '../lib/validate.js';

const bill = {
  id: 'bill_phone_1',
  direction: 'out',
  vendor: 'Telstra',
  title: 'Mobile',
  category: 'Phone',
  amountCents: 8900,
  gstMode: 'inclusive',
  startsOn: '2026-10-01',
  recurrence: 'monthly',
  endsOn: null,
  reference: 'BPAY 123',
  notes: '',
  paused: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

test('a real bill normalises and a broken date is rejected', () => {
  const book = normalizeBook({ version: 0, deskName: 'Futuret3ch', bills: [bill], payments: [], adjustments: [] });
  assert.equal(book.bills[0].vendor, 'Telstra');
  assert.throws(
    () => normalizeBook({ version: 0, deskName: 'Futuret3ch', bills: [{ ...bill, startsOn: '2026-02-31' }], payments: [], adjustments: [] }),
    ValidationError
  );
});

test('a payment cannot point at a missing bill or be zero', () => {
  assert.throws(
    () =>
      normalizeBook({
        version: 1,
        deskName: 'Futuret3ch',
        bills: [bill],
        payments: [
          {
            id: 'pay_missing1',
            billId: 'bill_absent1',
            occurrenceDate: '2026-10-01',
            paidOn: '2026-10-01',
            amountCents: 8900,
            method: 'bpay',
            reference: '',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        adjustments: [],
      }),
    /missing bill/
  );
  assert.throws(
    () =>
      normalizeBook({
        version: 1,
        deskName: 'Futuret3ch',
        bills: [bill],
        payments: [
          {
            id: 'pay_zero_001',
            billId: bill.id,
            occurrenceDate: '2026-10-01',
            paidOn: '2026-10-01',
            amountCents: 0,
            method: 'bank',
            reference: '',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        adjustments: [],
      }),
    ValidationError
  );
});

test('csv import reports the bad row and keeps the good one', () => {
  const csv = [
    'direction,vendor,title,amount,gst,first_due,repeats,category,reference,notes,ends_on',
    'out,Harbour,"Studio, level 2",2000.00,none,2026-10-01,monthly,Rent,,,',
    'out,Nope,Broken,ten,none,yesterday,monthly,Rent,,,',
  ].join('\n');
  const { drafts, errors } = draftsFromCsv(csv);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].vendor, 'Harbour');
  assert.equal(drafts[0].title, 'Studio, level 2');
  assert.equal(drafts[0].amountCents, 200000);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].row, 3);
});

test('access code and session cookie', () => {
  assert.equal(codesMatch('desk-correct', 'desk-correct'), true);
  assert.equal(codesMatch('desk-correct', 'desk-wrongxx'), false);
  assert.equal(codesMatch('', 'desk-correct'), false);
  const token = signSession('secret-key', Date.now() + 60_000);
  assert.ok(readSession('secret-key', token));
  assert.equal(readSession('other-key', token), null);
  const expired = signSession('secret-key', Date.now() - 1000);
  assert.equal(readSession('secret-key', expired), null);
});
