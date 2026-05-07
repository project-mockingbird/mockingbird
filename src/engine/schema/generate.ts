import { createHash } from 'crypto';
import type { Engine } from '../index.js';
import type { ScsItem, ItemNode } from '../types.js';
import { TEMPLATE_TEMPLATE_ID, FIELD_IDS } from '../constants.js';
import { getTemplateSchema, type TemplateFieldSchema } from '../template-schema.js';

/**
 * Convert a Sitecore template **name** into a GraphQL type identifier.
 * Splits on any run of non-alphanumeric characters (spaces, dashes,
 * punctuation) and PascalCases each word. Preserves a leading run of
 * underscores so Sitecore base templates (`_LabeledField`, `__StandardValues`)
 * remain distinguishable. Empty input returns the generic fallback `Item`.
 */
export function templateNameToTypeName(name: string): string {
  if (!name || !name.trim()) return 'Item';
  // Preserve the leading underscore run (Sitecore base-template convention).
  const leadingUnderscores = /^(_+)/.exec(name)?.[1] ?? '';
  const body = name.slice(leadingUnderscores.length);
  const words = splitIdentifierWords(body);
  if (words.length === 0) return leadingUnderscores || 'Item';
  const pascal = words
    .map(w => {
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  return `${leadingUnderscores}${pascal}`;
}

/**
 * GraphQL reserved word list that field names can't collide with. Kept
 * minimal — `__typename` is the main practical hazard.
 */
const GRAPHQL_RESERVED_FIELDS = new Set(['__typename', '__schema', '__type']);

/**
 * Split a mixed-format identifier into word tokens. Handles both
 * space/dash/underscore-separated ("Menu Item Text") AND camelCase /
 * PascalCase ("MenuItemText") inputs — Sitecore project templates
 * mostly use the latter, OOTB templates the former.
 *
 * Splits:
 *  - on runs of non-alphanumerics ("Menu Item" → Menu, Item)
 *  - on lower→upper transitions ("menuItem" → menu, Item)
 *  - on consecutive upper followed by lower ("CSSClass" → CSS, Class)
 */
function splitIdentifierWords(name: string): string[] {
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!cleaned) return [];
  const tokens: string[] = [];
  for (const chunk of cleaned.split(/\s+/)) {
    if (!chunk) continue;
    // Split on aA and AAa boundaries.
    const subTokens = chunk
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/\s+/);
    for (const t of subTokens) if (t) tokens.push(t);
  }
  return tokens;
}

/**
 * Convert a Sitecore field **name** into a GraphQL field identifier.
 * camelCases whatever word tokens `splitIdentifierWords` produces.
 * Prefixes the result with `_` when it would otherwise start with a
 * digit, and when it collides with a GraphQL reserved name.
 */
export function fieldNameToGraphQLFieldName(name: string): string {
  if (!name) return '';
  const words = splitIdentifierWords(name);
  if (words.length === 0) return '';
  const camel = words
    .map((w, i) => {
      // Normalize each word to lower-then-uppercase-first so all-caps
      // chunks like "CSS" collapse to "Css" for readability.
      const lower = w.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  let result = camel;
  if (/^[0-9]/.test(result)) result = `_${result}`;
  if (GRAPHQL_RESERVED_FIELDS.has(result)) result = `_${result}`;
  return result;
}

/**
 * Descriptor for one template emitted into the generated schema. The
 * graphql route uses this to build the per-type resolver map and the
 * `AnyItem.resolveType` dispatcher.
 */
export interface GeneratedTemplate {
  typeName: string;
  sitecoreName: string;
  templateId: string;
  /** True if the template name starts with `_` — emitted as an interface too. */
  isBase: boolean;
  /** Pascal-cased base template names this type implements. */
  baseTypeNames: string[];
  /** graphql field name → original Sitecore field name. */
  fields: Map<string, string>;
}

/**
 * Result of schema generation: the SDL text fragment to concatenate onto
 * the base schema, a map from template id → generated descriptor, a flat
 * field-resolver map for every field name the schema exposes, and the
 * ordered list of every emitted concrete type (for resolver registration).
 */
export interface GeneratedSchemaResult {
  sdl: string;
  templatesById: Map<string, GeneratedTemplate>;
  /** graphql field name → original Sitecore field name (global across all types). */
  fieldResolverMap: Map<string, string>;
  /** Every concrete `type` name emitted, including `Item`. */
  concreteTypeNames: string[];
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 6);
}

function isBaseTemplateName(name: string): boolean {
  return name.startsWith('_');
}

/**
 * Scan the engine tree for all items whose template is the Sitecore
 * `Template` template — these are the user-authored template definitions
 * whose fields the generator walks. The registry's template items are
 * also picked up since they're merged into the same tree.
 */
function collectTemplateNodes(engine: Engine): ItemNode[] {
  const out: ItemNode[] = [];
  for (const node of engine.getAllItems()) {
    if (node.item.template.toLowerCase() === TEMPLATE_TEMPLATE_ID) {
      out.push(node);
    }
  }
  return out;
}

/**
 * Read the `__Base template` shared field and parse out the referenced
 * template ids (brace-wrapped GUIDs). Returns an empty array when the
 * field is absent or empty.
 */
function readBaseTemplateIds(item: ScsItem): string[] {
  const raw = item.sharedFields.find(f => f.id.toLowerCase() === FIELD_IDS.baseTemplate)?.value;
  if (!raw) return [];
  const matches = raw.match(/\{[^}]+\}/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).toLowerCase());
}

/**
 * Walk a template and return the flattened schema, falling back to an
 * empty section list when `getTemplateSchema` throws (which it can on
 * partially-indexed trees). The caller treats a missing schema as
 * "template has zero fields".
 */
function safeGetSchema(templateId: string, engine: Engine) {
  try {
    return getTemplateSchema(templateId, engine);
  } catch {
    return { sections: [] };
  }
}

/**
 * Pull the human-readable name of a template item from its path. Mirrors
 * what the item editor shows in the UI.
 */
function templateItemName(node: ItemNode): string {
  return node.item.path.split('/').pop() ?? '';
}

/**
 * Emit a single shared `AnyItem` fields block — every type (generated
 * type, generic `Item`, plus any base-template interface) re-declares
 * this exact text. Keeping it inline instead of factoring to a fragment
 * variable avoids any ambiguity about SDL interpolation order.
 */
const ANY_ITEM_FIELDS = `    id: ID!
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
    hasChildren(includeTemplateIDs: [String!]): Boolean!`;

/**
 * Build the full generated schema text from the engine's template
 * registry. Emits (in order):
 *
 *   1. The `AnyItem` interface + shared helper types (`ItemTemplate`,
 *      `ItemUrl`, `ItemField`, `AnyItemChildrenConnection`).
 *   2. A generic `type Item implements AnyItem` fallback for any runtime
 *      item whose template isn't in the generated set.
 *   3. One `interface <BaseName>` per template whose name starts with `_`,
 *      containing only that template's own fields (NOT flattened — bases
 *      stay minimal so an `... on _LabeledField` fragment doesn't pick
 *      up unrelated fields).
 *   4. One `type <Name> implements AnyItem & <bases>` per template, with
 *      the full flattened field set (own + base + transitive base fields).
 *
 * Cycles in the base-template graph are detected during the flatten pass
 * (delegated to `getTemplateSchema`, which already uses a visited set) and
 * via a local guard in {@link collectBaseChain}.
 */
export function generateSchemaFromRegistry(engine: Engine): GeneratedSchemaResult {
  const templatesById = new Map<string, GeneratedTemplate>();
  const concreteTypeNames: string[] = ['Item'];
  const fieldResolverMap = new Map<string, string>();
  const usedTypeNames = new Set<string>(['Item']);

  const templateNodes = collectTemplateNodes(engine);

  // First pass: collect descriptors + resolve type-name collisions.
  for (const node of templateNodes) {
    const sitecoreName = templateItemName(node);
    let typeName = templateNameToTypeName(sitecoreName);
    if (usedTypeNames.has(typeName)) {
      const suffix = shortHash(node.item.id);
      typeName = `${typeName}_${suffix}`;
    }
    usedTypeNames.add(typeName);

    templatesById.set(node.item.id.toLowerCase(), {
      typeName,
      sitecoreName,
      templateId: node.item.id,
      isBase: isBaseTemplateName(sitecoreName),
      baseTypeNames: [], // filled after all names are known
      fields: new Map(),
    });
  }

  // Second pass: resolve base-template references to type names (skipping
  // any base whose template isn't in the current generation set — those
  // get dropped from `implements` since their types don't exist).
  for (const node of templateNodes) {
    const desc = templatesById.get(node.item.id.toLowerCase());
    if (!desc) continue;
    const baseIds = readBaseTemplateIds(node.item);
    for (const baseId of baseIds) {
      const baseDesc = templatesById.get(baseId);
      if (!baseDesc || !baseDesc.isBase) continue;
      if (baseDesc.typeName === desc.typeName) continue; // self-reference safety
      if (!desc.baseTypeNames.includes(baseDesc.typeName)) {
        desc.baseTypeNames.push(baseDesc.typeName);
      }
    }
  }

  // Third pass: flatten fields through the schema walker + record every
  // graphql field name against its Sitecore source name.
  for (const node of templateNodes) {
    const desc = templatesById.get(node.item.id.toLowerCase());
    if (!desc) continue;
    const schema = safeGetSchema(node.item.id, engine);
    for (const section of schema.sections) {
      for (const f of section.fields) {
        addField(desc, f, fieldResolverMap);
      }
    }
  }

  // Collect the full union of graphql field names across every generated
  // template. These are added to every concrete type (so the shared
  // resolver map attaches cleanly) AND to the `Item` fallback type via
  // `extend type Item` so queries that fall through to `Item` can still
  // select any field (returning null if the underlying item lacks it).
  // Mercurius requires every resolver-map entry to correspond to a
  // declared schema field on every type it's attached to.
  const allFieldNames = new Set<string>(fieldResolverMap.keys());
  const allFieldsBlock = Array.from(allFieldNames)
    .sort()
    .map(name => `    ${name}: ItemField`)
    .join('\n');

  // Build the SDL text. The base interface (`AnyItem`), base concrete type
  // (`Item`) and helper types live in BASE_SCHEMA and are already
  // registered by the time this runs — the generator only emits the
  // dynamic *additions*, delivered via mercurius's `extendSchema` API.
  const parts: string[] = [];
  if (allFieldsBlock) {
    parts.push(`
  extend type Item {
${allFieldsBlock}
  }`);
  }

  // Base-template interfaces (one per `_Foo` template).
  for (const desc of templatesById.values()) {
    if (!desc.isBase) continue;
    const fieldLines = Array.from(desc.fields.keys())
      .map(fname => `    ${fname}: ItemField`)
      .join('\n');
    parts.push(`
  interface ${desc.typeName} {
${fieldLines || '    _placeholder: ItemField'}
  }`);
  }

  // Concrete types. Each type declares the full union of every generated
  // field name — this lets the shared mercurius resolver map attach once
  // per type without tripping the "Cannot find field X of type Y" check,
  // and lets consuming queries select any field via an inline fragment
  // without knowing whether that specific field was declared on the
  // concrete template (a fallback-to-null is better than a parse error).
  //
  // Base templates (name starts with `_`) are emitted only as interfaces
  // above — they don't instantiate as concrete items, so no runtime
  // __typename will ever select them.
  for (const desc of templatesById.values()) {
    if (desc.isBase) continue;
    const implementsList = ['AnyItem', ...desc.baseTypeNames];
    const implementsClause = implementsList.join(' & ');
    const block = `
  type ${desc.typeName} implements ${implementsClause} {
${ANY_ITEM_FIELDS}
${allFieldsBlock}
  }`;
    parts.push(block);
    concreteTypeNames.push(desc.typeName);
  }

  return {
    sdl: parts.join('\n'),
    templatesById,
    fieldResolverMap,
    concreteTypeNames,
  };
}

function addField(
  desc: GeneratedTemplate,
  field: TemplateFieldSchema,
  global: Map<string, string>,
): void {
  if (!field.name) return;
  const gqlName = fieldNameToGraphQLFieldName(field.name);
  if (!gqlName) return;
  // Skip anything that collides with a base `AnyItem` field — the concrete
  // type already declares those with specific types the field-bag would
  // shadow.
  const RESERVED = new Set(['id', 'name', 'displayName', 'path', 'template', 'language', 'url', 'field', 'children', 'parent', 'ancestors', 'hasChildren']);
  if (RESERVED.has(gqlName)) return;
  desc.fields.set(gqlName, field.name);
  // Last-writer-wins on the global map — fields with the same camelCase
  // across templates must map to the same Sitecore name, which is already
  // the case for SXA since the generator derives the gql name FROM the
  // Sitecore name.
  global.set(gqlName, field.name);
}
