import { useQuery } from '@tanstack/react-query';

export interface EngineStatus {
  state: 'initializing' | 'ready' | 'error';
  progress: { scanned: number; total: number } | null;
  error: string | null;
  itemCount?: number;
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
