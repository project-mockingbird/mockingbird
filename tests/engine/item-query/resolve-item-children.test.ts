import { describe, it, expect } from 'vitest';
import { resolveItemChildren } from '../../../src/engine/item-query/index.js';
import { makeItem, buildEngine } from '../layout/_helpers.js';

describe('resolveItemChildren - Sitecore-native ordering (0.4.0.11)', () => {
  // Shared comparator via `compareSitecoreSiblings`: `__Sortorder`
  // ascending, case-insensitive name tiebreak. Before 0.4.0.11 this site
  // used a local decorate-sort-undecorate pattern with the same semantics;
  // migration to the shared helper drops the decorator without changing
  // output for any existing test input.

  it('all-equal __Sortorder siblings → alphabetical emission', () => {
    const parent = makeItem({ id: 'parent', path: '/root' });
    const c1 = makeItem({ id: 'c1', path: '/root/pathology', parent: 'parent' });
    const c2 = makeItem({ id: 'c2', path: '/root/flowsheet', parent: 'parent' });
    const c3 = makeItem({ id: 'c3', path: '/root/lab', parent: 'parent' });
    const engine = buildEngine([parent, c1, c2, c3]);
    const parentNode = engine.getItemById('parent');
    if (!parentNode) throw new Error('fixture failure');
    const result = resolveItemChildren(engine, parentNode).map(n => n.item.path.split('/').pop());
    expect(result).toEqual(['flowsheet', 'lab', 'pathology']);
  });
});
