import type { Engine } from '../index.js';
import { BASE_SITE_DEFINITION_TEMPLATE_ID } from '../constants.js';
import { templateDescendsFromOrEquals } from '../layout/template-walk.js';
import { parseSiteItem, environmentMatches } from './resolver.js';
import type { SiteDefinition } from './types.js';

/**
 * Memoization keyed by the Engine instance. Cache value pairs a `key` derived
 * from the tree generation and the active `MOCKINGBIRD_ENVIRONMENT` env var
 * with the computed site list. A repeat call with both unchanged returns the
 * cached array verbatim; any mutation (addItem / removeItem / relinkItem
 * bumps `tree.generation`) or env change produces a different key and forces
 * a rebuild.
 *
 * WeakMap means the cache entry is GC'd with the Engine, so repeated test
 * runs that build fresh engines do not accumulate state.
 */
const cache = new WeakMap<Engine, { key: string; sites: SiteDefinition[] }>();

/**
 * Top-level entry point for the GraphQL `site.siteInfoCollection` resolver.
 *
 * Walks every serialized item, filters to those whose template chain
 * descends from `_BaseSiteDefinition`, applies the Environment filter, and
 * shapes survivors via `parseSiteItem`. Mirrors SXA's `SxaSiteProvider`
 * top-level flow: `EnvironmentSitesResolver.ResolveAllSites(database)` ->
 * `ParseSiteItem` per result.
 *
 * The result is memoized per (engine, treeGeneration, MOCKINGBIRD_ENVIRONMENT)
 * tuple. Tree mutations bump `engine.treeGeneration` automatically; env-var
 * flips are detected by including the env value in the cache key.
 *
 * Returns `[]` on any unexpected exception (corrupt template chain etc.) so
 * one broken Site Grouping item cannot poison the entire list - matches the
 * project's "skip + log" posture across the engine. The cache is not poisoned
 * with `[]` on error: failures bypass the `cache.set` call.
 *
 * `MOCKINGBIRD_ENVIRONMENT` env var (default empty) gates the environment
 * filter. Empty default + Sitecore's `Environment=""/  "*"`-passes rule means
 * no env-var configuration is needed for the typical SXA content tree.
 */
export function discoverSiteDefinitions(engine: Engine): SiteDefinition[] {
  try {
    const activeEnv = process.env.MOCKINGBIRD_ENVIRONMENT ?? '';
    const key = `${engine.treeGeneration}|${activeEnv}`;
    const cached = cache.get(engine);
    if (cached && cached.key === key) return cached.sites;

    const results: SiteDefinition[] = [];
    for (const node of engine.getAllItems()) {
      if (!templateDescendsFromOrEquals(engine, node.item.template, BASE_SITE_DEFINITION_TEMPLATE_ID)) continue;
      if (!environmentMatches(engine, node.item, activeEnv)) continue;
      const parsed = parseSiteItem(engine, node);
      if (parsed) results.push(parsed);
    }

    cache.set(engine, { key, sites: results });
    return results;
  } catch (err) {
    console.error('[sites] discoverSiteDefinitions failed', err);
    return [];
  }
}
