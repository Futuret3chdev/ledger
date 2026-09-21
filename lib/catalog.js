export const CATEGORIES = [
  'Rent',
  'Utilities',
  'Software',
  'Insurance',
  'Tax',
  'Payroll',
  'Suppliers',
  'Phone',
  'Fuel',
  'Professional',
  'Subscriptions',
  'Client',
  'Other',
];

export const RECURRENCES = ['once', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

export const RECURRENCE_LABEL = {
  once: 'Once',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export const GST_MODES = ['none', 'inclusive', 'exclusive', 'free', 'input'];

export const GST_LABEL = {
  none: 'No GST',
  inclusive: 'GST included',
  exclusive: 'Add 10% GST',
  free: 'GST-free',
  input: 'Input taxed',
};

export const PROFILE_KINDS = ['sole_trader', 'business', 'partnership', 'company', 'trust'];

export const PROFILE_KIND_LABEL = {
  sole_trader: 'Sole trader',
  business: 'Business',
  partnership: 'Partnership',
  company: 'Company',
  trust: 'Trust',
};

export function usesOrg(kind) {
  return kind === 'business' || kind === 'company';
}

export const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

export const METHODS = ['bank', 'bpay', 'card', 'debit', 'cash', 'other'];

export const METHOD_LABEL = {
  bank: 'Bank transfer',
  bpay: 'BPAY',
  card: 'Card',
  debit: 'Direct debit',
  cash: 'Cash',
  other: 'Other',
};

export const DIRECTIONS = ['out', 'in'];
