// src/engine/reorder-siblings.ts
import type { Engine } from './index.js';
import type { MutationPlan } from './mutation-plan.js';
import { applyFieldEdit } from './mutate-fields.js';
import { serializeItem } from './serializer.js';
import { readFile } from 'fs/promises';
import { FIELD_IDS } from './constants.js';

/** Spacing between assigned sortorder values. Matches the 100-convention default. */
const SORTORDER_STEP = 100;

/**
 * Build a plan assigning spaced ascending `__Sortorder` (100, 200, ...) to each
 * id in `orderedChildIds` order. Only items whose serialized YAML actually
 * changes are included; identical before/after are skipped. `__Sortorder` is a
 * standard SHARED field, so it is written with an explicit shared scope rather
 * than routed through template-schema scope resolution (which could wrongly
 * default it to versioned when the field is absent from a template's schema).
 *
 * Every id MUST resolve to a serialized item; the caller validates that and the
 * same-parent permutation. Unresolvable ids are defensively skipped.
 *
 * Returns { plan, changedIds } where changedIds lists the written items (in plan
 * order) with their new value, so the caller can replay the edits on the live
 * tree and roll back on a write failure.
 */
export async function planReorderSiblings(
  engine: Engine,
  orderedChildIds: string[],
): Promise<{ plan: MutationPlan; changedIds: { id: string; value: string }[] }> {
  const files: MutationPlan['files'] = [];
  const changedIds: { id: string; value: string }[] = [];

  for (let i = 0; i < orderedChildIds.length; i++) {
    const id = orderedChildIds[i];
    const node = engine.getItemById(id);
    if (!node) continue;
    const value = String((i + 1) * SORTORDER_STEP);
    const before = await readFile(node.filePath, 'utf-8').catch(() => serializeItem(node.item));
    const clone = structuredClone(node.item);
    applyFieldEdit(clone, FIELD_IDS.sortorder, value, 'en', 1, 'shared', '__Sortorder');
    const after = serializeItem(clone);
    if (before === after) continue;
    files.push({ path: node.filePath, before, after, op: 'update' });
    changedIds.push({ id, value });
  }

  return {
    plan: { files, summary: `Reorder ${changedIds.length} item(s)`, warnings: [] },
    changedIds,
  };
}
