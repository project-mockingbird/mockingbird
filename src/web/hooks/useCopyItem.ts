import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CopyItemRequest } from '@/lib/types';

/**
 * Mutation hook for "Copy to..." - deep-copies an item subtree to a picked
 * destination. On success invalidates ['tree'], ['children'], ['validation'].
 */
export function useCopyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Omit<CopyItemRequest, 'type'>) => api.copyItem(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: ['validation'] });
    },
  });
}
