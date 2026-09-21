import { offerParts, pad } from '../lib/offer.js';
import './site.css';

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const GROW = [
  'Send invoices and quotes from bills they pay you',
  'Track bills, repeats, and what is still open',
  'Import a bank statement CSV and match lines',
  'JAX scores a match from amount, vendor name, and date',
  'Track GST and prepare a BAS worksheet (it does not lodge with the ATO)',
  'See reports from this desk, live',
  'Payroll worksheet, including super at the current guarantee rate',
  '90 day cash still to pay and still to receive',
  'Week bars on Due',
  'Kilometres at the ATO cents-per-km rate, 5,000 km cap',
  'Record a payment when money actually moved',
];

const COMP = [
  'Everything in Grow',
  '90 day cash still to move',
  'Claim expenses and kilometres',
  'AUD plus a rate you type on a foreign bill',
  'Income-year result on Tax',
  'Budget from the open schedule, not a guess',
];

const ULT = [
  'Everything in Comprehensive',
  '180 day cash still to move',
  'Projects on a bill',
  'Partnership shares, company ABN/ACN, sole trader, or trust',
  'Export bills, payments, schedule, and BAS CSV',
];

const FEATS = [
  ['JAX matching', 'A line matches when the remaining amount, the vendor name, and a close date agree. Score 0.95 or more can apply if you turn that on. It is a rule, not a trained model, and it does not talk to a bank until a feed token is set.'],
  ['Bills and repeats', 'A monthly bill is one card. The next 90 days sit inside it. Pay or move a single date without cloning the merchant down the page.'],
  ['Invoices and quotes', 'A bill they pay you is the invoice. Print it with your ABN from the profile. Mark it paid when the money is in.'],
  ['GST and BAS', 'Inclusive, exclusive, GST-free, or input taxed. Tax fills G1, 1A, and 1B from the desk. Cash or accrual from the profile. It does not submit to the ATO.'],
  ['Bank statements', 'CSV import with date, description, and amount. Live Open Banking is off until a real aggregator is connected. /api/feed accepts lines when LEDGER_FEED_TOKEN is set.'],
  ['Payroll worksheet', 'Gross, tax withheld, and super. It does not send STP or pay a fund.'],
  ['Kilometres', '91c from 1 July 2026. 88c for the two years before that. Cap 5,000 km.'],
  ['Install', 'Add JAX from the browser on iPhone, Android, Windows, or Mac. It is not listed on the Apple App Store or Google Play.'],
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
              ? `<h2>The launch window ended 30 September.</h2><p>The desk is still open. There is no card in the app.</p>`
              : `<h2>90% off your plan for your first 3 months.</h2>
                 <p>Offer ends 30 September. Terms apply. There is no card in the app yet — Buy now opens the working desk.</p>
                 <div class="clock" id="jax-clock">${unit(offer.days, 'Days')}${unit(offer.hours, 'Hours')}${unit(offer.mins, 'Mins')}${unit(offer.secs, 'Secs')}</div>`
          }
          <p style="margin:12px 0 0"><a class="go" href="/app" style="display:inline-flex;min-height:44px;border-radius:999px;padding:0 18px;align-items:center;background:#7dffb1;color:#06140e;text-decoration:none;font-weight:680">Buy now</a></p>
        </div>
      </section>
      <section id="plans">
        <div class="kicker site-eco">Plans</div>
        <h2 style="font-family:var(--serif);font-size:40px;letter-spacing:-.04em">Three packs. Same live desk.</h2>
        <p style="color:#b7c4bc;max-width:46ch">No prices on this page. Nothing here is locked behind a paywall. Grow, Comprehensive, and Ultimate 10 are the work JAX already does.</p>
        <div class="packs">
          <article class="pack"><h3>Grow</h3><p>The desk: bills, GST, statements, 90 day cash, payroll worksheet, kilometres.</p><ul>${GROW.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></article>
          <article class="pack"><h3>Comprehensive</h3><p>Everything in Grow, plus the year result and a rate you type on a foreign bill.</p><ul>${COMP.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></article>
          <article class="pack"><h3>Ultimate 10</h3><p>Everything in Comprehensive, plus 180 day cash, projects, and the full business profile.</p><ul>${ULT.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></article>
        </div>
      </section>
      <section id="features">
        <div class="kicker site-eco">Features</div>
        <h2 style="font-family:var(--serif);font-size:40px;letter-spacing:-.04em">What JAX does now</h2>
        <div class="feats">${FEATS.map(([t, d]) => `<div class="feat"><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div>
      </section>
      <footer class="site-foot">
        JAX by Futuret3ch and MemeTorrent for the MT ECO SYSTEM. Built here. Keys stay with you. It does not lodge a BAS, send STP, take a card, or talk to 21,000 banks.
      </footer>
    </div>
  </div>`;
}

export function paintClock() {
  const el = document.getElementById('jax-clock');
  if (!el) return;
  const offer = offerParts();
  if (offer.ended) {
    el.outerHTML = '<p>The launch window ended 30 September.</p>';
    return;
  }
  el.innerHTML = `<div><b>${pad(offer.days)}</b><span>Days</span></div><div><b>${pad(offer.hours)}</b><span>Hours</span></div><div><b>${pad(offer.mins)}</b><span>Mins</span></div><div><b>${pad(offer.secs)}</b><span>Secs</span></div>`;
}
