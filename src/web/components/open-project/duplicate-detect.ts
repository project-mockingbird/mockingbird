export interface CandidateWithPath {
  sitecoreJsonPath: string;
}

/**
 * Returns the directory portion of an absolute POSIX-style path.
 * (We work with container-side paths only, so '/' is the separator.)
 */
function dirname(p: string): string {
  const slash = p.lastIndexOf('/');
  if (slash <= 0) return '/';
  return p.slice(0, slash);
}

/**
 * Returns true if `inner` is a descendant of (or equal to) `outer`, where
 * both are POSIX directory paths.
 */
function isDescendantDir(inner: string, outer: string): boolean {
  if (inner === outer) return true;
  return inner.startsWith(outer + '/');
}

/**
 * Detects candidate-overlap by directory containment: a candidate whose
 * directory sits beneath another candidate's directory is treated as
 * overlapping the parent. Returns a map from the OVERLAPPING candidate's
 * sitecoreJsonPath to the list of parent paths it overlaps.
 *
 * Identical paths (rare; could happen if discovery is run twice) do not
 * self-flag.
 */
export function detectOverlaps(
  candidates: ReadonlyArray<CandidateWithPath>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (let i = 0; i < candidates.length; i++) {
    const inner = candidates[i];
    const innerDir = dirname(inner.sitecoreJsonPath);
    const overlaps: string[] = [];
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const outer = candidates[j];
      if (outer.sitecoreJsonPath === inner.sitecoreJsonPath) continue;
      const outerDir = dirname(outer.sitecoreJsonPath);
      // "inner is INSIDE outer" - so outerDir is an ancestor of innerDir,
      // and they are not equal (equal-directory means same root; we treat
      // that as no overlap relationship rather than mutual flagging).
      if (innerDir !== outerDir && isDescendantDir(innerDir, outerDir)) {
        overlaps.push(outer.sitecoreJsonPath);
      }
    }
    if (overlaps.length > 0) {
      result.set(inner.sitecoreJsonPath, overlaps);
    }
  }
  return result;
}
