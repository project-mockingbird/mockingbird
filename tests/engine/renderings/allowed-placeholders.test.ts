import { describe, expect, it } from 'vitest';
import { makeItem, buildEngine } from '../layout/_helpers.js';
import { PLACEHOLDERS_FIELD_ID, PLACEHOLDER_KEY_FIELD_ID } from '../../../src/engine/constants.js';
import { getAllowedPlaceholders } from '../../../src/engine/renderings/allowed-placeholders.js';

// Placeholder Settings template ID (representative - not a constraint on the function)
const PLACEHOLDER_SETTINGS_TEMPLATE_ID = 'd2a6884c-04d5-4089-a64e-d27ca9d68d4c';

// Stable GUIDs for fixtures
const RENDERING_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PH_SETTINGS_ID_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000001';
const PH_SETTINGS_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002';
const PH_SETTINGS_ID_DANGLING = 'cccccccc-cccc-cccc-cccc-000000000099';

describe('getAllowedPlaceholders', () => {
  it('returns placeholder-key strings declared by a rendering', () => {
    const engine = buildEngine([
      // Two placeholder-settings items
      makeItem({
        id: PH_SETTINGS_ID_1,
        path: '/sitecore/layout/placeholder settings/test/container',
        template: PLACEHOLDER_SETTINGS_TEMPLATE_ID,
        sharedFields: [
          { id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'container-{*}' },
        ],
      }),
      makeItem({
        id: PH_SETTINGS_ID_2,
        path: '/sitecore/layout/placeholder settings/test/accordion-0',
        template: PLACEHOLDER_SETTINGS_TEMPLATE_ID,
        sharedFields: [
          { id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'accordion-0' },
        ],
      }),
      // Rendering item referencing both placeholder-settings items
      makeItem({
        id: RENDERING_ID,
        path: '/sitecore/layout/renderings/test/Accordion',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value: `{${PH_SETTINGS_ID_1.toUpperCase()}}|{${PH_SETTINGS_ID_2.toUpperCase()}}`,
          },
        ],
      }),
    ]);

    const result = getAllowedPlaceholders(engine, RENDERING_ID);
    expect(result).toEqual(expect.arrayContaining(['container-{*}', 'accordion-0']));
    expect(result).toHaveLength(2);
  });

  it('returns empty list for a rendering with no Placeholders field', () => {
    const engine = buildEngine([
      makeItem({
        id: RENDERING_ID,
        path: '/sitecore/layout/renderings/test/Simple',
        sharedFields: [],
      }),
    ]);

    expect(getAllowedPlaceholders(engine, RENDERING_ID)).toEqual([]);
  });

  it('skips dangling placeholder-settings GUIDs (resolves what it can)', () => {
    // PH_SETTINGS_ID_DANGLING is listed but never added to the tree - dangling.
    // Only the resolvable PH_SETTINGS_ID_1 should produce a key.
    const engine = buildEngine([
      makeItem({
        id: PH_SETTINGS_ID_1,
        path: '/sitecore/layout/placeholder settings/test/container',
        template: PLACEHOLDER_SETTINGS_TEMPLATE_ID,
        sharedFields: [
          { id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'container-{*}' },
        ],
      }),
      makeItem({
        id: RENDERING_ID,
        path: '/sitecore/layout/renderings/test/Accordion',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value: `{${PH_SETTINGS_ID_1.toUpperCase()}}|{${PH_SETTINGS_ID_DANGLING.toUpperCase()}}`,
          },
        ],
      }),
    ]);

    const result = getAllowedPlaceholders(engine, RENDERING_ID);
    expect(result).toEqual(['container-{*}']);
  });

  it('returns empty list when the rendering item itself does not exist', () => {
    const engine = buildEngine([]);
    const unknownId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    expect(getAllowedPlaceholders(engine, unknownId)).toEqual([]);
  });
});
