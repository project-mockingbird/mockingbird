import { resolve, normalize, sep } from 'path';

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
