import { CATEGORIES, DIRECTIONS, GST_MODES, METHODS, RECURRENCES } from './catalog.js';
import { isIsoDate } from './dates.js';

const MAX_CENTS = 100_000_000_00;
const LIMITS = { bills: 400, payments: 8000, adjustments: 4000 };

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

export function emptyBook() {
  return {
    version: 0,
    deskName: 'Futuret3ch',
    bills: [],
    payments: [],
    adjustments: [],
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
    createdAt: isoStamp(input?.createdAt),
    updatedAt: isoStamp(input?.updatedAt),
  };
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

  return {
    version,
    deskName,
    bills,
    payments,
    adjustments,
    updatedAt: input.updatedAt || null,
  };
}
