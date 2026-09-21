import { bestMatch, draftsFromStatement, signedAmount } from '../lib/bank.js';
import { CATEGORIES, GST_LABEL, METHOD_LABEL, METHODS, PROFILE_KIND_LABEL, PROFILE_KINDS, RECURRENCE_LABEL, RECURRENCES, STATES, usesOrg } from '../lib/catalog.js';
import { CSV_TEMPLATE, billsToCsv, draftsFromCsv, toCsv } from '../lib/csv.js';
import { addDays, longDate, mondayOnOrBefore, quarterRange, shortDate, todayMelbourne } from '../lib/dates.js';
import { dollarsToCents, formatAud, splitGst } from '../lib/money.js';
import { superPercent } from '../lib/rates.js';
import { itemStatus, nextOpenPerBill, openItems, projectBook, seriesCards, sumRemaining } from '../lib/schedule.js';
import { basWorksheet, spendBy, yearTotals } from '../lib/tax.js';
import { emptyProfile, normalizeBook } from '../lib/validate.js';
import './styles.css';
import { bindSite, paintClock, siteView } from './site.js';

const root = document.getElementById('app');
const VIEWS = [
  ['due', 'Due'],
  ['schedule', 'Plan'],
  ['bills', 'Bills'],
  ['paid', 'Paid'],
  ['tax', 'Tax'],
  ['desk', 'Desk'],
];

let book = null;
let authed = false;
let ready = false;
let bootError = '';
let view = VIEWS.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'due';
let openSeries = new Set();
let sheet = null;
let query = '';
let category = 'all';
let horizon = 90;
let flashMsg = '';
let busy = false;
let clock = null;
let kindDraft = null;

function onAppPath() {
  return location.pathname === '/app' || location.pathname.startsWith('/app');
}

function startClock() {
  if (clock) return;
  clock = setInterval(paintClock, 1000);
}

function stopClock() {
  if (!clock) return;
  clearInterval(clock);
  clock = null;
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function nid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function money(cents) {
  return esc(formatAud(cents));
}

function flash(msg) {
  flashMsg = msg || '';
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function today() {
  return todayMelbourne();
}

function knownItems(days) {
  return projectBook(book, today(), addDays(today(), days));
}

function matches(item) {
  if (category !== 'all' && item.category !== category) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${item.vendor} ${item.title} ${item.reference} ${item.category}`.toLowerCase().includes(q);
}

function findItem(billId, originalDate) {
  return knownItems(Math.max(horizon, 400)).find((item) => item.billId === billId && item.originalDate === originalDate);
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.deferredInstall = event;
});

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  ready = false;
  bootError = '';
  render();
  try {
    const session = await request('/api/session');
    if (session.res.status === 503) {
      bootError = session.data.error || 'JAX access is not configured';
      ready = true;
      render();
      return;
    }
    authed = session.res.ok;
    if (authed) {
      const state = await request('/api/state');
      if (!state.res.ok) bootError = state.data.error || 'The desk did not open';
      else book = state.data;
    }
  } catch {
    bootError = 'The desk did not open. Check the connection and try again.';
  }
  ready = true;
  render();
  await finishBankReturn();
}

async function unlock() {
  const code = document.getElementById('code')?.value || '';
  busy = true;
  flash('');
  render();
  try {
    const { res, data } = await request('/api/session', { method: 'POST', body: { code } });
    if (!res.ok) {
      busy = false;
      flash(data.error || 'That code is not right');
      render();
      return;
    }
    const state = await request('/api/state');
    busy = false;
    if (!state.res.ok) {
      bootError = state.data.error || 'The desk did not open';
      render();
      return;
    }
    authed = true;
    book = state.data;
    bootError = '';
    render();
    await finishBankReturn();
  } catch {
    busy = false;
    flash('The desk did not open. Check the connection and try again.');
    render();
  }
}

async function lock() {
  await request('/api/session', { method: 'DELETE' }).catch(() => {});
  authed = false;
  book = null;
  sheet = null;
  flash('');
  window.location.assign('/');
}

async function push(next, okMessage) {
  let normalized;
  try {
    normalized = normalizeBook({
      ...next,
      version: book.version,
      deskName: next.deskName || book.deskName,
    });
  } catch (err) {
    flash(err.message || 'Check that bill');
    render();
    return;
  }
  busy = true;
  render();
  try {
    const { res, data } = await request('/api/state', { method: 'PUT', body: normalized });
    busy = false;
    if (res.status === 409 && data.book) {
      book = data.book;
      sheet = null;
      flash('The desk changed on another screen. Loaded the latest.');
      render();
      return;
    }
    if (res.status === 401) {
      authed = false;
      book = null;
      sheet = null;
      flash('Locked');
      render();
      return;
    }
    if (!res.ok) {
      flash(data.error || 'Not saved');
      render();
      return;
    }
    book = data;
    sheet = null;
    flash(okMessage || 'Saved');
    render();
  } catch {
    busy = false;
    flash('Not saved. The connection failed, so nothing was changed.');
    render();
  }
}

function returningFromBank() {
  try {
    return new URLSearchParams(location.search).get('bank') === 'return';
  } catch {
    return false;
  }
}

async function finishBankReturn() {
  if (!returningFromBank() || !authed || !book) return;
  view = 'desk';
  history.replaceState(null, '', '/app#desk');
  busy = true;
  render();
  try {
    const { res, data } = await request('/api/bank', { method: 'POST', body: { action: 'sync' } });
    if (res.ok) {
      const state = await request('/api/state');
      if (state.res.ok) book = state.data;
      flash(
        data.pending
          ? 'The bank is still fetching. Pull statements in a minute.'
          : data.added
            ? `Pulled ${data.added} statement line${data.added === 1 ? '' : 's'}.`
            : 'Bank connected. No new lines yet.'
      );
    } else {
      flash(data.error || 'Could not pull statements');
    }
  } catch {
    flash('Could not pull statements');
  }
  busy = false;
  render();
}

function withAdjustment(billId, occurrenceDate, patch) {
  const adjustments = book.adjustments.map((a) => ({ ...a }));
  let adj = adjustments.find((a) => a.billId === billId && a.occurrenceDate === occurrenceDate);
  if (!adj) {
    adj = { id: nid('adj'), billId, occurrenceDate, skip: false, moveTo: null, amountCents: null };
    adjustments.push(adj);
  }
  Object.assign(adj, patch);
  return {
    ...book,
    adjustments: adjustments.filter((a) => a.skip || a.moveTo || Number.isInteger(a.amountCents)),
  };
}

function statusLabel(status) {
  return {
    overdue: 'Overdue',
    'partial-overdue': 'Part paid · overdue',
    partial: 'Part paid',
    due: 'Due today',
    scheduled: 'Scheduled',
    paid: 'Paid',
    overpaid: 'Paid, with extra',
    skipped: 'Skipped',
  }[status] || status;
}

function gstNote(item) {
  if (!item.gst) return 'No GST';
  return `GST ${formatAud(item.gst)}`;
}

function figureCard(items, direction, title, klass) {
  const has = book.bills.some((bill) => bill.direction === direction);
  if (!has) return '';
  const day = today();
  const overdue = openItems(items).filter((item) => item.date < day);
  const in7 = openItems(items).filter((item) => item.date >= day && item.date <= addDays(day, 6));
  const in30 = openItems(items).filter((item) => item.date >= day && item.date <= addDays(day, 29));
  const cell = (list) => money(sumRemaining(list, direction));
  return `<div class="figure ${klass}">
      <h2>${title}</h2>
      <div class="nums">
        <div><b>${cell(overdue)}</b><span>Overdue</span></div>
        <div><b>${cell(in7)}</b><span>Next 7 days</span></div>
        <div><b>${cell(in30)}</b><span>Next 30 days</span></div>
      </div>
    </div>`;
}

function figuresHtml(items) {
  const cards = figureCard(items, 'out', 'To pay', 'out') + figureCard(items, 'in', 'To receive', 'in');
  if (!cards) return '';
  return `<div class="figures">${cards}</div>
  <p class="note">Overdue is not included in the 7 or 30 day totals. Next 7 days starts today. Totals stay on the whole desk when you search.</p>`;
}

function forecastHtml(items) {
  const start = mondayOnOrBefore(today());
  const weeks = [];
  for (let i = 0; i < 8; i++) {
    const from = addDays(start, i * 7);
    const to = addDays(from, 6);
    const slice = openItems(items).filter((item) => item.date >= from && item.date <= to);
    weeks.push({ from, to, out: sumRemaining(slice, 'out'), inn: sumRemaining(slice, 'in') });
  }
  const busyWeeks = weeks.filter((week) => week.out || week.inn);
  if (!busyWeeks.length) return '';
  return `<div class="group"><h3>Weeks with something still open</h3><div class="weeks">${busyWeeks
    .map(
      (week) => `<div class="week"><span>${esc(shortDate(week.from))}</span>${week.out ? `<b>${money(week.out)}</b>` : ''}${week.inn ? `<b class="in">${money(week.inn)}</b>` : ''}</div>`
    )
    .join('')}</div><p class="note">Only weeks in the next eight that still have money open. A quiet week is left off.</p></div>`;
}

function quarterHtml(items) {
  const range = quarterRange(today());
  const slice = items.filter((item) => !item.skipped && item.date >= range.start && item.date <= range.end && item.gst > 0);
  if (!slice.length) return '';
  const gst = (direction) => slice.filter((item) => item.direction === direction).reduce((sum, item) => sum + item.gst, 0);
  return `<div class="group"><h3>GST on bills in this BAS quarter</h3>
    <div class="item"><div><div class="who">${esc(longDate(range.start))} – ${esc(longDate(range.end))}</div>
      <div class="muted">On the bills dated in the quarter, skipped dates left out. This is not a lodged BAS.</div></div>
      <div class="amt">${money(gst('out'))}<small>GST to pay</small></div></div>
    <div class="item"><div class="who">GST on money in</div><div class="amt">${money(gst('in'))}<small>on invoices dated in the quarter</small></div></div>
  </div>`;
}

function itemHtml(item, { actions = true } = {}) {
  const day = today();
  const status = itemStatus(item, day);
  const bad = status === 'overdue' || status === 'partial-overdue';
  const who = item.direction === 'in' ? 'To receive' : 'To pay';
  const verb = item.direction === 'in' ? 'Received' : 'Pay';
  return `<article class="item ${bad ? 'over' : ''}">
    <div>
      <div class="when ${bad ? 'bad' : ''}"><span class="tag ${item.direction}">${who}</span>${esc(longDate(item.date))} · ${esc(statusLabel(status))}</div>
      <div class="who">${esc(item.vendor)}</div>
      <div class="muted">${esc(item.title)} · ${esc(RECURRENCE_LABEL[item.recurrence])} · ${esc(item.category)}${item.reference ? ` · ${esc(item.reference)}` : ''}</div>
      ${item.date !== item.originalDate ? `<div class="muted">Moved from ${esc(longDate(item.originalDate))}</div>` : ''}
      ${item.paidCents > 0 && item.remainingCents > 0 ? `<div class="muted">${money(item.paidCents)} recorded, ${money(item.remainingCents)} still open</div>` : ''}
    </div>
    <div class="amt">${money(item.remainingCents || item.total)}<small>${esc(gstNote(item))}${item.extraCents ? ` · extra ${esc(formatAud(item.extraCents))}` : ''}</small></div>
    ${
      actions
        ? `<div class="actions">
            ${item.remainingCents > 0 && !item.skipped ? `<button class="solid" type="button" data-act="pay" data-bill="${esc(item.billId)}" data-when="${esc(item.originalDate)}">${verb}</button>` : ''}
            <button class="ghost" type="button" data-act="more" data-bill="${esc(item.billId)}" data-when="${esc(item.originalDate)}">Change this date</button>
          </div>`
        : ''
    }
  </article>`;
}

function toolsHtml() {
  return `<div class="tools">
    <input id="q" type="search" placeholder="Search who, what, or reference" value="${esc(query)}" />
    <select id="cat" aria-label="Category">
      <option value="all" ${category === 'all' ? 'selected' : ''}>All categories</option>
      ${CATEGORIES.map((c) => `<option ${category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
    </select>
    <button class="solid" type="button" data-act="add">Add a bill</button>
  </div>`;
}

function dueView() {
  const items = knownItems(90);
  if (!book.bills.length) {
    return `<div class="empty">
      <h2>Nothing scheduled.</h2>
      <p>Add a bill you actually owe, or one a client actually owes you. A repeat fills the later dates. A payment stays on the date you record it. This desk does not start with sample bills.</p>
      <div class="stack">
        <button class="solid" type="button" data-act="add">Add a bill</button>
        <button class="ghost" type="button" data-act="pick-csv">Import a CSV of real bills</button>
      </div>
    </div>`;
  }
  const open = nextOpenPerBill(openItems(items).filter(matches));
  const day = today();
  const groups = [
    ['Overdue', open.filter((item) => item.date < day)],
    ['Today', open.filter((item) => item.date === day)],
    ['Rest of 7 days', open.filter((item) => item.date > day && item.date <= addDays(day, 6))],
    ['Rest of 30 days', open.filter((item) => item.date > addDays(day, 6) && item.date <= addDays(day, 29))],
    ['Days 31–90', open.filter((item) => item.date > addDays(day, 29) && item.date <= addDays(day, 90))],
  ].filter(([, list]) => list.length);
  return `${figuresHtml(items)}
    ${forecastHtml(items)}
    ${quarterHtml(items)}
    ${toolsHtml()}
    ${
      groups.length
        ? groups.map(([label, list]) => `<section class="group"><h3>${label}</h3>${list.map((item) => itemHtml(item)).join('')}</section>`).join('')
        : `<div class="empty"><h2>Nothing open in the next 90 days.</h2><p>${query || category !== 'all' ? 'Nothing matched that search.' : 'Paid and skipped dates are on Schedule and Paid.'}</p></div>`
    }`;
}

function seriesHtml(group) {
  const next = group.next;
  const status = itemStatus(next, today());
  const expanded = openSeries.has(group.billId);
  const gst = group.gstCents ? `GST ${formatAud(group.gstCents)}` : 'No GST';
  return `<article class="series ${group.direction}">
    <div class="series-top">
      <div>
        <div class="when"><span class="tag ${group.direction}">${group.direction === 'in' ? 'To receive' : 'To pay'}</span>${esc(RECURRENCE_LABEL[group.recurrence])} · ${esc(group.category)}</div>
        <div class="who">${esc(group.vendor)}</div>
        <div class="muted">${esc(group.title)}</div>
        <div class="series-sum">${money(group.remainingCents)} still open · ${group.items.length} date${group.items.length === 1 ? '' : 's'}</div>
        <div class="muted">${esc(gst)} in this window · next ${esc(longDate(next.date))} · ${esc(statusLabel(status))}</div>
      </div>
      <div class="amt">${money(next.remainingCents || next.total)}<small>next date</small></div>
    </div>
    <div class="actions">
      ${next.remainingCents > 0 && !next.skipped ? `<button class="solid" type="button" data-act="pay" data-bill="${esc(group.billId)}" data-when="${esc(next.originalDate)}">${group.direction === 'in' ? 'Receive next' : 'Pay next'}</button>` : ''}
      <button class="ghost" type="button" data-act="toggle-series" data-bill="${esc(group.billId)}">${expanded ? 'Hide dates' : 'Show dates'}</button>
    </div>
    ${expanded ? `<div class="series-dates">${group.items.map((item) => itemHtml(item)).join('')}</div>` : ''}
  </article>`;
}

function scheduleView() {
  const items = knownItems(horizon).filter((item) => item.date >= today() && item.date <= addDays(today(), horizon)).filter(matches);
  const cards = seriesCards(items);
  return `<div class="tools">
      <label class="muted" for="horizon">Show</label>
      <select id="horizon" aria-label="How far ahead">
        ${[30, 90, 180, 365].map((n) => `<option value="${n}" ${horizon === n ? 'selected' : ''}>${n} days</option>`).join('')}
      </select>
      <input id="q" type="search" placeholder="Search" value="${esc(query)}" />
      <button class="ghost" type="button" data-act="export-schedule">Export this schedule</button>
    </div>
    <p class="note">A repeat stays on one card. Open it to pay or move a single date. A 90 day window of a monthly bill is three lines inside the card, not three cards.</p>
    ${
      cards.length
        ? cards.map((group) => seriesHtml(group)).join('')
        : `<div class="empty"><h2>No dates in this window.</h2><p>Add a bill, or look further ahead.</p></div>`
    }`;
}

function billsView() {
  const items = knownItems(370);
  const cards = book.bills
    .slice()
    .sort((a, b) => a.vendor.localeCompare(b.vendor))
    .map((bill) => {
      const next = openItems(items).find((item) => item.billId === bill.id);
      return `<article class="bill">
        <div class="when"><span class="tag ${bill.direction}">${bill.direction === 'in' ? 'To receive' : 'To pay'}</span>${bill.paused ? '<span class="tag">Paused</span>' : ''}</div>
        <b>${esc(bill.vendor)}</b>
        <div class="muted">${esc(bill.title)} · ${esc(RECURRENCE_LABEL[bill.recurrence])} · ${money(splitGst(bill.amountCents, bill.gstMode).total)} payable · ${esc(GST_LABEL[bill.gstMode].toLowerCase())}</div>
        <div class="muted">${next ? `Next open ${esc(longDate(next.date))} · ${money(next.remainingCents)}` : 'Nothing open in the next year'}${bill.endsOn ? ` · ends ${esc(longDate(bill.endsOn))}` : ''}</div>
        <div class="actions">
          ${bill.direction === 'in' ? `<button class="ghost" type="button" data-act="print-doc" data-bill="${esc(bill.id)}">Print</button>` : ''}
          <button class="ghost" type="button" data-act="edit" data-bill="${esc(bill.id)}">Edit</button>
          <button class="ghost" type="button" data-act="pause" data-bill="${esc(bill.id)}">${bill.paused ? 'Resume' : 'Pause'}</button>
          <button class="ghost danger" type="button" data-act="delete" data-bill="${esc(bill.id)}">Remove</button>
        </div>
      </article>`;
    })
    .join('');
  return `${toolsHtml()}
    ${cards || `<div class="empty"><h2>No bills yet.</h2><p>The list stays empty until you add one.</p></div>`}
    <div class="group">
      <h3>Desk</h3>
      <div class="field"><label for="desk">Name on this desk</label><input id="desk" value="${esc(book.deskName)}" /></div>
      <div class="stack">
        <button class="solid" type="button" data-act="save-desk">Save name</button>
        <button class="ghost" type="button" data-act="export-bills">Export bills CSV</button>
        <button class="ghost" type="button" data-act="template">Download a blank CSV</button>
        <button class="ghost" type="button" data-act="pick-csv">Import bills CSV</button>
        <button class="ghost" type="button" data-act="export-json">Export desk backup</button>
        <button class="ghost" type="button" data-act="pick-json">Replace desk from a backup</button>
      </div>
      <p class="note">Import adds rows to this desk. A backup replace removes what is here and puts the file in its place. Blank template has column names only.</p>
    </div>`;
}

function paidView() {
  const payments = book.payments
    .slice()
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt));
  if (!payments.length) {
    return `<div class="empty"><h2>No payments recorded.</h2><p>When you mark a date paid, it is listed here with the amount, the day, and the method.</p></div>`;
  }
  return `<div class="tools"><button class="ghost" type="button" data-act="export-paid">Export payments CSV</button></div>
    ${payments
      .map((payment) => {
        const bill = book.bills.find((item) => item.id === payment.billId);
        return `<article class="pay">
          <div class="when">${esc(longDate(payment.paidOn))} · ${esc(METHOD_LABEL[payment.method] || payment.method)}</div>
          <b>${esc(bill?.vendor || 'Removed bill')}</b>
          <div class="muted">${esc(bill?.title || '')} · for the date ${esc(longDate(payment.occurrenceDate))}${payment.reference ? ` · ${esc(payment.reference)}` : ''}</div>
          <div class="amt">${money(payment.amountCents)}</div>
          <div class="actions"><button class="ghost danger" type="button" data-act="unpay" data-pay="${esc(payment.id)}">Remove this payment</button></div>
        </article>`;
      })
      .join('')}`;
}

function fillBank() {
  const el = document.getElementById('bank-status');
  const box = document.getElementById('bank-box');
  if (!el || !box) return;
  request('/api/bank')
    .then(({ res, data }) => {
      if (!res.ok) {
        el.textContent = data.error || 'Bank login is not available.';
        box.innerHTML = '';
        return;
      }
      if (!data.configured) {
        el.textContent = 'Bank login is off. It uses Basiq Open Banking and needs a Basiq API key on this server.';
        box.innerHTML = '';
        return;
      }
      const bank = data.bank || {};
      const profile = currentProfile();
      const names = (bank.connections || []).map((row) => row.institution).filter(Boolean).join(', ');
      if (names) el.textContent = `Connected: ${names}.`;
      else if (bank.connected) el.textContent = 'A Basiq user sits on this desk. Connect a bank to pick the institution.';
      else el.textContent = 'Basiq is on. Connect a bank opens their consent page. JAX does not keep the bank password.';
      const connections = (bank.connections || [])
        .map((conn) => {
          const accounts = (conn.accounts || [])
            .map((acc) => `${acc.name}${acc.masked ? ' ' + acc.masked : ''} ${formatAud(acc.balanceCents)}`)
            .join(' · ');
          return `<article class="pay"><b>${esc(conn.institution || 'Bank')}</b><div class="muted">${esc(conn.status || '')}${accounts ? ' · ' + esc(accounts) : ''}</div></article>`;
        })
        .join('');
      box.innerHTML = `<p class="note">You log in at the bank on Basiq. When you come back, pull statements.</p>
      <div class="pair">
        <div class="field"><label for="bank-email">Email</label><input id="bank-email" value="${esc(bank.email || profile.email)}" /></div>
        <div class="field"><label for="bank-mobile">Mobile</label><input id="bank-mobile" value="${esc(bank.mobile || profile.phone)}" /></div>
      </div>
      ${connections}
      <div class="stack" style="margin-top:12px">
        <button class="solid" type="button" data-act="connect-bank">Connect a bank</button>
        ${bank.connected ? `<button class="ghost" type="button" data-act="sync-bank">Pull statements</button>` : ''}
        ${bank.connected ? `<button class="ghost danger" type="button" data-act="disconnect-bank">Disconnect</button>` : ''}
      </div>`;
    })
    .catch(() => {
      el.textContent = 'Could not reach bank login.';
      box.innerHTML = '';
    });
}

function fillFeed() {
  const el = document.getElementById('feed-status');
  if (!el) return;
  request('/api/feed')
    .then(({ res, data }) => {
      if (!res.ok) {
        el.textContent = data.error || 'The feed is not available.';
        return;
      }
      el.textContent = data.feed
        ? 'Feed is live. A connector can post, and you can post a test line here.'
        : 'No connector token on the server yet. You can still post a test line here.';
    })
    .catch(() => {
      el.textContent = 'Could not reach the feed.';
    });
}

function fillPractice() {
  const el = document.getElementById('practice-inbox');
  if (!el) return;
  request('/api/practice').then(({ res, data }) => {
    if (!res.ok) {
      el.textContent = data.error || 'Could not load the inbox.';
      return;
    }
    const keepers = data.keepers || [];
    const asks = data.asks || [];
    if (!keepers.length && !asks.length) {
      el.innerHTML = '<p class="note">No keepers and no requests yet.</p>';
      return;
    }
    el.innerHTML =
      keepers
        .map((k) => `<article class="pay"><div class="when">${esc(k.createdAt?.slice(0, 10) || '')}</div><b>${esc(k.name)}${k.firm ? ' · ' + esc(k.firm) : ''}</b><div class="muted">${esc(k.email)} ${esc(k.phone)} · ${esc([k.city, k.state].filter(Boolean).join(', '))}</div></article>`)
        .join('') +
      asks
        .map((ask) => {
          const keeper = keepers.find((k) => k.id === ask.keeperId);
          return `<article class="pay"><div class="when">${esc(ask.createdAt?.slice(0, 10) || '')} · to ${esc(keeper?.name || 'JAX')}</div><b>${esc(ask.name)}</b><div class="muted">${esc(ask.email)} ${esc(ask.phone)}</div><div class="muted">${esc(ask.message)}</div></article>`;
        })
        .join('');
  });
}

function currentProfile() {
  return { ...emptyProfile(), ...(book.profile || {}) };
}

function effectiveKind() {
  return kindDraft || currentProfile().kind;
}

function namedSelect(id, items, current, label) {
  if (!items.length) return '';
  return `<div class="field"><label for="${id}">${label}</label>
    <select id="${id}"><option value="">—</option>${items
      .map((item) => `<option value="${esc(item.id)}" ${current === item.id ? 'selected' : ''}>${esc(item.name)}</option>`)
      .join('')}</select></div>`;
}

function orgSpendHtml() {
  const items = knownItems(370);
  const divNames = new Map((book.divisions || []).map((row) => [row.id, row.name]));
  const franNames = new Map((book.franchises || []).map((row) => [row.id, row.name]));
  const supNames = new Map((book.suppliers || []).map((row) => [row.id, row.name]));
  const divs = spendBy(items, 'divisionId', divNames);
  const frans = spendBy(items, 'franchiseId', franNames);
  const sups = spendBy(items, 'supplierId', supNames);
  if (!divs.length && !frans.length && !sups.length) return '';
  const block = (title, rows) =>
    rows.length
      ? `<div class="group"><h3>${title}</h3>${rows
          .map((row) => `<article class="pay"><b>${esc(row.name)}</b><div class="amt">${money(row.cents)}</div></article>`)
          .join('')}</div>`
      : '';
  return block('Still open by division', divs) + block('Still open by franchise', frans) + block('Still open by supplier', sups);
}

function orgDesk() {
  const divisions = book.divisions || [];
  const franchises = book.franchises || [];
  const suppliers = book.suppliers || [];
  const subcontractors = book.subcontractors || [];
  const employees = book.employees || [];
  const sites = usesOrg(effectiveKind())
    ? `<div class="group">
      <h3>Divisions</h3>
      ${divisions.map((row) => `<article class="pay"><b>${esc(row.name)}</b><div class="actions"><button class="ghost danger" type="button" data-act="drop-division" data-id="${esc(row.id)}">Remove</button></div></article>`).join('')}
      <div class="field"><label for="div-name">Division</label><input id="div-name" /></div>
      <button class="ghost" type="button" data-act="add-division">Add division</button>
    </div>
    <div class="group">
      <h3>Franchises</h3>
      ${franchises
        .map(
          (row) =>
            `<article class="pay"><b>${esc(row.name)}</b><div class="muted">${esc([row.suburb, row.state, row.franchisee].filter(Boolean).join(' · '))}</div><div class="actions"><button class="ghost danger" type="button" data-act="drop-franchise" data-id="${esc(row.id)}">Remove</button></div></article>`
        )
        .join('')}
      <div class="field"><label for="fran-name">Location name</label><input id="fran-name" /></div>
      <div class="pair">
        <div class="field"><label for="fran-suburb">Suburb</label><input id="fran-suburb" /></div>
        <div class="field"><label for="fran-state">State</label><select id="fran-state"><option value="">—</option>${STATES.map((st) => `<option>${st}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="fran-who">Franchisee</label><input id="fran-who" /></div>
      <button class="ghost" type="button" data-act="add-franchise">Add franchise</button>
    </div>`
    : '';
  return `${sites}
    <div class="group">
      <h3>Suppliers</h3>
      ${suppliers
        .map(
          (row) =>
            `<article class="pay"><b>${esc(row.name)}</b><div class="muted">${esc([row.abn && 'ABN ' + row.abn, row.email, row.phone].filter(Boolean).join(' · '))}</div><div class="actions"><button class="ghost danger" type="button" data-act="drop-supplier" data-id="${esc(row.id)}">Remove</button></div></article>`
        )
        .join('')}
      <div class="field"><label for="sup-name">Supplier</label><input id="sup-name" /></div>
      <div class="pair">
        <div class="field"><label for="sup-abn">ABN</label><input id="sup-abn" /></div>
        <div class="field"><label for="sup-email">Email</label><input id="sup-email" /></div>
      </div>
      <div class="field"><label for="sup-phone">Phone</label><input id="sup-phone" /></div>
      <button class="ghost" type="button" data-act="add-supplier">Add supplier</button>
    </div>
    <div class="group">
      <h3>Employees</h3>
      <p class="note">People on the payroll. Super is a worksheet. Sole traders, partnerships, companies, and trusts use this list.</p>
      ${employees
        .map((person) => {
          const div = divisions.find((row) => row.id === person.divisionId);
          const fran = franchises.find((row) => row.id === person.franchiseId);
          return `<article class="pay"><b>${esc(person.name)}</b><div class="muted">${esc([person.role, div?.name, fran?.name].filter(Boolean).join(' · '))} · gross ${money(person.grossCents)}</div><div class="actions"><button class="ghost danger" type="button" data-act="drop-employee" data-id="${esc(person.id)}">Remove</button></div></article>`;
        })
        .join('')}
      <div class="field"><label for="emp-name">Name</label><input id="emp-name" /></div>
      <div class="field"><label for="emp-role">Role</label><input id="emp-role" /></div>
      ${namedSelect('emp-div', divisions, '', 'Division')}
      ${namedSelect('emp-fran', franchises, '', 'Franchise')}
      <div class="pair">
        <div class="field"><label for="emp-gross">Gross (AUD)</label><input id="emp-gross" inputmode="decimal" /></div>
        <div class="field"><label for="emp-tax">Tax withheld (AUD)</label><input id="emp-tax" inputmode="decimal" /></div>
      </div>
      <div class="field"><label for="emp-super">Super %</label><input id="emp-super" inputmode="decimal" value="${superPercent(today())}" /></div>
      <button class="ghost" type="button" data-act="add-employee">Add employee</button>
    </div>
    <div class="group">
      <h3>Subcontractors</h3>
      <p class="note">Contractors you pay. Attach them on a bill. Sole traders, partnerships, companies, and trusts use this list.</p>
      ${subcontractors
        .map(
          (row) =>
            `<article class="pay"><b>${esc(row.name)}</b><div class="muted">${esc([row.work, row.abn && 'ABN ' + row.abn].filter(Boolean).join(' · '))}</div><div class="actions"><button class="ghost danger" type="button" data-act="drop-subcontractor" data-id="${esc(row.id)}">Remove</button></div></article>`
        )
        .join('')}
      <div class="field"><label for="sub-name">Name</label><input id="sub-name" /></div>
      <div class="pair">
        <div class="field"><label for="sub-work">What they do</label><input id="sub-work" /></div>
        <div class="field"><label for="sub-abn">ABN</label><input id="sub-abn" /></div>
      </div>
      <button class="ghost" type="button" data-act="add-subcontractor">Add subcontractor</button>
    </div>`;
}

function taxView() {
  const profile = currentProfile();
  const bas = basWorksheet(book, today());
  const year = yearTotals(book, today());
  const day = today();
  const items90 = knownItems(90);
  const items180 = knownItems(180);
  const open90 = openItems(items90).filter((item) => item.date >= day && item.date <= addDays(day, 89));
  const open180 = openItems(items180).filter((item) => item.date >= day && item.date <= addDays(day, 179));
  const employees = book.employees || [];
  const trips = book.trips || [];
  return `<div class="empty" style="border-style:solid">
      <h2>Tax</h2>
      <p>${esc(profile.legalName || book.deskName)} · ${esc(PROFILE_KIND_LABEL[profile.kind] || profile.kind)} · ${profile.gstRegistered ? 'GST registered' : 'Not GST registered'} · ${profile.gstBasis === 'accrual' ? 'Accrual' : 'Cash'} basis.</p>
      <p class="note">These figures come from the bills and payments on this desk. They do not lodge a BAS or an income tax return with the ATO.</p>
    </div>
    <div class="figures" style="margin-top:14px">
      <div class="figure out">
        <h2>BAS ${esc(longDate(bas.quarter.start))} – ${esc(longDate(bas.quarter.end))}</h2>
        <div class="nums">
          <div><b>${money(bas.g1)}</b><span>G1 total sales</span></div>
          <div><b>${money(bas.label1A)}</b><span>1A GST on sales</span></div>
          <div><b>${money(bas.label1B)}</b><span>1B GST on purchases</span></div>
        </div>
        <p class="note">${bas.netGst >= 0 ? `Net GST to pay ${formatAud(bas.netGst)}` : `Net GST credit ${formatAud(-bas.netGst)}`}. ${bas.basis === 'cash' ? 'Cash basis uses the payment date.' : 'Accrual uses the due date.'}</p>
      </div>
      <div class="figure in">
        <h2>Income year ${esc(year.year.label)}</h2>
        <div class="nums">
          <div><b>${money(year.income)}</b><span>Sales ex GST</span></div>
          <div><b>${money(year.expenses)}</b><span>Costs ex GST</span></div>
          <div><b>${money(year.profit)}</b><span>Result</span></div>
        </div>
      </div>
    </div>
    <div class="figures">
      <div class="figure out">
        <h2>Cash still to move</h2>
        <div class="nums">
          <div><b>${money(sumRemaining(open90, 'out'))}</b><span>To pay, 90 days</span></div>
          <div><b>${money(sumRemaining(open180, 'out'))}</b><span>To pay, 180 days</span></div>
          <div><b>${money(sumRemaining(open90, 'in'))}</b><span>To receive, 90 days</span></div>
        </div>
      </div>
    </div>
    ${orgSpendHtml()}
    <div class="group">
      <h3>Kilometres (ATO cents per km)</h3>
      <p class="note">From 1 July 2026 the rate is 91c. The method caps at 5,000 km a year. A trip uses the rate on the day it happened.</p>
      <div class="pair">
        <div class="field"><label for="trip-on">Date</label><input id="trip-on" type="date" value="${today()}" /></div>
        <div class="field"><label for="trip-km">Kilometres</label><input id="trip-km" inputmode="numeric" /></div>
      </div>
      <div class="pair">
        <div class="field"><label for="trip-purpose">What it was for</label><input id="trip-purpose" /></div>
        <div class="field"><label for="trip-car">Vehicle</label><input id="trip-car" value="Car" /></div>
      </div>
      <button class="solid" type="button" data-act="add-trip">Add trip</button>
      <p class="note" style="margin-top:10px">Claimed ${year.mileage.kilometres} km of ${year.mileage.cap} · ${money(year.mileage.cents)}</p>
      ${trips
        .slice()
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
        .map(
          (trip) => `<article class="pay"><div class="when">${esc(longDate(trip.occurredOn))} · ${trip.kilometres} km · ${esc(trip.vehicle)}</div><b>${esc(trip.purpose)}</b><div class="actions"><button class="ghost danger" type="button" data-act="drop-trip" data-id="${esc(trip.id)}">Remove</button></div></article>`
        )
        .join('')}
    </div>
    <div class="group">
      <h3>Payroll worksheet</h3>
      <p class="note">Gross, tax withheld, and super at ${superPercent(today())}% unless you set another rate. This is a worksheet. It does not send STP or pay a fund.</p>
      <div class="pair">
        <div class="field"><label for="emp-name">Name</label><input id="emp-name" /></div>
        <div class="field"><label for="emp-gross">Gross (AUD)</label><input id="emp-gross" inputmode="decimal" /></div>
      </div>
      <div class="pair">
        <div class="field"><label for="emp-tax">Tax withheld (AUD)</label><input id="emp-tax" inputmode="decimal" /></div>
        <div class="field"><label for="emp-super">Super %</label><input id="emp-super" inputmode="decimal" value="${superPercent(today())}" /></div>
      </div>
      <button class="solid" type="button" data-act="add-employee">Add to worksheet</button>
      ${employees
        .map((person) => {
          const superCents = Math.round((person.grossCents * person.superPercent) / 100);
          return `<article class="pay"><b>${esc(person.name)}</b><div class="muted">Gross ${money(person.grossCents)} · tax ${money(person.taxCents)} · super ${person.superPercent}% ${money(superCents)}</div><div class="actions"><button class="ghost danger" type="button" data-act="drop-employee" data-id="${esc(person.id)}">Remove</button></div></article>`;
        })
        .join('')}
    </div>
    <div class="stack">
      <button class="ghost" type="button" data-act="export-bas">Export BAS CSV</button>
    </div>`;
}

function deskView() {
  const profile = currentProfile();
  const txns = book.transactions || [];
  const open = openItems(knownItems(400));
  const unmatched = txns.filter((row) => !row.matchBillId);
  return `<div class="empty" style="border-style:solid">
      <h2>Desk</h2>
      <p>Your house. Who you are, the statements, and the people in it.</p>
    </div>
    <form id="profile-form" class="group" style="margin-top:16px">
      <h3>Business</h3>
      <div class="field"><label for="kind">Structure</label>
        <select id="kind">${PROFILE_KINDS.map((kind) => `<option value="${kind}" ${effectiveKind() === kind ? 'selected' : ''}>${esc(PROFILE_KIND_LABEL[kind])}</option>`).join('')}</select>
      </div>
      <div class="field"><label for="legal">Legal name</label><input id="legal" value="${esc(profile.legalName)}" /></div>
      <div class="field"><label for="trading">Trading name</label><input id="trading" value="${esc(profile.tradingName)}" /></div>
      <div class="pair">
        <div class="field"><label for="abn">ABN (11 digits)</label><input id="abn" inputmode="numeric" value="${esc(profile.abn)}" /></div>
        <div class="field"><label for="acn">ACN (9 digits)</label><input id="acn" inputmode="numeric" value="${esc(profile.acn)}" /></div>
      </div>
      <label class="check"><input id="gst-reg" type="checkbox" ${profile.gstRegistered ? 'checked' : ''}/> GST registered</label>
      <div class="field"><label for="gst-basis">GST basis</label>
        <select id="gst-basis">
          <option value="cash" ${profile.gstBasis === 'cash' ? 'selected' : ''}>Cash</option>
          <option value="accrual" ${profile.gstBasis === 'accrual' ? 'selected' : ''}>Accrual</option>
        </select>
      </div>
      <div class="field"><label for="address">Street</label><input id="address" value="${esc(profile.address)}" /></div>
      <div class="pair">
        <div class="field"><label for="suburb">Suburb</label><input id="suburb" value="${esc(profile.suburb)}" /></div>
        <div class="field"><label for="state">State</label>
          <select id="state"><option value="">—</option>${STATES.map((st) => `<option ${profile.state === st ? 'selected' : ''}>${st}</option>`).join('')}</select>
        </div>
      </div>
      <div class="pair">
        <div class="field"><label for="postcode">Postcode</label><input id="postcode" value="${esc(profile.postcode)}" /></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" value="${esc(profile.phone)}" /></div>
      </div>
      <div class="field"><label for="email">Email</label><input id="email" value="${esc(profile.email)}" /></div>
      <label class="check"><input id="jax-auto" type="checkbox" ${profile.jaxAuto ? 'checked' : ''}/> Apply JAX matches at 0.95 or above when a statement is imported</label>
      <p class="note">JAX here is a rule: same remaining amount, vendor name in the description, date within three days. It is not a trained model and it does not talk to a bank.</p>
      ${
        effectiveKind() === 'partnership'
          ? `<h3>Partners</h3>
            ${(profile.partners || [])
              .map((partner) => `<article class="pay"><b>${esc(partner.name)}</b><div class="muted">${partner.sharePercent}%</div><div class="actions"><button class="ghost danger" type="button" data-act="drop-partner" data-id="${esc(partner.id)}">Remove</button></div></article>`)
              .join('')}
            <div class="pair">
              <div class="field"><label for="partner-name">Partner name</label><input id="partner-name" /></div>
              <div class="field"><label for="partner-share">Share %</label><input id="partner-share" inputmode="numeric" /></div>
            </div>
            <button class="ghost" type="button" data-act="add-partner">Add partner</button>`
          : ''
      }
      <div class="stack" style="margin-top:12px">
        <button class="solid" type="submit">Save profile</button>
      </div>
    </form>
    ${orgDesk()}
    <div class="group">
      <h3>Bank</h3>
      <p id="bank-status">Checking bank login…</p>
      <div id="bank-box"></div>
    </div>
    <div class="group">
      <h3>Bank feed</h3>
      <p id="feed-status">Checking the feed…</p>
      <p class="note">A connector can still post lines to this URL with Authorization: Bearer and the feed token. Use this to test without a bank login.</p>
      <p class="muted" id="feed-url">https://ledger-futuret3ch.vercel.app/api/feed</p>
      <div class="pair">
        <div class="field"><label for="feed-on">Date</label><input id="feed-on" type="date" value="${today()}" /></div>
        <div class="field"><label for="feed-amt">Amount (AUD, minus is money out)</label><input id="feed-amt" inputmode="decimal" /></div>
      </div>
      <div class="field"><label for="feed-desc">Description</label><input id="feed-desc" /></div>
      <button class="solid" type="button" data-act="post-feed">Post a test line</button>
    </div>
    <div class="group">
      <h3>Bank statements</h3>
      <p class="note">Import a CSV with date, description, and amount. Money out is negative. High-confidence matches can be applied by JAX.</p>
      <button class="solid" type="button" data-act="pick-statement">Import statement CSV</button>
      ${
        unmatched.length
          ? unmatched
              .map((txn) => {
                const guess = bestMatch(txn, open);
                return `<article class="pay">
                  <div class="when">${esc(longDate(txn.postedOn))} · ${money(txn.amountCents)}</div>
                  <b>${esc(txn.description)}</b>
                  ${guess.item ? `<div class="muted">JAX ${guess.score.toFixed(2)} · ${esc(guess.item.vendor)} ${esc(longDate(guess.item.date))}</div>` : `<div class="muted">No open bill looks close.</div>`}
                  ${
                    guess.item
                      ? `<div class="actions"><button class="solid" type="button" data-act="match-txn" data-txn="${esc(txn.id)}" data-bill="${esc(guess.item.billId)}" data-when="${esc(guess.item.originalDate)}">Match</button></div>`
                      : ''
                  }
                </article>`;
              })
              .join('')
          : `<p class="note">${txns.length ? 'Every imported line is matched.' : 'No statement lines yet.'}</p>`
      }
    </div>
    <div class="group">
      <h3>Keeper inbox</h3>
      <p class="note">Signups and messages from the public site land here.</p>
      <div id="practice-inbox">Loading…</div>
    </div>
    <div class="group">
      <h3>Install JAX</h3>
      <p>The same desk in a native shell. iOS first in Xcode. Mac in Xcode. Windows with Electron, then pack an appx for the Microsoft Store.</p>
      <p class="note">iPhone: on a Mac open <span class="muted">apps/ios/JAX.xcodeproj</span> and Run on a simulator.<br/>Mac: open <span class="muted">apps/macos/JAX.xcodeproj</span> and Run on My Mac.<br/>Windows: in <span class="muted">apps/windows</span> run npm install && npm start. npm run pack builds the Store appx.</p>
      <p class="note">Feed SDK: <span class="muted">sdk/jax-feed</span>. Ping and post with LEDGER_FEED_TOKEN. Lines land on Desk for matching.</p>
      <button class="ghost" type="button" data-act="install">Install this browser copy</button>
    </div>`;
}

function billSheet() {
  const existing = sheet.billId ? book.bills.find((bill) => bill.id === sheet.billId) : null;
  const direction = existing?.direction || 'out';
  return `<div class="sheet-bg" data-act="close">
    <form class="sheet" data-sheet id="bill-form">
      <div class="handle"></div>
      <h2>${existing ? 'Edit bill' : 'Add a bill'}</h2>
      <div class="field"><span class="muted">Direction</span>
        <div class="choice">
          <label><input type="radio" name="direction" value="out" ${direction === 'out' ? 'checked' : ''}/> We pay</label>
          <label><input type="radio" name="direction" value="in" ${direction === 'in' ? 'checked' : ''}/> They pay us</label>
        </div>
      </div>
      <div class="field"><label for="vendor">Who</label><input id="vendor" required value="${esc(existing?.vendor || '')}" /></div>
      <div class="field"><label for="title">What it is for</label><input id="title" required value="${esc(existing?.title || '')}" /></div>
      <div class="pair">
        <div class="field"><label for="amount">Amount (AUD)</label><input id="amount" inputmode="decimal" required value="${existing ? (existing.amountCents / 100).toFixed(2) : ''}" /></div>
        <div class="field"><label for="gst">GST</label><select id="gst">${Object.entries(GST_LABEL)
          .map(([key, label]) => `<option value="${key}" ${existing?.gstMode === key ? 'selected' : ''}>${esc(label)}</option>`)
          .join('')}</select></div>
      </div>
      <div class="pair">
        <div class="field"><label for="starts">First due date</label><input id="starts" type="date" required value="${esc(existing?.startsOn || today())}" /></div>
        <div class="field"><label for="repeats">Repeats</label><select id="repeats">${RECURRENCES.map(
          (key) => `<option value="${key}" ${existing?.recurrence === key || (!existing && key === 'monthly') ? 'selected' : ''}>${esc(RECURRENCE_LABEL[key])}</option>`
        ).join('')}</select></div>
      </div>
      <div class="field"><label for="category">Category</label><select id="category">${CATEGORIES.map(
        (c) => `<option ${existing?.category === c || (!existing && c === 'Other') ? 'selected' : ''}>${esc(c)}</option>`
      ).join('')}</select></div>
      <details ${existing?.reference || existing?.notes || existing?.endsOn || (book.divisions || []).length || (book.franchises || []).length || (book.suppliers || []).length || (book.subcontractors || []).length ? 'open' : ''}>
        <summary>Reference, notes, end date</summary>
        <div class="field"><label for="reference">Invoice, BPAY, or account</label><input id="reference" value="${esc(existing?.reference || '')}" /></div>
        <div class="field"><label for="notes">Notes</label><textarea id="notes" rows="3">${esc(existing?.notes || '')}</textarea></div>
        <div class="field"><label for="ends">Last due date, if it stops</label><input id="ends" type="date" value="${esc(existing?.endsOn || '')}" /></div>
        ${namedSelect('bill-div', book.divisions || [], existing?.divisionId || '', 'Division')}
        ${namedSelect('bill-fran', book.franchises || [], existing?.franchiseId || '', 'Franchise')}
        ${namedSelect('bill-sup', book.suppliers || [], existing?.supplierId || '', 'Supplier')}
        ${namedSelect('bill-sub', book.subcontractors || [], existing?.subcontractorId || '', 'Subcontractor')}
      </details>
      ${existing ? `<label class="check"><input id="paused" type="checkbox" ${existing.paused ? 'checked' : ''}/> Pause future dates</label>` : ''}
      <div class="stack" style="margin-top:12px">
        <button class="solid" type="submit">${existing ? 'Save bill' : 'Add bill'}</button>
        <button class="ghost" type="button" data-act="close">Cancel</button>
      </div>
      <p class="note">Changing the amount changes what is still unpaid. Payments already recorded stay as entered. A monthly date keeps the same day, or the last day of a short month.</p>
    </form>
  </div>`;
}

function paySheet() {
  const item = findItem(sheet.billId, sheet.when);
  if (!item) return '';
  const verb = item.direction === 'in' ? 'Record a receipt' : 'Record a payment';
  return `<div class="sheet-bg" data-act="close">
    <form class="sheet" data-sheet id="pay-form">
      <div class="handle"></div>
      <h2>${verb}</h2>
      <p class="note">${esc(item.vendor)} · ${esc(item.title)} · due ${esc(longDate(item.date))}. Still open ${money(item.remainingCents)}. This stays on that due date and does not pay the next one.</p>
      <div class="field"><label for="pay-amount">Amount (AUD)</label><input id="pay-amount" inputmode="decimal" value="${(item.remainingCents / 100).toFixed(2)}" /></div>
      <div class="field"><label for="pay-on">Date</label><input id="pay-on" type="date" value="${today()}" /></div>
      <div class="field"><label for="pay-method">Method</label><select id="pay-method">${METHODS.map(
        (key) => `<option value="${key}">${esc(METHOD_LABEL[key])}</option>`
      ).join('')}</select></div>
      <div class="field"><label for="pay-ref">Reference</label><input id="pay-ref" /></div>
      <div class="stack">
        <button class="solid" type="submit">Save</button>
        <button class="ghost" type="button" data-act="close">Cancel</button>
      </div>
    </form>
  </div>`;
}

function moreSheet() {
  const item = findItem(sheet.billId, sheet.when);
  if (!item) return '';
  return `<div class="sheet-bg" data-act="close">
    <form class="sheet" data-sheet id="more-form">
      <div class="handle"></div>
      <h2>This date only</h2>
      <p class="note">${esc(item.vendor)} · ${esc(longDate(item.originalDate))}. The rest of the series stays as it is.</p>
      <div class="field"><label for="move-to">Move it to</label><input id="move-to" type="date" value="${esc(item.date)}" /></div>
      <div class="field"><label for="one-amount">Amount for this date (AUD)</label><input id="one-amount" inputmode="decimal" value="${((book.bills.find((bill) => bill.id === item.billId)?.gstMode === 'exclusive' ? item.exGst : item.total) / 100).toFixed(2)}" /></div>
      <p class="note">Same kind of amount as the bill. GST is worked out from that. Payable on this date now: ${money(item.total)}.</p>
      <div class="stack">
        <button class="solid" type="submit">Save this date</button>
        <button class="ghost" type="button" data-act="skip" data-bill="${esc(item.billId)}" data-when="${esc(item.originalDate)}">${item.skipped ? 'Put this date back' : 'Skip this date'}</button>
        <button class="ghost" type="button" data-act="close">Cancel</button>
      </div>
    </form>
  </div>`;
}

function importSheet() {
  const statement = sheet.type === 'statement';
  const rows = sheet.drafts.length
    ? `<p>${sheet.drafts.length} ${statement ? 'statement line' : 'bill'}${sheet.drafts.length === 1 ? '' : 's'} ready to add.</p>`
    : `<p>Nothing to add.</p>`;
  const problems = sheet.errors.length
    ? `<div class="errors">${sheet.errors
        .slice(0, 8)
        .map((err) => `<div>Row ${err.row}: ${esc(err.message)}</div>`)
        .join('')}${sheet.errors.length > 8 ? `<div>${sheet.errors.length - 8} more rows skipped.</div>` : ''}</div>`
    : '';
  return `<div class="sheet-bg" data-act="close">
    <div class="sheet" data-sheet>
      <div class="handle"></div>
      <h2>Import ${esc(sheet.name || 'CSV')}</h2>
      ${rows}
      ${problems}
      <div class="stack">
        <button class="solid" type="button" data-act="${statement ? 'confirm-statement' : 'confirm-import'}" ${sheet.drafts.length ? '' : 'disabled'}>Add the valid rows</button>
        <button class="ghost" type="button" data-act="close">Cancel</button>
      </div>
    </div>
  </div>`;
}

function shell(body) {
  const saved = book?.updatedAt
    ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' }).format(new Date(book.updatedAt))
    : null;
  return `<div class="app">
    <nav class="nav">
      ${VIEWS.map(([id, label]) => `<button type="button" class="${view === id ? 'active' : ''}" data-view="${id}">${label}</button>`).join('')}
    </nav>
    <div>
      <header class="top">
        <div class="brand"><img class="mark" src="/logo.png" width="512" height="512" alt="JAX"/><div><h1>JAX</h1><p>${esc(book?.deskName || 'MT ECO SYSTEM')} · Melbourne dates</p></div></div>
        <button class="ghost" type="button" data-act="lock">Log out</button>
      </header>
      <main class="main">${flashMsg ? `<p class="status" role="status">${esc(flashMsg)}</p>` : ''}${body}<p class="foot">JAX by Futuret3ch and MemeTorrent for the MT ECO SYSTEM. ${saved ? `Saved ${esc(saved)}.` : 'Nothing saved yet.'} Dates use Melbourne time.</p></main>
    </div>
    ${sheet?.type === 'bill' ? billSheet() : ''}
    ${sheet?.type === 'pay' ? paySheet() : ''}
    ${sheet?.type === 'more' ? moreSheet() : ''}
    ${sheet?.type === 'import' || sheet?.type === 'statement' ? importSheet() : ''}
  </div>`;
}

function lockView() {
  return `<div class="lock"><div class="card">
    <img class="mark" src="/logo.png" width="512" height="512" alt="JAX"/>
    <p class="note" style="letter-spacing:.14em;text-transform:uppercase;font-weight:680">Futuret3ch · MemeTorrent $MT</p>
    <h1>JAX</h1>
    <p class="note">For self-employed people, businesses, and corporations. The desk is locked.</p>
    <p class="note"><a href="/" style="color:inherit">Back to the site</a></p>
    ${bootError ? `<p class="errors">${esc(bootError)}</p>` : ''}
    <form id="lock-form">
      <div class="field"><label for="code">Access code</label><input id="code" type="password" autocomplete="current-password" required /></div>
      <button class="solid" type="submit" ${busy ? 'disabled' : ''}>Unlock</button>
    </form>
  </div></div>${flashMsg ? `<p class="toast" role="status">${esc(flashMsg)}</p>` : ''}`;
}

function render() {
  const focus = document.activeElement;
  const focusId = focus?.id || '';
  const caret = focus?.selectionStart;
  if (!ready) {
    root.innerHTML = `<div class="lock"><div class="card"><img class="mark" src="/logo.png" width="512" height="512" alt="JAX"/><h1>JAX</h1><p class="note">Opening…</p></div></div>`;
    return;
  }
  if (!onAppPath()) {
    root.innerHTML = siteView();
    bindSite();
    startClock();
    return;
  }
  stopClock();
  if (!authed || !book) {
    root.innerHTML = lockView();
    return;
  }
  let body = dueView();
  if (view === 'schedule') body = scheduleView();
  if (view === 'bills') body = billsView();
  if (view === 'paid') body = paidView();
  if (view === 'tax') body = taxView();
  if (view === 'desk') body = deskView();
  root.innerHTML = shell(body);
  if (view === 'desk') {
    fillPractice();
    fillFeed();
    fillBank();
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (typeof caret === 'number' && el.setSelectionRange) {
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          /* date inputs */
        }
      }
    }
  }
}

function readBill() {
  const existing = sheet?.billId ? book.bills.find((bill) => bill.id === sheet.billId) : null;
  const amountCents = dollarsToCents(document.getElementById('amount').value);
  if (amountCents == null) return { error: 'Enter the amount in dollars, like 89.00' };
  return {
    bill: {
      id: existing?.id || nid('bill'),
      direction: document.querySelector('input[name="direction"]:checked')?.value || 'out',
      vendor: document.getElementById('vendor').value,
      title: document.getElementById('title').value,
      category: document.getElementById('category').value,
      amountCents,
      gstMode: document.getElementById('gst').value,
      startsOn: document.getElementById('starts').value,
      recurrence: document.getElementById('repeats').value,
      endsOn: document.getElementById('ends').value || null,
      reference: document.getElementById('reference').value,
      notes: document.getElementById('notes').value,
      paused: existing ? Boolean(document.getElementById('paused')?.checked) : false,
      project: existing?.project || '',
      divisionId: document.getElementById('bill-div')?.value || '',
      franchiseId: document.getElementById('bill-fran')?.value || '',
      supplierId: document.getElementById('bill-sup')?.value || '',
      subcontractorId: document.getElementById('bill-sub')?.value || '',
      currency: existing?.currency || 'AUD',
      fxMilli: existing?.fxMilli || 1000,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function saveBill(event) {
  event.preventDefault();
  const { bill, error } = readBill();
  if (error) {
    flash(error);
    render();
    return;
  }
  const twin = book.bills.find(
    (other) =>
      other.id !== bill.id &&
      !other.paused &&
      other.direction === bill.direction &&
      other.vendor.trim().toLowerCase() === bill.vendor.trim().toLowerCase() &&
      other.recurrence === bill.recurrence &&
      other.amountCents === bill.amountCents
  );
  if (twin && !confirm(`There is already a ${RECURRENCE_LABEL[bill.recurrence].toLowerCase()} ${bill.vendor.trim()} bill for this amount. Save this one too?`)) {
    return;
  }
  const bills = sheet?.billId ? book.bills.map((item) => (item.id === bill.id ? bill : item)) : [...book.bills, bill];
  push({ ...book, bills }, sheet?.billId ? 'Bill updated' : 'Bill added');
}

function savePayment(event) {
  event.preventDefault();
  const item = findItem(sheet.billId, sheet.when);
  if (!item || item.skipped) return;
  const amountCents = dollarsToCents(document.getElementById('pay-amount').value);
  const paidOn = document.getElementById('pay-on').value;
  if (amountCents == null || amountCents <= 0) {
    flash('Enter the amount that moved.');
    render();
    return;
  }
  if (!paidOn) {
    flash('Enter the date it moved.');
    render();
    return;
  }
  const payment = {
    id: nid('pay'),
    billId: item.billId,
    occurrenceDate: item.originalDate,
    paidOn,
    amountCents,
    method: document.getElementById('pay-method').value,
    reference: document.getElementById('pay-ref').value,
    createdAt: new Date().toISOString(),
  };
  push({ ...book, payments: [...book.payments, payment] }, item.direction === 'in' ? 'Receipt recorded' : 'Payment recorded');
}

function saveMore(event) {
  event.preventDefault();
  const item = findItem(sheet.billId, sheet.when);
  const bill = book.bills.find((entry) => entry.id === sheet.billId);
  if (!item || !bill) return;
  const moveTo = document.getElementById('move-to').value;
  const amountCents = dollarsToCents(document.getElementById('one-amount').value);
  if (!moveTo) {
    flash('Choose the date.');
    render();
    return;
  }
  if (amountCents == null) {
    flash('Enter the amount for this date.');
    render();
    return;
  }
  const next = withAdjustment(item.billId, item.originalDate, {
    skip: false,
    moveTo: moveTo === item.originalDate ? null : moveTo,
    amountCents: amountCents === bill.amountCents ? null : amountCents,
  });
  push(next, 'That date was updated');
}

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-view],[data-act]');
  if (!target || target.closest('form') && target.type === 'submit') return;
  if (target.dataset.view) {
    view = target.dataset.view;
    sheet = null;
    history.replaceState(null, '', `#${view}`);
    render();
    return;
  }
  const act = target.dataset.act;
  if (!act) return;
  if (act === 'close' && event.target !== target && !target.classList.contains('ghost')) return;
  if (act === 'close') {
    sheet = null;
    render();
    return;
  }
  if (act === 'lock') {
    lock();
    return;
  }
  if (act === 'add') {
    sheet = { type: 'bill' };
    render();
    return;
  }
  if (act === 'edit') {
    sheet = { type: 'bill', billId: target.dataset.bill };
    render();
    return;
  }
  if (act === 'pay') {
    sheet = { type: 'pay', billId: target.dataset.bill, when: target.dataset.when };
    render();
    return;
  }
  if (act === 'more') {
    sheet = { type: 'more', billId: target.dataset.bill, when: target.dataset.when };
    render();
    return;
  }
  if (act === 'pause') {
    const bills = book.bills.map((bill) => (bill.id === target.dataset.bill ? { ...bill, paused: !bill.paused, updatedAt: new Date().toISOString() } : bill));
    const paused = bills.find((bill) => bill.id === target.dataset.bill)?.paused;
    push({ ...book, bills }, paused ? 'Future dates paused' : 'Bill resumed');
    return;
  }
  if (act === 'delete') {
    const bill = book.bills.find((item) => item.id === target.dataset.bill);
    const count = book.payments.filter((payment) => payment.billId === bill?.id).length;
    const extra = count ? ` This also removes ${count} recorded payment${count === 1 ? '' : 's'}.` : '';
    if (!bill || !confirm(`Remove ${bill.vendor} — ${bill.title}?${extra}`)) return;
    push(
      {
        ...book,
        bills: book.bills.filter((item) => item.id !== bill.id),
        payments: book.payments.filter((payment) => payment.billId !== bill.id),
        adjustments: book.adjustments.filter((adj) => adj.billId !== bill.id),
      },
      'Bill removed'
    );
    return;
  }
  if (act === 'unpay') {
    const payment = book.payments.find((item) => item.id === target.dataset.pay);
    if (!payment || !confirm('Remove this recorded payment? The date becomes open again.')) return;
    push({ ...book, payments: book.payments.filter((item) => item.id !== payment.id) }, 'Payment removed');
    return;
  }
  if (act === 'toggle-series') {
    if (openSeries.has(target.dataset.bill)) openSeries.delete(target.dataset.bill);
    else openSeries.add(target.dataset.bill);
    render();
    return;
  }
  if (act === 'skip') {
    const item = findItem(target.dataset.bill, target.dataset.when);
    if (!item) return;
    const next = item.skipped
      ? withAdjustment(item.billId, item.originalDate, { skip: false })
      : withAdjustment(item.billId, item.originalDate, { skip: true, moveTo: null });
    push(next, item.skipped ? 'Date put back' : 'Date skipped');
    return;
  }
  if (act === 'save-desk') {
    push({ ...book, deskName: document.getElementById('desk').value }, 'Desk name saved');
    return;
  }
  if (act === 'export-bills') {
    download('ledger-bills.csv', billsToCsv(book.bills), 'text/csv');
    return;
  }
  if (act === 'template') {
    download('ledger-bills-blank.csv', CSV_TEMPLATE, 'text/csv');
    return;
  }
  if (act === 'export-schedule') {
    const items = knownItems(horizon).filter((item) => item.date >= today() && item.date <= addDays(today(), horizon));
    const rows = [['date', 'direction', 'vendor', 'title', 'category', 'status', 'total', 'gst', 'paid', 'remaining', 'reference']];
    for (const item of items) {
      rows.push([
        item.date,
        item.direction,
        item.vendor,
        item.title,
        item.category,
        itemStatus(item, today()),
        (item.total / 100).toFixed(2),
        (item.gst / 100).toFixed(2),
        (item.paidCents / 100).toFixed(2),
        (item.remainingCents / 100).toFixed(2),
        item.reference,
      ]);
    }
    download('ledger-schedule.csv', toCsv(rows), 'text/csv');
    return;
  }
  if (act === 'export-paid') {
    const rows = [['paid_on', 'vendor', 'title', 'occurrence_date', 'amount', 'method', 'reference']];
    for (const payment of book.payments) {
      const bill = book.bills.find((item) => item.id === payment.billId);
      rows.push([
        payment.paidOn,
        bill?.vendor || '',
        bill?.title || '',
        payment.occurrenceDate,
        (payment.amountCents / 100).toFixed(2),
        payment.method,
        payment.reference || '',
      ]);
    }
    download('ledger-payments.csv', toCsv(rows), 'text/csv');
    return;
  }
  if (act === 'export-json') {
    download(
      'ledger-backup.json',
      JSON.stringify({ product: 'futuret3ch-ledger', exportedAt: new Date().toISOString(), book }, null, 2),
      'application/json'
    );
    return;
  }
  if (act === 'pick-csv' || act === 'pick-json') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = act === 'pick-csv' ? '.csv,text/csv' : '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      if (act === 'pick-csv') {
        const { drafts, errors } = draftsFromCsv(text);
        sheet = { type: 'import', drafts, errors, name: file.name };
        render();
        return;
      }
      try {
        const parsed = JSON.parse(text);
        const raw = parsed.book || parsed;
        if (!confirm('Replace every bill and payment on this desk with that file?')) return;
        const normalized = normalizeBook({ ...raw, version: book.version });
        push(normalized, 'Desk replaced from the backup');
      } catch (err) {
        flash(err.message || 'That backup could not be read');
        render();
      }
    };
    input.click();
    return;
  }
  if (act === 'add-trip') {
    const kilometres = Number(document.getElementById('trip-km').value);
    const purpose = document.getElementById('trip-purpose').value;
    const occurredOn = document.getElementById('trip-on').value;
    if (!Number.isInteger(kilometres) || kilometres <= 0) {
      flash('Enter whole kilometres.');
      render();
      return;
    }
    const trip = {
      id: nid('trip'),
      occurredOn,
      kilometres,
      purpose,
      vehicle: document.getElementById('trip-car').value || 'Car',
    };
    push({ ...book, trips: [...(book.trips || []), trip] }, 'Trip added');
    return;
  }
  if (act === 'drop-trip') {
    push({ ...book, trips: (book.trips || []).filter((trip) => trip.id !== target.dataset.id) }, 'Trip removed');
    return;
  }
  if (act === 'add-employee') {
    const gross = dollarsToCents(document.getElementById('emp-gross').value);
    const tax = dollarsToCents(document.getElementById('emp-tax').value);
    const superPct = Number(document.getElementById('emp-super').value);
    if (gross == null || tax == null) {
      flash('Enter gross and tax in dollars.');
      render();
      return;
    }
    const person = {
      id: nid('empl'),
      name: document.getElementById('emp-name').value,
      role: document.getElementById('emp-role')?.value || '',
      grossCents: gross,
      taxCents: tax,
      superPercent: superPct,
      divisionId: document.getElementById('emp-div')?.value || '',
      franchiseId: document.getElementById('emp-fran')?.value || '',
    };
    push({ ...book, employees: [...(book.employees || []), person] }, 'Added to the worksheet');
    return;
  }
  if (act === 'drop-employee') {
    push({ ...book, employees: (book.employees || []).filter((person) => person.id !== target.dataset.id) }, 'Removed from the worksheet');
    return;
  }
  if (act === 'add-division') {
    const name = document.getElementById('div-name').value;
    push({ ...book, divisions: [...(book.divisions || []), { id: nid('divi'), name }] }, 'Division added');
    return;
  }
  if (act === 'drop-division') {
    const id = target.dataset.id;
    push(
      {
        ...book,
        divisions: (book.divisions || []).filter((row) => row.id !== id),
        bills: book.bills.map((bill) => (bill.divisionId === id ? { ...bill, divisionId: '' } : bill)),
        employees: (book.employees || []).map((person) => (person.divisionId === id ? { ...person, divisionId: '' } : person)),
      },
      'Division removed'
    );
    return;
  }
  if (act === 'add-franchise') {
    push(
      {
        ...book,
        franchises: [
          ...(book.franchises || []),
          {
            id: nid('fran'),
            name: document.getElementById('fran-name').value,
            suburb: document.getElementById('fran-suburb').value,
            state: document.getElementById('fran-state').value,
            franchisee: document.getElementById('fran-who').value,
          },
        ],
      },
      'Franchise added'
    );
    return;
  }
  if (act === 'drop-franchise') {
    const id = target.dataset.id;
    push(
      {
        ...book,
        franchises: (book.franchises || []).filter((row) => row.id !== id),
        bills: book.bills.map((bill) => (bill.franchiseId === id ? { ...bill, franchiseId: '' } : bill)),
        employees: (book.employees || []).map((person) => (person.franchiseId === id ? { ...person, franchiseId: '' } : person)),
      },
      'Franchise removed'
    );
    return;
  }
  if (act === 'add-supplier') {
    push(
      {
        ...book,
        suppliers: [
          ...(book.suppliers || []),
          {
            id: nid('supp'),
            name: document.getElementById('sup-name').value,
            abn: document.getElementById('sup-abn').value,
            email: document.getElementById('sup-email').value,
            phone: document.getElementById('sup-phone').value,
            gstMode: 'none',
          },
        ],
      },
      'Supplier added'
    );
    return;
  }
  if (act === 'drop-supplier') {
    const id = target.dataset.id;
    push(
      {
        ...book,
        suppliers: (book.suppliers || []).filter((row) => row.id !== id),
        bills: book.bills.map((bill) => (bill.supplierId === id ? { ...bill, supplierId: '' } : bill)),
      },
      'Supplier removed'
    );
    return;
  }
  if (act === 'add-subcontractor') {
    push(
      {
        ...book,
        subcontractors: [
          ...(book.subcontractors || []),
          {
            id: nid('subc'),
            name: document.getElementById('sub-name').value,
            work: document.getElementById('sub-work').value,
            abn: document.getElementById('sub-abn').value,
          },
        ],
      },
      'Subcontractor added'
    );
    return;
  }
  if (act === 'drop-subcontractor') {
    const id = target.dataset.id;
    push(
      {
        ...book,
        subcontractors: (book.subcontractors || []).filter((row) => row.id !== id),
        bills: book.bills.map((bill) => (bill.subcontractorId === id ? { ...bill, subcontractorId: '' } : bill)),
      },
      'Subcontractor removed'
    );
    return;
  }
  if (act === 'post-feed') {
    const postedOn = document.getElementById('feed-on')?.value || '';
    const description = document.getElementById('feed-desc')?.value || '';
    const amountCents = signedAmount(document.getElementById('feed-amt')?.value || '');
    if (!postedOn || !description.trim() || amountCents == null || amountCents === 0) {
      flash('Date, description, and a non-zero amount. Minus is money out.');
      render();
      return;
    }
    busy = true;
    flash('');
    render();
    request('/api/feed', {
      method: 'POST',
      body: { transactions: [{ postedOn, description: description.trim(), amountCents }] },
    })
      .then(async ({ res, data }) => {
        if (!res.ok) {
          busy = false;
          if (data.book) book = data.book;
          flash(data.error || 'Feed did not accept that line');
          render();
          return;
        }
        const state = await request('/api/state');
        busy = false;
        if (state.res.ok) book = state.data;
        flash(data.added ? 'Test line posted. Match it under Bank statements.' : 'That line was already on the desk.');
        render();
      })
      .catch(() => {
        busy = false;
        flash('Feed did not accept that line');
        render();
      });
    return;
  }
  if (act === 'connect-bank') {
    const email = document.getElementById('bank-email')?.value || '';
    const mobile = document.getElementById('bank-mobile')?.value || '';
    busy = true;
    flash('');
    render();
    request('/api/bank', { method: 'POST', body: { action: 'connect', email, mobile } })
      .then(({ res, data }) => {
        if (!res.ok) {
          busy = false;
          flash(data.error || 'Could not start bank login');
          render();
          return;
        }
        if (data.url) {
          window.location.assign(data.url);
          return;
        }
        busy = false;
        flash('Bank login did not return a consent page');
        render();
      })
      .catch(() => {
        busy = false;
        flash('Could not start bank login');
        render();
      });
    return;
  }
  if (act === 'sync-bank') {
    busy = true;
    flash('');
    render();
    request('/api/bank', { method: 'POST', body: { action: 'sync' } })
      .then(async ({ res, data }) => {
        if (!res.ok) {
          busy = false;
          flash(data.error || 'Could not pull statements');
          render();
          return;
        }
        const state = await request('/api/state');
        busy = false;
        if (state.res.ok) book = state.data;
        flash(
          data.pending
            ? 'The bank is still fetching. Pull statements in a minute.'
            : data.added
              ? `Pulled ${data.added} statement line${data.added === 1 ? '' : 's'}.`
              : 'No new statement lines.'
        );
        render();
      })
      .catch(() => {
        busy = false;
        flash('Could not pull statements');
        render();
      });
    return;
  }
  if (act === 'disconnect-bank') {
    if (!confirm('Disconnect the bank on this desk? Statement lines already pulled stay.')) return;
    busy = true;
    flash('');
    render();
    request('/api/bank', { method: 'POST', body: { action: 'disconnect' } })
      .then(async ({ res, data }) => {
        if (!res.ok) {
          busy = false;
          flash(data.error || 'Could not disconnect');
          render();
          return;
        }
        const state = await request('/api/state');
        busy = false;
        if (state.res.ok) book = state.data;
        flash('Bank disconnected');
        render();
      })
      .catch(() => {
        busy = false;
        flash('Could not disconnect');
        render();
      });
    return;
  }
  if (act === 'add-partner') {
    const profile = currentProfile();
    const share = Number(document.getElementById('partner-share').value);
    const partner = {
      id: nid('part'),
      name: document.getElementById('partner-name').value,
      sharePercent: share,
    };
    push({ ...book, profile: { ...profile, partners: [...(profile.partners || []), partner] } }, 'Partner added');
    return;
  }
  if (act === 'drop-partner') {
    const profile = currentProfile();
    push({ ...book, profile: { ...profile, partners: (profile.partners || []).filter((partner) => partner.id !== target.dataset.id) } }, 'Partner removed');
    return;
  }
  if (act === 'pick-statement') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const { drafts, errors } = draftsFromStatement(text);
      sheet = { type: 'statement', drafts, errors, name: file.name };
      render();
    };
    input.click();
    return;
  }
  if (act === 'confirm-statement') {
    const now = new Date().toISOString();
    let transactions = [
      ...(book.transactions || []),
      ...sheet.drafts.map((draft) => ({
        ...draft,
        id: nid('stmt'),
        matchBillId: '',
        matchOccurrence: '',
        createdAt: now,
      })),
    ];
    let payments = [...book.payments];
    const profile = currentProfile();
    if (profile.jaxAuto) {
      const open = openItems(knownItems(400));
      transactions = transactions.map((txn) => {
        if (txn.matchBillId) return txn;
        const guess = bestMatch(txn, open.filter((item) => !payments.some((payment) => payment.billId === item.billId && payment.occurrenceDate === item.originalDate && payment.amountCents === item.remainingCents)));
        if (!guess.item || guess.score < 0.95) return txn;
        payments.push({
          id: nid('pay'),
          billId: guess.item.billId,
          occurrenceDate: guess.item.originalDate,
          paidOn: txn.postedOn,
          amountCents: Math.abs(txn.amountCents),
          method: 'bank',
          reference: txn.description.slice(0, 80),
          createdAt: now,
        });
        return { ...txn, matchBillId: guess.item.billId, matchOccurrence: guess.item.originalDate };
      });
    }
    push({ ...book, transactions, payments }, `Imported ${sheet.drafts.length} statement line${sheet.drafts.length === 1 ? '' : 's'}`);
    return;
  }
  if (act === 'match-txn') {
    const txn = (book.transactions || []).find((row) => row.id === target.dataset.txn);
    const item = findItem(target.dataset.bill, target.dataset.when);
    if (!txn || !item) return;
    const payment = {
      id: nid('pay'),
      billId: item.billId,
      occurrenceDate: item.originalDate,
      paidOn: txn.postedOn,
      amountCents: Math.abs(txn.amountCents),
      method: 'bank',
      reference: txn.description.slice(0, 80),
      createdAt: new Date().toISOString(),
    };
    const transactions = (book.transactions || []).map((row) =>
      row.id === txn.id ? { ...row, matchBillId: item.billId, matchOccurrence: item.originalDate } : row
    );
    push({ ...book, transactions, payments: [...book.payments, payment] }, 'Statement line matched');
    return;
  }
  if (act === 'export-bas') {
    const bas = basWorksheet(book, today());
    const rows = [
      ['field', 'amount'],
      ['quarter_start', bas.quarter.start],
      ['quarter_end', bas.quarter.end],
      ['basis', bas.basis],
      ['G1', (bas.g1 / 100).toFixed(2)],
      ['1A', (bas.label1A / 100).toFixed(2)],
      ['1B', (bas.label1B / 100).toFixed(2)],
      ['net_gst', (bas.netGst / 100).toFixed(2)],
    ];
    download('ledger-bas.csv', toCsv(rows), 'text/csv');
    return;
  }
  if (act === 'print-doc') {
    const bill = book.bills.find((item) => item.id === target.dataset.bill);
    if (!bill) return;
    const profile = currentProfile();
    const gst = splitGst(bill.amountCents, bill.gstMode);
    const win = window.open('', '_blank');
    if (!win) {
      flash('Allow pop-ups to print.');
      render();
      return;
    }
    win.document.write(`<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8"><title>JAX ${bill.direction === 'in' ? 'Invoice' : 'Bill'}</title>
      <style>body{font-family:Georgia,serif;max-width:640px;margin:40px auto;color:#1b1914}h1{font-size:28px}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #ddd}</style></head><body>
      <p>JAX · Futuret3ch and MemeTorrent · MT ECO SYSTEM</p>
      <h1>${bill.direction === 'in' ? 'Invoice' : 'Bill'}</h1>
      <p>${profile.legalName || book.deskName}<br>${profile.abn ? 'ABN ' + profile.abn : ''}<br>${profile.address} ${profile.suburb} ${profile.state} ${profile.postcode}</p>
      <p>To ${bill.vendor}<br>${bill.title}<br>Due ${bill.startsOn}</p>
      <table><tr><td>${bill.title}</td><td style="text-align:right">${formatAud(gst.total)}</td></tr>
      <tr><td>GST</td><td style="text-align:right">${formatAud(gst.gst)}</td></tr></table>
      <p>This is from the JAX desk. It is not a lodged BAS.</p>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    return;
  }
  if (act === 'install') {
    if (window.deferredInstall) {
      window.deferredInstall.prompt();
      return;
    }
    flash('Use the browser install menu, or on iPhone use Share then Add to Home Screen.');
    render();
    return;
  }
  if (act === 'confirm-import') {
    const now = new Date().toISOString();
    const bills = [
      ...book.bills,
      ...sheet.drafts.map((draft) => ({
        ...draft,
        id: nid('bill'),
        createdAt: now,
        updatedAt: now,
      })),
    ];
    push({ ...book, bills }, `Added ${sheet.drafts.length} bill${sheet.drafts.length === 1 ? '' : 's'}`);
  }
});

function saveProfile(event) {
  event.preventDefault();
  const profile = {
    ...currentProfile(),
    kind: document.getElementById('kind').value,
    legalName: document.getElementById('legal').value,
    tradingName: document.getElementById('trading').value,
    abn: document.getElementById('abn').value,
    acn: document.getElementById('acn').value,
    gstRegistered: Boolean(document.getElementById('gst-reg').checked),
    gstBasis: document.getElementById('gst-basis').value,
    address: document.getElementById('address').value,
    suburb: document.getElementById('suburb').value,
    state: document.getElementById('state').value,
    postcode: document.getElementById('postcode').value,
    phone: document.getElementById('phone').value,
    email: document.getElementById('email').value,
    jaxAuto: Boolean(document.getElementById('jax-auto').checked),
  };
  kindDraft = null;
  push({ ...book, deskName: profile.tradingName || profile.legalName || book.deskName, profile }, 'Profile saved');
}

root.addEventListener('submit', (event) => {
  if (event.target.id === 'lock-form') {
    event.preventDefault();
    unlock();
  } else if (event.target.id === 'profile-form') saveProfile(event);
  else if (event.target.id === 'bill-form') saveBill(event);
  else if (event.target.id === 'pay-form') savePayment(event);
  else if (event.target.id === 'more-form') saveMore(event);
});

root.addEventListener('input', (event) => {
  if (event.target.id === 'q') {
    query = event.target.value;
    render();
  }
});

root.addEventListener('change', (event) => {
  if (event.target.id === 'cat') {
    category = event.target.value;
    render();
  }
  if (event.target.id === 'horizon') {
    horizon = Number(event.target.value);
    render();
  }
  if (event.target.id === 'kind') {
    kindDraft = event.target.value;
    render();
  }
});

boot();
