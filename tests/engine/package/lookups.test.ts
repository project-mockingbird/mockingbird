import { describe, it, expect } from 'vitest';
import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import { Registry } from '../../../src/engine/registry.js';
import type { ScsItem, RegistryData, RegistryItem } from '../../../src/engine/types.js';
import { resolveItemName, resolveTemplateName } from '../../../src/engine/package/lookups.js';

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[], registryItems?: RegistryItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as unknown as { tree: ItemTree }).tree = tree;
  if (registryItems && registryItems.length > 0) {
    const registry = new Registry();
    const registryData: RegistryData = {
      version: '1.0',
      source: 'test',
      extractedAt: new Date().toISOString(),
      items: registryItems,
    };
    (registry as unknown as { index(d: RegistryData): void }).index(registryData);
    (engine as unknown as { registry: Registry }).registry = registry;
  } else {
    (engine as unknown as { registry: Registry | null }).registry = null;
  }
  (engine as unknown as { options: { rootDir: string } }).options = { rootDir: '/fake' };
  return engine;
}

// ---------------------------------------------------------------------------
// resolveItemName
// ---------------------------------------------------------------------------

describe('resolveItemName', () => {
  it('returns the last segment for a nested path', () => {
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/Site/Hello',
    });
    expect(resolveItemName(item)).toBe('Hello');
  });

  it('returns the segment for a single-slash path', () => {
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore',
    });
    expect(resolveItemName(item)).toBe('sitecore');
  });

  it('returns the path itself when no slash is present', () => {
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: 'Bare',
    });
    expect(resolveItemName(item)).toBe('Bare');
  });

  it('preserves case of the last segment', () => {
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/MixedCaseName',
    });
    expect(resolveItemName(item)).toBe('MixedCaseName');
  });

  it('preserves spaces in the last segment', () => {
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/Foo Bar',
    });
    expect(resolveItemName(item)).toBe('Foo Bar');
  });
});

// ---------------------------------------------------------------------------
// resolveTemplateName
// ---------------------------------------------------------------------------

describe('resolveTemplateName', () => {
  it('finds the template in the serialized tree by id', () => {
    const templateId = '22222222-2222-2222-2222-222222222222';
    const tpl = makeItem({
      id: templateId,
      path: '/sitecore/templates/Test/MyTemplate',
    });
    const engine = buildEngine([tpl]);
    expect(resolveTemplateName(engine, templateId)).toBe('MyTemplate');
  });

  it('finds the template in the IAR registry when not serialized', () => {
    const templateId = '33333333-3333-3333-3333-333333333333';
    const registryItem: RegistryItem = {
      id: templateId,
      name: 'RegistryTpl',
      parent: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/System/RegistryTpl',
      database: 'master',
      sharedFields: {},
    };
    const engine = buildEngine([], [registryItem]);
    expect(resolveTemplateName(engine, templateId)).toBe('RegistryTpl');
  });

  it('prefers the serialized tree over the registry when both have the id', () => {
    const templateId = '44444444-4444-4444-4444-444444444444';
    const tpl = makeItem({
      id: templateId,
      path: '/sitecore/templates/Test/SerializedName',
    });
    const registryItem: RegistryItem = {
      id: templateId,
      name: 'RegistryName',
      parent: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
      path: '/sitecore/templates/System/RegistryName',
      database: 'master',
      sharedFields: {},
    };
    const engine = buildEngine([tpl], [registryItem]);
    expect(resolveTemplateName(engine, templateId)).toBe('SerializedName');
  });

  it('throws when neither the tree nor the registry has the id', () => {
    const engine = buildEngine([]);
    expect(() => resolveTemplateName(engine, '55555555-5555-5555-5555-555555555555'))
      .toThrowError('Template not found: 55555555-5555-5555-5555-555555555555');
  });

  it('tolerates id casing variations on the lookup', () => {
    const templateId = '66666666-6666-6666-6666-666666666666';
    const tpl = makeItem({
      id: templateId,
      path: '/sitecore/templates/Test/CaseTest',
    });
    const engine = buildEngine([tpl]);
    expect(resolveTemplateName(engine, templateId.toUpperCase())).toBe('CaseTest');
  });
});
