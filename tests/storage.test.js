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
