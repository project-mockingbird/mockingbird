import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { synthesizeItemFromRegistry, resolveFieldValue, buildItemValueIndex, readSharedFieldByHint, readFieldWithSvFallback, getLatestVersion } from '../../../src/engine/layout/item-fields.js';
import { loadPublishDateOverrides, clearPublishDateOverrides } from '../../../src/engine/layout/publish-dates.js';
import { VALID_FROM_FIELD_ID } from '../../../src/engine/layout/version-validity.js';
import type { RegistryItem } from '../../../src/engine/types.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import { makeItem, buildEngine, buildEngineWithRegistry } from './_helpers.js';

describe('synthesizeItemFromRegistry (0.4.0.11)', () => {
  // Maps RegistryItem's Record-shaped sharedFields/versionedFields into the
  // ScsField[] + ScsLanguage[] shape that ScsItem callers expect. Used by
  // resolveItem's registry fallback in field-formatter.ts.

  it('maps shared fields from Record to ScsField[]', () => {
    const reg: RegistryItem = {
      id: 'cafe1234-0000-0000-0000-000000000001',
      name: 'Breadcrumb Navigation',
      parent: 'parent-guid',
      template: 'template-guid',
      path: '/sitecore/system/Foo/Bar',
      database: 'master',
      sharedFields: {
        'baf24de2-fe3f-4598-82df-39ceb61f3d33': 'Breadcrumb Navigation',
      },
    };
    const item = synthesizeItemFromRegistry(reg);
    expect(item.id).toBe('cafe1234-0000-0000-0000-000000000001');
    expect(item.parent).toBe('parent-guid');
    expect(item.template).toBe('template-guid');
    expect(item.path).toBe('/sitecore/system/Foo/Bar');
    expect(item.sharedFields).toEqual([
      { id: 'baf24de2-fe3f-4598-82df-39ceb61f3d33', hint: '', value: 'Breadcrumb Navigation' },
    ]);
    expect(item.languages).toEqual([]);
  });

  it('maps versioned fields across language/version', () => {
    const reg: RegistryItem = {
      id: 'cafe1234-0000-0000-0000-000000000002',
      name: 'Test Item',
      parent: 'p',
      template: 't',
      path: '/x',
      database: 'master',
      sharedFields: {},
      versionedFields: {
        en: {
          '1': {
            'field-id-1': 'Value One',
            'field-id-2': 'Value Two',
          },
        },
      },
    };
    const item = synthesizeItemFromRegistry(reg);
    expect(item.languages).toHaveLength(1);
    expect(item.languages[0].language).toBe('en');
    expect(item.languages[0].fields).toEqual([]);
    expect(item.languages[0].versions).toHaveLength(1);
    expect(item.languages[0].versions[0].version).toBe(1);
    expect(item.languages[0].versions[0].fields).toEqual([
      { id: 'field-id-1', hint: '', value: 'Value One' },
      { id: 'field-id-2', hint: '', value: 'Value Two' },
    ]);
  });

  it('handles absent versionedFields (empty languages array)', () => {
    const reg: RegistryItem = {
      id: 'cafe1234-0000-0000-0000-000000000003',
      name: 'No Versioned',
      parent: 'p',
      template: 't',
      path: '/x',
      database: 'master',
      sharedFields: { 'f': 'v' },
      // versionedFields omitted
    };
    const item = synthesizeItemFromRegistry(reg);
    expect(item.languages).toEqual([]);
  });

  it('lowercases field IDs (registry may contain uppercase keys)', () => {
    // Regression guard on the `id: id.toLowerCase()` mapping. Real
    // registry data contains some uppercase field-id keys (see
    // readSharedField fallback logic in item-fields.ts); synthesized
    // items must canonicalize to lowercase to match the engine's
    // case-insensitive ScsField lookup contract.
    const reg: RegistryItem = {
      id: 'cafe1234-0000-0000-0000-000000000004',
      parent: 'p',
      template: 't',
      path: '/x',
      database: 'master',
      sharedFields: {
        'BAF24DE2-FE3F-4598-82DF-39CEB61F3D33': 'SomeValue',
      },
      versionedFields: {
        en: {
          '1': {
            'FIELD-ID-UPPER': 'versioned value',
          },
        },
      },
    };
    const item = synthesizeItemFromRegistry(reg);
    expect(item.sharedFields[0].id).toBe('baf24de2-fe3f-4598-82df-39ceb61f3d33');
    expect(item.languages[0].versions[0].fields[0].id).toBe('field-id-upper');
  });
});

describe('resolveFieldValue — cascade-only token expansion (0.4.0.11 item 4)', () => {
  // resolveFieldValue's new signature takes `item` (not templateId) so
  // expandItemTokens has item context. Token expansion runs ONLY on the
  // cascaded branch — stored (authored) values flow through unchanged,
  // preserving literal `$name` / `$date` / etc. set by editors.

  const DISPLAY_NAME_FIELD_ID = FIELD_IDS.displayName;
  const NAVIGATION_TITLE_FIELD_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const NAVIGATION_TITLE_HINT = 'NavigationTitle';

  it('expands $name when the value comes from SV cascade', () => {
    // Fixture: template with a NavigationTitle field whose SV default is
    // "$name". Item has no stored NavigationTitle — cascade supplies "$name"
    // → expander substitutes with item's display name.
    const templateId = 'cccccccc-0000-0000-0000-000000000001';
    const svItemId = 'cccccccc-0000-0000-0000-000000000002';
    const item = makeItem({
      id: 'cccccccc-0000-0000-0000-000000000003',
      template: templateId,
      path: '/sitecore/content/site/Tutorials/tutorial-01',
      sharedFields: [
        { id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: 'Tutorial Page' },
      ],
    });
    const template = makeItem({
      id: templateId,
      path: '/sitecore/templates/Test',
      sharedFields: [],
    });
    const svItem = makeItem({
      id: svItemId,
      parent: templateId,
      path: '/sitecore/templates/Test/__Standard Values',
      sharedFields: [
        { id: NAVIGATION_TITLE_FIELD_ID, hint: NAVIGATION_TITLE_HINT, value: '$name' },
      ],
    });
    const engine = buildEngine([template, svItem, item]);
    const index = buildItemValueIndex(item, 'en');
    const result = resolveFieldValue(index, NAVIGATION_TITLE_FIELD_ID, NAVIGATION_TITLE_HINT, item, 'en', engine);
    expect(result).toBe('Tutorial Page');
  });

  it('preserves authored literal "$name" on the stored branch (cascade-only invariant)', () => {
    // Fixture: item with NavigationTitle explicitly set to "$name" as
    // authored content. The stored branch returns early; expander never
    // runs.
    const templateId = 'dddddddd-0000-0000-0000-000000000001';
    const item = makeItem({
      id: 'dddddddd-0000-0000-0000-000000000002',
      template: templateId,
      path: '/sitecore/content/x',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: NAVIGATION_TITLE_FIELD_ID, hint: NAVIGATION_TITLE_HINT, value: '$name' },
          ],
        }],
      }],
    });
    const engine = buildEngine([item]);
    const index = buildItemValueIndex(item, 'en');
    const result = resolveFieldValue(index, NAVIGATION_TITLE_FIELD_ID, NAVIGATION_TITLE_HINT, item, 'en', engine);
    expect(result).toBe('$name');
  });
});

describe('readFieldWithSvFallback (0.4.0.28)', () => {
  // Thin adapter for "value-with-cascade" field reads off a specific item:
  //   own shared → own versioned → template SV (shared then versioned) → base SV chain.
  // Used by sibling-ordering (__Sortorder), token expansion ($name display name),
  // and param-item display-value resolution — all places where Sitecore's
  // standard `item.Fields[...].Value` cascade semantics apply.
  //
  // NOT a replacement for `resolveFieldValue` (which also applies SCT overlay
  // and token expansion on cascaded values — those are layout-pipeline concerns).

  const FIELD_ID = 'bbbbbbbb-0000-0000-0000-00000000000f';
  const TEMPLATE_A = 'aaaaaaaa-0000-0000-0000-000000000010';
  const TEMPLATE_B = 'aaaaaaaa-0000-0000-0000-000000000020'; // base of A
  const SV_A = 'aaaaaaaa-0000-0000-0000-0000000000a0';
  const SV_B = 'aaaaaaaa-0000-0000-0000-0000000000b0';
  const ITEM_ID = 'aaaaaaaa-0000-0000-0000-000000000100';
  const BASE_TEMPLATE_FIELD_ID = '12c33f3f-86c5-43a5-aeb4-5598cec45116';

  function buildFixture(options: {
    ownShared?: string;
    ownVersioned?: string;
    ownSv?: string;
    baseSv?: string;
  }): { engine: ReturnType<typeof buildEngine>; item: ReturnType<typeof makeItem> } {
    const item = makeItem({
      id: ITEM_ID,
      template: TEMPLATE_A,
      path: '/sitecore/content/x',
      sharedFields: options.ownShared !== undefined
        ? [{ id: FIELD_ID, hint: 'TestField', value: options.ownShared }]
        : [],
      languages: options.ownVersioned !== undefined
        ? [{
            language: 'en',
            fields: [],
            versions: [{
              version: 1,
              fields: [{ id: FIELD_ID, hint: 'TestField', value: options.ownVersioned }],
            }],
          }]
        : [],
    });
    const templateA = makeItem({
      id: TEMPLATE_A,
      path: '/sitecore/templates/A',
      sharedFields: [
        { id: BASE_TEMPLATE_FIELD_ID, hint: '__Base template', value: `{${TEMPLATE_B.toUpperCase()}}` },
      ],
    });
    const templateB = makeItem({
      id: TEMPLATE_B,
      path: '/sitecore/templates/B',
      sharedFields: [],
    });
    const fixtures = [item, templateA, templateB];
    if (options.ownSv !== undefined) {
      fixtures.push(makeItem({
        id: SV_A,
        parent: TEMPLATE_A,
        path: '/sitecore/templates/A/__Standard Values',
        sharedFields: [{ id: FIELD_ID, hint: 'TestField', value: options.ownSv }],
      }));
    }
    if (options.baseSv !== undefined) {
      fixtures.push(makeItem({
        id: SV_B,
        parent: TEMPLATE_B,
        path: '/sitecore/templates/B/__Standard Values',
        sharedFields: [{ id: FIELD_ID, hint: 'TestField', value: options.baseSv }],
      }));
    }
    const engine = buildEngine(fixtures);
    return { engine, item };
  }

  it("returns item's own shared-field value when present (no cascade)", () => {
    const { engine, item } = buildFixture({ ownShared: '400', ownSv: '100' });
    expect(readFieldWithSvFallback(engine, item, FIELD_ID, 'en')).toBe('400');
  });

  it('cascades to template SV when item has no own value', () => {
    const { engine, item } = buildFixture({ ownSv: '400' });
    expect(readFieldWithSvFallback(engine, item, FIELD_ID, 'en')).toBe('400');
  });

  it("cascades to base template's SV when own SV has no value", () => {
    const { engine, item } = buildFixture({ baseSv: '400' });
    expect(readFieldWithSvFallback(engine, item, FIELD_ID, 'en')).toBe('400');
  });

  it("falls back to item's versioned field when shared is absent", () => {
    const { engine, item } = buildFixture({ ownVersioned: 'versioned-value', ownSv: 'sv-value' });
    expect(readFieldWithSvFallback(engine, item, FIELD_ID, 'en')).toBe('versioned-value');
  });

  it('returns undefined when the field is absent everywhere in the cascade', () => {
    const { engine, item } = buildFixture({});
    expect(readFieldWithSvFallback(engine, item, FIELD_ID, 'en')).toBeUndefined();
  });

  it('suppresses cascade when item has an explicit empty shared value (matches resolveFieldValue semantics)', () => {
    const { engine, item } = buildFixture({ ownShared: '', ownSv: '400' });
    expect(readFieldWithSvFallback(engine, item, FIELD_ID, 'en')).toBeUndefined();
  });
});

describe('readSharedFieldByHint', () => {
  it('returns shared field value by hint on tree item', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000001',
        path: '/sitecore/rcr/custom',
        sharedFields: [
          { id: 'ff000001-0000-0000-0000-000000000001', hint: 'UseContextItem', value: '1' },
          { id: 'ff000002-0000-0000-0000-000000000002', hint: 'ItemSelectorQuery', value: 'ancestor::*' },
        ],
      }),
    ]);
    expect(readSharedFieldByHint(engine, 'aa000001-0000-0000-0000-000000000001', 'UseContextItem')).toBe('1');
    expect(readSharedFieldByHint(engine, 'aa000001-0000-0000-0000-000000000001', 'ItemSelectorQuery')).toBe('ancestor::*');
  });

  it('returns undefined when hint is absent', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000002',
        path: '/sitecore/rcr/empty',
        sharedFields: [{ id: 'ff000001-0000-0000-0000-000000000001', hint: 'Type', value: 'Sitecore.SomeType' }],
      }),
    ]);
    expect(readSharedFieldByHint(engine, 'aa000001-0000-0000-0000-000000000002', 'UseContextItem')).toBeUndefined();
  });

  it('returns undefined when item is absent', () => {
    const engine = buildEngine([]);
    expect(readSharedFieldByHint(engine, 'aa000001-0000-0000-0000-000000000003', 'UseContextItem')).toBeUndefined();
  });

  it('is case-insensitive on the hint', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000004',
        path: '/sitecore/rcr/case',
        sharedFields: [{ id: 'ff000001-0000-0000-0000-000000000001', hint: 'UseContextItem', value: '1' }],
      }),
    ]);
    expect(readSharedFieldByHint(engine, 'aa000001-0000-0000-0000-000000000004', 'usecontextitem')).toBe('1');
  });

  // Registry-only path — 0.4.0.14 fix: falls through to template-walk resolution.

  it('registry-only item: returns value via template-walk resolution', () => {
    // RCR settings items baked into the registry by Task 13 (SPE extraction).
    // The registry carries sharedFields keyed by field ID — not hint.
    // readSharedFieldByHint must resolve the hint to the field ID via the
    // template's field-definition children.
    const rcrTemplateId = 'dd000001-0000-0000-0000-000000000001';
    const rcrSectionId  = 'dd000001-0000-0000-0000-000000000002';
    const useCtxFieldId = 'dd000001-0000-0000-0000-000000000003';
    const rcrItemId     = 'dd000001-0000-0000-0000-000000000010';

    const rcrTemplate: RegistryItem = {
      id: rcrTemplateId,
      name: 'Rendering Contents Resolver',
      parent: 'parent-guid',
      template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/Rendering Contents Resolver',
      database: 'master',
      sharedFields: {},
    };
    const rcrSection: RegistryItem = {
      id: rcrSectionId,
      name: 'Settings',
      parent: rcrTemplateId,
      template: TEMPLATE_SECTION_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/Rendering Contents Resolver/Settings',
      database: 'master',
      sharedFields: {},
    };
    const useCtxFieldDef: RegistryItem = {
      id: useCtxFieldId,
      name: 'UseContextItem',
      parent: rcrSectionId,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/Rendering Contents Resolver/Settings/UseContextItem',
      database: 'master',
      sharedFields: {},
    };
    const rcrSettingsItem: RegistryItem = {
      id: rcrItemId,
      name: 'Context Item Resolver',
      parent: 'parent-guid',
      template: rcrTemplateId,
      path: '/sitecore/system/Settings/Rendering Contents Resolvers/Context Item Resolver',
      database: 'master',
      sharedFields: {
        [useCtxFieldId]: '1',
      },
    };

    const engine = buildEngineWithRegistry({
      tree: [],
      registry: [rcrTemplate, rcrSection, useCtxFieldDef, rcrSettingsItem],
    });

    expect(readSharedFieldByHint(engine, rcrItemId, 'UseContextItem')).toBe('1');
  });

  it('registry-only item with missing hint: returns undefined', () => {
    const rcrTemplateId = 'dd000002-0000-0000-0000-000000000001';
    const rcrSectionId  = 'dd000002-0000-0000-0000-000000000002';
    const useCtxFieldId = 'dd000002-0000-0000-0000-000000000003';
    const rcrItemId     = 'dd000002-0000-0000-0000-000000000010';

    const rcrTemplate: RegistryItem = {
      id: rcrTemplateId,
      name: 'Rendering Contents Resolver',
      parent: 'parent-guid',
      template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/RCR2',
      database: 'master',
      sharedFields: {},
    };
    const rcrSection: RegistryItem = {
      id: rcrSectionId,
      name: 'Settings',
      parent: rcrTemplateId,
      template: TEMPLATE_SECTION_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/RCR2/Settings',
      database: 'master',
      sharedFields: {},
    };
    const useCtxFieldDef: RegistryItem = {
      id: useCtxFieldId,
      name: 'UseContextItem',
      parent: rcrSectionId,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/RCR2/Settings/UseContextItem',
      database: 'master',
      sharedFields: {},
    };
    const rcrSettingsItem: RegistryItem = {
      id: rcrItemId,
      name: 'Some Resolver',
      parent: 'parent-guid',
      template: rcrTemplateId,
      path: '/sitecore/system/Settings/Rendering Contents Resolvers/Some Resolver',
      database: 'master',
      sharedFields: {
        [useCtxFieldId]: '1',
      },
    };

    const engine = buildEngineWithRegistry({
      tree: [],
      registry: [rcrTemplate, rcrSection, useCtxFieldDef, rcrSettingsItem],
    });

    // 'ItemSelectorQuery' is not defined on this template — must return undefined.
    expect(readSharedFieldByHint(engine, rcrItemId, 'ItemSelectorQuery')).toBeUndefined();
  });
});

describe('getLatestVersion — Sitecore GetValidVersion port (0.4.0.31)', () => {
  // Integration test for the core Finding-E port: when a page's versions
  // carry __Valid from values and a deployment has set a per-item publish-
  // date in the overrides file, getLatestVersion returns the highest version
  // whose __Valid from <= publishDate - exactly matching Sitecore's
  // GetValidVersion semantic.

  let tmpDir: string;
  const savedEnv = { ...process.env };
  beforeEach(() => {
    clearPublishDateOverrides();
    tmpDir = mkdtempSync(join(tmpdir(), 'mb-glv-port-'));
    delete process.env.MOCKINGBIRD_PUBLISH_DATE;
    delete process.env.MOCKINGBIRD_PUBLISHING_VALIDATION;
  });
  afterEach(() => {
    clearPublishDateOverrides();
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...savedEnv };
  });

  // Shape emulates sample-page: V1-V4 have no carousels (represented by a
  // field value that indicates an older layout); V5 onward adds the newer
  // layout. Each version carries its __Valid from.
  function multiVersionItem() {
    return makeItem({
      id: 'eeeeeeee-0000-0000-0000-000000000001',
      path: '/sitecore/content/x/sample-page',
      languages: [{
        language: 'en',
        fields: [],
        versions: [
          {
            version: 1,
            fields: [
              { id: 'f', hint: 'F', value: 'v1-layout-no-carousel' },
              { id: VALID_FROM_FIELD_ID, hint: '__Valid from', value: '20240101T000000Z' },
            ],
          },
          {
            version: 4,
            fields: [
              { id: 'f', hint: 'F', value: 'v4-layout-no-carousel' },
              { id: VALID_FROM_FIELD_ID, hint: '__Valid from', value: '20241029T000000Z' },
            ],
          },
          {
            version: 5,
            fields: [
              { id: 'f', hint: 'F', value: 'v5-layout-with-carousel' },
              { id: VALID_FROM_FIELD_ID, hint: '__Valid from', value: '20250116T000000Z' },
            ],
          },
          {
            version: 25,
            fields: [
              { id: 'f', hint: 'F', value: 'v25-layout-with-carousel' },
              { id: VALID_FROM_FIELD_ID, hint: '__Valid from', value: '20251222T000000Z' },
            ],
          },
        ],
      }],
    });
  }

  it('no overrides, env unset, all valid-from past → returns latest (backward-compat default)', () => {
    const item = multiVersionItem();
    const v = getLatestVersion(item, 'en');
    expect(v?.version).toBe(25);
  });

  it('per-item publish-date override before V5.__Valid from → returns V4', async () => {
    await loadPublishDateOverrides(
      writeFile(tmpDir, "'/sitecore/content/x/sample-page': '2024-12-01T00:00:00Z'\n"),
    );
    const item = multiVersionItem();
    const v = getLatestVersion(item, 'en');
    expect(v?.version).toBe(4);
    expect(v?.fields[0].value).toBe('v4-layout-no-carousel');
  });

  it('per-item publish-date override before V4.__Valid from → returns V1', async () => {
    await loadPublishDateOverrides(
      writeFile(tmpDir, "'/sitecore/content/x/sample-page': '2024-06-01T00:00:00Z'\n"),
    );
    const item = multiVersionItem();
    expect(getLatestVersion(item, 'en')?.version).toBe(1);
  });

  it('per-item publish-date override after latest __Valid from → returns V25', async () => {
    await loadPublishDateOverrides(
      writeFile(tmpDir, "'/sitecore/content/x/sample-page': '2026-01-01T00:00:00Z'\n"),
    );
    const item = multiVersionItem();
    expect(getLatestVersion(item, 'en')?.version).toBe(25);
  });

  it('global MOCKINGBIRD_PUBLISH_DATE applies when no per-item override', () => {
    process.env.MOCKINGBIRD_PUBLISH_DATE = '2024-12-01T00:00:00Z';
    const item = multiVersionItem();
    expect(getLatestVersion(item, 'en')?.version).toBe(4);
  });

  it('per-item override takes precedence over MOCKINGBIRD_PUBLISH_DATE', async () => {
    process.env.MOCKINGBIRD_PUBLISH_DATE = '2026-01-01T00:00:00Z'; // would pick V25
    await loadPublishDateOverrides(
      writeFile(tmpDir, "'/sitecore/content/x/sample-page': '2024-12-01T00:00:00Z'\n"),
    );
    const item = multiVersionItem();
    expect(getLatestVersion(item, 'en')?.version).toBe(4); // override wins
  });

  it('returns undefined when no version passes the predicate at the given date', async () => {
    // publishDate before every version's __Valid from → null return
    // (matches Sitecore's GetValidVersion returning null at publish-time
    // when the item has nothing valid → Edge has no content).
    await loadPublishDateOverrides(
      writeFile(tmpDir, "'/sitecore/content/x/sample-page': '2023-01-01T00:00:00Z'\n"),
    );
    const item = multiVersionItem();
    expect(getLatestVersion(item, 'en')).toBeUndefined();
  });
});

function writeFile(dir: string, content: string): string {
  const path = join(dir, 'publish-dates.yml');
  writeFileSync(path, content, 'utf8');
  return path;
}

