import { describe, it, expect, vi } from 'vitest';
import { resolveFieldIdByHintOnTemplate } from '../../../src/engine/layout/template-fields.js';
import {
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import type { RegistryItem } from '../../../src/engine/types.js';
import { makeItem, buildEngine, buildEngineWithRegistry } from './_helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a tree-based engine with a template that has one section and one field.
 * Returns the engine, the template ID, and the field item's ID.
 */
function buildTreeTemplateEngine(opts: {
  templateId: string;
  sectionId: string;
  fieldId: string;
  fieldName: string;
  baseTemplateId?: string;
}) {
  const { templateId, sectionId, fieldId, fieldName, baseTemplateId } = opts;

  const templateItem = makeItem({
    id: templateId,
    path: `/sitecore/templates/Project/RCR/${fieldName}Template`,
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields: baseTemplateId
      ? [{ id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${baseTemplateId.toUpperCase()}}` }]
      : [],
  });

  const sectionItem = makeItem({
    id: sectionId,
    parent: templateId,
    path: `/sitecore/templates/Project/RCR/${fieldName}Template/Data`,
    template: TEMPLATE_SECTION_TEMPLATE_ID,
    sharedFields: [],
  });

  const fieldItem = makeItem({
    id: fieldId,
    parent: sectionId,
    path: `/sitecore/templates/Project/RCR/${fieldName}Template/Data/${fieldName}`,
    template: TEMPLATE_FIELD_TEMPLATE_ID,
    sharedFields: [],
  });

  return buildEngine([templateItem, sectionItem, fieldItem]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveFieldIdByHintOnTemplate', () => {
  it('returns undefined for an unknown template', () => {
    const engine = buildEngine([]);
    const result = resolveFieldIdByHintOnTemplate(engine, 'ffffffff-0000-0000-0000-000000000099', 'UseContextItem');
    expect(result).toBeUndefined();
  });

  it('returns field ID when field is defined directly on the template (tree)', () => {
    const templateId = 'cc000001-0000-0000-0000-000000000001';
    const sectionId  = 'cc000001-0000-0000-0000-000000000002';
    const fieldId    = 'cc000001-0000-0000-0000-000000000003';

    const engine = buildTreeTemplateEngine({
      templateId,
      sectionId,
      fieldId,
      fieldName: 'UseContextItem',
    });

    const result = resolveFieldIdByHintOnTemplate(engine, templateId, 'UseContextItem');
    expect(result).toBe(fieldId.toLowerCase());
  });

  it('is case-insensitive on the hint', () => {
    const templateId = 'cc000002-0000-0000-0000-000000000001';
    const sectionId  = 'cc000002-0000-0000-0000-000000000002';
    const fieldId    = 'cc000002-0000-0000-0000-000000000003';

    const engine = buildTreeTemplateEngine({
      templateId,
      sectionId,
      fieldId,
      fieldName: 'UseContextItem',
    });

    expect(resolveFieldIdByHintOnTemplate(engine, templateId, 'USECONTEXTITEM')).toBe(fieldId.toLowerCase());
    expect(resolveFieldIdByHintOnTemplate(engine, templateId, 'usecontextitem')).toBe(fieldId.toLowerCase());
    expect(resolveFieldIdByHintOnTemplate(engine, templateId, 'UseContextItem')).toBe(fieldId.toLowerCase());
  });

  it('returns field ID from a base template when not defined directly on the subject template', () => {
    // Base template has the field; subject template inherits from it.
    const baseTemplateId   = 'cc000003-0000-0000-0000-000000000010';
    const baseSectionId    = 'cc000003-0000-0000-0000-000000000011';
    const baseFieldId      = 'cc000003-0000-0000-0000-000000000012';
    const subjectTemplateId = 'cc000003-0000-0000-0000-000000000020';

    const engine = buildTreeTemplateEngine({
      templateId: baseTemplateId,
      sectionId:  baseSectionId,
      fieldId:    baseFieldId,
      fieldName:  'ItemSelectorQuery',
    });

    // Add the subject template that inherits from baseTemplate but defines no fields itself.
    engine.getTree().addItem(
      makeItem({
        id: subjectTemplateId,
        path: '/sitecore/templates/Project/RCR/SubjectTemplate',
        template: TEMPLATE_TEMPLATE_ID,
        sharedFields: [
          {
            id: FIELD_IDS.baseTemplate,
            hint: '__Base template',
            value: `{${baseTemplateId.toUpperCase()}}`,
          },
        ],
      }),
      '/fake/subject.yml',
    );

    const result = resolveFieldIdByHintOnTemplate(engine, subjectTemplateId, 'ItemSelectorQuery');
    expect(result).toBe(baseFieldId.toLowerCase());
  });

  it('returns undefined when field name does not exist in template or its bases', () => {
    const templateId = 'cc000004-0000-0000-0000-000000000001';
    const sectionId  = 'cc000004-0000-0000-0000-000000000002';
    const fieldId    = 'cc000004-0000-0000-0000-000000000003';

    const engine = buildTreeTemplateEngine({
      templateId,
      sectionId,
      fieldId,
      fieldName: 'UseContextItem',
    });

    const result = resolveFieldIdByHintOnTemplate(engine, templateId, 'NonExistentField');
    expect(result).toBeUndefined();
  });

  it('returns field ID from a registry-based template (section + field as registry children)', () => {
    // Template, section, and field all live only in the registry.
    const templateId = 'cc000005-0000-0000-0000-000000000001';
    const sectionId  = 'cc000005-0000-0000-0000-000000000002';
    const fieldId    = 'cc000005-0000-0000-0000-000000000003';

    const regTemplate: RegistryItem = {
      id: templateId,
      name: 'RCR Settings Template',
      parent: 'parent-guid',
      template: TEMPLATE_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/RCRSettings',
      database: 'master',
      sharedFields: {},
    };
    const regSection: RegistryItem = {
      id: sectionId,
      name: 'Content',
      parent: templateId,
      template: TEMPLATE_SECTION_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/RCRSettings/Content',
      database: 'master',
      sharedFields: {},
    };
    const regField: RegistryItem = {
      id: fieldId,
      name: 'UseContextItem',
      parent: sectionId,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      path: '/sitecore/templates/System/RCR/RCRSettings/Content/UseContextItem',
      database: 'master',
      sharedFields: {},
    };

    const engine = buildEngineWithRegistry({
      tree: [],
      registry: [regTemplate, regSection, regField],
    });

    const result = resolveFieldIdByHintOnTemplate(engine, templateId, 'UseContextItem');
    expect(result).toBe(fieldId.toLowerCase());
  });

  it('returns same value on cache hit (second call returns same result)', () => {
    const templateId = 'cc000006-0000-0000-0000-000000000001';
    const sectionId  = 'cc000006-0000-0000-0000-000000000002';
    const fieldId    = 'cc000006-0000-0000-0000-000000000003';

    const engine = buildTreeTemplateEngine({
      templateId,
      sectionId,
      fieldId,
      fieldName: 'UseContextItem',
    });

    const first  = resolveFieldIdByHintOnTemplate(engine, templateId, 'UseContextItem');
    const second = resolveFieldIdByHintOnTemplate(engine, templateId, 'UseContextItem');
    expect(first).toBe(fieldId.toLowerCase());
    expect(second).toBe(first);
  });
});
