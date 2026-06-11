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
    expect(templateNameToTypeName('Demo Root Node')).toBe('DemoRootNode');
  });
  it('preserves a leading underscore', () => {
    expect(templateNameToTypeName('_Base Alpha')).toBe('_BaseAlpha');
  });
  it('preserves a leading double underscore', () => {
    expect(templateNameToTypeName('__Standard Values')).toBe('__StandardValues');
  });
  it('handles non-alpha separators', () => {
    expect(templateNameToTypeName('Demo Multi Word Panel')).toBe('DemoMultiWordPanel');
  });
  it('handles dashes and underscores as internal separators', () => {
    expect(templateNameToTypeName('Demo-Link_List')).toBe('DemoLinkList');
  });
  it('returns "Item" for empty input', () => {
    expect(templateNameToTypeName('')).toBe('Item');
    expect(templateNameToTypeName('   ')).toBe('Item');
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
  it('collapses acronyms (all-caps segment becomes a single camelCase word)', () => {
    expect(fieldNameToGraphQLFieldName('Demo Tag CSS Class')).toBe('demoTagCssClass');
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
    const tmpl = buildTemplate('Demo Root', [
      { name: 'Demo Node Text' },
      { name: 'Demo Icon' },
      { name: 'Demo Hidden' },
    ]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type DemoRoot implements AnyItem');
    expect(result.sdl).toContain('demoNodeText: ItemField');
    expect(result.sdl).toContain('demoIcon: ItemField');
    expect(result.sdl).toContain('demoHidden: ItemField');
  });

  it('emits an interface for templates whose name starts with an underscore', () => {
    const base = buildTemplate('_Base Alpha', [{ name: 'Field Label' }]);
    const engine = buildEngine(base);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('interface _BaseAlpha');
    expect(result.sdl).toMatch(/interface _BaseAlpha\s*{[^}]*fieldLabel: ItemField/);
  });

  it('concrete types implement all base-template interfaces AND AnyItem', () => {
    const base = buildTemplate('_Base Alpha', [{ name: 'Field Label' }]);
    const baseId = base[0].id;
    const concrete = buildTemplate('Concrete Four', [{ name: 'Concrete Four Text' }], { baseTemplateIds: [baseId] });
    const engine = buildEngine([...base, ...concrete]);
    const result = generateSchemaFromRegistry(engine);
    expect(result.sdl).toContain('type ConcreteFour implements AnyItem & _BaseAlpha');
    // Fields from both base and own template appear on the concrete type
    const concreteBlock = result.sdl.match(/type ConcreteFour[^{]*{[^}]*}/)?.[0] ?? '';
    expect(concreteBlock).toContain('fieldLabel: ItemField');
    expect(concreteBlock).toContain('concreteFourText: ItemField');
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
    expect(interfaces).toContain('AnyItem');
    expect(interfaces).toContain('_BaseBeta');
    expect(interfaces).toContain('_BaseAlpha');
  });

  it('an interface derived from another interface declares that it implements the base interface', () => {
    // GraphQL spec: a transitively-implemented interface must also be declared
    // on the implementing interface. _Base Beta inherits _Base Alpha, so it
    // must emit `implements _BaseAlpha`.
    const baseAlpha = buildTemplate('_Base Alpha', [{ name: 'Field Name' }]);
    const baseAlphaId = baseAlpha[0].id;
    const baseBeta = buildTemplate('_Base Beta', [{ name: 'Placeholder' }], {
      baseTemplateIds: [baseAlphaId],
    });
    const engine = buildEngine([...baseAlpha, ...baseBeta]);
    const result = generateSchemaFromRegistry(engine);

    expect(result.sdl).toMatch(/interface _BaseBeta implements _BaseAlpha\s*\{/);
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
    const tmpl = buildTemplate('Demo Root', [{ name: 'Demo Node Text' }]);
    const engine = buildEngine(tmpl);
    const result = generateSchemaFromRegistry(engine);
    expect(result.fieldResolverMap.get('demoNodeText')).toBe('Demo Node Text');
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

/**
 * Minimal stand-in for the runtime BASE_SCHEMA (graphql.ts) - just the base
 * types the generated extension document references, so the generated SDL can
 * be compiled by graphql-js and introspected. The generator emits an
 * *extension* (`extend type Item`, interfaces, concrete types), so we build
 * this base first and apply the generated SDL via `extendSchema` exactly like
 * mercurius does at runtime.
 */
const MINIMAL_BASE = `
  type Query { item(path: String!): AnyItem }
  type ItemTemplate { id: ID! }
  type ItemUrl { url: String! }
  type ItemField { value: String }
  type AnyItemChildrenConnection { results: [AnyItem!]! }
  interface AnyItem {
    id: ID!
    name: String!
    displayName: String
    path: String!
    language: String!
    template: ItemTemplate!
    url: ItemUrl
    field(name: String!): ItemField
    children(includeTemplateIDs: [String!], first: Int, after: String): AnyItemChildrenConnection!
    parent: AnyItem
    ancestors(includeTemplateIDs: [String!]): [AnyItem!]!
    hasChildren(includeTemplateIDs: [String!]): Boolean!
  }
  type Item implements AnyItem {
    id: ID!
    name: String!
    displayName: String
    path: String!
    language: String!
    template: ItemTemplate!
    url: ItemUrl
    field(name: String!): ItemField
    children(includeTemplateIDs: [String!], first: Int, after: String): AnyItemChildrenConnection!
    parent: AnyItem
    ancestors(includeTemplateIDs: [String!]): [AnyItem!]!
    hasChildren(includeTemplateIDs: [String!]): Boolean!
  }
`;

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
    const schema = extendSchema(buildSchema(MINIMAL_BASE), parse(result.sdl));
    // validateSchema enforces the spec rule we are fixing: an implementing
    // type/interface must declare every transitively-implemented interface.
    // A missing declaration surfaces here as a validation error.
    expect(validateSchema(schema)).toEqual([]);
  });

  it('reports transitive interface registration through introspection (acceptance criteria)', () => {
    const result = generateSchemaFromRegistry(buildBaseChain());
    const schema = extendSchema(buildSchema(MINIMAL_BASE), parse(result.sdl));

    const res = graphqlSync({
      schema,
      source: `{
        base: __type(name: "_BaseAlpha") { possibleTypes { name } }
        one: __type(name: "ConcreteOne") { interfaces { name } }
        two: __type(name: "ConcreteTwo") { interfaces { name } }
        beta: __type(name: "_BaseBeta") { interfaces { name } }
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
