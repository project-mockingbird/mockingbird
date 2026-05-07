import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEngineReady } from '@/hooks/useEngineStatus';
import type { CreateItemRequest, UpdateItemRequest, TrimVersionsRequest } from '@/lib/types';

export function useTree(database: string = 'master') {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['tree', database],
    queryFn: () => api.getTree(database),
    enabled: ready,
    retry: false,
  });
}

export function useChildren(parentId: string | null, database: string = 'master') {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['children', parentId, database],
    queryFn: () => api.getChildren(parentId!, database),
    enabled: ready && !!parentId,
    retry: false,
  });
}

export function useAncestors(id: string | null) {
  const ready = useEngineReady();
  return useQuery({
    queryKey: ['ancestors', id],
    queryFn: () => api.getAncestors(id!),
    enabled: ready && !!id,
    retry: false,
    staleTime: 60_000,
  });
}

export function useLookupSource(source: string, contextId: string | undefined) {
  const ready = useEngineReady();
  const trimmed = source.trim();
  return useQuery({
    queryKey: ['lookup-source', trimmed, contextId ?? null],
    queryFn: () => api.getLookupSource(trimmed, contextId),
    enabled: ready && trimmed !== '',
    retry: false,
    staleTime: 30_000,
  });
}

export function useDatabases() {
  return useQuery({ queryKey: ['databases'], queryFn: () => api.getDatabases(), staleTime: Infinity });
}

export function useItem(id: string | null) {
  return useQuery({ queryKey: ['item', id], queryFn: () => api.getItem(id!), enabled: !!id });
}

export function useItemByPath(path: string | null) {
  return useQuery({ queryKey: ['item-by-path', path], queryFn: () => api.getItemByPath(path!), enabled: !!path });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemRequest) => api.createItem(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tree'] }); qc.invalidateQueries({ queryKey: ['validation'] }); },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateItemRequest }) => api.updateItem(id, data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['item', v.id] }); qc.invalidateQueries({ queryKey: ['tree'] }); qc.invalidateQueries({ queryKey: ['validation'] }); },
  });
}

export function useTrimVersions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TrimVersionsRequest }) => api.trimVersions(id, data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['item', v.id] }); qc.invalidateQueries({ queryKey: ['validation'] }); },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tree'] }); qc.invalidateQueries({ queryKey: ['validation'] }); },
  });
}

export function useTemplateSchema(itemId: string | null) {
  return useQuery({
    queryKey: ['template-schema', itemId],
    queryFn: () => api.getTemplateSchema(itemId!),
    enabled: !!itemId,
    staleTime: Infinity,
  });
}
