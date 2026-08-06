import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Mutation hook for "Refresh" - re-reads an item + on-disk descendants from
 * disk and merges them into the in-memory tree (idempotent via tree.addItem).
 *
 * Invalidates the tree/children/validation queries AND the open detail view's
 * ['item'] + ['template-schema'] queries. A refresh re-reads a whole subtree,
 * so the currently-selected item (or, for a template, one of its field items)
 * may have changed on disk; without invalidating these the detail fields and
 * the Builder keep rendering the stale client-cached copy even though the
 * server re-read from disk. The keys are invalidated as families (no id) so
 * whichever item in the refreshed subtree is open gets refetched.
 */
export function useRefreshItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.refreshItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: ['validation'] });
      qc.invalidateQueries({ queryKey: ['item'] });
      qc.invalidateQueries({ queryKey: ['template-schema'] });
    },
  });
}
