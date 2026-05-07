import type { Engine } from '../index.js';
import { readSharedField } from '../layout/item-fields.js';

const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

/**
 * Read Sitecore's `__Sortorder` field for an item, returning Sitecore's
 * default of 100 when the field is absent or unparseable. Used to sort
 * SXA picker contents the way Sitecore Content Editor + SXA chrome do.
 */
export function sortOrderOf(engine: Engine, itemId: string): number {
  const raw = readSharedField(engine, itemId, SORTORDER_FIELD_ID);
  if (!raw || raw.trim() === '') return 100;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 100;
}
