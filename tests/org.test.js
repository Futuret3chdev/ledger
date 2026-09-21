import assert from 'node:assert/strict';
import test from 'node:test';
import { projectBook } from '../lib/schedule.js';
import { spendBy } from '../lib/tax.js';
import { normalizeBook } from '../lib/validate.js';

test('a company bill can sit on a division, franchise, and supplier', () => {
  const book = normalizeBook({
    version: 0,
    deskName: 'Futuret3ch',
    profile: { kind: 'company' },
    divisions: [{ id: 'divi_retail01', name: 'Retail' }],
    franchises: [{ id: 'fran_south001', name: 'South shop', suburb: 'Brighton', state: 'VIC', franchisee: 'Lee' }],
    suppliers: [{ id: 'supp_hostgator', name: 'HOSTGATOR', abn: '', email: '', phone: '', gstMode: 'none' }],
    bills: [
      {
        id: 'bill_host_org1',
        direction: 'out',
        vendor: 'HOSTGATOR',
        title: 'domain hosting',
        category: 'Software',
        amountCents: 7500,
        gstMode: 'none',
        startsOn: '2026-09-22',
        recurrence: 'once',
        divisionId: 'divi_retail01',
        franchiseId: 'fran_south001',
        supplierId: 'supp_hostgator',
        createdAt: '2026-09-22T00:00:00.000Z',
        updatedAt: '2026-09-22T00:00:00.000Z',
      },
    ],
    payments: [],
    adjustments: [],
  });
  assert.equal(book.divisions[0].name, 'Retail');
  const items = projectBook(book, '2026-09-22', '2026-09-22');
  assert.equal(items[0].divisionId, 'divi_retail01');
  const byDiv = spendBy(items, 'divisionId', new Map([['divi_retail01', 'Retail']]));
  assert.equal(byDiv[0].cents, 7500);
});
