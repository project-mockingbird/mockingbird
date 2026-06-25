/**
 * getComposedLayout - the page-design-aware layout source for the editor.
 *
 * Reuses the SAME composition that drives Edge resolution
 * (`getCombinedRenderingEntries`) so the editor sees exactly what renders:
 * partial-design renderings first, then the page's own. Each entry is tagged
 * `owner: 'page' | 'partial'` so the UI can keep partial renderings read-only
 * and edit/persist only the page's own entries.
 *
 * Placeholders combine `discoverPlaceholderPaths` over the composed entries
 * with the layout item's declared root slots, so a page with empty own
 * renderings still surfaces its root placeholders as add targets.
 */

import type { Engine } from '../index.js';
import type { ComposedLayout, ComposedEntry, PlaceholderPath } from './types.js';
import { getCombinedRenderingEntries } from '../layout/page-design.js';
import { getLayoutRootPlaceholderKeys } from '../layout/route-builder.js';
import { discoverPlaceholderPaths } from './placeholder-paths.js';

/**
 * Build the composed layout for a page item.
 *
 * @param engine       - the engine with the loaded item tree
 * @param itemId       - the page item id
 * @param siteRootPath - the site root (drives Page Design resolution)
 * @param language     - language version to read (default 'en')
 * @returns owner-tagged entries + placeholder paths (incl. empty root slots).
 *   Returns an empty layout when the item is unknown.
 */
export function getComposedLayout(
  engine: Engine,
  itemId: string,
  siteRootPath: string,
  language: string = 'en',
): ComposedLayout {
  const node = engine.getItemById(itemId);
  if (!node) return { entries: [], placeholders: [] };

  // Same composition Edge resolution uses: partials first, then page own.
  const raw = getCombinedRenderingEntries(node.item, engine, siteRootPath, language);

  const entries: ComposedEntry[] = raw.map((e) => {
    const ownerItemPath = e.ownerItemPath ?? node.item.path;
    const owner: 'page' | 'partial' = ownerItemPath === node.item.path ? 'page' : 'partial';
    return {
      ...e,
      owner,
      ownerItemPath,
      // The badge wants the partial design item's name = its last path segment.
      ownerDisplayName: owner === 'partial' ? (ownerItemPath.split('/').pop() ?? undefined) : undefined,
    };
  });

  const discovered = discoverPlaceholderPaths(engine, raw);

  // Surface empty root slots the layout declares but no entry occupies. The
  // declared keys are bare (e.g. `headless-main`); a discovered path may carry
  // either the bare or the leading-slash form, so check both before adding.
  const have = new Set(discovered.map((p) => p.value));
  const rootPaths: PlaceholderPath[] = getLayoutRootPlaceholderKeys(node.item, engine)
    .filter((r) => !have.has(r) && !have.has('/' + r))
    .map((r) => ({ value: r, source: 'discovered' as const }));

  return { entries, placeholders: [...rootPaths, ...discovered] };
}
