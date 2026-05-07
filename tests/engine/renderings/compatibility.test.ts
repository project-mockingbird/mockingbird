import { describe, expect, it } from 'vitest';
import type { RegistryItem, ScsItem } from '../../../src/engine/types.js';
import { FIELD_IDS, PLACEHOLDER_KEY_FIELD_ID } from '../../../src/engine/constants.js';
import { getCompatibleRenderings } from '../../../src/engine/renderings/compatibility.js';
import { makeItem, buildEngine, buildEngineWithRegistry } from '../layout/_helpers.js';

// Field IDs used by the compatibility module
const ALLOWED_CONTROLS_FIELD_ID = FIELD_IDS.allowedControls;
const DISPLAY_NAME_FIELD_ID = FIELD_IDS.displayName;

// Template IDs used in fixture items
const PLACEHOLDER_SETTINGS_TEMPLATE_ID = 'd2a6884c-04d5-4089-a64e-d27ca9d68d4c';
// Json Rendering template (SXA composite rendering template)
const JSON_RENDERING_TEMPLATE_ID = '04646a89-996f-4ee7-878a-ffdbf1f0ef0d';

// Real hex GUIDs for fixtures (no non-hex chars so formatGuidBraced produces valid format)
const RENDERING_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RENDERING_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RENDERING_ID_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PH_SETTINGS_ROOT_ID = '1ce3b36c-9b0c-4eb5-a996-bfcb4eaa5287';
const RENDERINGS_ROOT_ID = 'b0a67b2a-8b07-4e0b-8809-69f751709ace';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal /sitecore/layout/renderings tree with some rendering items.
 * Always includes the root item.
 */
function makeRenderingsTree(
  renderings: Array<{ id: string; name: string; displayName?: string }>,
): ScsItem[] {
  const renderingsRoot = makeItem({
    id: RENDERINGS_ROOT_ID,
    path: '/sitecore/layout/renderings',
  });

  return [
    renderingsRoot,
    ...renderings.map(r => {
      const displayNameField = r.displayName
        ? [{ id: DISPLAY_NAME_FIELD_ID, hint: '__Display Name', value: r.displayName }]
        : [];
      return makeItem({
        id: r.id,
        parent: RENDERINGS_ROOT_ID,
        path: `/sitecore/layout/renderings/${r.name}`,
        template: JSON_RENDERING_TEMPLATE_ID,
        sharedFields: displayNameField,
      });
    }),
  ];
}

/**
 * Build the /sitecore/layout/placeholder settings root item plus one settings
 * child with the given key and optional allowed controls.
 */
function makePlaceholderSettingsTree(opts: {
  settingsId: string;
  name: string;
  placeholderKey: string;
  allowedControls?: string;
}): ScsItem[] {
  const root = makeItem({
    id: PH_SETTINGS_ROOT_ID,
    path: '/sitecore/layout/placeholder settings',
  });

  const sharedFields: ScsItem['sharedFields'] = [
    { id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: opts.placeholderKey },
  ];
  if (opts.allowedControls !== undefined) {
    sharedFields.push({
      id: ALLOWED_CONTROLS_FIELD_ID,
      hint: 'Allowed Controls',
      value: opts.allowedControls,
    });
  }
  const settingsItem = makeItem({
    id: opts.settingsId,
    parent: PH_SETTINGS_ROOT_ID,
    path: `/sitecore/layout/placeholder settings/${opts.name}`,
    template: PLACEHOLDER_SETTINGS_TEMPLATE_ID,
    sharedFields,
  });

  return [root, settingsItem];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCompatibleRenderings', () => {
  it('returns ALL renderings under /sitecore/layout/renderings when Allowed Controls is empty', () => {
    const renderingDefs = [
      { id: RENDERING_ID_A, name: 'Banner', displayName: 'Banner' },
      { id: RENDERING_ID_B, name: 'Card', displayName: 'Card' },
      { id: RENDERING_ID_C, name: 'Accordion', displayName: 'Accordion' },
    ];

    const items: ScsItem[] = [
      ...makeRenderingsTree(renderingDefs),
      ...makePlaceholderSettingsTree({
        settingsId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        name: 'Container Settings',
        placeholderKey: 'container-1',
        allowedControls: '',  // empty - all renderings allowed
      }),
    ];

    const engine = buildEngine(items);
    const result = getCompatibleRenderings(
      engine,
      '/headless-main/sxa-full-width-body/container-1',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    );

    expect(result.length).toBe(3);

    // Verify shape - id is braced uppercase GUID
    expect(result[0]).toMatchObject({
      id: expect.stringMatching(/^\{[0-9A-Fa-f-]{36}\}$/),
      name: expect.any(String),
      displayName: expect.any(String),
    });

    // Verify sorted by displayName ascending
    const names = result.map(r => r.displayName);
    expect(names).toEqual([...names].sort());
    // Accordion < Banner < Card
    expect(names).toEqual(['Accordion', 'Banner', 'Card']);
  });

  it('returns ALL renderings when no placeholder-settings item resolves', () => {
    const renderingDefs = [
      { id: RENDERING_ID_A, name: 'Banner', displayName: 'Banner' },
      { id: RENDERING_ID_B, name: 'Card', displayName: 'Card' },
    ];

    const engine = buildEngine(makeRenderingsTree(renderingDefs));

    // No placeholder-settings items at all
    const result = getCompatibleRenderings(engine, '/nonexistent/placeholder', 'page-item-id');

    expect(result.length).toBe(2);
    const names = result.map(r => r.displayName);
    expect(names).toEqual([...names].sort());
  });

  it('returns the renderings listed in Allowed Controls when populated', () => {
    const renderingDefs = [
      { id: RENDERING_ID_A, name: 'Banner', displayName: 'Banner' },
      { id: RENDERING_ID_B, name: 'Card', displayName: 'Card' },
      { id: RENDERING_ID_C, name: 'Accordion', displayName: 'Accordion' },
    ];

    // Only Banner (A) and Accordion (C) are in Allowed Controls
    const allowedControls =
      `\n{${RENDERING_ID_A.toUpperCase()}}\n{${RENDERING_ID_C.toUpperCase()}}\n`;

    const items: ScsItem[] = [
      ...makeRenderingsTree(renderingDefs),
      ...makePlaceholderSettingsTree({
        settingsId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        name: 'Hero Settings',
        placeholderKey: 'hero-placeholder',
        allowedControls,
      }),
    ];

    const engine = buildEngine(items);
    const result = getCompatibleRenderings(engine, '/page/hero-placeholder', 'page-item-id');

    expect(result.length).toBe(2);
    const returnedNames = result.map(r => r.name).sort();
    expect(returnedNames).toEqual(['Accordion', 'Banner']);

    // Sorted by displayName ascending
    const displayNames = result.map(r => r.displayName);
    expect(displayNames).toEqual([...displayNames].sort());
  });

  it('returns empty array when Allowed Controls lists only unresolvable GUIDs (matches Sitecore behavior)', () => {
    const renderingDefs = [
      { id: RENDERING_ID_A, name: 'Banner', displayName: 'Banner' },
    ];

    // References a GUID that doesn't exist in the tree
    const allowedControls = '\n{FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF}\n';

    const items: ScsItem[] = [
      ...makeRenderingsTree(renderingDefs),
      ...makePlaceholderSettingsTree({
        settingsId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        name: 'Missing Ref Settings',
        placeholderKey: 'missing-ref-placeholder',
        allowedControls,
      }),
    ];

    const engine = buildEngine(items);
    const result = getCompatibleRenderings(engine, '/page/missing-ref-placeholder', 'page-item-id');

    // All allowed-controls GUIDs are dangling - Sitecore returns the (empty)
    // resolved set rather than falling back to all renderings. The non-empty
    // Allowed Controls field signals a constraint; returning all renderings
    // would mask data errors.
    expect(result).toEqual([]);
  });

  it('returns empty array when there are no renderings at all', () => {
    // Tree has no rendering items and no /sitecore/layout/renderings root
    const engine = buildEngine([]);
    const result = getCompatibleRenderings(engine, '/some/placeholder', 'page-item-id');
    expect(result).toEqual([]);
  });

  it('formats IDs as braced uppercase GUIDs', () => {
    const renderingDefs = [
      { id: RENDERING_ID_A, name: 'TestRendering' },
    ];
    const engine = buildEngine(makeRenderingsTree(renderingDefs));
    const result = getCompatibleRenderings(engine, '/nonexistent/ph', 'page');
    // RENDERING_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    expect(result[0].id).toBe('{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}');
  });

  it('uses item name as displayName fallback when __Display Name is absent', () => {
    const renderingDefs = [
      { id: RENDERING_ID_A, name: 'MyRendering' },
      // no displayName set - should fall back to last segment of path
    ];
    const engine = buildEngine(makeRenderingsTree(renderingDefs));
    const result = getCompatibleRenderings(engine, '/nonexistent/ph', 'page');
    expect(result[0].displayName).toBe('MyRendering');
    expect(result[0].name).toBe('MyRendering');
  });
});

// ---------------------------------------------------------------------------
// Registry-walk regression: in real Sitecore corpora the
// /sitecore/layout/renderings subtree is registry-only (~2400 items, zero
// serialized). The all-renderings fallback (empty Allowed Controls) MUST
// walk the merged store so registry items are visible. This fixture seeds
// the renderings root in the registry only - if the implementation walks
// `engine.getItemByPath` (serialized-only) the result will be [] and the
// test fails. With merged-walk it returns the registry items.
// ---------------------------------------------------------------------------

describe('getCompatibleRenderings - registry walk', () => {
  function makeRegistryRendering(opts: {
    id: string;
    parent: string;
    name: string;
    path: string;
    displayName?: string;
  }): RegistryItem {
    const sharedFields: Record<string, string> = {};
    if (opts.displayName) sharedFields[FIELD_IDS.displayName] = opts.displayName;
    return {
      id: opts.id.toLowerCase(),
      name: opts.name,
      parent: opts.parent.toLowerCase(),
      template: JSON_RENDERING_TEMPLATE_ID,
      path: opts.path,
      database: 'master',
      sharedFields,
    };
  }

  it('returns rendering items from the registry when /sitecore/layout/renderings is registry-only', () => {
    // Mirrors the canonical production shape: zero serialized rendering items,
    // but a populated registry rendering tree.
    const SITECORE_ROOT = '11111111-1111-1111-1111-111111111111';
    const LAYOUT_ROOT = '22222222-2222-2222-2222-222222222222';
    const RENDERINGS_ROOT = '33333333-3333-3333-3333-333333333333';
    const ACCORDION_ID = '44444444-4444-4444-4444-444444444444';
    const CONTAINER_ID = '55555555-5555-5555-5555-555555555555';

    const registryItems: RegistryItem[] = [
      {
        id: SITECORE_ROOT,
        name: 'sitecore',
        parent: '00000000-0000-0000-0000-000000000000',
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore',
        database: 'master',
        sharedFields: {},
      },
      {
        id: LAYOUT_ROOT,
        name: 'layout',
        parent: SITECORE_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout',
        database: 'master',
        sharedFields: {},
      },
      {
        id: RENDERINGS_ROOT,
        name: 'renderings',
        parent: LAYOUT_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout/renderings',
        database: 'master',
        sharedFields: {},
      },
      makeRegistryRendering({
        id: ACCORDION_ID,
        parent: RENDERINGS_ROOT,
        name: 'Accordion',
        path: '/sitecore/layout/renderings/Accordion',
        displayName: 'Accordion',
      }),
      makeRegistryRendering({
        id: CONTAINER_ID,
        parent: RENDERINGS_ROOT,
        name: 'Container',
        path: '/sitecore/layout/renderings/Container',
        displayName: 'Container',
      }),
    ];

    const engine = buildEngineWithRegistry({
      tree: [], // zero serialized items - same as live content tree
      registry: registryItems,
    });

    const result = getCompatibleRenderings(
      engine,
      '/headless-main/sxa-full-width-body/container-1',
      '327ba80a-33c9-4b6a-af27-d0170e77518b',
    );

    expect(result.length).toBeGreaterThan(0);
    const names = result.map(r => r.name.toLowerCase());
    expect(names).toContain('accordion');
    expect(names).toContain('container');

    // Verify shape - id is braced uppercase GUID (same shape as serialized path)
    expect(result[0]).toMatchObject({
      id: expect.stringMatching(/^\{[0-9A-Fa-f-]{36}\}$/),
      name: expect.any(String),
      displayName: expect.any(String),
    });

    // Sorted by displayName ascending
    const displayNames = result.map(r => r.displayName);
    expect(displayNames).toEqual([...displayNames].sort());
  });

  it('honors Allowed Controls on a registry-only Placeholder Settings item', () => {
    // The placeholder-settings item exists ONLY in the registry - mirrors how
    // OOTB Sitecore SXA placeholder settings ship via IAR after the v4.0 bake.
    // Without registry-aware lookup, findPlaceholderSettingsItem misses it
    // and the call falls through to "all renderings" instead of the typed
    // Allowed Controls list.
    const SITECORE_ROOT = '11111111-1111-1111-1111-111111111111';
    const LAYOUT_ROOT = '22222222-2222-2222-2222-222222222222';
    const RENDERINGS_ROOT = '33333333-3333-3333-3333-333333333333';
    const PH_SETTINGS_ROOT_REG_ID = 'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa';
    const SETTINGS_ITEM_REG_ID = 'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb';
    const ALLOWED_RENDERING_ID = 'cccccccc-0000-0000-0000-cccccccccccc';
    const OTHER_RENDERING_ID = 'dddddddd-0000-0000-0000-dddddddddddd';

    const registryItems: RegistryItem[] = [
      {
        id: SITECORE_ROOT,
        name: 'sitecore',
        parent: '00000000-0000-0000-0000-000000000000',
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore',
        database: 'master',
        sharedFields: {},
      },
      {
        id: LAYOUT_ROOT,
        name: 'layout',
        parent: SITECORE_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout',
        database: 'master',
        sharedFields: {},
      },
      {
        id: RENDERINGS_ROOT,
        name: 'renderings',
        parent: LAYOUT_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout/renderings',
        database: 'master',
        sharedFields: {},
      },
      // Placeholder settings root - registry-only.
      {
        id: PH_SETTINGS_ROOT_REG_ID,
        name: 'placeholder settings',
        parent: LAYOUT_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout/placeholder settings',
        database: 'master',
        sharedFields: {},
      },
      // Placeholder settings item - registry-only; carries Placeholder Key + Allowed Controls.
      {
        id: SETTINGS_ITEM_REG_ID,
        name: 'Main Settings',
        parent: PH_SETTINGS_ROOT_REG_ID,
        template: PLACEHOLDER_SETTINGS_TEMPLATE_ID,
        path: '/sitecore/layout/placeholder settings/Main Settings',
        database: 'master',
        sharedFields: {
          [PLACEHOLDER_KEY_FIELD_ID]: 'main',
          [ALLOWED_CONTROLS_FIELD_ID]: `\n{${ALLOWED_RENDERING_ID.toUpperCase()}}\n`,
        },
      },
      // Two rendering items - only ALLOWED_RENDERING_ID is in Allowed Controls.
      makeRegistryRendering({
        id: ALLOWED_RENDERING_ID,
        parent: RENDERINGS_ROOT,
        name: 'AllowedRendering',
        path: '/sitecore/layout/renderings/AllowedRendering',
        displayName: 'Allowed Rendering',
      }),
      makeRegistryRendering({
        id: OTHER_RENDERING_ID,
        parent: RENDERINGS_ROOT,
        name: 'OtherRendering',
        path: '/sitecore/layout/renderings/OtherRendering',
        displayName: 'Other Rendering',
      }),
    ];

    const engine = buildEngineWithRegistry({
      tree: [], // zero serialized items - placeholder settings is registry-only
      registry: registryItems,
    });

    const result = getCompatibleRenderings(
      engine,
      '/page/main',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    );

    // Must return exactly the one rendering listed in Allowed Controls,
    // NOT the all-renderings fallback (which would return both renderings).
    expect(result.map(r => r.id)).toEqual([
      `{${ALLOWED_RENDERING_ID.toUpperCase()}}`,
    ]);
  });

  it('resolves Allowed Controls GUIDs against registry-only rendering items', () => {
    // Allowed Controls multilist refers to GUIDs; the lookup must be
    // registry-aware so registry-only renderings can be resolved.
    const SITECORE_ROOT = '11111111-1111-1111-1111-111111111111';
    const LAYOUT_ROOT = '22222222-2222-2222-2222-222222222222';
    const RENDERINGS_ROOT = '33333333-3333-3333-3333-333333333333';
    const PH_SETTINGS_ROOT_REG_ID = '66666666-6666-6666-6666-666666666666';
    const SETTINGS_ITEM_ID = '77777777-7777-7777-7777-777777777777';
    const ACCORDION_ID = '44444444-4444-4444-4444-444444444444';
    const CONTAINER_ID = '55555555-5555-5555-5555-555555555555';

    const registryItems: RegistryItem[] = [
      {
        id: SITECORE_ROOT,
        name: 'sitecore',
        parent: '00000000-0000-0000-0000-000000000000',
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore',
        database: 'master',
        sharedFields: {},
      },
      {
        id: LAYOUT_ROOT,
        name: 'layout',
        parent: SITECORE_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout',
        database: 'master',
        sharedFields: {},
      },
      {
        id: RENDERINGS_ROOT,
        name: 'renderings',
        parent: LAYOUT_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout/renderings',
        database: 'master',
        sharedFields: {},
      },
      {
        id: PH_SETTINGS_ROOT_REG_ID,
        name: 'placeholder settings',
        parent: LAYOUT_ROOT,
        template: JSON_RENDERING_TEMPLATE_ID,
        path: '/sitecore/layout/placeholder settings',
        database: 'master',
        sharedFields: {},
      },
      makeRegistryRendering({
        id: ACCORDION_ID,
        parent: RENDERINGS_ROOT,
        name: 'Accordion',
        path: '/sitecore/layout/renderings/Accordion',
        displayName: 'Accordion',
      }),
      makeRegistryRendering({
        id: CONTAINER_ID,
        parent: RENDERINGS_ROOT,
        name: 'Container',
        path: '/sitecore/layout/renderings/Container',
        displayName: 'Container',
      }),
    ];

    // Tree-side: a placeholder-settings item in the serialized store whose
    // Allowed Controls field references the registry-only renderings.
    const allowedControls =
      `\n{${ACCORDION_ID.toUpperCase()}}\n{${CONTAINER_ID.toUpperCase()}}\n`;

    const treeItems: ScsItem[] = [
      makeItem({
        id: PH_SETTINGS_ROOT_ID,
        path: '/sitecore/layout/placeholder settings',
      }),
      makeItem({
        id: SETTINGS_ITEM_ID,
        parent: PH_SETTINGS_ROOT_ID,
        path: '/sitecore/layout/placeholder settings/Container Settings',
        template: PLACEHOLDER_SETTINGS_TEMPLATE_ID,
        sharedFields: [
          { id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'container-1' },
          { id: ALLOWED_CONTROLS_FIELD_ID, hint: 'Allowed Controls', value: allowedControls },
        ],
      }),
    ];

    const engine = buildEngineWithRegistry({ tree: treeItems, registry: registryItems });

    const result = getCompatibleRenderings(
      engine,
      '/headless-main/sxa-full-width-body/container-1',
      'page-item-id',
    );

    expect(result.length).toBe(2);
    const names = result.map(r => r.name).sort();
    expect(names).toEqual(['Accordion', 'Container']);
  });
});
