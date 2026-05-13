/**
 * Client-side mirror of src/api/project-hash.ts. Produces the same 12-char
 * sha1 prefix so localStorage entries are keyed identically to whatever the
 * server's index-cache uses on disk.
 *
 * Order-independent (paths are sorted first). Workspace-relative.
 */
export async function computeProjectHash(workspaceRelativePaths: string[]): Promise<string> {
  if (workspaceRelativePaths.length === 0) {
    throw new Error('computeProjectHash requires at least one path');
  }
  const sorted = [...workspaceRelativePaths].sort();
  const text = sorted.join('\n');
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 12);
}
