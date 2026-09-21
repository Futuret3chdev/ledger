import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFER_END, offerParts, pad } from '../lib/offer.js';

test('the launch window is 30 September 2026 Melbourne', () => {
  assert.equal(new Date(OFFER_END).toISOString().startsWith('2026-09-30'), true);
  const open = offerParts(Date.parse('2026-09-22T00:00:00+10:00'));
  assert.equal(open.ended, false);
  assert.ok(open.days >= 8);
  const closed = offerParts(Date.parse('2026-10-01T00:00:00+10:00'));
  assert.equal(closed.ended, true);
  assert.equal(closed.days, 0);
  assert.equal(pad(4), '04');
});
