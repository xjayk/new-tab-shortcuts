import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage before importing the module
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

// Re-import fresh for each test to get clean module state
beforeEach(() => {
  vi.clearAllMocks();
});

describe('validate', () => {
  it('returns a valid AppState for valid input', async () => {
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
  });

  it('returns empty state for null input', async () => {
    const { validate } = await import('../storage.js');
    const result = validate(null);
    expect(result.groups).toEqual([]);
  });

  it('returns empty state for non-object input', async () => {
    const { validate } = await import('../storage.js');
    expect(validate('string').groups).toEqual([]);
    expect(validate(42).groups).toEqual([]);
  });

  it('returns empty state when groups is not an array', async () => {
    const { validate } = await import('../storage.js');
    expect(validate({ version: 1, groups: 'bad' }).groups).toEqual([]);
  });

  it('filters out malformed shortcuts', async () => {
    const { validate } = await import('../storage.js');
    const input = {
      version: 1,
      groups: [
        {
          id: 'g1', name: 'Test',
          shortcuts: [
            { id: 's1', name: 'Valid', url: 'https://valid.com' },
            { id: 's2', name: 'No URL' },
            null,
            { name: 'No id', url: 'https://noid.com' },
          ],
        },
      ],
    };
    const result = validate(input);
    expect(result.groups[0].shortcuts).toHaveLength(2);
  });
});

describe('newId', () => {
  it('returns a string', async () => {
    const { newId } = await import('../storage.js');
    expect(typeof newId()).toBe('string');
  });

  it('returns unique values', async () => {
    const { newId } = await import('../storage.js');
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });

  it('returns 8-character strings', async () => {
    const { newId } = await import('../storage.js');
    expect(newId()).toHaveLength(8);
  });
});

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

  it('readBackground returns data URL when one is stored', async () => {
    const { readBackground } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ newtab_background: 'data:image/png;base64,abc' }));
    const result = await readBackground();
    expect(result).toBe('data:image/png;base64,abc');
  });

  it('readBackground returns null when no background stored', async () => {
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

  it('readBackgroundSize defaults to cover when not stored', async () => {
    const { readBackgroundSize } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({}));
    const result = await readBackgroundSize();
    expect(result).toBe('cover');
  });

  it('readBackgroundSize returns stored size', async () => {
    const { readBackgroundSize } = await import('../storage.js');
    chrome.storage.local.get.mockImplementation((key, cb) => cb({ newtab_background_size: 'contain' }));
    const result = await readBackgroundSize();
    expect(result).toBe('contain');
  });
});
