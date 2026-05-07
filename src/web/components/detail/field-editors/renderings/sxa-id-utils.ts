// src/web/components/detail/field-editors/renderings/sxa-id-utils.ts

/**
 * Shared helpers for SXA pipe-delimited braced-GUID controls (Styles +
 * Grid Parameters). Both controls store selected items as
 * `{GUID1}|{GUID2}|...` in s:par params; both need case- and brace-
 * insensitive comparison against API-supplied option lists; both need
 * to re-emit unknown (deleted/unresolved) GUIDs in canonical wire form
 * to avoid silent data loss.
 *
 * Variant doesn't use these helpers because it stores a single GUID
 * (no pipe delimiter) and uses a Select rather than a checkbox tree.
 */

/**
 * Strip braces and lowercase a GUID for comparison purposes.
 * `{ABC-DEF}` -> `abc-def`.
 */
export function normalizeId(id: string): string {
  return id.toLowerCase().replace(/[{}]/g, '');
}

/**
 * Re-emit a normalized GUID in canonical SXA wire form: `{UPPERCASE}`.
 * Used when serializing unknown IDs back to the params string so that
 * round-trip-through-engine matches what `formatGuidBraced` produces.
 */
export function bracedUpper(normalized: string): string {
  return `{${normalized.toUpperCase()}}`;
}

/**
 * Parse a pipe-delimited braced-GUID string into a Set of normalized IDs
 * for membership checking. Empty/missing tokens are ignored.
 *
 *   "{ABC}|{DEF}|" -> Set { "abc", "def" }
 */
export function parseSelected(value: string): Set<string> {
  if (!value) return new Set();
  return new Set(
    value.split('|').map(g => normalizeId(g.trim())).filter(Boolean),
  );
}
