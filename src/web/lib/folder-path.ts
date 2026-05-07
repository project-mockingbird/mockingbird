/**
 * Containing folder of a host-native filesystem path. Handles both
 * forward-slash (POSIX) and backslash (Windows) separators by stripping
 * trailing characters after the last separator. Returns empty string for
 * empty/undefined input.
 */
export function containingFolder(filePath: string | undefined | null): string {
  if (!filePath) return '';
  const lastFwd = filePath.lastIndexOf('/');
  const lastBack = filePath.lastIndexOf('\\');
  const idx = Math.max(lastFwd, lastBack);
  if (idx <= 0) return filePath;
  return filePath.slice(0, idx);
}
