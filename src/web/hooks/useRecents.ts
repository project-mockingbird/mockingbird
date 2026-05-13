import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface RecentEntry {
  projectHash: string;
  projectName: string;
  profileName: string;
  lastOpenedAt: string;
  layerColors: string[];
  layerCount: number;
  missing?: boolean;
}

export function useRecents() {
  return useQuery<{ entries: RecentEntry[] }>({
    queryKey: ['recents'],
    queryFn: async () => {
      const res = await fetch('/api/projects/recent');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}

export function useRemoveRecent() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { projectHash: string; profileName: string }>({
    mutationFn: async (body) => {
      const res = await fetch('/api/projects/recent', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recents'] });
    },
  });
}
