// src/web/components/tree/tree-keyboard-nav.ts
//
// Pure keyboard-navigation logic for tree views. No React, no DOM. The
// useTreeKeyboardNav hook is a thin DOM-aware adapter around computeIntent.

export interface RowMeta {
  id: string;
  level: number;
  isParent: boolean;
  isExpanded: boolean;
}

export type KeyboardNavIntent =
  | { kind: 'focus'; targetId: string }
  | { kind: 'expand'; id: string }
  | { kind: 'collapse'; id: string }
  | { kind: 'activate'; id: string }
  | { kind: 'noop' };

export function computeIntent(
  rows: RowMeta[],
  currentId: string | null,
  key: string,
): KeyboardNavIntent {
  if (rows.length === 0) return { kind: 'noop' };
  const idx = currentId === null ? -1 : rows.findIndex((r) => r.id === currentId);

  if (key === 'ArrowDown') {
    if (idx < 0) return { kind: 'focus', targetId: rows[0].id };
    if (idx < rows.length - 1) return { kind: 'focus', targetId: rows[idx + 1].id };
    return { kind: 'noop' };
  }

  if (key === 'ArrowUp') {
    if (idx < 0) return { kind: 'focus', targetId: rows[0].id };
    if (idx > 0) return { kind: 'focus', targetId: rows[idx - 1].id };
    return { kind: 'noop' };
  }

  if (key === 'Home') {
    return { kind: 'focus', targetId: rows[0].id };
  }

  if (key === 'End') {
    return { kind: 'focus', targetId: rows[rows.length - 1].id };
  }

  if (key === 'ArrowRight') {
    if (idx < 0) return { kind: 'noop' };
    const row = rows[idx];
    if (!row.isParent) return { kind: 'noop' };
    if (!row.isExpanded) return { kind: 'expand', id: row.id };
    // Expanded parent: first child is the next row, IF its level is parent.level + 1.
    const next = rows[idx + 1];
    if (next && next.level === row.level + 1) {
      return { kind: 'focus', targetId: next.id };
    }
    return { kind: 'noop' };
  }

  if (key === 'ArrowLeft') {
    if (idx < 0) return { kind: 'noop' };
    const row = rows[idx];
    if (row.isParent && row.isExpanded) {
      return { kind: 'collapse', id: row.id };
    }
    // Find nearest preceding row with smaller level.
    for (let i = idx - 1; i >= 0; i--) {
      if (rows[i].level < row.level) {
        return { kind: 'focus', targetId: rows[i].id };
      }
    }
    return { kind: 'noop' };
  }

  if (key === 'Enter' || key === ' ') {
    if (currentId === null) return { kind: 'noop' };
    return { kind: 'activate', id: currentId };
  }

  return { kind: 'noop' };
}

export function isFocusInDOM(rows: RowMeta[], focusedId: string | null): boolean {
  if (focusedId === null) return false;
  return rows.some((r) => r.id === focusedId);
}
