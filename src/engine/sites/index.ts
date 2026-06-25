export type { SiteDefinition } from './types.js';
export { discoverSiteDefinitions } from './discovery.js';
export {
  parseSiteItem,
  walkToSiteRoot,
  environmentMatches,
  routeBaseForSite,
  sxaSiteRootForSite,
  SITE_GROUPING_READ_LANGUAGE,
} from './resolver.js';
export {
  matchesHostname,
  lookupSiteByName,
  lookupSiteByHost,
  resolveSiteForRequest,
  synthesizeFromEnv,
  type ResolveSiteOptions,
} from './request-resolver.js';
