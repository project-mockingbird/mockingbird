import { useQuery } from '@tanstack/react-query';

export interface FsDirectoryEntry {
  name: string;
  /** Workspace-relative path; always begins with '/'. */
  path: string;
  isDirectory: true;
  hasSitecoreJson: boolean;
  kind: 'directory';
}

export interface FsConfigFileEntry {
  name: string;
  path: string;
  isDirectory: false;
  hasSitecoreJson: false;
  kind: 'config-file';
  moduleCount: number;
  pushOpsSummary: string;
}

export type FsEntry = FsDirectoryEntry | FsConfigFileEntry;

export interface FsListResponse {
  path: string;
  entries: FsEntry[];
}

export interface UseFsListOptions {
  /**
   * When true, the API includes JSON files at the level whose content matches
   * the SCS root-config shape. Each file entry carries `kind: 'config-file'`,
   * moduleCount, and pushOpsSummary. When false or unset, only directories.
   */
  includeFiles?: boolean;
}

/**
 * Lists immediate children of a workspace-relative directory. Path-jailed to
 * MOCKINGBIRD_WORKSPACE_ROOT (default /workspaces) on the server. Pass null
 * to disable the query (e.g. when the folder browser is closed).
 */
export function useFsList(path: string | null, options?: UseFsListOptions) {
  const includeFiles = options?.includeFiles === true;
  return useQuery<FsListResponse>({
    queryKey: ['fs', 'list', path, includeFiles],
    queryFn: async () => {
      const qs = new URLSearchParams({
        path: path ?? '/',
        includeFiles: String(includeFiles),
      });
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
