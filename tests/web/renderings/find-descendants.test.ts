import { describe, it, expect } from 'vitest';
import { findDescendants } from '@/components/detail/field-editors/renderings/find-descendants';
import type { RenderingEntry } from '@/components/detail/field-editors/renderings/types';

function entry(uid: string, placeholder: string): RenderingEntry {
  return { uid, renderingId: 'rid', placeholder, params: {}, dataSource: '' };
}

describe('findDescendants', () => {
  it('returns empty array when no entries match the prefix', () => {
    const all = [entry('a', '/main'), entry('b', '/main')];
    expect(findDescendants(all[0], all, '/main/container-1')).toEqual([]);
  });

  it('returns direct children only (1 level deep)', () => {
    const parent = entry('p', '/main');
    const child = entry('c', '/main/container-1');
    const sibling = entry('s', '/main');
    const result = findDescendants(parent, [parent, child, sibling], '/main/container-1');
    expect(result).toEqual([child]);
  });

  it('returns nested descendants (2+ levels deep)', () => {
    const parent = entry('p', '/main');
    const child1 = entry('c1', '/main/container-1');
    const child2 = entry('c2', '/main/container-1/container-1-1');
    const child3 = entry('c3', '/main/container-1/container-1-1/container-deep');
    const result = findDescendants(parent, [parent, child1, child2, child3], '/main/container-1');
    expect(result.map(r => r.uid).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('does not match siblings whose placeholder happens to start with similar text', () => {
    const parent = entry('p', '/main');
    const sibling = entry('s', '/main/container-10');
    const child = entry('c', '/main/container-1/inner');
    const result = findDescendants(parent, [parent, sibling, child], '/main/container-1');
    expect(result.map(r => r.uid)).toEqual(['c']);
  });

  it('excludes the parent itself even if its placeholder equals exposedPath', () => {
    const parent = entry('p', '/main/container-1');
    const child = entry('c', '/main/container-1/inner');
    const result = findDescendants(parent, [parent, child], '/main/container-1');
    expect(result.map(r => r.uid)).toEqual(['c']);
  });
});
