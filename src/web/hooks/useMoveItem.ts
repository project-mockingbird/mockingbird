import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MoveItemRequest } from '@/lib/types';

/**
 * Mutation hook for "Move to..." - relocates an item subtree to a picked
 * destination, IDs preserved. On success invalidates ['tree'], ['children'],
 * ['validation']. Item refs elsewhere in the content tree that pointed at the moved
 * item by path may now be broken; the periodic validator catches this on its
 * next tick.
 */
export function useMoveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Omit<MoveItemRequest, 'type'>) => api.moveItem(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: ['validation'] });
    },
  });
}
