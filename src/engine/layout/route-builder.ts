import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import type { LayoutRoute, ComponentNode } from './types.js';
import { DEFAULT_DEVICE_ID } from './rendering-xml.js';
import { buildPlaceholderTree } from './placeholder-tree.js';
import { resolveComponents } from './component-resolver.js';
import { formatItemFields, itemName } from './utils.js';
import { getCombinedRenderingEntries } from './page-design.js';
import { getLatestVersion } from './item-fields.js';
import { emptyPlaceholdersFromLayoutItem } from './rendering-metadata.js';
import {
  collectComponentQueryRequests,
  executeComponentQueryRequests,
  type GraphQLExecutor,
} from './component-query.js';

/** Well-known field ID for __Renderings (layout reference). */
const RENDERINGS_FIELD_ID = 'f1a1fe9e-a60c-4ddb-a3a0-bb5b29fe732e';

/**
 * SXA JSS Layout item ID — `/sitecore/layout/Layouts/Foundation/JSS Experience
 * Accelerator/Presentation/JSS Layout`. Used as a fallback layoutId when an
 * SXA item has no explicit `__Renderings` field (the layout is inherited from
 * the site/standard values but not serialized on the item itself).
 */
const JSS_LAYOUT_ID = '96e5f4ba-a2cf-4a4c-a4e7-64da88226362';

export interface LayoutOptions {
  siteRootPath: string;
  mediaBaseUrl: string;
  language?: string;
  /**
   * When `true`, emit a scaffolded route (empty placeholders + typed route
   * fields) for items whose combined rendering entries are empty. Default
   * `false`: honour the authored presentation and return `null` for such
   * items — matches prod Edge, which excludes them from the route index
   * via `_hasLayout=true`. Flip to `true` only as a dev-convenience when a
   * rendering host needs a non-null response for every bind call.
   */
  allowScaffoldForEmptyLayout?: boolean;
  /**
   * Optional in-process GraphQL executor for rendering-level ComponentQuery
   * dispatch. When provided, renderings whose definition item carries a
   * non-empty `ComponentQuery` shared field have their query executed with
   * variables `{contextItem, datasource, language}` and the result emitted
   * under `fields.data` — matching Sitecore's
   * `GraphQLAwareRenderingContentsResolver` behaviour. When undefined, the
   * pipeline falls back to per-componentName resolvers + schema-driven
   * emission (pre-0.3.0 behaviour).
   */
  graphqlExecutor?: GraphQLExecutor;
}

/**
 * Resolve a route path to a content item in the engine tree.
 */
function resolveRouteItem(
  routePath: string,
  siteRootPath: string,
  engine: Engine,
): ScsItem | undefined {
  const normalizedRoute = routePath === '/' || routePath === '' ? '' : routePath;
  const fullPath = normalizedRoute ? `${siteRootPath}${normalizedRoute}` : siteRootPath;
  const node = engine.getItemByPath(fullPath);
  return node?.item;
}

/**
 * Resolve template name from a template ID.
 * Returns the last path segment of the template item.
 */
function resolveTemplateName(templateId: string, engine: Engine): string {
  const node = engine.getItemById(templateId);
  if (node) {
    return itemName(node.item.path);
  }
  const reg = engine.getRegistryItem(templateId);
  if (reg) {
    return reg.name;
  }
  return '';
}

/**
 * Extract layout ID from the __Renderings shared field.
 * The value is typically a braced GUID like "{guid}".
 */
function getLayoutId(item: ScsItem): string {
  for (const f of item.sharedFields) {
    if (f.id === RENDERINGS_FIELD_ID || f.hint === '__Renderings') {
      if (!f.value) continue;
      const match = f.value.match(/\{([^}]+)\}/);
      return match ? match[1].toLowerCase() : f.value.toLowerCase();
    }
  }
  return JSS_LAYOUT_ID;
}

/**
 * Resolve a route path into a full LayoutRoute by running the layout pipeline:
 * Page Design composition → rendering XML parsing → placeholder tree →
 * component resolution → field formatting.
 *
 * Returns null if the route item cannot be found.
 */
export async function resolveLayout(
  routePath: string,
  engine: Engine,
  options: LayoutOptions,
): Promise<LayoutRoute | null> {
  const language = options.language ?? 'en';
  const { siteRootPath, mediaBaseUrl } = options;

  // Step 1: Resolve route item
  const routeItem = resolveRouteItem(routePath, siteRootPath, engine);
  if (!routeItem) return null;

  // Step 2: Get combined rendering entries (partial designs + page's own)
  const entries = getCombinedRenderingEntries(routeItem, engine, siteRootPath, language);

  // Step 2b: Empty-layout route emission (0.4.0.18).
  //
  // When the merged partial-design + own-layout tree produces no rendering
  // entries, prod's LayoutService still returns a route with the layout
  // item's declared top-level placeholders emitted as `[]`. This matches
  // `FlattenedPlaceholdersResolver.ExtractPlaceholders` escape hatch
  // (`Sitecore.XA.Feature.LayoutServices.Integration.decompiled.cs:1140-
  // 1148`): when the design produces no renderings, the resolver falls
  // through to the item's own `GetRenderingsPerRequest` — which also
  // yields nothing here — and returns an empty PlaceholderDefinition list;
  // downstream `RenderPlaceholders` still emits the layout-declared
  // top-level slots as empty arrays.
  //
  // This folds together 0.4.0.14-0.4.0.17's state (a) and state (b) - the
  // distinction they drew between "no design resolved" (null route) and
  // "design resolved but produced no renderings" (scaffolded route) does
  // not exist in Sitecore's actual output. 0.4.0.17 landed the ancestor-
  // override fix which sent container-template pages to state (a) -> `null`,
  // but Sitecore emits them with empty placeholders.
  //
  // Tradeoff: the original 0.3.7 data-folder exclusion (~134 items Sitecore
  // omits via `_hasLayout=true`) loses its gate here. In the 0.4.0.16
  // capture only 2 of those residuals remained after other fixes tuned the
  // item graph; they will now emit as scaffolded empty routes and show up
  // as BRANCH_MISSING_LOCAL in the page-level diff. That's a ~2-item
  // regression in exchange for closing the BRANCH_MISSING_PROD cases.
  if (entries.length === 0 && !options.allowScaffoldForEmptyLayout) {
    const layoutId = getLayoutId(routeItem);
    const fields = formatItemFields(routeItem, engine, mediaBaseUrl, siteRootPath, language, {
      skipStandardSections: true,
      skipUnknownFields: true,
    });
    const scaffoldRoute: LayoutRoute = {
      name: itemName(routeItem.path),
      displayName: itemName(routeItem.path),
      fields,
      databaseName: 'master',
      deviceId: DEFAULT_DEVICE_ID,
      itemId: routeItem.id,
      itemLanguage: language,
      itemVersion: getLatestVersion(routeItem, language)?.version ?? 1,
      layoutId,
      templateId: routeItem.template,
      templateName: resolveTemplateName(routeItem.template, engine),
      placeholders: emptyPlaceholdersFromLayoutItem(engine, layoutId),
    };
    return scaffoldRoute;
  }

  // Step 3: Build placeholder tree, run ComponentQuery pre-scan (if an
  // executor is wired), then resolve components with the resulting data map.
  let placeholders: Record<string, ComponentNode[]> = {};
  if (entries.length > 0) {
    const tree = buildPlaceholderTree(entries, engine);

    // ComponentQuery pre-scan + batch execute. Keeps the core component
    // resolver synchronous — only this layer awaits the executor. A failed
    // or missing executor leaves `componentQueryResults` empty and each
    // rendering falls through to its default resolver path.
    let componentQueryResults: Map<string, unknown> | undefined;
    if (options.graphqlExecutor) {
      const requests = collectComponentQueryRequests(
        tree, engine, routeItem.id, routeItem.path, language,
      );
      if (requests.length > 0) {
        componentQueryResults = await executeComponentQueryRequests(
          requests, options.graphqlExecutor,
        );
      }
    }

    placeholders = resolveComponents(
      tree, engine, mediaBaseUrl, routeItem.path, siteRootPath, componentQueryResults,
    );
  }

  // Port of Sitecore's `PlaceholderRenderingService.RenderPlaceholders`
  // (`Sitecore.LayoutService.decompiled.cs:3434-3443`): every
  // PlaceholderDefinition the resolver returns produces a RenderedPlaceholder
  // — including those with `Elements = []`. The `TransformPlaceholders` step
  // emits `{name: []}` for the empty ones; the key is never dropped. At the
  // ROUTE level, the definition set comes from the layout item's own
  // declared `Placeholders` field (headless-header, headless-main,
  // headless-footer for the SXA JSS Layout). Merge those in so a page whose
  // rendering tree populates only a subset still emits the full layout-
  // declared key set, with the unpopulated ones as `[]`.
  const declaredRouteSlots = emptyPlaceholdersFromLayoutItem(engine, getLayoutId(routeItem));
  for (const key of Object.keys(declaredRouteSlots)) {
    if (!(key in placeholders)) placeholders[key] = [];
  }

  // Step 4: Format route-level fields
  const fields = formatItemFields(routeItem, engine, mediaBaseUrl, siteRootPath, language, { skipStandardSections: true, skipUnknownFields: true });

  // Step 5: Assemble LayoutRoute
  const route: LayoutRoute = {
    name: itemName(routeItem.path),
    displayName: itemName(routeItem.path),
    fields,
    databaseName: 'master',
    deviceId: DEFAULT_DEVICE_ID,
    itemId: routeItem.id,
    itemLanguage: language,
    itemVersion: getLatestVersion(routeItem, language)?.version ?? 1,
    layoutId: getLayoutId(routeItem),
    templateId: routeItem.template,
    templateName: resolveTemplateName(routeItem.template, engine),
    placeholders,
  };
  return route;
}
