/**
 * Derives the SXA tenant/site/common roots from the configured siteRootPath
 * (env SITE_ROOT_PATH). SXA convention: items live under
 * `/sitecore/content/<tenant>/<site>` and shared items under
 * `/sitecore/content/<tenant>/common`.
 *
 * Mirrors the parent-walk in `src/engine/redirects/index.ts` (which uses the
 * same convention to find the redirects container).
 */
export interface SxaContext {
  /** The configured site root, normalized (no trailing slash). */
  siteRootPath: string;
  /** Parent of siteRootPath. Tenant container. */
  tenantRootPath: string;
  /** `<tenantRootPath>/common`. Shared style/grid items live here. */
  commonRootPath: string;
}

export function resolveSxaContext(siteRootPath: string): SxaContext | null {
  if (!siteRootPath) return null;
  const normalized = siteRootPath.replace(/\/+$/, '');
  if (!normalized) return null;
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return null;
  const tenantRootPath = normalized.slice(0, lastSlash);
  return {
    siteRootPath: normalized,
    tenantRootPath,
    commonRootPath: `${tenantRootPath}/common`,
  };
}
