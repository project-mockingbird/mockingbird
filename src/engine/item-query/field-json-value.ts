import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import { getTemplateSchema } from '../template-schema.js';
import { renderField } from '../render-field/pipeline.js';
import { walkElementAttrs } from '../render-field/html-walker.js';
import { rewriteRichText } from '../render-field/rich-text.js';

/** Sitecore field type names (lowercased) that emit the image jsonValue shape. */
const IMAGE_FIELD_TYPES = new Set(['image', 'thumbnail']);

/** Sitecore field type names (lowercased) that emit the general-link jsonValue shape. */
const LINK_FIELD_TYPES = new Set(['general link', 'general link with search']);

/** Sitecore field type names (lowercased) that run the RichText body rewriter. */
const RICHTEXT_FIELD_TYPES = new Set(['rich text']);

/**
 * Read the Sitecore field type for `hint` on an item's template, walking
 * the full template schema (which flattens base-template fields). Returns
 * the lowercased type, or `''` when the field is not declared on the
 * template — callers treat `''` as "no type info available".
 */
export function lookupFieldType(
  item: ScsItem,
  hint: string,
  engine: Engine,
): string {
  if (!hint || !item.template) return '';
  let schema;
  try {
    schema = getTemplateSchema(item.template, engine);
  } catch {
    return '';
  }
  const target = hint.toLowerCase();
  for (const section of schema.sections) {
    for (const f of section.fields) {
      if (f.name && f.name.toLowerCase() === target) {
        return (f.type ?? '').toLowerCase();
      }
    }
  }
  return '';
}

/**
 * Empty image jsonValue — prod emits `{value: {}}` when the image field
 * is unauthored or the mediaid does not resolve. The wrapper is always
 * present; the inner object carries no keys.
 */
function emptyImageJsonValue(): unknown {
  return { value: {} };
}

/**
 * Empty link jsonValue — prod emits `{value: {href: ""}}` when the link
 * field is unauthored or produces no rendered output. The `href` key is
 * always present on links even when empty — matches the layout-side
 * `formatLink` contract and `MultiListFieldSerializer` behavior.
 */
function emptyLinkJsonValue(): unknown {
  return { value: { href: '' } };
}

/**
 * Produce the parsed Experience-Edge-shape `jsonValue` for a stored
 * Sitecore field string. Image and General Link fields route through the
 * `render-field` pipeline (port of `Sitecore.Pipelines.RenderField.
 * RenderFieldPipeline`) — the pipeline's processors return rendered HTML,
 * and {@link walkElementAttrs} extracts attrs off the rendered element
 * exactly like `ImageFieldSerializer.ParseRenderedImage` does with
 * HtmlAgilityPack. Other field types return `{ value: raw }` or `null`
 * for unset — consuming apps don't query `jsonValue` on text/integer/date
 * fields but mercurius may still resolve the inner scalar, so the shape
 * stays stable.
 */
export function buildJsonValue(
  raw: string | null | undefined,
  engine: Engine,
  siteRootPath: string,
  fieldType?: string,
): unknown {
  const trimmed = (raw ?? '').trim();
  const type = (fieldType ?? '').toLowerCase();

  if (!trimmed) {
    if (IMAGE_FIELD_TYPES.has(type)) return emptyImageJsonValue();
    if (LINK_FIELD_TYPES.has(type)) return emptyLinkJsonValue();
    return null;
  }

  if (/^<image\b/i.test(trimmed)) {
    const html = renderField({
      fieldType: 'image',
      value: trimmed,
      engine,
      siteRootPath,
      mediaBaseUrl: '',
    });
    if (!html) return emptyImageJsonValue();
    return { value: walkElementAttrs(html, 'img') };
  }
  if (/^<link\b/i.test(trimmed)) {
    const html = renderField({
      fieldType: 'general-link',
      value: trimmed,
      engine,
      siteRootPath,
      mediaBaseUrl: '',
    });
    if (!html) return emptyLinkJsonValue();
    return { value: walkElementAttrs(html, 'a') };
  }
  if (RICHTEXT_FIELD_TYPES.has(type)) {
    // RichText bodies carry `~/link.aspx` and `-/media/<id>.ashx` tokens
    // that FieldRenderer.RenderField resolves via DynamicLinkDatabaseSwitcher.
    // Rewrite those here so ComponentQuery `spotlightContent.jsonValue`
    // emissions match prod byte-for-byte. Use `raw` (not `trimmed`) as
    // input so all whitespace is preserved — the Rainbow SCS reader is
    // byte-faithful and prod Edge is a passthrough on RichText bodies
    // (0.4.0.7 retired the trailing trim).
    return { value: rewriteRichText(raw ?? '', engine, '', siteRootPath) };
  }
  return { value: raw };
}
