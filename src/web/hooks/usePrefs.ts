import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Prefs {
  autoRestoreLastSession: boolean;
}

export function usePrefs() {
  return useQuery<Prefs>({
    queryKey: ['prefs'],
    queryFn: async () => {
      const res = await fetch('/api/prefs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}

export function useUpdatePrefs() {
  const qc = useQueryClient();
  return useMutation<Prefs, Error, Partial<Prefs>>({
    mutationFn: async (patch) => {
      const res = await fetch('/api/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(['prefs'], data);
    },
  });
}
