import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { unzipSync, strFromU8 } from 'fflate';
import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import { Registry } from '../../../src/engine/registry.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import type { ScsItem, RegistryData, RegistryItem } from '../../../src/engine/types.js';
import { parseItemFromString } from '../../../src/engine/parser.js';
import { clearTemplateSchemaCache } from '../../../src/engine/template-schema.js';
import { buildPackage } from '../../../src/engine/package/index.js';
import type { CartSource } from '../../../src/engine/package/types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = resolvePath(__dirname, '../../fixtures/package/known-good');
const SOURCE_TREE_PATH = resolvePath(FIXTURE_DIR, 'source-tree.yml');
const REGISTRY_PATH = resolvePath(__dirname, '../../../data/registry.json');

// ---------------------------------------------------------------------------
// Engine fixture builders (mirror item-xml.test.ts / properties.test.ts)
// ---------------------------------------------------------------------------

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
  (engine as unknown as { tree: ItemTree }).tree = tree;
  (engine as unknown as { registry: Registry | null }).registry = null;
  (engine as unknown as { options: { rootDir: string } }).options = { rootDir: '/fake' };
  return engine;
}

function buildTemplate(opts: {
  templateId: string;
  templateName: string;
  fields: Array<{
    id: string;
    name: string;
    type?: string;
    shared?: boolean;
    unversioned?: boolean;
    sortOrder?: number;
  }>;
}): ScsItem[] {
  const items: ScsItem[] = [];
  items.push(makeItem({
    id: opts.templateId,
    path: `/sitecore/templates/Test/${opts.templateName}`,
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields: [],
  }));
  const sectionId = `aaaaaaaa-aaaa-aaaa-aaaa-${opts.templateId.slice(-12)}`;
  items.push(makeItem({
    id: sectionId,
    parent: opts.templateId,
    path: `/sitecore/templates/Test/${opts.templateName}/Data`,
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  }));
  for (const f of opts.fields) {
    const sharedFields: ScsItem['sharedFields'] = [
      { id: FIELD_IDS.type, hint: 'Type', value: f.type ?? 'Single-Line Text' },
    ];
    if (f.shared) sharedFields.push({ id: FIELD_IDS.shared, hint: 'Shared', value: '1' });
    if (f.unversioned) sharedFields.push({ id: FIELD_IDS.unversioned, hint: 'Unversioned', value: '1' });
    if (f.sortOrder !== undefined) {
      sharedFields.push({ id: FIELD_IDS.sortorder, hint: '__Sortorder', value: String(f.sortOrder) });
    }
    items.push(makeItem({
      id: f.id,
      parent: sectionId,
      path: `/sitecore/templates/Test/${opts.templateName}/Data/${f.name}`,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields,
    }));
  }
  return items;
}

function dedupeRegistryByParentChildName(items: RegistryItem[]): RegistryItem[] {
  const byKey = new Map<string, RegistryItem>();
  for (const it of items) {
    const key = `${it.parent.toLowerCase()}${it.name.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, it); continue; }
    const existingDb = existing.database ?? 'master';
    const newDb = it.database ?? 'master';
    if (existingDb === 'master') continue;
    if (newDb === 'master') byKey.set(key, it);
  }
  return Array.from(byKey.values());
}

// ---------------------------------------------------------------------------
// Common synthetic engine + source builders
// ---------------------------------------------------------------------------

const ITEM_ID = 'a1b2c3d4-e5f6-7890-1234-5678901234ab';
const ITEM_PARENT_ID = '11111111-1111-1111-1111-111111111111';
const TPL_ID = '22222222-2222-2222-2222-222222222222';

function setupSimpleEngineAndSource(): { engine: Engine; sources: CartSource[]; itemId: string } {
  clearTemplateSchemaCache();
  const tplItems = buildTemplate({
    templateId: TPL_ID,
    templateName: 'TestTpl',
    fields: [],
  });
  const item = makeItem({
    id: ITEM_ID,
    parent: ITEM_PARENT_ID,
    template: TPL_ID,
    path: '/sitecore/content/Hello',
    languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
  });
  const engine = buildEngine([...tplItems, item]);
  const sources: CartSource[] = [{
    id: 'src-hello',
    rootItemId: ITEM_ID,
    rootItemPath: '/sitecore/content/Hello',
    rootItemName: 'Hello',
    scope: 'itemAndDescendants',
    database: 'master',
  }];
  return { engine, sources, itemId: ITEM_ID };
}

function source(overrides: Partial<CartSource> & { rootItemId: string }): CartSource {
  return {
    id: `src-${overrides.rootItemId.slice(0, 8)}`,
    rootItemId: overrides.rootItemId,
    rootItemPath: overrides.rootItemPath ?? '/sitecore/unknown',
    rootItemName: overrides.rootItemName ?? 'unknown',
    scope: overrides.scope ?? 'itemAndDescendants',
    database: 'master',
    ...overrides,
  };
}

// ===========================================================================

describe('buildPackage - outer / inner zip layout', () => {
  it('returns an outer zip whose only entry is package.zip', async () => {
    const { engine, sources } = setupSimpleEngineAndSource();
    const result = await buildPackage(engine, sources, { name: 'test-pkg' });
    expect(result.zip.byteLength).toBeGreaterThan(0);
    const outer = unzipSync(result.zip);
    expect(Object.keys(outer)).toEqual(['package.zip']);
  });

  it('inner zip has installer/version, metadata/sc_*.txt, items/master/..., properties/items/master/...', async () => {
    const { engine, sources } = setupSimpleEngineAndSource();
    const result = await buildPackage(engine, sources, {
      name: 'test-pkg',
      author: 'Alice',
      version: '1.0',
    });
    const inner = unzipSync(unzipSync(result.zip)['package.zip']);
    const keys = Object.keys(inner);

    expect(inner['installer/version']).toBeDefined();
    expect(inner['metadata/sc_name.txt']).toBeDefined();
    expect(strFromU8(inner['metadata/sc_name.txt'])).toBe('test-pkg');

    expect(keys.filter(k => k.startsWith('items/master/'))).not.toHaveLength(0);
    expect(keys.filter(k => k.startsWith('properties/items/master/'))).not.toHaveLength(0);

    // No installer/items/ prefix (the prefix is `items/`, not `installer/items/`).
    expect(keys.filter(k => k.startsWith('installer/items/'))).toHaveLength(0);
  });

  it('emits exactly one xml entry + one properties entry per item-version', async () => {
    const { engine, sources } = setupSimpleEngineAndSource();
    const result = await buildPackage(engine, sources, { name: 'test-pkg' });
    const inner = unzipSync(unzipSync(result.zip)['package.zip']);
    const xmlKeys = Object.keys(inner).filter(k => k.startsWith('items/master/'));
    const propsKeys = Object.keys(inner).filter(k => k.startsWith('properties/items/master/'));
    expect(xmlKeys.length).toBe(1);
    expect(propsKeys.length).toBe(1);

    // The properties key is the items key with the `properties/` prefix.
    expect(propsKeys[0]).toBe(`properties/${xmlKeys[0]}`);
  });

  it('reports the item count on the result', async () => {
    const { engine, sources } = setupSimpleEngineAndSource();
    const result = await buildPackage(engine, sources, { name: 'test-pkg' });
    expect(result.itemCount).toBe(1);
  });
});

describe('buildPackage - warnings', () => {
  it('returns warnings for unresolved roots without failing the build', async () => {
    const { engine } = setupSimpleEngineAndSource();
    const sources: CartSource[] = [
      source({
        id: 'src-dead',
        rootItemId: 'deadbeef-dead-beef-dead-beefdeadbeef',
        rootItemPath: '/sitecore/dead',
        scope: 'itemAndDescendants',
      }),
      source({
        id: 'src-hello',
        rootItemId: ITEM_ID,
        rootItemPath: '/sitecore/content/Hello',
        scope: 'itemAndDescendants',
      }),
    ];
    const result = await buildPackage(engine, sources, { name: 'test-pkg' });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      kind: 'unresolved-root',
      sourceId: 'src-dead',
      rootPath: '/sitecore/dead',
    });
    // The good source still produced an item.
    expect(result.itemCount).toBe(1);
  });
});

describe('buildPackage - input validation', () => {
  it('throws when no sources are provided', async () => {
    const { engine } = setupSimpleEngineAndSource();
    await expect(buildPackage(engine, [], { name: 'test' })).rejects.toThrow(/at least one source/i);
  });

  it('throws when metadata.name is missing', async () => {
    const { engine, sources } = setupSimpleEngineAndSource();
    await expect(
      buildPackage(engine, sources, { name: '' }),
    ).rejects.toThrow(/metadata\.name is required/i);
  });
});

// ===========================================================================
// Fixture round-trip integration test
// ===========================================================================
//
// Uses the Phase 1 fixture's source-tree.yml to build a one-item, one-source
// package and asserts structural correctness of the resulting zip.
// Byte-for-byte equality against package-from-sitecore.zip is NOT a goal
// here - the per-emitter tests cover that, and fflate's framing won't match
// a different zip implementation's framing byte-for-byte.

describe('buildPackage - fixture round-trip (structural)', () => {
  it('builds a valid one-item, one-source package against the Home fixture', async () => {
    clearTemplateSchemaCache();

    // Engine fixture: backed by the real IAR registry so the template walk
    // resolves the Sample Item template and the full Standard chain.
    const yamlText = await readFile(SOURCE_TREE_PATH, 'utf-8');
    const homeItem = parseItemFromString(yamlText);

    const engine = Object.create(Engine.prototype) as Engine;
    const tree = new ItemTree();
    tree.addItem(homeItem, '/fake/Home.yml');
    (engine as unknown as { tree: ItemTree }).tree = tree;
    (engine as unknown as { options: { rootDir: string } }).options = { rootDir: '/fake' };

    const fullRegistryRaw = await readFile(REGISTRY_PATH, 'utf-8');
    const fullRegistryData: RegistryData = JSON.parse(fullRegistryRaw);
    const dedupedItems = dedupeRegistryByParentChildName(fullRegistryData.items);
    const registry = new Registry();
    (registry as unknown as { index(d: RegistryData): void }).index({
      ...fullRegistryData,
      items: dedupedItems,
    });
    (engine as unknown as { registry: Registry }).registry = registry;

    const sources: CartSource[] = [{
      id: 'src-home',
      rootItemId: homeItem.id,
      rootItemPath: homeItem.path,
      rootItemName: 'Home',
      scope: 'itemAndDescendants',
      database: 'master',
    }];

    const result = await buildPackage(engine, sources, {
      name: 'home-pkg',
      author: 'tester',
    });

    // 1. Outer has exactly one entry.
    const outer = unzipSync(result.zip);
    expect(Object.keys(outer)).toEqual(['package.zip']);

    // 2. Inner has installer/version + at least one metadata + one items/ + one properties/items/.
    const inner = unzipSync(outer['package.zip']);
    const keys = Object.keys(inner);

    expect(inner['installer/version']).toBeDefined();
    expect(inner['metadata/sc_name.txt']).toBeDefined();
    expect(strFromU8(inner['metadata/sc_name.txt'])).toBe('home-pkg');

    const itemKeys = keys.filter(k => k.startsWith('items/master/'));
    const propKeys = keys.filter(k => k.startsWith('properties/items/master/'));
    expect(itemKeys.length).toBe(1);
    expect(propKeys.length).toBe(1);

    // 3. items/ prefix, NOT installer/items/.
    expect(keys.filter(k => k.startsWith('installer/items/'))).toHaveLength(0);

    // 4. The xml entry path uses the upper-braced GUID and ends with /xml.
    expect(itemKeys[0]).toMatch(/items\/master\/sitecore\/content\/Home\/\{[A-F0-9-]+\}\/en\/1\/xml$/);

    // 5. The XML body parses-roughly as our emitter's expected single-line output.
    const xmlText = strFromU8(inner[itemKeys[0]]);
    expect(xmlText).toMatch(/^<item /);
    expect(xmlText).toContain('</item>');
    expect(xmlText).toContain('<fields>');

    // 6. The properties entry has the BOM and the canonical key shape.
    const propsBytes = inner[propKeys[0]];
    expect(propsBytes[0]).toBe(0xEF);
    expect(propsBytes[1]).toBe(0xBB);
    expect(propsBytes[2]).toBe(0xBF);

    // 7. itemCount + no warnings.
    expect(result.itemCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });
});
