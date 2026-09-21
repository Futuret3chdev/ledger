import { quarterRange, todayMelbourne } from '../lib/dates.js';
import { dollarsToCents, formatAud, splitGst } from '../lib/money.js';
import { offerParts, pad } from '../lib/offer.js';
import { kmRateCents, KM_CAP } from '../lib/rates.js';
import './site.css';

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const SOLO = [
  'Invoices and quotes',
  'Bills and repeats on one card',
  'Bank statement import and JAX matching',
  'GST and BAS figures',
  'Live reports',
  'Payroll worksheet and super',
  '90 day cash coming up',
  'Kilometres at the ATO rate',
  'Record payments when money moves',
];

const HOUSE = [
  'Everything in Solo',
  'Expenses and kilometres',
  'More than one currency',
  'Income-year result',
  'Budget from the open schedule',
];

const HIVE = [
  'Everything in House',
  '180 day cash coming up',
  'Projects',
  'Sole trader, partnership, company, or trust',
  'Export bills, payments, schedule, and BAS',
];

const FEATS = [
  ['JAX matching', 'Statement lines match bills when the amount, the name, and the date line up.'],
  ['Bills and repeats', 'A monthly bill stays on one card. Pay or move a single date from there.'],
  ['Invoices and quotes', 'Send what they owe you. Print it with your ABN. Mark it paid when it lands.'],
  ['GST and BAS', 'GST in, GST out, and the BAS figures for the quarter.'],
  ['Bank statements', 'Drop in a statement and match the lines.'],
  ['Payroll', 'Gross, tax withheld, and super on a worksheet.'],
  ['Kilometres', 'ATO cents per kilometre, capped at 5,000 km.'],
  ['On your phone and computer', 'JAX has an iOS Xcode project, a Mac app, and a Windows app you can run and pack for the Microsoft Store.'],
];

export function siteView() {
  const offer = offerParts();
  const unit = (n, label) => `<div><b>${esc(pad(n))}</b><span>${label}</span></div>`;
  return `<div class="site">
    <header class="site-bar">
      <a class="site-brand" href="/"><div class="mark">Jx</div><div><b>JAX</b><div class="site-eco">MT ECO SYSTEM</div></div></a>
      <nav class="site-nav">
        <a href="#plans">Plans</a>
        <a href="#features">Features</a>
        <a href="#keepers">Keepers</a>
        <a href="#support">Support</a>
        <a href="/app">Log in</a>
        <a class="go" href="/app">Buy now</a>
      </nav>
    </header>
    <div class="site-wrap">
      <section class="hero">
        <div class="site-eco">By Futuret3ch and MemeTorrent</div>
        <h1>JAX</h1>
        <p>For self-employed people, businesses, and corporations.</p>
        <div class="offer">
          <div class="kicker">Limited time only</div>
          ${
            offer.ended
              ? `<h2>90% off your plan for your first 3 months.</h2>`
              : `<h2>90% off your plan for your first 3 months.</h2>
                 <div class="clock" id="jax-clock">${unit(offer.days, 'Days')}${unit(offer.hours, 'Hours')}${unit(offer.mins, 'Mins')}${unit(offer.secs, 'Secs')}</div>`
          }
          <p style="margin:12px 0 0"><a class="go" href="/app" style="display:inline-flex;min-height:44px;border-radius:999px;padding:0 18px;align-items:center;background:#7dffb1;color:#06140e;text-decoration:none;font-weight:680">Buy now</a></p>
        </div>
      </section>
      <section id="plans">
        <div class="kicker site-eco">Plans</div>
        <h2 style="font-family:var(--serif);font-size:40px;letter-spacing:-.04em">Solo, House, and Hive.</h2>
        <p style="color:#b7c4bc;max-width:46ch">Self-employed, businesses, and corporations.</p>
        <div class="packs">
          <article class="pack"><h3>Solo</h3><p>For self-employed people.</p><ul>${SOLO.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></article>
          <article class="pack"><h3>House</h3><p>For businesses.</p><ul>${HOUSE.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></article>
          <article class="pack"><h3>Hive</h3><p>For corporations.</p><ul>${HIVE.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></article>
        </div>
      </section>
      <section id="features">
        <div class="kicker site-eco">Features</div>
        <h2 style="font-family:var(--serif);font-size:40px;letter-spacing:-.04em">Features</h2>
        <div class="feats">${FEATS.map(([t, d]) => `<div class="feat"><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div>
      </section>
      <section id="find"></section>
      <section id="keepers">
        <div class="kicker site-eco">Keepers</div>
        <h2 style="font-family:var(--serif);font-size:40px;letter-spacing:-.04em">Accountants and bookkeepers.</h2>
        <p style="color:#b7c4bc;max-width:52ch">Run a client on JAX. One desk. Their ABN on the print. Their BAS figures from the bills you entered. No partner portal, no extra product names.</p>
        <div class="packs">
          <article class="pack"><h3>Accountants</h3><p>Open Tax. G1, 1A, 1B for the quarter. Export the BAS CSV. Print invoices with the client ABN.</p></article>
          <article class="pack"><h3>Bookkeepers</h3><p>Enter bills, import the statement, let JAX match the lines, mark paid when the money moved.</p></article>
          <article class="pack"><h3>Firms</h3><p>Set the profile to company, partnership, or trust. Keep projects on the bills. Export the year.</p></article>
        </div>
        <p style="color:#b7c4bc;max-width:52ch">A repeating bill stays on one card. Dates use Melbourne time. Kilometres use the ATO rate for the day of the trip.</p>
        <p style="margin:18px 0 28px"><a class="go" href="/app" style="display:inline-flex;min-height:44px;border-radius:999px;padding:0 18px;align-items:center;background:#7dffb1;color:#06140e;text-decoration:none;font-weight:680">Open JAX</a></p>
        <div class="packs">
          <article class="pack">
            <h3>Sign up as a keeper</h3>
            <p>Your name and firm go on the public list. Email stays off the list. Requests come to your inbox.</p>
            <form id="keeper-form">
              <div class="field"><label for="k-name">Name</label><input id="k-name" required /></div>
              <div class="field"><label for="k-firm">Firm</label><input id="k-firm" /></div>
              <div class="field"><label for="k-email">Email</label><input id="k-email" type="email" required /></div>
              <div class="field"><label for="k-phone">Phone</label><input id="k-phone" /></div>
              <div class="field"><label for="k-city">City</label><input id="k-city" /></div>
              <div class="field"><label for="k-state">State</label><select id="k-state"><option value="">—</option><option>NSW</option><option>VIC</option><option>QLD</option><option>SA</option><option>WA</option><option>TAS</option><option>NT</option><option>ACT</option></select></div>
              <div class="field"><label for="k-note">What you do</label><input id="k-note" /></div>
              <div class="field"><label for="k-pass">Passphrase (8+ characters)</label><input id="k-pass" type="password" required minlength="8" /></div>
              <button class="go" type="submit" style="margin-top:8px">Join the list</button>
              <p id="k-out" class="note"></p>
            </form>
          </article>
          <article class="pack">
            <h3>Ask a keeper</h3>
            <p>The message goes to that keeper’s inbox. If the list is empty, it still saves for JAX.</p>
            <form id="ask-form">
              <div class="field"><label for="a-keeper">Keeper</label><select id="a-keeper"><option value="">Anyone at JAX</option></select></div>
              <div class="field"><label for="a-name">Your name</label><input id="a-name" required /></div>
              <div class="field"><label for="a-email">Your email</label><input id="a-email" type="email" required /></div>
              <div class="field"><label for="a-phone">Phone</label><input id="a-phone" /></div>
              <div class="field"><label for="a-msg">Message</label><textarea id="a-msg" rows="4" required></textarea></div>
              <button class="go" type="submit" style="margin-top:8px">Send</button>
              <p id="a-out" class="note"></p>
            </form>
          </article>
          <article class="pack">
            <h3>Keeper inbox</h3>
            <p>Open the requests sent to you.</p>
            <form id="box-form">
              <div class="field"><label for="b-email">Email</label><input id="b-email" type="email" required /></div>
              <div class="field"><label for="b-pass">Passphrase</label><input id="b-pass" type="password" required /></div>
              <button class="go" type="submit" style="margin-top:8px">Open inbox</button>
            </form>
            <div id="box-out"></div>
          </article>
        </div>
        <h3 style="margin-top:8px">On the list</h3>
        <div id="keeper-list" class="feats"><p class="note">No keepers have signed up yet.</p></div>
      </section>
      <section id="support">
        <div class="kicker site-eco">Support</div>
        <h2 style="font-family:var(--serif);font-size:40px;letter-spacing:-.04em">Support</h2>
        <div class="feats">
          <div class="feat"><b>Add a bill</b><span>Open the desk, Due, Add a bill. Who, what it is for, amount, GST, first due date, how it repeats.</span></div>
          <div class="feat"><b>Plan</b><span>A monthly bill is one card. Show dates to pay or move a single day.</span></div>
          <div class="feat"><b>Statements</b><span>Desk, import a CSV with date, description, and amount. Money out is negative. Match a line to an open bill.</span></div>
          <div class="feat"><b>Tax</b><span>G1, 1A, 1B for this BAS quarter. Cash or accrual from the profile. Export the CSV.</span></div>
          <div class="feat"><b>Words</b><span>ABN is the 11-digit number. GST is 10%. BAS is the quarterly activity statement. Super on the worksheet is the guarantee rate from 1 July 2025: 12%.</span></div>
          <div class="feat"><b>Talk to us</b><span><a href="https://memetorrent.futuret3ch.com.au/contact">Contact Futuret3ch and MemeTorrent</a></span></div>
        </div>
        <div class="packs" style="margin-top:8px">
          <article class="pack">
            <h3>GST</h3>
            <p>Type an amount. Inclusive, exclusive, or none.</p>
            <div class="field"><label for="calc-gst">Amount (AUD)</label><input id="calc-gst" inputmode="decimal" /></div>
            <div class="field"><label for="calc-gst-mode">GST</label>
              <select id="calc-gst-mode">
                <option value="inclusive">GST included</option>
                <option value="exclusive">Add 10% GST</option>
                <option value="none">No GST</option>
              </select>
            </div>
            <p id="calc-gst-out" class="note">Enter an amount.</p>
          </article>
          <article class="pack">
            <h3>Kilometres</h3>
            <p>ATO cents per km for the date you drove. Cap 5,000 km.</p>
            <div class="field"><label for="calc-km-date">Date</label><input id="calc-km-date" type="date" value="${esc(todayMelbourne())}" /></div>
            <div class="field"><label for="calc-km">Kilometres</label><input id="calc-km" inputmode="numeric" /></div>
            <p id="calc-km-out" class="note">Enter kilometres.</p>
          </article>
          <article class="pack">
            <h3>This BAS quarter</h3>
            <p id="calc-bas-out"></p>
          </article>
        </div>
      </section>
      <footer class="site-foot">
        <div class="foot-grid">
          <div>
            <b>JAX</b>
            <a href="#features">How JAX works</a>
            <a href="#find">Find a keeper</a>
            <a href="#plans">Plans</a>
            <a href="/app">Open the desk</a>
          </div>
          <div>
            <b>JAX for</b>
            <a href="#keepers">Accountants and bookkeepers</a>
            <a href="#plans">Self-employed</a>
            <a href="#plans">Businesses</a>
            <a href="#plans">Corporations</a>
          </div>
          <div>
            <b>Resources</b>
            <a href="#support">Support</a>
            <a href="#support">GST</a>
            <a href="#support">Kilometres</a>
            <a href="https://memetorrent.futuret3ch.com.au/contact">Contact</a>
          </div>
        </div>
        <p style="margin-top:22px">JAX by Futuret3ch and MemeTorrent for the MT ECO SYSTEM.</p>
      </footer>
    </div>
  </div>`;
}

export function bindSite() {
  const gstIn = document.getElementById('calc-gst');
  const gstMode = document.getElementById('calc-gst-mode');
  const gstOut = document.getElementById('calc-gst-out');
  const paintGst = () => {
    if (!gstOut) return;
    const cents = dollarsToCents(gstIn?.value);
    if (cents == null) {
      gstOut.textContent = 'Enter an amount.';
      return;
    }
    const split = splitGst(cents, gstMode?.value || 'inclusive');
    gstOut.textContent = `GST ${formatAud(split.gst)} · total ${formatAud(split.total)} · ex GST ${formatAud(split.exGst)}`;
  };
  gstIn?.addEventListener('input', paintGst);
  gstMode?.addEventListener('change', paintGst);

  const kmIn = document.getElementById('calc-km');
  const kmDate = document.getElementById('calc-km-date');
  const kmOut = document.getElementById('calc-km-out');
  const paintKm = () => {
    if (!kmOut) return;
    const km = Number(kmIn?.value);
    const day = kmDate?.value || todayMelbourne();
    if (!Number.isInteger(km) || km <= 0) {
      kmOut.textContent = 'Enter kilometres.';
      return;
    }
    const counted = Math.min(km, KM_CAP);
    const rate = kmRateCents(day);
    kmOut.textContent = `${counted} km × ${rate}c = ${formatAud(counted * rate)}${km > KM_CAP ? ` · ${km - KM_CAP} km over the cap` : ''}`;
  };
  kmIn?.addEventListener('input', paintKm);
  kmDate?.addEventListener('change', paintKm);

  const basOut = document.getElementById('calc-bas-out');
  const list = document.getElementById('keeper-list');
  const askSelect = document.getElementById('a-keeper');
  const paintKeepers = (keepers) => {
    if (askSelect) {
      askSelect.innerHTML =
        '<option value="">Anyone at JAX</option>' +
        keepers.map((k) => `<option value="${esc(k.id)}">${esc(k.name)}${k.firm ? ' · ' + esc(k.firm) : ''}</option>`).join('');
    }
    if (!list) return;
    if (!keepers.length) {
      list.innerHTML = '<p class="note">No keepers have signed up yet.</p>';
      return;
    }
    list.innerHTML = keepers
      .map(
        (k) =>
          `<div class="feat"><b>${esc(k.name)}${k.firm ? ' · ' + esc(k.firm) : ''}</b><span>${esc([k.city, k.state].filter(Boolean).join(', '))}${k.note ? ' · ' + esc(k.note) : ''}</span></div>`
      )
      .join('');
  };
  fetch('/api/keepers')
    .then((res) => res.json())
    .then((data) => paintKeepers(data.keepers || []))
    .catch(() => {});

  const postForm = (id, url, body, outId, ok) => {
    const form = document.getElementById(id);
    const out = document.getElementById(outId);
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (out) out.textContent = 'Sending…';
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (out) out.textContent = data.error || 'Not saved';
        return;
      }
      if (out) out.textContent = ok;
      form.reset();
      const listRes = await fetch('/api/keepers');
      const listData = await listRes.json().catch(() => ({ keepers: [] }));
      paintKeepers(listData.keepers || []);
    });
  };
  postForm(
    'keeper-form',
    '/api/keepers',
    () => ({
      name: document.getElementById('k-name').value,
      firm: document.getElementById('k-firm').value,
      email: document.getElementById('k-email').value,
      phone: document.getElementById('k-phone').value,
      city: document.getElementById('k-city').value,
      state: document.getElementById('k-state').value,
      note: document.getElementById('k-note').value,
      passphrase: document.getElementById('k-pass').value,
    }),
    'k-out',
    'You are on the list. Use the inbox with your email and passphrase.'
  );
  postForm(
    'ask-form',
    '/api/asks',
    () => ({
      keeperId: document.getElementById('a-keeper').value,
      name: document.getElementById('a-name').value,
      email: document.getElementById('a-email').value,
      phone: document.getElementById('a-phone').value,
      message: document.getElementById('a-msg').value,
    }),
    'a-out',
    'Sent. It is in that keeper’s inbox.'
  );
  document.getElementById('box-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const box = document.getElementById('box-out');
    box.textContent = 'Opening…';
    const res = await fetch('/api/keeper-box', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('b-email').value,
        passphrase: document.getElementById('b-pass').value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      box.textContent = data.error || 'Not opened';
      return;
    }
    if (!data.asks.length) {
      box.innerHTML = `<p class="note">No requests yet for ${esc(data.keeper.name)}.</p>`;
      return;
    }
    box.innerHTML = data.asks
      .map((ask) => `<article class="feat"><b>${esc(ask.name)}</b><span>${esc(ask.email)} ${esc(ask.phone)}<br>${esc(ask.message)}</span></article>`)
      .join('');
  });

  if (basOut) {
    const q = quarterRange(todayMelbourne());
    const fmt = (iso) =>
      new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${iso}T00:00:00Z`)
      );
    basOut.textContent = `${fmt(q.start)} – ${fmt(q.end)}.`;
  }
}

export function paintClock() {
  const el = document.getElementById('jax-clock');
  if (!el) return;
  const offer = offerParts();
  if (offer.ended) {
    el.remove();
    return;
  }
  el.innerHTML = `<div><b>${pad(offer.days)}</b><span>Days</span></div><div><b>${pad(offer.hours)}</b><span>Hours</span></div><div><b>${pad(offer.mins)}</b><span>Mins</span></div><div><b>${pad(offer.secs)}</b><span>Secs</span></div>`;
}
