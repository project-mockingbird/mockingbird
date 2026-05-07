import type { FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { GraphQLJSON } from 'graphql-scalars';
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
  searchItemId,
  type SearchWhere,
} from '../../engine/search/index.js';
import { parseGuidList, toCanonicalGuid } from '../../engine/guid.js';
import { FIELD_IDS } from '../../engine/constants.js';
import { buildJsonValue, lookupFieldType } from '../../engine/item-query/field-json-value.js';
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

const BASE_SCHEMA = `
  scalar JSON

  type Query {
    layout(site: String!, routePath: String!, language: String!): LayoutResponse
    site: SiteQuery!
    item(path: String!, language: String!): AnyItem
    search(where: SearchWhere, first: Int = 50, after: String): SearchResults!
  }

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

  type ItemTemplate {
    id: ID!
    name: String!
    baseTemplates: [ItemTemplate!]
  }

  type ItemUrl {
    url: String!
    path: String!
    siteName: String!
  }

  type ItemField {
    value: String
    jsonValue: JSON
    boolValue: Boolean
    numberValue: Float
    dateValue: String
    targetItem: AnyItem
    targetItems: [AnyItem!]
  }

  type AnyItemChildrenConnection {
    results: [AnyItem!]!
  }

  input SearchWhere {
    AND: [SearchClause!]
  }

  input SearchClause {
    name: String!
    value: String!
    operator: SearchOperator
  }

  enum SearchOperator {
    EQ
    CONTAINS
  }

  type SearchResults {
    pageInfo: PageInfo!
    results: [SearchItem!]!
  }

  type SearchItem {
    id: ID!
    url: SearchUrl
    field(name: String!): SearchField
  }

  type SearchUrl {
    url: String!
    path: String!
    siteName: String!
  }

  type SearchField {
    value: String
  }

  type LayoutResponse {
    item: LayoutItem
  }

  type LayoutItem {
    rendered: JSON
  }

  type SiteQuery {
    siteInfo(site: String!): SiteInfo
    siteInfoCollection: [SiteInfoSummary!]!
  }

  type SiteInfoSummary {
    name: String!
    hostname: String!
    language: String!
    rootPath: String!
    startItem: String!
  }

  type SiteInfo {
    redirects: [Redirect!]!
    errorHandling(language: String!): ErrorHandling!
    dictionary(language: String!, first: Int, after: String): DictionaryConnection!
  }

  type Redirect {
    pattern: String!
    target: String!
    redirectType: String!
    isQueryStringPreserved: Boolean!
    isLanguagePreserved: Boolean!
    locale: String!
  }

  type ErrorHandling {
    notFoundPage: LayoutItem
    notFoundPagePath: String!
    serverErrorPage: LayoutItem
    serverErrorPagePath: String!
  }

  type DictionaryConnection {
    pageInfo: PageInfo!
    results: [DictionaryItem!]!
  }

  type PageInfo {
    endCursor: String
    hasNext: Boolean!
  }

  type DictionaryItem {
    key: String!
    value: String!
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
    return {
      url: item.path,
      path: referenceUrl(item.path, rootPath),
      siteName: name,
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
  // between the initial resolver (which just returns 'Item') and the
  // post-readiness augmentation. Before indexing completes, no query
  // reaches mercurius anyway - the readiness gate 503s `/api/*`.
  let generatedTemplatesById = new Map<string, { typeName: string }>();
  let generatedTypeNames = new Set<string>(['Item']);

  const resolveTypename = (item: ScsItem): string => {
    const tmplDesc = generatedTemplatesById.get(item.template.toLowerCase());
    if (tmplDesc && generatedTypeNames.has(tmplDesc.typeName)) {
      return tmplDesc.typeName;
    }
    return 'Item';
  };

  // Field wrappers must never be null for an explicitly-queried field -
  // real Experience Edge always returns the object and sets the inner
  // scalar to the type-appropriate "unset" default. Consuming apps chain
  // into `wrapper.jsonValue.value.src` and similar without guarding on the
  // wrapper itself, so returning null here crashes the component tree.
  //
  // For an unset field: `value = ""`, `boolValue = false`, `jsonValue = null`.
  // For a set field: the raw string is exposed via `value`; `boolValue`
  // maps Sitecore checkbox `"1"`/`"0"` to true/false (any other value is
  // false - consuming apps only read `boolValue` on actual checkbox
  // fields); `jsonValue` is routed through `buildJsonValue`, which emits
  // the Edge-shape parsed object for image / link XML and falls through
  // to `{ value: raw }` for anything else.
  const readHint = (item: ScsItem, hint: string, ctx: MercuriusContext) => {
    const v = readItemFieldByHint(item, hint, langOf(item));
    const raw = v?.value ?? '';
    // `lookupFieldType` walks the item's template (cached) so buildJsonValue
    // can emit the empty-string image/link shape for unset image/link
    // fields instead of `null`. Unknown types fall back to `null` so we
    // don't synthesize `{ value: "" }` on text/integer fields consuming
    // apps never query `jsonValue` on.
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
    const result = {
      value,
      boolValue: raw === '1' ? true : false,
      numberValue: parseFieldNumber(raw),
      dateValue: parseFieldDate(raw),
      jsonValue: buildJsonValue(raw, ctx.engine, rootPath, fieldType),
    };
    return result;
  };

  // True iff `item` has at least one version in `language`. Mockingbird
  // analogue of Sitecore's `Item.Versions.Count > 0` — the predicate
  // EdgeSchema's `parent` and `ancestors` resolvers use to hide tree nodes
  // that exist but were never authored in the requested language.
  // (Sitecore.Services.GraphQL.EdgeSchema.decompiled.cs:3549, :3691)
  const hasVersionsInLanguage = (item: ScsItem, language: string): boolean => {
    const lang = item.languages.find(l => l.language === language);
    return !!lang && lang.versions.length > 0;
  };

  const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

  // Shared resolver for every generated `AnyItem` implementer. Base fields
  // are identical across types; template-specific fields delegate to the
  // generic `readItemFieldByHint` lookup via a `fieldResolverMap` that
  // translates each graphql field name back to its Sitecore source name.
  const sharedItemResolver: Record<string, (item: ScsItem, args: unknown, ctx: MercuriusContext) => unknown> = {
    id: (item: ScsItem) => item.id,
    name: (item: ScsItem) => item.path.split('/').pop() ?? '',
    displayName: (item: ScsItem) => item.path.split('/').pop() ?? '',
    path: (item: ScsItem) => item.path,
    language: (item: ScsItem) => langOf(item),
    template: (item: ScsItem) => {
      const tmplNode = engine.getItemById(item.template);
      return {
        id: item.template,
        name: tmplNode ? (tmplNode.item.path.split('/').pop() ?? '') : '',
      };
    },
    url: (item: ScsItem, _args: unknown, ctx: MercuriusContext) => buildItemUrl(item, ctx),
    field: (item: ScsItem, args: unknown, ctx: MercuriusContext) => readHint(item, (args as { name: string }).name, ctx),
    children: (item: ScsItem, args: unknown) => {
      const node = engine.getItemById(item.id);
      if (!node) return { results: [] };
      const { includeTemplateIDs, first } = (args ?? {}) as {
        includeTemplateIDs?: string[] | null;
        first?: number | null;
        after?: string | null;
      };
      // Each child inherits the parent's requested language so the
      // child's own field reads stay consistent across a query tree.
      const lang = langOf(item);
      let results = resolveItemChildren(engine, node, includeTemplateIDs).map(n => withLanguage(n.item, lang));
      // `first` caps the result count after the template filter - matches the
      // semantics a head app expects from Experience Edge. `after` is accepted
      // for signature compatibility but unused: typical queries only issue
      // `first:`, and mockingbird doesn't surface a pagination cursor on this
      // connection shape.
      if (typeof first === 'number' && first >= 0) {
        results = results.slice(0, first);
      }
      return { results };
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
    // Sitecore EdgeSchema.ResolveAncestors: walks Axes.GetAncestors() (root-
    // first) then .Reverse() to produce immediate-parent-first order. Filters
    // ancestors without versions in the requested language. Optional
    // `includeTemplateIDs` filter matches mockingbird's existing exact-template-
    // id semantics (children() uses the same shape) - Sitecore's contract uses
    // DescendsFrom transitive matching, but mockingbird's children resolver
    // doesn't, and consistency across the two ancestor/child predicates beats
    // partial fidelity to one of them.
    ancestors: (item: ScsItem, args: unknown) => {
      const node = engine.getItemById(item.id);
      if (!node) return [];
      const { includeTemplateIDs } = (args ?? {}) as {
        includeTemplateIDs?: string[] | null;
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
  // (20) covers the typical ModularNavigation query head apps ship,
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
      AnyItem: { resolveType: resolveTypename },
      Item: sharedItemResolver,
      ItemField: {
        // Real Experience Edge exposes both singular and plural reference
        // accessors on an ItemField. `value` is the raw Sitecore field string
        // (a brace-wrapped GUID for Droplink/Droptree, a pipe-delimited brace
        // list for Treelist/Multilist). Parse GUIDs out and resolve each
        // against the engine tree - items that aren't in the tree are
        // dropped.
        targetItem: (parent: { value?: string | null }) => {
          const ids = parseGuidList(parent?.value ?? undefined);
          for (const id of ids) {
            const node = engine.getItemById(id);
            if (node) return node.item;
          }
          return null;
        },
        targetItems: (parent: { value?: string | null }) => {
          const ids = parseGuidList(parent?.value ?? undefined);
          const out: ScsItem[] = [];
          for (const id of ids) {
            const node = engine.getItemById(id);
            if (node) out.push(node.item);
          }
          return out;
        },
      },
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
      },
      Query: {
        site: () => ({}),
        item: (_root: unknown, args: { path: string; language: string }) => {
          const result = resolveItemByPath(engine, args.path);
          console.log(`[graphql] item path=${args.path} lang=${args.language} → ${result ? result.id : 'null'}`);
          return result ? withLanguage(result, args.language) : null;
        },
        search: (_root: unknown, args: { where?: SearchWhere; first?: number; after?: string }) => {
          const page = resolveSearch(engine, args.where, { first: args.first, after: args.after });
          console.log(`[graphql] search clauses=${args.where?.AND?.length ?? 0} → ${page.results.length} results, hasNext=${page.pageInfo.hasNext}`);
          return page;
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

          return {
            item: {
              rendered: {
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
              },
            },
          };
        },
      },
      SearchItem: {
        id: (parent: { item: ScsItem }) => searchItemId(parent.item),
        url: (parent: { item: ScsItem }, _args: unknown, ctx: MercuriusContext) => buildItemUrl(parent.item, ctx),
        field: (parent: { item: ScsItem }, args: { name: string }) => {
          const value = readItemFieldByHint(parent.item, args.name);
          return value ? { value: value.value } : null;
        },
      },
      SiteQuery: {
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
      },
      SiteInfo: {
        redirects: (parent: SiteDefinition) => {
          // resolveRedirects expects the start-item path: it slices the last
          // segment to recover the SXA site root, then locates Settings/
          // Redirects under that root. Pass routeBaseForSite, not parent.rootPath
          // (the SXA site root) - otherwise the slice drops one segment too far.
          const list = resolveRedirects(engine, parent.name, routeBaseForSite(parent));
          console.log(`[graphql] redirects site=${parent.name} → ${list.length} entries`);
          return list;
        },
        // Stubs matching real Experience Edge output for sites with no error
        // pages configured - Content SDK expects these shapes exactly.
        errorHandling: () => ({
          notFoundPage: null,
          notFoundPagePath: '',
          serverErrorPage: null,
          serverErrorPagePath: '',
        }),
        // Stub - mockingbird has no dictionary support. Edge returns an empty
        // connection for sites without dictionary entries, and Content SDK
        // paginates until `hasNext === false` so matching the shape is critical.
        dictionary: () => ({
          pageInfo: { endCursor: null, hasNext: false },
          results: [],
        }),
      },
    },
    context: (request) => buildResolverContext(request),
    path: '/api/graphql',
  });

  // Defer dynamic schema generation until indexing completes. `startInit`
  // fires indexing as a non-awaited background task, so the tree is
  // typically empty when `registerGraphQLRoutes` runs. The readiness gate
  // 503s `/api/*` until ready, so no query hits the minimal BASE_SCHEMA
  // between registration and this callback. Errors here are logged but
  // non-fatal - the server falls back to the `Item`-only schema.
  //
  // Test harnesses that build a synthetic engine without a full
  // `ReadinessState` (via `Object.create(Engine.prototype)`) don't have
  // `engine.readiness` at all - fall through to running the extension
  // synchronously so those tests see a complete schema.
  const runExtension = (): void => {
    try {
      const generated = generateSchemaFromRegistry(engine);
      if (generated.sdl.trim().length === 0) {
        console.log('[graphql] schema generator produced no template types - tree is empty');
        return;
      }

      // Update the __typename dispatch map so Item resolver returns the
      // right concrete type for each item's template at runtime.
      generatedTemplatesById = generated.templatesById;
      generatedTypeNames = new Set(generated.concreteTypeNames);

      // Extend the schema with base interfaces + per-template concrete
      // types + the `extend type Item` field union.
      app.graphql.extendSchema(generated.sdl);

      // Build resolvers for every newly-declared type. Every concrete
      // template type AND the existing `Item` fallback share the same
      // shared resolver - the difference is just which __typename graphql-js
      // routes each item to. Template-specific field resolvers are added
      // to `sharedItemResolver` dynamically so all types pick them up.
      for (const [gqlFieldName, sitecoreFieldName] of generated.fieldResolverMap) {
        if (gqlFieldName in sharedItemResolver) continue;
        sharedItemResolver[gqlFieldName] = (item: ScsItem, _args: unknown, ctx: MercuriusContext) => readHint(item, sitecoreFieldName, ctx);
      }

      const perTypeResolvers: Record<string, Record<string, unknown>> = {
        Item: sharedItemResolver as unknown as Record<string, unknown>,
      };
      for (const name of generated.concreteTypeNames) {
        if (name === 'Item') continue;
        perTypeResolvers[name] = sharedItemResolver as unknown as Record<string, unknown>;
      }
      app.graphql.defineResolvers(perTypeResolvers);

      console.log(
        `[graphql] schema extended: ${generated.concreteTypeNames.length} concrete types, ` +
        `${generated.fieldResolverMap.size} distinct field names`,
      );
    } catch (err) {
      console.error('[graphql] schema extension failed:', err);
    }
  };

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
