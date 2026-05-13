import { useQuery, useMutation } from '@tanstack/react-query';
import type { SavedProject } from '@/state/projectsStore';

export interface MockingbirdConfig {
  version: 1;
  projects: Record<string, SavedProject>;
}

const CONFIG_QUERY_KEY = ['config', 'mockingbird'] as const;

async function fetchConfig(): Promise<MockingbirdConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`GET /api/config ${res.status}`);
  return res.json();
}

async function putConfig(config: MockingbirdConfig): Promise<void> {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`PUT /api/config ${res.status}`);
}

export function useConfigQuery() {
  return useQuery<MockingbirdConfig>({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: fetchConfig,
    staleTime: Infinity,
    retry: false,
  });
}

export function useConfigMutation() {
  return useMutation({
    mutationFn: putConfig,
  });
}

export { CONFIG_QUERY_KEY };
