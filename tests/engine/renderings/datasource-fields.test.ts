import { describe, expect, it } from 'vitest';
import type { RegistryItem } from '../../../src/engine/types.js';
import {
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import { resolveDatasourceFields } from '../../../src/engine/renderings/datasource-fields.js';
import { buildEngine, buildEngineWithRegistry, makeItem } from '../layout/_helpers.js';
import {
  HINT_DATASOURCE_TEMPLATE,
  HINT_DATASOURCE_LOCATION,
  DATASOURCE_TEMPLATE_FIELD_ID,
  DATASOURCE_LOCATION_FIELD_ID,
  RENDERING_ID,
  BARE_RENDERING_ID,
  buildEngineWithRenderingFixture,
} from './_fixtures.js';

// Synthetic-fixture rationale lives in tests/engine/renderings/_fixtures.ts.
// In short: content tree spot-check found zero rendering items in the live registry
// that populate the Datasource Template / Datasource Location fields, so
// these tests stand up a synthetic rendering + template chain.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveDatasourceFields', () => {
  it('returns datasourceLocation for a rendering that has it set', () => {
    const engine = buildEngineWithRenderingFixture({
      locationValue: '/sitecore/content/tenant/site/Data/Articles',
    });

    const result = resolveDatasourceFields(engine, RENDERING_ID);
    expect(result).not.toBeNull();
    expect(result!.datasourceLocation).toBe('/sitecore/content/tenant/site/Data/Articles');
    expect(result!.datasourceTemplate).toBeUndefined();
  });

  it('returns datasourceTemplate for a rendering that has it set', () => {
    const engine = buildEngineWithRenderingFixture({
      templateValue: '{683910CA-9213-4196-A949-B5C2A86C90BC}',
    });

    const result = resolveDatasourceFields(engine, RENDERING_ID);
    expect(result).not.toBeNull();
    expect(result!.datasourceTemplate).toMatch(/^\{[0-9A-F-]{36}\}$/);
    expect(result!.datasourceTemplate).toBe('{683910CA-9213-4196-A949-B5C2A86C90BC}');
    expect(result!.datasourceLocation).toBeUndefined();
  });

  it('returns both datasourceTemplate and datasourceLocation when both are set', () => {
    const engine = buildEngineWithRenderingFixture({
      templateValue: '{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}',
      locationValue: '/sitecore/content/tenant/site/Data/Items',
    });

    const result = resolveDatasourceFields(engine, RENDERING_ID);
    expect(result).not.toBeNull();
    // Lower-case input is normalised to upper-case braced GUID.
    expect(result!.datasourceTemplate).toBe('{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}');
    expect(result!.datasourceLocation).toBe('/sitecore/content/tenant/site/Data/Items');
  });

  it('returns undefined fields when the rendering does not declare them (template chain has no such field)', () => {
    const engine = buildEngineWithRenderingFixture({});

    const result = resolveDatasourceFields(engine, BARE_RENDERING_ID);
    expect(result).not.toBeNull();
    expect(result!.datasourceTemplate).toBeUndefined();
    expect(result!.datasourceLocation).toBeUndefined();
  });

  it('returns undefined fields when the rendering exists but stores no value', () => {
    // Rendering's template chain declares the fields, but the rendering
    // item has no shared-field entry for them.
    const engine = buildEngineWithRenderingFixture({});

    const result = resolveDatasourceFields(engine, RENDERING_ID);
    expect(result).not.toBeNull();
    expect(result!.datasourceTemplate).toBeUndefined();
    expect(result!.datasourceLocation).toBeUndefined();
  });

  it('returns null when the rendering id does not exist', () => {
    const engine = buildEngineWithRenderingFixture({});

    const result = resolveDatasourceFields(engine, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(result).toBeNull();
  });

  it('treats whitespace-only field values as undefined', () => {
    const engine = buildEngineWithRenderingFixture({
      templateValue: '   ',
      locationValue: '\n\t  ',
    });

    const result = resolveDatasourceFields(engine, RENDERING_ID);
    expect(result).not.toBeNull();
    expect(result!.datasourceTemplate).toBeUndefined();
    expect(result!.datasourceLocation).toBeUndefined();
  });

  it('passes through non-GUID location values verbatim (after trim)', () => {
    const engine = buildEngineWithRenderingFixture({
      locationValue: '  /sitecore/content/Home/Data  ',
    });

    const result = resolveDatasourceFields(engine, RENDERING_ID);
    expect(result).not.toBeNull();
    expect(result!.datasourceLocation).toBe('/sitecore/content/Home/Data');
  });

  it('inherits Datasource Template/Location field defs from a base template chain', () => {
    // Subject rendering's own template inherits from a base that declares the
    // Datasource fields. resolveFieldIdByHintOnTemplate must walk the chain.
    const baseTemplateId = 'cc000030-0000-0000-0000-000000000001';
    const baseSectionId  = 'cc000030-0000-0000-0000-000000000002';
    const subjectTemplateId = 'cc000030-0000-0000-0000-000000000010';
    const subjectRenderingId = 'dd000030-0000-0000-0000-000000000001';

    const items = [
      makeItem({
        id: baseTemplateId,
        path: '/sitecore/templates/Project/Test/BaseRenderingOptions',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [],
      }),
      makeItem({
        id: baseSectionId,
        parent: baseTemplateId,
        path: '/sitecore/templates/Project/Test/BaseRenderingOptions/Editor Options',
        template: TEMPLATE_SECTION_TEMPLATE_ID,
        sharedFields: [],
      }),
      makeItem({
        id: DATASOURCE_LOCATION_FIELD_ID,
        parent: baseSectionId,
        path: '/sitecore/templates/Project/Test/BaseRenderingOptions/Editor Options/Datasource Location',
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [],
      }),
      // Subject template inherits from base; declares no fields itself.
      makeItem({
        id: subjectTemplateId,
        path: '/sitecore/templates/Project/Test/SubjectRendering',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [
          {
            id: FIELD_IDS.baseTemplate,
            hint: '__Base template',
            value: `{${baseTemplateId.toUpperCase()}}`,
          },
        ],
      }),
      makeItem({
        id: subjectRenderingId,
        path: '/sitecore/layout/renderings/test/SubjectRendering',
        template: subjectTemplateId,
        sharedFields: [
          {
            id: DATASOURCE_LOCATION_FIELD_ID,
            hint: '',
            value: '/sitecore/content/Home/Data',
          },
        ],
      }),
    ];

    const engine = buildEngine(items);
    const result = resolveDatasourceFields(engine, subjectRenderingId);
    expect(result).not.toBeNull();
    expect(result!.datasourceLocation).toBe('/sitecore/content/Home/Data');
  });

  it('resolves Datasource fields when rendering and template chain are registry-only', () => {
    // Mirrors the canonical SXA production shape: rendering items under
    // /sitecore/layout/renderings and their template chain under
    // /sitecore/templates/... live entirely in the registry, with zero
    // serialized counterparts. The implementation must walk the registry
    // for both lookupUnifiedItem (the rendering) and walkBaseTemplates +
    // getChildren (the template's section/field children).
    const REG_TEMPLATE_ID  = 'ee000010-0000-0000-0000-000000000001';
    const REG_SECTION_ID   = 'ee000010-0000-0000-0000-000000000002';
    const REG_RENDERING_ID = 'ef000001-0000-0000-0000-000000000001';

    const registryItems: RegistryItem[] = [
      {
        id: REG_TEMPLATE_ID,
        name: 'JsonRendering',
        parent: '00000000-0000-0000-0000-000000000000',
        template: TEMPLATE_TEMPLATE_ID,
        path: '/sitecore/templates/Project/Test/JsonRendering',
        database: 'master',
        sharedFields: {},
      },
      {
        id: REG_SECTION_ID,
        name: 'Editor Options',
        parent: REG_TEMPLATE_ID,
        template: TEMPLATE_SECTION_TEMPLATE_ID,
        path: '/sitecore/templates/Project/Test/JsonRendering/Editor Options',
        database: 'master',
        sharedFields: {},
      },
      {
        id: DATASOURCE_TEMPLATE_FIELD_ID,
        name: HINT_DATASOURCE_TEMPLATE,
        parent: REG_SECTION_ID,
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        path: '/sitecore/templates/Project/Test/JsonRendering/Editor Options/Datasource Template',
        database: 'master',
        sharedFields: {},
      },
      {
        id: DATASOURCE_LOCATION_FIELD_ID,
        name: HINT_DATASOURCE_LOCATION,
        parent: REG_SECTION_ID,
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        path: '/sitecore/templates/Project/Test/JsonRendering/Editor Options/Datasource Location',
        database: 'master',
        sharedFields: {},
      },
      {
        id: REG_RENDERING_ID,
        name: 'MyRegistryRendering',
        parent: '00000000-0000-0000-0000-000000000000',
        template: REG_TEMPLATE_ID,
        path: '/sitecore/layout/renderings/test/MyRegistryRendering',
        database: 'master',
        sharedFields: {
          [DATASOURCE_TEMPLATE_FIELD_ID]: '{683910CA-9213-4196-A949-B5C2A86C90BC}',
          [DATASOURCE_LOCATION_FIELD_ID]: '/sitecore/content/tenant/site/Data/Articles',
        },
      },
    ];

    const engine = buildEngineWithRegistry({ tree: [], registry: registryItems });
    const result = resolveDatasourceFields(engine, REG_RENDERING_ID);
    expect(result).not.toBeNull();
    expect(result!.datasourceTemplate).toBe('{683910CA-9213-4196-A949-B5C2A86C90BC}');
    expect(result!.datasourceLocation).toBe('/sitecore/content/tenant/site/Data/Articles');
  });
});
