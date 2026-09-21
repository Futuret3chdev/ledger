import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { STATES } from './catalog.js';
import { ValidationError } from './validate.js';

export const ROLL_KINDS = ['self', 'business', 'company', 'keeper'];

export const ROLL_KIND_LABEL = {
  self: 'Self-employed',
  business: 'Business',
  company: 'Company',
  keeper: 'Keeper',
};

export function emptyPractice() {
  return { version: 0, keepers: [], asks: [], roll: [], updatedAt: null };
}

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function must(value, max, label) {
  const v = text(value, max);
  if (!v) throw new ValidationError(`${label} is required`);
  return v;
}

function idOf(value, label) {
  const id = text(value, 80);
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new ValidationError(`${label} is invalid`);
  return id;
}

export function hashPass(pass) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(pass), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function checkPass(pass, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const next = scryptSync(String(pass), salt, 32);
  const a = Buffer.from(hash, 'hex');
  if (a.length !== next.length) return false;
  return timingSafeEqual(a, next);
}

export function publicKeeper(keeper) {
  return {
    id: keeper.id,
    name: keeper.name,
    firm: keeper.firm,
    city: keeper.city,
    state: keeper.state,
    note: keeper.note,
  };
}

export function normalizePractice(input) {
  const version = input?.version;
  if (!Number.isInteger(version) || version < 0) throw new ValidationError('Practice version is invalid');
  const keepers = Array.isArray(input.keepers) ? input.keepers : [];
  const asks = Array.isArray(input.asks) ? input.asks : [];
  const roll = Array.isArray(input.roll) ? input.roll : [];
  if (keepers.length > 400) throw new ValidationError('Too many keepers');
  if (asks.length > 4000) throw new ValidationError('Too many requests');
  if (roll.length > 2000) throw new ValidationError('Too many profiles');
  const ids = new Set();
  const cleanKeepers = keepers.map((row) => {
    const keeper = {
      id: idOf(row.id, 'Keeper'),
      name: must(row.name, 80, 'Name'),
      firm: text(row.firm, 80),
      email: must(row.email, 120, 'Email').toLowerCase(),
      phone: text(row.phone, 30),
      abn: text(row.abn, 14),
      city: text(row.city, 60),
      state: STATES.includes(row.state) ? row.state : '',
      note: text(row.note, 240),
      pass: text(row.pass, 200),
      createdAt: row.createdAt || new Date().toISOString(),
    };
    if (!keeper.email.includes('@')) throw new ValidationError('Email is not valid');
    if (!keeper.pass) throw new ValidationError('A keeper is missing a passphrase');
    if (ids.has(keeper.id)) throw new ValidationError('Two keepers share an id');
    ids.add(keeper.id);
    return keeper;
  });
  const askIds = new Set();
  const cleanAsks = asks.map((row) => {
    const ask = {
      id: idOf(row.id, 'Request'),
      keeperId: row.keeperId ? idOf(row.keeperId, 'Request keeper') : '',
      name: must(row.name, 80, 'Your name'),
      email: must(row.email, 120, 'Your email').toLowerCase(),
      phone: text(row.phone, 30),
      message: must(row.message, 800, 'Message'),
      createdAt: row.createdAt || new Date().toISOString(),
    };
    if (!ask.email.includes('@')) throw new ValidationError('Email is not valid');
    if (ask.keeperId && !ids.has(ask.keeperId)) throw new ValidationError('That keeper is not on the list');
    if (askIds.has(ask.id)) throw new ValidationError('Two requests share an id');
    askIds.add(ask.id);
    return ask;
  });
  const rollIds = new Set();
  const cleanRoll = roll.map((row) => {
    const card = publicCard(row);
    if (rollIds.has(card.id)) throw new ValidationError('Two profiles share an id');
    rollIds.add(card.id);
    return card;
  });
  return { version, keepers: cleanKeepers, asks: cleanAsks, roll: cleanRoll, updatedAt: input.updatedAt || null };
}

function digitsOrEmpty(value, size, label) {
  const raw = String(value ?? '').replace(/\s/g, '');
  if (!raw) return '';
  if (!new RegExp(`^\\d{${size}}$`).test(raw)) throw new ValidationError(`${label} is the wrong length`);
  return raw;
}

export function publicCard(row) {
  const employees = Number(row?.employees);
  const card = {
    id: idOf(row.id, 'Profile'),
    kind: ROLL_KINDS.includes(row.kind) ? row.kind : 'business',
    name: must(row.name, 80, 'Name'),
    businessName: text(row.businessName, 80),
    abn: digitsOrEmpty(row.abn, 11, 'ABN'),
    acn: digitsOrEmpty(row.acn, 9, 'ACN'),
    city: text(row.city, 60),
    state: STATES.includes(row.state) ? row.state : '',
    employees: Number.isInteger(employees) && employees >= 0 && employees <= 100000 ? employees : 0,
    roles: text(row.roles, 120),
    industry: text(row.industry, 60),
    looking: text(row.looking, 80),
    description: must(row.description, 400, 'Description'),
    createdAt: row.createdAt || new Date().toISOString(),
  };
  return card;
}

export function addRoll(practice, raw, id) {
  return normalizePractice({
    ...practice,
    roll: [
      ...(practice.roll || []),
      {
        ...raw,
        id,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}

export function signupKeeper(practice, raw, id) {
  if (raw.passphrase == null || String(raw.passphrase).length < 8) {
    throw new ValidationError('Passphrase must be at least 8 characters');
  }
  const email = must(raw.email, 120, 'Email').toLowerCase();
  if (practice.keepers.some((keeper) => keeper.email === email)) {
    throw new ValidationError('That email is already on the list');
  }
  const keeper = {
    id,
    name: raw.name,
    firm: raw.firm,
    email,
    phone: raw.phone,
    abn: raw.abn,
    city: raw.city,
    state: raw.state,
    note: raw.note,
    pass: hashPass(raw.passphrase),
    createdAt: new Date().toISOString(),
  };
  return normalizePractice({
    ...practice,
    keepers: [...practice.keepers, keeper],
  });
}

export function addAsk(practice, raw, id) {
  return normalizePractice({
    ...practice,
    asks: [
      ...practice.asks,
      {
        id,
        keeperId: raw.keeperId || '',
        name: raw.name,
        email: raw.email,
        phone: raw.phone,
        message: raw.message,
        createdAt: new Date().toISOString(),
      },
    ],
  });
}
