// src/web/components/tree/useTreeKeyboardNav.tsx
//
// React hook + context exposing keyboard navigation for tree views. Owns
// only the `focusedId` state; reads visible rows from the DOM via
// `data-tree-*` attributes and dispatches intents from `computeIntent`.
//
// Pure logic lives in tree-keyboard-nav.ts. The hook is a thin DOM adapter.

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  computeIntent,
  isFocusInDOM,
  type RowMeta,
} from './tree-keyboard-nav';

export interface UseTreeKeyboardNavOptions {
  initialFocusedId: string | null;
  onActivate: (id: string) => void;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
}

export interface TreeRowProps {
  'data-tree-row-id': string;
  'data-tree-level': number;
  'data-tree-parent': string;
  'data-tree-expanded': string;
  role: 'treeitem';
  'aria-level': number;
  'aria-expanded'?: boolean;
  tabIndex: 0 | -1;
}

export interface TreeContainerProps {
  role: 'tree';
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  ref: (el: HTMLElement | null) => void;
}

export interface UseTreeKeyboardNavReturn {
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
  containerProps: TreeContainerProps;
  getRowProps: (row: RowMeta) => TreeRowProps;
}

/**
 * True for inputs / textareas / selects / contentEditable elements - any
 * target where typing keystrokes is the user's intent. Used to bail out of
 * tree-keyboard-nav early so Space, Enter, and arrows go to the field
 * instead of getting eaten by the synthetic event bubbling up to the tree
 * container.
 */
function isEditableTarget(el: Element): boolean {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

function readRowsFromDOM(container: HTMLElement): RowMeta[] {
  const elements = container.querySelectorAll<HTMLElement>('[data-tree-row-id]');
  return Array.from(elements).map((el) => ({
    id: el.dataset.treeRowId!,
    level: Number(el.dataset.treeLevel ?? '0'),
    isParent: el.dataset.treeParent === 'true',
    isExpanded: el.dataset.treeExpanded === 'true',
  }));
}

function focusRowInDOM(container: HTMLElement, id: string): void {
  // CSS.escape because Sitecore item ids are GUIDs in {brace} form and the
  // braces are special characters in CSS attribute selectors.
  const el = container.querySelector<HTMLElement>(
    `[data-tree-row-id="${CSS.escape(id)}"]`,
  );
  if (el) {
    el.focus();
    el.scrollIntoView({ block: 'nearest' });
  }
}

export function useTreeKeyboardNav({
  initialFocusedId,
  onActivate,
  onExpand,
  onCollapse,
}: UseTreeKeyboardNavOptions): UseTreeKeyboardNavReturn {
  const [focusedId, setFocusedIdState] = useState<string | null>(initialFocusedId);
  const containerRef = useRef<HTMLElement | null>(null);

  // Resync focusedId to DOM after every render: if the row left the DOM
  // (collapse-all, search filter, delete), reset to null. The user's next
  // movement key restarts from the first row.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || focusedId === null) return;
    const rows = readRowsFromDOM(container);
    if (!isFocusInDOM(rows, focusedId)) {
      setFocusedIdState(null);
    }
  });

  const setFocusedId = useCallback((id: string | null) => {
    setFocusedIdState(id);
    if (id !== null && containerRef.current) {
      focusRowInDOM(containerRef.current, id);
    }
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      // Bail if any modifier is pressed so browser shortcuts (Alt+Left for
      // back, Cmd+Left, Ctrl+L for address bar focus, etc.) reach the browser
      // instead of being captured + preventDefault'd as tree nav.
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Bail when the event originates from an editable element. React's
      // synthetic events bubble up the React tree even across portals, so a
      // Radix Dialog input rendered as a child of a tree node would otherwise
      // route Space / Enter / arrow keys into tree nav and get preventDefault'd.
      // The DOM target is authoritative; Radix's portal placement doesn't
      // matter once we look at where the keystroke actually landed.
      const target = e.target as Element | null;
      if (target && isEditableTarget(target)) return;
      const container = containerRef.current;
      if (!container) return;
      const rows = readRowsFromDOM(container);
      const intent = computeIntent(rows, focusedId, e.key);

      switch (intent.kind) {
        case 'noop':
          return;
        case 'focus':
          setFocusedIdState(intent.targetId);
          focusRowInDOM(container, intent.targetId);
          e.preventDefault();
          return;
        case 'expand':
          onExpand(intent.id);
          e.preventDefault();
          return;
        case 'collapse':
          onCollapse(intent.id);
          e.preventDefault();
          return;
        case 'activate':
          onActivate(intent.id);
          e.preventDefault();
          return;
      }
    },
    [focusedId, onActivate, onExpand, onCollapse],
  );

  const containerProps: TreeContainerProps = {
    role: 'tree',
    onKeyDown,
    ref: (el) => {
      containerRef.current = el;
    },
  };

  const getRowProps = useCallback(
    (row: RowMeta): TreeRowProps => {
      const props: TreeRowProps = {
        'data-tree-row-id': row.id,
        'data-tree-level': row.level,
        'data-tree-parent': row.isParent ? 'true' : 'false',
        'data-tree-expanded': row.isExpanded ? 'true' : 'false',
        role: 'treeitem',
        'aria-level': row.level + 1,
        tabIndex: row.id === focusedId ? 0 : -1,
      };
      if (row.isParent) {
        props['aria-expanded'] = row.isExpanded;
      }
      return props;
    },
    [focusedId],
  );

  return { focusedId, setFocusedId, containerProps, getRowProps };
}

// Context plumbing so ContentTreeNode descendants can read the hook's
// return value without prop-drilling through every recursion level.

const TreeKeyboardNavContext = createContext<UseTreeKeyboardNavReturn | null>(null);

export function TreeKeyboardNavProvider({
  value,
  children,
}: {
  value: UseTreeKeyboardNavReturn;
  children: ReactNode;
}) {
  return (
    <TreeKeyboardNavContext.Provider value={value}>
      {children}
    </TreeKeyboardNavContext.Provider>
  );
}

export function useTreeKeyboardNavContext(): UseTreeKeyboardNavReturn {
  const ctx = useContext(TreeKeyboardNavContext);
  if (!ctx) {
    throw new Error(
      'useTreeKeyboardNavContext must be used inside TreeKeyboardNavProvider',
    );
  }
  return ctx;
}
