import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ReorderSiblingsRequest } from '@/lib/types';

/**
 * Mutation hook for reordering a parent's children (Move Up/Down/First/Last and
 * drag-drop). Rewrites __Sortorder server-side; on success invalidates ['tree']
 * and ['children'] so the tree re-renders in the new order.
 */
export function useReorderSiblings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ReorderSiblingsRequest) => api.reorderSiblings(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
    },
  });
}
