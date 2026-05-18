import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspaceStore } from '@/state/workspaceStore';
import { CONFIG_QUERY_KEY } from '@/hooks/useConfigQuery';

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
 * Activates a project with the given layer stack. On success, resets the
 * workspace store (tabs, selection, expanded nodes) to fresh-launch state so
 * stale selections from a previous project do not carry over, then invalidates
 * the status, tree, and children queries so the UI reflects the new engine
 * state without waiting for the next polling tick.
 */
export function useOpenProject() {
  const qc = useQueryClient();
  return useMutation<OpenProjectResponse, Error, { layers: OpenProjectLayer[]; projectName?: string }>({
    mutationFn: async ({ layers, projectName }) => {
      const res = await fetch('/api/projects/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layers,
          ...(projectName !== undefined ? { projectName } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      workspaceStore.reset();
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
    },
  });
}
