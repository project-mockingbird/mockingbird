import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import { formatItemFields } from '../../../src/engine/layout/utils.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { buildEngine, buildEngineWithRegistry, makeItem } from './_helpers.js';

/**
 * Tests for `__Standard Values` cascade in `formatItemFields`.
 *
 * Sitecore serializers suppress field values equal to `__Standard Values`,
 * so an item's serialized YAML is incomplete on its own. These tests cover
 * the four resolution outcomes:
 *
 *   1. Item has non-empty value       → emit item's value.
 *   2. Item has explicit empty value  → emit empty (explicit override of SV).
 *   3. Item has no entry for field    → cascade to SV, emit SV value.
 *   4. Item has no entry + no SV      → emit typed empty default.
 *
 * Both tree-serialized SVs (covers example-authored templates like Release
 * Page) and registry-carried SVs (covers OOTB SXA / JSS templates) are
 * exercised, including versioned-field extraction from registry v3.0.
 */

const TEMPLATE_A_ID = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SECTION_ID = 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FIELD_X_ID = 'cccc0000-cccc-cccc-cccc-cccccccccccc';
const FIELD_Y_ID = 'dddd0000-dddd-dddd-dddd-dddddddddddd';

/**
 * Build the minimal template + section + field structure that
 * `getTemplateSchema` needs to emit a non-standard section with two
 * Single-Line Text fields `X` and `Y`.
 */
function buildTemplateStructure(): ScsItem[] {
  const template = makeItem({
    id: TEMPLATE_A_ID,
    path: '/sitecore/templates/Test/A',
    template: TEMPLATE_TEMPLATE_ID,
  });
  const section = makeItem({
    id: SECTION_ID,
    parent: TEMPLATE_A_ID,
    path: '/sitecore/templates/Test/A/Content',
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  });
  const fieldX = makeItem({
    id: FIELD_X_ID,
    parent: SECTION_ID,
    path: '/sitecore/templates/Test/A/Content/X',
    template: TEMPLATE_FIELD_TEMPLATE_ID,
    sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
  });
  const fieldY = makeItem({
    id: FIELD_Y_ID,
    parent: SECTION_ID,
    path: '/sitecore/templates/Test/A/Content/Y',
    template: TEMPLATE_FIELD_TEMPLATE_ID,
    sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
  });
  return [template, section, fieldX, fieldY];
}

describe('Standard Values cascade - tree-serialized SV', () => {
  it('inherits an SV shared-field value when the item has no entry for the field', () => {
    const [template, section, fieldX, fieldY] = buildTemplateStructure();
    const svItem = makeItem({
      id: 'eeee0000-eeee-eeee-eeee-eeeeeeeeeeee',
      parent: TEMPLATE_A_ID,
      path: '/sitecore/templates/Test/A/__Standard Values',
      template: TEMPLATE_A_ID,
      sharedFields: [{ id: FIELD_X_ID, hint: 'X', value: 'from SV shared' }],
    });
    const item = makeItem({
      id: 'ffff0000-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
    });
    const engine = buildEngine([template, section, fieldX, fieldY, svItem, item]);

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: 'from SV shared' });
    // Y has no value anywhere - falls through to empty default for Text.
    expect(fields.Y).toEqual({ value: '' });
  });

  it('inherits an SV versioned-field value when the item has no entry for the field', () => {
    const [template, section, fieldX, fieldY] = buildTemplateStructure();
    const svItem = makeItem({
      id: 'eeee0001-eeee-eeee-eeee-eeeeeeeeeeee',
      parent: TEMPLATE_A_ID,
      path: '/sitecore/templates/Test/A/__Standard Values',
      template: TEMPLATE_A_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: FIELD_X_ID, hint: 'X', value: 'from SV versioned' }],
        }],
      }],
    });
    const item = makeItem({
      id: 'ffff0001-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
    });
    const engine = buildEngine([template, section, fieldX, fieldY, svItem, item]);

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: 'from SV versioned' });
  });

  it('does NOT cascade to SV when the item has an explicit empty value - empty is a deliberate override', () => {
    // Matches Example's Global Search Box item pattern: `TextBoxText` is
    // serialized with empty value to suppress SXA's "Search here..."
    // default. Without this check, mockingbird would emit the SV default
    // and diverge from prod.
    const [template, section, fieldX, fieldY] = buildTemplateStructure();
    const svItem = makeItem({
      id: 'eeee0002-eeee-eeee-eeee-eeeeeeeeeeee',
      parent: TEMPLATE_A_ID,
      path: '/sitecore/templates/Test/A/__Standard Values',
      template: TEMPLATE_A_ID,
      sharedFields: [{ id: FIELD_X_ID, hint: 'X', value: 'SV default that should be suppressed' }],
    });
    const item = makeItem({
      id: 'ffff0002-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: FIELD_X_ID, hint: 'X', value: '' }],
        }],
      }],
    });
    const engine = buildEngine([template, section, fieldX, fieldY, svItem, item]);

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: '' });
  });

  it('prefers item value over SV when both are set', () => {
    const [template, section, fieldX, fieldY] = buildTemplateStructure();
    const svItem = makeItem({
      id: 'eeee0003-eeee-eeee-eeee-eeeeeeeeeeee',
      parent: TEMPLATE_A_ID,
      path: '/sitecore/templates/Test/A/__Standard Values',
      template: TEMPLATE_A_ID,
      sharedFields: [{ id: FIELD_X_ID, hint: 'X', value: 'SV' }],
    });
    const item = makeItem({
      id: 'ffff0003-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: FIELD_X_ID, hint: 'X', value: 'item' }],
        }],
      }],
    });
    const engine = buildEngine([template, section, fieldX, fieldY, svItem, item]);

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: 'item' });
  });

  it('walks base templates - SV on a base template resolves when the derived template has no SV entry', () => {
    // Template A -> base template BASE. BASE's SV carries X; A's SV carries Y.
    // Item of template A has no stored values. Expect X from BASE, Y from A.
    const BASE_ID = '00001111-2222-3333-4444-555566667777';
    const template = makeItem({
      id: TEMPLATE_A_ID,
      path: '/sitecore/templates/Test/A',
      template: TEMPLATE_TEMPLATE_ID,
      // Sitecore serializes `__Base template` as brace-wrapped uppercase
      // GUIDs, pipe-delimited for multiple bases. parseGuidList requires
      // that form - bare dashed input is not recognized.
      sharedFields: [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${BASE_ID.toUpperCase()}}` }],
    });
    const section = makeItem({
      id: SECTION_ID,
      parent: TEMPLATE_A_ID,
      path: '/sitecore/templates/Test/A/Content',
      template: TEMPLATE_SECTION_TEMPLATE_ID,
    });
    const fieldX = makeItem({
      id: FIELD_X_ID,
      parent: SECTION_ID,
      path: '/sitecore/templates/Test/A/Content/X',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });
    const fieldY = makeItem({
      id: FIELD_Y_ID,
      parent: SECTION_ID,
      path: '/sitecore/templates/Test/A/Content/Y',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });
    const aSv = makeItem({
      id: 'eeee0004-eeee-eeee-eeee-eeeeeeeeeeee',
      parent: TEMPLATE_A_ID,
      path: '/sitecore/templates/Test/A/__Standard Values',
      template: TEMPLATE_A_ID,
      sharedFields: [{ id: FIELD_Y_ID, hint: 'Y', value: 'from A SV' }],
    });
    const baseTemplate = makeItem({
      id: BASE_ID,
      path: '/sitecore/templates/Test/Base',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const baseSv = makeItem({
      id: 'eeee0005-eeee-eeee-eeee-eeeeeeeeeeee',
      parent: BASE_ID,
      path: '/sitecore/templates/Test/Base/__Standard Values',
      template: BASE_ID,
      sharedFields: [{ id: FIELD_X_ID, hint: 'X', value: 'from BASE SV' }],
    });
    const item = makeItem({
      id: 'ffff0004-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
    });
    const engine = buildEngine([template, section, fieldX, fieldY, aSv, baseTemplate, baseSv, item]);

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: 'from BASE SV' });
    expect(fields.Y).toEqual({ value: 'from A SV' });
  });
});

describe('Standard Values cascade - registry-carried SV (v3.0 versioned fields)', () => {
  it('inherits from registry SV.versionedFields when the item has no entry for the field', () => {
    // Mirrors the SXA Search Box case: OOTB template has its SV in the
    // registry with versioned fields (en/v1) carrying `SearchButtonText
    // = "Search"`. The item's YAML omits the field entirely because its
    // author-time value matches the SV.
    const [template, section, fieldX, fieldY] = buildTemplateStructure();
    const item = makeItem({
      id: 'ffff0005-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
    });
    const engine = buildEngineWithRegistry({
      tree: [template, section, fieldX, fieldY, item],
      registry: [
        {
          id: 'eeee0006-eeee-eeee-eeee-eeeeeeeeeeee',
          name: '__Standard Values',
          parent: TEMPLATE_A_ID,
          template: TEMPLATE_A_ID,
          path: '/sitecore/templates/Test/A/__Standard Values',
          database: 'master',
          sharedFields: {},
          versionedFields: {
            en: { '1': { [FIELD_X_ID]: 'from registry SV' } },
          },
        },
      ],
    });

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: 'from registry SV' });
    expect(fields.Y).toEqual({ value: '' });
  });

  it('inherits from registry SV.sharedFields when the field is shared on the SV item', () => {
    const [template, section, fieldX, fieldY] = buildTemplateStructure();
    const item = makeItem({
      id: 'ffff0006-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
    });
    const engine = buildEngineWithRegistry({
      tree: [template, section, fieldX, fieldY, item],
      registry: [
        {
          id: 'eeee0007-eeee-eeee-eeee-eeeeeeeeeeee',
          name: '__Standard Values',
          parent: TEMPLATE_A_ID,
          template: TEMPLATE_A_ID,
          path: '/sitecore/templates/Test/A/__Standard Values',
          database: 'master',
          sharedFields: { [FIELD_X_ID]: 'from registry shared' },
        },
      ],
    });

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: 'from registry shared' });
  });

  it('falls through to empty default when neither item nor any SV carries the field', () => {
    const [template, section, fieldX, fieldY] = buildTemplateStructure();
    const item = makeItem({
      id: 'ffff0007-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/item',
      template: TEMPLATE_A_ID,
    });
    const engine = buildEngine([template, section, fieldX, fieldY, item]);
    // No SV registered - neither tree nor registry.

    const fields = formatItemFields(item, engine, '', '/sitecore/content', 'en');

    expect(fields.X).toEqual({ value: '' });
    expect(fields.Y).toEqual({ value: '' });
  });
});
