import { describe, expect, it, beforeEach } from 'vitest';
import { makeItem, buildEngine } from '../layout/_helpers.js';
import { getRenderingParametersSchema } from '../../../src/engine/template-schema.js';
import {
  FIELD_IDS,
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
} from '../../../src/engine/constants.js';
import { clearTemplateSchemaCache } from '../../../src/engine/template-schema.js';

// Stable GUIDs for fixtures
const RENDERING_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARAMS_TEMPLATE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000001';
const PARAMS_SECTION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002';
const FIELD_1_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000003';
const FIELD_2_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-000000000004';

const BASE_TEMPLATE_ID = 'cccccccc-cccc-cccc-cccc-000000000001';
const BASE_SECTION_ID = 'cccccccc-cccc-cccc-cccc-000000000002';
const BASE_FIELD_ID = 'cccccccc-cccc-cccc-cccc-000000000003';

beforeEach(() => {
  clearTemplateSchemaCache();
});

describe('getRenderingParametersSchema', () => {
  it('returns the schema fields from the rendering Parameters Template', () => {
    const engine = buildEngine([
      // Parameters template with 2 fields
      makeItem({
        id: PARAMS_TEMPLATE_ID,
        path: '/sitecore/templates/Feature/Test/EasingParams',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [],
      }),
      makeItem({
        id: PARAMS_SECTION_ID,
        parent: PARAMS_TEMPLATE_ID,
        path: '/sitecore/templates/Feature/Test/EasingParams/Parameters',
        template: TEMPLATE_SECTION_TEMPLATE_ID,
        sharedFields: [],
      }),
      makeItem({
        id: FIELD_1_ID,
        parent: PARAMS_SECTION_ID,
        path: '/sitecore/templates/Feature/Test/EasingParams/Parameters/EasingFunction',
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [
          { id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' },
        ],
      }),
      makeItem({
        id: FIELD_2_ID,
        parent: PARAMS_SECTION_ID,
        path: '/sitecore/templates/Feature/Test/EasingParams/Parameters/Speed',
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [
          { id: FIELD_IDS.type, hint: 'Type', value: 'Number' },
        ],
      }),
      // Rendering item with Parameters Template field pointing at the template above
      makeItem({
        id: RENDERING_ID,
        path: '/sitecore/layout/Renderings/Test/EasingWidget',
        sharedFields: [
          {
            id: FIELD_IDS.parametersTemplate,
            hint: 'Parameters Template',
            value: `{${PARAMS_TEMPLATE_ID.toUpperCase()}}`,
          },
        ],
      }),
    ]);

    const schema = getRenderingParametersSchema(engine, RENDERING_ID);
    expect(schema).not.toBeNull();

    const allFields = schema!.sections.flatMap(s => s.fields);
    const fieldNames = allFields.map(f => f.name);
    expect(fieldNames).toContain('EasingFunction');
    expect(fieldNames).toContain('Speed');
  });

  it('walks base-template chain (e.g. inherits Standard Rendering Parameters)', () => {
    const engine = buildEngine([
      // Base template with one field
      makeItem({
        id: BASE_TEMPLATE_ID,
        path: '/sitecore/templates/System/Layout/Rendering Parameters/Standard Rendering Parameters',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [],
      }),
      makeItem({
        id: BASE_SECTION_ID,
        parent: BASE_TEMPLATE_ID,
        path: '/sitecore/templates/System/Layout/Rendering Parameters/Standard Rendering Parameters/Parameters',
        template: TEMPLATE_SECTION_TEMPLATE_ID,
        sharedFields: [],
      }),
      makeItem({
        id: BASE_FIELD_ID,
        parent: BASE_SECTION_ID,
        path: '/sitecore/templates/System/Layout/Rendering Parameters/Standard Rendering Parameters/Parameters/Styles',
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [
          { id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' },
        ],
      }),
      // Derived parameters template with one own field, inheriting from base
      makeItem({
        id: PARAMS_TEMPLATE_ID,
        path: '/sitecore/templates/Feature/Test/AccordionParams',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [
          {
            id: FIELD_IDS.baseTemplate,
            hint: '__Base template',
            value: `{${BASE_TEMPLATE_ID.toUpperCase()}}`,
          },
        ],
      }),
      makeItem({
        id: PARAMS_SECTION_ID,
        parent: PARAMS_TEMPLATE_ID,
        path: '/sitecore/templates/Feature/Test/AccordionParams/Parameters',
        template: TEMPLATE_SECTION_TEMPLATE_ID,
        sharedFields: [],
      }),
      makeItem({
        id: FIELD_1_ID,
        parent: PARAMS_SECTION_ID,
        path: '/sitecore/templates/Feature/Test/AccordionParams/Parameters/CanOpenMultiple',
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [
          { id: FIELD_IDS.type, hint: 'Type', value: 'Checkbox' },
        ],
      }),
      // Rendering item pointing at derived params template
      makeItem({
        id: RENDERING_ID,
        path: '/sitecore/layout/Renderings/Test/Accordion',
        sharedFields: [
          {
            id: FIELD_IDS.parametersTemplate,
            hint: 'Parameters Template',
            value: `{${PARAMS_TEMPLATE_ID.toUpperCase()}}`,
          },
        ],
      }),
    ]);

    const schema = getRenderingParametersSchema(engine, RENDERING_ID);
    expect(schema).not.toBeNull();

    const allFields = schema!.sections.flatMap(s => s.fields);
    const fieldNames = allFields.map(f => f.name);
    // Own field from derived template
    expect(fieldNames).toContain('CanOpenMultiple');
    // Inherited field from base template
    expect(fieldNames).toContain('Styles');
  });

  it('returns null when rendering has no Parameters Template field', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'BareRendering',
        path: '/sitecore/layout/Renderings/BareRendering',
        sharedFields: [],
      }),
    ]);
    expect(getRenderingParametersSchema(engine, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBeNull();
  });

  it('returns null when rendering does not exist', () => {
    const engine = buildEngine([]);
    expect(getRenderingParametersSchema(engine, '99999999-9999-9999-9999-999999999999')).toBeNull();
  });
});
