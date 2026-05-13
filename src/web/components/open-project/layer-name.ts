/**
 * Derives a human-readable layer name from the parent folder of a sitecore.json path.
 * e.g. "/workspaces/repo/authoring/sitecore.json" -> "authoring"
 */
export function deriveName(sitecoreJsonPath: string): string {
  const trimmed = sitecoreJsonPath.replace(/\/[^/]+$/, '');
  const slash = trimmed.lastIndexOf('/');
  if (slash < 0) return 'layer';
  const parent = trimmed.slice(slash + 1);
  return parent.length > 0 ? parent : 'layer';
}
