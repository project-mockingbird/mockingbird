import { describe, it, expect } from 'vitest';
import {
  defaultComparer,
  logicalComparer,
  displayNameComparer,
  updatedComparer,
  createdComparer,
  reverseComparer,
} from '../../../src/engine/sorting/comparers.js';
import type { ItemSortKey } from '../../../src/engine/sorting/types.js';

function key(over: Partial<ItemSortKey> & { name: string }): ItemSortKey {
  return {
    id: over.id ?? `{${over.name.toUpperCase()}}`,
    name: over.name,
    sortOrder: over.sortOrder ?? 100,
    displayName: over.displayName ?? over.name,
    createdAt: over.createdAt ?? 0,
    updatedAt: over.updatedAt ?? 0,
  };
}

describe('defaultComparer', () => {
  it('sorts by sortOrder ascending', () => {
    const a = key({ name: 'A', sortOrder: 200 });
    const b = key({ name: 'B', sortOrder: 100 });
    expect([a, b].sort(defaultComparer).map(k => k.name)).toEqual(['B', 'A']);
  });

  it('breaks ties by name ascending (case-insensitive)', () => {
    const a = key({ name: 'banana', sortOrder: 100 });
    const b = key({ name: 'Apple', sortOrder: 100 });
    expect([a, b].sort(defaultComparer).map(k => k.name)).toEqual(['Apple', 'banana']);
  });

  it('puts underscore-prefixed items LAST when sortorder ties', () => {
    const a = key({ name: '_Underscore', sortOrder: 100 });
    const b = key({ name: 'Apple', sortOrder: 100 });
    const c = key({ name: 'Zebra', sortOrder: 100 });
    expect([a, b, c].sort(defaultComparer).map(k => k.name)).toEqual(['Apple', 'Zebra', '_Underscore']);
  });

  it('respects sortOrder over the underscore special case', () => {
    // Underscore item with low sortOrder still wins.
    const a = key({ name: '_Underscore', sortOrder: 1 });
    const b = key({ name: 'Apple', sortOrder: 100 });
    expect([a, b].sort(defaultComparer).map(k => k.name)).toEqual(['_Underscore', 'Apple']);
  });

  it('returns 0 for identical keys', () => {
    const a = key({ name: 'A', sortOrder: 100 });
    const b = key({ name: 'A', sortOrder: 100 });
    expect(defaultComparer(a, b)).toBe(0);
  });
});

describe('logicalComparer', () => {
  it('sorts by sortOrder ascending primary', () => {
    const a = key({ name: 'A', sortOrder: 999 });
    const b = key({ name: 'B', sortOrder: 1 });
    expect([a, b].sort(logicalComparer).map(k => k.name)).toEqual(['B', 'A']);
  });

  it('on sortorder tie, sorts numerically embedded in name (Foo2 < Foo10)', () => {
    const a = key({ name: 'Foo10' });
    const b = key({ name: 'Foo2' });
    expect([a, b].sort(logicalComparer).map(k => k.name)).toEqual(['Foo2', 'Foo10']);
  });

  it('is case-insensitive', () => {
    const a = key({ name: 'banana' });
    const b = key({ name: 'Apple' });
    expect([a, b].sort(logicalComparer).map(k => k.name)).toEqual(['Apple', 'banana']);
  });

  it('puts underscore-prefixed items LAST when sortorder ties', () => {
    const a = key({ name: '_Internal' });
    const b = key({ name: 'Foo2' });
    expect([a, b].sort(logicalComparer).map(k => k.name)).toEqual(['Foo2', '_Internal']);
  });
});

describe('displayNameComparer', () => {
  it('sorts by sortOrder ascending primary', () => {
    const a = key({ name: 'A', displayName: 'A', sortOrder: 200 });
    const b = key({ name: 'B', displayName: 'B', sortOrder: 100 });
    expect([a, b].sort(displayNameComparer).map(k => k.name)).toEqual(['B', 'A']);
  });

  it('on sortorder tie, sorts by displayName logical compare', () => {
    const a = key({ name: 'a-item-1', displayName: 'Foo10' });
    const b = key({ name: 'a-item-2', displayName: 'Foo2' });
    expect([a, b].sort(displayNameComparer).map(k => k.name)).toEqual(['a-item-2', 'a-item-1']);
  });

  it('falls back to name when displayName is empty (callers populate displayName=name)', () => {
    const a = key({ name: 'Bravo' });
    const b = key({ name: 'Alpha' });
    expect([a, b].sort(displayNameComparer).map(k => k.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('does NOT apply the underscore special case', () => {
    // DisplayNameComparer in Sitecore decompile does not have the underscore branch.
    const a = key({ name: '_X', displayName: '_X' });
    const b = key({ name: 'A', displayName: 'A' });
    // Underscore (95) sorts before letters in default Intl.Collator.
    expect([a, b].sort(displayNameComparer).map(k => k.name)).toEqual(['_X', 'A']);
  });
});

describe('updatedComparer', () => {
  it('sorts by sortOrder ascending primary', () => {
    const a = key({ name: 'A', updatedAt: 9999, sortOrder: 200 });
    const b = key({ name: 'B', updatedAt: 1, sortOrder: 100 });
    expect([a, b].sort(updatedComparer).map(k => k.name)).toEqual(['B', 'A']);
  });

  it('on sortorder tie, sorts most-recent-first (descending)', () => {
    const a = key({ name: 'Old', updatedAt: 1000 });
    const b = key({ name: 'New', updatedAt: 2000 });
    expect([a, b].sort(updatedComparer).map(k => k.name)).toEqual(['New', 'Old']);
  });

  it('puts items with updatedAt=0 last (missing __Updated)', () => {
    const a = key({ name: 'Missing', updatedAt: 0 });
    const b = key({ name: 'Set', updatedAt: 1000 });
    expect([a, b].sort(updatedComparer).map(k => k.name)).toEqual(['Set', 'Missing']);
  });
});

describe('createdComparer', () => {
  it('sorts by sortOrder ascending primary', () => {
    const a = key({ name: 'A', createdAt: 1, sortOrder: 200 });
    const b = key({ name: 'B', createdAt: 9999, sortOrder: 100 });
    expect([a, b].sort(createdComparer).map(k => k.name)).toEqual(['B', 'A']);
  });

  it('on sortorder tie, sorts oldest-first (ascending)', () => {
    const a = key({ name: 'New', createdAt: 2000 });
    const b = key({ name: 'Old', createdAt: 1000 });
    expect([a, b].sort(createdComparer).map(k => k.name)).toEqual(['Old', 'New']);
  });

  it('puts items with createdAt=0 first (missing __Created)', () => {
    const a = key({ name: 'Set', createdAt: 1000 });
    const b = key({ name: 'Missing', createdAt: 0 });
    expect([a, b].sort(createdComparer).map(k => k.name)).toEqual(['Missing', 'Set']);
  });
});

describe('reverseComparer', () => {
  it('sorts by sortOrder DESCENDING primary', () => {
    const a = key({ name: 'A', sortOrder: 200 });
    const b = key({ name: 'B', sortOrder: 100 });
    // Higher sortorder first.
    expect([a, b].sort(reverseComparer).map(k => k.name)).toEqual(['A', 'B']);
  });

  it('on sortorder tie, sorts logical-reverse on name', () => {
    const a = key({ name: 'Apple' });
    const b = key({ name: 'Banana' });
    expect([a, b].sort(reverseComparer).map(k => k.name)).toEqual(['Banana', 'Apple']);
  });

  it('puts underscore-prefixed items FIRST when sortorder ties', () => {
    const a = key({ name: 'Apple' });
    const b = key({ name: '_Internal' });
    expect([a, b].sort(reverseComparer).map(k => k.name)).toEqual(['_Internal', 'Apple']);
  });
});
