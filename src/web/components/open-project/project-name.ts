/**
 * Derives a default project name from a list of sitecore.json paths.
 *
 * Heuristic:
 * - No paths: "project"
 * - Single path at workspace root ("/sitecore.json"): "project"
 * - Single path at "/<name>/sitecore.json": "<name>"
 * - Multiple paths: longest common path segment basename
 *   e.g. ["/proj/authoring/sitecore.json", "/proj/content/sitecore.json"] -> "proj"
 */
export function deriveProjectName(sitecoreJsonPaths: string[]): string {
  if (sitecoreJsonPaths.length === 0) return 'project';

  if (sitecoreJsonPaths.length === 1) {
    // Strip the filename, then take the parent directory name.
    const withoutFile = sitecoreJsonPaths[0].replace(/\/[^/]+$/, '');
    const slash = withoutFile.lastIndexOf('/');
    const parent = slash >= 0 ? withoutFile.slice(slash + 1) : withoutFile;
    return parent.length > 0 ? parent : 'project';
  }

  // Multiple paths: find the longest common path prefix, then take its basename.
  const parts = sitecoreJsonPaths.map((p) => p.replace(/\/[^/]+$/, '').split('/').filter(Boolean));
  const minLen = Math.min(...parts.map((p) => p.length));

  let commonLen = 0;
  for (let i = 0; i < minLen; i++) {
    const segment = parts[0][i];
    if (parts.every((p) => p[i] === segment)) {
      commonLen = i + 1;
    } else {
      break;
    }
  }

  if (commonLen === 0) return 'project';
  const commonBasename = parts[0][commonLen - 1];
  return commonBasename.length > 0 ? commonBasename : 'project';
}
