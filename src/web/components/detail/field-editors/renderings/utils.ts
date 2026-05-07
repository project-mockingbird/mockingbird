// src/web/components/detail/field-editors/renderings/utils.ts

import type { RenderingEntry } from './types';

/**
 * Generate a fresh braced-uppercase GUID for a new rendering entry's uid.
 * Uses the standard Web Crypto API; falls back to a Math.random-based shape
 * only in environments where crypto is unavailable (vitest jsdom has it).
 */
export function generateUid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `{${crypto.randomUUID().toUpperCase()}}`;
  }
  // Fallback - rare, but keep it deterministic-ish for test envs.
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0').toUpperCase();
  return `{${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}}`;
}

/**
 * Decode a Sitecore-style s:par value (key=value pairs delimited by & or
 * &amp;). Inspired by the engine's parseParams (src/engine/layout/rendering-xml.ts:22-36)
 * but with two web-specific differences:
 * 1. Percent-decodes keys and values at parse time (the engine stores raw
 *    percent-encoded values and defers decoding to its component-resolver
 *    pipeline).
 * 2. Preserves SXA flag-form bare keys as empty-value entries (e.g.
 *    "StickyAt&TopSticky" -> { StickyAt: '', TopSticky: '' }) so the editor
 *    can round-trip them back. The engine drops bare keys because layout
 *    resolution doesn't need them.
 */
export function decodeParams(raw: string): Record<string, string> {
  if (!raw) return {};
  const decoded = raw.replace(/&amp;/g, '&');
  const result: Record<string, string> = {};
  for (const pair of decoded.split('&')) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      // Flag form: bare key
      result[decodeURIComponent(pair)] = '';
      continue;
    }
    const key = decodeURIComponent(pair.slice(0, eqIdx));
    const value = decodeURIComponent(pair.slice(eqIdx + 1));
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Encode params back into the Sitecore s:par form. Empty-value entries serialize
 * as "key=" (canonical); braces in values become %7B/%7D. The serializer
 * applies a final XML attribute escape (& -> &amp;) when emitting the s:par
 * attribute itself.
 */
export function encodeParams(params: Record<string, string>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    const k = encodeURIComponent(key);
    const v = encodeURIComponent(value);
    parts.push(`${k}=${v}`);
  }
  return parts.join('&');
}

/**
 * Compute the p:before / p:after conditioning chain from the entry order
 * within each placeholder. First entry per placeholder gets pBefore="*"; each
 * subsequent entry gets pAfter="r[@uid='{prev}']".
 *
 * Returns one ConditioningResult per entry in the same order as the input.
 */
export interface ConditioningResult {
  uid: string;
  pBefore?: string;
  pAfter?: string;
}

export function computeConditioning(entries: Array<Pick<RenderingEntry, 'uid' | 'placeholder'>>): ConditioningResult[] {
  const lastUidByPlaceholder = new Map<string, string>();
  return entries.map(entry => {
    const prev = lastUidByPlaceholder.get(entry.placeholder);
    lastUidByPlaceholder.set(entry.placeholder, entry.uid);
    if (prev === undefined) return { uid: entry.uid, pBefore: '*' };
    return { uid: entry.uid, pAfter: `r[@uid='${prev}']` };
  });
}
