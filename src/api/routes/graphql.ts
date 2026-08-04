import type { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';

declare module 'fastify' {
  interface FastifyInstance {
    extendMockingbirdSchema?: () => void;
  }
}
import { GraphQLJSON, GraphQLLong } from 'graphql-scalars';
import type { Engine } from '../../engine/index.js';
import type { ScsItem, ItemNode } from '../../engine/types.js';
import { resolveLayout } from '../../engine/layout/index.js';
import { resolveRedirects } from '../../engine/redirects/index.js';
import {
  resolveItemByPath,
  readItemFieldByHint,
  resolveItemChildren,
} from '../../engine/item-query/index.js';
import {
  generateSchemaFromRegistry,
  templateNameToTypeName,
} from '../../engine/schema/generate.js';
import {
  resolveSearch,
  type SearchWhere,
  encodeCursor,
  decodeCursor,
} from '../../engine/search/index.js';
import { parseGuidList, toCanonicalGuid, formatGuidEdge, normalizeGuid } from '../../engine/guid.js';
import { FIELD_IDS, FINAL_RENDERINGS_FIELD_ID, RENDERINGS_FIELD_ID } from '../../engine/constants.js';
import { buildJsonValue, lookupFieldType } from '../../engine/item-query/field-json-value.js';
import { FIELD_TYPE_TO_GQL } from '../../engine/schema/field-graphql-type.js';
import { getTemplateSchema, type TemplateFieldSchema } from '../../engine/template-schema.js';
import { parseAuthoredAttrs } from '../../engine/render-field/html-utils.js';
import { buildMediaSrc, buildMediaUrlPath, readSharedString } from '../../engine/render-field/media.js';
import { EXTENSION_FIELD_ID, MIME_TYPE_FIELD_ID } from '../../engine/constants.js';
import { referenceUrl } from '../../engine/layout/url-utils.js';
import { rewriteRichText, expandXaVariableSpans, containsXaVariableSpan } from '../../engine/render-field/rich-text.js';
import {
  discoverSiteDefinitions,
  lookupSiteByName,
  routeBaseForSite,
  type SiteDefinition,
} from '../../engine/sites/index.js';

/** Mercurius per-request context injected into all resolvers. */
interface MercuriusContext {
  engine: Engine;
  site: SiteDefinition | null;
}

/**
 * The `item(path, language)` resolver wraps the looked-up item in this
 * symbol-tagged shape so child resolvers (`language`, `field`, generated
 * template-specific fields, `children`) can recover the requested language
 * and read versioned fields under it. The symbol keeps the tag scoped to
 * this file - it never collides with a real ScsItem property.
 */
const LANG_SYM: unique symbol = Symbol('mockingbird.requestedLanguage');
type LangTaggedItem = ScsItem & { [LANG_SYM]?: string };

function withLanguage(item: ScsItem, language: string): LangTaggedItem {
  // Shallow Object.assign keeps shared references to sharedFields / languages
  // arrays; the resolver reads them, never mutates them.
  return Object.assign({}, item, { [LANG_SYM]: language }) as LangTaggedItem;
}

function langOf(item: ScsItem): string {
  const tagged = item as LangTaggedItem;
  return tagged[LANG_SYM] ?? 'en';
}

/**
 * Symbol tag carrying the pre-built presentation envelope for a route item
 * returned by the `layout` resolver. Mirrors the `LANG_SYM` pattern: the tag
 * is scoped to this file, never collides with a real ScsItem property, and is
 * read only by the `Item.rendered` field resolver.
 *
 * Items fetched via `Query.item` (no render context) leave this tag absent,
 * so `rendered` correctly returns `{}` for those paths.
 */
const RENDERED_SYM: unique symbol = Symbol('mockingbird.rendered');
type RenderedTaggedItem = LangTaggedItem & { [RENDERED_SYM]?: unknown };

/**
 * Return a language- and rendered-tagged copy of `item`. The returned object
 * carries both `LANG_SYM` (so `langOf` reads the right language) and
 * `RENDERED_SYM` (so `Item.rendered` returns the pre-built envelope). Both
 * tags are stamped in one `Object.assign` call to avoid a second shallow-copy.
 */
function withRendered(item: ScsItem, language: string, rendered: unknown): RenderedTaggedItem {
  return Object.assign({}, item, { [LANG_SYM]: language, [RENDERED_SYM]: rendered }) as RenderedTaggedItem;
}

/**
 * GraphQL input shape for the `ItemSearchPredicate` input type.
 * Mirrors the SDL declaration (recursive AND/OR, plus leaf clause fields).
 */
interface ItemSearchPredicate {
  name?: string | null;
  value?: string | null;
  operator?: string | null;
  AND?: ItemSearchPredicate[] | null;
  OR?: ItemSearchPredicate[] | null;
}

/**
 * Extract the language from a top-level `_language` clause in the
 * `ItemSearchPredicate.AND` array. Falls back to `'en'` when absent.
 * The language tag is applied to each result item so field reads use the
 * correct versioned value.
 */
function searchLanguageOf(where: ItemSearchPredicate | null | undefined): string {
  const clauses = where?.AND ?? [];
  for (const clause of clauses) {
    if (clause.name === '_language' && clause.value) {
      return clause.value.trim();
    }
  }
  return 'en';
}

/**
 * Derive a human-readable name for `code` in `displayLocale` using the ECMA-402
 * `Intl.DisplayNames` API. Falls back to `code` on any error or when the API
 * returns undefined (e.g. unrecognised codes in older V8 builds).
 */
function resolveDisplayName(code: string, displayLocale: string): string {
  try {
    const dn = new Intl.DisplayNames([displayLocale], { type: 'language' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Build an `ItemLanguage` object for the given language code. */
function buildItemLanguage(code: string): {
  name: string;
  englishName: string;
  nativeName: string;
  displayName: string;
} {
  return {
    name: code,
    // English name: how English speakers name this language
    englishName: resolveDisplayName(code, 'en'),
    // Native name: how native speakers name this language
    nativeName: resolveDisplayName(code, code),
    // displayName mirrors englishName - matches Edge's `displayName` field
    displayName: resolveDisplayName(code, 'en'),
  };
}

/**
 * Return the highest version number the item has in the requested language,
 * or 1 if the language is absent or has no versions. Mirrors Sitecore's
 * `Item.Version.Number` behaviour where version 1 is the minimum.
 */
function resolveItemVersion(item: ScsItem): number {
  const lang = item.languages.find(l => l.language === langOf(item));
  if (!lang || lang.versions.length === 0) return 1;
  return Math.max(...lang.versions.map(v => v.version));
}

/**
 * Parse a raw Sitecore field value as a float for `ItemField.numberValue`.
 * Integer and Number fields round-trip through this with no loss;
 * anything else (empty, non-numeric text, whitespace) returns `null` so
 * the wrapper-always-present rule still holds but the inner scalar
 * correctly signals "no numeric interpretation available".
 */
function parseFieldNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Number() is stricter than parseFloat - "2abc" → NaN instead of 2 -
  // which is what Edge returns for non-numeric strings in a number
  // accessor.
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a raw Sitecore field value as an ISO-8601 string for
 * `ItemField.dateValue`. Accepts both the compact Sitecore form
 * (`yyyyMMddTHHmmssZ`) that Datetime fields are stored in, and the
 * expanded ISO-8601 form that __Created / __Updated often carry.
 * Returns the expanded form on success, `null` when the input is empty
 * or doesn't parse.
 */
function parseFieldDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Sitecore compact ISO: yyyyMMddTHHmmssZ → rewrite to expanded.
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(trimmed);
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  }
  // Already-expanded ISO-8601: validate via Date.parse, then return the
  // original string verbatim so we don't round-trip formatting changes.
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return trimmed;
}

// Self-contained GraphiQL UI replacing Mercurius's bundled main.js (which
// calls the React 17 ReactDOM.render API on the React 18 it loads from
// unpkg, throwing on first paint). React + GraphiQL pulled from unpkg with
// pinned versions; SRI hashes omitted because the pinned versions are the
// audit guarantee and a noindex meta keeps the page out of crawlers. Bump
// the three pins together when upgrading.
const GRAPHIQL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>GraphiQL</title>
  <meta name="robots" content="noindex" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3.8.3/graphiql.min.css" />
  <style>
    html, body, #graphiql { margin: 0; height: 100vh; }
  </style>
</head>
<body>
  <div id="graphiql">Loading GraphiQL...</div>
  <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/graphiql@3.8.3/graphiql.min.js"></script>
  <script>
    var fetcher = GraphiQL.createFetcher({ url: '/api/graphql' });
    var root = ReactDOM.createRoot(document.getElementById('graphiql'));
    root.render(React.createElement(GraphiQL, { fetcher, defaultEditorToolsVisibility: true }));
  </script>
</body>
</html>`;

/**
 * URI-decode a string, suppressing any `URIError` on malformed sequences.
 * Used by the Name Value List resolver to decode `key=value` pairs.
 */
function safeDecodeURI(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Map a `TemplateFieldSchema` entry and its parent section metadata to the
 * `ItemTemplateField` wire shape. Called from three resolver sites:
 * - `readHint`'s `definition` builder (inline field-definition lookup)
 * - `ItemTemplate.ownFields` resolver
 * - `ItemTemplate.fields` resolver
 *
 * A single definition here prevents the three sites from drifting when the
 * field mapping changes. Preserves exact current output: `title` maps from
 * `f.displayName`, not `f.name`.
 */
function toItemTemplateField(
  f: TemplateFieldSchema,
  sectionName: string,
  sectionSortOrder: number,
): {
  name: string; title: string; type: string; source: string;
  shared: boolean; unversioned: boolean; sortOrder: number;
  section: string; sectionSortOrder: number;
} {
  return {
    name: f.name,
    title: f.displayName,
    type: f.type,
    source: f.source,
    shared: f.shared,
    unversioned: f.unversioned,
    sortOrder: f.sortOrder,
    section: sectionName,
    sectionSortOrder,
  };
}

/**
 * Format a raw GUID string in .NET Guid.ToString(format) style for Edge parity.
 * Shared by both ItemField.id and Item.id resolvers (DRY).
 *
 * Formats:
 *   N (default): 32-hex uppercase, no dashes  (88DA64DE28B64620B1085D8C61564F6F)
 *   D: lowercase hex with dashes              (88da64de-28b6-4620-b108-5d8c61564f6f)
 *   B: {uppercase-dashed}                     ({88DA64DE-28B6-4620-B108-5D8C61564F6F})
 *   P: (uppercase-dashed)                     ((88DA64DE-28B6-4620-B108-5D8C61564F6F))
 *
 * Non-GUID strings (test fixtures, partial ids) pass through: dashes removed and
 * uppercased for N/B/P, left as-is for D.
 */
function applyGuidFormat(raw: string, format?: string): string {
  const fmt = (format ?? 'N').toUpperCase();
  const canonical = toCanonicalGuid(raw) ?? raw;
  if (fmt === 'D') return canonical;
  if (fmt === 'B') return `{${canonical.toUpperCase()}}`;
  if (fmt === 'P') return `(${canonical.toUpperCase()})`;
  // Default "N": 32-hex uppercase, no dashes
  return formatGuidEdge(canonical);
}

export const BASE_SCHEMA = `
  scalar JSON
  scalar Long

  enum OrderByDirection {
    ASC
    DESC
  }

  enum RedirectType {
    REDIRECT_301
    REDIRECT_302
    SERVER_TRANSFER
  }

  type Query {
    layout(site: String!, routePath: String!, language: String!): LayoutData
    site: SiteData!
    item(path: String!, language: String!): Item
    search(where: ItemSearchPredicate!, first: Int = 10, after: String, orderBy: ItemSearchOrderByInput): ItemSearchResults
  }

  type ItemLanguage {
    name: String!
    englishName: String!
    nativeName: String!
    displayName: String!
  }

  interface Item {
    id(format: String = "N"): ID!
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
    languages: [Item!]!
  }

  type UnknownItem implements Item {
    id(format: String = "N"): ID!
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
    languages: [Item!]!
  }

  type ItemTemplate {
    id: ID!
    name: String!
    baseTemplates: [ItemTemplate!]
    ownFields: [ItemTemplateField!]
    fields: [ItemTemplateField!]
  }

  type ItemTemplateField {
    name: String!
    title: String!
    type: String!
    source: String!
    shared: Boolean!
    unversioned: Boolean!
    sortOrder: Int!
    section: String!
    sectionSortOrder: Int!
  }

  type ItemUrl {
    url: String!
    path: String!
    siteName: String!
    hostName: String!
    scheme: String!
  }

  interface ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
  }

  type TextField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
  }

  type NameValueListValue {
    name: String!
    value: String!
  }

  type LinkField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    anchor: String
    queryString: String
    className: String
    text: String
    target: String
    linkType: String
    url: String
  }

  type ImageField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    src(maxWidth: Int, maxHeight: Int): String
    alt: String
    width: String
    height: String
  }

  type FileField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    url: String
  }

  type MediaItemField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    title: String
    keywords: String
    description: String
    extension: String
    mimeType: String
    size: Int
  }

  type DateField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    dateValue: Long
    formattedDateValue(format: String, offset: String): String
  }

  type CheckboxField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
  }

  type NumberField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
  }

  type IntegerField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    intValue: Int
  }

  type LookupField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
  }

  type MultilistField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    targetIds: [String!]
    count: Int
  }

  type NameValueListField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
    values: [NameValueListValue!]
  }

  type RichTextField implements ItemField {
    id(format: String = "N"): ID!
    name: String!
    jsonValue: JSON!
    value: String
    definition: ItemTemplateField
    boolValue: Boolean
    numberValue: Float
    targetItem: Item
    targetItems: [Item!]
  }

  enum SearchOperator {
    EQ
    CONTAINS
    NEQ
    NCONTAINS
    LT
    LTE
    GT
    GTE
  }

  input ItemSearchOrderByInput {
    name: String!
    direction: OrderByDirection
  }

  input ItemSearchPredicate {
    name: String
    value: String
    operator: SearchOperator
    AND: [ItemSearchPredicate!]
    OR: [ItemSearchPredicate!]
  }

  type ItemSearchResults {
    results: [Item!]!
    total: Int!
    pageInfo: PageInfo!
  }

  type LayoutData {
    item: Item
  }

  type SiteData {
    siteInfo(site: String!): SiteInfo
    siteInfoCollection: [SiteInfo!]!
    allSiteInfo(pageSize: Int, pageNumber: Int): SiteInfoResult
  }

  type SiteInfoResult {
    results: [SiteInfo!]!
    total: Int!
  }

  type SiteInfo {
    name: String!
    rootPath: String!
    hostname: String
    language: String
    startItem: String
    robots: String
    sitemap: [String!]
    redirects: [RedirectInfo!]!
    errorHandling(language: String!): ErrorHandlingInfo
    routes(language: String!, includedPaths: [String!], excludedPaths: [String!], after: String, first: Int): RoutesResult
    dictionary(language: String!, first: Int, after: String): DictionaryResult
    attributes: [KeyValuePair!]
  }

  type RedirectInfo {
    pattern: String!
    target: String!
    redirectType: RedirectType!
    isQueryStringPreserved: Boolean!
    isLanguagePreserved: Boolean!
    locale: String!
  }

  type ErrorHandlingInfo {
    notFoundPagePath: String
    notFoundPage: Item
    serverErrorPagePath: String
    serverErrorPage: Item
  }

  type Route {
    route: Item!
    routePath: String!
  }

  type RoutesResult {
    results: [Route!]!
    total: Int!
    pageInfo: PageInfo!
  }

  type DictionaryResult {
    results: [KeyValuePair!]!
    total: Int!
    pageInfo: PageInfo!
  }

  type KeyValuePair {
    key: String!
    value: String!
  }

  type PageInfo {
    endCursor: String
    hasNext: Boolean!
  }
`;

export interface GraphQLRouteOptions {
  mediaBaseUrl: string;
}

export async function registerGraphQLRoutes(
  app: FastifyInstance,
  engine: Engine,
  options: GraphQLRouteOptions,
): Promise<void> {
  const { mediaBaseUrl } = options;
  const buildItemUrl = (item: ScsItem, ctx: MercuriusContext) => {
    // referenceUrl wants the start-item path so URL conversion strips the
    // leading /<startItem> segment correctly. routeBaseForSite collapses
    // SiteDefinition's rootPath + startItem into that absolute base.
    const rootPath = ctx.site ? routeBaseForSite(ctx.site) : '';
    const name = ctx.site?.name ?? '';
    // hostname may be pipe-delimited (multiple bound hostnames); take the
    // first entry for the scalar value, falling back to empty string when
    // ctx.site is null.
    const rawHostname = ctx.site?.hostname ?? '';
    const hostName = rawHostname.split('|')[0].trim();
    return {
      url: item.path,
      path: referenceUrl(item.path, rootPath),
      siteName: name,
      hostName,
      scheme: 'https',
    };
  };

  // The dynamic half of the schema (one concrete type per Sitecore
  // template + base-template interfaces + `extend type Item` for the
  // field union) is built from the state of the engine tree AFTER
  // indexing completes. Generating at `registerGraphQLRoutes` time
  // walked an empty tree (because `startInit` fires indexing as a
  // non-awaited background task) - that's the 0.1.6 regression. We now
  // register mercurius with only the BASE_SCHEMA upfront, then extend
  // once `engine.readiness.ready()` resolves.
  //
  // `templatesById` and `generatedTypeNames` are shared mutable state
  // between the initial resolver (which just returns 'UnknownItem') and the
  // post-readiness augmentation. Before indexing completes, no query
  // reaches mercurius anyway - the readiness gate 503s `/api/*`.
  let generatedTemplatesById = new Map<string, { typeName: string }>();
  let generatedTypeNames = new Set<string>(['UnknownItem']);

  const resolveTypename = (item: ScsItem): string => {
    const tmplDesc = generatedTemplatesById.get(item.template.toLowerCase());
    if (tmplDesc && generatedTypeNames.has(tmplDesc.typeName)) {
      return tmplDesc.typeName;
    }
    return 'UnknownItem';
  };

  const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

  // Field wrappers must never be null for an explicitly-queried field -
  // real Experience Edge always returns the object and sets the inner
  // scalar to the type-appropriate "unset" default. Consuming apps chain
  // into `wrapper.jsonValue.value.src` and similar without guarding on the
  // wrapper itself, so returning null here crashes the component tree.
  //
  // For an unset field: `value = ""`, `boolValue = false`, `jsonValue = { value: "" }`.
  // For a set field: the raw string is exposed via `value`; `boolValue`
  // maps Sitecore checkbox `"1"`/`"0"` to true/false (any other value is
  // false - consuming apps only read `boolValue` on actual checkbox
  // fields); `jsonValue` is routed through `buildJsonValue`, which emits
  // the Edge-shape parsed object for image / link XML and falls through
  // to `{ value: raw }` for anything else. `jsonValue` is always non-null
  // (JSON!) matching the real Edge contract.
  const readHint = (item: ScsItem, hint: string, ctx: MercuriusContext) => {
    const v = readItemFieldByHint(item, hint, langOf(item));
    const raw = v?.value ?? '';
    // `lookupFieldType` walks the item's template (cached) so buildJsonValue
    // can emit the typed empty shape for unset image/link fields, and
    // `{ value: "" }` for unknown/generic types. Never returns null.
    const fieldType = lookupFieldType(item, hint, ctx.engine);
    // 0.4.0.31: `.value` on Rich Text fields is the rewritten (rendered)
    // output - dynamic-link tokens, media tokens, and xa-variable spans
    // all resolved - matching Edge's `renderField` pipeline. Previously
    // only `.jsonValue.value` ran through rewriteRichText; `.value` was
    // the raw stored string.
    //
    // 0.4.0.32: opt-in escape hatch for environments where the type
    // lookup doesn't classify a span-bearing field as "rich text" -
    // `MOCKINGBIRD_XA_VARIABLE_EXPANSION=force` runs xa-variable span
    // expansion on every field value that carries the marker, regardless
    // of declared type. Narrow scope (just the span regex, not
    // ~/link.aspx or -/media) keeps false positives off plain-text
    // fields. Default `sitecore` remains Sitecore-contract correct.
    // rewriteRichText + buildJsonValue both want the start-item path (same
    // contract as buildItemUrl) so reference rewriting strips the right
    // prefix. See routeBaseForSite docs for why this differs from
    // resolveSxaContext, which keeps reading site.rootPath directly.
    const rootPath = ctx.site ? routeBaseForSite(ctx.site) : '';
    let value: string;
    if (fieldType === 'rich text') {
      value = rewriteRichText(raw, ctx.engine, '', rootPath);
    } else if (
      (process.env.MOCKINGBIRD_XA_VARIABLE_EXPANSION ?? 'sitecore').toLowerCase() === 'force'
      && containsXaVariableSpan(raw)
    ) {
      value = expandXaVariableSpans(raw, ctx.engine);
    } else {
      value = raw;
    }

    // Look up the field-definition item in the template schema so we can
    // expose its GUID (for ItemField.id) and its full metadata (for
    // ItemField.definition). Falls back to ZERO_GUID / null when the item
    // has no typed template or the field isn't declared there.
    let fieldDefId = ZERO_GUID;
    let definition: ReturnType<typeof toItemTemplateField> | null = null;
    try {
      const tmplSchema = getTemplateSchema(item.template, ctx.engine);
      const target = hint.toLowerCase();
      let found = false;
      for (const section of tmplSchema.sections) {
        if (found) break;
        for (const f of section.fields) {
          if (f.name && f.name.toLowerCase() === target) {
            fieldDefId = f.id || ZERO_GUID;
            definition = toItemTemplateField(f, section.name, section.sortOrder);
            found = true;
            break;
          }
        }
      }
    } catch {
      // template schema unavailable - fieldDefId stays ZERO_GUID
    }

    return {
      __fieldType: fieldType,
      __id: fieldDefId,
      name: hint,
      value,
      boolValue: raw === '1' ? true : false,
      numberValue: parseFieldNumber(raw),
      dateValue: parseFieldDate(raw),
      jsonValue: buildJsonValue(raw, ctx.engine, rootPath, fieldType),
      definition,
    };
  };

  // True iff `item` has at least one version in `language`. Mockingbird
  // analogue of Sitecore's `Item.Versions.Count > 0` - the predicate
  // EdgeSchema's `parent` and `ancestors` resolvers use to hide tree nodes
  // that exist but were never authored in the requested language.
  // (Sitecore.Services.GraphQL.EdgeSchema.decompiled.cs:3549, :3691)
  const hasVersionsInLanguage = (item: ScsItem, language: string): boolean => {
    const lang = item.languages.find(l => l.language === language);
    return !!lang && lang.versions.length > 0;
  };

  // Sitecore field-type string -> GraphQL concrete type name lives in the
  // shared `field-graphql-type` module (also used by the schema generator so
  // the runtime ItemField dispatch and the static per-template field types
  // never diverge). Any unlisted type falls back to TextField.

  // Shared field-level resolver for TextField (and reused by C2 subtypes).
  // The parent object is the enriched readHint result:
  //   { __fieldType, __id, name, value, boolValue, numberValue, dateValue, jsonValue, definition }
  const sharedItemFieldResolver = {
    id: (parent: { __id?: string }, args: { format?: string }) =>
      applyGuidFormat(parent.__id ?? ZERO_GUID, args?.format),
    name: (parent: { name?: string }) => parent.name ?? '',
    value: (parent: { value?: string }) => parent.value ?? null,
    jsonValue: (parent: { jsonValue?: unknown }) => parent.jsonValue ?? { value: '' },
    boolValue: (parent: { boolValue?: boolean | null }) => parent.boolValue ?? null,
    numberValue: (parent: { numberValue?: number | null }) => parent.numberValue ?? null,
    definition: (parent: { definition?: unknown }) => parent.definition ?? null,
    // targetItem / targetItems: parse GUIDs from the raw field value and
    // resolve each against the engine tree - identical to the old ItemField
    // plain-type resolvers, now on the concrete TextField implementer.
    targetItem: (parent: { value?: string }) => {
      const ids = parseGuidList(parent?.value ?? undefined);
      for (const id of ids) {
        const node = engine.getItemById(id);
        if (node) return node.item;
      }
      return null;
    },
    targetItems: (parent: { value?: string }) => {
      const ids = parseGuidList(parent?.value ?? undefined);
      const out: ScsItem[] = [];
      for (const id of ids) {
        const node = engine.getItemById(id);
        if (node) out.push(node.item);
      }
      return out;
    },
  };

  // ---------------------------------------------------------------------------
  // Per-type resolver additions for C2 concrete ItemField subtypes.
  // Each object is spread with sharedItemFieldResolver when registering
  // the type's resolver map entry. Parent shape is the readHint result:
  //   { __fieldType, __id, name, value, boolValue, numberValue, dateValue, jsonValue, definition }
  // ---------------------------------------------------------------------------

  /** Read the jsonValue attrs object for link/image fields. */
  const jvAttrs = (parent: { jsonValue?: unknown }): Record<string, string> | null => {
    const jv = parent.jsonValue as { value?: unknown } | undefined;
    const v = jv?.value;
    return v && typeof v === 'object' ? (v as Record<string, string>) : null;
  };

  const linkFieldResolvers = {
    url: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.href ?? null,
    text: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.text ?? null,
    anchor: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.anchor ?? null,
    queryString: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.querystring ?? null,
    className: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.class ?? null,
    target: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.target ?? null,
    linkType: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.linktype ?? null,
  };

  const imageFieldResolvers = {
    // src honors optional maxWidth/maxHeight args; always applies mediaBaseUrl
    // from the outer closure so the CDN prefix is consistent.
    src: (parent: { value?: string }, args: { maxWidth?: number; maxHeight?: number } | null) => {
      const attrs = parseAuthoredAttrs(parent.value ?? '');
      const mediaId = normalizeGuid(attrs.mediaid ?? '');
      if (!mediaId) return null;
      const node = engine.getItemById(mediaId);
      if (!node) return null;
      const w = args?.maxWidth != null ? String(args.maxWidth) : (attrs.width ?? '');
      const h = args?.maxHeight != null ? String(args.maxHeight) : (attrs.height ?? '');
      const { src } = buildMediaSrc(node.item, mediaBaseUrl, w, h);
      return src;
    },
    // alt/width/height are already in the pre-computed jsonValue.value attrs
    alt: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.alt ?? null,
    width: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.width ?? null,
    height: (parent: { jsonValue?: unknown }) => jvAttrs(parent)?.height ?? null,
  };

  const fileFieldResolvers = {
    url: (parent: { value?: string }) => {
      // File field XML: <file mediaid="{GUID}" /> - parse mediaid and build path
      const attrs = parseAuthoredAttrs(parent.value ?? '');
      const mediaId = normalizeGuid(attrs.mediaid ?? '');
      if (!mediaId) return null;
      const node = engine.getItemById(mediaId);
      if (!node) return null;
      return `${mediaBaseUrl}${buildMediaUrlPath(node.item)}`;
    },
  };

  // Helper: resolve the first GUID in `value` to a media item and return it.
  const resolveMediaItem = (value: string | undefined): ScsItem | null => {
    const ids = parseGuidList(value);
    for (const id of ids) {
      const node = engine.getItemById(id);
      if (node) return node.item;
    }
    return null;
  };

  const mediaItemFieldResolvers = {
    title: (parent: { value?: string }) => {
      const media = resolveMediaItem(parent.value);
      return media ? (readItemFieldByHint(media, 'title')?.value ?? null) : null;
    },
    keywords: (parent: { value?: string }) => {
      const media = resolveMediaItem(parent.value);
      return media ? (readItemFieldByHint(media, 'keywords')?.value ?? null) : null;
    },
    description: (parent: { value?: string }) => {
      const media = resolveMediaItem(parent.value);
      return media ? (readItemFieldByHint(media, 'description')?.value ?? null) : null;
    },
    extension: (parent: { value?: string }) => {
      const media = resolveMediaItem(parent.value);
      return media ? (readSharedString(media, EXTENSION_FIELD_ID) || null) : null;
    },
    mimeType: (parent: { value?: string }) => {
      const media = resolveMediaItem(parent.value);
      return media ? (readSharedString(media, MIME_TYPE_FIELD_ID) || null) : null;
    },
    size: (parent: { value?: string }) => {
      const media = resolveMediaItem(parent.value);
      if (!media) return null;
      const raw = readItemFieldByHint(media, 'size')?.value;
      if (!raw) return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    },
  };

  const dateFieldResolvers = {
    // dateValue: faithful Edge type - epoch milliseconds as Long (not ISO string).
    // Parses the raw Sitecore field value via the shared ISO normalizer, then
    // converts to ms since epoch. Returns null for unset or unparseable values.
    dateValue: (parent: { dateValue?: string | null }) => {
      if (!parent.dateValue) return null;
      const ms = Date.parse(parent.dateValue);
      return Number.isNaN(ms) ? null : ms;
    },
    // Best-effort formatted date string; format/offset args accepted for
    // schema parity with real Edge but not yet applied (returns ISO string).
    formattedDateValue: (parent: { value?: string }, _args: { format?: string; offset?: string } | null) => {
      return parseFieldDate(parent.value ?? '');
    },
  };

  const integerFieldResolvers = {
    intValue: (parent: { value?: string }) => {
      const trimmed = (parent.value ?? '').trim();
      if (!trimmed) return null;
      const n = parseInt(trimmed, 10);
      return Number.isFinite(n) ? n : null;
    },
  };

  const multilistFieldResolvers = {
    targetIds: (parent: { value?: string }) => parseGuidList(parent.value ?? undefined),
    count: (parent: { value?: string }) => parseGuidList(parent.value ?? undefined).length,
    // targetItems is already covered by sharedItemFieldResolver; keep here for
    // clarity so MultilistField has an explicit targetItems entry.
    targetItems: (parent: { value?: string }) => {
      const ids = parseGuidList(parent.value ?? undefined);
      const out: ScsItem[] = [];
      for (const id of ids) {
        const node = engine.getItemById(id);
        if (node) out.push(node.item);
      }
      return out;
    },
  };

  const nameValueListFieldResolvers = {
    // Sitecore Name Value List stores `key=value` pairs separated by `&`.
    // Keys and values may be URI-encoded; decode them before returning.
    values: (parent: { value?: string }) => {
      const raw = (parent.value ?? '').trim();
      if (!raw) return [];
      return raw.split('&')
        .map(pair => {
          const eq = pair.indexOf('=');
          if (eq === -1) {
            const name = safeDecodeURI(pair.trim());
            return name ? { name, value: '' } : null;
          }
          return {
            name: safeDecodeURI(pair.slice(0, eq).trim()),
            value: safeDecodeURI(pair.slice(eq + 1).trim()),
          };
        })
        .filter((p): p is { name: string; value: string } => !!p?.name);
    },
  };

  // Shared resolver for every generated `Item` implementer. Base fields
  // are identical across types; template-specific fields delegate to the
  // generic `readItemFieldByHint` lookup via a `fieldResolverMap` that
  // translates each graphql field name back to its Sitecore source name.
  const sharedItemResolver: Record<string, (item: ScsItem, args: unknown, ctx: MercuriusContext) => unknown> = {
    id: (item: ScsItem, args: unknown) =>
      applyGuidFormat(item.id, (args as { format?: string } | undefined)?.format),
    name: (item: ScsItem) => item.path.split('/').pop() ?? '',
    displayName: (item: ScsItem) => item.path.split('/').pop() ?? '',
    path: (item: ScsItem) => item.path,
    language: (item: ScsItem) => buildItemLanguage(langOf(item)),
    version: (item: ScsItem) => resolveItemVersion(item),
    template: (item: ScsItem) => {
      const tmplNode = engine.getItemById(item.template);
      return {
        id: item.template,
        name: tmplNode ? (tmplNode.item.path.split('/').pop() ?? '') : '',
      };
    },
    url: (item: ScsItem, _args: unknown, ctx: MercuriusContext) => buildItemUrl(item, ctx),
    field: (item: ScsItem, args: unknown, ctx: MercuriusContext) => readHint(item, (args as { name: string }).name, ctx),
    fields: (item: ScsItem, args: unknown, ctx: MercuriusContext) => {
      const { ownFields: ownOnly } = (args ?? {}) as { ownFields?: boolean | null };
      let tmplSchema: ReturnType<typeof getTemplateSchema>;
      try {
        tmplSchema = getTemplateSchema(item.template, ctx.engine);
      } catch {
        return [];
      }
      const normalizedTemplateId = item.template.toLowerCase();
      const out: ReturnType<typeof readHint>[] = [];
      for (const section of tmplSchema.sections) {
        for (const f of section.fields) {
          if (!f.name) continue;
          if (ownOnly && f.sourceTemplateId.toLowerCase() !== normalizedTemplateId) continue;
          out.push(readHint(item, f.name, ctx));
        }
      }
      return out;
    },
    children: (item: ScsItem, args: unknown) => {
      const node = engine.getItemById(item.id);
      if (!node) return { results: [], total: 0, pageInfo: { hasNext: false, endCursor: null } };
      const { includeTemplateIDs, first } = (args ?? {}) as {
        includeTemplateIDs?: string[] | null;
        hasLayout?: boolean | null;
        first?: number | null;
        after?: string | null;
      };
      // Each child inherits the parent's requested language so the
      // child's own field reads stay consistent across a query tree.
      const lang = langOf(item);
      const filtered = resolveItemChildren(engine, node, includeTemplateIDs).map(n => withLanguage(n.item, lang));
      // total is the count of filtered children BEFORE the first-slice.
      const total = filtered.length;
      // `first` caps the result count after the template filter - matches the
      // semantics a head app expects from Experience Edge. `after` is accepted
      // for signature compatibility but unused: typical queries only issue
      // `first:`, and mockingbird doesn't surface a pagination cursor on this
      // connection shape.
      let results = filtered;
      if (typeof first === 'number' && first >= 0) {
        results = results.slice(0, first);
      }
      return { results, total, pageInfo: { hasNext: false, endCursor: null } };
    },
    // Sitecore EdgeSchema.ResolveParent: returns null when the parent has no
    // versions in the requested language (item exists but was never authored).
    // Walks ScsItem.parent (the GUID stored on the item itself) rather than
    // ItemNode.parentNode so registry-only parents resolve identically.
    parent: (item: ScsItem) => {
      if (!item.parent || item.parent === ZERO_GUID) return null;
      const parentNode = engine.getItemById(item.parent);
      if (!parentNode) return null;
      const lang = langOf(item);
      if (!hasVersionsInLanguage(parentNode.item, lang)) return null;
      return withLanguage(parentNode.item, lang);
    },
    // rendered: returns the RENDERED_SYM envelope when the item was produced by
    // the layout resolver (withRendered), otherwise returns an empty object.
    // Items fetched via Query.item or search carry no RENDERED_SYM, so they
    // correctly return {} - matching Sitecore Edge's contract where rendered
    // is only meaningful on the layout route item.
    rendered: (item: ScsItem) => {
      const tagged = item as RenderedTaggedItem;
      return tagged[RENDERED_SYM] ?? {};
    },
    // languages: one language-tagged item per language that has at least one
    // version. Each returned item is tagged via withLanguage so its own field
    // reads resolve under that language. Mirrors Sitecore Edge's
    // item.languages connection (one entry per language version present).
    languages: (item: ScsItem) => {
      return item.languages
        .filter(l => l.versions.length > 0)
        .map(l => withLanguage(item, l.language));
    },
    // Sitecore EdgeSchema.ResolveAncestors: walks Axes.GetAncestors() (root-
    // first) then .Reverse() to produce immediate-parent-first order. Filters
    // ancestors without versions in the requested language. Optional
    // `includeTemplateIDs` filter matches mockingbird's existing exact-template-
    // id semantics (children() uses the same shape) - Sitecore's contract uses
    // DescendsFrom transitive matching, but mockingbird's children resolver
    // doesn't, and consistency across the two ancestor/child predicates beats
    // partial fidelity to one of them.
    // `hasLayout` is accepted for schema parity with XM Cloud Edge but
    // intentionally ignored here - full filtering is deferred to Task E1
    // once layout data is available per item.
    ancestors: (item: ScsItem, args: unknown) => {
      const node = engine.getItemById(item.id);
      if (!node) return [];
      const { includeTemplateIDs } = (args ?? {}) as {
        includeTemplateIDs?: string[] | null;
        hasLayout?: boolean | null;
      };
      const lang = langOf(item);
      const out: ScsItem[] = [];
      let cursor: typeof node.parentNode = node.parentNode;
      while (cursor) {
        if (hasVersionsInLanguage(cursor.item, lang)) {
          out.push(cursor.item);
        }
        cursor = cursor.parentNode;
      }
      let filtered = out;
      if (includeTemplateIDs && includeTemplateIDs.length > 0) {
        const normalized = new Set(
          includeTemplateIDs.map(id => id.replace(/[{}]/g, '').toLowerCase()),
        );
        filtered = filtered.filter(i => normalized.has(i.template.toLowerCase()));
      }
      return filtered.map(i => withLanguage(i, lang));
    },
    // Sitecore EdgeSchema.ResolveHasChildren: bare path returns
    // `Source.HasChildren`; with `includeTemplateIDs` enumerates and filters.
    // Mockingbird's children Map size answers the bare case in O(1); the
    // filter case mirrors children()'s exact-template-id matching.
    hasChildren: (item: ScsItem, args: unknown) => {
      const node = engine.getItemById(item.id);
      if (!node) return false;
      const { includeTemplateIDs } = (args ?? {}) as {
        includeTemplateIDs?: string[] | null;
      };
      if (!includeTemplateIDs || includeTemplateIDs.length === 0) {
        return node.children.size > 0;
      }
      const normalized = new Set(
        includeTemplateIDs.map(id => id.replace(/[{}]/g, '').toLowerCase()),
      );
      for (const c of node.children.values()) {
        if (normalized.has(c.item.template.toLowerCase())) return true;
      }
      return false;
    },
  };

  // Serve our own GraphiQL UI before registering Mercurius so Fastify's
  // registration order ensures this route wins. Mercurius's bundled
  // GraphiQL calls ReactDOM.render() which React 18 removed from its UMD
  // build - the bundled page renders blank. This self-contained HTML pins
  // matching React 18 + GraphiQL 3 versions and uses ReactDOM.createRoot().
  app.get('/graphiql', (_request, reply) => {
    return reply.type('text/html').send(GRAPHIQL_HTML);
  });

  // Mercurius's plugin export is a synchronous CommonJS-style function whose
  // typeof doesn't satisfy Fastify's FastifyPluginAsync overload, even though
  // Fastify accepts it at runtime. This is a long-standing type-ergonomic
  // mismatch between the two packages. The runtime contract is honored by
  // Fastify's register() implementation, which adapts sync plugins.
  // queryDepth caps the depth of any single incoming query. The recursive
  // `children` field can otherwise be nested arbitrarily deep by an
  // unauthenticated localhost caller and pin the event loop. The default
  // (20) covers the typical deeply-nested navigation queries head apps ship,
  // which nests `children -> results -> ... on Type` four times deep
  // (~17-18 levels with inline fragments counted). Tune via env if a
  // deeper query is genuinely needed.
  const queryDepth = Number(process.env.MOCKINGBIRD_GRAPHQL_QUERY_DEPTH ?? 20);

  // @ts-expect-error - Mercurius plugin type / FastifyPluginAsync mismatch
  await app.register(mercurius, {
    schema: BASE_SCHEMA,
    queryDepth,
    resolvers: {
      JSON: GraphQLJSON,
      Long: GraphQLLong,
      Item: { resolveType: resolveTypename },
      UnknownItem: sharedItemResolver,
      // ItemField is now an interface - resolveType dispatches to the right
      // concrete type using FIELD_TYPE_TO_GQL. Unknown field types (no template
      // declaration, or a type not in the map) fall back to TextField.
      ItemField: {
        resolveType: (f: { __fieldType?: string }) =>
          FIELD_TYPE_TO_GQL[(f.__fieldType ?? '').toLowerCase()] ?? 'TextField',
      },
      // TextField is the fallback concrete implementer of ItemField. All field
      // resolvers are shared with C2 subtypes via sharedItemFieldResolver.
      TextField: sharedItemFieldResolver,
      // C2 concrete subtypes - each spreads sharedItemFieldResolver for the 10
      // interface fields and adds per-type resolvers for the extra fields.
      LinkField: { ...sharedItemFieldResolver, ...linkFieldResolvers },
      ImageField: { ...sharedItemFieldResolver, ...imageFieldResolvers },
      FileField: { ...sharedItemFieldResolver, ...fileFieldResolvers },
      MediaItemField: { ...sharedItemFieldResolver, ...mediaItemFieldResolvers },
      DateField: { ...sharedItemFieldResolver, ...dateFieldResolvers },
      // Checkbox/Number/Lookup/RichText have no added fields beyond the interface
      CheckboxField: sharedItemFieldResolver,
      NumberField: sharedItemFieldResolver,
      IntegerField: { ...sharedItemFieldResolver, ...integerFieldResolvers },
      LookupField: sharedItemFieldResolver,
      MultilistField: { ...sharedItemFieldResolver, ...multilistFieldResolvers },
      NameValueListField: { ...sharedItemFieldResolver, ...nameValueListFieldResolvers },
      RichTextField: sharedItemFieldResolver,
      ItemTemplate: {
        // Walk the template item's `__Base template` shared field (standard
        // Sitecore field, id 12c33f3f-…) and return one ItemTemplate record
        // per direct parent. Non-recursive - mirrors real Edge, which returns
        // the direct base set and leaves transitive walking to the caller.
        //
        // `parent.id` is the Edge-format 32-hex-uppercase id we emitted in the
        // upstream `template` resolver. Denormalise back to the engine's
        // canonical lowercase-dashed key before tree lookup.
        baseTemplates: (parent: { id: string }) => {
          const canonical = toCanonicalGuid(parent.id) ?? parent.id;
          const tmplNode = engine.getItemById(canonical);
          if (!tmplNode) return [];
          const raw = tmplNode.item.sharedFields.find(
            f => f.id.toLowerCase() === FIELD_IDS.baseTemplate,
          )?.value;
          const baseIds = parseGuidList(raw ?? undefined);
          const out: Array<{ id: string; name: string }> = [];
          for (const id of baseIds) {
            const node = engine.getItemById(id);
            if (!node) continue;
            out.push({
              id: node.item.id,
              name: node.item.path.split('/').pop() ?? '',
            });
          }
          return out;
        },
        // ownFields: fields defined directly on this template (not inherited).
        // Filters at the FIELD level using field.sourceTemplateId, which is
        // populated per-field in collectOwnSections. This correctly handles the
        // common Sitecore pattern of a derived template adding a field to an
        // inherited section (same section name): the merged section carries the
        // derived template's sourceTemplateId, but base-template fields appended
        // into it keep their own field.sourceTemplateId, so they are excluded here.
        ownFields: (parent: { id: string }) => {
          const canonical = toCanonicalGuid(parent.id) ?? parent.id;
          const normalizedId = canonical.toLowerCase();
          const schema = getTemplateSchema(canonical, engine);
          const out: Array<ReturnType<typeof toItemTemplateField>> = [];
          for (const section of schema.sections) {
            for (const f of section.fields) {
              if (f.sourceTemplateId.toLowerCase() !== normalizedId) continue;
              out.push(toItemTemplateField(f, section.name, section.sortOrder));
            }
          }
          return out;
        },
        // fields: the full flattened field set (own + inherited via base templates).
        // Mirrors real Edge's ItemTemplate.fields which includes all fields
        // visible on the template regardless of where they were defined.
        fields: (parent: { id: string }) => {
          const canonical = toCanonicalGuid(parent.id) ?? parent.id;
          const schema = getTemplateSchema(canonical, engine);
          const out: Array<ReturnType<typeof toItemTemplateField>> = [];
          for (const section of schema.sections) {
            for (const f of section.fields) {
              out.push(toItemTemplateField(f, section.name, section.sortOrder));
            }
          }
          return out;
        },
      },
      Query: {
        site: () => ({}),
        item: (_root: unknown, args: { path: string; language: string }) => {
          const result = resolveItemByPath(engine, args.path);
          console.log(`[graphql] item path=${args.path} lang=${args.language} → ${result ? result.id : 'null'}`);
          return result ? withLanguage(result, args.language) : null;
        },
        search: (_root: unknown, args: { where?: ItemSearchPredicate; first?: number; after?: string; orderBy?: { name: string; direction?: 'ASC' | 'DESC' | null } | null }) => {
          const page = resolveSearch(engine, args.where as unknown as SearchWhere, { first: args.first, after: args.after, orderBy: args.orderBy ?? undefined });
          const lang = searchLanguageOf(args.where);
          console.log(`[graphql] search clauses=${args.where?.AND?.length ?? 0} → ${page.results.length} results (total=${page.total}), hasNext=${page.pageInfo.hasNext}`);
          return {
            total: page.total,
            pageInfo: page.pageInfo,
            results: page.results.map(r => withLanguage(r.item, lang)),
          };
        },
        layout: async (
          _root: unknown,
          args: { site: string; routePath: string; language: string },
          ctx: MercuriusContext,
        ) => {
          const { routePath, language } = args;
          // args.site overrides ctx.site only when it matches a real Site Grouping;
          // unknown args.site falls through (matches Sitecore's unknown-sc_site behavior).
          const site = args.site
            ? lookupSiteByName(ctx.engine, args.site) ?? ctx.site
            : ctx.site;
          if (!site) {
            console.log(`[graphql] layout site=${args.site} route=${routePath} lang=${language} → null (no site context)`);
            return { item: null };
          }

          const started = Date.now();
          // Wire the layout engine to the live Mercurius instance via an
          // in-process GraphQL executor - ComponentQuery-bearing rendering
          // items (once registry Phase 4 enrichment lands, or for tree-
          // serialised rendering items today) have their queries executed
          // against our own `/api/graphql` and their data spliced into
          // `fields.data`. The executor is parameter-injected (not an engine
          // global) so the layout engine stays testable standalone.
          const route = await resolveLayout(routePath, ctx.engine, {
            siteRootPath: routeBaseForSite(site),
            mediaBaseUrl,
            language,
            graphqlExecutor: async (query, variables) => {
              // Thread the parent resolver's ctx into the nested app.graphql
              // call. Mercurius's programmatic invocation does NOT route
              // through the `context:` builder, so passing `undefined` here
              // gave the inner resolvers framework defaults with no engine -
              // every render-field-pipeline path crashed on
              // `args.engine.getItemById`. Same fix family as 0.7.6.0
              // handleEdgeAlias (the third call site in this codebase to
              // bypass context).
              const result = await app.graphql(query, ctx, variables as Record<string, unknown>);
              if (result.errors && result.errors.length > 0) {
                console.warn(
                  `[component-query] in-process executor returned ${result.errors.length} error(s): ${result.errors[0].message}`,
                );
              }
              return result.data;
            },
          });
          const elapsed = Date.now() - started;

          if (!route) {
            // Prod Edge returns `{item: null}` (not a full envelope wrapping
            // `route: null`) for routes whose item doesn't exist or has no
            // renderings - the layout is excluded from the Edge route index
            // via `_hasLayout=true`. Match that wire contract.
            console.log(`[graphql] layout site=${site.name} route=${routePath} lang=${language} → null, ${elapsed}ms`);
            return { item: null };
          }

          const placeholders = Object.keys(route.placeholders);
          let components = 0;
          const walk = (nodes: unknown[]): void => {
            for (const n of nodes) {
              if (n && typeof n === 'object') {
                components++;
                const ph = (n as { placeholders?: Record<string, unknown[]> }).placeholders;
                if (ph) for (const arr of Object.values(ph)) walk(arr);
              }
            }
          };
          for (const arr of Object.values(route.placeholders)) walk(arr);
          console.log(`[graphql] layout site=${site.name} route=${routePath} lang=${language} → ${placeholders.length} ph, ${components} comp, ${elapsed}ms`);

          // Build the presentation envelope (unchanged structure from previous
          // LayoutItem.rendered shape - existing tests continue to assert the
          // exact sitecore.context and sitecore.route paths).
          const envelope = {
            sitecore: {
              context: {
                pageEditing: false,
                site: { name: site.name },
                pageState: 'normal',
                editMode: 'chromes',
                language,
                itemPath: routePath,
              },
              route,
            },
          };

          // Resolve the actual route item using route.itemId (avoids a second
          // path lookup and guarantees we return the same item resolveLayout
          // found - no path-vs-item divergence risk).
          const routeItemNode = ctx.engine.getItemById(route.itemId);
          if (!routeItemNode) {
            return { item: null };
          }

          return {
            item: withRendered(routeItemNode.item, language, envelope),
          };
        },
      },
      SiteData: {
        siteInfo: (
          _root: unknown,
          args: { site: string },
          ctx: MercuriusContext,
        ) => {
          // Explicit args.site lookup. Unknown args.site falls through to ctx.site
          // (matches Sitecore's unknown-sc_site behavior).
          const site = args.site
            ? lookupSiteByName(ctx.engine, args.site) ?? ctx.site
            : ctx.site;
          return site; // SiteDefinition or null - GraphQL handles null by skipping nested fields
        },
        siteInfoCollection: () => discoverSiteDefinitions(engine),
        allSiteInfo: (
          _root: unknown,
          args: { pageSize?: number | null; pageNumber?: number | null },
        ) => {
          const all = discoverSiteDefinitions(engine);
          const pageSize = args.pageSize ?? 10;
          const pageNumber = args.pageNumber ?? 1;
          const start = (pageNumber - 1) * pageSize;
          const results = all.slice(start, start + pageSize);
          return { results, total: all.length };
        },
      },
      SiteInfo: {
        // Scalar fields resolved directly from the SiteDefinition parent.
        // Both siteInfo(site) and siteInfoCollection pass a SiteDefinition as
        // the parent, so these resolvers work identically in both paths.
        name: (parent: SiteDefinition) => parent.name,
        rootPath: (parent: SiteDefinition) => parent.rootPath,
        hostname: (parent: SiteDefinition) => parent.hostname || null,
        language: (parent: SiteDefinition) => parent.language || null,
        startItem: (parent: SiteDefinition) => parent.startItem || null,
        // Fidelity gap: Mockingbird has no robots.txt source. Edge exposes a
        // robots: String field populated from site-grouping data; return null
        // (valid for a nullable String) until a source is wired in.
        robots: () => null,
        // Fidelity gap: Mockingbird has no sitemap source. Edge exposes
        // sitemap: [String!] (list of sitemap URLs); return null (valid for a
        // nullable list) until a source is wired in.
        sitemap: () => null,
        redirects: (parent: SiteDefinition) => {
          // resolveRedirects expects the start-item path: it slices the last
          // segment to recover the SXA site root, then locates Settings/
          // Redirects under that root. Pass routeBaseForSite, not parent.rootPath
          // (the SXA site root) - otherwise the slice drops one segment too far.
          const list = resolveRedirects(engine, parent.name, routeBaseForSite(parent));
          console.log(`[graphql] redirects site=${parent.name} -> ${list.length} entries`);
          return list;
        },
        // ErrorHandlingInfo - return empty defaults (site definition does not expose
        // 404/500 page settings; real Edge returns empty strings when unset).
        errorHandling: (_parent: SiteDefinition, _args: { language: string }) => ({
          notFoundPagePath: null,
          notFoundPage: null,
          serverErrorPagePath: null,
          serverErrorPage: null,
        }),
        // routes: walk descendants of the site start item that have presentation.
        // An item "has layout" when its shared __Renderings field is non-empty OR
        // any version carries a non-empty __Final Renderings field. This matches
        // the layout engine's primary has-layout signal without re-running the
        // full page-design pipeline.
        routes: (
          parent: SiteDefinition,
          args: {
            language: string;
            includedPaths?: string[] | null;
            excludedPaths?: string[] | null;
            first?: number | null;
            after?: string | null;
          },
        ) => {
          const routeBase = routeBaseForSite(parent);
          const routeBaseLower = routeBase.toLowerCase();
          const allRoutes: Array<{ route: ScsItem; routePath: string }> = [];

          for (const node of engine.getAllItems()) {
            const pathLower = node.item.path.toLowerCase();
            // Must be under or at the route base (include the start item itself).
            if (pathLower !== routeBaseLower && !pathLower.startsWith(routeBaseLower + '/')) continue;

            // Has layout: check shared __Renderings field OR any versioned __Final Renderings.
            const hasSharedRenderings = node.item.sharedFields.some(
              f => (f.id === RENDERINGS_FIELD_ID || f.hint === '__Renderings') && f.value,
            );
            const hasFinalRenderings = node.item.languages.some(l =>
              l.versions.some(v =>
                v.fields.some(
                  f => (f.id === FINAL_RENDERINGS_FIELD_ID || f.hint === '__Final Renderings') && f.value,
                ),
              ),
            );
            if (!hasSharedRenderings && !hasFinalRenderings) continue;

            // Route path: strip the route base prefix; default to '/' for the root item.
            const routePath = node.item.path.slice(routeBase.length) || '/';

            // Apply includedPaths filter (route path must start with one of them).
            if (args.includedPaths && args.includedPaths.length > 0) {
              const rp = routePath.toLowerCase();
              const included = args.includedPaths.some(p => rp.startsWith(p.toLowerCase()));
              if (!included) continue;
            }
            // Apply excludedPaths filter (skip route path starting with any excluded prefix).
            if (args.excludedPaths && args.excludedPaths.length > 0) {
              const rp = routePath.toLowerCase();
              const excluded = args.excludedPaths.some(p => rp.startsWith(p.toLowerCase()));
              if (excluded) continue;
            }

            allRoutes.push({ route: withLanguage(node.item, args.language), routePath });
          }

          const total = allRoutes.length;
          const offset = decodeCursor(args.after ?? null);
          const first = args.first ?? 100;
          const page = allRoutes.slice(offset, offset + first);
          const end = offset + page.length;
          const hasNext = end < total;

          return {
            results: page,
            total,
            pageInfo: { hasNext, endCursor: hasNext ? encodeCursor(end) : null },
          };
        },
        // dictionary: best-effort resolver. SXA dictionary items live under
        // <siteRoot>/Dictionary. Mockingbird has no dedicated dictionary template
        // registry; return a valid-empty DictionaryResult when no dictionary data
        // is present. Shape must match exactly: results, total, pageInfo.
        dictionary: (
          _parent: SiteDefinition,
          _args: { language: string; first?: number | null; after?: string | null },
        ) => ({
          results: [],
          total: 0,
          pageInfo: { endCursor: null, hasNext: false },
        }),
        // attributes: expose SiteDefinition properties as key/value pairs.
        // Real Edge surfaces site-grouping settings (name, hostname, language, etc.)
        // as attributes; return the known SiteDefinition scalars.
        attributes: (parent: SiteDefinition) => [
          { key: 'name', value: parent.name },
          { key: 'hostname', value: parent.hostname },
          { key: 'language', value: parent.language },
          { key: 'rootPath', value: parent.rootPath },
          { key: 'startItem', value: parent.startItem },
          { key: 'linkable', value: String(parent.linkable) },
        ],
      },
    },
    context: (request) => buildResolverContext(request),
    path: '/api/graphql',
  });

  // Dynamic schema generation. Runs at most once per process lifetime, gated
  // on a non-empty item tree. Mercurius's `extendSchema` is NOT idempotent
  // (graphql-js throws on duplicate type definitions), so a `schemaExtended`
  // flag suppresses re-runs once a populated tree has been seen.
  //
  // Trigger sites:
  //   1. Boot via readiness.ready() - covers single-layer auto-restore where
  //      the tree is populated before this callback fires.
  //   2. Synchronous fallback at registration time - covers test harnesses
  //      that build a synthetic engine via Object.create(Engine.prototype)
  //      without a real ReadinessState.
  //   3. app.extendMockingbirdSchema() decorator - called from
  //      /api/projects/open after engine.openWorkspace() populates the tree.
  //      Required because in the multi-layer / open-repo boot path, readiness
  //      settles on 'no-project' before any project is loaded, and the
  //      readiness.ready() promise fires only once with an empty tree.
  //
  // An empty-tree call does NOT flip the flag, so a later call after a
  // project opens can still extend.
  let schemaExtended = false;
  const runExtension = (): void => {
    if (schemaExtended) return;
    try {
      // Defer until a workspace is actually loaded. The IAR registry alone
      // yields OOTB types, so generation is non-empty even at no-project boot -
      // but flipping the one-shot flag then would permanently exclude the
      // workspace's own templates (which index after boot). Gate on the item
      // tree, not the SDL, so the real extension runs once the workspace loads.
      if (engine.getAllItems().length === 0) {
        console.log('[graphql] schema generator: no workspace loaded yet - deferring extension');
        return;
      }
      // Reserve the already-registered base-schema type names so a generated
      // OOTB template (e.g. an SXA "Route" template) is suffixed rather than
      // redefining an existing type - extendSchema rejects duplicates.
      const reservedTypeNames = Object.keys(app.graphql.schema.getTypeMap());
      const generated = generateSchemaFromRegistry(engine, reservedTypeNames);
      if (generated.sdl.trim().length === 0) {
        console.log('[graphql] schema generator produced no types');
        return;
      }

      // Update the __typename dispatch map so the resolveType function returns
      // the right concrete type for each item's template at runtime.
      generatedTemplatesById = generated.templatesById;
      generatedTypeNames = new Set(generated.concreteTypeNames);

      // Extend the schema with per-template interfaces + concrete object types.
      app.graphql.extendSchema(generated.sdl);

      // Build per-type resolvers. Each concrete object type declares its OWN
      // flattened field set now (not a union of every field), so it gets the
      // base `Item` field resolvers plus a `readHint` resolver for each of its
      // own template fields. A single shared all-fields object would no longer
      // match any one type's declared fields (mercurius rejects unknown-field
      // resolvers). The `UnknownItem` fallback declares only the base Item
      // fields, so it gets just those.
      const baseItemResolver = sharedItemResolver as unknown as Record<string, unknown>;
      const perTypeResolvers: Record<string, Record<string, unknown>> = {
        UnknownItem: { ...baseItemResolver },
      };
      for (const desc of generated.templatesById.values()) {
        const typeResolver: Record<string, unknown> = { ...baseItemResolver };
        for (const [gqlFieldName, { sitecoreName }] of desc.fields) {
          typeResolver[gqlFieldName] = (item: ScsItem, _args: unknown, ctx: MercuriusContext) => readHint(item, sitecoreName, ctx);
        }
        perTypeResolvers[desc.typeName] = typeResolver;
      }
      app.graphql.defineResolvers(perTypeResolvers);

      schemaExtended = true;
      console.log(
        `[graphql] schema extended: ${generated.concreteTypeNames.length} concrete types, ` +
        `${generated.fieldResolverMap.size} distinct field names`,
      );
    } catch (err) {
      console.error('[graphql] schema extension failed:', err);
    }
  };

  app.decorate('extendMockingbirdSchema', runExtension);

  const readiness = (engine as unknown as { readiness?: { ready?: () => Promise<void> } }).readiness;
  if (readiness?.ready) {
    readiness.ready().then(runExtension).catch((err) => {
      console.error('[graphql] readiness failed, schema not extended:', err);
    });
  } else {
    runExtension();
  }

  // Single source of truth for the per-request GraphQL resolver context.
  // Both Mercurius's `context` builder and the Edge-alias handler below call
  // through here so the two paths produce identical `ctx.engine` + `ctx.site`
  // shapes.
  //
  // RULE: every `app.graphql()` caller MUST pass this (or the parent
  // resolver's `ctx`) as the 2nd arg - never `undefined`, `null`, or `{}`.
  // Mercurius's programmatic invocation does NOT route through the
  // registered `context:` builder, so a missing context arg drops resolvers
  // into framework defaults with no `engine` / no `site`. Field shaping that
  // reads `ctx.engine` (lookupFieldType, link rendering, redirects, etc.)
  // then silently nulls out, and the calling rendering host crashes
  // accessing `null.jsonValue`. This rule is enforced at build time by
  // `scripts/lint-graphql-context.mjs` and was the regression family for
  // cycles 0.7.5.0 / 0.7.6.0 / 0.7.6.1.
  function buildResolverContext(
    request: { site?: SiteDefinition | null },
  ): MercuriusContext {
    return { engine, site: request.site ?? null };
  }

  // Experience Edge alias: sitecore-tools and JSS hosts target
  // `/sitecore/api/graph/edge` with an `sc_apikey` query param. Delegate to
  // the same mercurius instance so callers can point at mockingbird without
  // config rewrites.
  const handleEdgeAlias = async (
    request: { body?: unknown; query?: unknown; site?: SiteDefinition | null },
  ): Promise<unknown> => {
    const body = (request.body ?? {}) as {
      query?: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    };
    const query = body.query ?? (request.query as { query?: string } | undefined)?.query ?? '';
    return app.graphql(query, buildResolverContext(request), body.variables ?? {}, body.operationName);
  };
  app.post('/sitecore/api/graph/edge', handleEdgeAlias);
  app.get('/sitecore/api/graph/edge', handleEdgeAlias);
}
