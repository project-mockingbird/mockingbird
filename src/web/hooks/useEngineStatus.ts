import { useQuery } from '@tanstack/react-query';

/**
 * Per-layer summary as surfaced via `/api/status.layers`. Mirrors the engine's
 * LayerSpec but with required `color` documented as optional (engine returns
 * undefined when the API consumer didn't pass one). The wizard auto-assigns
 * colors at open time so post-open status snapshots usually carry one.
 */
export interface LayerSummary {
  sitecoreJsonPath?: string;
  name: string;
  color?: string;
  /** Item count attributed to this layer by the engine. Included on all layers
   * returned from /api/status when state is 'ready'. */
  effectiveCount?: number;
}

export interface EngineStatus {
  state: 'initializing' | 'no-project' | 'indexing' | 'ready' | 'error';
  progress: { scanned: number; total: number } | null;
  error: string | null;
  itemCount?: number;
  layers?: LayerSummary[];
  projectName?: string | null;
  registryLoaded?: boolean;
  /**
   * URL template used by the "Open in editor" buttons in QuickInfo and the
   * Raw YAML tab. Server-supplied so MOCKINGBIRD_EDITOR_URL_TEMPLATE only
   * needs to be set in one place. `{path}` is replaced with the host
   * filePath (forward-slash form, URL-encoded).
   */
  editorUrlTemplate?: string;
  cacheStale?: boolean;
  phaseTimings?: Array<{ label: string; durationMs: number; extras?: Record<string, unknown> }>;
  speState?: 'starting' | 'ready' | 'error' | null;
  speError?: string | null;
  speStartedAt?: number | null;
  speReadyAt?: number | null;
  taco?: boolean;
  activeProfile?: { projectHash: string; profileName: string } | null;
}

export function useEngineStatus() {
  return useQuery<EngineStatus>({
    queryKey: ['status'],
    queryFn: async () => {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    refetchInterval: (q) => {
      const data = q.state.data;
      if (data?.state !== 'ready') return 1000;
      if (data.speState === 'starting') return 2000;
      return false;
    },
    retry: false,
  });
}

export function useEngineReady(): boolean {
  const { data } = useEngineStatus();
  return data?.state === 'ready';
}
