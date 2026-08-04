import { createHash } from 'crypto';
import type { Engine } from '../index.js';
import type { ScsItem, ItemNode } from '../types.js';
import { TEMPLATE_TEMPLATE_ID, FIELD_IDS } from '../constants.js';
import { getTemplateSchema } from '../template-schema.js';
import { graphqlTypeize, graphqlFieldize } from './name-normalizer.js';
import { sitecoreFieldTypeToGraphQLType } from './field-graphql-type.js';

/**
 * Convert a Sitecore template **name** into a GraphQL type identifier.
 * Uses the Sitecore-faithful NameNormalizer (splits on spaces only,
 * preserves underscores). Empty or whitespace-only input returns `'UnknownItem'`.
 */
export function templateNameToTypeName(name: string): string {
  if (!name || !name.trim()) return 'UnknownItem';
  const result = graphqlTypeize(name);
  return result || 'UnknownItem';
}

/**
 * GraphQL reserved word list that field names can't collide with. Kept
 * minimal - `__typename` is the main practical hazard.
 */
const GRAPHQL_RESERVED_FIELDS = new Set(['__typename', '__schema', '__type']);

/**
 * Convert a Sitecore field **name** into a GraphQL field identifier.
 * Uses the Sitecore-faithful NameNormalizer (splits on spaces only,
 * preserves underscores). Prefixes with `_` when the result starts with
 * a digit or collides with a GraphQL reserved name.
 */
export function fieldNameToGraphQLFieldName(name: string): string {
  if (!name) return '';
  const result = graphqlFieldize(name);
  if (!result) return '';
  if (GRAPHQL_RESERVED_FIELDS.has(result)) return `_${result}`;
  return result;
}

/**
 * Descriptor for one template emitted into the generated schema. The
 * graphql route uses `typeName` to build the `Item.resolveType` dispatcher
 * (it maps an item's template id to the concrete object type name).
 */
export interface GeneratedTemplate {
  /**
   * Concrete object type name. Faithful to Edge's `UpdateTemplateGraphName`:
   * a NON-LEAF template (one that other templates inherit) yields `C__<Name>`
   * so its clean `<Name>` belongs to the interface; a leaf yields `<Name>`.
   */
  typeName: string;
  /** Interface name (`<Name>`) when this template is emitted as an interface, else null. */
  interfaceName: string | null;
  sitecoreName: string;
  templateId: string;
  /** True when some other template inherits this one (Edge's non-leaf rule). */
  isNonLeaf: boolean;
  /** graphql field name -> { sitecoreName, gqlType } for this template's flattened fields. */
  fields: Map<string, { sitecoreName: string; gqlType: string }>;
}

/**
 * Result of schema generation: the SDL text fragment to concatenate onto
 * the base schema, a map from template id -> generated descriptor, a flat
 * field-resolver map for every field name the schema exposes, and the
 * ordered list of every emitted concrete object type (for resolver registration).
 */
export interface GeneratedSchemaResult {
  sdl: string;
  templatesById: Map<string, GeneratedTemplate>;
  /** graphql field name -> original Sitecore field name (global across all types). */
  fieldResolverMap: Map<string, string>;
  /** Every concrete `type` name emitted, including `UnknownItem`. */
  concreteTypeNames: string[];
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 6);
}

/**
 * Scan the engine tree for all items whose template is the Sitecore
 * `Template` template - these are the user-authored template definitions
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
 * template ids (brace-wrapped GUIDs), lowercased. Returns an empty array when
 * the field is absent or empty.
 *
 * Exported for reuse in the search engine's transitive base-template walk.
 */
export function readBaseTemplateIds(item: ScsItem): string[] {
  const raw = item.sharedFields.find(f => f.id.toLowerCase() === FIELD_IDS.baseTemplate)?.value;
  if (!raw) return [];
  const matches = raw.match(/\{[^}]+\}/g);
  if (!matches) return [];
  return matches.map(m => m.slice(1, -1).toLowerCase());
}

/**
 * Breadth-first walk of the full `__Base template` chain from `startId`,
 * returning every transitively-reachable base template id (lowercased) in
 * declaration order, excluding `startId` itself. Cycle-guarded via a visited
 * set so a base-template cycle terminates instead of hanging.
 */
function collectTransitiveBaseIds(startId: string, baseIdsById: Map<string, string[]>): string[] {
  const result: string[] = [];
  const visited = new Set<string>([startId]);
  const queue = [...(baseIdsById.get(startId) ?? [])];
  while (queue.length > 0) {
    const baseId = queue.shift()!;
    if (visited.has(baseId)) continue;
    visited.add(baseId);
    result.push(baseId);
    for (const next of baseIdsById.get(baseId) ?? []) queue.push(next);
  }
  return result;
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

/** Field names owned by the `Item` interface - a template field can't shadow these. */
const RESERVED_ITEM_FIELDS = new Set([
  'id', 'name', 'displayName', 'path', 'template', 'language', 'version', 'url',
  'field', 'fields', 'children', 'parent', 'ancestors', 'hasChildren', 'rendered', 'languages',
]);

/**
 * The shared `Item` interface fields block - every concrete object type
 * re-declares this exact text (template interfaces do NOT; faithful to Edge,
 * whose template interfaces carry only their own fields and do not implement
 * `Item`). Kept inline to avoid ambiguity about SDL interpolation order.
 */
const ANY_ITEM_FIELDS = `    id(format: String = "N"): ID!
    name: String!
    displayName: String
    path: String!
    language: ItemLanguage!
    version: Int!
    template: ItemTemplate!
    url: ItemUrl
    field(name: String!): ItemField
    fields(ownFields: Boolean = false): [ItemField!]!
    children(includeTemplateIDs: [String!], hasLayout: Boolean, first: Int, after: String): ItemSearchResults!
    parent: Item
    ancestors(includeTemplateIDs: [String!], hasLayout: Boolean): [Item!]!
    hasChildren(includeTemplateIDs: [String!], hasLayout: Boolean): Boolean!
    rendered: JSON!
    languages: [Item!]!`;

/**
 * Compute a template's flattened GraphQL fields (own + inherited), each keyed
 * by its graphql field name and carrying the Sitecore source name plus the
 * resolved GraphQL field type (ImageField/DateField/... via the shared
 * field-type map, TextField fallback). Fields that collide with an `Item`
 * interface field, or normalize to an empty name, are dropped.
 */
function computeFields(templateId: string, engine: Engine): Map<string, { sitecoreName: string; gqlType: string }> {
  const fields = new Map<string, { sitecoreName: string; gqlType: string }>();
  const schema = safeGetSchema(templateId, engine);
  for (const section of schema.sections) {
    for (const f of section.fields) {
      if (!f.name) continue;
      const gqlName = fieldNameToGraphQLFieldName(f.name);
      if (!gqlName || RESERVED_ITEM_FIELDS.has(gqlName)) continue;
      fields.set(gqlName, { sitecoreName: f.name, gqlType: sitecoreFieldTypeToGraphQLType(f.type) });
    }
  }
  return fields;
}

/**
 * Build the generated schema text from the engine's templates, faithful to
 * Sitecore Experience Edge's `ContentSchemaProvider` (decompiled). Emits, in
 * order:
 *
 *   1. One `interface <Name>` per NON-LEAF template (a template that some
 *      other template inherits) that has >=1 field. The interface carries the
 *      template's flattened fields, each typed by its Sitecore field type. It
 *      is FLAT - it does not declare `implements` for its own base interfaces
 *      (only concrete object types do).
 *   2. One concrete `type` per template. A non-leaf template's object type is
 *      named `C__<Name>` (Edge's `UpdateTemplateGraphName`) so the clean name
 *      belongs to the interface; a leaf's object type keeps `<Name>`. Each
 *      object `implements Item` + its own interface (if non-leaf) + every
 *      transitively-reached base template's interface. Its fields are the full
 *      Item interface block plus its flattened, typed template fields.
 *
 * The generic `UnknownItem` fallback + all base helper types live in
 * BASE_SCHEMA and are already registered; this only emits the dynamic
 * additions, delivered via mercurius's `extendSchema`.
 */
export function generateSchemaFromRegistry(engine: Engine): GeneratedSchemaResult {
  const templateNodes = collectTemplateNodes(engine);
  const templatesById = new Map<string, GeneratedTemplate>();
  const fieldResolverMap = new Map<string, string>();
  const concreteTypeNames: string[] = ['UnknownItem'];

  // Direct base-template ids per template (lowercased), and the set of every
  // template that is inherited by another (Edge's `nonLeafTemplates`). A base
  // is only counted as non-leaf if it is itself one of the generated
  // templates; out-of-set (e.g. OOTB-registry-only) bases are ignored here.
  const inSet = new Set(templateNodes.map(n => n.item.id.toLowerCase()));
  const baseIdsById = new Map<string, string[]>();
  const nonLeafIds = new Set<string>();
  for (const node of templateNodes) {
    const id = node.item.id.toLowerCase();
    const bases = readBaseTemplateIds(node.item);
    baseIdsById.set(id, bases);
    for (const b of bases) if (inSet.has(b)) nonLeafIds.add(b);
  }

  // Pass 1: assign clean/interface/concrete names (collision-suffixed) and
  // compute each template's flattened, typed field set.
  const usedTypeNames = new Set<string>(['UnknownItem']);
  const reserve = (name: string, seedId: string): string => {
    let candidate = name;
    if (usedTypeNames.has(candidate)) candidate = `${name}_${shortHash(seedId)}`;
    usedTypeNames.add(candidate);
    return candidate;
  };
  for (const node of templateNodes) {
    const id = node.item.id.toLowerCase();
    const sitecoreName = templateItemName(node);
    const isNonLeaf = nonLeafIds.has(id);
    const fields = computeFields(node.item.id, engine);

    const cleanName = reserve(templateNameToTypeName(sitecoreName), node.item.id);
    const interfaceName = isNonLeaf && fields.size > 0 ? cleanName : null;
    // A non-leaf template's concrete object is `C__<Name>`; the clean name is
    // the interface. Leaf templates keep the clean name for the object.
    const typeName = isNonLeaf ? reserve(`C__${cleanName}`, node.item.id) : cleanName;

    templatesById.set(id, { typeName, interfaceName, sitecoreName, templateId: node.item.id, isNonLeaf, fields });
  }

  const fieldLines = (fields: Map<string, { sitecoreName: string; gqlType: string }>): string =>
    Array.from(fields.entries())
      .map(([gqlName, { gqlType }]) => `    ${gqlName}: ${gqlType}`)
      .join('\n');

  const parts: string[] = [];

  // Interfaces: one per non-leaf template with >=1 field. Flat (no implements).
  for (const desc of templatesById.values()) {
    if (!desc.interfaceName) continue;
    parts.push(`
  interface ${desc.interfaceName} {
${fieldLines(desc.fields)}
  }`);
  }

  // Concrete object types. Each implements Item + own interface (if non-leaf)
  // + every transitively-reached base template's interface.
  for (const [id, desc] of templatesById) {
    const implementsList = ['Item'];
    if (desc.interfaceName) implementsList.push(desc.interfaceName);
    for (const baseId of collectTransitiveBaseIds(id, baseIdsById)) {
      const baseDesc = templatesById.get(baseId);
      if (baseDesc?.interfaceName && !implementsList.includes(baseDesc.interfaceName)) {
        implementsList.push(baseDesc.interfaceName);
      }
    }
    const fieldBlock = fieldLines(desc.fields);
    parts.push(`
  type ${desc.typeName} implements ${implementsList.join(' & ')} {
${ANY_ITEM_FIELDS}${fieldBlock ? `\n${fieldBlock}` : ''}
  }`);
    concreteTypeNames.push(desc.typeName);

    for (const [gqlName, { sitecoreName }] of desc.fields) {
      fieldResolverMap.set(gqlName, sitecoreName);
    }
  }

  return {
    sdl: parts.join('\n'),
    templatesById,
    fieldResolverMap,
    concreteTypeNames,
  };
}
