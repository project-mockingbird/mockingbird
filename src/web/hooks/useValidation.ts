import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineReady } from '@/hooks/useEngineStatus';

export function useValidation() {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['validation'],
    queryFn: () => api.validate(),
    refetchInterval: false,
    enabled: ready,
    retry: false,
  });
}

export function useFieldTypes() {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['fieldTypes'],
    queryFn: () => api.getFieldTypes(),
    staleTime: Infinity,
    enabled: ready,
    retry: false,
  });
}
