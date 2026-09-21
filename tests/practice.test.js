import assert from 'node:assert/strict';
import test from 'node:test';
import { addAsk, addRoll, checkPass, emptyPractice, hashPass, publicKeeper, signupKeeper } from '../lib/practice.js';

test('a keeper can sign up and a request lands on their list', () => {
  const pass = 'desk-pass-99';
  let practice = emptyPractice();
  practice = signupKeeper(
    practice,
    {
      name: 'Alex Chen',
      firm: 'Chen Books',
      email: 'alex@chenbooks.test',
      phone: '0400000000',
      city: 'Melbourne',
      state: 'VIC',
      note: 'BAS and payroll',
      passphrase: pass,
    },
    'keep_alexchen1'
  );
  assert.equal(practice.keepers.length, 1);
  assert.equal(publicKeeper(practice.keepers[0]).email, undefined);
  assert.equal(checkPass(pass, practice.keepers[0].pass), true);
  assert.equal(checkPass('wrong-pass', practice.keepers[0].pass), false);
  practice = addAsk(
    practice,
    {
      keeperId: 'keep_alexchen1',
      name: 'Sam',
      email: 'sam@shop.test',
      message: 'Need the BAS done for September.',
    },
    'ask_samshop01'
  );
  assert.equal(practice.asks.length, 1);
  assert.equal(practice.asks[0].keeperId, 'keep_alexchen1');
});

test('a public roll card has no email or phone', () => {
  const practice = addRoll(
    emptyPractice(),
    {
      kind: 'business',
      name: 'Lee Parks',
      businessName: 'Parks Builds',
      abn: '51824753556',
      city: 'Geelong',
      state: 'VIC',
      employees: 12,
      roles: 'builders, admin',
      industry: 'Construction',
      looking: 'keepers',
      description: 'Residential builds on the Bellarine.',
    },
    'roll_parks001'
  );
  const card = practice.roll[0];
  assert.equal(card.businessName, 'Parks Builds');
  assert.equal(card.employees, 12);
  assert.equal('email' in card, false);
  assert.equal('phone' in card, false);
});

test('the same email cannot sign up twice', () => {
  const raw = {
    name: 'Alex Chen',
    firm: 'Chen Books',
    email: 'alex@chenbooks.test',
    passphrase: 'desk-pass-99',
  };
  const once = signupKeeper(emptyPractice(), raw, 'keep_alexchen1');
  assert.throws(() => signupKeeper(once, raw, 'keep_alexchen2'));
});
