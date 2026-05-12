import { useQuery } from '@tanstack/react-query';

export interface FsEntry {
  name: string;
  /** Workspace-relative path; always begins with '/'. */
  path: string;
  isDirectory: boolean;
  hasSitecoreJson: boolean;
}

export interface FsListResponse {
  path: string;
  entries: FsEntry[];
}

/**
 * Lists immediate children of a workspace-relative directory. Path-jailed to
 * MOCKINGBIRD_WORKSPACE_ROOT (default /workspaces) on the server. Pass null
 * to disable the query (e.g. when the folder browser is closed).
 */
export function useFsList(path: string | null) {
  return useQuery<FsListResponse>({
    queryKey: ['fs', 'list', path],
    queryFn: async () => {
      const qs = new URLSearchParams({ path: path ?? '/' });
      const res = await fetch(`/api/fs/list?${qs.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: path !== null,
    staleTime: 0,
  });
}
