/**
 * Pick which item should become selected after deleting a tree row.
 *
 * Order of preference: previous sibling, then next sibling, then the parent.
 * Returns null when none of those exist (deleted item was the only top-level
 * row with no parent).
 */
export function pickNeighborAfterDelete(
  siblings: ReadonlyArray<{ id: string }>,
  deletedId: string,
  parentId: string | null,
): string | null {
  const idx = siblings.findIndex((s) => s.id === deletedId);
  if (idx > 0) return siblings[idx - 1].id;
  if (idx >= 0 && idx < siblings.length - 1) return siblings[idx + 1].id;
  return parentId;
}
