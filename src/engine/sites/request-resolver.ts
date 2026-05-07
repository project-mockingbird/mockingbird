import type { Engine } from '../index.js';
import { discoverSiteDefinitions } from './discovery.js';
import type { SiteDefinition } from './types.js';

/**
 * Mirrors Sitecore's `SiteContext.HostNameMatches` (in
 * `Sitecore.Sites.SiteCollection.GetByHostName`). Pipe-splits the configured
 * hostname field, trims whitespace, treats `*` as the catch-all, treats `*`
 * inside an entry as a glob wildcard, and compares case-insensitively. First
 * pipe-entry match wins.
 *
 * The caller is responsible for stripping the port from `host` (e.g. converting
 * `site-a.test:3000` to `site-a.test`); see `lookupSiteByHost`. Case is
 * normalized internally - both `host` and the configured field are lowercased
 * before comparison.
 */
export function matchesHostname(host: string, siteHostnameField: string): boolean {
  if (!siteHostnameField) return false;
  const entries = siteHostnameField
    .split('|')
    .map(e => e.trim())
    .filter(e => e.length > 0);

  for (const entry of entries) {
    if (entry === '*') return true;
    if (!entry.includes('*')) {
      if (entry.toLowerCase() === host.toLowerCase()) return true;
      continue;
    }
    if (wildcardToRegex(entry).test(host.toLowerCase())) return true;
  }
  return false;
}

function wildcardToRegex(pattern: string): RegExp {
  // Escape regex specials except '*'; replace '*' with '.*'; anchor.
  const escaped = pattern.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const withGlob = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${withGlob}$`);
}

/**
 * Find a SiteDefinition by name, case-insensitive. Mirrors Sitecore's
 * `SiteCollection.GetByName` lookup. Returns null when the name is empty
 * or no Site Grouping in the content tree has a matching SiteName.
 */
export function lookupSiteByName(engine: Engine, name: string): SiteDefinition | null {
  if (!name) return null;
  const target = name.toLowerCase();
  for (const site of discoverSiteDefinitions(engine)) {
    if (site.name.toLowerCase() === target) return site;
  }
  return null;
}

/**
 * Find a SiteDefinition whose `HostName` field matches `host` per
 * `matchesHostname` semantics. First-match-wins in iteration order. Strips
 * port and lowercases the host before comparison. Mirrors Sitecore's
 * `SiteCollection.GetByHostName(uri.Host)`.
 */
export function lookupSiteByHost(engine: Engine, host: string): SiteDefinition | null {
  if (!host) return null;
  const stripped = host.split(':')[0].toLowerCase();
  for (const site of discoverSiteDefinitions(engine)) {
    if (matchesHostname(stripped, site.hostname)) return site;
  }
  return null;
}

/**
 * Build a synthetic SiteDefinition from a path-only env var. Mirrors the
 * role of Sitecore's `<site name="website" hostName="*"/>` catch-all default
 * - "the site that matches any unmatched host." Preserves today's single-site
 * behavior: rootPath verbatim from the env var, name derived from the
 * penultimate segment (matches the existing `resolveSiteName` rule), hostname
 * = "*" so this fallback wins when nothing else matches.
 */
export function synthesizeFromEnv(envPath: string): SiteDefinition {
  const segments = envPath.split('/').filter(s => s.length > 0);
  const derivedName = segments.length >= 2 ? segments[segments.length - 2] : '';
  return {
    name: derivedName,
    hostname: '*',
    language: '',
    rootPath: envPath,
    startItem: '',
    // Synthetic env-fallback sites are single-site dev convenience; treat
    // them as not linkable so they don't accidentally surface in
    // `query:$linkableHomes` results.
    linkable: false,
  };
}

export interface ResolveSiteOptions {
  engine: Engine;
  siteArg?: string;
  host?: string;
  envFallback: string;
}

/**
 * The SiteContextResolver port. Layered precedence:
 *   1. siteArg (if provided AND matches a Site Grouping by name)
 *   2. host (Host header, matched against Site Grouping HostName fields)
 *   3. envFallback (synthetic SiteDefinition for single-site dev)
 *   4. null (no resolution possible)
 *
 * Mirrors Sitecore's `SiteContextResolver.ResolveSiteContext()` precedence
 * (Sitecore.Kernel.decompiled.cs:44806-44832): unknown sc_site falls through
 * rather than erroring. The env-var rung is mockingbird-specific and replaces
 * Sitecore's `<site name="website">` default-config rung.
 */
export function resolveSiteForRequest(opts: ResolveSiteOptions): SiteDefinition | null {
  const { engine, siteArg, host, envFallback } = opts;

  if (siteArg) {
    const byName = lookupSiteByName(engine, siteArg);
    if (byName) return byName;
  }

  if (host) {
    const byHost = lookupSiteByHost(engine, host);
    if (byHost) return byHost;
  }

  if (envFallback) return synthesizeFromEnv(envFallback);

  return null;
}
