import type { Engine } from '../index.js';
import { normalizeGuid, toCanonicalGuid } from '../guid.js';
import type { ScsItem } from '../types.js';
import type { PlaceholderNode, ComponentNode, JssFieldValue } from './types.js';
import { formatItemFields, itemName } from './utils.js';
import { CONTENTS_RESOLVERS, resolveViaRcrItem } from './contents-resolvers.js';
import { buildMediaUrlPath } from '../render-field/media.js';
import { readSharedField, readFieldWithSvFallback } from './item-fields.js';
import { isPublishingValid } from './publishing.js';
import { COMPONENT_NAME_FIELD_ID } from '../constants.js';
import {
  shouldEmitFields,
  getDeclaredPlaceholderKeys,
} from './rendering-metadata.js';
import { buildExperienceStub } from './experience-stub.js';

/** SXA `Value` shared field - used by Style and similar settings items. */
const VALUE_FIELD_ID = '09147fb2-ebfb-4949-8c8e-26a424409d5e';

/**
 * Map a SXA Bootstrap 5 Grid Definition breakpoint folder name to its CSS
 * abbreviation. `Extra small` gets no abbreviation (applies at all sizes).
 */
const BREAKPOINT_ABBR: Record<string, string> = {
  'extra small': '',
  'small': 'sm',
  'medium': 'md',
  'large': 'lg',
  'extra large': 'xl',
  'extra extra large': 'xxl',
};

/**
 * Map a Grid Definition `<kind>` folder name to the CSS class prefix SXA emits.
 */
/**
 * Components whose RCR absorbs their children into a composite field on
 * the parent rendering (e.g. `FaqList` emits each FAQ item as an entry in
 * `fields.FaqGroups`). Sitecore's LayoutService does not re-emit these
 * children as distinct renderings under the parent's placeholders - the
 * composite field IS the children. Mockingbird suppresses placeholder-
 * resolution on these parents to match prod.
 *
 * 0.4.0.29: introduced for FaqList (digital-pathology regression). If more
 * composite-RCR components surface, add to this set. A generic predicate
 * via RCR configuration is preferable long-term but requires indexing each
 * RCR item's output schema - deferred until more cases justify the work.
 */
const COMPOSITE_FIELD_COMPONENTS = new Set<string>([
  'FaqList',
]);

const GRID_KIND_PREFIX: Record<string, string> = {
  size: 'col',
  offset: 'offset',
  order: 'order',
  display: 'd',
};

/**
 * Component alignment items translate to Bootstrap `ms-auto` / `me-auto` /
 * both-auto utilities rather than the usual `<kind>-<bp>-<value>` format.
 */
const ALIGNMENT_CLASS: Record<string, (bp: string) => string> = {
  'align left':   (bp) => bp ? `me-${bp}-auto` : 'me-auto',
  'align right':  (bp) => bp ? `ms-${bp}-auto` : 'ms-auto',
  'align center': (bp) => bp ? `mx-${bp}-auto` : 'mx-auto',
};

/**
 * Compute a Bootstrap 5 class string for an item under
 * `.../Bootstrap 5 Grid Definition/<breakpoint>/<kind>/<value>`.
 * Returns undefined if the path doesn't match this pattern.
 *
 * Examples:
 *   .../Extra small/Size/12    → "col-12"
 *   .../Large/Size/2           → "col-lg-2"
 *   .../Small/Display/Block    → "d-sm-block"
 *   .../Medium/Offset/4        → "offset-md-4"
 */
function computeBootstrapGridClass(itemPath: string): string | undefined {
  const marker = '/Bootstrap 5 Grid Definition/';
  const idx = itemPath.indexOf(marker);
  if (idx === -1) return undefined;
  const tail = itemPath.slice(idx + marker.length);
  const parts = tail.split('/');
  if (parts.length < 3) return undefined;
  const [breakpoint, kind, ...valueParts] = parts;
  const value = valueParts.join('/');
  const bp = BREAKPOINT_ABBR[breakpoint.toLowerCase()];
  if (bp === undefined) return undefined;

  const kindLower = kind.toLowerCase();
  if (kindLower === 'component alignment') {
    const fn = ALIGNMENT_CLASS[value.toLowerCase()];
    return fn ? fn(bp) : undefined;
  }

  const prefix = GRID_KIND_PREFIX[kindLower];
  if (prefix === undefined) return undefined;

  const valueToken = value.toLowerCase();
  if (bp === '') return `${prefix}-${valueToken}`;
  return `${prefix}-${bp}-${valueToken}`;
}

function safeDecode(s: string): string {
  // Sitecore serializes rendering params using application/x-www-form-urlencoded,
  // so a literal space is encoded as `+`. `decodeURIComponent` follows RFC 3986
  // and does NOT decode `+` - convert it manually first.
  const plusDecoded = s.replace(/\+/g, ' ');
  try { return decodeURIComponent(plusDecoded); } catch { return plusDecoded; }
}

/**
 * Read the resolved display value for an item referenced by a param GUID.
 *
 * 0.4.0.28: tree items route through `readFieldWithSvFallback` so `Value`
 * cascades through the item's template SV chain. Previously only the item's
 * own sharedFields were consulted, so SCS-stripped shared fields (values
 * equal to SV default) fell straight through to the path/grid-class fallback.
 */
function resolveParamItemValue(id: string, engine: Engine): string | undefined {
  const node = engine.getItemById(id);
  if (node) {
    const v = readFieldWithSvFallback(engine, node.item, VALUE_FIELD_ID, 'en');
    if (v) return v;
    const gridClass = computeBootstrapGridClass(node.item.path);
    if (gridClass) return gridClass;
    return itemName(node.item.path);
  }
  const reg = engine.getRegistryItem(id);
  if (reg) {
    // Registry items don't walk SV via this path - `readSharedField` resolves
    // registry entries by id and returns any stored Value; registry-sourced
    // items are typically leaf data (no SV cascade intended).
    const v = readSharedField(engine, id, VALUE_FIELD_ID);
    if (v) return v;
    const gridClass = computeBootstrapGridClass(reg.path);
    if (gridClass) return gridClass;
    return reg.name;
  }
  return undefined;
}

/**
 * Match a pipe-delimited list of braced GUIDs, tolerating a leading pipe
 * (SXA serializes `|{GUID}|{GUID}...` for some param fields - the leading
 * pipe is a marker that any inherited defaults should be cleared; it doesn't
 * represent a real entry).
 */
const GUID_LIST_RE = /^\|?\{[0-9a-fA-F-]{36}\}(\|\{[0-9a-fA-F-]{36}\})*$/;

/**
 * Decode a single rendering param value:
 *   1. URL-decode once (params come doubly escaped from __Final Renderings XML).
 *   2. If the decoded value is a pipe-separated list of braced GUIDs, resolve
 *      each GUID to its referenced item's `Value` field (or item name as a
 *      fallback) and space-join them - this mirrors Edge's output for Styles,
 *      GridParameters, FieldNames, etc.
 *   3. Otherwise return the decoded value as-is.
 */
function decodeParamValue(raw: string, engine: Engine): string {
  if (!raw) return raw;
  const decoded = safeDecode(raw);

  if (GUID_LIST_RE.test(decoded)) {
    // Strip leading `|` (if any) and split, then unbrace each guid.
    const trimmed = decoded.startsWith('|') ? decoded.slice(1) : decoded;
    const parts = trimmed.split('|').map(g => g.slice(1, -1).toLowerCase());
    const resolved: string[] = [];
    let allMissing = true;
    for (const id of parts) {
      const v = resolveParamItemValue(id, engine);
      if (v !== undefined) {
        allMissing = false;
        resolved.push(v);
      } else {
        resolved.push(`{${id}}`);
      }
    }
    if (allMissing) return decoded;
    return resolved.join(' ');
  }

  return decoded;
}

/**
 * Params whose value is a raw GUID reference per SXA convention and must
 * NOT be resolved to the referenced item's value. `sid` on a synthetic
 * PartialDesignDynamicPlaceholder points to the partial design item and
 * is passed through to the rendering host verbatim.
 */
const RAW_GUID_PARAM_KEYS = new Set(['sid', 'DefaultLanguageFilter']);

/** Rendering item shared field: "Parameters Template" (points to the template
 *  whose fields define the rendering's Rendering Parameters). An empty value
 *  means the rendering doesn't inherit from the SXA Rendering Parameters base
 *  and therefore has no FieldNames param to default. */
const PARAMETERS_TEMPLATE_FIELD_ID = 'a77e8568-1ab3-44f1-a664-b7c37ec7810d';

/**
 * Sitecore "Json Rendering" (SXA/JSS) template id. Every SXA/JSS rendering
 * definition inherits from this and therefore has a Parameters Template -
 * distinct from the abstract `RENDERING_TEMPLATE_ID` in `constants.ts` that
 * classifies user-authored rendering items in this codebase.
 */
const JSON_RENDERING_TEMPLATE_ID = '04646a89-996f-4ee7-878a-ffdbf1f0ef0d';

function renderingHasParametersTemplate(renderingId: string, engine: Engine): boolean {
  const v = readSharedField(engine, renderingId, PARAMETERS_TEMPLATE_FIELD_ID);
  if (v && v.trim().length > 0) return true;

  // Registry fallback: the baked registry does not enrich Parameters Template
  // on rendering items, so SXA renderings (Container, etc.) read back empty.
  // Assume any registry item whose template IS Json Rendering has a Parameters
  // Template - true for all SXA module renderings in practice; over-defaulting
  // FieldNames on a rare non-SXA rendering is a minor mismatch, not a bug.
  const reg = engine.getRegistryItem(renderingId);
  if (reg?.template && reg.template.toLowerCase() === JSON_RENDERING_TEMPLATE_ID) return true;
  return false;
}

function decodeParams(
  raw: Record<string, string>,
  engine: Engine,
  mediaBaseUrl: string,
  renderingId: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (RAW_GUID_PARAM_KEYS.has(k)) {
      // URL-decode, but pass the GUID through unresolved - Edge emits
      // these as literal braced GUIDs, not as the referenced item's value.
      out[k] = safeDecode(v);
      continue;
    }
    const decoded = decodeParamValue(v, engine);
    out[k] = enrichImageParam(decoded, engine, mediaBaseUrl);
  }
  // SXA components inherit `FieldNames` from the Rendering Parameters base
  // template with a default of `Default` (the SXA "Default" Variants item).
  // Edge emits this even when the rendering has no stored value - which
  // shows up in the source XML as either a missing `FieldNames` key OR as
  // `FieldNames&` with an empty string value. Skip when:
  // - the rendering is a synthetic PartialDesignDynamicPlaceholder wrapper
  //   (carries `sid` and has no FieldNames param), or
  // - the rendering item has no Parameters Template set at all, meaning it
  //   doesn't inherit the SXA Rendering Parameters base (e.g. Tealium).
  if (
    !('sid' in out) &&
    !out.FieldNames &&
    renderingHasParametersTemplate(renderingId, engine)
  ) {
    out.FieldNames = 'Default';
  }
  return out;
}

/**
 * If a param value is a Sitecore `<image mediaid="{GUID}" />` XML snippet,
 * inject a `mediaurl` attribute pointing to the resolved media item - Edge
 * does this enrichment on rendering params (BackgroundImage and similar image
 * params) so the rendering host can render the image without a second lookup.
 */
function enrichImageParam(value: string, engine: Engine, mediaBaseUrl: string): string {
  if (!value || !value.startsWith('<image ')) return value;
  const idMatch = value.match(/mediaid="(\{[0-9a-fA-F-]{36}\})"/);
  if (!idMatch) return value;
  if (value.includes('mediaurl=')) return value; // already enriched
  const id = normalizeGuid(idMatch[1]);
  const node = engine.getItemById(id);
  if (!node) return value;
  const url = `${mediaBaseUrl}${buildMediaUrlPath(node.item)}`;
  return value.replace(/(mediaid="[^"]+")/, `$1 mediaurl="${url}"`);
}

/**
 * Resolve the rendering definition item to get the component name.
 * Returns `undefined` when the rendering item cannot be found in the
 * serialized tree, the registry, or via a `componentName` override field.
 *
 * Port of `Sitecore.LayoutService.decompiled.cs:2329-2341`
 * `Initialize.GetComponentName`:
 *
 *     string text = renderingItem[FieldIDs.JsonRendering.ComponentName];
 *     if (string.IsNullOrWhiteSpace(text)) text = renderingItem.Name;
 *
 * The `componentName` field value wins if set; item name is the fallback.
 *
 * 0.4.0.29: `"Unknown"` fallback removed - caller now omits the rendering
 * entirely when resolution fails. Matches prod-preview behaviour for SXA
 * OOTB renderings shipped via IAR packages (SearchResults, etc.) that are
 * never serialised to YAML and never reach the server-side layout response.
 * Mockingbird previously emitted a synthetic `Unknown#<uid>` position that
 * prod didn't have.
 */
function resolveComponentName(renderingId: string, engine: Engine): string | undefined {
  const raw = (() => {
    const override = readSharedField(engine, renderingId, COMPONENT_NAME_FIELD_ID);
    if (override && override.trim().length > 0) return override;

    const node = engine.getItemById(renderingId);
    if (node) return itemName(node.item.path);

    const reg = engine.getRegistryItem(renderingId);
    if (reg) return reg.name;

    return undefined;
  })();

  if (raw === undefined) return undefined;

  // JSS/Edge strips whitespace from component names so that they become
  // valid JavaScript identifiers for the rendering host. Each letter that
  // followed a space is upper-cased first (PascalCase join): `SearchBox with
  // Suggestions` → `SearchBoxWithSuggestions`.
  return raw.replace(/\s+([a-z])/g, (_m, c) => c.toUpperCase()).replace(/\s+/g, '');
}

/**
 * Resolve a datasource reference to an ScsItem.
 * Supports: {GUID}, absolute path, local:relative/path, or empty string.
 *
 * `ownerItemPath` is the path of the item whose __Final Renderings produced
 * this rendering - partial designs resolve `local:` relative to themselves,
 * not the page.
 */
export function resolveDatasourceItem(
  dataSource: string,
  engine: Engine,
  ownerItemPath: string,
): ScsItem | undefined {
  if (!dataSource) return undefined;

  // Any valid GUID form (braced, dashed 36-char, or 32-hex - each lower- or
  // uppercase) resolves through the id lookup.
  const canonical = toCanonicalGuid(dataSource);
  if (canonical) {
    return engine.getItemById(canonical)?.item;
  }

  if (dataSource.startsWith('local:')) {
    const relative = dataSource.slice('local:'.length).replace(/^\/+/, '');
    const absolutePath = `${ownerItemPath}/${relative}`;
    const node = engine.getItemByPath(absolutePath);
    return node?.item;
  }

  if (dataSource.startsWith('/')) {
    const node = engine.getItemByPath(dataSource);
    return node?.item;
  }

  return undefined;
}

/**
 * Resolve a single PlaceholderNode into a ComponentNode.
 *
 * `componentQueryResults` - optional map from rendering uid → GraphQL query
 * result. When the current node's uid has an entry, the rendering's fields
 * collapse to `{ data: <queryResult> }` - matching Sitecore's
 * `GraphQLAwareRenderingContentsResolver` which replaces the default
 * datasource-item serialization with the ComponentQuery's JSON envelope.
 */
function resolveNode(
  node: PlaceholderNode,
  engine: Engine,
  mediaBaseUrl: string,
  pageItemPath: string,
  siteRootPath: string,
  componentQueryResults?: Map<string, unknown>,
): ComponentNode | undefined {
  // P3b (0.4.0.14): hidden-by-default renderings emit uid-only stub.
  // Skips all field/placeholder resolution.
  if (node.hidden) {
    return buildExperienceStub(node.uid);
  }

  // 0.4.0.29: unresolvable rendering id → emit nothing. Matches prod-preview
  // behaviour for IAR-shipped SXA OOTB renderings that never serialize to
  // YAML. Callers of resolveNode filter out undefined entries.
  const componentName = resolveComponentName(node.renderingId, engine);
  if (componentName === undefined) return undefined;

  const ownerItemPath = node.ownerItemPath ?? pageItemPath;
  const dsItem = resolveDatasourceItem(node.dataSource, engine, ownerItemPath);

  // 0.4.0.29: datasource publishing filter. Port of Sitecore's
  // `Database.GetItem`-returns-null-on-draft behaviour - when a rendering's
  // datasource item fails `Publishing.IsValid(now, requireApproved)`, the
  // rendering is dropped. Matches prod preview's SXA-site emission. Does
  // NOT fire when `node.dataSource` is empty (no datasource attribute at
  // all - UseContextItem fallback) nor when resolution returned undefined
  // for non-publishing reasons (the rendering still emits with the context
  // item per the existing behaviour at line ~400).
  if (node.dataSource && dsItem && !isPublishingValid(engine, dsItem)) {
    return undefined;
  }

  // ComponentQuery-driven rendering: Sitecore's GraphQLAwareRenderingContentsResolver
  // replaces default content resolution entirely - no per-field emission, only
  // the `data` blob from the query result.
  let fields: Record<string, JssFieldValue> | undefined;
  const componentQueryResult = componentQueryResults?.get(node.uid);
  if (componentQueryResult !== undefined) {
    fields = { data: componentQueryResult as unknown as JssFieldValue };
  } else {
    // Dispatch order:
    //   1. Hand-crafted componentName resolver (e.g. Carousel).
    //   2. RCR-item-driven resolver (Phase D).
    //   3. Default schema-driven field emission.
    const resolver = CONTENTS_RESOLVERS[componentName];
    if (resolver && dsItem) {
      fields = resolver(dsItem, engine, mediaBaseUrl, siteRootPath);
    } else {
      const contextItem = engine.getItemByPath(pageItemPath)?.item;
      const rcrFields = resolveViaRcrItem({
        renderingId: node.renderingId,
        contextItem,
        datasourceItem: dsItem,
        engine,
        mediaBaseUrl,
        siteRootPath,
      });
      if (rcrFields) {
        fields = rcrFields;
      } else if (shouldEmitFields(engine, node.renderingId, dsItem, undefined)) {
        // Port of Sitecore's `GetContextItem` dispatch at
        // `Sitecore.LayoutService.decompiled.cs:4241`:
        //   `UseContextItem ? Context.Item : GetDataSourceItem(rendering)`.
        // When `UseContextItem=true` and the rendering has no datasource,
        // Sitecore's `ProcessItem(Context.Item)` serializes the ROUTE item's
        // typed fields - not `{}`. 0.4.0.14 emitted `{}` here, which under-
        // reported populated fields on Navigation / Breadcrumb / Page Title
        // -style renderings that draw content from the page context rather
        // than a discrete datasource.
        const effectiveItem = dsItem ?? contextItem;
        fields = effectiveItem
          ? formatItemFields(effectiveItem, engine, mediaBaseUrl, siteRootPath, 'en')
          : {};
      }
      // else: fields stays undefined → omitted from emission (P1).
    }
  }

  // Edge convention: rewrite `local:` references to the resolved item's
  // absolute path. GUID and absolute-path references pass through unchanged.
  const dataSourceOut =
    dsItem && node.dataSource.startsWith('local:')
      ? dsItem.path
      : node.dataSource;

  const decodedParams = decodeParams(node.params, engine, mediaBaseUrl, node.renderingId);

  // Build result conditionally so absent `fields` / `placeholders` are
  // omitted from the JSON rather than serialized as undefined (P1, P2).
  const result: ComponentNode = {
    uid: node.uid,
    componentName,
    dataSource: dataSourceOut,
    params: decodedParams,
  };
  if (fields !== undefined) result.fields = fields;

  // P2: merge child placeholders with declared-but-empty slots from the
  // rendering item's Placeholders field.
  //
  // 0.4.0.29: composite-field components (FaqList etc.) skip placeholder
  // resolution entirely - their children are absorbed into a field on this
  // rendering and must not re-emit as separate renderings under it.
  const declaredKeys = getDeclaredPlaceholderKeys(engine, node.renderingId);
  const suppressPlaceholders = COMPOSITE_FIELD_COMPONENTS.has(componentName);
  if (!suppressPlaceholders && (node.placeholders || declaredKeys.length > 0)) {
    const resolvedChildren = node.placeholders
      ? resolveComponents(
          node.placeholders,
          engine,
          mediaBaseUrl,
          pageItemPath,
          siteRootPath,
          componentQueryResults,
        )
      : {};
    for (const key of declaredKeys) {
      if (!(key in resolvedChildren)) resolvedChildren[key] = [];
    }
    if (Object.keys(resolvedChildren).length > 0) {
      result.placeholders = resolvedChildren;
    }
  }

  return result;
}

/**
 * Walk the placeholder tree and resolve rendering GUIDs to component names
 * and datasource references to formatted item fields.
 *
 * `componentQueryResults` - optional map keyed by rendering uid with
 * GraphQL query results, collected and batch-executed by
 * `route-builder.ts` before this function runs. See
 * {@link import('./component-query.js').collectComponentQueryRequests}.
 */
export function resolveComponents(
  tree: Record<string, PlaceholderNode[]>,
  engine: Engine,
  mediaBaseUrl: string,
  pageItemPath: string,
  siteRootPath: string,
  componentQueryResults?: Map<string, unknown>,
): Record<string, ComponentNode[]> {
  const result: Record<string, ComponentNode[]> = {};

  for (const [phKey, nodes] of Object.entries(tree)) {
    const resolved: ComponentNode[] = [];
    for (const node of nodes) {
      const out = resolveNode(node, engine, mediaBaseUrl, pageItemPath, siteRootPath, componentQueryResults);
      if (out) resolved.push(out);
    }
    result[phKey] = resolved;
  }

  return result;
}
