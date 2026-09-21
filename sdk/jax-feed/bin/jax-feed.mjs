#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JaxFeed } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const ledgerRoot = join(here, '../../..');
const envFile = join(ledgerRoot, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

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
