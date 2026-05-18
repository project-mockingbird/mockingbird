import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import type { ComponentNode } from './types.js';
import { parseGuidList, toCanonicalGuid } from '../guid.js';
import { readSharedField, readSharedFieldByHint } from './item-fields.js';
import {
  PLACEHOLDERS_FIELD_ID,
  PLACEHOLDER_KEY_FIELD_ID,
  RENDERING_CONTENTS_RESOLVER_FIELD_ID,
} from '../constants.js';

/**
 * Per-engine WeakMap cache keyed by renderingId → declared slot keys. Mirrors
 * the caching pattern from `site-collection-templates.ts` (0.4.0.12).
 */
const declaredKeysCache = new WeakMap<Engine, Map<string, readonly string[]>>();

function cacheFor(engine: Engine): Map<string, readonly string[]> {
  let cache = declaredKeysCache.get(engine);
  if (!cache) {
    cache = new Map();
    declaredKeysCache.set(engine, cache);
  }
  return cache;
}

/**
 * Return the list of placeholder slot names this rendering declares, in
 * Placeholders-field declaration order. Empty when the rendering has no
 * Placeholders field, references unresolvable settings, or declares only
 * settings with empty Placeholder Key values.
 *
 * Port of `Sitecore.LayoutService.decompiled.cs:4386-4405` +
 * `Sitecore.LayoutService.decompiled.cs:2531-2538`: multilist reads,
 * referenced items filtered by non-empty key.
 */
export function getDeclaredPlaceholderKeys(
  engine: Engine,
  renderingId: string,
): readonly string[] {
  if (!renderingId) return [];
  const cache = cacheFor(engine);
  const cacheKey = renderingId.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const raw = readSharedField(engine, renderingId, PLACEHOLDERS_FIELD_ID);
  const ids = parseGuidList(raw);
  if (ids.length === 0) {
    cache.set(cacheKey, []);
    return [];
  }

  const keys: string[] = [];
  for (const id of ids) {
    const key = readSharedField(engine, id, PLACEHOLDER_KEY_FIELD_ID);
    if (key) keys.push(key);
  }
  const frozen: readonly string[] = Object.freeze(keys);
  cache.set(cacheKey, frozen);
  return frozen;
}

/**
 * Port of Sitecore's `fields` emission gate - specifically the
 * `Contents != null` check in
 * `PlaceholderTransformer.TransformPlaceholderElement`
 * (`Sitecore.LayoutService.decompiled.cs:2686-2689`) backed by
 * `RenderingContentsResolver.ResolveContents` (`:4200-4229`) +
 * `GetContextItem` (`:4241`):
 *
 *   contextItem = UseContextItem ? Context.Item : GetDataSourceItem(rendering)
 *   if contextItem == null: return null  → fields OMITTED
 *   else:                    return ProcessItem(contextItem) or {items:...}  → fields EMITTED
 *
 * So Mockingbird's gate is: `contextItem != null`. We never see a null
 * context item when `UseContextItem=true` (route item is always present
 * when we're emitting a rendering); we DO see a null context item when
 * `UseContextItem=false` (default) and the rendering has no datasource.
 *
 * `ItemSelectorQuery` is NOT part of the emission gate - Sitecore evaluates
 * it only after `contextItem` is already non-null, so having a query set
 * doesn't rescue a null-context rendering. 0.4.0.14 incorrectly included a
 * query branch here that over-emitted on query-carrying RCRs without
 * UseContextItem and without datasource; 0.4.0.15 drops it.
 *
 * ComponentQuery is a pre-resolver (GraphQLAwareRenderingContentsResolver)
 * that short-circuits the whole pipeline - when it produced a result,
 * Contents is trivially non-null.
 */
export function shouldEmitFields(
  engine: Engine,
  renderingId: string,
  dsItem: ScsItem | undefined,
  componentQueryResult: unknown,
): boolean {
  if (componentQueryResult !== undefined) return true;
  if (dsItem) return true;

  const rcrRaw = readSharedField(engine, renderingId, RENDERING_CONTENTS_RESOLVER_FIELD_ID);
  if (!rcrRaw) return false; // default RCR - UseContextItem=false → contextItem=dsItem=null → Contents=null

  const rcrId = toCanonicalGuid(rcrRaw);
  if (!rcrId) return false;

  const useContext = readSharedFieldByHint(engine, rcrId, 'UseContextItem');
  if (useContext === '1' || (useContext ?? '').toLowerCase() === 'true') return true;

  return false;
}

/**
 * SXA JSS Layout item id (`/sitecore/layout/Layouts/Foundation/JSS Experience
 * Accelerator/Presentation/JSS Layout`). Also defined as `JSS_LAYOUT_ID` in
 * `route-builder.ts` - duplicated here to avoid an import cycle.
 */
const JSS_LAYOUT_ID = '96e5f4ba-a2cf-4a4c-a4e7-64da88226362';

/**
 * The three top-level placeholder keys the JSS Layout item declares:
 * `headless-header`, `headless-main`, `headless-footer`. Hardcoded as a
 * fallback because the current `extract-registry-spe.ps1` Phase 5 only
 * enriches rendering / placeholder-settings / RCR items - layout items
 * under `/sitecore/layout/Layouts` are present in the registry but carry
 * no `Placeholders` multilist field. Without this fallback,
 * `getDeclaredPlaceholderKeys(JSS_LAYOUT_ID)` returns `[]` and the empty-
 * layout route emits `placeholders: {}` instead of prod's
 * `{headless-header: [], headless-main: [], headless-footer: []}`.
 *
 * Once the extract script grows layout-item enrichment (planned for v3.4),
 * the registry-first lookup in {@link getDeclaredPlaceholderKeys} will find
 * the real Placeholders list and this fallback stops firing.
 */
const JSS_LAYOUT_DEFAULT_PLACEHOLDER_KEYS: readonly string[] = Object.freeze([
  'headless-header',
  'headless-main',
  'headless-footer',
]);

/**
 * P3a (0.4.0.14): For a route item that has no own `__Final Renderings`,
 * Sitecore emits a layout with empty placeholders drawn from the layout
 * item's declared slots. `getDeclaredPlaceholderKeys` is reused - the
 * only shape difference is the return type.
 *
 * 0.4.0.18: added the {@link JSS_LAYOUT_DEFAULT_PLACEHOLDER_KEYS} fallback
 * so container-template pages that fall through to `JSS_LAYOUT_ID` still
 * emit the three-key skeleton Sitecore emits, even though v3.3 registry
 * lacks the layout item's `Placeholders` field.
 */
export function emptyPlaceholdersFromLayoutItem(
  engine: Engine,
  layoutItemId: string,
): Record<string, ComponentNode[]> {
  const keys = getDeclaredPlaceholderKeys(engine, layoutItemId);
  const result: Record<string, ComponentNode[]> = {};
  if (keys.length > 0) {
    for (const key of keys) result[key] = [];
    return result;
  }
  if (layoutItemId.toLowerCase() === JSS_LAYOUT_ID) {
    for (const key of JSS_LAYOUT_DEFAULT_PLACEHOLDER_KEYS) result[key] = [];
  }
  return result;
}
