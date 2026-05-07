import { readFileSync } from 'fs';

/**
 * Translates container-side absolute paths back to the host-side absolute
 * path the operator can paste into Explorer / their editor.
 *
 * Auto-discovery only: parses `/proc/self/mountinfo` once at first call and
 * caches the result. There is no env-var override on purpose - operators
 * should not have to configure this. When discovery cannot run (Linux native
 * via `npm run api`, Windows host without WSL, macOS host without
 * /proc/self/mountinfo, parse failure), every translation call silently
 * returns the input unchanged.
 *
/*
 * Four supported source-path shapes (longest-prefix wins among bind mounts):
 *
 *   - Docker Desktop on Windows (Hyper-V backend, classic):
 *     `/run/desktop/mnt/host/<drive>/...` -> `<Drive>:\...` with backslashes.
 *     The mountinfo source path is the Linux-formatted view of the Windows
 *     host bind, so we have to rewrite it to a real Windows path.
 *   - Docker Desktop on Windows (WSL2 backend, modern default):
 *     fstype `9p`, source field is a 9p tag like `C:\134` (Docker-internal id,
 *     NOT a host path). Real host root lives in super-options as `path=...`,
 *     and field 4 (root) carries the host subpath under that root. We
 *     synthesize a real host path by combining `path=<value>` with the root
 *     field, converting forward slashes to backslashes for Windows roots.
 *   - Docker Desktop on macOS: `/Users/<name>/...`
 *     -> already a real host path, used verbatim.
 *   - Linux native containers: `/srv/...` etc.
 *     -> already a real host path, used verbatim.
 *
 * Anything that doesn't match a known rewrite is treated as already
 * host-formatted and passed through untouched.
 */

export interface MountEntry {
  mountPoint: string;
  source: string;
}

/**
 * Parses `/proc/self/mountinfo` text. Each non-blank line has the shape:
 *
 *   id parent major:minor root mountPoint options [optional-fields ...] - fsType source superOptions
 *
 * The optional-fields slot is variable length, terminated by a literal `-`.
 * Lines without a `-` separator are skipped as malformed.
 *
 * Special case for `9p` filesystems (Docker Desktop on Windows with the WSL2
 * backend): the `source` field is the 9p tag, not a host path. The real host
 * root lives in super-options as `path=<value>`; the field-4 root carries the
 * host subpath. When `path=` is absent we treat the line as unusable and
 * skip it rather than expose the meaningless 9p tag downstream.
 */
export function parseMountInfo(text: string): MountEntry[] {
  const entries: MountEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    const dashIndex = fields.indexOf('-');
    if (dashIndex < 0) continue;
    // Field 4 (index 3) is the mount root within the source.
    const root = fields[3];
    // Field 5 (index 4) is the mount point.
    const mountPoint = fields[4];
    // After the dash: [fsType, source, superOptions].
    const fsType = fields[dashIndex + 1];
    const rawSource = fields[dashIndex + 2];
    const superOpts = fields[dashIndex + 3];
    if (!mountPoint) continue;

    if (fsType === '9p') {
      const hostRoot = parsePathFromSuperOptions(superOpts);
      if (!hostRoot) continue;
      entries.push({ mountPoint, source: combineHostRootAndSubpath(hostRoot, root) });
      continue;
    }

    if (!rawSource) continue;
    // Synthetic mount sources (overlay, tmpfs, proc, sysfs, cgroup, devpts,
    // mqueue, ...) place the fsType name in `source` rather than a host path.
    // The root overlayfs in particular would otherwise become a longest-prefix
    // fallback for any container path that's outside every real bind mount,
    // producing nonsense like `overlay/app/data/...`. A real host path always
    // starts with `/`. The 9p special case above already handled its own
    // non-path source via super-options.
    if (!rawSource.startsWith('/')) continue;
    entries.push({ mountPoint, source: rawSource });
  }
  return entries;
}

/**
 * Extracts the value of `path=...` from a 9p super-options string. The
 * separators are a mix of `,` and `;`; we accept either as a token boundary.
 * Returns null when no `path=` token is present.
 */
function parsePathFromSuperOptions(superOpts: string | undefined): string | null {
  if (!superOpts) return null;
  const m = /(?:^|[,;])path=([^,;]*)/.exec(superOpts);
  return m ? m[1] : null;
}

/**
 * Joins the 9p `path=` host root with the field-4 root. If the host root is
 * Windows-shaped (drive letter + colon), the subpath's forward slashes are
 * converted to backslashes; otherwise the subpath is appended verbatim. A
 * subpath of `/` (the typical no-subpath case) is treated as empty.
 */
function combineHostRootAndSubpath(hostRoot: string, subpath: string): string {
  const isWindows = /^[A-Za-z]:/.test(hostRoot);
  const trimmed = isWindows ? hostRoot.replace(/\\+$/, '') : hostRoot.replace(/\/+$/, '');
  if (!subpath || subpath === '/') return trimmed;
  return isWindows ? trimmed + subpath.replace(/\//g, '\\') : trimmed + subpath;
}

const DOCKER_DESKTOP_WINDOWS_PREFIX = /^\/run\/desktop\/mnt\/host\/([a-zA-Z])(\/|$)/;

/**
 * Rewrites a Docker-Desktop-on-Windows-shaped Linux source path to a real
 * Windows path. Returns the input unchanged if the prefix doesn't match.
 */
function hostFormatSource(source: string): string {
  const match = DOCKER_DESKTOP_WINDOWS_PREFIX.exec(source);
  if (!match) return source;
  const drive = match[1].toUpperCase();
  // Drop `/run/desktop/mnt/host/<drive>` (length = 22 + 1 for the letter).
  // The `(\/|$)` group is a lookahead-style boundary, not consumed for `$`
  // and consumed as `/` otherwise; either way the prefix to strip is fixed.
  const prefixLen = `/run/desktop/mnt/host/${match[1]}`.length;
  const remainder = source.slice(prefixLen);
  const tail = remainder.replace(/\//g, '\\');
  if (tail.length === 0) return `${drive}:`;
  // remainder always starts with `/` if non-empty (because the boundary was
  // `/`), so tail starts with `\`.
  return `${drive}:${tail}`;
}

/**
 * Joins a (possibly-rewritten-to-Windows) host source with a forward-slash
 * tail from the container path. If the source looks Windows-shaped (drive
 * letter + colon), the tail's slashes are converted to backslashes.
 */
function joinHostPath(hostSource: string, tail: string): string {
  if (tail === '') return hostSource;
  const isWindows = /^[A-Z]:/.test(hostSource);
  if (isWindows) {
    const winTail = tail.replace(/\//g, '\\');
    if (hostSource.endsWith('\\') || winTail.startsWith('\\')) return hostSource + winTail;
    return `${hostSource}\\${winTail}`;
  }
  if (hostSource.endsWith('/') || tail.startsWith('/')) return hostSource + tail;
  return `${hostSource}/${tail}`;
}

/**
 * Pure translation. Given a container-side absolute path and the parsed
 * mountinfo entries, finds the longest-prefix mount and rewrites the
 * container prefix to the host source. Returns input unchanged on no match.
 *
 * Prefix matching is path-segment aware: `/app/data` does NOT match
 * `/app/datastore/x` even though the latter starts with the former.
 */
export function translateContainerToHostPath(
  containerPath: string,
  mounts: MountEntry[],
): string {
  if (!containerPath) return containerPath;
  let best: MountEntry | undefined;
  for (const m of mounts) {
    if (!isPathPrefix(m.mountPoint, containerPath)) continue;
    if (!best || m.mountPoint.length > best.mountPoint.length) best = m;
  }
  if (!best) return containerPath;
  const tail = containerPath.slice(best.mountPoint.length).replace(/^\/+/, '');
  const hostSource = hostFormatSource(best.source);
  return joinHostPath(hostSource, tail);
}

function isPathPrefix(mountPoint: string, candidate: string): boolean {
  if (candidate === mountPoint) return true;
  if (!candidate.startsWith(mountPoint)) return false;
  // Either the mount point ends in `/` (so any next char is fine) or the
  // very next character of the candidate must be a `/`.
  if (mountPoint.endsWith('/')) return true;
  return candidate.charAt(mountPoint.length) === '/';
}

// Cache + reader injection point. The reader can be swapped in tests by
// passing a custom function to toHostPathWithReader; production code uses
// toHostPath which reads /proc/self/mountinfo via fs.readFileSync.
let cachedMounts: MountEntry[] | null = null;

function defaultMountInfoReader(): string | null {
  try {
    return readFileSync('/proc/self/mountinfo', 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Internal helper for tests: lets a fake reader inject mountinfo text.
 * Bypasses the module-level cache.
 */
export function toHostPathWithReader(
  containerPath: string,
  reader: () => string | null,
): string {
  const text = reader();
  if (text === null) return containerPath;
  const mounts = parseMountInfo(text);
  return translateContainerToHostPath(containerPath, mounts);
}

/**
 * Cached helper: reads /proc/self/mountinfo on first call, caches the parsed
 * mount list, and translates `containerPath` through it. Returns the input
 * unchanged when mountinfo cannot be read or no entry matches.
 */
export function toHostPath(containerPath: string): string {
  if (!containerPath) return containerPath;
  if (cachedMounts === null) {
    const text = defaultMountInfoReader();
    cachedMounts = text === null ? [] : parseMountInfo(text);
  }
  return translateContainerToHostPath(containerPath, cachedMounts);
}

/** Test-only: clears the cached mountinfo so the next call re-reads. */
export function _resetHostPathCacheForTest(): void {
  cachedMounts = null;
}
