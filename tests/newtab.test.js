import { describe, it, expect, vi } from 'vitest';

// newtab.js only touches the DOM at boot (inside DOMContentLoaded), so a
// minimal document stub (set before import, like the chrome stub in
// storage.test.js) lets us unit-test its pure exports in Node without
// mounting a browser or the extension runtime.
globalThis.document = {
  addEventListener: vi.fn(),
};

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((key, cb) => cb({})),
      set: vi.fn((obj, cb) => cb && cb()),
      remove: vi.fn((key, cb) => cb && cb()),
    },
    sync: {
      get: vi.fn((key, cb) => cb({})),
      set: vi.fn((obj, cb) => cb && cb()),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
};

const { moveItemInList } = await import('../newtab.js');

// ---------------------------------------------------------------------------
// moveItemInList — the single primitive behind shortcut reordering
// ---------------------------------------------------------------------------

describe('moveItemInList', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('moves an item left', () => {
    expect(moveItemInList(items, 2, 'left').map(x => x.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves an item right', () => {
    expect(moveItemInList(items, 1, 'right').map(x => x.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('does not move the first item left (boundary guard)', () => {
    expect(moveItemInList(items, 0, 'left').map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not move the last item right (boundary guard)', () => {
    expect(moveItemInList(items, 3, 'right').map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is immutable — returns a new array without mutating the input', () => {
    const originalIds = items.map(x => x.id);
    const result = moveItemInList(items, 1, 'left');
    expect(result).not.toBe(items);
    expect(result).toEqual([{ id: 'b' }, { id: 'a' }, { id: 'c' }, { id: 'd' }]);
    expect(items.map(x => x.id)).toEqual(originalIds);
    // Out-of-bounds path returns the same array reference (no-op)
    const noop = moveItemInList(items, 0, 'left');
    expect(noop).toBe(items);
  });

  it('preserves every element across repeated moves (no duplicates or losses)', () => {
    let list = items.map(x => ({ ...x }));
    for (let i = 0; i < 5; i++) list = moveItemInList(list, 1, 'right');
    for (let i = 0; i < 8; i++) list = moveItemInList(list, 2, 'left');
    for (let i = 0; i < 3; i++) list = moveItemInList(list, 0, 'left');

    const ids = list.map(x => x.id);
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(ids).size).toBe(4);
  });

  it('handles a single-item list (no move possible)', () => {
    const single = [{ id: 'solo' }];
    expect(moveItemInList(single, 0, 'left')).toBe(single);
    expect(moveItemInList(single, 0, 'right')).toBe(single);
  });

  it('returns the list unchanged for an unknown index', () => {
    expect(moveItemInList(items, 99, 'left')).toBe(items);
    expect(moveItemInList(items, -1, 'right')).toBe(items);
  });
});