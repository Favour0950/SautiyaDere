/**
 * Sauti ya Dere — Client-Side Storage Layer (Task T25)
 *
 * IndexedDB database powered by Dexie.js for persistent, privacy-first on-device storage.
 * In accordance with our Dignity & Anti-Retaliation architectural principle:
 * - Driver profiles, narratives, evidence references, and appeal dossiers are stored 100% on-device.
 * - Zero network transmissions occur during any local database operation.
 */

import Dexie from 'dexie';

// 1. Initialize Dexie database instance
export const db = new Dexie('SautiYaDereDB');

// 2. Define schema version 1 and stores
db.version(1).stores({
  profile: 'id, name, phone, platform',
  cases: '++id, platform, case_type, status, created_at, narrative, evidence_held, appeal_dossier'
});

const DEFAULT_PROFILE_ID = 'default';

/**
 * Save or update the driver's local profile on-device.
 *
 * @param {Object} profileData - Driver profile data (name, phone, platform, etc.)
 * @returns {Promise<string>} The profile ID
 */
export async function saveLocalProfile(profileData = {}) {
  const record = {
    id: profileData.id || DEFAULT_PROFILE_ID,
    name: profileData.name || '',
    phone: profileData.phone || '',
    platform: profileData.platform || '',
    ...profileData,
    updated_at: new Date().toISOString()
  };
  await db.profile.put(record);
  return record.id;
}

/**
 * Retrieve the driver's local profile from on-device storage.
 *
 * @param {string} [id=DEFAULT_PROFILE_ID] - Optional profile key
 * @returns {Promise<Object|null>} The profile object or null if none exists
 */
export async function getLocalProfile(id = DEFAULT_PROFILE_ID) {
  const profile = await db.profile.get(id);
  if (profile) return profile;
  const first = await db.profile.toCollection().first();
  return first || null;
}

/**
 * Save a new case or update an existing case in on-device storage.
 *
 * @param {Object} caseData - Case record containing platform, case_type, narrative, etc.
 * @returns {Promise<number>} The generated or updated numeric case ID
 */
export async function saveCase(caseData = {}) {
  // Deep-clone via JSON to strip any accidental DOM event objects (PointerEvent etc.)
  // that cannot be serialised by IndexedDB's structured clone algorithm.
  let safeData = caseData;
  try { safeData = JSON.parse(JSON.stringify(caseData)); } catch (_) { /* keep original */ }
  const record = {
    ...safeData,
    created_at: caseData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: caseData.status || 'draft',
    evidence_held: Array.isArray(caseData.evidence_held) ? caseData.evidence_held : [],
    appeal_dossier: caseData.appeal_dossier || null
  };

  const id = await db.cases.put(record);
  return id;
}

/**
 * Retrieve all cases stored on-device, sorted with newest first.
 *
 * @returns {Promise<Array<Object>>} List of all stored case records
 */
export async function getAllCases() {
  return await db.cases.orderBy('created_at').reverse().toArray();
}

/**
 * Retrieve a single case record by its numeric or string ID.
 *
 * @param {number|string} id - The case ID
 * @returns {Promise<Object|null>} The case record or null if not found
 */
export async function getCaseById(id) {
  if (id === null || id === undefined) return null;
  const numericId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id;
  const item = await db.cases.get(numericId);
  return item || null;
}

/**
 * Update the status of an existing case record in IndexedDB.
 *
 * @param {number|string} id - Numeric case ID
 * @param {string} status - New case status (e.g. 'Platform Reinstated Account')
 * @returns {Promise<void>}
 */
export async function updateCaseStatus(id, status) {
  if (id === null || id === undefined) return;
  const numericId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id;
  await db.cases.update(numericId, {
    status,
    updated_at: new Date().toISOString()
  });
}

/**
 * Purge all local profile and case data from IndexedDB.
 */
export async function clearAllLocalData() {
  await db.profile.clear();
  await db.cases.clear();
}

export default db;
