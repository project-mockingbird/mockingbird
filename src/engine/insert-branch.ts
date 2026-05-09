import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync } from 'fs';
import { generateGuid } from './guid.js';
import { serializeItem } from './serializer.js';
import { expandItemTokens } from './layout/item-tokens.js';
import { walkSubtree } from './walk-subtree.js';
import type { Engine } from './index.js';
import type { ItemNode, ScsItem } from './types.js';

/**
 * Minimum shape insertBranch needs from the destination parent.
 * Tree-resident parents satisfy this via their ItemNode; registry-only
 * parents (e.g. `/sitecore/content` when no items have been serialized
 * under it yet) construct it via `engine.resolveFilePath` to pick the
 * include scope without requiring a real on-disk parent YAML.
 */
export type InsertBranchParent = {
  item: { id: string; path: string };
  filePath: string;
};

/**
 * Resolve a Sitecore path to an InsertBranchParent for use as an insertion
 * destination. Tree-first; falls back to the OOTB registry. For registry-only
 * parents, synthesizes a filePath via `engine.resolveFilePath` so the SCS
 * include-scope pipeline can route writes without needing a real parent YAML.
 *
 * Returns undefined when the path resolves nowhere - callers decide whether
 * that's a hard error (tenant location validation) or a skip-with-warning
 * (cross-cutting folder roots that may not exist in every install).
 */
export function resolveInsertParent(
  engine: Engine,
  path: string,
): InsertBranchParent | undefined {
  const tree = engine.getItemByPath(path);
  if (tree) {
    return { item: { id: tree.item.id, path: tree.item.path }, filePath: tree.filePath };
  }
  const reg = engine.getRegistryItemByPath(path);
  if (!reg) return undefined;
  const filePath = engine.resolveFilePath(reg.path, reg.name);
  return { item: { id: reg.id, path: reg.path }, filePath };
}

/**
 * Pre-order DFS over a branch template's subtree. Returns each descendant
 * of `branchTemplateId` in the order Sitecore's `AddFromBranchTemplate`
 * (`Sitecore.Kernel.decompiled.cs:210776`) processes them: each top-level
 * child first, then its descendants, then the next top-level child.
 *
 * The branch template item ITSELF is NOT included - only its children
 * onward, mirroring `foreach (Item child in branchTemplate.Children)`.
 *
 * Thin delegate over the shared `walkSubtree` helper with `includeRoot:
 * false` so duplicate (which needs the root included) and branch-template
 * insertion (which does not) share the same walker.
 */
export function walkBranchSubtree(engine: Engine, branchTemplateId: string): ScsItem[] {
  return walkSubtree(engine, branchTemplateId, { includeRoot: false });
}

export type AtomicWriteEntry = {
  finalPath: string;
  contents: string;
};

/**
 * Stage N writes into a temp directory, then rename each into its final
 * location. On any failure during staging, abort and clean the temp dir.
 * On a rare partial-rename failure (e.g. disk-full after some succeed),
 * best-effort delete of already-renamed files + throw.
 *
 * Note: filesystem-level transactions don't exist on Windows or POSIX.
 * "Atomic" here means "all-or-nothing barring rare partial-rename failures
 * from disk full / hardware error". Single-file writes use the OS rename
 * primitive which IS atomic per-file - the multi-file shape is what this
 * helper covers.
 */
export async function writeAtomic(entries: readonly AtomicWriteEntry[]): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), 'mockingbird-insert-branch-'));
  const stagedFiles: { tempPath: string; finalPath: string }[] = [];

  try {
    // Stage all writes into the temp dir first
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const tempPath = join(tempDir, `staged-${i}.yml`);
      await writeFile(tempPath, entry.contents, 'utf-8');
      stagedFiles.push({ tempPath, finalPath: entry.finalPath });
    }

    // Rename each staged file into its final location, creating parent dirs
    const renamed: string[] = [];
    try {
      for (const f of stagedFiles) {
        await mkdir(dirname(f.finalPath), { recursive: true });
        await rename(f.tempPath, f.finalPath);
        renamed.push(f.finalPath);
      }
    } catch (err) {
      // Partial-rename failure: best-effort cleanup of already-renamed files
      for (const r of renamed) {
        await rm(r, { force: true }).catch(() => {});
      }
      throw err;
    }
  } finally {
    // Always clean up the temp dir (rename moves files out, but the dir + any
    // failed-staged files remain)
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Insert a new subtree from a branch template into `parentNode`.
 * Mirrors Sitecore's `BranchItem.AddFromBranchTemplate`
 * (`Sitecore.Kernel.decompiled.cs:210776`):
 *
 * ```csharp
 * private static Item AddFromBranchTemplate(string itemName, Item destination,
 *                                           Item branchTemplate, ID newId)
 * {
 *     using (new ReplacerContextSwitcher("$name", itemName)) {
 *         foreach (Item child in branchTemplate.Children) {
 *             string itemName2 = ExpandBranchItemName(child, itemName);
 *             ... CopyBranchItem(child, destination, itemName2, ...);
 *         }
 *     }
 * }
 * ```
 *
 * Key invariants:
 *   - `$name` is overridden GLOBALLY across the subtree to the user-provided
 *     `branchRootName` (Sitecore's `ReplacerContextSwitcher` scope), NOT each
 *     descendant's own name. Other tokens (`$id`, `$parentid`, `$parentname`,
 *     `$date`, `$time`, `$now`) still resolve per-item against each new item's
 *     own context.
 *   - The first top-level child of the branch template becomes the new
 *     subtree's root under `parentNode`; descendants are recreated with fresh
 *     GUIDs and remapped parents (NOT the branch template's parent chain).
 *   - All YAMLs land via `writeAtomic` so a partial-write failure leaves no
 *     half-built subtree on disk; tree state is updated only after every
 *     YAML rename succeeds.
 */
export async function insertBranch(
  engine: Engine,
  parentNode: InsertBranchParent,
  branchTemplate: ScsItem,
  branchRootName: string,
): Promise<{ rootItemId: string; createdItems: ItemNode[] }> {
  const sourceItems = walkBranchSubtree(engine, branchTemplate.id);
  if (sourceItems.length === 0) {
    throw new Error(`Branch template has no children to instantiate: ${branchTemplate.path}`);
  }

  // Identify which source items are top-level children of the branch (vs
  // deeper descendants) so we know which ones reparent onto `parentNode`.
  // Branch may be tree-resident (existing path) or registry-resident
  // (SXA Headless tenant/site branches at {2D3805B9-...}, {45CF9F42-...}).
  const branchNode = engine.getItemById(branchTemplate.id);
  const topLevelSourceIds = new Set<string>();
  if (branchNode) {
    for (const child of branchNode.children.values()) {
      topLevelSourceIds.add(child.item.id);
    }
  } else {
    for (const regChild of engine.getRegistryChildren(branchTemplate.id)) {
      topLevelSourceIds.add(regChild.id);
    }
  }

  // Pre-mint fresh GUIDs for every source item so we can remap parents
  // (descendants reference their source-parent's new GUID).
  const idMap = new Map<string, string>();
  for (const src of sourceItems) {
    idMap.set(src.id, generateGuid());
  }

  // Build new items in pre-order. Each new item's path is computed from its
  // parent's already-built new path (top-level items use parentNode.path +
  // expanded name; descendants use their already-built ancestor's new path).
  const newPathBySrcId = new Map<string, string>();
  const newItems: ScsItem[] = [];
  let createdRootId: string | null = null;

  for (const src of sourceItems) {
    const newId = idMap.get(src.id)!;
    const isTopLevel = topLevelSourceIds.has(src.id);
    const sourceName = src.path.split('/').pop() ?? '';
    const newName = expandBranchItemName(sourceName, branchRootName);

    let newParentId: string;
    let newParentPath: string;
    if (isTopLevel) {
      // The branch's `$name` child becomes the user-named root under destination.
      newParentId = parentNode.item.id;
      newParentPath = parentNode.item.path;
    } else {
      // Descendant: parent = the new id we minted for its source parent.
      newParentId = idMap.get(src.parent) ?? parentNode.item.id;
      newParentPath = newPathBySrcId.get(src.parent) ?? parentNode.item.path;
    }

    const newPath = `${newParentPath}/${newName}`;
    newPathBySrcId.set(src.id, newPath);

    // Synthetic context for token expansion. `expandItemTokens` only reads
    // id/parent/path for `$id`/`$parentid`/`$parentname`; empty fields are
    // fine because `$name` is pre-substituted before the call.
    const ctx: ScsItem = {
      id: newId,
      parent: newParentId,
      template: src.template,
      path: newPath,
      sharedFields: [],
      languages: [],
    };

    const newItem: ScsItem = {
      id: newId,
      parent: newParentId,
      template: src.template,
      path: newPath,
      branchId: isTopLevel ? branchTemplate.id : undefined,
      sharedFields: src.sharedFields.map(f => ({
        ...f,
        value: expandWithBranchName(f.value, ctx, engine, branchRootName),
      })),
      languages: src.languages.map(l => ({
        language: l.language,
        fields: l.fields.map(f => ({
          ...f,
          value: expandWithBranchName(f.value, ctx, engine, branchRootName),
        })),
        versions: l.versions.map(v => ({
          version: v.version,
          fields: v.fields.map(f => ({
            ...f,
            value: expandWithBranchName(f.value, ctx, engine, branchRootName),
          })),
        })),
      })),
    };

    newItems.push(newItem);
    if (createdRootId === null && isTopLevel) {
      createdRootId = newId;
    }
  }

  // Compute on-disk paths for every new item via the SCS-parity pipeline.
  // The destination parent's filePath picks the include scope (longest-
  // prefix match) for the whole branch instantiation; each new item's own
  // Sitecore path then runs through SCS leaf-prepend / alias / tail-hash /
  // segment-encode. See `child-file-path.ts`.
  const entries = newItems.map(item => ({
    finalPath: engine.computeChildFilePath(parentNode.filePath, item.path),
    contents: serializeItem(item),
  }));
  await writeAtomic(entries);

  // Tree state update only AFTER every YAML lands. Add in pre-order so each
  // child's parent is already in the tree by the time we add the child.
  const createdNodes: ItemNode[] = [];
  for (let i = 0; i < newItems.length; i++) {
    createdNodes.push(engine.getTree().addItem(newItems[i], entries[i].finalPath));
  }

  if (createdRootId === null) {
    // Defensive: walkBranchSubtree returned items but none were top-level.
    // Shouldn't happen because top-level == direct children of the branch
    // template, which is exactly what walkBranchSubtree iterates first.
    throw new Error(`Branch instantiation produced no top-level item: ${branchTemplate.path}`);
  }

  return { rootItemId: createdRootId, createdItems: createdNodes };
}

/**
 * Mirrors `ExpandBranchItemName`: source items literally named `$name`
 * become the user-provided `branchRootName`. Descendant names with embedded
 * `$name` tokens are substituted too (rare authoring pattern, but supported
 * for parity with Sitecore's pipeline).
 */
function expandBranchItemName(name: string, branchRootName: string): string {
  return name.replace(/\$name\b/g, branchRootName);
}

/**
 * Apply the global `$name` override (Sitecore's `ReplacerContextSwitcher`)
 * before delegating to the per-item token engine. Pre-substituting `$name`
 * with the branch-root name means `expandItemTokens` sees no `$name` tokens
 * left and only handles the other six (`$id`, `$parentid`, `$parentname`,
 * `$date`, `$time`, `$now`) against the per-item context.
 */
function expandWithBranchName(
  value: string,
  ctx: ScsItem,
  engine: Engine,
  branchRootName: string,
): string {
  const nameOverridden = value.replace(/\$name\b/g, branchRootName);
  return expandItemTokens(nameOverridden, ctx, engine);
}
