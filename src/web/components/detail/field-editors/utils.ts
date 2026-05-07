// src/web/components/detail/field-editors/utils.ts

// Sentinel used by lookup Selects to represent "no value" - radix Select
// doesn't accept value="" cleanly, so we route empty through this token
// and translate on read/write.
export const NONE_VALUE = '__none__';

export function normaliseGuid(v: string): string {
  return v.replace(/[{}]/g, '').toLowerCase();
}

export function bracedGuid(v: string): string {
  const bare = normaliseGuid(v);
  return bare ? `{${bare.toUpperCase()}}` : '';
}

/**
 * Anchor id used for the [Go to field] link. Stored field ids in mockingbird
 * are braced GUIDs; we normalise to the unbraced lowercase form so the
 * resulting URL fragment is clean (no brace encoding).
 */
export function fieldAnchorId(fieldId: string): string {
  return `field-${normaliseGuid(fieldId)}`;
}

/**
 * Parse a multi-select field value into an ordered list of normalized
 * braced GUIDs. Splits on pipe OR newline so the SCS block-scalar form
 * (`Value: |` followed by indented one-GUID-per-line) parses to the same
 * shape as the canonical inline form (`Value: '{guid1}|{guid2}'`).
 * Whitespace and empty segments are dropped. Idempotent: passing an
 * already-normalized value returns it unchanged.
 */
export function parseTreelistValue(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[|\r\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => bracedGuid(s));
}

/**
 * Serialize an ordered list of (already-braced) GUIDs back to the
 * pipe-delimited format Sitecore writes to disk.
 */
export function serializeTreelistValue(ids: string[]): string {
  return ids.join('|');
}

const GUID_LIKE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

/**
 * Normalize a multi-select field value to Sitecore's canonical
 * pipe-delimited form for display. Handles the case where the on-disk
 * SCS YAML uses block-scalar shape (newline-delimited GUIDs, no pipes) -
 * the parser preserves whatever delimiter is on disk, but the editor's
 * raw view should always show `{guid1}|{guid2}|{guid3}`.
 *
 * Returns the input unchanged when the value isn't an all-GUIDs list
 * (single GUID, plain text, mixed content), so it's safe to call on any
 * raw value.
 */
export function canonicalMultiSelectValue(raw: string): string {
  if (!raw) return raw;
  const parts = raw.split(/[|\r\n]+/).map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length < 2) return raw;
  if (!parts.every(p => GUID_LIKE.test(p))) return raw;
  return parts.map(bracedGuid).join('|');
}

/**
 * Normalize a Sitecore field type string for routing comparisons.
 * Sitecore looks up Field type definitions (under
 * `/sitecore/system/Field types/`) case-insensitively, and the OOTB
 * content tree stores both modern ("Treelist", "Checkbox") and legacy
 * ("tree list", "checkbox") spellings of the same field type. Routing
 * decisions in FieldEditor lowercase the input via this helper and
 * compare against lowercased sets / literals so both spellings land
 * on the same editor.
 *
 * Whitespace differences that aren't pure casing (e.g. "tree list" vs
 * "Treelist") are NOT collapsed - those are listed explicitly in the
 * routing sets so the legacy aliases stay searchable in source.
 */
export function normalizeFieldType(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}
