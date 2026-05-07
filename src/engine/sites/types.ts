/**
 * Output shape for `discoverSiteDefinitions`. One entry per Site Grouping
 * item that survives `parseSiteItem`'s validation. Fields mirror Sitecore's
 * `SiteInfoGraphType` scalar set plus `startItem` from the StringDictionary.
 *
 * - `name` - `SiteName` field, trimmed.
 * - `hostname` - `HostName` field with all whitespace stripped (Sitecore's
 *   `Replace(" ", "")`). Pipe-delimited multi-host strings pass through
 *   unchanged.
 * - `language` - `Language` field, raw. Empty string when unset.
 * - `rootPath` - full path of the `_BaseSiteRoot` ancestor located by
 *   walking up from the resolved StartItem. Equivalent to Sitecore's
 *   `siteItem.Paths.FullPath`.
 * - `startItem` - relative path from `rootPath` to the resolved StartItem,
 *   matching Sitecore's `Paths.GetPath(rootPath, "/", ItemPathType.Name)`.
 *   Empty string when the StartItem IS the site root.
 * - `linkable` - mirror of SXA's `sxaLinkable` site property (see
 *   `SxaSiteProvider.cs:301-304` -> `SiteExtensions.IsSxaLinkable`). True when
 *   the Site Grouping item's `SxaLinkable` checkbox field
 *   (`{4EEFF055-EDCD-4387-9E86-C3F40A15DBAC}`) is set. Consumed by the
 *   `query:$linkableHomes` token to filter cross-site link targets per
 *   `CrossSiteLinkingService.GetSites()`.
 */
export interface SiteDefinition {
  name: string;
  hostname: string;
  language: string;
  rootPath: string;
  startItem: string;
  linkable: boolean;
}
