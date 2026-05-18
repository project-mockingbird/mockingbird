import { describe, it, expect } from 'vitest';
import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import type { ScsItem } from '../../../src/engine/types.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import {
  templateNameToTypeName,
  fieldNameToGraphQLFieldName,
  generateSchemaFromRegistry,
} from '../../../src/engine/schema/generate.js';

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
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

/**
 * Builder helpers that construct a minimum Sitecore-shaped template item
 * (template item + one section + named fields) that `getTemplateSchema` can
 * walk. Keeps test fixtures terse.
 */
let nextId = 1;
function uid(prefix: string): string {
  const n = (nextId++).toString(16).padStart(8, '0');
  return `${prefix}${n}-0000-0000-0000-000000000000`.slice(0, 36);
}

function buildTemplate(
  name: string,
  fields: Array<{ name: string; type?: string }>,
  opts: { baseTemplateIds?: string[]; id?: string } = {},
): ScsItem[] {
  const templateId = opts.id ?? uid('t');
  const out: ScsItem[] = [];
  const sharedFields: Array<{ id: string; hint: string; value: string }> = [];
  if (opts.baseTemplateIds && opts.baseTemplateIds.length > 0) {
    sharedFields.push({
      id: FIELD_IDS.baseTemplate,
      hint: '__Base template',
      value: opts.baseTemplateIds.map(id => `{${id.toUpperCase()}}`).join('|'),
    });
  }
  out.push(makeItem({
    id: templateId,
    path: `/sitecore/templates/Test/${name}`,
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields,
  }));
  const sectionId = uid('s');
  out.push(makeItem({
    id: sectionId,
    parent: templateId,
    path: `/sitecore/templates/Test/${name}/Data`,
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  }));
  for (const f of fields) {
    out.push(makeItem({
      id: uid('f'),
      parent: sectionId,
      path: `/sitecore/templates/Test/${name}/Data/${f.name}`,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [
        { id: FIELD_IDS.type, hint: 'Type', value: f.type ?? 'Single-Line Text' },
      ],
    }));
  }
  return out;
}

describe('templateNameToTypeName', () => {
  it('PascalCases space-separated words', () => {
    expect(templateNameToTypeName('Root Menu Item')).toBe('RootMenuItem');
  });
  it('preserves a leading underscore', () => {
    expect(templateNameToTypeName('_Labeled Field')).toBe('_LabeledField');
  });
  it('preserves a leading double underscore', () => {
    expect(templateNameToTypeName('__Standard Values')).toBe('__StandardValues');
  });
  it('handles non-alpha separators', () => {
    expect(templateNameToTypeName('Form Collapsible Checkbox Panel')).toBe('FormCollapsibleCheckboxPanel');
  });
  it('handles dashes and underscores as internal separators', () => {
    expect(templateNameToTypeName('Menu-Link_List')).toBe('MenuLinkList');
  });
  it('returns "Item" for empty input', () => {
    expect(templateNameToTypeName('')).toBe('Item');
    expect(templateNameToTypeName('   ')).toBe('Item');
  });
});

describe('fieldNameToGraphQLFieldName', () => {
  it('camelCases space-separated words', () => {
    expect(fieldNameToGraphQLFieldName('Menu Item Text')).toBe('menuItemText');
  });
  it('splits PascalCase input into tokens (0.1.7 regression)', () => {
    // Real site project templates name their fields in PascalCase already
    // (`MenuItemText`, `HideInSitemap`, ...), not space-separated. 0.1.7
    // initially emitted these as lower-cased one-word names (`menuitemtext`)
    // which didn't match consuming camelCase queries.
    expect(fieldNameToGraphQLFieldName('MenuItemText')).toBe('menuItemText');
    expect(fieldNameToGraphQLFieldName('HideInSitemap')).toBe('hideInSitemap');
    expect(fieldNameToGraphQLFieldName('MenuLinkTagCssClass')).toBe('menuLinkTagCssClass');
  });
  it('splits camelCase input into tokens', () => {
    expect(fieldNameToGraphQLFieldName('menuItemText')).toBe('menuItemText');
  });
  it('collapses acronyms (all-caps segment becomes a single camelCase word)', () => {
    expect(fieldNameToGraphQLFieldName('Menu Link Tag CSS Class')).toBe('menuLinkTagCssClass');
  });
  it('handles single-word names', () => {
    expect(fieldNameToGraphQLFieldName('Title')).toBe('title');
  });
  it('handles non-alpha separators', () => {
    expect(fieldNameToGraphQLFieldName('Is-Field_Required')).toBe('isFieldRequired');
  });
  it('prefixes with underscore if result starts with a digit', () => {
    expect(fieldNameToGraphQLFieldName('2fa Enabled')).toBe('_2faEnabled');
  });
  it('returns an empty string for empty input (callers filter)', () => {
    expect(fieldNameToGraphQLFieldName('')).toBe('');
  });
});

describe('generateSchemaFromRegistry', () => {
  it('emits one type per template in the tree with every field', () => {
    const tmpl = buildTemplate('Root Menu Item', [
      { name: 'Menu Item Text' },
      { name: 'Menu Icon' },
      { name: 'Hide In Sitemap' },
    ]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type RootMenuItem implements AnyItem');
    expect(result.sdl).toContain('menuItemText: ItemField');
    expect(result.sdl).toContain('menuIcon: ItemField');
    expect(result.sdl).toContain('hideInSitemap: ItemField');
  });

  it('emits an interface for templates whose name starts with an underscore', () => {
    const base = buildTemplate('_Labeled Field', [{ name: 'Field Label' }]);
    const engine = buildEngine(base);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('interface _LabeledField');
    expect(result.sdl).toMatch(/interface _LabeledField\s*{[^}]*fieldLabel: ItemField/);
  });

  it('concrete types implement all base-template interfaces AND AnyItem', () => {
    const base = buildTemplate('_Labeled Field', [{ name: 'Field Label' }]);
    const baseId = base[0].id;
    const concrete = buildTemplate('Form Button', [{ name: 'Form Button Text' }], { baseTemplateIds: [baseId] });
    const engine = buildEngine([...base, ...concrete]);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type FormButton implements AnyItem & _LabeledField');
    // Fields from both base and own template appear on the concrete type
    const formButtonBlock = result.sdl.match(/type FormButton[^{]*{[^}]*}/)?.[0] ?? '';
    expect(formButtonBlock).toContain('fieldLabel: ItemField');
    expect(formButtonBlock).toContain('formButtonText: ItemField');
  });

  it('does not stack-overflow on a base-template cycle', () => {
    const a = buildTemplate('CycleA', [{ name: 'A Field' }]);
    const aId = a[0].id;
    const b = buildTemplate('CycleB', [{ name: 'B Field' }], { baseTemplateIds: [aId] });
    const bId = b[0].id;
    // Rewrite A to also inherit from B (creates cycle).
    (a[0].sharedFields as Array<{ id: string; hint: string; value: string }>).push({
      id: FIELD_IDS.baseTemplate,
      hint: '__Base template',
      value: `{${bId.toUpperCase()}}`,
    });
    const engine = buildEngine([...a, ...b]);
    // Should return normally, not hang or overflow.
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type CycleA');
    expect(result.sdl).toContain('type CycleB');
  });

  it('returns an empty SDL when the tree has no templates (BASE_SCHEMA handles the interface)', () => {
    // The interface/helper-type declarations (AnyItem, ItemTemplate,
    // ItemUrl, ItemField, AnyItemChildrenConnection, the base Item type)
    // live in BASE_SCHEMA now - the generator is purely additive via
    // mercurius's extendSchema, so an empty tree produces an empty
    // extension document.
    const engine = buildEngine([]);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toBe('');
    expect(result.concreteTypeNames).toEqual(['Item']);
  });

  it('returns a fieldResolverMap keying generated field names to the original Sitecore field name', () => {
    const tmpl = buildTemplate('Root Menu Item', [{ name: 'Menu Item Text' }]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.fieldResolverMap.get('menuItemText')).toBe('Menu Item Text');
  });

  it('skips fields with empty names', () => {
    const tmpl = buildTemplate('Quiet Template', [{ name: '' }, { name: 'Valid Field' }]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('validField: ItemField');
  });

  it('handles template name collisions by suffixing with a short hash', () => {
    const one = buildTemplate('Widget', [{ name: 'X' }]);
    // Second template at a different path with the same name.
    const two = buildTemplate('Widget', [{ name: 'Y' }], { id: uid('t') });
    // Move the second template's path so it's distinct from the first.
    two[0].path = '/sitecore/templates/Other/Widget';
    const engine = buildEngine([...one, ...two]);
    const result = generateSchemaFromRegistry(engine);
    // First occurrence keeps the clean name, second gets suffixed.
    const typeMatches = result.sdl.match(/type Widget\w* implements AnyItem/g) ?? [];
    expect(typeMatches.length).toBe(2);
    expect(typeMatches[0]).toBe('type Widget implements AnyItem');
    expect(typeMatches[1]).toMatch(/^type Widget_[a-f0-9]+ implements AnyItem$/);
  });
});
