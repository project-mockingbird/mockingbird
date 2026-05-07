// src/web/components/detail/field-editors/renderings/RenderingsList.tsx

import { useMemo } from 'react';
import { RenderingsTree } from './RenderingsTree';
import { buildTree } from './tree-builder';
import { usePlaceholderPaths } from './hooks';
import type { RenderingEntry } from './types';

interface RenderingsListProps {
  entries: RenderingEntry[];
  pageItemId: string;
  editing: boolean;
  onAdd: (placeholder: string) => void;
  onEdit: (uid: string) => void;
  onMoveUp: (uid: string) => void;
  onMoveDown: (uid: string) => void;
  onRemove: (uid: string) => void;
}

export function RenderingsList({
  entries, pageItemId, editing, onAdd,
  onEdit, onMoveUp, onMoveDown, onRemove,
}: RenderingsListProps) {
  const { data: placeholderPathsResp } = usePlaceholderPaths(pageItemId);

  const tree = useMemo(() => {
    const discoveredPaths = (placeholderPathsResp?.paths ?? [])
      .filter(p => !p.isTokenForm)
      .map(p => ({ value: p.value, ownerUid: p.ownerUid }));
    return buildTree({ entries, discoveredPaths });
  }, [entries, placeholderPathsResp]);

  if (tree.length === 0) {
    return <div className="text-xs text-muted-foreground italic py-2">No placeholders.</div>;
  }

  return (
    <RenderingsTree
      nodes={tree}
      editing={editing}
      onAdd={onAdd}
      onEdit={onEdit}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onRemove={onRemove}
    />
  );
}
