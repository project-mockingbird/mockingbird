import { v4 as uuidv4 } from 'uuid';

export function generateGuid(): string {
  return uuidv4();
}

export function formatGuidBraced(guid: string): string {
  return `{${guid.toUpperCase()}}`;
}

/**
 * Format a GUID for Experience Edge GraphQL `id` scalars — bare 32-hex
 * uppercase, no dashes, no braces (e.g. `88DA64DE28B64620B1085D8C61564F6F`).
 * Accepts any of Sitecore's internal forms (braced / dashed / lowercase).
 */
export function formatGuidEdge(guid: string): string {
  return guid.replace(/[{}\-]/g, '').toUpperCase();
}

export function parseGuidBraced(braced: string): string {
  return braced.replace(/[{}]/g, '').toLowerCase();
}

/** Strip braces and lowercase a GUID: "{ABC-DEF}" → "abc-def". */
export function normalizeGuid(raw: string): string {
  return raw.replace(/[{}]/g, '').toLowerCase();
}

/**
 * Convert a GUID in any of the accepted forms (braced, dashed 36-char, or
 * undashed 32-hex — with or without surrounding braces) to canonical
 * lowercase-dashed form. Returns undefined if the input isn't a valid GUID.
 */
export function toCanonicalGuid(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw.replace(/[{}-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(stripped)) return undefined;
  return `${stripped.slice(0, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}-${stripped.slice(16, 20)}-${stripped.slice(20)}`;
}

/**
 * Extract every brace-wrapped GUID from a string (e.g. SXA multilist, pipe-
 * delimited, or concatenated brace lists). Strips braces, lowercases, but
 * does NOT validate hex — callers resolve the resulting IDs against the
 * engine tree, which is the real existence check.
 */
export function parseGuidList(value: string | undefined): string[] {
  if (!value) return [];
  const matches = value.match(/\{[^}]+\}/g);
  if (!matches) return [];
  return matches.map(normalizeGuid);
}
