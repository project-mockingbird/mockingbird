// src/web/hooks/usePackageSourceSize.ts
//
// Fetches the resolved item count for a single (rootItemId, scope) pair.
// Used by CartSourceRow to show "N items" instead of the v1 placeholder.
// Cached per (id, scope) so toggling between scope values reuses prior
// counts; invalidated by the websocket item-event hook on any item change.

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineReady } from '@/hooks/useEngineStatus';

export function usePackageSourceSize(rootItemId: string, scope: string) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['package-source-size', rootItemId, scope],
    queryFn: () => api.getPackageSourceSize(rootItemId, scope),
    enabled: ready && Boolean(rootItemId),
    retry: false,
    staleTime: 60 * 1000,  // 1m: counts shift only on item add/move/remove.
  });
}
