/**
 * Module-scoped string-interning pool.
 *
 * Sitecore's `InternManager<string>` (decompiled at
 * `Sitecore.Kernel.decompiled.cs:424173-424245`) runs every deserialized
 * string and GUID through an intern pool before handing items to the tree.
 * Drastically shrinks heap when thousands of items share the same template
 * IDs, field IDs, language codes, and hints.
 *
 * V8 doesn't auto-intern arbitrary strings - each allocates a fresh `One
 * Byte String` or `Two Byte String` object. For an 11k-item content tree with
 * ~20 fields per item, that's ~220k field objects carrying ~660k field-
 * id + hint + type strings. Most collapse to <1,000 unique values.
 *
 * Apply via {@link internItem} on fresh `ScsItem` objects emerging from
 * parse or cache deserialization, before they're added to the tree.
 * Interning the same key twice is a no-op (second call hits the Map hit
 * path).
 *
 * 0.4.0.25.
 */

import type { ScsItem, ScsField } from './types.js';

const pool = new Map<string, string>();

/**
 * Return the pool-unique instance of `s`. First call for a given string
 * records it; subsequent calls return the recorded reference.
 */
export function intern(s: string): string {
  const existing = pool.get(s);
  if (existing !== undefined) return existing;
  pool.set(s, s);
  return s;
}

/** Total number of unique strings in the pool. Useful for telemetry. */
export function internPoolSize(): number {
  return pool.size;
}

/** Reset the pool. Only used in tests to isolate between-test state. */
export function clearInternPool(): void {
  pool.clear();
}

/**
 * Mutate `item` in place, replacing common repeated-across-items strings
 * with their interned representatives. Returns the same item for
 * chaining.
 *
 * Interned: template ID, parent ID, each field's `id`/`hint`/`type`,
 * each language's `language` code. NOT interned: `item.id` (unique per
 * item by definition - pooling would grow the pool to the size of the
 * content tree with no compression benefit), field values (most are unique),
 * item paths (unique).
 */
export function internItem(item: ScsItem): ScsItem {
  item.template = intern(item.template);
  item.parent = intern(item.parent);
  for (const f of item.sharedFields) internField(f);
  for (const lang of item.languages) {
    lang.language = intern(lang.language);
    for (const f of lang.fields) internField(f);
    for (const ver of lang.versions) {
      for (const f of ver.fields) internField(f);
    }
  }
  return item;
}

function internField(f: ScsField): void {
  f.id = intern(f.id);
  f.hint = intern(f.hint);
  if (f.type !== undefined) f.type = intern(f.type);
}
