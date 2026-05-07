import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Mutation hook for "Refresh" - re-reads an item + on-disk descendants from
 * disk and merges them into the in-memory tree (idempotent via tree.addItem).
 * On success invalidates ['tree'], ['children'], ['validation'].
 */
export function useRefreshItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.refreshItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: ['validation'] });
    },
  });
}
