import { CATEGORIES, DIRECTIONS, GST_MODES, METHODS, PROFILE_KINDS, RECURRENCES, STATES } from './catalog.js';
import { isIsoDate } from './dates.js';

const MAX_CENTS = 100_000_000_00;
const LIMITS = {
  bills: 400,
  payments: 8000,
  adjustments: 4000,
  transactions: 20000,
  trips: 5000,
  employees: 200,
  partners: 40,
  divisions: 80,
  franchises: 200,
  suppliers: 400,
};

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function mustText(value, max, label) {
  const v = text(value, max);
  if (!v) throw new ValidationError(`${label} is required`);
  return v;
}

function mustDate(value, label) {
  if (!isIsoDate(value)) throw new ValidationError(`${label} must be a real date`);
  return value;
}

function isoStamp(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  return new Date().toISOString();
}

function idOf(value, label) {
  const id = text(value, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new ValidationError(`${label} is invalid`);
  return id;
}

export function emptyProfile() {
  return {
    kind: 'sole_trader',
    legalName: '',
    tradingName: '',
    abn: '',
    acn: '',
    gstRegistered: false,
    gstBasis: 'cash',
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    email: '',
    phone: '',
    yearStartMonth: 7,
    jaxAuto: false,
    partners: [],
  };
}

export function emptyBook() {
  return {
    version: 0,
    deskName: 'Futuret3ch',
    profile: emptyProfile(),
    bills: [],
    payments: [],
    adjustments: [],
    transactions: [],
    trips: [],
    employees: [],
    divisions: [],
    franchises: [],
    suppliers: [],
    updatedAt: null,
  };
}

export function normalizeBill(input) {
  const bill = {
    id: idOf(input?.id, 'Bill'),
    direction: input?.direction === 'in' ? 'in' : input?.direction === 'out' ? 'out' : null,
    vendor: mustText(input?.vendor, 80, 'Who'),
    title: mustText(input?.title, 120, 'What it is for'),
    category: text(input?.category, 40) || 'Other',
    amountCents: input?.amountCents,
    gstMode: input?.gstMode,
    startsOn: mustDate(input?.startsOn, 'First due date'),
    recurrence: input?.recurrence,
    endsOn: input?.endsOn || null,
    reference: text(input?.reference, 80),
    notes: text(input?.notes, 500),
    paused: Boolean(input?.paused),
    project: text(input?.project, 80),
    divisionId: text(input?.divisionId, 80),
    franchiseId: text(input?.franchiseId, 80),
    supplierId: text(input?.supplierId, 80),
    currency: (text(input?.currency, 3) || 'AUD').toUpperCase(),
    fxMilli: Number.isInteger(input?.fxMilli) && input.fxMilli > 0 && input.fxMilli < 1_000_000 ? input.fxMilli : 1000,
    createdAt: isoStamp(input?.createdAt),
    updatedAt: isoStamp(input?.updatedAt),
  };
  if (!/^[A-Z]{3}$/.test(bill.currency)) throw new ValidationError('Currency must be a 3 letter code');
  if (!DIRECTIONS.includes(bill.direction)) throw new ValidationError('Choose whether we pay this, or they pay us');
  if (!CATEGORIES.includes(bill.category)) throw new ValidationError('Unknown category');
  if (!Number.isInteger(bill.amountCents) || bill.amountCents < 0 || bill.amountCents > MAX_CENTS) {
    throw new ValidationError('Amount must be a dollar value');
  }
  if (!GST_MODES.includes(bill.gstMode)) throw new ValidationError('GST choice is invalid');
  if (!RECURRENCES.includes(bill.recurrence)) throw new ValidationError('Repeat choice is invalid');
  if (bill.endsOn) {
    bill.endsOn = mustDate(bill.endsOn, 'End date');
    if (bill.endsOn < bill.startsOn) throw new ValidationError('End date is before the first due date');
  }
  return bill;
}

export function normalizeBook(input) {
  if (!input || typeof input !== 'object') throw new ValidationError('Desk is empty or unreadable');
  const version = input.version;
  if (!Number.isInteger(version) || version < 0) throw new ValidationError('Desk version is invalid');
  const deskName = mustText(input.deskName || 'Futuret3ch', 60, 'Desk name');
  const billsIn = Array.isArray(input.bills) ? input.bills : null;
  const paymentsIn = Array.isArray(input.payments) ? input.payments : null;
  const adjustmentsIn = Array.isArray(input.adjustments) ? input.adjustments : null;
  if (!billsIn || !paymentsIn || !adjustmentsIn) throw new ValidationError('Desk is missing its lists');
  if (billsIn.length > LIMITS.bills) throw new ValidationError('Too many bills');
  if (paymentsIn.length > LIMITS.payments) throw new ValidationError('Too many payments');
  if (adjustmentsIn.length > LIMITS.adjustments) throw new ValidationError('Too many changes');

  const bills = billsIn.map(normalizeBill);
  const billIds = new Set();
  for (const bill of bills) {
    if (billIds.has(bill.id)) throw new ValidationError('Two bills share an id');
    billIds.add(bill.id);
  }

  const payments = paymentsIn.map((raw) => {
    const payment = {
      id: idOf(raw?.id, 'Payment'),
      billId: idOf(raw?.billId, 'Payment bill'),
      occurrenceDate: mustDate(raw?.occurrenceDate, 'Payment date'),
      paidOn: mustDate(raw?.paidOn, 'Paid on'),
      amountCents: raw?.amountCents,
      method: raw?.method,
      reference: text(raw?.reference, 80),
      createdAt: isoStamp(raw?.createdAt),
    };
    if (!billIds.has(payment.billId)) throw new ValidationError('A payment points at a missing bill');
    if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0 || payment.amountCents > MAX_CENTS) {
      throw new ValidationError('Payment amount must be greater than zero');
    }
    if (!METHODS.includes(payment.method)) throw new ValidationError('Payment method is invalid');
    return payment;
  });
  const payIds = new Set();
  for (const p of payments) {
    if (payIds.has(p.id)) throw new ValidationError('Two payments share an id');
    payIds.add(p.id);
  }

  const adjustments = adjustmentsIn.map((raw) => {
    const adj = {
      id: idOf(raw?.id, 'Change'),
      billId: idOf(raw?.billId, 'Change bill'),
      occurrenceDate: mustDate(raw?.occurrenceDate, 'Change date'),
      skip: Boolean(raw?.skip),
      moveTo: raw?.moveTo || null,
      amountCents: raw?.amountCents == null || raw?.amountCents === '' ? null : raw.amountCents,
    };
    if (!billIds.has(adj.billId)) throw new ValidationError('A change points at a missing bill');
    if (adj.moveTo) adj.moveTo = mustDate(adj.moveTo, 'Moved date');
    if (adj.amountCents != null) {
      if (!Number.isInteger(adj.amountCents) || adj.amountCents < 0 || adj.amountCents > MAX_CENTS) {
        throw new ValidationError('Changed amount is invalid');
      }
    }
    if (!adj.skip && !adj.moveTo && adj.amountCents == null) throw new ValidationError('A change does nothing');
    return adj;
  });
  const adjKey = new Set();
  for (const a of adjustments) {
    const key = `${a.billId}:${a.occurrenceDate}`;
    if (adjKey.has(key)) throw new ValidationError('Two changes target the same due date');
    adjKey.add(key);
  }

  const profile = normalizeProfile(input.profile);
  const transactions = normalizeTransactions(input.transactions);
  const trips = normalizeTrips(input.trips);
  const divisions = namedList(input.divisions, 'Division', LIMITS.divisions);
  const franchises = namedList(input.franchises, 'Franchise', LIMITS.franchises, (row) => ({
    suburb: text(row?.suburb, 60),
    state: row?.state && STATES.includes(row.state) ? row.state : '',
    franchisee: text(row?.franchisee, 80),
  }));
  const suppliers = namedList(input.suppliers, 'Supplier', LIMITS.suppliers, (row) => ({
    abn: text(row?.abn, 14),
    email: text(row?.email, 120),
    phone: text(row?.phone, 30),
    gstMode: GST_MODES.includes(row?.gstMode) ? row.gstMode : 'none',
  }));
  const divIds = new Set(divisions.map((row) => row.id));
  const franIds = new Set(franchises.map((row) => row.id));
  const supIds = new Set(suppliers.map((row) => row.id));
  for (const bill of bills) {
    if (bill.divisionId && !divIds.has(bill.divisionId)) throw new ValidationError('A bill points at a missing division');
    if (bill.franchiseId && !franIds.has(bill.franchiseId)) throw new ValidationError('A bill points at a missing franchise');
    if (bill.supplierId && !supIds.has(bill.supplierId)) throw new ValidationError('A bill points at a missing supplier');
  }
  const employees = normalizeEmployees(input.employees, divIds, franIds);

  return {
    version,
    deskName,
    profile,
    bills,
    payments,
    adjustments,
    transactions,
    trips,
    employees,
    divisions,
    franchises,
    suppliers,
    updatedAt: input.updatedAt || null,
  };
}

function namedList(raw, label, limit, extra) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > limit) throw new ValidationError(`Too many ${label.toLowerCase()}s`);
  const ids = new Set();
  return list.map((row) => {
    const item = {
      id: idOf(row?.id, label),
      name: mustText(row?.name, 80, `${label} name`),
      ...(extra ? extra(row) : {}),
    };
    if (ids.has(item.id)) throw new ValidationError(`Two ${label.toLowerCase()}s share an id`);
    ids.add(item.id);
    return item;
  });
}

function digits(value, size) {
  const raw = String(value ?? '').replace(/\s/g, '');
  if (!raw) return '';
  if (!new RegExp(`^\\d{${size}}$`).test(raw)) return null;
  return raw;
}

function normalizeProfile(raw) {
  const base = emptyProfile();
  const profile = { ...base, ...(raw && typeof raw === 'object' ? {} : {}) };
  profile.kind = PROFILE_KINDS.includes(raw?.kind) ? raw.kind : 'sole_trader';
  profile.legalName = text(raw?.legalName, 120);
  profile.tradingName = text(raw?.tradingName, 120);
  const abn = digits(raw?.abn, 11);
  if (abn === null) throw new ValidationError('ABN must be 11 digits');
  profile.abn = abn;
  const acn = digits(raw?.acn, 9);
  if (acn === null) throw new ValidationError('ACN must be 9 digits');
  profile.acn = acn;
  profile.gstRegistered = Boolean(raw?.gstRegistered);
  profile.gstBasis = raw?.gstBasis === 'accrual' ? 'accrual' : 'cash';
  profile.address = text(raw?.address, 120);
  profile.suburb = text(raw?.suburb, 60);
  profile.state = raw?.state && STATES.includes(raw.state) ? raw.state : '';
  profile.postcode = text(raw?.postcode, 8);
  profile.email = text(raw?.email, 120);
  profile.phone = text(raw?.phone, 30);
  const month = Number(raw?.yearStartMonth);
  profile.yearStartMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 7;
  profile.jaxAuto = Boolean(raw?.jaxAuto);
  const partners = Array.isArray(raw?.partners) ? raw.partners : [];
  if (partners.length > LIMITS.partners) throw new ValidationError('Too many partners');
  profile.partners = partners.map((partner) => {
    const share = Number(partner?.sharePercent);
    if (!Number.isInteger(share) || share < 0 || share > 100) throw new ValidationError('A partner share must be a whole percent from 0 to 100');
    return {
      id: idOf(partner?.id, 'Partner'),
      name: mustText(partner?.name, 80, 'Partner name'),
      sharePercent: share,
    };
  });
  return profile;
}

function normalizeTransactions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > LIMITS.transactions) throw new ValidationError('Too many statement lines');
  const ids = new Set();
  return list.map((row) => {
    const txn = {
      id: idOf(row?.id, 'Statement line'),
      postedOn: mustDate(row?.postedOn, 'Statement date'),
      description: mustText(row?.description, 180, 'Statement description'),
      amountCents: row?.amountCents,
      reference: text(row?.reference, 80),
      matchBillId: row?.matchBillId ? idOf(row.matchBillId, 'Matched bill') : '',
      matchOccurrence: row?.matchOccurrence ? mustDate(row.matchOccurrence, 'Matched date') : '',
      createdAt: isoStamp(row?.createdAt),
    };
    if (!Number.isInteger(txn.amountCents) || txn.amountCents === 0 || Math.abs(txn.amountCents) > MAX_CENTS) {
      throw new ValidationError('A statement line needs a non-zero amount');
    }
    if (ids.has(txn.id)) throw new ValidationError('Two statement lines share an id');
    ids.add(txn.id);
    return txn;
  });
}

function normalizeTrips(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > LIMITS.trips) throw new ValidationError('Too many trips');
  return list.map((row) => {
    const kilometres = row?.kilometres;
    if (!Number.isInteger(kilometres) || kilometres <= 0 || kilometres > 5000) {
      throw new ValidationError('A trip must be between 1 and 5,000 km');
    }
    return {
      id: idOf(row?.id, 'Trip'),
      occurredOn: mustDate(row?.occurredOn, 'Trip date'),
      kilometres,
      purpose: mustText(row?.purpose, 160, 'What the trip was for'),
      vehicle: text(row?.vehicle, 40) || 'Car',
    };
  });
}

function normalizeEmployees(raw, divIds = new Set(), franIds = new Set()) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > LIMITS.employees) throw new ValidationError('Too many people on the payroll worksheet');
  return list.map((row) => {
    const superPercent = Number(row?.superPercent);
    if (!Number.isInteger(row?.grossCents) || row.grossCents < 0) throw new ValidationError('Gross pay must be a dollar amount');
    if (!Number.isInteger(row?.taxCents) || row.taxCents < 0) throw new ValidationError('Tax withheld must be a dollar amount');
    if (!Number.isFinite(superPercent) || superPercent < 0 || superPercent > 100) throw new ValidationError('Super percent is not valid');
    const divisionId = text(row?.divisionId, 80);
    const franchiseId = text(row?.franchiseId, 80);
    if (divisionId && !divIds.has(divisionId)) throw new ValidationError('An employee points at a missing division');
    if (franchiseId && !franIds.has(franchiseId)) throw new ValidationError('An employee points at a missing franchise');
    return {
      id: idOf(row?.id, 'Employee'),
      name: mustText(row?.name, 80, 'Employee name'),
      role: text(row?.role, 60),
      grossCents: row.grossCents,
      taxCents: row.taxCents,
      superPercent,
      divisionId,
      franchiseId,
    };
  });
}
