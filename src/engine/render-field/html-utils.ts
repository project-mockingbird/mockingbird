/**
 * Decode the XML entities Sitecore uses inside field values. Parity with
 * what `HtmlAttribute.Value` gets after `HttpUtility.HtmlDecode` in
 * `ImageFieldSerializer.ParseRenderedImage` - entities arrive decoded,
 * so we do the same here before the serializer sees the value.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Escape a value for embedding in an HTML attribute's double-quoted
 * context. Used when the renderer emits `<img src="...">` - the rendered
 * HTML must round-trip cleanly through {@link walkElementAttrs}.
 */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parse every `name="value"` pair out of an element's attribute block,
 * keyed lowercased. Preserves source order via Record insertion (JS
 * preserves insertion order for string keys). Values are
 * {@link decodeEntities}-processed.
 *
 * This is the authored-XML parser - different from
 * {@link walkElementAttrs} only in that it doesn't look for a tag opener;
 * callers hand it the raw XML string. Shared with the per-item walk in
 * `field-json-value.ts`.
 */
export function parseAuthoredAttrs(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attrRe = /\b([a-zA-Z_][\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(xml)) !== null) {
    out[m[1].toLowerCase()] = decodeEntities(m[2]);
  }
  return out;
}

