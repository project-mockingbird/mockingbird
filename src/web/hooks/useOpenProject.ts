import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface OpenProjectLayer {
  sitecoreJsonPath: string;
  name: string;
  color?: string;
}

export interface OpenProjectResponse {
  state: string;
  layers: OpenProjectLayer[];
}

/**
 * Activates a project with the given layer stack. On success, invalidates the
 * status, tree, and children queries so the UI reflects the new engine state
 * without waiting for the next polling tick.
 */
export function useOpenProject() {
  const qc = useQueryClient();
  return useMutation<OpenProjectResponse, Error, { layers: OpenProjectLayer[] }>({
    mutationFn: async ({ layers }) => {
      const res = await fetch('/api/projects/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
    },
  });
}
