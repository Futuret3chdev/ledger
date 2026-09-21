import { offerParts, pad } from '../lib/offer.js';
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
  ['On your phone and computer', 'Install JAX from the browser on iPhone, Android, Windows, or Mac.'],
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
      <footer class="site-foot">
        JAX by Futuret3ch and MemeTorrent for the MT ECO SYSTEM.
      </footer>
    </div>
  </div>`;
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
