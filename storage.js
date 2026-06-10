/**
 * storage.js — Dual-layer storage for instant reads + cross-device sync.
 *
 * Strategy:
 *   - chrome.storage.local  → instant cache, read first on load
 *   - chrome.storage.sync   → source of truth, syncs across devices
 *
 * On init: paint from local immediately, reconcile with sync in background.
 * On write: update both layers atomically.
 */

const STORAGE_KEY = 'newtab_data';
const SCHEMA_VERSION = 1;

/** @typedef {{ id: string, name: string, url: string }} Shortcut */
/** @typedef {{ id: string, name: string, shortcuts: Shortcut[] }} Group */
/** @typedef {{ version: number, groups: Group[] }} AppState */

/**
 * Returns a validated, migrated state object.
 * Handles missing or malformed data gracefully.
 * @param {unknown} raw
 * @returns {AppState}
 */
function validate(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) {
    return { version: SCHEMA_VERSION, groups: [] };
  }
  const groups = raw.groups
    .filter(g => g && typeof g === 'object')
    .map(g => ({
      id: typeof g.id === 'string' ? g.id : uid(),
      name: typeof g.name === 'string' ? g.name : 'Untitled',
      shortcuts: Array.isArray(g.shortcuts)
        ? g.shortcuts
            .filter(s => s && typeof s === 'object' && typeof s.url === 'string')
            .map(s => ({
              id: typeof s.id === 'string' ? s.id : uid(),
              name: typeof s.name === 'string' ? s.name : s.url,
              url: s.url,
            }))
        : [],
    }));
  return { version: SCHEMA_VERSION, groups };
}

/** Generate a short unique ID */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Read from local cache (instant, synchronous-feeling).
 * Returns validated state or null if nothing cached.
 * @returns {Promise<AppState|null>}
 */
async function readLocal() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY, result => {
      const raw = result[STORAGE_KEY];
      resolve(raw ? validate(raw) : null);
    });
  });
}

/**
 * Read from sync storage (cross-device, may be slower).
 * @returns {Promise<AppState|null>}
 */
async function readSync() {
  return new Promise(resolve => {
    chrome.storage.sync.get(STORAGE_KEY, result => {
      const raw = result[STORAGE_KEY];
      resolve(raw ? validate(raw) : null);
    });
  });
}

/**
 * Write state to both layers simultaneously.
 * @param {AppState} state
 * @returns {Promise<void>}
 */
async function saveAll(state) {
  const validated = validate(state);
  const payload = { [STORAGE_KEY]: validated };
  await Promise.all([
    new Promise(resolve => chrome.storage.local.set(payload, resolve)),
    new Promise(resolve => chrome.storage.sync.set(payload, resolve)),
  ]);
  return validated;
}

/**
 * Load state with instant-first strategy:
 *   1. Return local cache immediately if available (fast first paint).
 *   2. Fetch sync in background; call onSyncReady(state) when resolved.
 *
 * @param {function(AppState): void} onLocalReady  — called immediately with cached data (or empty)
 * @param {function(AppState): void} onSyncReady   — called when sync resolves (may be same as local)
 */
async function init(onLocalReady, onSyncReady) {
  const local = await readLocal();
  onLocalReady(local ?? { version: SCHEMA_VERSION, groups: [] });

  const synced = await readSync();
  if (synced) {
    // Sync wins as source of truth; update local cache to match
    await new Promise(resolve =>
      chrome.storage.local.set({ [STORAGE_KEY]: synced }, resolve)
    );
    onSyncReady(synced);
  } else if (local) {
    // No sync data yet; push local up to sync (first-time setup on new device)
    await new Promise(resolve =>
      chrome.storage.sync.set({ [STORAGE_KEY]: local }, resolve)
    );
    onSyncReady(local);
  } else {
    onSyncReady({ version: SCHEMA_VERSION, groups: [] });
  }
}

/**
 * Subscribe to live sync changes (e.g. another device wrote while this tab is open).
 * @param {function(AppState): void} callback
 */
function onChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[STORAGE_KEY]) {
      const newVal = changes[STORAGE_KEY].newValue;
      if (newVal) {
        const state = validate(newVal);
        // Mirror to local cache
        chrome.storage.local.set({ [STORAGE_KEY]: state });
        callback(state);
      }
    }
  });
}

/** Generate a new UID (exported for use in newtab.js) */
function newId() {
  return uid();
}

export { init, saveAll, onChange, newId, validate };
