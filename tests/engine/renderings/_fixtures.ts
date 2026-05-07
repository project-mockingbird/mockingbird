import {
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
} from '../../../src/engine/constants.js';
import type { Engine } from '../../../src/engine/index.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';

/**
 * Shared synthetic fixtures for renderings tests; specifically the
 * Datasource Template / Datasource Location field-resolution fixture used by
 * both the engine-level resolveDatasourceFields tests and the API-level
 * GET /api/renderings/:id tests.
 *
 * Lives here (not in src/) because it is test-only; mirrors the
 * tests/engine/layout/_helpers.ts convention.
 *
 * Content tree rationale: zero rendering items in the live registry populate the
 * Datasource Template (1a7c85e5-...) or Datasource Location (b5b27af1-...)
 * fields, so tests that exercise resolveDatasourceFields must stand up a
 * synthetic rendering + template chain that declares those fields by their
 * content-tree-verified hint strings. See datasource-fields.test.ts for the
 * full content tree spot-check rationale.
 */

export const HINT_DATASOURCE_TEMPLATE = 'Datasource Template';
export const HINT_DATASOURCE_LOCATION = 'Datasource Location';

// Real content tree IDs for the two field definitions (verified via registry scan).
export const DATASOURCE_TEMPLATE_FIELD_ID = '1a7c85e5-dc0b-490d-9187-bb1dbcb4c72f';
export const DATASOURCE_LOCATION_FIELD_ID = 'b5b27af1-25ef-405c-87ce-369b3a004016';

export const RENDERING_TEMPLATE_ID = 'cc000010-0000-0000-0000-000000000001';
export const SECTION_ID            = 'cc000010-0000-0000-0000-000000000002';
export const RENDERING_ID          = 'dd000001-0000-0000-0000-000000000001';

export const BARE_TEMPLATE_ID      = 'cc000020-0000-0000-0000-000000000001';
export const BARE_RENDERING_ID     = 'dd000002-0000-0000-0000-000000000001';

/**
 * Build an engine with a rendering whose template chain declares
 * "Datasource Template" and "Datasource Location" field definitions, then
 * a rendering item that may or may not populate values for those fields.
 *
 * Also seeds a second "bare" rendering whose template chain has NO Datasource
 * fields - used for the "template chain has no such field" negative case.
 */
export function buildEngineWithRenderingFixture(opts: {
  templateValue?: string;
  locationValue?: string;
}): Engine {
  const items = [
    // Template item.
    makeItem({
      id: RENDERING_TEMPLATE_ID,
      path: '/sitecore/templates/Project/Test/JsonRendering',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [],
    }),
    // Section under template.
    makeItem({
      id: SECTION_ID,
      parent: RENDERING_TEMPLATE_ID,
      path: '/sitecore/templates/Project/Test/JsonRendering/Editor Options',
      template: TEMPLATE_SECTION_TEMPLATE_ID,
      sharedFields: [],
    }),
    // Field defs inside the section (named exactly per Sitecore content tree).
    makeItem({
      id: DATASOURCE_TEMPLATE_FIELD_ID,
      parent: SECTION_ID,
      path: '/sitecore/templates/Project/Test/JsonRendering/Editor Options/Datasource Template',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [],
    }),
    makeItem({
      id: DATASOURCE_LOCATION_FIELD_ID,
      parent: SECTION_ID,
      path: '/sitecore/templates/Project/Test/JsonRendering/Editor Options/Datasource Location',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [],
    }),
  ];

  const renderingSharedFields = [];
  if (opts.templateValue !== undefined) {
    renderingSharedFields.push({
      // hint intentionally empty: matches actual registry-item shape where
      // shared-field hints are typically blank, and resolveDatasourceFields
      // looks up by ID (not hint) when reading the rendering item's value.
      id: DATASOURCE_TEMPLATE_FIELD_ID,
      hint: '',
      value: opts.templateValue,
    });
  }
  if (opts.locationValue !== undefined) {
    renderingSharedFields.push({
      id: DATASOURCE_LOCATION_FIELD_ID,
      hint: '',
      value: opts.locationValue,
    });
  }

  items.push(
    makeItem({
      id: RENDERING_ID,
      path: '/sitecore/layout/renderings/test/MyRendering',
      template: RENDERING_TEMPLATE_ID,
      sharedFields: renderingSharedFields,
    }),
  );

  // A second rendering whose template chain has NO Datasource fields - used
  // for the "template chain has no such field" negative case.
  items.push(
    makeItem({
      id: BARE_TEMPLATE_ID,
      path: '/sitecore/templates/Project/Test/BareTemplate',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [],
    }),
    makeItem({
      id: BARE_RENDERING_ID,
      path: '/sitecore/layout/renderings/test/BareRendering',
      template: BARE_TEMPLATE_ID,
      sharedFields: [],
    }),
  );

  return buildEngine(items);
}
