import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Mutation hook for "Rename" - changes an item's last-path-segment, IDs
 * preserved. On success invalidates ['tree'], ['children'], ['validation'].
 * Item refs elsewhere in the content tree that pointed at the renamed item by
 * path may now be broken; the periodic validator catches this on its next
 * tick (same trade-off as Move).
 */
export function useRenameItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { itemId: string; newName: string }) =>
      api.renameItem(req.itemId, req.newName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: ['validation'] });
    },
  });
}
