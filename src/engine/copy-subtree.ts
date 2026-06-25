import type { Engine } from './index.js';
import type { ItemNode, ScsItem } from './types.js';
import { sitecoreDate } from './index.js';
import { generateGuid } from './guid.js';
import { FIELD_IDS } from './constants.js';
import { getNameVsSiblingsError, getSiblingNames } from './name-validation.js';
import { walkSubtree } from './walk-subtree.js';
import { writeAtomic } from './insert-branch.js';
import { serializeItem } from './serializer.js';

/**
 * Sitecore-parity deep copy of an item + its descendants under any chosen
 * destination parent. Shared primitive used by both Duplicate (Phase 1) and
 * Copy-to-picked-destination (Phase 2 of the copy/move feature).
 *
 * Decompile reference: `Sitecore.Kernel.decompiled.cs:375004` `CopyTo(parent,
 * copyName)` -> `CopyTo(destination, copyName, ID.NewID, deep: true)`
 * (`375040`) -> `ItemManager.CopyItem(this, destination, deep, copyName,
 * copyID)` (`365901` `CopyItem`). Sitecore's Duplicate is the special case
 * `CopyTo(Parent, copyName)` (`375117-375120`); Copy-to-picked-destination
 * is the same call shape with a user-chosen destination.
 *
 * Sitecore CopyItem semantics:
 *
 *   - Fresh GUID for every copied node (`ID.NewID` passed through `CopyTo`
 *     -> `CopyItem` -> Nexus's `CopyItemCommand`).
 *   - Field values copy VERBATIM. No `MasterVariablesReplacer` pass (that
 *     fires on `Item.Add` / template instantiation only; Copy is a plain
 *     copy of an existing item, including any literal `$name` tokens left
 *     by prior expansion).
 *   - `branchId` NOT stamped (this is not a branch instantiation).
 *   - `__Created` stamped fresh on every copied node (Sitecore's create-
 *     time stamping fires inside `CopyItemCommand` / Nexus, observable as
 *     a fresh `__Created` on the copy).
 *   - Atomic multi-file write via the shared `writeAtomic` primitive so a
 *     partial-write failure leaves no half-built subtree on disk; tree
 *     state is updated only after every YAML lands.
 *
 * `rewriteIntraSubtreeRefs` controls whether field references that point at
 * other items inside the copied subtree are retargeted at the new copies.
 * Sitecore's Duplicate copies fields verbatim (refs continue to point at
 * the originals); the picker-driven Copy operation will set this flag to
 * `true` in Phase 2 to retarget intra-subtree references at the new IDs.
 */
export type CopySubtreeArgs = {
  sourceId: string;
  destinationParentId: string;
  rootName: string;
  rewriteIntraSubtreeRefs: boolean;
};

export type CopySubtreeResult = {
  rootItemId: string;
  createdItems: ItemNode[];
};

export async function copySubtree(
  engine: Engine,
  args: CopySubtreeArgs,
): Promise<CopySubtreeResult> {
  const sourceNode = engine.getItemById(args.sourceId);
  if (!sourceNode) {
    if (engine.getRegistryItem(args.sourceId)) {
      throw new Error(
        `Cannot copy registry-only item: ${args.sourceId}. ` +
        `Editable OOTB items are not yet supported.`,
      );
    }
    throw new Error(`Source item not found: ${args.sourceId}`);
  }

  const destinationParent = engine.getItemById(args.destinationParentId);
  if (!destinationParent) {
    throw new Error(`Destination parent not found: ${args.destinationParentId}`);
  }

  const existingSiblings = getSiblingNames(destinationParent);
  const err = getNameVsSiblingsError(args.rootName, existingSiblings);
  if (err) throw new Error(err);

  // Walk source subtree: root + descendants, pre-order.
  const sourceItems = walkSubtree(engine, args.sourceId, { includeRoot: true });

  // Pre-mint fresh GUIDs for every source item.
  const idMap = new Map<string, string>();
  for (const src of sourceItems) {
    idMap.set(src.id, generateGuid());
  }

  // Build new items in pre-order. The source root reparents on
  // destinationParent and takes the user-provided name; descendants reparent
  // on their already-built ancestors, keeping their source names.
  const newPathBySrcId = new Map<string, string>();
  const newItems: ScsItem[] = [];

  for (const src of sourceItems) {
    const newId = idMap.get(src.id)!;
    const isRoot = src.id === args.sourceId;

    let newParentId: string;
    let newParentPath: string;
    let newName: string;
    if (isRoot) {
      newParentId = destinationParent.item.id;
      newParentPath = destinationParent.item.path;
      newName = args.rootName;
    } else {
      newParentId = idMap.get(src.parent) ?? destinationParent.item.id;
      newParentPath = newPathBySrcId.get(src.parent) ?? destinationParent.item.path;
      newName = src.path.split('/').pop() ?? '';
    }

    const newPath = `${newParentPath}/${newName}`;
    newPathBySrcId.set(src.id, newPath);

    const newItem: ScsItem = {
      id: newId,
      parent: newParentId,
      template: src.template,
      path: newPath,
      // Verbatim field copy, no expansion.
      sharedFields: src.sharedFields.map(f => ({ ...f })),
      languages: src.languages.map(l => ({
        language: l.language,
        fields: l.fields.map(f => ({ ...f })),
        versions: l.versions.map(v => ({
          version: v.version,
          fields: v.fields.map(f => ({ ...f })),
        })),
      })),
    };

    if (args.rewriteIntraSubtreeRefs) {
      rewriteFieldRefs(newItem, idMap);
    }

    stampFreshCreated(newItem);
    newItems.push(newItem);
  }

  // Compute on-disk paths for every new item via the SCS-parity pipeline.
  // The destination parent's filePath picks the include scope (longest-
  // prefix match) for the whole subtree; each item's own Sitecore path
  // then runs through SCS leaf-prepend / alias / tail-hash / segment-
  // encode. This routes the new subtree into the destination parent's
  // serialization root and produces sibling-style layout matching real
  // SCS exports. See `child-file-path.ts`.
  const entries = newItems.map(newItem => ({
    finalPath: engine.computeChildFilePath(destinationParent.filePath, newItem.path),
    contents: serializeItem(newItem),
  }));
  await writeAtomic(entries);

  // Tree state update only after every YAML lands. Pre-order so parents
  // exist before children.
  const createdNodes: ItemNode[] = [];
  for (let i = 0; i < newItems.length; i++) {
    // Pre-order add: parents are tree-resident (and provenance-stamped) before
    // their children, so addCreatedItem inherits the right layer per item.
    createdNodes.push(engine.addCreatedItem(newItems[i], entries[i].finalPath));
  }

  return { rootItemId: idMap.get(args.sourceId)!, createdItems: createdNodes };
}

function stampFreshCreated(item: ScsItem): void {
  let lang = item.languages.find(l => l.language === 'en');
  if (!lang) {
    lang = { language: 'en', fields: [], versions: [] };
    item.languages.push(lang);
  }
  let v1 = lang.versions.find(v => v.version === 1);
  if (!v1) {
    v1 = { version: 1, fields: [] };
    lang.versions.push(v1);
  }
  const stamp = sitecoreDate();
  const existing = v1.fields.find(f => f.id === FIELD_IDS.created);
  if (existing) {
    existing.value = stamp;
  } else {
    v1.fields.push({ id: FIELD_IDS.created, hint: '__Created', value: stamp });
  }
}

const GUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;

function rewriteFieldRefs(item: ScsItem, idMap: Map<string, string>): void {
  const rewriteValue = (v: string): string =>
    v.replace(GUID_PATTERN, (match) => {
      const lower = match.toLowerCase();
      const replacement = idMap.get(lower);
      if (!replacement) return match;
      // Preserve textual case: upper-case source (typical for braced
      // Sitecore IDs in Layout XML) emits upper-case; otherwise lower.
      const sourceWasUpper = match === match.toUpperCase();
      return sourceWasUpper ? replacement.toUpperCase() : replacement;
    });

  for (const f of item.sharedFields) {
    f.value = rewriteValue(f.value);
  }
  for (const lang of item.languages) {
    for (const f of lang.fields) f.value = rewriteValue(f.value);
    for (const ver of lang.versions) {
      for (const f of ver.fields) f.value = rewriteValue(f.value);
    }
  }
}
