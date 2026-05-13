import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLayerState } from '@/state/layerState';
import { workspaceStore } from '@/state/workspaceStore';

interface CloseResponse {
  state: string;
  layers: unknown[];
}

/**
 * Mutation that calls POST /api/projects/close. On success: resets the
 * client-side layerState (visibility, name/color overrides), resets the
 * workspace store (tabs, selection, expanded nodes) to fresh-launch state,
 * and invalidates the status + tree queries so the UI re-renders to
 * no-project state.
 */
export function useCloseProject() {
  const qc = useQueryClient();
  const resetLayers = useLayerState((s) => s.reset);
  return useMutation({
    mutationFn: async (): Promise<CloseResponse> => {
      const res = await fetch('/api/projects/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`close ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      resetLayers();
      workspaceStore.reset();
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
    },
  });
}
