// src/engine/plan-set-icon.ts
import type { Engine } from './index.js';
import type { MutationPlan } from './mutation-plan.js';
import { applyFieldEdit } from './mutate-fields.js';
import { serializeItem } from './serializer.js';
import { readFile } from 'fs/promises';
import { FIELD_IDS } from './constants.js';

/**
 * Plan a single item's `__Icon` change. `__Icon` is always a SHARED field, so
 * the write is forced into the shared scope (mirrors reorder's forced-shared
 * `__Sortorder` write) rather than depending on schema scope resolution, which
 * can mis-scope for registry-stub templates. Mutates a clone only; the caller
 * replays the live-tree edit via applyFieldEditsWithRollback.
 */
export async function planSetIcon(engine: Engine, id: string, iconPath: string): Promise<MutationPlan> {
  const node = engine.getItemById(id);
  if (!node) {
    return { files: [], summary: `no-op (item not found: ${id})`, warnings: [`Item not found: ${id}`] };
  }
  const before = await readFile(node.filePath, 'utf-8').catch(() => serializeItem(node.item));
  const cloned = structuredClone(node.item);
  applyFieldEdit(cloned, FIELD_IDS.icon, iconPath, 'en', 1, 'shared', '__Icon');
  const after = serializeItem(cloned);
  if (before === after) {
    return { files: [], summary: 'no-op (no effective change)', warnings: [] };
  }
  return {
    files: [{ path: node.filePath, before, after, op: 'update' }],
    summary: `Set icon on ${node.item.path}`,
    warnings: [],
  };
}
