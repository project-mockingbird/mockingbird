/**
 * Flat key shape every comparer operates over. The tree route enriches each
 * child with these fields before sorting, so comparers stay pure functions
 * with no engine access.
 *
 * Defaults are populated by the enrichment step:
 * - sortOrder: cascaded value, falling back to 100 (Sitecore convention).
 * - displayName: stored value, falling back to name.
 * - createdAt / updatedAt: epoch ms parsed from `__Created` / `__Updated`;
 *   0 when the field is missing or malformed.
 */
export interface ItemSortKey {
  id: string;
  name: string;
  sortOrder: number;
  displayName: string;
  createdAt: number;
  updatedAt: number;
}

export type Comparer = (a: ItemSortKey, b: ItemSortKey) => number;
