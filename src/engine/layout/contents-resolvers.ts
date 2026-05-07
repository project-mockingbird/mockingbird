import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import type { JssFieldValue } from './types.js';
import { formatItemFields, itemName } from './utils.js';
import { formatReferenceItem } from './field-formatter.js';
import { referenceUrl } from './url-utils.js';
import { formatGuidEdge } from '../guid.js';
import { readSharedFieldOnItem, readFieldWithSvFallback } from './item-fields.js';
import { lookupRcrQuery } from './rcr-queries.js';
import { compareSitecoreSiblings } from './sibling-compare.js';

/**
 * SXA renderings can carry a Rendering Contents Resolver that transforms
 * their datasource into a non-default shape — Edge runs these per-rendering
 * and the result lands in `fields` on the component. This module declares
 * resolvers keyed by componentName, dispatched from `component-resolver.ts`.
 *
 * Each resolver returns the full `fields` map for the component; default
 * schema-driven emission is bypassed when a resolver matches.
 */
export type RenderingContentsResolver = (
  datasource: ScsItem,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
) => Record<string, JssFieldValue>;

/** Sitecore template id for the SXA "Spotlight Link" template. */
const SPOTLIGHT_LINK_TEMPLATE_ID = '11cdaadf-1248-4b6e-ba3a-d96e802fb489';

/** SXA Carousel slide stores its order in this field. */
const CAROUSEL_SLIDE_INDEX_FIELD_NAME = 'CarouselSlideIndex';

/** Sitecore standard `__Sortorder` shared field id. */
const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

/** Shared field id for "Rendering Contents Resolver" on rendering items. */
export const RCR_FIELD_ID = 'b0b15510-b138-470e-8f33-8da2e228aafe';

/** Shared field ids on RCR items themselves. */
export const RCR_TYPE_FIELD_ID = 'de218ede-a9ad-4b04-86c5-9ff593ccf39d';
export const RCR_QUERY_FIELD_ID = '23b859e1-34f9-4711-a46a-dc0d616584ce';
export const RCR_USE_CONTEXT_FIELD_ID = '52b17c6d-d151-46c5-a986-b88050073ef0';

/** Fully-qualified .NET type string of the default Sitecore RCR class. */
export const DEFAULT_RCR_TYPE = 'Sitecore.LayoutService.ItemRendering.ContentsResolvers.RenderingContentsResolver, Sitecore.LayoutService';

/**
 * OOTB Sitecore class-based RCR: "Datasource Item Children Resolver".
 * Registry-only item at `/sitecore/system/Modules/Layout Service/
 * Rendering Contents Resolvers/Datasource Item Children Resolver`.
 * Returns `datasource.Children` directly — no `ItemSelectorQuery`.
 * Registered by id because the registry extraction doesn't carry the
 * item's `Type` field (0.4.0.11).
 */
const DATASOURCE_ITEM_CHILDREN_RCR_ID = '2f5c334e-5615-423c-8281-9fc180191302';

/**
 * Read an item's effective `__Sortorder` using Sitecore's field cascade:
 * item's own value first, then template SV + base-template SV chain. Falls
 * back to 100 (Sitecore's hardcoded default for `ChildListOptions` when the
 * field is wholly unset) when no cascade step carries a value.
 *
 * 0.4.0.28: cascade added - pre-0.4.0.28 reads were item-only, which misread
 * SCS-stripped shared fields (SCS skips serializing values equal to SV, so a
 * template whose SV defines `__Sortorder=400` serializes items without the
 * field on disk even though CM shows 400). This produced sibling-sort misorder
 * (e.g. 100 < 300 < 500 < 700 vs. Sitecore's 300 < 400 < 500 < 700) on items
 * whose template-SV value should have applied.
 */
export function readSortOrder(engine: Engine, item: ScsItem): number {
  const raw = readFieldWithSvFallback(engine, item, SORTORDER_FIELD_ID, 'en');
  if (raw === undefined || raw === '') return 100;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 100 : n;
}

/**
 * Carousel: emit each child of the datasource as a JssReferenceItem-shaped
 * entry under `items`, exposing only the slide's `CarouselSlideIndex` field.
 * Edge uses this list to know slide order and identity; the actual slide
 * content is rendered by separate Spotlight components in `carousel-slide-N`
 * placeholders.
 */
function resolveCarousel(
  datasource: ScsItem,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
): Record<string, JssFieldValue> {
  const dsNode = engine.getItemById(datasource.id);
  if (!dsNode) return { items: [] as unknown as JssFieldValue };

  const children = Array.from(dsNode.children.values()).map(child => {
    const childFields = formatItemFields(child.item, engine, mediaBaseUrl, siteRootPath, 'en');
    const slideIndex = (childFields[CAROUSEL_SLIDE_INDEX_FIELD_NAME] as { value: number } | undefined)?.value ?? 0;
    return { child, slideIndex, sortOrder: readSortOrder(engine, child.item) };
  });
  // Edge emits carousel items in Sitecore's natural child order — sorted by
  // the standard `__Sortorder` field. Slot indices (`CarouselSlideIndex`) are
  // stored on each slide independently and stay attached to their slide,
  // they do NOT drive the array order.
  children.sort((a, b) => a.sortOrder - b.sortOrder);

  const items = children.map(({ child, slideIndex }) => ({
    id: child.item.id,
    url: referenceUrl(child.item.path, siteRootPath),
    name: itemName(child.item.path),
    displayName: itemName(child.item.path),
    fields: { [CAROUSEL_SLIDE_INDEX_FIELD_NAME]: { value: slideIndex } },
  }));

  return { items: items as unknown as JssFieldValue };
}

/**
 * Spotlight: wrap the datasource fields in Edge's GraphQL-style `data`
 * envelope. SpotlightContent and SpotlightImage become `jsonValue`-wrapped
 * entries on `data.datasource`; child items whose template is "Spotlight
 * Link" become a list under `data.datasource.links.results`, each wrapping
 * its own Link field.
 */
function resolveSpotlight(
  datasource: ScsItem,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
): Record<string, JssFieldValue> {
  const dsFields = formatItemFields(datasource, engine, mediaBaseUrl, siteRootPath, 'en');
  const spotlightContent = dsFields.SpotlightContent ?? { value: '' };
  const spotlightImage = dsFields.SpotlightImage ?? ({ value: {} } as unknown as JssFieldValue);

  const dsNode = engine.getItemById(datasource.id);
  // Spotlight link children come out of the tree's Map in insertion (file-
  // system scan) order; prod Edge sorts by Sitecore's natural `__Sortorder`.
  // Apply the same sort Carousel uses — stable, ascending, zero default for
  // missing values — so link identity order matches prod byte-for-byte.
  const linkChildren = dsNode
    ? Array.from(dsNode.children.values())
        .filter(c => c.item.template.toLowerCase() === SPOTLIGHT_LINK_TEMPLATE_ID)
        .map(c => ({ child: c, sortOrder: readSortOrder(engine, c.item) }))
    : [];
  linkChildren.sort((a, b) => a.sortOrder - b.sortOrder);
  const linkResults = linkChildren.map(({ child: c }) => {
    const cf = formatItemFields(c.item, engine, mediaBaseUrl, siteRootPath, 'en');
    const link = cf.Link ?? ({ value: {} } as unknown as JssFieldValue);
    return {
      id: formatGuidEdge(c.item.id),
      link: { jsonValue: link },
      template: { name: 'Spotlight Link' },
    };
  });

  // The whole `data` blob is one logical field value. JSS field shapes don't
  // model arbitrary nested objects, so we cast through unknown.
  const data = {
    datasource: {
      spotlightContent: { jsonValue: spotlightContent },
      spotlightImage: { jsonValue: spotlightImage },
      links: { results: linkResults },
    },
  } as unknown as JssFieldValue;

  return { data };
}

/**
 * Datasource Item Children Resolver: emit each direct child of the
 * datasource as a JssReferenceItem, sorted by Sitecore's native sibling
 * ordering (via `compareSitecoreSiblings`).
 *
 * Implements the OOTB Sitecore class
 * `Sitecore.LayoutService.ItemRendering.ContentsResolvers.DatasourceItemChildrenRenderingContentsResolver`
 * without requiring an `ItemSelectorQuery`. Used by the `ContentTokenList`
 * rendering (and any other rendering configured with this RCR id).
 */
function resolveDatasourceChildren(
  datasource: ScsItem,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
): Record<string, JssFieldValue> {
  const dsNode = engine.getItemById(datasource.id);
  if (!dsNode) return { items: [] as unknown as JssFieldValue };
  const children = Array.from(dsNode.children.values())
    .map(n => n.item)
    .sort((a, b) => compareSitecoreSiblings(engine, a, b));
  const items = children.map(child =>
    formatReferenceItem(child, engine, mediaBaseUrl, siteRootPath),
  );
  return { items: items as unknown as JssFieldValue };
}

export const CONTENTS_RESOLVERS: Record<string, RenderingContentsResolver> = {
  Carousel: resolveCarousel,
  Spotlight: resolveSpotlight,
};

/**
 * Look up a rendering's configured Rendering Contents Resolver item and run
 * it against the appropriate base item. Returns the resolved `fields` object
 * on success, or `null` when the rendering has no usable RCR configuration —
 * callers treat `null` as "fall through to default emission."
 *
 * Supported RCR type: `Sitecore.LayoutService.ItemRendering.ContentsResolvers.
 * RenderingContentsResolver` (the default class). Query dispatch is
 * string-pattern keyed — see `rcr-queries.ts` for registered entries.
 */
export function resolveViaRcrItem(args: {
  renderingId: string;
  contextItem: ScsItem | undefined;
  datasourceItem: ScsItem | undefined;
  engine: Engine;
  mediaBaseUrl: string;
  siteRootPath: string;
}): Record<string, JssFieldValue> | null {
  const { renderingId, contextItem, datasourceItem, engine, mediaBaseUrl, siteRootPath } = args;

  const renderingNode = engine.getItemById(renderingId);
  if (!renderingNode) return null;

  const rcrFieldValue = readSharedFieldOnItem(renderingNode.item, RCR_FIELD_ID);
  if (!rcrFieldValue) return null;

  // Field value is stored as braced uppercase GUID like "{7E5919E7-...}" —
  // strip braces and lowercase for engine lookup.
  const rcrId = rcrFieldValue.replace(/[{}]/g, '').toLowerCase();

  // 0.4.0.11 item 2: short-circuit for the OOTB Datasource Item Children
  // Resolver. Its RCR item is registry-only with no Type field in the
  // registry, so the tree lookup + Type-check path below can't dispatch it.
  // Handle by id instead — the class-based resolver just returns
  // datasource.Children in Sitecore's native sibling order.
  if (rcrId === DATASOURCE_ITEM_CHILDREN_RCR_ID) {
    if (!datasourceItem) return null;
    return resolveDatasourceChildren(datasourceItem, engine, mediaBaseUrl, siteRootPath);
  }

  const rcrNode = engine.getItemById(rcrId);
  if (!rcrNode) return null;

  const rcrType = readSharedFieldOnItem(rcrNode.item, RCR_TYPE_FIELD_ID);
  if (rcrType !== DEFAULT_RCR_TYPE) return null;

  const rawQuery = readSharedFieldOnItem(rcrNode.item, RCR_QUERY_FIELD_ID);
  if (!rawQuery) return null;

  const query = lookupRcrQuery(rawQuery);
  if (!query) return null;

  const useContextRaw = readSharedFieldOnItem(rcrNode.item, RCR_USE_CONTEXT_FIELD_ID);
  const useContextItem = useContextRaw === '1';

  const base = useContextItem ? contextItem : datasourceItem;
  if (!base) return null;

  const results = query(base, engine);

  const items = results.map(item => ({
    id: item.id,
    url: referenceUrl(item.path, siteRootPath),
    name: itemName(item.path),
    displayName: itemName(item.path),
    fields: formatItemFields(item, engine, mediaBaseUrl, siteRootPath, 'en', {
      skipStandardSections: true,
      skipUnknownFields: true,
    }),
  }));

  return { items: items as unknown as JssFieldValue };
}
