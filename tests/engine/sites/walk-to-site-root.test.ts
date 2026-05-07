import { describe, it, expect } from 'vitest';
import type { Engine } from '../../../src/engine/index.js';
import type { ItemNode, ScsItem } from '../../../src/engine/types.js';
import { walkToSiteRoot } from '../../../src/engine/sites/resolver.js';
import { BASE_SITE_ROOT_TEMPLATE_ID } from '../../../src/engine/constants.js';

const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';

function makeItem(overrides: Partial<ScsItem>): ScsItem {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    parent: '',
    template: STANDARD_TEMPLATE_ID,
    name: 'item',
    path: '/sitecore/content/item',
    sharedFields: [],
    languages: [],
    ...overrides,
  } as ScsItem;
}

function makeNode(item: ScsItem): ItemNode {
  return { item, children: new Map(), parentNode: null, filePath: '' } as ItemNode;
}

function makeEngine(items: ItemNode[]): Engine {
  const byId = new Map(items.map(n => [n.item.id, n]));
  return {
    getItemById: (id: string) => byId.get(id),
    getRegistryItem: (_id: string) => undefined,
    getRegistryChildren: (_id: string) => [],
  } as unknown as Engine;
}

describe('walkToSiteRoot', () => {
  it('returns the item itself when its template descends from _BaseSiteRoot', () => {
    const root = makeNode(makeItem({
      id: 'root', template: BASE_SITE_ROOT_TEMPLATE_ID, path: '/sitecore/content/tenant/site',
    }));
    const engine = makeEngine([root]);
    expect(walkToSiteRoot(engine, root)).toBe(root);
  });

  it('walks up through parents until it finds a _BaseSiteRoot ancestor', () => {
    const root = makeNode(makeItem({
      id: 'root', template: BASE_SITE_ROOT_TEMPLATE_ID, path: '/sitecore/content/tenant/site',
    }));
    const home = makeNode(makeItem({
      id: 'home', parent: 'root', path: '/sitecore/content/tenant/site/home',
    }));
    const engine = makeEngine([root, home]);
    expect(walkToSiteRoot(engine, home)).toBe(root);
  });

  it('returns null when no _BaseSiteRoot ancestor exists', () => {
    const root = makeNode(makeItem({ id: 'root', path: '/sitecore/content' }));
    const home = makeNode(makeItem({ id: 'home', parent: 'root', path: '/sitecore/content/home' }));
    const engine = makeEngine([root, home]);
    expect(walkToSiteRoot(engine, home)).toBeNull();
  });

  it('returns null when a parent reference points to a missing item', () => {
    const home = makeNode(makeItem({ id: 'home', parent: 'orphan-parent', path: '/sitecore/content/home' }));
    const engine = makeEngine([home]);
    expect(walkToSiteRoot(engine, home)).toBeNull();
  });
});
