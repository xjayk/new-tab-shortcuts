/**
 * storage.js — Dual-layer storage for instant reads + cross-device sync.
 *
 * Strategy:
 *   - chrome.storage.local  → instant cache, read first on load
 *   - chrome.storage.sync   → source of truth, syncs across devices
 *
 * On init: paint from local immediately, reconcile with sync in background.
 * On write: update both layers atomically.
 *
 * Sync orchestration:
 *   - Each install gets a stable writerId (persisted in local storage).
 *   - Each local write gets a monotonic revision number.
 *   - Sync storage stores an envelope: { __sync: { writerId, revision }, ...state }.
 *   - Echo suppression uses (writerId, revision) pairs, not content equality.
 *   - All sync writes serialize through a single promise chain; remote updates
 *     invalidate pending local writes and trigger re-assertion after stale writes.
 */

const STORAGE_KEY = 'newtab_data';
const BACKGROUND_KEY = 'newtab_background';
const BACKGROUND_SIZE_KEY = 'newtab_background_size';
const WRITER_ID_KEY = 'sync_writer_id';
const SCHEMA_VERSION = 1;

/** @typedef {{ id: string, name: string, url: string }} Shortcut */
/** @typedef {{ id: string, name: string, shortcuts: Shortcut[] }} Group */
/** @typedef {{ version: number, groups: Group[], shortcuts: Shortcut[] }} AppState */
/** @typedef {{ writerId: string, revision: number }} SyncMeta */

/** Generate a unique ID (exported for use in newtab.js) */
function newId() {
  return crypto.randomUUID();
}

/**
 * Unwrap sync envelope if present, returning clean state for validation.
 * @param {unknown} raw
 * @returns {AppState}
 */
function validate(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.groups)) {
    return { version: SCHEMA_VERSION, groups: [], shortcuts: [] };
  }

  // Remove __sync envelope if present (from sync storage)
  const source = raw.__sync ? Object.fromEntries(
    Object.entries(raw).filter(([k]) => k !== '__sync')
  ) : raw;

  const groups = source.groups
    .filter(g => g && typeof g === 'object')
    .map(g => ({
      id: typeof g.id === 'string' ? g.id : newId(),
      name: typeof g.name === 'string' ? g.name : 'Untitled',
      shortcuts: Array.isArray(g.shortcuts)
        ? g.shortcuts
            .filter(s => s && typeof s === 'object' && typeof s.url === 'string')
            .map(s => ({
              id: typeof s.id === 'string' ? s.id : newId(),
              name: typeof s.name === 'string' ? s.name : s.url,
              url: s.url,
            }))
        : [],
    }));

  const shortcuts = Array.isArray(source.shortcuts)
    ? source.shortcuts
        .filter(s => s && typeof s === 'object' && typeof s.url === 'string')
        .map(s => ({
          id: typeof s.id === 'string' ? s.id : newId(),
          name: typeof s.name === 'string' ? s.name : s.url,
          url: s.url,
        }))
    : [];

  return { version: SCHEMA_VERSION, groups, shortcuts };
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
 * Returns validated state and sync metadata (writerId, revision).
 * @returns {Promise<{ state: AppState|null, meta: SyncMeta|null }>}
 */
async function readSync() {
  return new Promise(resolve => {
    chrome.storage.sync.get(STORAGE_KEY, result => {
      const raw = result[STORAGE_KEY];
      if (!raw) {
        resolve({ state: null, meta: null });
        return;
      }
      const meta = raw.__sync ?? null;
      const state = validate(raw);
      resolve({ state, meta });
    });
  });
}

/**
 * Write state to both layers.
 * If provenance is provided, writes envelope to sync; otherwise writes clean state to both.
 * @param {AppState} state
 * @param {SyncMeta|null} [provenance]
 * @returns {Promise<AppState>}
 */
async function saveAll(state, provenance = null) {
  const validated = validate(state);
  const localPayload = { [STORAGE_KEY]: validated };
  const syncPayload = provenance
    ? { [STORAGE_KEY]: { ...validated, __sync: provenance } }
    : localPayload;

  await Promise.all([
    new Promise((resolve, reject) => chrome.storage.local.set(localPayload, err => err ? reject(err) : resolve())),
    new Promise((resolve, reject) => chrome.storage.sync.set(syncPayload, err => err ? reject(err) : resolve())),
  ]);
  return validated;
}

/**
 * Load state with instant-first strategy:
 *   1. Return local cache immediately if available (fast first paint).
 *   2. Fetch sync in background; call onSyncReady(state, meta) when resolved.
 *
 * @param {function(AppState): void} onLocalReady  — called immediately with cached data (or empty)
 * @param {function(AppState, SyncMeta|null): void} onSyncReady   — called when sync resolves
 */
async function init(onLocalReady, onSyncReady) {
  const local = await readLocal();
  onLocalReady(local ?? { version: SCHEMA_VERSION, groups: [], shortcuts: [] });

  const { state: synced, meta } = await readSync();
  if (synced) {
    // Sync wins as source of truth; update local cache to match
    await new Promise(resolve =>
      chrome.storage.local.set({ [STORAGE_KEY]: synced }, resolve)
    );
    onSyncReady(synced, meta);
  } else if (local) {
    // No sync data yet; push local up to sync (first-time setup on new device)
    // Write without provenance (will be overwritten by next proper persist)
    await new Promise(resolve =>
      chrome.storage.sync.set({ [STORAGE_KEY]: local }, resolve)
    );
    onSyncReady(local, null);
  } else {
    onSyncReady({ version: SCHEMA_VERSION, groups: [], shortcuts: [] }, null);
  }
}

/**
 * Subscribe to live sync changes (e.g. another device wrote while this tab is open).
 * Callback receives (validatedState, syncMeta).
 * @param {function(AppState, SyncMeta|null): void} callback
 */
function onChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[STORAGE_KEY]) {
      const newVal = changes[STORAGE_KEY].newValue;
      if (newVal) {
        const meta = newVal.__sync ?? null;
        const state = validate(newVal);
        // Mirror to local cache (clean state, no envelope)
        chrome.storage.local.set({ [STORAGE_KEY]: state });
        callback(state, meta);
      }
    }
  });
}

/**
 * Debounce a function so it fires `ms` after the last call.
 * Returns a promise that resolves when the debounced function completes.
 * @param {function(...any): Promise<void>} fn
 * @param {number} ms
 * @returns {{ (...args: any[]): Promise<void>, cancel: () => void, flush: (...args: any[]) => Promise<void> }}
 */
function debounce(fn, ms) {
  let timer = null;
  let lastArgs = null;
  let pendingPromise = null;
  let pendingResolve = null;
  let pendingReject = null;

  const debounced = (...args) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);

    // Create a new promise for this debounced call
    pendingPromise = new Promise((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;
    });

    timer = setTimeout(async () => {
      timer = null;
      try {
        await fn(...lastArgs);
        pendingResolve?.();
      } catch (e) {
        pendingReject?.(e);
      } finally {
        pendingResolve = pendingReject = null;
        pendingPromise = null;
      }
    }, ms);

    return pendingPromise;
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      // Cancellation is not an error; resolve the pending promise
      pendingResolve?.();
      pendingResolve = pendingReject = null;
      pendingPromise = null;
    }
  };

  debounced.flush = (...args) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      // Resolve the pending promise from the superseded debounced call
      pendingResolve?.();
      pendingResolve = pendingReject = null;
      pendingPromise = null;
    }
    lastArgs = args.length ? args : lastArgs;
    if (!lastArgs) return Promise.resolve();
    return fn(...lastArgs);
  };

  return debounced;
}

/**
 * Load or create the stable writer ID for this install.
 * @returns {Promise<string>}
 */
async function getOrCreateWriterId() {
  return new Promise(resolve => {
    chrome.storage.local.get(WRITER_ID_KEY, result => {
      let id = result[WRITER_ID_KEY];
      if (!id) {
        id = crypto.randomUUID();
        chrome.storage.local.set({ [WRITER_ID_KEY]: id });
      }
      resolve(id);
    });
  });
}

/**
 * Create a sync orchestrator that rate-limits writes to Chrome Sync
 * and ignores chrome.storage.onChanged echoes of our own writes.
 *
 * Features:
 *   - Per-install writerId + monotonic revision for provenance.
 *   - Serialized write queue: local writes and remote reconciliations
 *     execute in order; remote updates invalidate pending local writes.
 *   - Echo suppression by (writerId, revision) — not content equality.
 *   - flush() for lifecycle boundaries; errors propagate to callers.
 *
 * @param {{ debounceMs?: number, historyLimit?: number, writerId?: string }} [options]
 * @returns {Promise<{ persist: (state: AppState) => Promise<void>, onRemote: (state: AppState, meta: SyncMeta|null) => boolean, flush: () => Promise<void> }>}
 */
async function createSyncer({ debounceMs = 400, historyLimit = 10, writerId } = {}) {
  // Writer identity (loaded once, or use provided for testing)
  const resolvedWriterId = writerId ?? await getOrCreateWriterId();

  // State
  let localRevision = 0;
  // Local writes whose revision is at or below this floor were superseded by a
  // remote update (remote wins). Writes scheduled after the remote are unaffected.
  let remoteRevisionFloor = 0;
  // Whether a local write is currently executing on the wire. Only then does a
  // remote update need to be re-asserted after the (potentially stale) write.
  let writeInFlight = false;
  const acknowledgedRevisions = new Set(); // revisions we've successfully written to sync
  let latestRemoteState = null; // most recent remote state that arrived mid-write
  let latestRemoteMeta = null;

  // Serialized write queue
  let writeChain = Promise.resolve();

  function enqueueWrite(jobFn) {
    const jobPromise = writeChain.then(jobFn);
    // Chain continues even if job fails (errors handled by caller via returned promise)
    writeChain = jobPromise.catch(() => {});
    return jobPromise;
  }

  // Debounced local write
  let debounceTimer = null;
  let pendingDebouncedState = null;
  let pendingDebouncedRevision = null;
  let pendingDebouncedResolve = null;
  let pendingDebouncedReject = null;

  function scheduleDebouncedSave(state, revision) {
    pendingDebouncedState = state;
    pendingDebouncedRevision = revision;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      // The previously scheduled write is superseded before it ever ran —
      // settle its caller's promise instead of leaving it pending forever.
      pendingDebouncedResolve?.();
    }

    const flushPromise = new Promise((resolve, reject) => {
      pendingDebouncedResolve = resolve;
      pendingDebouncedReject = reject;
    });

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const resolve = pendingDebouncedResolve;
      const reject = pendingDebouncedReject;
      const job = flushDebouncedSave();
      if (reject) {
        job.then(resolve, reject);
      } else {
        job.then(resolve).catch(() => {}); // detached settle — swallow to avoid unhandled rejection
      }
      pendingDebouncedResolve = pendingDebouncedReject = null;
    }, debounceMs);

    return flushPromise;
  }

  function cancelDebouncedSave() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      pendingDebouncedState = null;
      pendingDebouncedRevision = null;
      pendingDebouncedResolve?.(); // cancellation is not an error
      pendingDebouncedResolve = pendingDebouncedReject = null;
    }
  }

  async function flushDebouncedSave() {
    const state = pendingDebouncedState;
    const revision = pendingDebouncedRevision;
    pendingDebouncedState = null;
    pendingDebouncedRevision = null;

    if (!state || revision === undefined) return;

    return enqueueWrite(async () => {
      writeInFlight = true;
      try {
        // Invalidation: superseded by a newer local write?
        if (revision !== localRevision) return;
        // Invalidation: a remote was applied after this write was queued?
        if (revision <= remoteRevisionFloor) return;

        // Sync stores the envelope { __sync } so echoes can be attributed to us.
        await saveAll(state, { writerId: resolvedWriterId, revision });
        acknowledgedRevisions.add(revision);
        // Prune old acknowledged revisions
        if (acknowledgedRevisions.size > historyLimit) {
          const minRev = Math.min(...acknowledgedRevisions);
          acknowledgedRevisions.delete(minRev);
        }
      } finally {
        writeInFlight = false;
        // A remote arrived while this write was executing — the write may have
        // clobbered sync, so re-assert the remote (with its own provenance).
        if (latestRemoteState) {
          const remoteState = latestRemoteState;
          const remoteMeta = latestRemoteMeta;
          latestRemoteState = null;
          latestRemoteMeta = null;
          await reconcileRemote(remoteState, remoteMeta);
        }
      }
    });
  }

  async function reconcileRemote(state, meta) {
    // Re-assert remote state to sync (with its provenance) in case a stale
    // local write clobbered it. The remote already carries its provenance.
    await saveAll(state, meta);
  }

  return {
    /**
     * Schedule a debounced write to both layers.
     * Returns a promise that resolves when the write is acknowledged (or skipped).
     * @param {AppState} state
     * @returns {Promise<void>}
     */
    persist(state) {
      localRevision++;
      const revision = localRevision;
      return scheduleDebouncedSave(state, revision);
    },

    /**
     * Decide whether an incoming sync state should be applied.
     * Returns false for echoes of our own acknowledged writes; otherwise
     * cancels pending local write, records remote as latest, and returns true.
     * @param {AppState} state
     * @param {SyncMeta|null} meta
     * @returns {boolean}
     */
onRemote(state, meta) {
      // Echo check: our writerId + acknowledged revision?
      if (meta && meta.writerId === resolvedWriterId && acknowledgedRevisions.has(meta.revision)) {
        return false;
      }

      // Remote wins — any local write queued before this point is stale.
      remoteRevisionFloor = localRevision;
      cancelDebouncedSave(); // cancel any pending local write

      // If a local write is mid-flight it may have clobbered sync; hold the
      // remote so that write's completion re-asserts it (see flushDebouncedSave).
      // An idle device must NOT latch the remote — later local edits are valid writes.
      if (writeInFlight) {
        latestRemoteState = state;
        latestRemoteMeta = meta;
      }
      return true;
    },

    /**
     * Flush any pending debounced write and wait for the write queue to drain.
     * @returns {Promise<void>}
     */
    async flush() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
        // Resolve the pending persist promise since we're flushing it manually
        pendingDebouncedResolve?.();
        pendingDebouncedResolve = pendingDebouncedReject = null;
        await flushDebouncedSave();
      }
      await writeChain;
    },
  };
}

// ---------------------------------------------------------------------------
// Background image — stored in local-only to avoid sync quota limits
// ---------------------------------------------------------------------------

/**
 * Save a background image data URL to local storage.
 * @param {string} dataUrl
 * @returns {Promise<void>}
 */
async function saveBackground(dataUrl) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [BACKGROUND_KEY]: dataUrl }, resolve);
  });
}

/**
 * Read the background image from local storage.
 * @returns {Promise<string|null>}
 */
async function readBackground() {
  return new Promise(resolve => {
    chrome.storage.local.get(BACKGROUND_KEY, result => {
      resolve(result[BACKGROUND_KEY] ?? null);
    });
  });
}

/**
 * Remove the background image from local storage.
 * @returns {Promise<void>}
 */
async function clearBackground() {
  return new Promise(resolve => {
    chrome.storage.local.remove(BACKGROUND_KEY, resolve);
  });
}

// ---------------------------------------------------------------------------
// Background image size — stored in local-only
// ---------------------------------------------------------------------------

/**
 * Save the background image size setting to local storage.
 * @param {'cover'|'contain'|'auto'} size
 * @returns {Promise<void>}
 */
async function saveBackgroundSize(size) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [BACKGROUND_SIZE_KEY]: size }, resolve);
  });
}

/**
 * Read the background image size setting from local storage.
 * @returns {Promise<'cover'|'contain'|'auto'>}
 */
async function readBackgroundSize() {
  return new Promise(resolve => {
    chrome.storage.local.get(BACKGROUND_SIZE_KEY, result => {
      const size = result[BACKGROUND_SIZE_KEY];
      resolve(size === 'contain' || size === 'auto' ? size : 'cover');
    });
  });
}

export { init, saveAll, onChange, newId, validate, debounce, createSyncer, saveBackground, readBackground, clearBackground, saveBackgroundSize, readBackgroundSize };