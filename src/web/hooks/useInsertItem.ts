import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { InsertItemRequest } from '@/lib/types';

/**
 * Mutation hook for creating a new item from a template (single-template
 * insert path; branch instantiation lands in Phase 5 and uses the same
 * endpoint, so no caller-side change needed when that ships).
 *
 * On success, invalidates: ['tree'] (new item visible), ['validation']
 * (engine validators may have changed), and ['insert-options'] (parent's
 * options may have changed if the new item itself becomes a Master target).
 */
export function useInsertItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: InsertItemRequest) => api.insertItem(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['validation'] });
      qc.invalidateQueries({ queryKey: ['insert-options'] });
    },
  });
}
