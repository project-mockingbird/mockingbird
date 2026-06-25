// src/web/components/detail/field-editors/renderings/hooks.ts

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineReady } from '@/hooks/useEngineStatus';

export function useRenderingMeta(id: string | undefined) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['rendering-meta', id ?? null],
    queryFn: () => api.getRenderingMeta(id!),
    enabled: ready && !!id,
    retry: false,
    staleTime: 60_000,
  });
}

export function useCompatibleRenderings(placeholder: string | undefined, pageItemId: string | undefined) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['compatible-renderings', placeholder ?? null, pageItemId ?? null],
    queryFn: () => api.getCompatibleRenderings(placeholder!, pageItemId!),
    enabled: ready && !!placeholder && !!pageItemId,
    retry: false,
    staleTime: 60_000,
  });
}

export function useAllRenderings() {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['all-renderings'],
    queryFn: () => api.getAllRenderings(),
    enabled: ready,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRenderingParametersSchema(id: string | undefined) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['rendering-parameters-schema', id ?? null],
    queryFn: () => api.getRenderingParametersSchema(id!),
    enabled: ready && !!id,
    retry: false,
    staleTime: Infinity,  // schema is template-driven; only changes if the template changes.
  });
}

export function usePlaceholderPaths(itemId: string | undefined, language: string = 'en') {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['placeholder-paths', itemId ?? null, language],
    queryFn: () => api.getPlaceholderPaths(itemId!, language),
    enabled: ready && !!itemId,
    retry: false,
    staleTime: 30_000,  // page can be re-edited; don't cache forever.
  });
}

export function useComposedLayout(itemId: string | undefined, language: string = 'en') {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['composed-layout', itemId ?? null, language],
    queryFn: () => api.getComposedLayout(itemId!, language),
    enabled: ready && !!itemId,
    retry: false,
    staleTime: 30_000,  // page can be re-edited; don't cache forever.
  });
}

export function useSxaVariants(renderingId: string | undefined) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['sxa-variants', renderingId ?? null],
    queryFn: () => api.getSxaVariants(renderingId!),
    enabled: ready && !!renderingId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSxaStyleOptions(renderingId: string | undefined) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['sxa-style-options', renderingId ?? null],
    queryFn: () => api.getSxaStyleOptions(renderingId!),
    enabled: ready && !!renderingId,
    retry: false,
    staleTime: Infinity,
  });
}

export function useSxaGridOptions() {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['sxa-grid-options'],
    queryFn: () => api.getSxaGridOptions(),
    enabled: ready,
    retry: false,
    staleTime: Infinity,
  });
}
