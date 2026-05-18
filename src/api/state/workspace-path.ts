import { resolve, normalize, sep } from 'path';

/**
 * Default container-internal workspace mount path. Used when neither
 * MOCKINGBIRD_WORKSPACE nor MOCKINGBIRD_WORKSPACE_ROOT is set.
 */
export const DEFAULT_WORKSPACE_ROOT = '/workspaces';

/**
 * Resolves the active workspace root from environment, with the canonical
 * fallback. Read at every call site since process.env can change between
 * server boots (tests rely on this).
 */
export function getWorkspaceRoot(): string {
  return process.env.MOCKINGBIRD_WORKSPACE
    ?? process.env.MOCKINGBIRD_WORKSPACE_ROOT
    ?? DEFAULT_WORKSPACE_ROOT;
}

/**
 * Resolves a workspace-relative path to an absolute path inside the workspace
 * root, rejecting any escape attempt. Returns null on invalid input or escape.
 */
export function resolveWorkspacePath(workspaceRoot: string, requested: string): string | null {
  if (typeof requested !== 'string') return null;
  if (!requested.startsWith('/')) return null;
  const candidate = resolve(workspaceRoot, '.' + requested);
  const normalized = normalize(candidate);
  const rootWithSep = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
  if (normalized !== workspaceRoot && !normalized.startsWith(rootWithSep)) return null;
  return normalized;
}
