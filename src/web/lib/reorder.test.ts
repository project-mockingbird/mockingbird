import { describe, it, expect } from 'vitest';
import { rankBySortorder, reorderState, computeReorderedIds, reorderByDrop } from './reorder';
import type { TreeNode } from './types';

function node(id: string, name: string, sortOrder?: number, source: 'serialized' | 'registry' = 'serialized'): TreeNode {
  return { id, name, path: `/x/${name}`, template: 't', type: 'template', source, insertable: true, hasChildren: false, sortOrder } as TreeNode;
}

describe('reorder helpers', () => {
  const sibs = [node('a', 'Alpha', 100), node('b', 'Bravo', 200), node('c', 'Charlie', 300)];

  it('ranks by sortorder ascending, then name', () => {
    const ranked = rankBySortorder([node('c', 'Charlie', 300), node('a', 'Alpha', 100), node('b', 'Bravo', 200)]);
    expect(ranked.map(n => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('defaults missing sortorder to 100 and tiebreaks by name', () => {
    const ranked = rankBySortorder([node('z', 'Zebra'), node('a', 'Apple'), node('m', 'Mango')]);
    expect(ranked.map(n => n.id)).toEqual(['a', 'm', 'z']);
  });

  it('reorderState reports edges and registry gating', () => {
    expect(reorderState(sibs, 'a')).toMatchObject({ index: 0, canUp: false, canDown: true, canReorder: true });
    expect(reorderState(sibs, 'c')).toMatchObject({ index: 2, canUp: true, canDown: false });
    expect(reorderState([node('a', 'Alpha')], 'a').canReorder).toBe(false); // single child
    expect(reorderState([node('a', 'Alpha', 100), node('b', 'Bravo', 200, 'registry')], 'a').canReorder).toBe(false);
  });

  it('computeReorderedIds moves up/down/first/last', () => {
    expect(computeReorderedIds(sibs, 'c', 'up')).toEqual(['a', 'c', 'b']);
    expect(computeReorderedIds(sibs, 'a', 'down')).toEqual(['b', 'a', 'c']);
    expect(computeReorderedIds(sibs, 'c', 'first')).toEqual(['c', 'a', 'b']);
    expect(computeReorderedIds(sibs, 'a', 'last')).toEqual(['b', 'c', 'a']);
  });

  it('reorderByDrop inserts the dragged id before the target', () => {
    expect(reorderByDrop(sibs, 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(reorderByDrop(sibs, 'a', 'c')).toEqual(['b', 'a', 'c']);
  });
});
