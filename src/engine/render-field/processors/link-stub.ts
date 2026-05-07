import type { FieldRenderArgs } from '../types.js';
import { normalizeGuid } from '../../guid.js';
import { buildMediaUrlPath, isMediaItem } from '../media.js';
import { parseAuthoredAttrs, escapeAttr } from '../html-utils.js';

/**
 * Strip the site-root prefix from an absolute item path so authored
 * internal links emit `/about` instead of the full
 * `/sitecore/content/<site>/Home/about`.
 */
function siteRelativePath(itemPath: string, siteRootPath: string): string {
  if (!siteRootPath) return itemPath;
  const lowerItem = itemPath.toLowerCase();
  const lowerRoot = siteRootPath.toLowerCase();
  if (lowerItem === lowerRoot) return '/';
  if (lowerItem.startsWith(lowerRoot + '/')) {
    return itemPath.slice(siteRootPath.length);
  }
  return itemPath;
}

/**
 * Phase A stub for the SXA `LinkRendererFieldProcessor`. Emits an `<a>`
 * element whose attributes match what Sitecore's
 * `GeneralLinkFieldSerializer.GetLinkProperties` would produce: every
 * authored `<link>` attribute in source order, plus a computed `href`
 * derived from `linktype` + the appropriate resolver (internal id →
 * site path, external → url verbatim, media → CDN path, etc.).
 *
 * Note that Sitecore's actual Link path doesn't route through
 * `FieldRenderer.RenderField` to produce an `<a>` — the serializer
 * walks `field.Xml.DocumentElement.Attributes` directly and computes
 * href via `LinkManager`. Mockingbird routes through the pipeline anyway
 * so Phase B/C can swap in a faithful SXA processor without touching the
 * call sites. The synthetic `<a>` round-trips through
 * {@link import('../html-walker.js').walkElementAttrs} back to the same
 * attr set 0.3.7 emitted.
 *
 * Returns `""` when the authored XML carries no attributes — the caller
 * maps that to `{value:{href:''}}`.
 */
export function renderLinkStub(args: FieldRenderArgs): string {
  const authored = parseAuthoredAttrs(args.value);
  if (Object.keys(authored).length === 0) return '';

  const linktype = (authored.linktype ?? '').toLowerCase();
  const idAttr = authored.id ?? '';
  const urlAttr = authored.url ?? '';
  const anchor = authored.anchor ?? '';

  let href = '';
  if (linktype === 'internal') {
    const normal = normalizeGuid(idAttr);
    const node = normal ? args.engine.getItemById(normal) : undefined;
    if (node) {
      // Sitecore dispatches internal links pointing at media items through
      // `MediaManager.GetMediaUrl` regardless of the authored `linktype`
      // attribute — see 0.4.0.8 spec.
      href = isMediaItem(node.item)
        ? buildMediaUrlPath(node.item)
        : siteRelativePath(node.item.path, args.siteRootPath);
    } else {
      href = '#';
    }
  } else if (linktype === 'external') {
    href = urlAttr;
  } else if (linktype === 'media') {
    const normal = normalizeGuid(idAttr);
    const node = normal ? args.engine.getItemById(normal) : undefined;
    href = node ? buildMediaUrlPath(node.item) : '#';
  } else if (linktype === 'anchor') {
    href = anchor ? `#${anchor}` : '';
  } else if (linktype === 'mailto') {
    href = urlAttr ? `mailto:${urlAttr}` : '';
  } else {
    href = urlAttr;
  }

  const parts: string[] = [];
  for (const [k, v] of Object.entries(authored)) {
    parts.push(`${k}="${escapeAttr(v)}"`);
  }
  if (href) parts.push(`href="${escapeAttr(href)}"`);
  return `<a ${parts.join(' ')} />`;
}
