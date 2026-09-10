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
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({
      groups: expect.arrayContaining([expect.objectContaining({ id: 'g2' })]),
    }));
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

    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({
      groups: expect.arrayContaining([expect.objectContaining({ id: 'g1' })]),
    }));
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

    expect(onSync).toHaveBeenCalledWith({ version: 1, groups: [], shortcuts: [] });
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

  it('calls callback with validated state on sync changes', async () => {
    const { onChange } = await import('../storage.js');
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    const callback = vi.fn();
    onChange(callback);

    // Simulate a remote sync write
    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    const newState = { version: 1, groups: [{ id: 'g99', name: 'Remote', shortcuts: [] }], shortcuts: [] };
    listener({ newtab_data: { newValue: newState } }, 'sync');

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      groups: expect.arrayContaining([expect.objectContaining({ id: 'g99' })]),
    }));
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
// createSyncer — self-echo guard + debounced persist
// ---------------------------------------------------------------------------

describe('createSyncer', () => {
  const stateA = { version: 1, groups: [{ id: 'g-a', name: 'A', shortcuts: [] }], shortcuts: [] };
  const stateB = { version: 1, groups: [{ id: 'g-b', name: 'B', shortcuts: [] }], shortcuts: [] };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('persist schedules a debounced saveAll to both layers', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = createSyncer({ debounceMs: 100 });

    syncer.persist(stateA);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });

  it('onRemote returns false for an echo of a persisted state', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = createSyncer({ debounceMs: 100 });

    syncer.persist(stateA);
    vi.advanceTimersByTime(100);
    expect(syncer.onRemote(stateA)).toBe(false);
  });

  it('onRemote returns true for a remote state not in history', async () => {
    const { createSyncer } = await import('../storage.js');
    const syncer = createSyncer();

    syncer.persist(stateA);
    expect(syncer.onRemote(stateB)).toBe(true);
  });

  it('onRemote cancels the pending self-write when remote state wins', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = createSyncer({ debounceMs: 100 });

    syncer.persist(stateA);
    expect(syncer.onRemote(stateB)).toBe(true);

    vi.advanceTimersByTime(200);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('applies a remote state that was superseded before its local write ran', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = createSyncer({ debounceMs: 100 });

    syncer.persist(stateA);
    syncer.persist(stateB); // stateA is never written because the save is debounced

    expect(syncer.onRemote(stateA)).toBe(true);

    vi.advanceTimersByTime(200);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
  
  it('history is bounded and evicts the oldest entry beyond the limit', async () => {
    const { createSyncer } = await import('../storage.js');
    mockSetsOk();
    const syncer = createSyncer({ debounceMs: 100, historyLimit: 2 });
    const states = Array.from({ length: 3 }, (_, i) => ({
      version: 1,
      groups: [{ id: `g-${i}`, name: `S${i}`, shortcuts: [] }],
      shortcuts: [],
    }));

    syncer.persist(states[0]);
    vi.advanceTimersByTime(100);
    syncer.persist(states[1]);
    vi.advanceTimersByTime(100);
    syncer.persist(states[2]);
    vi.advanceTimersByTime(100);

    expect(syncer.onRemote(states[1])).toBe(false); // still in history
    expect(syncer.onRemote(states[0])).toBe(true);  // oldest evicted → no longer suppressed
  });

  it('full round trip: suppresses the echo of our own write (no infinite loop)', async () => {
    const { createSyncer, onChange } = await import('../storage.js');
    mockSetsOk();
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    const syncer = createSyncer({ debounceMs: 100 });
    let applied = null;
    onChange(syncState => {
      if (!syncer.onRemote(syncState)) return;
      applied = syncState;
    });

    syncer.persist(stateA);
    vi.advanceTimersByTime(100); // debounced saveAll fires → writes local + sync

    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ newtab_data: { newValue: stateA } }, 'sync'); // echo of our own write

    expect(applied).toBeNull(); // self-echo must not be applied
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1); // no re-save → no loop
  });

  it('full round trip: applies a genuinely remote state from onChange', async () => {
    const { createSyncer, onChange } = await import('../storage.js');
    mockSetsOk();
    chrome.storage.local.set.mockImplementation((obj, cb) => cb && cb());

    const syncer = createSyncer({ debounceMs: 100 });
    let applied = null;
    onChange(syncState => {
      if (!syncer.onRemote(syncState)) return;
      applied = syncState;
    });

    syncer.persist(stateA);
    vi.advanceTimersByTime(100);

    const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];
    listener({ newtab_data: { newValue: stateB } }, 'sync');

    expect(applied).toEqual(stateB);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1); // no extra writes
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
