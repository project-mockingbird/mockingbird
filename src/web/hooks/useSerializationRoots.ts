import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface SerializationModule {
  filePath: string;
  namespace: string;
  includes: { name: string; path: string; scope?: string; database?: string }[];
}

export interface AddRootBody {
  path: string;
  database?: string;
  scope?: string;
  name?: string;
  target: { modulePath: string } | { newFile: true };
  dryRun?: boolean;
}

export function useSerializationRoots() {
  return useQuery<{ modules: SerializationModule[] }>({
    queryKey: ['serialization-roots'],
    queryFn: async () => {
      const res = await fetch('/api/serialization-roots');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    },
  });
}

export function useAddSerializationRoot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: AddRootBody) => {
      const res = await fetch('/api/serialization-roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${res.status} ${res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['serialization-roots'] });
    },
  });
}
