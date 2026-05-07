import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  pascalizeTemplateName,
  resolveItemByPath,
  readItemFieldByHint,
  resolveItemChildren,
  collectSchemaCatalog,
} from '../../src/engine/item-query/index.js';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

describe('pascalizeTemplateName', () => {
  it('converts "Root Menu Item" → "RootMenuItem"', () => {
    expect(pascalizeTemplateName('Root Menu Item')).toBe('RootMenuItem');
  });

  it('preserves an already-pascal name', () => {
    expect(pascalizeTemplateName('ContentPage')).toBe('ContentPage');
  });

  it('strips non-alphanumerics', () => {
    expect(pascalizeTemplateName('Menu Link-List')).toBe('MenuLinkList');
  });

  it('returns ContentItem for empty input', () => {
    expect(pascalizeTemplateName('')).toBe('ContentItem');
    expect(pascalizeTemplateName('  ')).toBe('ContentItem');
  });
});

describe('resolveItemByPath', () => {
  it('returns the item when path exists', () => {
    const item = makeItem({ id: 'aaa', path: '/sitecore/content/site/Home' });
    const engine = buildEngine([item]);
    const result = resolveItemByPath(engine, '/sitecore/content/site/Home');
    expect(result?.id).toBe('aaa');
  });

  it('returns null when the path does not resolve', () => {
    const engine = buildEngine([]);
    expect(resolveItemByPath(engine, '/sitecore/content/site/Missing')).toBeNull();
  });

  it('resolves an item with spaces in its name via the dashed URL form', () => {
    // The consuming Next.js app routes URLs like `/.../faq-item-01` even
    // though the on-disk item is named `Faq Item 01`. The tree-level URL-
    // safe alias index makes this work without per-call retry logic in
    // the resolver.
    const item = makeItem({
      id: 'faq01',
      path: '/sitecore/content/site/Home/resources/faqs/general/Faq Item 01',
    });
    const engine = buildEngine([item]);
    const result = resolveItemByPath(
      engine,
      '/sitecore/content/tenant/site/Home/resources/faqs/general/Faq-Item-01'
        .replace('tenant/site/', 'site/'),
    );
    expect(result?.id).toBe('faq01');
  });
});

describe('readItemFieldByHint', () => {
  it('reads a shared field value by hint', () => {
    const item = makeItem({
      id: 'aaa',
      path: '/sitecore/content/site/Home',
      sharedFields: [{ id: 'field-id', hint: 'Title', value: 'Welcome Home' }],
    });
    const result = readItemFieldByHint(item, 'Title');
    expect(result?.value).toBe('Welcome Home');
  });

  it('reads a versioned field value by hint (latest version, en)', () => {
    const item = makeItem({
      id: 'aaa',
      path: '/sitecore/content/site/Home',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: 'x', hint: 'Body', value: 'hello' }],
        }],
      }],
    });
    expect(readItemFieldByHint(item, 'Body')?.value).toBe('hello');
  });

  it('is case-insensitive on hint', () => {
    const item = makeItem({
      id: 'aaa',
      path: '/p',
      sharedFields: [{ id: 'f', hint: 'MenuItemText', value: 'click' }],
    });
    expect(readItemFieldByHint(item, 'menuItemText')?.value).toBe('click');
    expect(readItemFieldByHint(item, 'menuitemtext')?.value).toBe('click');
  });

  it('returns null when the hint is not found', () => {
    const item = makeItem({ id: 'a', path: '/p' });
    expect(readItemFieldByHint(item, 'Missing')).toBeNull();
  });
});

describe('resolveItemChildren', () => {
  it('returns all direct children when no filter is passed', () => {
    const parent = makeItem({ id: 'p', path: '/p' });
    const a = makeItem({ id: 'a', parent: 'p', path: '/p/a', template: 't1' });
    const b = makeItem({ id: 'b', parent: 'p', path: '/p/b', template: 't2' });
    const engine = buildEngine([parent, a, b]);
    const node = engine.getItemById('p')!;
    const children = resolveItemChildren(engine, node);
    expect(children.map(c => c.item.id).sort()).toEqual(['a', 'b']);
  });

  it('filters by includeTemplateIDs (case-insensitive)', () => {
    const parent = makeItem({ id: 'p', path: '/p' });
    const a = makeItem({ id: 'a', parent: 'p', path: '/p/a', template: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' });
    const b = makeItem({ id: 'b', parent: 'p', path: '/p/b', template: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    const engine = buildEngine([parent, a, b]);
    const node = engine.getItemById('p')!;
    const filtered = resolveItemChildren(engine, node, ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']);
    expect(filtered.map(c => c.item.id)).toEqual(['a']);
  });
});

describe('collectSchemaCatalog', () => {
  it('collects pascalized type names for every distinct template in the tree', () => {
    const tmplA = makeItem({ id: 'tmpl-a', path: '/sitecore/templates/site/Root Menu Item' });
    const tmplB = makeItem({ id: 'tmpl-b', path: '/sitecore/templates/site/Menu Column' });
    const it1 = makeItem({ id: 'i1', path: '/content/1', template: 'tmpl-a' });
    const it2 = makeItem({ id: 'i2', path: '/content/2', template: 'tmpl-b' });
    const engine = buildEngine([tmplA, tmplB, it1, it2]);
    const catalog = collectSchemaCatalog(engine);
    expect(catalog.typeNames).toContain('RootMenuItem');
    expect(catalog.typeNames).toContain('MenuColumn');
    expect(catalog.typeNames).toContain('ContentItem'); // always included as fallback
  });

  it('collects non-internal field hints across all items', () => {
    const it = makeItem({
      id: 'i',
      path: '/p',
      sharedFields: [
        { id: 'f1', hint: 'MenuItemText', value: 'x' },
        { id: 'f2', hint: '__Created', value: 'skip' },
      ],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: 'f3', hint: 'Body', value: 'y' }],
        }],
      }],
    });
    const catalog = collectSchemaCatalog(buildEngine([it]));
    expect(catalog.fieldHints).toContain('MenuItemText');
    expect(catalog.fieldHints).toContain('Body');
    expect(catalog.fieldHints).not.toContain('__Created');
  });

  it('includes a hardcoded starter set of common Content SDK type names', () => {
    const catalog = collectSchemaCatalog(buildEngine([]));
    for (const expected of ['RootMenuItem', 'MenuColumn', 'MenuLinkList', 'ContentItem']) {
      expect(catalog.typeNames).toContain(expected);
    }
  });
});
