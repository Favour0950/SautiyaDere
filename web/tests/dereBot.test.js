import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractClientEntities, generateOfflineDereBotReply } from '../src/services/dereBot.ts';

test('extractClientEntities extracts date, time, locations, fare, and allegation', () => {
  const narrative = 'On 14 May around 4:30pm from Westlands to JKIA, the passenger claimed fare was 1250 bob. She was abusive.';
  const entities = extractClientEntities(narrative);

  assert.ok(entities.some((e) => e.label === 'DATE' && e.text.includes('14 May')), 'Should extract date');
  assert.ok(entities.some((e) => e.label === 'TIME' && e.text.includes('4:30pm')), 'Should extract time');
  assert.ok(entities.some((e) => e.label === 'LOCATION' && e.text === 'Westlands'), 'Should extract Westlands');
  assert.ok(entities.some((e) => e.label === 'LOCATION' && e.text === 'JKIA'), 'Should extract JKIA');
  assert.ok(entities.some((e) => e.label === 'MONEY'), 'Should extract fare/money');
  assert.ok(entities.some((e) => e.label === 'ALLEGATION'), 'Should extract allegation');
});

test('generateOfflineDereBotReply probes for missing information when sparse', () => {
  const messages = [
    { sender: 'driver', text: 'My account was locked yesterday.' }
  ];
  const response = generateOfflineDereBotReply(messages, 'Bolt', 'Fare or payment dispute');

  assert.equal(typeof response.reply, 'string');
  assert.ok(response.reply.length > 10);
  assert.equal(response.facts_complete, false);
});

test('generateOfflineDereBotReply flags complete facts when key details present', () => {
  const messages = [
    {
      sender: 'driver',
      text: 'On 14 May at 4:30pm from Westlands to JKIA, passenger said fare was too high and refused to pay KSh 1,250.'
    }
  ];
  const response = generateOfflineDereBotReply(messages, 'Bolt', 'Fare or payment dispute');

  assert.equal(typeof response.reply, 'string');
  assert.equal(response.facts_complete, true);
  assert.ok(response.extracted_entities.length >= 3);
});

test('Strict Kenyan phone validator validates proper formats', () => {
  const isValidKenyanPhone = (val) => /^(?:(?:\+?254)|0)?[17]\d{8}$/.test(val.replace(/[\s-]/g, ''));

  assert.equal(isValidKenyanPhone('0712 345 678'), true);
  assert.equal(isValidKenyanPhone('+254 712 345 678'), true);
  assert.equal(isValidKenyanPhone('0110 123 456'), true);
  assert.equal(isValidKenyanPhone('254722123456'), true);
  assert.equal(isValidKenyanPhone('123'), false);
  assert.equal(isValidKenyanPhone(''), false);
  assert.equal(isValidKenyanPhone('07123'), false);
  assert.equal(isValidKenyanPhone('abcdefghij'), false);
});
