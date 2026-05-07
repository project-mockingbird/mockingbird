import type { Comparer } from './types.js';

/**
 * Logical/numeric collator. `numeric: true` makes "Foo2" < "Foo10" instead of
 * "Foo10" < "Foo2". `sensitivity: 'base'` is case + accent insensitive.
 * JS equivalent of Windows `StrCmpLogicalW` which Sitecore uses in
 * `LogicalComparer` and `DisplayNameComparer`.
 */
const NUMERIC_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Plain string collator (case + accent insensitive, no numeric handling).
 * Used by `defaultComparer` and `reverseComparer` to mirror Sitecore's
 * `string.CompareTo` semantics (culture-sensitive, non-numeric).
 */
const ORDINAL_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * Sitecore's underscore-special-case: items whose name starts with `_`
 * sort AFTER items whose name doesn't, regardless of other ordering.
 * Mirrors `Sitecore.Data.Comparers.DefaultComparer.CompareNames` at
 * `Sitecore.Kernel.decompiled.cs:426104` and the identical pattern in
 * `LogicalComparer.CompareNames` at `:426640`.
 */
function compareNamesUnderscoreLast(a: string, b: string, collator: Intl.Collator): number {
  if (a.length > 0 && b.length > 0) {
    const aUnder = a[0] === '_';
    const bUnder = b[0] === '_';
    if (aUnder && !bUnder) return 1;
    if (bUnder && !aUnder) return -1;
  }
  return collator.compare(a, b);
}

/**
 * Reversed underscore-special-case for `ReverseComparer`: items whose name
 * starts with `_` sort BEFORE items whose name doesn't. Plus reversed
 * collation. Mirrors `ReverseComparer.CompareNames` at
 * `Sitecore.Kernel.decompiled.cs:426709`.
 */
function compareNamesUnderscoreFirstReversed(a: string, b: string, collator: Intl.Collator): number {
  if (a.length > 0 && b.length > 0) {
    const aUnder = a[0] === '_';
    const bUnder = b[0] === '_';
    if (aUnder && !bUnder) return -1;
    if (bUnder && !aUnder) return 1;
  }
  return collator.compare(b, a);
}

/**
 * Default child comparer. Port of `Sitecore.Data.Comparers.DefaultComparer`
 * at `Sitecore.Kernel.decompiled.cs:426083`. Sorts by `__Sortorder`
 * ascending. On sortorder tie, falls through to a name compare that puts
 * underscore-prefixed items LAST (Sitecore convention - `_`-named items are
 * typically internal/hidden helpers and should not lead the list).
 */
export const defaultComparer: Comparer = (a, b) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return compareNamesUnderscoreLast(a.name, b.name, ORDINAL_COLLATOR);
};

/**
 * Logical comparer. Port of `Sitecore.Data.Comparers.LogicalComparer` at
 * `:426619`. Same shape as defaultComparer but uses logical/numeric name
 * compare (`StrCmpLogicalW` semantics) on the tiebreak: `Foo2 < Foo10`.
 * Underscore-LAST applies.
 */
export const logicalComparer: Comparer = (a, b) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return compareNamesUnderscoreLast(a.name, b.name, NUMERIC_COLLATOR);
};

/**
 * Display-name comparer. Port of
 * `Sitecore.Data.Comparers.DisplayNameComparer` at `:426249`. Sortorder
 * ascending primary, then logical compare on `__Display Name` (callers
 * populate with name as fallback). DOES NOT apply the underscore-LAST
 * special case (decompile does not include it).
 */
export const displayNameComparer: Comparer = (a, b) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return NUMERIC_COLLATOR.compare(a.displayName, b.displayName);
};

/**
 * Updated comparer. Port of `Sitecore.Data.Comparers.UpdatedComparer` at
 * `:426803`. Sortorder ascending primary, then `__Updated` descending
 * (most-recent first). Items with `updatedAt: 0` (missing/malformed
 * `__Updated`) cluster last - mirrors Sitecore's `DateTime.MinValue`
 * behavior. No underscore special case.
 */
export const updatedComparer: Comparer = (a, b) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return b.updatedAt - a.updatedAt;
};

/**
 * Created comparer. Port of `Sitecore.Data.Comparers.CreatedComparer` at
 * `:426015`. Sortorder ascending primary, then `__Created` ascending
 * (oldest first). Items with `createdAt: 0` cluster at the start - mirrors
 * Sitecore's `DateTime.MinValue` first-place behavior in an ascending sort.
 * No underscore special case.
 */
export const createdComparer: Comparer = (a, b) => {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt - b.createdAt;
};

/**
 * Reverse comparer. Port of `Sitecore.Data.Comparers.ReverseComparer` at
 * `:426688`. Sortorder DESCENDING primary (override on the base
 * `DoCompareSortorder` at decompile `:426732`). On sortorder tie, name
 * compare with underscore-FIRST (the inverse of default) and reversed
 * ordinal compare.
 */
export const reverseComparer: Comparer = (a, b) => {
  if (a.sortOrder !== b.sortOrder) return b.sortOrder - a.sortOrder;
  return compareNamesUnderscoreFirstReversed(a.name, b.name, ORDINAL_COLLATOR);
};
