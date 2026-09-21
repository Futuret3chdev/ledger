import assert from 'node:assert/strict';
import test from 'node:test';
import { searchBanks, bankById } from '../lib/banks-au.js';
import { ValidationError, normalizeBook } from '../lib/validate.js';

test('Australian banks search finds ANZ and CBA', () => {
  const anz = searchBanks('anz');
  assert.ok(anz.some((row) => row.id === 'anz-au'));
  assert.equal(bankById('cba-au').name.includes('Commonwealth'), true);
});

test('a desk can hold a named bank account', () => {
  const book = normalizeBook({
    version: 0,
    deskName: 'Futuret3ch',
    profile: { kind: 'sole_trader' },
    bankAccounts: [
      {
        id: 'bank_anzbus01',
        name: 'Business Account',
        institution: 'ANZ (AU)',
        institutionId: 'anz-au',
        accountType: 'everyday',
        currency: 'AUD',
        bsb: '013711',
        number: '158218098',
      },
    ],
    bills: [],
    payments: [],
    adjustments: [],
  });
  assert.equal(book.bankAccounts[0].name, 'Business Account');
  assert.equal(book.bankAccounts[0].bsb, '013711');
  assert.throws(
    () =>
      normalizeBook({
        version: 0,
        deskName: 'Futuret3ch',
        bankAccounts: [{ id: 'bank_bad01', name: '', institution: 'ANZ (AU)' }],
        bills: [],
        payments: [],
        adjustments: [],
      }),
    ValidationError
  );
});
