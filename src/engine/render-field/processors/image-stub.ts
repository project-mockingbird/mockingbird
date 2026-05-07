import type { FieldRenderArgs } from '../types.js';
import { normalizeGuid } from '../../guid.js';
import {
  buildMediaSrc,
  readMediaAlt,
} from '../media.js';
import { parseAuthoredAttrs, escapeAttr } from '../html-utils.js';

/**
 * Port of SXA's `ImageRendererFieldProcessor` — produces the rendered
 * `<img>` element that `ImageFieldSerializer.ParseRenderedImage` walks.
 *
 * Algorithm:
 *   1. Parse authored `<image ... />` attrs (source order).
 *   2. Resolve `mediaid` → media item. Unresolvable → empty render.
 *   3. Emit every authored attr (minus `mediaid`, which is consumed to
 *      compute `src` and never appears on the rendered `<img>`).
 *   4. Project `src` from the resolved media path — always present.
 *   5. Project `alt`/`width`/`height` from the media item when NOT
 *      authored on the source XML. Authored values win; `""` is still a
 *      valid authored override for `alt`. Per-attr rules:
 *        - `alt`: falls back to the media item's `Alt` field (or `""`)
 *          when not authored — always present on the rendered `<img>`.
 *        - `width` / `height`: optional. Emitted only when authored as
 *          non-empty OR when the media item carries a non-empty value
 *          for the corresponding field. When both sources are empty,
 *          the attr is omitted entirely — matches prod Edge's "omit
 *          empty dim attrs" rule (see `formatImage`,
 *          field-formatter.ts:392-393).
 */
export function renderImageStub(args: FieldRenderArgs): string {
  const authored = parseAuthoredAttrs(args.value);
  const mediaidRaw = authored.mediaid;
  if (!mediaidRaw) return '';
  const mediaId = normalizeGuid(mediaidRaw);
  const node = args.engine.getItemById(mediaId);
  if (!node) return '';
  const media = node.item;

  const { src, width, height } = buildMediaSrc(
    media,
    '',  // render-field pipeline doesn't prefix CDN host; matches layout-path formatImage when mediaBaseUrl is unset
    authored.width ?? '',
    authored.height ?? '',
  );

  const parts: string[] = [];
  for (const [k, v] of Object.entries(authored)) {
    if (k === 'mediaid') continue;
    // width/height: authored empty string is dropped from the attr list here.
    // Projection (below) only fills from media when the key was absent entirely —
    // an authored "" suppresses the attr even though buildMediaSrc may still
    // bake the media dimension into the src query.
    if ((k === 'width' || k === 'height') && v === '') continue;
    parts.push(`${k}="${escapeAttr(v)}"`);
  }

  parts.push(`src="${escapeAttr(src)}"`);
  if (!('alt' in authored)) parts.push(`alt="${escapeAttr(readMediaAlt(media))}"`);
  if (!('width' in authored) && width) parts.push(`width="${escapeAttr(width)}"`);
  if (!('height' in authored) && height) parts.push(`height="${escapeAttr(height)}"`);

  return `<img ${parts.join(' ')} />`;
}
