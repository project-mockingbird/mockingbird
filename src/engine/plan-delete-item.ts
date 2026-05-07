// src/engine/plan-delete-item.ts
import type { Engine } from './index.js';
import type { MutationPlan } from './mutation-plan.js';
import { collectFilePaths } from './index.js';
import { readFile } from 'fs/promises';

/**
 * Compute the per-file deletes that `Engine.deleteItem` would perform,
 * without mutating the tree or touching disk. Reuses the same
 * `collectFilePaths` walker that `deleteItem` uses, so the file set is
 * guaranteed identical.
 */
export async function planDeleteItem(engine: Engine, idOrPath: string): Promise<MutationPlan> {
  const node = engine.getItemById(idOrPath) ?? engine.getItemByPath(idOrPath);
  if (!node) {
    return {
      files: [],
      summary: `no-op (item not found: ${idOrPath})`,
      warnings: [`Item not found: ${idOrPath}`],
    };
  }

  const filePaths = collectFilePaths(node);

  const files = await Promise.all(filePaths.map(async (path) => {
    const before = await readFile(path, 'utf-8').catch(() => '');
    return { path, before, after: '', op: 'delete' as const };
  }));

  return {
    files,
    summary: `Delete ${node.item.path} (${files.length} file${files.length === 1 ? '' : 's'})`,
    warnings: [],
  };
}
