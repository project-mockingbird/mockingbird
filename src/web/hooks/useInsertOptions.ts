import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineReady } from '@/hooks/useEngineStatus';

/**
 * Fetches Insert Options for an item. Lazy: caller passes `enabled` so the
 * fetch only fires when the Insert submenu actually opens, not on every
 * right-click.
 *
 * Cache key includes `itemId` because the engine's resolution chain reads
 * item-level __Masters override first - two items sharing a template can
 * return different option lists if one of them has the override field.
 */
export function useInsertOptions(itemId: string | null, enabled: boolean) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['insert-options', itemId],
    queryFn: () => api.getInsertOptions(itemId!),
    enabled: ready && enabled && !!itemId,
    staleTime: 30_000,
  });
}
