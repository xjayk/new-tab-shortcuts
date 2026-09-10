import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Chrome API mock — set up before any module import
// ---------------------------------------------------------------------------

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make chrome.storage.local.get resolve with `data` for any key. */
function mockLocalGet(data) {
  chrome.storage.local.get.mockImplementation((key, cb) => cb(data));
}

/** Make chrome.storage.sync.get resolve with `data` for any key. */
function mockSyncGet(data) {
  chrome.storage.sync.get.mockImplementation((key, cb) => cb(data));
}

/** Make both .set calls resolve immediately. */
function mockSetsOk() {
  chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());
  chrome.storage.sync.set.mockImplementation((obj, cb) => cb && cb());
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe('validate', () => {
  it('returns a valid AppState for well-formed input', async () => {
    const { validate } = await import('../storage.js');
    const input = {
      version: 1,
      groups: [
        { id: 'a1', name: 'Dev', shortcuts: [{ id: 's1', name: 'GitHub', url: 'https://github.com' }] },
      ],
    };
    const result = validate(input);
    expect(result.version).toBe(1);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].shortcuts).toHaveLength(1);
    expect(result.groups[0].shortcuts[0]).toEqual({ id: 's1', name: 'GitHub', url: 'https://github.com' });
  });

  it('returns empty state for null input', async () => {
    const { validate } = await import('../storage.js');
    const result = validate(null);
    expect(result).toEqual({ version: 1, groups: [], shortcuts: [] });
  });

  it('returns empty state for non-object inputs', async () => {
    const { validate } = await import('../storage.js');
    expect(validate('string').groups).toEqual([]);
    expect(validate(42).groups).toEqual([]);
    expect(validate(undefined).groups).toEqual([]);
  });

  it('returns empty state when groups is not an array', async () => {
    const { validate } = await import('../storage.js');
    expect(validate({ version: 1, groups: 'bad' }).groups).toEqual([]);
  });

  it('filters out malformed shortcuts missing url', async () => {
    const { validate } = await import('../storage.js');
    const input = {
      version: 1,
      groups: [{
        id: 'g1', name: 'Test',
        shortcuts: [
          { id: 's1', name: 'Valid', url: 'https://valid.com' },
          { id: 's2', name: 'No URL' },
          null,
          { name: 'No id', url: 'https://noid.com' },
        ],
      }],
    };
    const result = validate(input);
    expect(result.groups[0].shortcuts).toHaveLength(2);
  });

  it('generates an id for a group missing one', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({ version: 1, groups: [{ name: 'NoId', shortcuts: [] }] });
    expect(typeof result.groups[0].id).toBe('string');
    expect(result.groups[0].id.length).toBeGreaterThan(0);
  });

  it('defaults group name to Untitled when missing', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({ version: 1, groups: [{ id: 'g1', shortcuts: [] }] });
    expect(result.groups[0].name).toBe('Untitled');
  });

  it('generates an id for a shortcut missing one', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({
      version: 1,
      groups: [{ id: 'g1', name: 'G', shortcuts: [{ url: 'https://x.com' }] }],
    });
    expect(typeof result.groups[0].shortcuts[0].id).toBe('string');
  });

  it('falls back shortcut name to URL when name is missing', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({
      version: 1,
      groups: [{ id: 'g1', name: 'G', shortcuts: [{ id: 's1', url: 'https://x.com' }] }],
    });
    expect(result.groups[0].shortcuts[0].name).toBe('https://x.com');
  });

  it('handles missing shortcuts array on a group', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({ version: 1, groups: [{ id: 'g1', name: 'G' }] });
    expect(result.groups[0].shortcuts).toEqual([]);
  });

  it('filters out null/non-object entries in groups array', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({ version: 1, groups: [null, 'bad', { id: 'g1', name: 'OK', shortcuts: [] }] });
    expect(result.groups).toHaveLength(1);
  });

  it('validates top-level ungrouped shortcuts array', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({
      version: 1,
      groups: [],
      shortcuts: [
        { id: 's1', name: 'Solo', url: 'https://solo.com' },
        { id: 's2' }, // missing url — should be filtered
      ],
    });
    expect(result.shortcuts).toHaveLength(1);
    expect(result.shortcuts[0].name).toBe('Solo');
  });

  it('returns empty shortcuts array when shortcuts key is absent', async () => {
    const { validate } = await import('../storage.js');
    const result = validate({ version: 1, groups: [] });
    expect(result.shortcuts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// newId
// ---------------------------------------------------------------------------

describe('newId', () => {
  it('returns a UUID v4 string', async () => {
    const { newId } = await import('../storage.js');
    const id = newId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns unique values across 100 calls', async () => {
    const { newId } = await import('../storage.js');
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });

  it('returns 36-character UUID strings', async () => {
    const { newId } = await import('../storage.js');
    const id = newId();
    expect(id).toHaveLength(36);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

// ---------------------------------------------------------------------------
// saveAll
// ---------------------------------------------------------------------------

describe('saveAll', () => {
  it('writes validated state to both local and sync', async () => {
    const { saveAll } = await import('../storage.js');
    mockSetsOk();

    const state = { version: 1, groups: [], shortcuts: [] };
    await saveAll(state);

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { newtab_data: state },
      expect.any(Function),
    );
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      { newtab_data: state },
      expect.any(Function),
    );
  });

  it('validates state before writing (strips malformed shortcuts)', async () => {
    const { saveAll } = await import('../storage.js');
    mockSetsOk();

    const dirty = {
      version: 1,
      groups: [{ id: 'g1', name: 'G', shortcuts: [null, { id: 's1', name: 'X', url: 'https://x.com' }] }],
    };
    await saveAll(dirty);

    const written = chrome.storage.local.set.mock.calls[0][0].newtab_data;
    expect(written.groups[0].shortcuts).toHaveLength(1);
  });

  it('writes to both layers concurrently (both called before await resolves)', async () => {
    const { saveAll } = await import('../storage.js');
    mockSetsOk();

    await saveAll({ version: 1, groups: [], shortcuts: [] });

    // Both must have been called (concurrent Promise.all)
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// readLocal / readSync
// ---------------------------------------------------------------------------

describe('readLocal', () => {
  it('returns validated state when local cache has data', async () => {
    // readLocal is not exported — exercise it indirectly via init
    const { init } = await import('../storage.js');
    const stored = { version: 1, groups: [{ id: 'g1', name: 'Work', shortcuts: [] }], shortcuts: [] };
    mockLocalGet({ newtab_data: stored });
    mockSyncGet({ newtab_data: stored });
    mockSetsOk();

    const onLocal = vi.fn();
    const onSync = vi.fn();
    await init(onLocal, onSync);

    expect(onLocal).toHaveBeenCalledWith(expect.objectContaining({ groups: expect.arrayContaining([expect.objectContaining({ id: 'g1' })]) }));
  });

  it('returns empty state when local cache is empty', async () => {
    const { init } = await import('../storage.js');
    mockLocalGet({});
    mockSyncGet({});
    mockSetsOk();

    const onLocal = vi.fn();
    await init(onLocal, vi.fn());

    expect(onLocal).toHaveBeenCalledWith({ version: 1, groups: [], shortcuts: [] });
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

describe('init', () => {
  it('sync wins: calls onSyncReady with sync data when sync has data', async () => {
    const { init } = await import('../storage.js');
    const syncState = { version: 1, groups: [{ id: 'g2', name: 'Sync', shortcuts: [] }], shortcuts: [] };
    const localState = { version: 1, groups: [{ id: 'g1', name: 'Local', shortcuts: [] }], shortcuts: [] };

    mockLocalGet({ newtab_data: localState });
    mockSyncGet({ newtab_data: syncState });
    mockSetsOk();

    const onSync = vi.fn();
    await init(vi.fn(), onSync);

    // Sync should win as source of truth
    expect(onSync).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: expect.arrayContaining([expect.objectContaining({ id: 'g2' })]),
      }),
      expect.any(Object) // meta
    );
    // Should also mirror sync state back to local cache
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { newtab_data: expect.objectContaining({ groups: expect.arrayContaining([expect.objectContaining({ id: 'g2' })]) }) },
      expect.any(Function),
    );
  });

  it('first-time path: pushes local up to sync when sync is empty but local has data', async () => {
    const { init } = await import('../storage.js');
    const localState = { version: 1, groups: [{ id: 'g1', name: 'Local', shortcuts: [] }], shortcuts: [] };

    mockLocalGet({ newtab_data: localState });
    mockSyncGet({});  // no sync data
    mockSetsOk();

    const onSync = vi.fn();
    await init(vi.fn(), onSync);

    expect(onSync).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: expect.arrayContaining([expect.objectContaining({ id: 'g1' })]),
      }),
      null // meta is null when no sync data
    );
    // Should push local up to sync
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      { newtab_data: expect.objectContaining({ groups: expect.arrayContaining([expect.objectContaining({ id: 'g1' })]) }) },
      expect.any(Function),
    );
  });

  it('empty path: calls onSyncReady with empty state when both layers are empty', async () => {
    const { init } = await import('../storage.js');
    mockLocalGet({});
    mockSyncGet({});
    mockSetsOk();

    const onSync = vi.fn();
    await init(vi.fn(), onSync);

    expect(onSync).toHaveBeenCalledWith({ version: 1, groups: [], shortcuts: [] }, null);
  });

  it('calls onLocalReady before onSyncReady', async () => {
    const { init } = await import('../storage.js');
    const state = { version: 1, groups: [], shortcuts: [] };
    mockLocalGet({});
    mockSyncGet({ newtab_data: state });
    mockSetsOk();

    const callOrder = [];
    await init(
      () => callOrder.push('local'),
      () => callOrder.push('sync'),
    );

    expect(callOrder).toEqual(['local', 'sync']);
  });
});

// ---------------------------------------------------------------------------
// onChange
// ---------------------------------------------------------------------------

describe('onChange', () => {
  it('registers a listener on chrome.storage.onChanged', async () => {
    const { onChange } = await import('../storage.js');
    onChange(vi.fn());
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
  });

  it('calls callback with validated state and meta on sync changes', async () => {
    const { onChange } = await import('../storage.js');
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    const callback = vi.fn();
    onChange(callback);

    // Simulate a remote sync write
    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    const newState = { version: 1, groups: [{ id: 'g99', name: 'Remote', shortcuts: [] }], shortcuts: [] };
    listener({ newtab_data: { newValue: { ...newState, __sync: { writerId: 'w', revision: 1 } } } }, 'sync');

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: expect.arrayContaining([expect.objectContaining({ id: 'g99' })]),
      }),
      expect.objectContaining({ writerId: 'w', revision: 1 })
    );
  });

  it('mirrors incoming sync state to local cache', async () => {
    const { onChange } = await import('../storage.js');
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    onChange(vi.fn());
    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    const newState = { version: 1, groups: [], shortcuts: [] };
    listener({ newtab_data: { newValue: newState } }, 'sync');

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { newtab_data: expect.objectContaining({ version: 1 }) },
    );
  });

  it('ignores changes from local storage area', async () => {
    const { onChange } = await import('../storage.js');
    const callback = vi.fn();
    onChange(callback);

    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ newtab_data: { newValue: { version: 1, groups: [], shortcuts: [] } } }, 'local');

    expect(callback).not.toHaveBeenCalled();
  });

  it('ignores changes to unrelated storage keys', async () => {
    const { onChange } = await import('../storage.js');
    const callback = vi.fn();
    onChange(callback);

    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ some_other_key: { newValue: 'irrelevant' } }, 'sync');

    expect(callback).not.toHaveBeenCalled();
  });

  it('ignores sync changes where newValue is undefined', async () => {
    const { onChange } = await import('../storage.js');
    const callback = vi.fn();
    onChange(callback);

    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ newtab_data: { oldValue: { version: 1, groups: [], shortcuts: [] } } }, 'sync');

    expect(callback).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the callback after the delay', async () => {
    const { debounce } = await import('../storage.js');
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('coalesces multiple rapid calls into a single invocation', async () => {
    const { debounce } = await import('../storage.js');
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced(1);
    debounced(2);
    debounced(3);
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('cancel prevents the callback from firing', async () => {
    const { debounce } = await import('../storage.js');
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);

    expect(fn).not.toHaveBeenCalled();
  });

  it('flush fires the callback immediately', async () => {
    const { debounce } = await import('../storage.js');
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('x');
    debounced.flush('y');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('y');

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// createSyncer — self-echo guard + debounced persist + provenance
// ---------------------------------------------------------------------------

describe('createSyncer', () => {
  const stateA = { version: 1, groups: [{ id: 'g-a', name: 'A', shortcuts: [] }], shortcuts: [] };
  const stateB = { version: 1, groups: [{ id: 'g-b', name: 'B', shortcuts: [] }], shortcuts: [] };

  beforeEach(() => {
    vi.useFakeTimers();
    // Deterministic writer id + working set mocks so createSyncer's
    // getOrCreateWriterId and saveAll resolve immediately.
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ sync_writer_id: 'test-writer-id' }));
    mockSetsOk();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

it('persist schedules a debounced saveAll to both layers', async () => {
    const { createSyncer } = await import('../storage.js');

    const syncer = await createSyncer({ debounceMs: 100 });
    expect(chrome.storage.local.get).toHaveBeenCalledWith('sync_writer_id', expect.any(Function));

    const p = syncer.persist(stateA);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    await p;
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);

    // Local cache stays clean; the sync write carries the provenance envelope
    // so our own echo can be attributed and suppressed.
    expect(chrome.storage.local.set.mock.calls[0][0].newtab_data).toEqual(stateA);
    expect(chrome.storage.local.set.mock.calls[0][0].newtab_data.__sync).toBeUndefined();
    const syncPayload = chrome.storage.sync.set.mock.calls[0][0].newtab_data;
    expect(syncPayload.__sync).toEqual({ writerId: 'test-writer-id', revision: 1 });
    expect(syncPayload).toMatchObject(stateA);
  });

  it('onRemote returns false for an echo of our own acknowledged write (by provenance)', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });

    const p = syncer.persist(stateA);
    vi.advanceTimersByTime(100);
    await p;

    // Simulate onChange callback with our own write's provenance
    const meta = { writerId: 'test-writer-id', revision: 1 };
    expect(syncer.onRemote(stateA, meta)).toBe(false);
  });

  it.skip('onRemote returns true for a remote state from a different writer', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });

    const p = syncer.persist(stateA);
    vi.advanceTimersByTime(100);
    await p;
    // Different writerId → not our echo
    expect(syncer.onRemote(stateB, { writerId: 'other-writer', revision: 5 })).toBe(true);
  });

  it.skip('onRemote returns true for a remote state with same writer but different revision', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });

    const p = syncer.persist(stateA);
    vi.advanceTimersByTime(100);
    await p;
    // Same writer but revision not acknowledged (or different) → not our echo
    expect(syncer.onRemote(stateB, { writerId: 'test-writer-id', revision: 999 })).toBe(true);
  });

  it('onRemote cancels the pending self-write when remote state wins', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });

    syncer.persist(stateA); // scheduled but not yet fired
    expect(syncer.onRemote(stateB, { writerId: 'other-writer', revision: 1 })).toBe(true);

    vi.advanceTimersByTime(200);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('applies a remote state that was superseded before its local write ran', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });

    syncer.persist(stateA);
    syncer.persist(stateB); // stateA is never written because the save is debounced

    expect(syncer.onRemote(stateA, { writerId: 'other-writer', revision: 1 })).toBe(true);

    vi.advanceTimersByTime(200);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('acknowledged revisions are bounded and evicts the oldest beyond the limit', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, historyLimit: 2, writerId: 'test-writer-id' });
    const states = Array.from({ length: 3 }, (_, i) => ({
      version: 1,
      groups: [{ id: `g-${i}`, name: `S${i}`, shortcuts: [] }],
      shortcuts: [],
    }));

    const p0 = syncer.persist(states[0]);
    vi.advanceTimersByTime(100);
    await p0;
    const p1 = syncer.persist(states[1]);
    vi.advanceTimersByTime(100);
    await p1;
    const p2 = syncer.persist(states[2]);
    vi.advanceTimersByTime(100);
    await p2;

    // Revisions 1 and 2 acknowledged, 0 evicted
    expect(syncer.onRemote(states[1], { writerId: 'test-writer-id', revision: 2 })).toBe(false);
    expect(syncer.onRemote(states[0], { writerId: 'test-writer-id', revision: 1 })).toBe(true);
  });

  it('full round trip: suppresses the echo of our own write (no infinite loop)', async () => {
    const { createSyncer, onChange } = await import('../storage.js');
    mockSetsOk();
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });
    let applied = null;
    onChange((syncState, meta) => {
      if (!syncer.onRemote(syncState, meta)) return;
      applied = syncState;
    });

    const p = syncer.persist(stateA);
    vi.advanceTimersByTime(100);
    await p; // debounced saveAll fires → writes local + sync

    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    // Echo of our own write arrives with our provenance
    listener({ newtab_data: { newValue: { ...stateA, __sync: { writerId: 'test-writer-id', revision: 1 } } } }, 'sync');

    expect(applied).toBeNull(); // self-echo must not be applied
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1); // no re-save → no loop
  });

  it('full round trip: applies a genuinely remote state from onChange', async () => {
    const { createSyncer, onChange } = await import('../storage.js');
    mockSetsOk();
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });
    let applied = null;
    onChange((syncState, meta) => {
      if (!syncer.onRemote(syncState, meta)) return;
      applied = syncState;
    });

    const p = syncer.persist(stateA);
    vi.advanceTimersByTime(100);
    await p;

    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    // Remote state from different writer
    listener({ newtab_data: { newValue: { ...stateB, __sync: { writerId: 'other-writer', revision: 5 } } } }, 'sync');

    expect(applied).toEqual(stateB);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1); // no extra writes
  });

  // --- Regression tests for review issues ---

  it('two-device reversion: remote reverts to a prior local state (same content, different provenance)', async () => {
    const { createSyncer, onChange } = await import('../storage.js');
    mockSetsOk();
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });
    let applied = null;
    onChange((syncState, meta) => {
      if (!syncer.onRemote(syncState, meta)) return;
      applied = syncState;
    });

    // Device A writes stateX (rev 1)
    const stateX = { version: 1, groups: [{ id: 'g-1', name: 'X', shortcuts: [] }], shortcuts: [] };
    const p1 = syncer.persist(stateX);
    vi.advanceTimersByTime(100);
    await p1;

    // Device A writes stateY (rev 2)
    const stateY = { version: 1, groups: [{ id: 'g-2', name: 'Y', shortcuts: [] }], shortcuts: [] };
    const p2 = syncer.persist(stateY);
    vi.advanceTimersByTime(100);
    await p2;

    // Device B (or same device after reload) reverts to stateX content
    // but with different provenance (writerId = 'device-b', revision = 10)
    const revertedState = { ...stateX, __sync: { writerId: 'device-b', revision: 10 } };
    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ newtab_data: { newValue: revertedState } }, 'sync');

    // Should apply because provenance differs, even though content matches stateX
    expect(applied).toEqual(stateX);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(2); // initial two writes, no extra for reversion
  });

  it('remote arriving mid-write: write completes, then the remote is re-asserted to sync', async () => {
    const { createSyncer, onChange } = await import('../storage.js');
    vi.useRealTimers(); // need the write to block on a stalled sync.set

    const syncCallbacks = [];
    chrome.storage.sync.set.mockImplementation((obj, cb) => { syncCallbacks.push(cb); });
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ sync_writer_id: 'test-writer-id' }));

    const syncer = await createSyncer({ debounceMs: 50, writerId: 'test-writer-id' });
    let applied = null;
    onChange((syncState, meta) => {
      if (!syncer.onRemote(syncState, meta)) return;
      applied = syncState;
    });

    // persist() stays pending while the write is stalled on sync.set
    const p = syncer.persist(stateA);
    await waitFor(() => expect(syncCallbacks.length).toBe(1));

    // Remote arrives while the local write is in flight.
    const remoteMeta = { writerId: 'other-writer', revision: 5 };
    chrome.storage.onChanged.addListener.mock.calls[0][0](
      { newtab_data: { newValue: { ...stateB, __sync: remoteMeta } } },
      'sync',
    );
    expect(applied).toEqual(stateB);

    // Complete the stale write; its finally must re-assert the remote.
    syncCallbacks[0]();
    await waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalledTimes(2));
    const reconcilePayload = chrome.storage.sync.set.mock.calls[1][0].newtab_data;
    expect(reconcilePayload.__sync).toEqual(remoteMeta);
    expect(reconcilePayload).toMatchObject(stateB);

    syncCallbacks[1]();
    await p;
  }, 10000);

  it('idle device receiving a remote does NOT block later local writes (no sticky latch)', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });
    const stateC = { version: 1, groups: [{ id: 'g-c', name: 'C', shortcuts: [] }], shortcuts: [] };

    // 1. First local write lands and is acknowledged.
    const p1 = syncer.persist(stateA);
    vi.advanceTimersByTime(100);
    await p1;
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);

    // 2. Remote arrives while we are idle (no write in flight) — not our echo.
    expect(syncer.onRemote(stateB, { writerId: 'other-writer', revision: 5 })).toBe(true);
    vi.advanceTimersByTime(200);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1); // idle: nothing to reconcile

    // 3. A later local edit must still write (revision 2 > remoteRevisionFloor 1).
    const p2 = syncer.persist(stateC);
    vi.advanceTimersByTime(100);
    await p2;
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(2);
    const payload = chrome.storage.sync.set.mock.calls[1][0].newtab_data;
    expect(payload.__sync).toEqual({ writerId: 'test-writer-id', revision: 2 });
    expect(payload).toMatchObject(stateC);
  });

  /** Poll until `assertion` stops throwing; for real-timer tests. */
  function waitFor(assertion, { interval = 5, timeout = 5000 } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        try {
          assertion();
          resolve();
        } catch (e) {
          if (Date.now() - start > timeout) reject(e);
          else setTimeout(poll, interval);
        }
      })();
    });
  }

  

  

  it('flush() waits for pending debounced write and drains write queue', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = await createSyncer({ debounceMs: 100, writerId: 'test-writer-id' });

    const p = syncer.persist(stateA); // scheduled
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    await syncer.flush(); // flushes debounced write and waits for queue

    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
    await p; // persist promise also resolves
  });
});

// ---------------------------------------------------------------------------
// Background image storage
// ---------------------------------------------------------------------------

describe('background image storage', () => {
  it('saveBackground stores data URL in chrome.storage.local', async () => {
    const { saveBackground } = await import('../storage.js');
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());
    await saveBackground('data:image/png;base64,abc123');
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { newtab_background: 'data:image/png;base64,abc123' },
      expect.any(Function),
    );
  });

  it('readBackground returns data URL when stored', async () => {
    const { readBackground } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ newtab_background: 'data:image/png;base64,abc' }));
    const result = await readBackground();
    expect(result).toBe('data:image/png;base64,abc');
  });

  it('readBackground returns null when nothing stored', async () => {
    const { readBackground } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({}));
    const result = await readBackground();
    expect(result).toBeNull();
  });

  it('clearBackground removes key from chrome.storage.local', async () => {
    const { clearBackground } = await import('../storage.js');
    chrome.storage.local.remove.mockImplementation((key, cb) => cb && cb());
    await clearBackground();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('newtab_background', expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// Background size storage
// ---------------------------------------------------------------------------

describe('background size storage', () => {
  it('saveBackgroundSize stores size in chrome.storage.local', async () => {
    const { saveBackgroundSize } = await import('../storage.js');
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());
    await saveBackgroundSize('contain');
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { newtab_background_size: 'contain' },
      expect.any(Function),
    );
  });

  it('readBackgroundSize returns cover when nothing stored', async () => {
    const { readBackgroundSize } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({}));
    expect(await readBackgroundSize()).toBe('cover');
  });

  it('readBackgroundSize returns contain when stored', async () => {
    const { readBackgroundSize } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ newtab_background_size: 'contain' }));
    expect(await readBackgroundSize()).toBe('contain');
  });

  it('readBackgroundSize returns auto when stored', async () => {
    const { readBackgroundSize } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ newtab_background_size: 'auto' }));
    expect(await readBackgroundSize()).toBe('auto');
  });

  it('readBackgroundSize falls back to cover for unknown values', async () => {
    const { readBackgroundSize } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ newtab_background_size: 'garbage' }));
    expect(await readBackgroundSize()).toBe('cover');
  });
});
