import type { TreeNode } from './types';

export type ReorderOp = 'up' | 'down' | 'first' | 'last';

/**
 * Sort siblings into the ascending-__Sortorder domain reorder operates in:
 * sortOrder ascending (missing => 100, the default-sortorder convention),
 * then name ascending as a stable tiebreak. The tree may DISPLAY siblings in a
 * different comparer order; reorder always works in this ascending ranking.
 */
export function rankBySortorder(siblings: TreeNode[]): TreeNode[] {
  return [...siblings].sort(
    (a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name),
  );
}

export interface ReorderState {
  /** Sibling ids in ascending-sortorder order (what a no-op reorder posts). */
  rankedIds: string[];
  /** The node's index in the ranking; -1 if absent. */
  index: number;
  /** True when the group can be reordered: >= 2 siblings, none registry/OOTB. */
  canReorder: boolean;
  canUp: boolean;
  canDown: boolean;
}

export function reorderState(siblings: TreeNode[], nodeId: string): ReorderState {
  const rankedIds = rankBySortorder(siblings).map(s => s.id);
  const index = rankedIds.indexOf(nodeId);
  const hasRegistry = siblings.some(s => s.source === 'registry');
  const canReorder = siblings.length >= 2 && !hasRegistry && index >= 0;
  return {
    rankedIds,
    index,
    canReorder,
    canUp: canReorder && index > 0,
    canDown: canReorder && index >= 0 && index < rankedIds.length - 1,
  };
}

/** New id order after applying `op` to `nodeId`, in the ascending-sortorder domain. */
export function computeReorderedIds(siblings: TreeNode[], nodeId: string, op: ReorderOp): string[] {
  const ids = rankBySortorder(siblings).map(s => s.id);
  const i = ids.indexOf(nodeId);
  if (i < 0) return ids;
  const next = ids.filter(id => id !== nodeId);
  if (op === 'up') next.splice(Math.max(0, i - 1), 0, nodeId);
  else if (op === 'down') next.splice(Math.min(next.length, i + 1), 0, nodeId);
  else if (op === 'first') next.unshift(nodeId);
  else next.push(nodeId);
  return next;
}

/** New id order after dropping `draggedId` immediately before `targetId`. */
export function reorderByDrop(siblings: TreeNode[], draggedId: string, targetId: string): string[] {
  const ids = rankBySortorder(siblings).map(s => s.id);
  if (draggedId === targetId) return ids;
  const without = ids.filter(id => id !== draggedId);
  const t = without.indexOf(targetId);
  if (t < 0) return ids;
  without.splice(t, 0, draggedId);
  return without;
}
