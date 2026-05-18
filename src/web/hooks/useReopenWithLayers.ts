import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectsStore, type SavedProjectLayer } from '@/state/projectsStore';
import { computeProjectHash } from '@/state/project-hash';
import { workspaceStore } from '@/state/workspaceStore';
import { CONFIG_QUERY_KEY } from '@/hooks/useConfigQuery';

export interface ReopenInput {
  oldHash: string;
  nextLayers: SavedProjectLayer[];
  projectName: string;
}

export interface ReopenWithLayersResult {
  state: string;
  layers: Array<{ name: string; sitecoreJsonPath?: string; color?: string; effectiveCount: number }>;
}

/**
 * Replaces the open project's layer set via the existing /api/projects/open
 * endpoint, then rekeys the projectsStore so the project identity follows
 * the new layer-path hash. Use detectCollision() FIRST to gate against
 * accidentally clobbering another project with the same layer set.
 */
export function useReopenWithLayers() {
  const qc = useQueryClient();

  const mutation = useMutation<ReopenWithLayersResult, Error, ReopenInput>({
    mutationFn: async ({ nextLayers, projectName }) => {
      const res = await fetch('/api/projects/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layers: nextLayers, projectName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as ReopenWithLayersResult;
    },
    onSuccess: async (_data, vars) => {
      const newHash = await computeProjectHash(vars.nextLayers.map((l) => l.sitecoreJsonPath));
      useProjectsStore.getState().rekey(vars.oldHash, newHash, vars.nextLayers, Date.now());
      workspaceStore.reset();
      qc.invalidateQueries({ queryKey: ['status'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
      qc.invalidateQueries({ queryKey: ['children'] });
      qc.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
    },
  });

  /**
   * Pre-flight collision check. Computes the new hash for nextLayers and, if
   * an existing project has the same hash (other than oldHash itself), returns
   * its hash so the caller can prompt the user. No network IO; no mutation.
   */
  async function detectCollision(input: {
    oldHash: string;
    nextLayers: SavedProjectLayer[];
  }): Promise<{ newHash: string; collidingHash: string | null }> {
    const newHash = await computeProjectHash(input.nextLayers.map((l) => l.sitecoreJsonPath));
    if (newHash === input.oldHash) return { newHash, collidingHash: null };
    const colliding = useProjectsStore.getState().get(newHash);
    return { newHash, collidingHash: colliding ? newHash : null };
  }

  return { ...mutation, detectCollision };
}
