// src/web/lib/item-fields.ts
import type { ItemDetail } from '@/lib/types';

/**
 * Read a field value from an ItemDetail, checking shared / language-level /
 * version-level fields in that order. Returns the first match or undefined.
 * Field-id comparison is case-insensitive.
 */
export function readItemField(item: ItemDetail | null, fieldId: string): string | undefined {
  if (!item) return undefined;
  const lower = fieldId.toLowerCase();
  for (const f of item.sharedFields ?? []) {
    if (f.id.toLowerCase() === lower) return f.value;
  }
  const lang = item.languages?.[0];
  if (lang) {
    for (const f of lang.fields ?? []) {
      if (f.id.toLowerCase() === lower) return f.value;
    }
    const ver = lang.versions?.[0];
    if (ver) {
      for (const f of ver.fields ?? []) {
        if (f.id.toLowerCase() === lower) return f.value;
      }
    }
  }
  return undefined;
}
