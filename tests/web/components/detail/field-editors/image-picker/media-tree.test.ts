import { describe, it, expect } from 'vitest';
import { buildMediaTree } from '@/components/detail/field-editors/image-picker/media-tree';
import type { DescendantItem } from '@/lib/types';

const items: DescendantItem[] = [
  { id: 'a', name: 'A', path: '/sitecore/media library/A', template: 't', hasChildren: true },
  { id: 'b', name: 'B', path: '/sitecore/media library/A/B', template: 't', hasChildren: false },
  { id: 'c', name: 'C', path: '/sitecore/media library/C', template: 't', hasChildren: false },
];

describe('buildMediaTree', () => {
  it('returns top-level roots (children of the requested rootPath)', () => {
    const tree = buildMediaTree(items, '/sitecore/media library');
    expect(tree.map(n => n.name)).toEqual(['A', 'C']);
  });

  it('nests grandchildren under their parent', () => {
    const tree = buildMediaTree(items, '/sitecore/media library');
    const a = tree.find(n => n.name === 'A');
    expect(a?.children).toHaveLength(1);
    expect(a?.children[0]?.name).toBe('B');
  });

  it('returns an empty array when no items are under rootPath', () => {
    expect(buildMediaTree([], '/sitecore/media library')).toEqual([]);
  });

  it('sorts siblings alphabetically by displayName then name', () => {
    const mixed: DescendantItem[] = [
      { id: 'z', name: 'Zebra', path: '/r/Zebra', template: 't', hasChildren: false },
      { id: 'a', name: 'Apple', path: '/r/Apple', template: 't', hasChildren: false },
      { id: 'm', name: 'Mango', displayName: 'Beta', path: '/r/Mango', template: 't', hasChildren: false },
    ];
    const tree = buildMediaTree(mixed, '/r');
    expect(tree.map(n => n.displayName ?? n.name)).toEqual(['Apple', 'Beta', 'Zebra']);
  });
});
