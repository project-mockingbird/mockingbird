import type { Engine } from '../index.js';
import { normalizeGuid, parseGuidList } from '../guid.js';
import type { ScsItem } from '../types.js';
import type { JssFieldValue, JssReferenceItem } from './types.js';
import { itemName } from './utils.js';
import {
  getLatestVersion,
  buildItemValueIndex,
  resolveFieldValue,
  synthesizeItemFromRegistry,
} from './item-fields.js';
import { getTemplateSchema } from '../template-schema.js';
import { decodeXmlEntities } from './xml-utils.js';
import { isSiteMetadataSection } from './section-filters.js';
import { rewriteRichText } from '../render-field/rich-text.js';
import {
  isMediaItem,
  buildMediaUrlPath,
  buildMediaSrc,
  readMediaAlt,
} from '../render-field/media.js';

/** Extract an XML attribute value by name, decoding standard entities. */
function xmlAttr(xml: string, name: string): string {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

/**
 * Look up an item by ID. Tree-first: serialized items always win. When
 * the tree lookup misses, falls back to the registry (0.4.0.11 item 3)
 * and synthesizes an ScsItem from the RegistryItem shape. Returns
 * undefined when neither tree nor registry has the id.
 *
 * Used by formatMultilist / formatSingleRef / formatLink / formatImage /
 * formatReferenceItem — any path that dereferences a GUID to an item.
 */
function resolveItem(id: string, engine: Engine): ScsItem | undefined {
  const node = engine.getItemById(id);
  if (node?.item) return node.item;
  const reg = engine.getRegistryItem(id);
  if (!reg) return undefined;
  return synthesizeItemFromRegistry(reg);
}

/** Strip site root prefix to produce a site-relative URL. */
function siteRelativeUrl(itemPath: string, siteRootPath: string): string {
  if (!siteRootPath) return itemPath;
  const lower = itemPath.toLowerCase();
  const rootLower = siteRootPath.toLowerCase();
  if (lower.startsWith(rootLower)) {
    const relative = itemPath.slice(siteRootPath.length);
    return relative || '/';
  }
  return itemPath;
}

import { referenceUrl } from './url-utils.js';

/** Set of field type names (lowercased) that are treated as multilist references. */
const MULTILIST_TYPES = new Set([
  'treelist',
  'multilist',
  'multilist with search',
  'treelist with search',
  'treelistex',
  // SXA's field-type registration uses both spellings across different
  // fields/releases — keep both as aliases to avoid falling through to the
  // text branch (which would emit the raw pipe-separated GUID string).
  'multi-root treelist',
  'multiroot treelist',
  'tag treelist',
  'checklist',
]);

/** Set of field type names (lowercased) that are treated as single-reference. */
const SINGLE_REF_TYPES = new Set([
  'droplink',
  'droptree',
]);

/** Set of field type names (lowercased) that are treated as link fields. */
const LINK_TYPES = new Set([
  'general link',
  'general link with search',
]);

/** Sitecore's `DateTime.MinValue` in ISO-8601 — the unset default for Date / Datetime fields. */
const DATE_MIN_VALUE_ISO = '0001-01-01T00:00:00Z';

/** Sitecore's `TimeSpan.Zero` as Edge serializes it — the unset default for Time fields. */
const TIME_ZERO = '00:00:00';

/**
 * Return the empty-default JSS value for a given Sitecore field type. Edge
 * emits one of these for every template field that the item has no stored
 * value for, so consumers can rely on a stable shape.
 *
 * Date / Datetime / Time fields mirror .NET's `DateTime.MinValue` /
 * `TimeSpan.Zero` rather than `""` — components bind to these as
 * parseable strings and crash on empty. SXA Event / Release pages have
 * `PlayFrom` / `PlayTo` (Time) and `EndDate` / `StartDate` (Date)
 * fields where the unset default must be `"00:00:00"` / `"0001-01-01
 * T00:00:00Z"` to match Edge.
 */
export function emptyValueForType(fieldType: string): JssFieldValue {
  const type = fieldType.toLowerCase();
  if (type === 'checkbox') return { value: false };
  if (type === 'integer' || type === 'number') return { value: 0 };
  if (type === 'image') return { value: {} } as unknown as JssFieldValue;
  if (LINK_TYPES.has(type)) return { value: { href: '' } } as unknown as JssFieldValue;
  if (MULTILIST_TYPES.has(type)) return [] as unknown as JssFieldValue;
  if (SINGLE_REF_TYPES.has(type)) return null;
  if (type === 'time') return { value: TIME_ZERO };
  if (type === 'date' || type === 'datetime') return { value: DATE_MIN_VALUE_ISO };
  // Default: text-like (Single-Line, Multiline, Rich Text, Droplist, unknown).
  return { value: '' };
}

/**
 * Convert a Sitecore-stored date/datetime string to Edge's ISO-8601 form.
 * Sitecore persists dates in a compact `yyyyMMddTHHmmss[Z]?` form that is
 * not a valid ISO-8601 string; Edge normalizes to the expanded
 * `yyyy-MM-ddTHH:mm:ssZ` shape before emission. Values already in the
 * expanded form (or any other format we don't recognize) pass through
 * untouched.
 */
function formatDateISO(raw: string): string {
  const trimmed = raw.trim();
  const full = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(trimmed);
  if (full) {
    const [, y, mo, d, h, mi, s] = full;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  }
  // 0.4.0.10 item 1: authored FAQ dates are stored as 8-digit date-only
  // `yyyyMMdd[Z]?` form. Edge emits the ISO midnight expansion.
  const dateOnly = /^(\d{4})(\d{2})(\d{2})Z?$/.exec(trimmed);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return `${y}-${mo}-${d}T00:00:00Z`;
  }
  return trimmed;
}

/**
 * Format a raw field string value into a typed JSS shape based on field type.
 */
export function formatField(
  value: string,
  fieldType: string,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath?: string,
): JssFieldValue {
  if (value == null) return null;

  const type = fieldType.toLowerCase();

  if (type === 'checkbox') {
    return { value: value === '1' };
  }

  if (type === 'integer') {
    return { value: parseInt(value, 10) || 0 };
  }

  if (type === 'number') {
    return { value: parseFloat(value) || 0 };
  }

  if (type === 'image') {
    return formatImage(value, engine, mediaBaseUrl);
  }

  if (LINK_TYPES.has(type)) {
    return formatLink(value, engine, siteRootPath ?? '', mediaBaseUrl);
  }

  if (MULTILIST_TYPES.has(type)) {
    return formatMultilist(value, engine, mediaBaseUrl, siteRootPath ?? '');
  }

  if (SINGLE_REF_TYPES.has(type)) {
    return formatSingleRef(value, engine, mediaBaseUrl, siteRootPath ?? '');
  }

  if (type === 'date' || type === 'datetime') {
    return { value: formatDateISO(value) };
  }

  // Rich Text is post-processed by Edge: dynamic link/media references
  // stored as `~/link.aspx?_id={GUID}` / `-/media/<id>.ashx?...` are
  // rewritten to their resolved URLs by `rewriteRichText`. Leading,
  // internal, and trailing whitespace all pass through verbatim — the
  // Rainbow SCS reader (src/engine/parser.ts, 0.3.3) is byte-faithful,
  // and Sitecore's `RenderFieldPipeline` for RichText is a passthrough
  // after processor transforms. 0.4.0.7 retired the trailing-whitespace
  // trim that was defending against a pre-0.3.3 js-yaml artifact.
  if (type === 'rich text') {
    return { value: rewriteRichText(value, engine, mediaBaseUrl, siteRootPath ?? '') };
  }

  // Default: text-like fields (Single-Line Text, Multiline Text, Droplist,
  // unknown). Emit stored value byte-for-byte — Sitecore's
  // `RenderFieldPipeline.GetTextFieldValue` is a passthrough for plain-text
  // types; only HTML/RichText field types run additional processing. The
  // Rainbow SCS reader (src/engine/parser.ts, 0.3.3) preserves leading
  // whitespace byte-exactly, so we preserve trailing as well (0.4.0.6).
  return { value };
}



/**
 * Parse every attribute on an `<image ... />` element, keyed lowercased.
 * Used to preserve authored attributes (`hspace`, `vspace`, `class`,
 * `title`, etc.) that Edge emits verbatim alongside the computed
 * `src` / `alt` / `width` / `height`. Previously the image emitter read
 * only alt / width / height and dropped everything else.
 */
function parseImageAttrs(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attrRe = /\b([a-zA-Z_][\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(xml)) !== null) {
    out[m[1].toLowerCase()] = decodeXmlEntities(m[2]);
  }
  return out;
}

function formatImage(
  xml: string,
  engine: Engine,
  mediaBaseUrl: string,
): JssFieldValue {
  const mediaId = normalizeGuid(xmlAttr(xml, 'mediaid'));
  // Edge convention: an image field with no media reference is emitted
  // as `{value: {}}` (empty object), not the full empty-string shape.
  if (!mediaId) return { value: {} } as unknown as JssFieldValue;

  const authored = parseImageAttrs(xml);
  // `mediaid` is the resolution handle — used to look up the media item,
  // not emitted on the output shape.
  delete authored.mediaid;

  let alt = authored.alt ?? '';
  let width = authored.width ?? '';
  let height = authored.height ?? '';

  let src = '';
  const mediaItem = resolveItem(mediaId, engine);
  if (mediaItem) {
    if (!alt) alt = readMediaAlt(mediaItem);
    const resolved = buildMediaSrc(mediaItem, mediaBaseUrl, width, height);
    src = resolved.src;
    width = resolved.width;
    height = resolved.height;
  }

  // Start from every authored attribute (carries `hspace`, `vspace`,
  // `class`, `title`, etc.) and layer derived / back-filled values over
  // the top. `src` is always derived from the media item — never
  // authored. Optional authored attrs whose value is empty string are
  // dropped from the emitted shape: prod Edge's rule is "present-only-
  // if-authored" — SXA stores every image XML with hspace="" / vspace=""
  // / class="" / title="" but Edge omits empty-valued optional keys.
  // Required attrs (src, alt, width, height) are handled explicitly
  // below and may stay even when empty.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(authored)) {
    if (k === 'src' || k === 'alt' || k === 'width' || k === 'height') continue;
    if (v === '') continue;
    out[k] = v;
  }
  out.src = src;
  out.alt = alt;
  // Width / height drop out of the shape when neither the authored XML
  // nor the media item carries a dimension — matches Edge's SVG /
  // dimensionless output. Other authored attrs (hspace, vspace, etc.)
  // still pass through when non-empty.
  if (width) out.width = width;
  if (height) out.height = height;

  return { value: out } as unknown as JssFieldValue;
}

/**
 * Parse all attributes of a `<link ... />` XML element in source order.
 * Edge emits exactly the set of attributes that were stored in the source
 * XML — different General Link fields serialize different attribute subsets
 * (some have `anchor/class/title`, others have `url` instead), and Edge's
 * output shape mirrors that. Returning an ordered list lets formatLink
 * preserve both membership AND order without guessing.
 */
function parseLinkAttrs(xml: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const attrRe = /\b([a-zA-Z_][\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(xml)) !== null) {
    out.push([m[1], decodeXmlEntities(m[2])]);
  }
  return out;
}

function formatLink(
  xml: string,
  engine: Engine,
  siteRootPath: string,
  mediaBaseUrl: string,
): JssFieldValue {
  // Empty link XML → `{value: {href: ''}}` — Edge emits at minimum the href
  // key on all general-link values, even when the field is empty.
  if (!xml || !xml.trim()) return { value: { href: '' } } as unknown as JssFieldValue;

  const attrs = parseLinkAttrs(xml);
  const getAttr = (name: string): string | undefined => {
    const hit = attrs.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return hit?.[1];
  };

  const linktype = getAttr('linktype') ?? '';
  const id = getAttr('id') ?? '';

  let href = '';
  if (linktype === 'internal' && id) {
    const normalId = normalizeGuid(id);
    const item = resolveItem(normalId, engine);
    if (item) {
      // Sitecore's `InternalLinkFieldSerializer.GetLinkUrl` dispatches by
      // the resolved item's `IsMediaItem` flag (minus the MediaFolder
      // template) rather than by the authored `linktype` attribute - a
      // `linktype="internal"` link pointing at a media-library leaf gets
      // the media URL, not the site-relative one.
      href = isMediaItem(item)
        ? `${mediaBaseUrl}${buildMediaUrlPath(item)}`
        : siteRelativeUrl(item.path, siteRootPath);
    }
  } else if (linktype === 'media' && id) {
    const normalId = normalizeGuid(id);
    const item = resolveItem(normalId, engine);
    if (item) {
      href = `${mediaBaseUrl}${buildMediaUrlPath(item)}`;
    }
  } else if (linktype === 'mailto') {
    // 0.4.0.10 item 4: Sitecore's `MailtoLinkField.GetHref` prepends the
    // scheme when the authored `url` is a bare email. Guard against
    // already-prefixed values (case-insensitive per RFC 5321 URI scheme
    // rules) and empty input (preserve pre-0.4.0.10 empty-string href
    // for degenerate authored data).
    const rawUrl = getAttr('url') ?? '';
    const alreadyPrefixed = rawUrl.toLowerCase().startsWith('mailto:');
    href = !rawUrl || alreadyPrefixed ? rawUrl : `mailto:${rawUrl}`;
  } else if (linktype === 'external') {
    href = getAttr('url') ?? '';
  }

  // 0.4.0.8: Sitecore's `GeneralLinkFieldSerializer.GetLinkProperties`
  // emits computed `href` + authored XML attrs verbatim. No computed
  // overwrites — in particular `url` is kept as authored, never derived
  // from the resolved item's path.
  const value: Record<string, string> = {};
  for (const [k, v] of attrs) value[k] = v;
  value.href = href;

  return { value } as unknown as JssFieldValue;
}

function formatMultilist(
  value: string,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
): JssReferenceItem[] {
  const ids = parseGuidList(value);
  const results: JssReferenceItem[] = [];
  for (const id of ids) {
    const item = resolveItem(id, engine);
    if (item) {
      results.push(formatReferenceItem(item, engine, mediaBaseUrl, siteRootPath));
    }
  }
  return results;
}

function formatSingleRef(
  value: string,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
): JssReferenceItem | null {
  if (!value || !value.trim()) return null;
  const id = normalizeGuid(value);
  const item = resolveItem(id, engine);
  if (!item) return null;
  return formatReferenceItem(item, engine, mediaBaseUrl, siteRootPath);
}

/**
 * Build a JssReferenceItem from a resolved ScsItem. Uses the same schema-
 * driven field emission as route-level items so every field declared on the
 * item's template (including inherited fields) is present — with typed
 * empty defaults for unset fields. This matches real Experience Edge's
 * contract that consuming components can bind to `fields.Foo.value`
 * without guarding on the wrapper itself.
 */
export function formatReferenceItem(
  item: ScsItem,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
): JssReferenceItem {
  const name = itemName(item.path);
  const url = referenceUrl(item.path, siteRootPath);

  // Schema-driven field emission with `__Standard Values` cascade — same
  // resolution rules as `formatItemFields` in utils.ts (shared via
  // `resolveFieldValue` in item-fields.ts to DRY the three-branch rule).
  // Pre-0.2.1 behaviour read stored values directly here, skipping the SV
  // cascade — so a referenced Tag whose template SV carried `Color = "blue"`
  // rendered `Color: {value: ""}` at the reference level and diverged from
  // prod Edge (`MultiListFieldSerializer` uses `DefaultItemSerializer` which
  // hits `item.Fields[id].Value` — cascades to SV automatically).
  const fields: Record<string, JssFieldValue> = {};
  const index = buildItemValueIndex(item, 'en');

  try {
    const schema = getTemplateSchema(item.template, engine);
    for (const section of schema.sections) {
      if (section.isStandard) continue;
      if (isSiteMetadataSection(section.sourceTemplateId, engine)) continue;
      for (const f of section.fields) {
        if (f.name.startsWith('__')) continue;
        const value = resolveFieldValue(index, f.id, f.name, item, 'en', engine, siteRootPath);
        fields[f.name] = value !== undefined
          ? formatField(value, f.type, engine, mediaBaseUrl, siteRootPath)
          : emptyValueForType(f.type);
      }
    }
  } catch {
    // Template not in the tree — fall back to stored fields only (pre-
    // 0.1.15 behavior) so we don't crash on items whose template was
    // never serialized.
    const latest = getLatestVersion(item, 'en');
    if (latest) {
      for (const f of latest.fields) {
        if (f.hint && !f.hint.startsWith('__')) {
          fields[f.hint] = { value: f.value };
        }
      }
    }
  }

  return {
    id: item.id,
    url,
    name,
    displayName: name,
    fields,
  };
}
