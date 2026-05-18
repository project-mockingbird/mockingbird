import { decodeEntities } from './html-utils.js';

/**
 * Walk the attributes off the first matching element in a rendered HTML
 * fragment. Source-ordered, lowercased keys, HTML-entity-decoded values -
 * equivalent to `HtmlAgilityPack.HtmlAttributeCollection` iteration in
 * Sitecore's `ImageFieldSerializer.ParseRenderedImage` /
 * `GeneralLinkFieldSerializer.GetLinkProperties`.
 *
 * Scope: subset of HTML that `FieldRenderer.RenderField` actually emits -
 * a single root element with double-quoted attribute values. Complex
 * RichText bodies go through a different path (Rich Text serializer
 * passes the full HTML string, doesn't walk attrs). If future SXA
 * processors produce richer structures, swap in `node-html-parser` at
 * this seam without touching call sites.
 *
 * Returns `{}` for an empty or tag-less fragment - matches prod's
 * "wrapper present, no inner keys" contract for unresolvable fields.
 */
export function walkElementAttrs(html: string, tagName: string): Record<string, string> {
  if (!html) return {};
  const openRe = new RegExp(`<${tagName}\\b([^>]*?)/?>`, 'i');
  const m = html.match(openRe);
  if (!m) return {};
  const attrBlock = m[1];
  const out: Record<string, string> = {};
  const attrRe = /\b([a-zA-Z_][\w-]*)="([^"]*)"/g;
  let am: RegExpExecArray | null;
  while ((am = attrRe.exec(attrBlock)) !== null) {
    out[am[1].toLowerCase()] = decodeEntities(am[2]);
  }
  return out;
}
