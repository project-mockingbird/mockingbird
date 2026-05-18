/**
 * JSS-style URL for a referenced item. Strips the site parent (so items that
 * are siblings of the site root - e.g. `<site>/Data/Tags/...` - become
 * `/Data/Tags/...`), then strips a leading `/<siteRootName>` if present, then
 * replaces spaces in segments with hyphens. Returns `/` for the site root
 * itself.
 *
 * Hoisted out of `field-formatter.ts` to break the module-load cycle between
 * that file and `render-field/rich-text.ts`: `rich-text` now imports from
 * here, and `field-formatter` re-imports from here rather than hosting the
 * function itself.
 */
export function referenceUrl(itemPath: string, siteRootPath: string): string {
  if (!siteRootPath) return itemPath.replace(/ /g, '-');

  const lastSlash = siteRootPath.lastIndexOf('/');
  const siteParent = lastSlash > 0 ? siteRootPath.slice(0, lastSlash) : '';
  const siteRootName = siteRootPath.slice(lastSlash + 1);

  let relative = itemPath;
  if (siteParent && relative.toLowerCase().startsWith(siteParent.toLowerCase())) {
    relative = relative.slice(siteParent.length);
  }
  // Strip leading /<siteRootName> so that items inside the site root are
  // addressed as if Home were the URL base.
  const leadingRoot = `/${siteRootName}`;
  if (relative.toLowerCase() === leadingRoot.toLowerCase()) {
    return '/';
  }
  if (relative.toLowerCase().startsWith(leadingRoot.toLowerCase() + '/')) {
    relative = relative.slice(leadingRoot.length);
  }

  return relative.replace(/ /g, '-') || '/';
}
