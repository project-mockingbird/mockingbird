// Build the URL that the "Open in editor" buttons hand off to the OS
// protocol handler. Inputs:
//
//   template  - e.g. `vscode://file/{path}` (default) or
//               `idea://open?file={path}` (operator override via
//               MOCKINGBIRD_EDITOR_URL_TEMPLATE).
//   hostPath  - the on-disk path of the YAML file. Comes back from the API
//               already translated to host-side via the #29 mountinfo
//               auto-discovery (Windows: `C:\projects\foo\bar.yml`,
//               macOS / Linux: native paths).
//
// VS Code's vscode://file/ scheme accepts forward slashes on every platform
// and rejects backslashes - so we always normalise. The path also gets
// URL-encoded so spaces and other special characters survive the handoff
// to the OS protocol handler intact.
export function buildEditorUrl(template: string, hostPath: string): string {
  if (!hostPath) return '';
  const forwardSlashed = hostPath.replace(/\\/g, '/');
  const encoded = encodeURI(forwardSlashed);
  return template.replace('{path}', encoded);
}

export const DEFAULT_EDITOR_URL_TEMPLATE = 'vscode://file/{path}';
