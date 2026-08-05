import { describe, it, expect } from 'vitest';
import { buildSchema, extendSchema, parse, validateSchema, graphqlSync } from 'graphql';
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
  isIncludedOotbPath,
} from '../../../src/engine/schema/generate.js';
import { BASE_SCHEMA } from '../../../src/api/routes/graphql.js';
import { Registry } from '../../../src/engine/registry.js';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

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
    expect(templateNameToTypeName('Demo Root Node')).toBe('DemoRootNode');
  });
  it('preserves a leading underscore', () => {
    expect(templateNameToTypeName('_Base Alpha')).toBe('_BaseAlpha');
  });
  it('strips a leading double underscore (Sitecore NameNormalizer behavior)', () => {
    expect(templateNameToTypeName('__Standard Values')).toBe('StandardValues');
  });
  it('handles non-alpha separators', () => {
    expect(templateNameToTypeName('Demo Multi Word Panel')).toBe('DemoMultiWordPanel');
  });
  it('drops dashes but preserves underscores (spaces-only splitting)', () => {
    expect(templateNameToTypeName('Demo-Link_List')).toBe('DemoLink_List');
  });
  it('preserves underscore-prefixed names (T_ pattern)', () => {
    expect(templateNameToTypeName('T_Sample')).toBe('T_Sample');
  });
  it('returns "UnknownItem" for empty input', () => {
    expect(templateNameToTypeName('')).toBe('UnknownItem');
    expect(templateNameToTypeName('   ')).toBe('UnknownItem');
  });
});

describe('fieldNameToGraphQLFieldName', () => {
  it('camelCases space-separated words', () => {
    expect(fieldNameToGraphQLFieldName('Demo Node Text')).toBe('demoNodeText');
  });
  it('splits PascalCase input into tokens (0.1.7 regression)', () => {
    // Real site project templates name their fields in PascalCase already
    // (`DemoNodeText`, `DemoHidden`, ...), not space-separated. 0.1.7
    // initially emitted these as lower-cased one-word names (`demonodetext`)
    // which didn't match consuming camelCase queries.
    expect(fieldNameToGraphQLFieldName('DemoNodeText')).toBe('demoNodeText');
    expect(fieldNameToGraphQLFieldName('DemoHidden')).toBe('demoHidden');
    expect(fieldNameToGraphQLFieldName('DemoTagCssClass')).toBe('demoTagCssClass');
  });
  it('splits camelCase input into tokens', () => {
    expect(fieldNameToGraphQLFieldName('demoNodeText')).toBe('demoNodeText');
  });
  it('preserves acronym casing within a word (spaces-only splitting)', () => {
    expect(fieldNameToGraphQLFieldName('Demo Tag CSS Class')).toBe('demoTagCSSClass');
  });
  it('handles single-word names', () => {
    expect(fieldNameToGraphQLFieldName('Title')).toBe('title');
  });
  it('drops dashes but preserves underscores in field names', () => {
    expect(fieldNameToGraphQLFieldName('Is-Field_Required')).toBe('isField_Required');
  });
  it('preserves f_ prefix pattern (Sitecore convention)', () => {
    expect(fieldNameToGraphQLFieldName('f_publishDate')).toBe('f_publishDate');
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
    const tmpl = buildTemplate('Demo Root', [
      { name: 'Demo Node Text' },
      { name: 'Demo Icon' },
      { name: 'Demo Hidden' },
    ]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type DemoRoot implements Item');
    expect(result.sdl).toContain('demoNodeText: TextField');
    expect(result.sdl).toContain('demoIcon: TextField');
    expect(result.sdl).toContain('demoHidden: TextField');
  });

  it('concrete types implement all base-template interfaces AND Item', () => {
    const base = buildTemplate('_Base Alpha', [{ name: 'Field Label' }]);
    const baseId = base[0].id;
    const concrete = buildTemplate('Concrete Four', [{ name: 'Concrete Four Text' }], { baseTemplateIds: [baseId] });
    const engine = buildEngine([...base, ...concrete]);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type ConcreteFour implements Item & _BaseAlpha');
    // Fields from both base and own template appear on the concrete type
    const concreteBlock = result.sdl.match(/type ConcreteFour[^{]*{[^}]*}/)?.[0] ?? '';
    expect(concreteBlock).toContain('fieldLabel: TextField');
    expect(concreteBlock).toContain('concreteFourText: TextField');
  });

  it('concrete types implement transitively-reached interfaces, not just direct bases', () => {
    // Inheritance chain: Concrete One -> _Base Beta -> _Base Alpha. The
    // concrete type reaches _BaseAlpha ONLY through the intermediate
    // interface. The GraphQL spec requires every transitively implemented
    // interface to be declared, so ConcreteOne must list _BaseAlpha in its
    // `implements` clause - otherwise `... on _BaseAlpha` fragments resolve
    // to null on it.
    const baseAlpha = buildTemplate('_Base Alpha', [{ name: 'Field Name' }, { name: 'Field Label' }]);
    const baseAlphaId = baseAlpha[0].id;
    const baseBeta = buildTemplate('_Base Beta', [{ name: 'Placeholder' }], {
      baseTemplateIds: [baseAlphaId],
    });
    const baseBetaId = baseBeta[0].id;
    const concreteOne = buildTemplate('Concrete One', [{ name: 'Some Setting' }], {
      baseTemplateIds: [baseBetaId],
    });
    const engine = buildEngine([...baseAlpha, ...baseBeta, ...concreteOne]);
    const result = generateSchemaFromRegistry(engine);

    const clause = result.sdl.match(/type ConcreteOne implements ([^{]+)\{/)?.[1] ?? '';
    // Split on `&` into exact interface tokens so `_BaseAlpha` isn't
    // falsely matched as a substring of `_BaseBeta`.
    const interfaces = clause.split('&').map(s => s.trim()).filter(Boolean);
    expect(interfaces).toContain('Item');
    expect(interfaces).toContain('_BaseBeta');
    expect(interfaces).toContain('_BaseAlpha');
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
    // Should return normally, not hang or overflow. Both templates are inherited
    // (mutual cycle), so both are non-leaf -> concrete types are C__-prefixed.
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type C__CycleA');
    expect(result.sdl).toContain('type C__CycleB');
  });

  it('returns an empty SDL when the tree has no templates (BASE_SCHEMA handles the interface)', () => {
    // The interface/helper-type declarations (Item interface, ItemTemplate,
    // ItemUrl, ItemField, ItemSearchResults, the UnknownItem fallback)
    // live in BASE_SCHEMA now - the generator is purely additive via
    // mercurius's extendSchema, so an empty tree produces an empty
    // extension document.
    const engine = buildEngine([]);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toBe('');
    expect(result.concreteTypeNames).toEqual(['UnknownItem']);
  });

  it('returns a fieldResolverMap keying generated field names to the original Sitecore field name', () => {
    const tmpl = buildTemplate('Demo Root', [{ name: 'Demo Node Text' }]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.fieldResolverMap.get('demoNodeText')).toBe('Demo Node Text');
  });

  it('skips fields with empty names', () => {
    const tmpl = buildTemplate('Quiet Template', [{ name: '' }, { name: 'Valid Field' }]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('validField: TextField');
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
    const typeMatches = result.sdl.match(/type Widget\w* implements Item/g) ?? [];
    expect(typeMatches.length).toBe(2);
    expect(typeMatches[0]).toBe('type Widget implements Item');
    expect(typeMatches[1]).toMatch(/^type Widget_[a-f0-9]+ implements Item$/);
  });
});


/**
 * Build the transitive inheritance chain the bug report centers on:
 *   Concrete One / Concrete Two -> _Base Beta -> _Base Alpha
 *   Concrete Three -> _Base Alpha (directly; the regression anchor)
 */
function buildBaseChain() {
  const baseAlpha = buildTemplate('_Base Alpha', [{ name: 'Field Name' }, { name: 'Field Label' }]);
  const baseAlphaId = baseAlpha[0].id;
  const baseBeta = buildTemplate('_Base Beta', [{ name: 'Placeholder' }], {
    baseTemplateIds: [baseAlphaId],
  });
  const baseBetaId = baseBeta[0].id;
  const one = buildTemplate('Concrete One', [{ name: 'Min Length' }], { baseTemplateIds: [baseBetaId] });
  const two = buildTemplate('Concrete Two', [{ name: 'Rows' }], { baseTemplateIds: [baseBetaId] });
  const three = buildTemplate('Concrete Three', [{ name: 'Items' }], { baseTemplateIds: [baseAlphaId] });
  return buildEngine([...baseAlpha, ...baseBeta, ...one, ...two, ...three]);
}

describe('generated schema is valid GraphQL and introspectable', () => {
  it('compiles via graphql-js extendSchema with no validation errors', () => {
    const result = generateSchemaFromRegistry(buildBaseChain());
    const schema = extendSchema(buildSchema(BASE_SCHEMA), parse(result.sdl));
    // validateSchema enforces the spec rule we are fixing: an implementing
    // type/interface must declare every transitively-implemented interface.
    // A missing declaration surfaces here as a validation error.
    expect(validateSchema(schema)).toEqual([]);
  });

  it('reports transitive interface registration through introspection (acceptance criteria)', () => {
    const result = generateSchemaFromRegistry(buildBaseChain());
    const schema = extendSchema(buildSchema(BASE_SCHEMA), parse(result.sdl));

    const res = graphqlSync({
      schema,
      source: `{
        base: __type(name: "_BaseAlpha") { possibleTypes { name } }
        one: __type(name: "ConcreteOne") { interfaces { name } }
        two: __type(name: "ConcreteTwo") { interfaces { name } }
        beta: __type(name: "C___BaseBeta") { interfaces { name } }
      }`,
    });
    expect(res.errors).toBeUndefined();
    const data = res.data as any;
    const names = (arr: Array<{ name: string }>) => arr.map(t => t.name);

    const possible = names(data.base.possibleTypes);
    expect(possible).toContain('ConcreteOne');
    expect(possible).toContain('ConcreteTwo');
    // Regression: the directly-inheriting type is still a possible type.
    expect(possible).toContain('ConcreteThree');

    expect(names(data.one.interfaces)).toContain('_BaseAlpha');
    expect(names(data.two.interfaces)).toContain('_BaseAlpha');
    expect(names(data.beta.interfaces)).toContain('_BaseAlpha');
  });
});

describe('Edge template->schema fidelity: base templates become interfaces (RC-A)', () => {
  it('emits an interface for any template used as a base (non-leaf), not only _-prefixed names', () => {
    const base = buildTemplate('T_Image', [{ name: 'f_image', type: 'Image' }]);
    const baseId = base[0].id;
    const page = buildTemplate('T_Article', [{ name: 'f_title' }], { baseTemplateIds: [baseId] });
    const result = generateSchemaFromRegistry(buildEngine([...base, ...page]));
    // T_Image is inherited by T_Article, so it is an interface (no _ prefix).
    expect(result.sdl).toMatch(/interface T_Image[\s{]/);
    // T_Article is a leaf: a concrete object implementing Item + the base interface.
    expect(result.sdl).toMatch(/type T_Article implements Item & T_Image[\s{]/);
  });

  it('renames a non-leaf template concrete type to C__<Name> so the clean name is the interface', () => {
    const base = buildTemplate('T_Image', [{ name: 'f_image', type: 'Image' }]);
    const baseId = base[0].id;
    const page = buildTemplate('T_Article', [{ name: 'f_title' }], { baseTemplateIds: [baseId] });
    const result = generateSchemaFromRegistry(buildEngine([...base, ...page]));
    expect(result.sdl).toMatch(/type C__T_Image implements Item & T_Image[\s{]/);
    // __typename dispatch for an item of T_Image resolves to the concrete C__ name.
    expect(result.templatesById.get(baseId.toLowerCase())?.typeName).toBe('C__T_Image');
    expect(result.concreteTypeNames).toContain('C__T_Image');
    expect(result.concreteTypeNames).toContain('T_Article');
  });

  it('does not emit an interface for a leaf template even when its name starts with an underscore', () => {
    // Old rule made every _-prefixed template an interface; Edge only makes a
    // template an interface when something inherits it.
    const leaf = buildTemplate('_Base Alpha', [{ name: 'Field Label' }]);
    const result = generateSchemaFromRegistry(buildEngine(leaf));
    expect(result.sdl).not.toMatch(/interface _BaseAlpha[\s{]/);
    expect(result.sdl).toMatch(/type _BaseAlpha implements Item[\s{]/);
  });

  it('a concrete type implements every transitively reached base interface', () => {
    const alpha = buildTemplate('T_Alpha', [{ name: 'a' }]);
    const alphaId = alpha[0].id;
    const beta = buildTemplate('T_Beta', [{ name: 'b' }], { baseTemplateIds: [alphaId] });
    const betaId = beta[0].id;
    const leaf = buildTemplate('T_Page', [{ name: 'p' }], { baseTemplateIds: [betaId] });
    const result = generateSchemaFromRegistry(buildEngine([...alpha, ...beta, ...leaf]));
    const clause = result.sdl.match(/type T_Page implements ([^{]+)\{/)?.[1] ?? '';
    const ifaces = clause.split('&').map(s => s.trim()).filter(Boolean);
    expect(ifaces).toEqual(expect.arrayContaining(['Item', 'T_Beta', 'T_Alpha']));
  });

  it('template interfaces are flat: they do not declare implements for their base interfaces', () => {
    const alpha = buildTemplate('T_Alpha', [{ name: 'a' }]);
    const alphaId = alpha[0].id;
    const beta = buildTemplate('T_Beta', [{ name: 'b' }], { baseTemplateIds: [alphaId] });
    const betaId = beta[0].id;
    const leaf = buildTemplate('T_Page', [{ name: 'p' }], { baseTemplateIds: [betaId] });
    const result = generateSchemaFromRegistry(buildEngine([...alpha, ...beta, ...leaf]));
    const ifaceHeader = result.sdl.match(/interface T_Beta[^{]*\{/)?.[0] ?? '';
    expect(ifaceHeader).not.toContain('implements');
  });
});

describe('Edge template->schema fidelity: fields keep their subtype (RC-B)', () => {
  it('types each generated field by its Sitecore field type', () => {
    const tmpl = buildTemplate('T_Card', [
      { name: 'f_image', type: 'Image' },
      { name: 'f_when', type: 'Datetime' },
      { name: 'f_link', type: 'General Link' },
      { name: 'f_title', type: 'Single-Line Text' },
    ]);
    const result = generateSchemaFromRegistry(buildEngine(tmpl));
    const block = result.sdl.match(/type T_Card[^{]*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toContain('f_image: ImageField');
    expect(block).toContain('f_when: DateField');
    expect(block).toContain('f_link: LinkField');
    expect(block).toContain('f_title: TextField'); // unmapped text type -> fallback
  });

  it('an inherited field keeps the same subtype on the base interface and the deriving type', () => {
    const base = buildTemplate('T_Image', [{ name: 'f_image', type: 'Image' }]);
    const baseId = base[0].id;
    const page = buildTemplate('T_Article', [{ name: 'f_title' }], { baseTemplateIds: [baseId] });
    const result = generateSchemaFromRegistry(buildEngine([...base, ...page]));
    const iface = result.sdl.match(/interface T_Image[^{]*\{[^}]*\}/)?.[0] ?? '';
    const obj = result.sdl.match(/type T_Article[^{]*\{[^}]*\}/)?.[0] ?? '';
    expect(iface).toContain('f_image: ImageField');
    expect(obj).toContain('f_image: ImageField');
  });
});

describe('Edge template->schema fidelity: OOTB registry templates (RC-C)', () => {
  it('isIncludedOotbPath: Foundation/Feature/CMP/DAM/Modules in, System/infrastructure out', () => {
    expect(isIncludedOotbPath('/sitecore/templates/Foundation/Experience Accelerator/Taxonomy/Datasource/Tag')).toBe(true);
    expect(isIncludedOotbPath('/sitecore/templates/Feature/Foo/Bar')).toBe(true);
    expect(isIncludedOotbPath('/sitecore/templates/CMP/Foo')).toBe(true);
    expect(isIncludedOotbPath('/sitecore/templates/DAM/Foo')).toBe(true);
    expect(isIncludedOotbPath('/sitecore/templates/System/Templates/Standard template')).toBe(false);
    expect(isIncludedOotbPath('/sitecore/templates/Sitecore Client/Foo')).toBe(false);
    expect(isIncludedOotbPath('/sitecore/templates/Branches/Foo')).toBe(false);
    expect(isIncludedOotbPath(undefined)).toBe(false);
  });

  it('generates OOTB Foundation templates (Tag) with own fields, drops system fields, skips System templates', async () => {
    // Real IAR registry: exercises the full OOTB generation path end to end.
    const reg = new Registry();
    const registryPath = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../data/registry.json.gz');
    await reg.loadFromGzip(registryPath);

    const engine = Object.create(Engine.prototype) as Engine;
    (engine as unknown as { tree: ItemTree }).tree = new ItemTree();
    (engine as unknown as { registry: Registry }).registry = reg;

    const result = generateSchemaFromRegistry(engine);

    // Tag (OOTB SXA template under Foundation) is now in the schema.
    const tagId = '6b40e84c-8785-49fc-8a10-6bca862ff7ea';
    const tag = result.templatesById.get(tagId);
    expect(tag).toBeDefined();
    const tagFields = [...(tag?.fields.keys() ?? [])];
    expect(tagFields).toContain('title'); // own field, kept
    // System (Standard-template) fields are excluded.
    expect(tagFields).not.toContain('created');
    expect(tagFields).not.toContain('workflow');

    // A System-only template (Standard template) is NOT generated.
    expect(result.templatesById.get('1930bbeb-7805-471a-a3be-4858ac7cf696')).toBeUndefined();
  }, 30000);
});
