/** Australian banks and cards you can add on the desk. Search is local. */

export const BANK_TYPES = [
  ['everyday', 'Everyday (day-to-day)'],
  ['credit_card', 'Credit card'],
  ['loan', 'Loan'],
  ['term_deposit', 'Term deposit'],
  ['other', 'Other'],
];

export const AU_BANKS = [
  { id: 'amex-au', name: 'American Express (AU)' },
  { id: 'anz-au', name: 'ANZ (AU)' },
  { id: 'bendigo-au', name: 'Bendigo Bank (AU)' },
  { id: 'cba-au', name: 'Commonwealth Bank CBA (AU)' },
  { id: 'nab-au', name: 'National Australia Bank NAB (AU)' },
  { id: 'stgeorge-au', name: 'St George Bank (AU)' },
  { id: 'westpac-au', name: 'Westpac (AU)' },
  { id: 'westpac-cc-au', name: 'Westpac (AU) - Credit Card' },
  { id: 'macquarie-au', name: 'Macquarie (AU)' },
  { id: 'ing-au', name: 'ING (AU)' },
  { id: 'suncorp-au', name: 'Suncorp (AU)' },
  { id: 'boa-au', name: 'Bank of Australia (AU)' },
  { id: 'bankwest-au', name: 'Bankwest (AU)' },
  { id: 'ubank-au', name: 'UBank (AU)' },
  { id: 'up-au', name: 'Up (AU)' },
  { id: 'me-au', name: 'ME Bank (AU)' },
  { id: 'hsbc-au', name: 'HSBC (AU)' },
  { id: 'citibank-au', name: 'Citibank (AU)' },
  { id: 'paypal-au', name: 'PayPal (AU)' },
];

export function searchBanks(q) {
  const needle = String(q || '')
    .trim()
    .toLowerCase();
  if (!needle) return AU_BANKS.slice(0, 8);
  return AU_BANKS.filter((row) => row.name.toLowerCase().includes(needle) || row.id.includes(needle)).slice(0, 20);
}

export function bankById(id) {
  return AU_BANKS.find((row) => row.id === id) || null;
}
