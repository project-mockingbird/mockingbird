import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DuplicateItemRequest } from '@/lib/types';

/**
 * Mutation hook for duplicating an item. On success invalidates ['tree']
 * (new item visible) and ['validation'] (engine validators may have
 * changed). Does NOT invalidate ['insert-options'] - Duplicate doesn't
 * change the parent's __Masters cascade.
 */
export function useDuplicateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: DuplicateItemRequest) => api.duplicateItem(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      // Tree rendering uses useChildren keyed ['children', parentId,
      // database]. Without invalidating that prefix, the new sibling
      // doesn't appear until WebSocket round-trip or a hard refresh.
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: ['validation'] });
    },
  });
}
