// src/web/components/detail/field-editors/renderings/RenderingsTree.tsx

import { Fragment, useState } from 'react';
import { PlaceholderTreeRow } from './PlaceholderTreeRow';
import { RenderingCard } from './RenderingCard';
import type { TreeNode, TreePlaceholderNode, TreeRenderingNode } from './types';

interface RenderingsTreeProps {
  nodes: TreeNode[];
  editing: boolean;
  onAdd: (placeholder: string) => void;
  onEdit: (uid: string) => void;
  onMoveUp: (uid: string) => void;
  onMoveDown: (uid: string) => void;
  onRemove: (uid: string) => void;
}

/**
 * Recursive renderer for the renderings tree. Renders both placeholder rows
 * and rendering rows in document order, pre-computing isFirst/isLast for
 * each rendering relative to its placeholder's rendering siblings (so the
 * reorder up/down arrows know when to disable themselves).
 *
 * Owns collapse state as a Set<placeholderPath>: presence == collapsed,
 * absence == expanded. Default empty Set means "all expanded". Resets on
 * unmount; not persisted.
 */
export function RenderingsTree({
  nodes, editing, onAdd, onEdit,
  onMoveUp, onMoveDown, onRemove,
}: RenderingsTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return <div className="flex flex-col">{renderChildren(nodes, 0)}</div>;

  function isPlaceholderEmpty(node: TreePlaceholderNode): boolean {
    if (node.children.length === 0) return true;
    for (const c of node.children) {
      if (c.kind === 'rendering') return false;
      if (!isPlaceholderEmpty(c)) return false;
    }
    return true;
  }

  function renderChildren(children: TreeNode[], depth: number) {
    // Pre-filter the rendering siblings within this `children` array so each
    // rendering's isFirst/isLast is correct relative to its siblings (not
    // relative to the whole tree).
    const renderingSiblings = children.filter(
      (c): c is TreeRenderingNode => c.kind === 'rendering',
    );
    return children.map((child, indexInParent) => {
      if (child.kind === 'rendering') {
        const renderingIdx = renderingSiblings.indexOf(child);
        return (
          <Fragment key={child.entry.uid}>
            <RenderingCard
              entry={child.entry}
              isFirst={renderingIdx === 0}
              isLast={renderingIdx === renderingSiblings.length - 1}
              editing={editing}
              depth={depth}
              onEdit={() => onEdit(child.entry.uid)}
              onMoveUp={() => onMoveUp(child.entry.uid)}
              onMoveDown={() => onMoveDown(child.entry.uid)}
              onRemove={() => onRemove(child.entry.uid)}
            />
            {child.children.length > 0 && renderChildren(child.children, depth + 1)}
          </Fragment>
        );
      }
      // child.kind === 'placeholder'
      const isCollapsed = collapsed.has(child.path);
      const hasChildren = child.children.length > 0;
      return (
        <Fragment key={`ph:${child.path}:${indexInParent}`}>
          <PlaceholderTreeRow
            node={child}
            depth={depth}
            collapsed={isCollapsed}
            hasChildren={hasChildren}
            isEmpty={isPlaceholderEmpty(child)}
            editing={editing}
            onToggle={() => toggle(child.path)}
            onAdd={() => onAdd(child.path)}
          />
          {!isCollapsed && renderChildren(child.children, depth + 1)}
        </Fragment>
      );
    });
  }
}
