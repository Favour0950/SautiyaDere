/**
 * Verification test suite for Sauti ya Dere on-device Dexie.js storage (Task T25).
 */

import 'fake-indexeddb/auto';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, saveLocalProfile, getLocalProfile, saveCase, getAllCases, getCaseById } from '../src/db/db.js';

beforeEach(async () => {
  await db.profile.clear();
  await db.cases.clear();
});

test('Database configuration and schema validation', () => {
  assert.equal(db.name, 'SautiYaDereDB');
  assert.equal(db.verno, 1);
  assert.ok(db.profile, 'Profile store should exist');
  assert.ok(db.cases, 'Cases store should exist');

  // Verify indexed primary keys and attributes
  const profileSchema = db.profile.schema;
  assert.equal(profileSchema.primKey.name, 'id');
  const caseSchema = db.cases.schema;
  assert.equal(caseSchema.primKey.name, 'id');
  assert.equal(caseSchema.primKey.auto, true);
});

test('saveLocalProfile and getLocalProfile lifecycle', async () => {
  // 1. Initial state
  const initial = await getLocalProfile();
  assert.equal(initial, null);

  // 2. Save profile
  const profileId = await saveLocalProfile({
    name: 'Wanjiku Kamau',
    phone: '0722123456',
    platform: 'Bolt'
  });
  assert.equal(profileId, 'default');

  // 3. Retrieve saved profile
  const retrieved = await getLocalProfile();
  assert.ok(retrieved);
  assert.equal(retrieved.name, 'Wanjiku Kamau');
  assert.equal(retrieved.phone, '0722123456');
  assert.equal(retrieved.platform, 'Bolt');
  assert.ok(retrieved.updated_at);

  // 4. Update profile
  await saveLocalProfile({
    name: 'Wanjiku Kamau',
    phone: '0722123456',
    platform: 'Uber'
  });
  const updated = await getLocalProfile();
  assert.equal(updated.platform, 'Uber');
});

test('saveCase auto-increment, update, and retrieval', async () => {
  // 1. Save new case without explicit ID
  const caseId1 = await saveCase({
    platform: 'Bolt',
    case_type: 'fare_dispute',
    narrative: 'Passenger paid KSh 200 instead of KSh 850 at Westlands gate.',
    evidence_held: ['TRIP_RECEIPT_SCREENSHOT', 'MPESA_STATEMENT']
  });

  assert.equal(typeof caseId1, 'number');
  assert.ok(caseId1 > 0);

  // 2. Fetch by numeric ID
  const case1 = await getCaseById(caseId1);
  assert.ok(case1);
  assert.equal(case1.id, caseId1);
  assert.equal(case1.platform, 'Bolt');
  assert.equal(case1.case_type, 'fare_dispute');
  assert.equal(case1.status, 'draft');
  assert.deepEqual(case1.evidence_held, ['TRIP_RECEIPT_SCREENSHOT', 'MPESA_STATEMENT']);
  assert.ok(case1.created_at);

  // 3. Fetch by string ID
  const case1ByString = await getCaseById(String(caseId1));
  assert.deepEqual(case1ByString, case1);

  // 4. Update existing case
  await saveCase({
    id: caseId1,
    platform: 'Bolt',
    case_type: 'fare_dispute',
    status: 'appealed',
    narrative: 'Updated narrative with exact gate timestamp.',
    evidence_held: ['TRIP_RECEIPT_SCREENSHOT', 'MPESA_STATEMENT', 'GPS_ROUTE_LOG'],
    appeal_dossier: {
      headline: 'Formal Appeal: Contested Fare Dispute',
      statement_body: 'To Bolt Support...'
    }
  });

  const updatedCase = await getCaseById(caseId1);
  assert.equal(updatedCase.status, 'appealed');
  assert.equal(updatedCase.evidence_held.length, 3);
  assert.equal(updatedCase.appeal_dossier.headline, 'Formal Appeal: Contested Fare Dispute');

  // 5. Non-existent case
  const missing = await getCaseById(99999);
  assert.equal(missing, null);
  const nullLookup = await getCaseById(null);
  assert.equal(nullLookup, null);
});

test('getAllCases returns chronological descending list', async () => {
  await saveCase({
    platform: 'Uber',
    case_type: 'passenger_safety',
    created_at: '2026-10-01T10:00:00.000Z',
    narrative: 'First incident'
  });

  await saveCase({
    platform: 'Faras',
    case_type: 'fraud_flag',
    created_at: '2026-10-02T10:00:00.000Z',
    narrative: 'Second incident'
  });

  await saveCase({
    platform: 'Little',
    case_type: 'rating_or_cancellation',
    created_at: '2026-10-03T10:00:00.000Z',
    narrative: 'Third incident'
  });

  const all = await getAllCases();
  assert.equal(all.length, 3);
  // Ordered reverse chronological (newest first)
  assert.equal(all[0].platform, 'Little');
  assert.equal(all[1].platform, 'Faras');
  assert.equal(all[2].platform, 'Uber');
});

test('Dignity Principle verification: zero network calls during database operations', async () => {
  // Spy on global fetch to ensure no network calls are dispatched
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('Network prohibited during on-device storage operations');
  };

  try {
    await saveLocalProfile({ name: 'Private Driver', phone: '0711111111', platform: 'Uber' });
    await getLocalProfile();
    const id = await saveCase({ narrative: 'Sensitive unredacted local dispute statement' });
    await getCaseById(id);
    await getAllCases();

    assert.equal(networkCalls, 0, 'No network requests should be made by local database layer');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
