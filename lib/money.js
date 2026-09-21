/** Integer cents. GST follows the ATO 1/11 rule for tax-inclusive prices. */

export function dollarsToCents(input) {
  const s = String(input ?? '')
    .trim()
    .replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

export function splitGst(amountCents, mode) {
  const amount = amountCents;
  if (mode === 'exclusive') {
    const gst = Math.round(amount / 10);
    return { exGst: amount, gst, total: amount + gst };
  }
  if (mode === 'inclusive') {
    const gst = Math.round(amount / 11);
    return { exGst: amount - gst, gst, total: amount };
  }
  return { exGst: amount, gst: 0, total: amount };
}

export function formatAud(cents) {
  const n = Number(cents) || 0;
  const sign = n < 0 ? '-' : '';
  return (
    sign +
    new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(Math.abs(n) / 100)
  );
}
