import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ProfileLayer {
  sitecoreJsonPath: string;
  name: string;
  color: string;
  allowedPushOperations?: 'CreateOnly' | 'CreateAndUpdate' | 'CreateUpdateAndDelete';
}

export interface Profile {
  name: string;
  projectName: string;
  layers: ProfileLayer[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSummary {
  name: string;
  projectName: string;
  layerCount: number;
  updatedAt: string;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function useProfiles(projectHash: string | null | undefined) {
  return useQuery<{ profiles: ProfileSummary[] }>({
    queryKey: ['profiles', projectHash],
    enabled: !!projectHash,
    queryFn: () => fetchJson(`/api/profiles?projectHash=${encodeURIComponent(projectHash!)}`),
  });
}

export function useUpsertProfile() {
  const qc = useQueryClient();
  return useMutation<
    { profile: Profile },
    Error,
    { projectHash: string; name: string; projectName: string; layers: ProfileLayer[] }
  >({
    mutationFn: (body) =>
      fetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['profiles', vars.projectHash] });
      qc.invalidateQueries({ queryKey: ['recents'] });
    },
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, { projectHash: string; name: string }>({
    mutationFn: ({ projectHash, name }) =>
      fetchJson(
        `/api/profiles?projectHash=${encodeURIComponent(projectHash)}&name=${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['profiles', vars.projectHash] });
      qc.invalidateQueries({ queryKey: ['recents'] });
    },
  });
}

export function useRenameProfile() {
  const qc = useQueryClient();
  return useMutation<
    { profile: Profile },
    Error,
    { projectHash: string; oldName: string; newName: string }
  >({
    mutationFn: (body) =>
      fetchJson('/api/profiles/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['profiles', vars.projectHash] });
      qc.invalidateQueries({ queryKey: ['recents'] });
    },
  });
}

export function useProfile(
  projectHash: string | null | undefined,
  name: string | null | undefined,
) {
  return useQuery<{ profile: Profile }>({
    queryKey: ['profile', projectHash, name],
    enabled: !!projectHash && !!name,
    queryFn: () =>
      fetchJson(
        `/api/profiles/${encodeURIComponent(projectHash!)}/${encodeURIComponent(name!)}`,
      ),
  });
}
