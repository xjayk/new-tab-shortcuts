import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.storage before importing the module
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
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
