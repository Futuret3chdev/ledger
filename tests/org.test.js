import assert from 'node:assert/strict';
import test from 'node:test';
import { usesOrg } from '../lib/catalog.js';
import { projectBook } from '../lib/schedule.js';
import { spendBy } from '../lib/tax.js';
import { ValidationError, normalizeBook } from '../lib/validate.js';

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

test('a partnership and a sole trader can hold employees and subcontractors', () => {
  assert.equal(usesOrg('partnership'), true);
  assert.equal(usesOrg('sole_trader'), false);
  const partnership = normalizeBook({
    version: 0,
    deskName: 'Futuret3ch',
    profile: { kind: 'partnership' },
    employees: [
      {
        id: 'empl_partner1',
        name: 'Alex',
        role: 'Bookkeeper',
        grossCents: 120000,
        taxCents: 20000,
        superPercent: 12,
      },
    ],
    bills: [],
    payments: [],
    adjustments: [],
  });
  assert.equal(partnership.employees[0].name, 'Alex');
  const trader = normalizeBook({
    version: 0,
    deskName: 'Futuret3ch',
    profile: { kind: 'sole_trader' },
    subcontractors: [{ id: 'subc_paint001', name: 'River Painting', work: 'Fitout', abn: '' }],
    bills: [
      {
        id: 'bill_sub_work1',
        direction: 'out',
        vendor: 'River Painting',
        title: 'shop fitout',
        category: 'Suppliers',
        amountCents: 44000,
        gstMode: 'inclusive',
        startsOn: '2026-09-22',
        recurrence: 'once',
        subcontractorId: 'subc_paint001',
        createdAt: '2026-09-22T00:00:00.000Z',
        updatedAt: '2026-09-22T00:00:00.000Z',
      },
    ],
    payments: [],
    adjustments: [],
  });
  assert.equal(trader.subcontractors[0].name, 'River Painting');
  const items = projectBook(trader, '2026-09-22', '2026-09-22');
  assert.equal(items[0].subcontractorId, 'subc_paint001');
  assert.throws(
    () =>
      normalizeBook({
        version: 0,
        deskName: 'Futuret3ch',
        profile: { kind: 'sole_trader' },
        bills: [
          {
            id: 'bill_sub_miss1',
            direction: 'out',
            vendor: 'Missing sub',
            title: 'work',
            category: 'Other',
            amountCents: 1000,
            gstMode: 'none',
            startsOn: '2026-09-22',
            recurrence: 'once',
            subcontractorId: 'subc_absent01',
            createdAt: '2026-09-22T00:00:00.000Z',
            updatedAt: '2026-09-22T00:00:00.000Z',
          },
        ],
        payments: [],
        adjustments: [],
      }),
    ValidationError
  );
});
