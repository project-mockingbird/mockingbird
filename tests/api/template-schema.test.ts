import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTemplateSchema,
  enrichSchemaWithStoredFields,
  clearTemplateSchemaCache,
  type TemplateSchema,
} from '../../src/api/template-schema.js';
import type { Engine } from '../../src/engine/index.js';
import type { RegistryItem } from '../../src/engine/types.js';
import {
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  STANDARD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../src/engine/constants.js';

// ---------------------------------------------------------------------------
// Helpers to build mock data
// ---------------------------------------------------------------------------

function makeRegistryItem(overrides: Partial<RegistryItem> & { id: string; name: string }): RegistryItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db', // Template template
    path: `/sitecore/templates/${overrides.name}`,
    database: 'master',
    sharedFields: {},
    ...overrides,
  };
}

function makeSection(id: string, name: string, sortOrder?: number, fields: Record<string, string> = {}): RegistryItem {
  const sharedFields: Record<string, string> = { ...fields };
  if (sortOrder !== undefined) {
    sharedFields[FIELD_IDS.sortorder] = String(sortOrder);
  }
  return makeRegistryItem({
    id,
    name,
    template: TEMPLATE_SECTION_TEMPLATE_ID,
    sharedFields,
  });
}

function makeField(id: string, name: string, type: string, sortOrder?: number): RegistryItem {
  const sharedFields: Record<string, string> = {
    [FIELD_IDS.type]: type,
  };
  if (sortOrder !== undefined) {
    sharedFields[FIELD_IDS.sortorder] = String(sortOrder);
  }
  return makeRegistryItem({
    id,
    name,
    template: TEMPLATE_FIELD_TEMPLATE_ID,
    sharedFields,
  });
}

type MockEngine = Pick<Engine, 'getItemById' | 'getRegistryItem' | 'getRegistryChildren'>;

function createMockEngine(
  registryItems: Map<string, RegistryItem>,
  childrenMap: Map<string, RegistryItem[]>,
): MockEngine {
  return {
    getItemById: () => undefined,
    getRegistryItem: (id: string) => registryItems.get(id),
    getRegistryChildren: (parentId: string) => childrenMap.get(parentId) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getTemplateSchema', () => {
  beforeEach(() => {
    clearTemplateSchemaCache();
  });

  it('returns empty sections for unknown template', () => {
    const engine = createMockEngine(new Map(), new Map());
    const schema = getTemplateSchema('nonexistent-id', engine as unknown as Engine);
    expect(schema.sections).toEqual([]);
  });

  it('collects sections and fields from a registry template', () => {
    const templateId = 'aaaa0000-0000-0000-0000-000000000001';
    const sectionId = 'bbbb0000-0000-0000-0000-000000000001';
    const fieldId = 'cccc0000-0000-0000-0000-000000000001';

    // Anchor the template to Standard so the section is not flagged as a
    // structural fragment (only null-base templates get that flag, and only
    // Standard's own sub-sections get isStandard=true).
    const template = makeRegistryItem({
      id: templateId,
      name: 'TestTemplate',
      sharedFields: { [FIELD_IDS.baseTemplate]: `{${STANDARD_TEMPLATE_ID.toUpperCase()}}` },
    });
    const section = makeSection(sectionId, 'Content', 100);
    const field = makeField(fieldId, 'Title', 'Single-Line Text', 100);

    const registry = new Map<string, RegistryItem>([
      [templateId, template],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [templateId, [section]],
      [sectionId, [field]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(templateId, engine as unknown as Engine);

    expect(schema.sections).toHaveLength(1);
    expect(schema.sections[0].name).toBe('Content');
    expect(schema.sections[0].id).toBe(sectionId);
    expect(schema.sections[0].sortOrder).toBe(100);
    expect(schema.sections[0].isStandard).toBe(false);
    expect(schema.sections[0].fields).toHaveLength(1);
    expect(schema.sections[0].fields[0]).toEqual({
      id: fieldId,
      name: 'Title',
      // Field has no Title/__Display name unversioned override, so the
      // user-facing label falls back to the item's tree name.
      displayName: 'Title',
      type: 'Single-Line Text',
      source: '',
      shared: false,
      unversioned: false,
      sortOrder: 100,
    });
    expect(schema.sections[0].sourceTemplateId).toBe(templateId);
  });

  it('flags sections from null-base structural templates as isStructuralFragment', () => {
    // SXA "structural fragment" templates like _Name, _Description, _Site Template
    // have __Base template set to an all-zero GUID. They contribute sections
    // (e.g. Metadata) that Content Editor hides under Show Standard Fields = OFF,
    // even though those sections aren't __-prefixed Standard fields. They must
    // surface in the Standard Fields tab via the UI's combined filter, but
    // `isStandard` stays false so layout JSON emission still includes the
    // section's fields - they're authored content, not Sitecore system fields.
    const templateId = 'aaaa0000-0000-0000-0000-000000000099';
    const sectionId = 'bbbb0000-0000-0000-0000-000000000099';
    const fieldId = 'cccc0000-0000-0000-0000-000000000099';

    const template = makeRegistryItem({
      id: templateId,
      name: '_StructuralBase',
      sharedFields: { [FIELD_IDS.baseTemplate]: '{00000000-0000-0000-0000-000000000000}' },
    });
    const section = makeSection(sectionId, 'Metadata', 100);
    const field = makeField(fieldId, 'Name', 'Single-Line Text', 100);

    const registry = new Map<string, RegistryItem>([[templateId, template]]);
    const children = new Map<string, RegistryItem[]>([
      [templateId, [section]],
      [sectionId, [field]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(templateId, engine as unknown as Engine);

    expect(schema.sections).toHaveLength(1);
    expect(schema.sections[0].name).toBe('Metadata');
    expect(schema.sections[0].isStandard).toBe(false);
    expect(schema.sections[0].isStructuralFragment).toBe(true);
  });

  it('also flags sections from templates with an entirely missing base field', () => {
    // Same effect as an all-zero base: when parseBraceGuids returns no
    // inheritable GUIDs, the template is treated as a structural fragment.
    const templateId = 'aaaa0000-0000-0000-0000-0000000000aa';
    const sectionId = 'bbbb0000-0000-0000-0000-0000000000aa';
    const fieldId = 'cccc0000-0000-0000-0000-0000000000aa';

    const template = makeRegistryItem({ id: templateId, name: '_NoBaseField' });
    const section = makeSection(sectionId, 'Custom', 100);
    const field = makeField(fieldId, 'Anything', 'Single-Line Text', 100);

    const registry = new Map<string, RegistryItem>([[templateId, template]]);
    const children = new Map<string, RegistryItem[]>([
      [templateId, [section]],
      [sectionId, [field]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(templateId, engine as unknown as Engine);
    expect(schema.sections[0].isStandard).toBe(false);
    expect(schema.sections[0].isStructuralFragment).toBe(true);
  });

  it('sorts sections and fields by sortOrder then alphabetically', () => {
    const templateId = 'aaaa0000-0000-0000-0000-000000000002';
    const sectionBId = 'bbbb0000-0000-0000-0000-000000000002';
    const sectionAId = 'bbbb0000-0000-0000-0000-000000000003';

    const fieldZId = 'cccc0000-0000-0000-0000-000000000002';
    const fieldAId = 'cccc0000-0000-0000-0000-000000000003';
    const fieldMId = 'cccc0000-0000-0000-0000-000000000004';

    const template = makeRegistryItem({ id: templateId, name: 'SortTest' });
    // Section B has higher sort order (200), Section A has lower (100)
    const sectionB = makeSection(sectionBId, 'Bravo', 200);
    const sectionA = makeSection(sectionAId, 'Alpha', 100);

    // Fields within section A: Z at 200, A at 100, M at 100 (tie broken alphabetically)
    const fieldZ = makeField(fieldZId, 'Zulu', 'Single-Line Text', 200);
    const fieldA = makeField(fieldAId, 'Alpha', 'Single-Line Text', 100);
    const fieldM = makeField(fieldMId, 'Mike', 'Single-Line Text', 100);

    const registry = new Map<string, RegistryItem>([
      [templateId, template],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [templateId, [sectionB, sectionA]],
      [sectionAId, [fieldZ, fieldA, fieldM]],
      [sectionBId, []],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(templateId, engine as unknown as Engine);

    // Sections sorted by sortOrder: Alpha(100) before Bravo(200)
    expect(schema.sections.map(s => s.name)).toEqual(['Alpha', 'Bravo']);

    // Fields sorted by sortOrder then name: Alpha(100), Mike(100), Zulu(200)
    expect(schema.sections[0].fields.map(f => f.name)).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('walks base template inheritance', () => {
    const baseTemplateId = 'aaaa0000-0000-0000-0000-000000000010';
    const derivedTemplateId = 'aaaa0000-0000-0000-0000-000000000011';
    const baseSectionId = 'bbbb0000-0000-0000-0000-000000000010';
    const derivedSectionId = 'bbbb0000-0000-0000-0000-000000000011';
    const baseFieldId = 'cccc0000-0000-0000-0000-000000000010';
    const derivedFieldId = 'cccc0000-0000-0000-0000-000000000011';

    const baseTemplate = makeRegistryItem({
      id: baseTemplateId,
      name: 'BaseTemplate',
      sharedFields: {},
    });
    const derivedTemplate = makeRegistryItem({
      id: derivedTemplateId,
      name: 'DerivedTemplate',
      sharedFields: {
        [FIELD_IDS.baseTemplate]: `{${baseTemplateId}}`,
      },
    });

    const baseSection = makeSection(baseSectionId, 'BaseSection', 100);
    const derivedSection = makeSection(derivedSectionId, 'DerivedSection', 50);
    const baseField = makeField(baseFieldId, 'BaseField', 'Single-Line Text', 100);
    const derivedField = makeField(derivedFieldId, 'DerivedField', 'Rich Text', 100);

    const registry = new Map<string, RegistryItem>([
      [baseTemplateId, baseTemplate],
      [derivedTemplateId, derivedTemplate],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [derivedTemplateId, [derivedSection]],
      [derivedSectionId, [derivedField]],
      [baseTemplateId, [baseSection]],
      [baseSectionId, [baseField]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(derivedTemplateId, engine as unknown as Engine);

    expect(schema.sections).toHaveLength(2);
    // DerivedSection(50) before BaseSection(100)
    expect(schema.sections.map(s => s.name)).toEqual(['DerivedSection', 'BaseSection']);
    expect(schema.sections[0].fields[0].name).toBe('DerivedField');
    expect(schema.sections[1].fields[0].name).toBe('BaseField');
  });

  it('marks standard template sections as isStandard', () => {
    const templateId = 'aaaa0000-0000-0000-0000-000000000020';
    const ownSectionId = 'bbbb0000-0000-0000-0000-000000000020';
    const stdSectionId = 'bbbb0000-0000-0000-0000-000000000021';

    const template = makeRegistryItem({
      id: templateId,
      name: 'MyTemplate',
      sharedFields: {
        [FIELD_IDS.baseTemplate]: `{${STANDARD_TEMPLATE_ID}}`,
      },
    });

    const standardTemplate = makeRegistryItem({
      id: STANDARD_TEMPLATE_ID,
      name: 'Standard Template',
    });

    const ownSection = makeSection(ownSectionId, 'Content', 100);
    const stdSection = makeSection(stdSectionId, 'Statistics', 100);
    const stdField = makeField('cccc0000-0000-0000-0000-000000000020', '__Created', 'Datetime', 100);

    const registry = new Map<string, RegistryItem>([
      [templateId, template],
      [STANDARD_TEMPLATE_ID, standardTemplate],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [templateId, [ownSection]],
      [ownSectionId, []],
      [STANDARD_TEMPLATE_ID, [stdSection]],
      [stdSectionId, [stdField]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(templateId, engine as unknown as Engine);

    const ownResult = schema.sections.find(s => s.name === 'Content');
    const stdResult = schema.sections.find(s => s.name === 'Statistics');
    expect(ownResult?.isStandard).toBe(false);
    expect(stdResult?.isStandard).toBe(true);
    expect(stdResult?.fields[0].name).toBe('__Created');
  });

  it('handles circular inheritance without infinite loop', () => {
    const templateAId = 'aaaa0000-0000-0000-0000-000000000030';
    const templateBId = 'aaaa0000-0000-0000-0000-000000000031';

    const templateA = makeRegistryItem({
      id: templateAId,
      name: 'CircularA',
      sharedFields: {
        [FIELD_IDS.baseTemplate]: `{${templateBId}}`,
      },
    });
    const templateB = makeRegistryItem({
      id: templateBId,
      name: 'CircularB',
      sharedFields: {
        [FIELD_IDS.baseTemplate]: `{${templateAId}}`,
      },
    });

    const sectionA = makeSection('bbbb0000-0000-0000-0000-000000000030', 'SectionA', 100);
    const sectionB = makeSection('bbbb0000-0000-0000-0000-000000000031', 'SectionB', 200);

    const registry = new Map<string, RegistryItem>([
      [templateAId, templateA],
      [templateBId, templateB],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [templateAId, [sectionA]],
      ['bbbb0000-0000-0000-0000-000000000030', []],
      [templateBId, [sectionB]],
      ['bbbb0000-0000-0000-0000-000000000031', []],
    ]);

    const engine = createMockEngine(registry, children);
    // Should not throw or hang
    const schema = getTemplateSchema(templateAId, engine as unknown as Engine);
    expect(schema.sections).toHaveLength(2);
    expect(schema.sections.map(s => s.name)).toContain('SectionA');
    expect(schema.sections.map(s => s.name)).toContain('SectionB');
  });

  it('deduplicates sections from multiple inheritance levels by case-insensitive NAME', () => {
    // Sitecore identity for cross-template section merging is the
    // case-insensitive section name (Sitecore.Kernel.decompiled.cs:341273-
    // 341276 + 341628-341662). Two sections with the same name but
    // different item IDs across the chain merge to ONE.
    const grandparentId = 'aaaa0000-0000-0000-0000-000000000040';
    const parentId = 'aaaa0000-0000-0000-0000-000000000041';
    const childId = 'aaaa0000-0000-0000-0000-000000000042';
    const parentDataSectionId = 'bbbb0000-0000-0000-0000-000000000040';
    const grandparentDataSectionId = 'bbbb0000-0000-0000-0000-000000000043';

    const grandparent = makeRegistryItem({ id: grandparentId, name: 'Grandparent' });
    const parent = makeRegistryItem({
      id: parentId,
      name: 'Parent',
      sharedFields: { [FIELD_IDS.baseTemplate]: `{${grandparentId}}` },
    });
    const child = makeRegistryItem({
      id: childId,
      name: 'Child',
      sharedFields: { [FIELD_IDS.baseTemplate]: `{${parentId}}` },
    });

    // Both parent and grandparent declare a section literally named "Data"
    // - distinct item IDs in the registry, same name. This is the
    // realistic case that triggers backlog #7.
    const parentSection = makeSection(parentDataSectionId, 'Data', 100);
    const grandparentSection = makeSection(grandparentDataSectionId, 'Data', 200);
    const uniqueSection = makeSection('bbbb0000-0000-0000-0000-000000000041', 'Extra', 50);

    const registry = new Map<string, RegistryItem>([
      [grandparentId, grandparent],
      [parentId, parent],
      [childId, child],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [childId, []],
      [parentId, [parentSection, uniqueSection]],
      [parentDataSectionId, []],
      ['bbbb0000-0000-0000-0000-000000000041', []],
      [grandparentId, [grandparentSection]],
      [grandparentDataSectionId, []],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(childId, engine as unknown as Engine);

    const dataSections = schema.sections.filter(s => s.name.toLowerCase() === 'data');
    expect(dataSections).toHaveLength(1);
    // Most-derived (parent) wins for section metadata.
    expect(dataSections[0].id).toBe(parentDataSectionId);
    expect(dataSections[0].sortOrder).toBe(100);
    expect(schema.sections).toHaveLength(2); // Data + Extra
  });

  it('merges fields from same-named sections in the inheritance chain', () => {
    // Backlog #7: when Template A has Section1 with field1, and base
    // Template B has Section1 with field2, the schema should expose ONE
    // Section1 containing both field1 and field2.
    const baseId = 'aaaa0000-0000-0000-0000-000000000050';
    const derivedId = 'aaaa0000-0000-0000-0000-000000000051';
    const baseSectionId = 'bbbb0000-0000-0000-0000-000000000050';
    const derivedSectionId = 'bbbb0000-0000-0000-0000-000000000051';
    const baseFieldId = 'cccc0000-0000-0000-0000-000000000050';
    const derivedFieldId = 'cccc0000-0000-0000-0000-000000000051';

    const base = makeRegistryItem({ id: baseId, name: 'Base' });
    const derived = makeRegistryItem({
      id: derivedId,
      name: 'Derived',
      sharedFields: { [FIELD_IDS.baseTemplate]: `{${baseId}}` },
    });
    const baseSection = makeSection(baseSectionId, 'Designing', 100);
    const derivedSection = makeSection(derivedSectionId, 'Designing', 100);
    const baseField = makeField(baseFieldId, 'PartialDesigns', 'Multiroot Treelist', 200);
    const derivedField = makeField(derivedFieldId, 'TemplatesMapping', 'Lookup Name Lookup Value List', 100);

    const registry = new Map<string, RegistryItem>([
      [baseId, base],
      [derivedId, derived],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [derivedId, [derivedSection]],
      [derivedSectionId, [derivedField]],
      [baseId, [baseSection]],
      [baseSectionId, [baseField]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(derivedId, engine as unknown as Engine);

    expect(schema.sections).toHaveLength(1);
    expect(schema.sections[0].name).toBe('Designing');
    // Both fields present, sorted by sortOrder (TemplatesMapping=100 first).
    expect(schema.sections[0].fields.map(f => f.name)).toEqual([
      'TemplatesMapping',
      'PartialDesigns',
    ]);
  });

  it('treats section names as case-insensitive when merging', () => {
    // Sitecore.Kernel.decompiled.cs:341276 lowercases the name before
    // matching: `DoGetSection(ID.Null, sectionName.ToLowerInvariant(), 0)`.
    const baseId = 'aaaa0000-0000-0000-0000-000000000060';
    const derivedId = 'aaaa0000-0000-0000-0000-000000000061';
    const baseSectionId = 'bbbb0000-0000-0000-0000-000000000060';
    const derivedSectionId = 'bbbb0000-0000-0000-0000-000000000061';

    const base = makeRegistryItem({ id: baseId, name: 'Base' });
    const derived = makeRegistryItem({
      id: derivedId,
      name: 'Derived',
      sharedFields: { [FIELD_IDS.baseTemplate]: `{${baseId}}` },
    });
    // Note the case difference: "Data" vs "data".
    const derivedSection = makeSection(derivedSectionId, 'Data', 100);
    const baseSection = makeSection(baseSectionId, 'data', 100);
    const derivedField = makeField('cccc0000-0000-0000-0000-000000000060', 'Field1', 'Single-Line Text', 100);
    const baseField = makeField('cccc0000-0000-0000-0000-000000000061', 'Field2', 'Single-Line Text', 200);

    const registry = new Map<string, RegistryItem>([
      [baseId, base],
      [derivedId, derived],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [derivedId, [derivedSection]],
      [derivedSectionId, [derivedField]],
      [baseId, [baseSection]],
      [baseSectionId, [baseField]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(derivedId, engine as unknown as Engine);

    expect(schema.sections).toHaveLength(1);
    // The most-derived contributor's casing wins for the displayed name.
    expect(schema.sections[0].name).toBe('Data');
    expect(schema.sections[0].fields.map(f => f.name)).toEqual(['Field1', 'Field2']);
  });

  it('drops duplicate field IDs across same-named sections (most-derived wins)', () => {
    // Field-ID collision should not surface twice. Mirrors
    // Sitecore.Kernel.decompiled.cs:341512's `if (!result.ContainsKey(value.ID))`
    // dedup in Template.AddFields.
    const baseId = 'aaaa0000-0000-0000-0000-000000000070';
    const derivedId = 'aaaa0000-0000-0000-0000-000000000071';
    const baseSectionId = 'bbbb0000-0000-0000-0000-000000000070';
    const derivedSectionId = 'bbbb0000-0000-0000-0000-000000000071';
    const sharedFieldId = 'cccc0000-0000-0000-0000-000000000070';

    const base = makeRegistryItem({ id: baseId, name: 'Base' });
    const derived = makeRegistryItem({
      id: derivedId,
      name: 'Derived',
      sharedFields: { [FIELD_IDS.baseTemplate]: `{${baseId}}` },
    });
    const derivedSection = makeSection(derivedSectionId, 'Data', 100);
    const baseSection = makeSection(baseSectionId, 'Data', 100);
    // Same field ID under both same-named sections: the most-derived
    // declaration's metadata (name, type, sortOrder) wins.
    const derivedField = makeField(sharedFieldId, 'NewerName', 'Rich Text', 100);
    const baseField = makeField(sharedFieldId, 'OlderName', 'Single-Line Text', 200);

    const registry = new Map<string, RegistryItem>([
      [baseId, base],
      [derivedId, derived],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [derivedId, [derivedSection]],
      [derivedSectionId, [derivedField]],
      [baseId, [baseSection]],
      [baseSectionId, [baseField]],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(derivedId, engine as unknown as Engine);

    expect(schema.sections).toHaveLength(1);
    expect(schema.sections[0].fields).toHaveLength(1);
    expect(schema.sections[0].fields[0].name).toBe('NewerName');
    expect(schema.sections[0].fields[0].type).toBe('Rich Text');
  });

  it('enriches schema with off-chain stored fields via field-definition lookup', () => {
    // Backlog #48: SXA-installed fields (e.g. OtherProperties from Extended
    // Options) live on rendering items but aren't in the Json Rendering's
    // base-template chain. Sitecore Pages renders these via a per-field
    // definition lookup. enrichSchemaWithStoredFields ports that mechanism.
    const templateId = 'aaaa0000-0000-0000-0000-000000000090';
    const ownSectionId = 'bbbb0000-0000-0000-0000-000000000090';
    const declaredFieldId = 'cccc0000-0000-0000-0000-000000000090';

    // Off-chain field-def lives in a totally separate template tree, but
    // the rendering item stores its value anyway.
    const offChainSectionId = 'bbbb0000-0000-0000-0000-000000000091';
    const offChainFieldId = 'cccc0000-0000-0000-0000-000000000091';

    const template = makeRegistryItem({ id: templateId, name: 'Json Rendering' });
    const ownSection = makeSection(ownSectionId, 'Editor Options', 100);
    const declaredField = makeField(declaredFieldId, 'Parameters Template', 'Droptree', 100);
    const offChainSection = makeSection(offChainSectionId, 'Experience Accelerator', 0);
    const offChainField = makeRegistryItem({
      id: offChainFieldId,
      name: 'OtherProperties',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      parent: offChainSectionId,
      sharedFields: { [FIELD_IDS.type]: 'Name Value List', [FIELD_IDS.shared]: '1' },
    });

    const registry = new Map<string, RegistryItem>([
      [templateId, template],
      [offChainSectionId, offChainSection],
      [offChainFieldId, offChainField],
    ]);
    const children = new Map<string, RegistryItem[]>([
      [templateId, [ownSection]],
      [ownSectionId, [declaredField]],
    ]);

    const engine = createMockEngine(registry, children);
    const baseSchema = getTemplateSchema(templateId, engine as unknown as Engine);
    expect(baseSchema.sections).toHaveLength(1);
    expect(baseSchema.sections[0].fields.map(f => f.name)).toEqual(['Parameters Template']);

    // Item stores both the declared field (skipped - already in schema) and
    // the off-chain field (synthesized into a new "Experience Accelerator"
    // section, picking up the field-def's Type so the UI can route it to
    // the Name Value List editor).
    const storedIds = [declaredFieldId, offChainFieldId];
    const enriched = enrichSchemaWithStoredFields(baseSchema, storedIds, engine as unknown as Engine);

    expect(enriched.sections.map(s => s.name).sort()).toEqual([
      'Editor Options',
      'Experience Accelerator',
    ]);
    const synthetic = enriched.sections.find(s => s.name === 'Experience Accelerator')!;
    expect(synthetic.fields).toHaveLength(1);
    expect(synthetic.fields[0]).toMatchObject({
      id: offChainFieldId,
      name: 'OtherProperties',
      type: 'Name Value List',
      shared: true,
    });
    // The declared field is unchanged.
    const declared = enriched.sections.find(s => s.name === 'Editor Options')!;
    expect(declared.fields.map(f => f.name)).toEqual(['Parameters Template']);
  });

  it('skips stored field IDs that have no field-definition item', () => {
    // If the registry has no field-def for a given ID (truly orphaned data),
    // we don't synthesize anything - the field falls through to the existing
    // unmatched-fields handling on the client.
    const templateId = 'aaaa0000-0000-0000-0000-0000000000a0';
    const sectionId = 'bbbb0000-0000-0000-0000-0000000000a0';
    const fieldId = 'cccc0000-0000-0000-0000-0000000000a0';

    const template = makeRegistryItem({ id: templateId, name: 'TestTemplate' });
    const section = makeSection(sectionId, 'Data', 100);
    const field = makeField(fieldId, 'Title', 'Single-Line Text', 100);

    const registry = new Map<string, RegistryItem>([[templateId, template]]);
    const children = new Map<string, RegistryItem[]>([
      [templateId, [section]],
      [sectionId, [field]],
    ]);
    const engine = createMockEngine(registry, children);
    const base = getTemplateSchema(templateId, engine as unknown as Engine);

    const enriched = enrichSchemaWithStoredFields(
      base,
      ['ffffffff-0000-0000-0000-00000000ffff'], // unknown field ID
      engine as unknown as Engine,
    );
    // Unchanged - the unknown ID resolves to no field-def and gets dropped.
    expect(enriched).toEqual(base);
  });

  it('keeps differently-named sections separate (no false collapse)', () => {
    // Sanity: sections with different names should NOT merge, even if
    // they appear at adjacent inheritance levels with similar metadata.
    const baseId = 'aaaa0000-0000-0000-0000-000000000080';
    const derivedId = 'aaaa0000-0000-0000-0000-000000000081';

    const base = makeRegistryItem({ id: baseId, name: 'Base' });
    const derived = makeRegistryItem({
      id: derivedId,
      name: 'Derived',
      sharedFields: { [FIELD_IDS.baseTemplate]: `{${baseId}}` },
    });
    const derivedSection = makeSection('bbbb0000-0000-0000-0000-000000000080', 'Designing', 100);
    const baseSection = makeSection('bbbb0000-0000-0000-0000-000000000081', 'Layout', 100);

    const registry = new Map<string, RegistryItem>([[baseId, base], [derivedId, derived]]);
    const children = new Map<string, RegistryItem[]>([
      [derivedId, [derivedSection]],
      ['bbbb0000-0000-0000-0000-000000000080', []],
      [baseId, [baseSection]],
      ['bbbb0000-0000-0000-0000-000000000081', []],
    ]);

    const engine = createMockEngine(registry, children);
    const schema = getTemplateSchema(derivedId, engine as unknown as Engine);

    expect(schema.sections.map(s => s.name).sort()).toEqual(['Designing', 'Layout']);
  });
});
