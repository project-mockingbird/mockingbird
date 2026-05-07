// src/web/state/closedTabsStore.ts
import type { TabState } from './workspaceStore';

export const CLOSED_TABS_LIMIT = 10;

export interface ClosedTabRecord {
  tab: TabState;
  paneIndex: 0 | 1;
}

export interface ClosedTabsStore {
  push: (record: ClosedTabRecord) => void;
  pop: () => ClosedTabRecord | null;
  peek: () => ClosedTabRecord | null;
  size: () => number;
  subscribe: (listener: () => void) => () => void;
}

export function createClosedTabsStore(): ClosedTabsStore {
  let stack: ClosedTabRecord[] = [];
  const listeners = new Set<() => void>();
  const notify = () => { for (const l of listeners) l(); };

  return {
    push: (record) => {
      stack = [...stack, record];
      if (stack.length > CLOSED_TABS_LIMIT) stack = stack.slice(stack.length - CLOSED_TABS_LIMIT);
      notify();
    },
    pop: () => {
      if (stack.length === 0) return null;
      const last = stack[stack.length - 1];
      stack = stack.slice(0, -1);
      notify();
      return last;
    },
    peek: () => (stack.length === 0 ? null : stack[stack.length - 1]),
    size: () => stack.length,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const closedTabsStore: ClosedTabsStore = createClosedTabsStore();
