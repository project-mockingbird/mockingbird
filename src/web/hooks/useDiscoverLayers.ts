import { useMutation } from '@tanstack/react-query';

export interface ScsConfigCandidate {
  /** Absolute (container-side) path to the sitecore.json. */
  sitecoreJsonPath: string;
  /** Number of modules the file's modules-glob resolves to on disk. */
  moduleCount: number;
  /** Comma-separated summary of allowedPushOperations values seen. */
  pushOpsSummary: string;
}

export interface DiscoverLayersResponse {
  candidates: ScsConfigCandidate[];
}

/**
 * Scans a workspace-relative folder path for sitecore.json-shaped config files.
 * Used by the layer-selection wizard once the user has picked a starting
 * folder via the FolderBrowser.
 */
export function useDiscoverLayers() {
  return useMutation<DiscoverLayersResponse, Error, { path: string }>({
    mutationFn: async ({ path }) => {
      const res = await fetch('/api/projects/discover-layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
  });
}
