import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineReady } from '@/hooks/useEngineStatus';

export function useDescendants(path: string | null) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['descendants', path],
    queryFn: () => api.getDescendants(path!),
    enabled: ready && path !== null,
    retry: false,
    staleTime: 60_000,
  });
}
