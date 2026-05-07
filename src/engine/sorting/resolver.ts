import type { Engine } from '../index.js';
import { FIELD_IDS } from '../constants.js';
import {
  readFieldWithSvFallback,
  readFieldViaStandardValuesCascade,
} from '../layout/item-fields.js';
import {
  defaultComparer,
  logicalComparer,
  displayNameComparer,
  reverseComparer,
  updatedComparer,
  createdComparer,
} from './comparers.js';
import type { Comparer } from './types.js';

/**
 * Hardcoded mapping of OOTB Sitecore sorting-item ids to their JS comparers.
 * Sitecore stores these items under `/sitecore/system/Settings/Subitems
 * Sorting/`; each has a `Type` field referencing a .NET class name.
 * Mockingbird can't run .NET reflection, so we map by item id directly.
 *
 * core ids: Default, Logical, Display name, Reverse, Updated.
 * master id: Created (master + core have separate item ids for the same
 * sorting concept; we list whichever ids the content tree actually references).
 *
 * Custom (non-OOTB) sorting items in production data are not supported -
 * they fall through to defaultComparer with a one-time warning.
 */
const SORTING_ID_TO_COMPARER: Record<string, Comparer> = {
  '781247d2-9785-400f-8935-c818ec757967': defaultComparer,
  'ea1decb2-b4f2-4ae0-99a8-30fded9b8b50': logicalComparer,
  '44d1a0d2-e17b-4daa-addf-53f2e8f58525': displayNameComparer,
  'c3e3f0e3-0162-4f1f-ab3e-40348e371a3f': reverseComparer,
  '32416a95-4197-4d33-8ce7-7bb4ffebeb42': updatedComparer,
  'c1ff011e-b02a-44e3-8444-9fc89cfc28ce': createdComparer,
};

/** Tracks ids we've already warned about so the log doesn't spam. */
const warnedUnknownIds = new Set<string>();

/**
 * Read the parent's `__Subitems Sorting` field (with `__Standard Values`
 * cascade) and return the matching comparer. Mirrors
 * `Sitecore.Data.Comparers.ComparerFactory.GetComparer(item)` at
 * `Sitecore.Kernel.decompiled.cs:426224`.
 *
 * Total function - never throws. Returns `defaultComparer` for:
 * - Unresolvable parent id.
 * - Field absent / empty / whitespace.
 * - Field set to a GUID not in our map (with one-time console.warn).
 * - Any field-read failure.
 */
export function resolveComparer(engine: Engine, parentId: string): Comparer {
  let raw: string | undefined;
  try {
    const node = engine.getItemById(parentId);
    if (node) {
      raw = readFieldWithSvFallback(engine, node.item, FIELD_IDS.subitemsSorting, 'en');
    } else {
      const reg = engine.getRegistryItem(parentId);
      if (!reg) return defaultComparer;
      const own = reg.sharedFields[FIELD_IDS.subitemsSorting];
      if (own !== undefined && own !== '') {
        raw = own;
      } else {
        raw = readFieldViaStandardValuesCascade(engine, reg.template, FIELD_IDS.subitemsSorting, 'en');
      }
    }
  } catch {
    return defaultComparer;
  }

  if (!raw) return defaultComparer;
  const cleaned = raw.trim().replace(/^\{|\}$/g, '').toLowerCase();
  if (cleaned === '') return defaultComparer;

  const comparer = SORTING_ID_TO_COMPARER[cleaned];
  if (comparer) return comparer;

  if (!warnedUnknownIds.has(cleaned)) {
    warnedUnknownIds.add(cleaned);
    console.warn(
      `[sorting] Unknown __Subitems Sorting id "${cleaned}" - falling back to defaultComparer. ` +
      `Add to SORTING_ID_TO_COMPARER in src/engine/sorting/resolver.ts if this is an OOTB sorting item.`,
    );
  }
  return defaultComparer;
}

/**
 * Test-only helper to clear the warned-set between test runs. NOT exported
 * from the package index.
 */
export function _resetWarnedUnknownIdsForTesting(): void {
  warnedUnknownIds.clear();
}
