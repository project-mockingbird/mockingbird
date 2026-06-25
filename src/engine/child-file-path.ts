import { join, dirname, resolve } from 'path';
import { createHash } from 'crypto';
import type { ModuleConfig, ModuleInclude } from './types.js';

/**
 * SCS-parity port of the `SubtreeFilesystemPathProvider` path-computation
 * pipeline used by `dotnet sitecore` and the older Rainbow serializer to
 * place item YAMLs on disk.
 *
 * Reference (decompile):
 *   `Sitecore.DevEx.Serialization.Client.decompiled.cs:5089` (`GetPhysicalPathForItemPath`)
 *   - 5121 (`ProcessItemPathToPhysicalRelativePath`)
 *   - 5136 (`ConvertSubtreeRelativeItemPathToPhysicalPath`)
 *   - 5143 (`ConvertItemPathSegmentToValidFilesystemPathSegment`)
 *   - 5172 (`CreatePathAliases`) / 5185 (`TryApplyPathAliases`)
 *   - 5214 (`ComputePathHash`)
 *   - 5221 (`ApplyPathLengthHashes`)
 *
 * Why this exists: Mockingbird's `Engine.resolveFilePath` walks
 * `engine.modules` in iteration order and the first prefix-match wins,
 * which both (a) misroutes new YAMLs to the wrong serialization root in
 * multi-root setups and (b) produces a non-SCS deep-nested layout
 * (`<...>/<name>/<name>.yml`). Real SCS exports place items
 * sibling-style (`<...>/<name>.yml` + `<...>/<name>/`); this port mirrors
 * SCS exactly so on-disk shapes from Mockingbird-authored writes are
 * indistinguishable from `dotnet sitecore push` output.
 */

/** SCS substitution char for invalid characters AND reserved filenames. */
const SUBSTITUTE_CHAR = '#';

/** SHA256 truncation length used for tail-hashing too-long paths. */
const HASH_LENGTH = 16;

/**
 * SCS default when the FilesystemTreeSpec doesn't override
 * `MaxRelativePathLength`. The unit is total length of the joined
 * relative path string (segment chars + separators), per
 * `ItemPath.PathLength`:
 *   `_pathSegments.Sum(s => s.Length) + _pathSegments.Count`
 */
export const DEFAULT_MAX_RELATIVE_PATH_LENGTH = 120;

/**
 * Filesystem-invalid characters per SCS `_invalidFileNameCharacters`
 * (decompile line 5033). 42 entries: `"<>|`, all ASCII control chars
 * 0x00-0x1F, plus `:*?\/$`.
 */
const INVALID_FILE_NAME_CHARS: ReadonlySet<string> = (() => {
  const chars = new Set<string>(['"', '<', '>', '|', ':', '*', '?', '\\', '/', '$']);
  for (let i = 0; i <= 0x1f; i++) chars.add(String.fromCharCode(i));
  return chars;
})();

/**
 * Reserved Windows filenames per SCS `_invalidFileNames` (decompile line
 * 5042). Compared case-insensitively. SCS prepends `#` when an encoded
 * segment matches one of these.
 */
const INVALID_FILE_NAMES: ReadonlySet<string> = new Set<string>([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/**
 * Port of SCS `ConvertItemPathSegmentToValidFilesystemPathSegment`
 * (decompile line 5143).
 *
 *   1. Strip leading and trailing spaces.
 *   2. Replace each invalid filename char with `#`.
 *   3. If the resulting segment is a reserved Windows filename
 *      (case-insensitive), prepend `#` to keep the filesystem happy.
 */
export function encodeSegment(name: string): string {
  let trimmed = name;
  while (trimmed.startsWith(' ')) trimmed = trimmed.slice(1);
  while (trimmed.endsWith(' ')) trimmed = trimmed.slice(0, -1);
  let encoded = '';
  for (const ch of trimmed) {
    encoded += INVALID_FILE_NAME_CHARS.has(ch) ? SUBSTITUTE_CHAR : ch;
  }
  if (INVALID_FILE_NAMES.has(encoded.toLowerCase())) {
    encoded = SUBSTITUTE_CHAR + encoded;
  }
  return encoded;
}

/**
 * Resolved tree-spec context for SCS path computation. Bundles every
 * field `computePhysicalPath` reads, decoupling it from `Engine`.
 */
export interface TreeSpecContext {
  /** Sitecore item path covered by the include (e.g., `/sitecore/content/Site/Home`). */
  includePath: string;
  /** Absolute on-disk root (e.g., `<modDir>/items/home`). */
  physicalPath: string;
  /**
   * Aliases extracted from the include's rules where `alias` is set.
   * `rulePath` is the Sitecore path; `aliasPath` is the on-disk-relative
   * substitute (always single-segment in current SCS, but represented as
   * a path so future multi-segment aliases drop in cleanly).
   */
  aliases: ReadonlyArray<{ rulePath: string; aliasPath: string }>;
  /** Tail-hash kicks in when relative path length exceeds this. */
  maxRelativePathLength: number;
}

/** Split a Sitecore-style path into its non-empty segments. */
function splitSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** Total path-string length matching SCS `ItemPath.PathLength`. */
function pathLength(segments: ReadonlyArray<string>): number {
  return segments.reduce((sum, s) => sum + s.length, 0) + segments.length;
}

/** Hash the joined path string and return the 16-char upper-case prefix. */
function computePathHashSegment(segments: ReadonlyArray<string>): string {
  const joined = '/' + segments.join('/');
  const hex = createHash('sha256').update(joined, 'utf8').digest('hex');
  return hex.slice(0, HASH_LENGTH).toUpperCase();
}

/**
 * Port of SCS `ApplyPathLengthHashes` (decompile line 5221).
 *
 * Operates on the leaf-prepended subtree-relative segments. The leaf
 * itself is excluded from the length budget (matches `Skip(1)`); only
 * descendants count toward the limit.
 *
 * Walks up parents until the truncated prefix's joined-string length
 * fits in the budget, then replaces that prefix with a 16-char SHA256
 * tail hash. The leaf-prepend is preserved verbatim.
 */
function applyPathLengthHash(
  subtreeRelative: ReadonlyArray<string>,
  maxRelativePathLength: number,
): string[] {
  if (subtreeRelative.length === 0) return [];
  const leaf = subtreeRelative[0];
  const beyondLeaf = subtreeRelative.slice(1);
  const originalPathLength = pathLength(beyondLeaf);
  if (originalPathLength <= maxRelativePathLength) {
    return [...subtreeRelative];
  }
  if (maxRelativePathLength < HASH_LENGTH) {
    throw new Error(
      `MaxRelativePathLength ${maxRelativePathLength} is below the minimum (${HASH_LENGTH}).`,
    );
  }
  // SCS line 5236-5245: target = floor(originalPL/max); pop tail
  // segments until the kept prefix's ratio drops AT or below target.
  // Hash the kept prefix; append the popped suffix verbatim.
  const targetRatio = Math.floor(originalPathLength / maxRelativePathLength);
  let truncated: string[] = [...beyondLeaf];
  let currentRatio = originalPathLength / maxRelativePathLength;
  while (truncated.length > 0 && currentRatio > targetRatio) {
    truncated = truncated.slice(0, -1);
    currentRatio = truncated.length > 0
      ? pathLength(truncated) / maxRelativePathLength
      : 0;
  }
  if (truncated.length === 0) {
    throw new Error(
      `Path length ${originalPathLength} cannot be reduced below ${maxRelativePathLength}.`,
    );
  }
  const keptTail = beyondLeaf.slice(truncated.length);
  return [leaf, computePathHashSegment(truncated), ...keptTail];
}

/**
 * Port of SCS `TryApplyPathAliases` (decompile line 5185). Walks up the
 * subtree-relative path until a rule's path matches, then rebuilds the
 * relative path with the alias substituted in.
 *
 * Returns null when no alias rule matches; the caller should fall back
 * to leaf-prepend behavior.
 */
function tryApplyPathAlias(
  subtreeRelative: ReadonlyArray<string>,
  itemSegments: ReadonlyArray<string>,
  aliases: ReadonlyArray<{ rulePath: string; aliasPath: string }>,
): string[] | null {
  if (aliases.length === 0) return null;
  // Walk up the relative path looking for a rule match.
  for (let i = subtreeRelative.length; i > 0; i--) {
    const candidate = '/' + subtreeRelative.slice(0, i).join('/');
    const matched = aliases.find(a => a.rulePath.toLowerCase() === candidate.toLowerCase());
    if (!matched) continue;
    // SCS line 5205-5207:
    //   itemPath2 = subtreeRelative.CreateRelativePathFrom(rule.path);
    //   itemPath2 = itemPath2.Prepend(subtreeRelative[count - relCount - 1]);
    //   aliasedPath = rule.aliasPath.Concatenate(itemPath2);
    const ruleSegmentCount = splitSegments(matched.rulePath).length;
    const relTail = subtreeRelative.slice(ruleSegmentCount);
    // Prepend the segment one above the relTail boundary on the ORIGINAL
    // sitecore path. With the leaf prepend already in place, the outer
    // path here is `subtreeRelative`, not `itemSegments` - SCS uses
    // `subtreeRelativeItemPath[idx]` (line 5206).
    const prependIdx = Math.max(subtreeRelative.length - relTail.length - 1, 0);
    const prepended = [subtreeRelative[prependIdx], ...relTail];
    const aliasSegments = splitSegments(matched.aliasPath);
    return [...aliasSegments, ...prepended];
  }
  return null;
}

/**
 * Compute the subtree-relative path with the include's leaf prepended
 * (or alias-substituted). Mirrors SCS
 * `ProcessItemPathToPhysicalRelativePath` (decompile line 5121).
 */
function processToRelative(
  itemSegments: ReadonlyArray<string>,
  ctx: TreeSpecContext,
): string[] | null {
  const includeSegments = splitSegments(ctx.includePath);
  // IncludesPath check - is itemSegments a descendant of includeSegments?
  if (itemSegments.length < includeSegments.length) return null;
  for (let i = 0; i < includeSegments.length; i++) {
    if (itemSegments[i].toLowerCase() !== includeSegments[i].toLowerCase()) return null;
  }
  // Strip include prefix to get subtree-relative segments (without leaf prepend).
  const stripped = itemSegments.slice(includeSegments.length);
  // Apply aliases or fall back to leaf-prepend.
  const aliased = tryApplyPathAlias(stripped, itemSegments, ctx.aliases);
  if (aliased !== null) return aliased;
  // Leaf-prepend: SCS prepends `itemSegments[count - relCount - 1]`,
  // i.e. the include's last segment.
  const prependIdx = Math.max(itemSegments.length - stripped.length - 1, 0);
  return [itemSegments[prependIdx], ...stripped];
}

/**
 * Port of SCS `GetPhysicalPathForItemPath` (decompile line 5089). Top-
 * level entry point: given a Sitecore item path and the include it
 * belongs to, return the absolute on-disk YAML location.
 */
export function computePhysicalPath(
  itemSitecorePath: string,
  ctx: TreeSpecContext,
): string {
  const itemSegments = splitSegments(itemSitecorePath);
  const subtreeRelative = processToRelative(itemSegments, ctx);
  if (subtreeRelative === null) {
    throw new Error(
      `Item path ${itemSitecorePath} is not under include ${ctx.includePath}.`,
    );
  }
  const hashed = applyPathLengthHash(subtreeRelative, ctx.maxRelativePathLength);
  const encoded = hashed.map(encodeSegment);
  return join(ctx.physicalPath, ...encoded) + '.yml';
}

/**
 * Build a {@link TreeSpecContext} from a parsed `*.module.json` include
 * entry. Physical root is `<modDir>/<module.items.path?>/<include.name>`,
 * matching the existing scanner's path convention (`scanner.ts:39`):
 * `module.items.path` defaults to empty string, not "items". The SCS
 * `defaultModuleRelativeSerializationPath` field exists in the schema
 * but isn't honored by Mockingbird's scanner today.
 */
export function buildTreeSpecContext(
  module: ModuleConfig,
  include: ModuleInclude,
  defaultMaxRelativePathLength: number = DEFAULT_MAX_RELATIVE_PATH_LENGTH,
): TreeSpecContext {
  const modDir = dirname(module.filePath);
  const itemsBasePath = module.items.path ?? '';
  const physicalPath = resolve(modDir, itemsBasePath, include.name);
  const aliases: { rulePath: string; aliasPath: string }[] = [];
  for (const rule of include.rules ?? []) {
    if (rule.alias && rule.alias.trim().length > 0) {
      // SCS rule.path is RELATIVE to the include's root; rule.aliasPath
      // is also relative (single segment in current schema). Walk-up
      // matching in `tryApplyPathAlias` operates on subtree-relative
      // paths, so rulePath is the relative path as stored.
      aliases.push({ rulePath: rule.path, aliasPath: '/' + rule.alias });
    }
  }
  return {
    includePath: include.path,
    physicalPath,
    aliases,
    maxRelativePathLength: defaultMaxRelativePathLength,
  };
}

/**
 * Pick the include whose physical root is the longest prefix of
 * `parentFilePath`. Multi-root setups have one include per location;
 * the longest-prefix tiebreak handles overlapping include scopes
 * deterministically (deepest include wins).
 */
export function findTreeSpecForParent(
  parentFilePath: string,
  modules: ReadonlyArray<ModuleConfig>,
  defaultMaxRelativePathLength: number = DEFAULT_MAX_RELATIVE_PATH_LENGTH,
): TreeSpecContext | null {
  const lowerParent = parentFilePath.toLowerCase();
  let best: { ctx: TreeSpecContext; depth: number } | null = null;
  for (const mod of modules) {
    for (const include of mod.items.includes) {
      const ctx = buildTreeSpecContext(mod, include, defaultMaxRelativePathLength);
      const physLower = ctx.physicalPath.toLowerCase();
      if (lowerParent === physLower || lowerParent.startsWith(physLower + sepLike(physLower))) {
        if (!best || ctx.physicalPath.length > best.depth) {
          best = { ctx, depth: ctx.physicalPath.length };
        }
      }
    }
  }
  return best?.ctx ?? null;
}

/**
 * Path separator that follows the platform style of an existing
 * filesystem path. Avoids hardcoding the OS sep so prefix tests stay
 * correct on test fixtures built with mixed separators.
 */
function sepLike(samplePath: string): string {
  return samplePath.includes('\\') ? '\\' : '/';
}

/**
 * Fallback path computation when no include matches `parentFilePath`.
 * Drops to a parent-stem-style placement (sibling YAML next to the
 * parent's file) with segment encoding applied. The resulting YAML may
 * not survive a startup re-scan if it lands outside any include scope -
 * matches the existing `Engine.resolveFilePath` fallback semantic, but
 * with SCS-correct on-disk shape and segment encoding.
 */
export function fallbackChildFilePath(parentFilePath: string, childName: string): string {
  const parentStem = parentFilePath.replace(/\.yml$/i, '');
  return join(parentStem, encodeSegment(childName) + '.yml');
}

/**
 * Whether an include (its Sitecore `path` + `scope`) actually covers an item,
 * by the item's depth below the include path (0 = the include item itself).
 * SCS scope semantics:
 *   SingleItem          -> depth 0 only
 *   ItemAndChildren     -> depth 0 or 1
 *   ItemAndDescendants  -> any depth (the SCS default when scope is unset)
 *   DescendantsOnly     -> depth >= 1
 *
 * New-item placement must route to an include whose scope genuinely owns the
 * item, not merely one whose path is a prefix. Without this, a `SingleItem`
 * seed include at `/Home` (covers only the Home node) wins the prefix tie over
 * an `ItemAndDescendants` content include at the same path, and a new
 * descendant is written out-of-scope under the seed - dropped on the next scan.
 */
function scopeCoversChild(
  includePath: string,
  scope: ModuleInclude['scope'],
  childItemSitecorePath: string,
): boolean {
  const inc = splitSegments(includePath);
  const child = splitSegments(childItemSitecorePath);
  if (child.length < inc.length) return false;
  for (let i = 0; i < inc.length; i++) {
    if (child[i].toLowerCase() !== inc[i].toLowerCase()) return false;
  }
  const depth = child.length - inc.length;
  switch (scope ?? 'ItemAndDescendants') {
    case 'SingleItem': return depth === 0;
    case 'ItemAndChildren': return depth <= 1;
    case 'DescendantsOnly': return depth >= 1;
    case 'ItemAndDescendants':
    default: return true;
  }
}

/**
 * Find the include whose Sitecore item-path covers `childItemSitecorePath`
 * (path prefix AND scope) with the longest path. Used as the primary lookup in
 * {@link resolveChildFilePath} so a registry-only parent (whose ghost
 * filePath wouldn't match any include's physical root) still routes its
 * children into the correct module when the children themselves are
 * covered by an include. Scope-aware so a `SingleItem` seed include never wins
 * over a descendant-covering include at the same path.
 */
function findTreeSpecForChildPath(
  childItemSitecorePath: string,
  modules: ReadonlyArray<ModuleConfig>,
  defaultMaxRelativePathLength: number,
): TreeSpecContext | null {
  let best: { ctx: TreeSpecContext; depth: number } | null = null;
  for (const mod of modules) {
    for (const include of mod.items.includes) {
      if (!scopeCoversChild(include.path, include.scope, childItemSitecorePath)) continue;
      const ctx = buildTreeSpecContext(mod, include, defaultMaxRelativePathLength);
      if (!best || include.path.length > best.depth) {
        best = { ctx, depth: include.path.length };
      }
    }
  }
  return best?.ctx ?? null;
}

/**
 * Convenience entry point: compute a new child YAML's location.
 *
 *   1. Try matching the CHILD's Sitecore path against include paths
 *      ({@link findTreeSpecForChildPath}). Wins when the child is itself
 *      covered by an include - critical for scaffolds where the parent
 *      may be a registry-only Project root with no include coverage but
 *      the new tenant subfolder DOES have its own include.
 *   2. Fall back to matching by `parentFilePath` ({@link findTreeSpecForParent}).
 *      Handles the common in-place-edit case where the parent's physical
 *      file lives inside an include scope.
 *   3. Last resort: {@link fallbackChildFilePath}, sibling-style placement
 *      next to the parent's file.
 */
export function resolveChildFilePath(
  parentFilePath: string,
  childItemSitecorePath: string,
  modules: ReadonlyArray<ModuleConfig>,
  defaultMaxRelativePathLength: number = DEFAULT_MAX_RELATIVE_PATH_LENGTH,
): string {
  const childCtx = findTreeSpecForChildPath(childItemSitecorePath, modules, defaultMaxRelativePathLength);
  if (childCtx) {
    return computePhysicalPath(childItemSitecorePath, childCtx);
  }
  const ctx = findTreeSpecForParent(parentFilePath, modules, defaultMaxRelativePathLength);
  if (ctx) {
    return computePhysicalPath(childItemSitecorePath, ctx);
  }
  const childName = childItemSitecorePath.split('/').filter(Boolean).pop() ?? '';
  return fallbackChildFilePath(parentFilePath, childName);
}
