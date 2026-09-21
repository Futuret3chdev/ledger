#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { JaxFeed } from '../src/index.js';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
}

const cmd = args[0];
const baseUrl = flag('--url') || process.env.JAX_URL || 'https://ledger-futuret3ch.vercel.app';
const token = flag('--token') || process.env.LEDGER_FEED_TOKEN || '';
if (!token) {
  console.error('Set LEDGER_FEED_TOKEN or pass --token');
  process.exit(1);
}

const feed = new JaxFeed({ baseUrl, token });

if (cmd === 'ping') {
  const data = await feed.ping();
  console.log(JSON.stringify(data, null, 2));
} else if (cmd === 'post') {
  const file = flag('--file');
  if (!file) {
    console.error('jax-feed post --file transactions.json');
    process.exit(1);
  }
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const transactions = Array.isArray(raw) ? raw : raw.transactions;
  const data = await feed.post(transactions);
  console.log(JSON.stringify(data, null, 2));
} else {
  console.error('jax-feed ping\njax-feed post --file transactions.json [--url URL] [--token TOKEN]');
  process.exit(1);
}
