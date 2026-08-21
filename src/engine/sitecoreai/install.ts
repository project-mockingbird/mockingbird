import type { Engine } from '../index.js';
import { collectSources } from '../package/collect.js';
import type { CartSource } from '../package/types.js';
import type { ScsItem } from '../types.js';
import type { SitecoreAiClient } from './client.js';
import { buildInstallPlan, type PlannerProgress } from './planner.js';
import { toSerializeItemData, toUpdateCommandData } from './serialize-command.js';
import type { ConflictStrategy, InstallPlan, InstallProgress, ItemCommand } from './types.js';

export const DEFAULT_BYTE_BUDGET = 6 * 1024 * 1024;

export interface ExecuteOptions { signal?: AbortSignal; onProgress?: (p: InstallProgress) => void; byteBudget?: number; }

export async function previewInstall(
  engine: Engine, sources: CartSource[], strategy: ConflictStrategy, client: SitecoreAiClient, onProgress?: PlannerProgress,
): Promise<InstallPlan> {
  const { items } = collectSources(engine, sources);
  const buildSourceSnapshot = (it: ScsItem) => toSerializeItemData(engine, it);
  return buildInstallPlan(items, strategy, client, buildSourceSnapshot, onProgress);
}

export async function executeInstall(
  engine: Engine, sources: CartSource[], strategy: ConflictStrategy, client: SitecoreAiClient, opts: ExecuteOptions = {},
): Promise<InstallProgress> {
  const budget = opts.byteBudget ?? DEFAULT_BYTE_BUDGET;
  const emit = (p: InstallProgress): InstallProgress => { opts.onProgress?.(p); return p; };
  const { items } = collectSources(engine, sources);
  const buildSourceSnapshot = (it: ScsItem) => toSerializeItemData(engine, it);
  // Stream the planning phase (the slow part - one probe per item) so the UI
  // shows an "Evaluating X of N" bar before the write phase, even when the user
  // deployed without running a preview first.
  const plan = await buildInstallPlan(items, strategy, client, buildSourceSnapshot, (completed, total) =>
    emit({ kind: 'progress', completed, total, message: `Evaluating ${completed} of ${total} items` }));

  if (plan.blockingErrors.length > 0) {
    return emit({ kind: 'error', completed: 0, total: 0, message: `Blocked: ${plan.blockingErrors.length} item(s) reference missing templates`, errors: plan.blockingErrors.map((b) => ({ itemId: b.itemId, reason: b.reason })) });
  }

  const actionable = plan.steps.filter((s) => s.action !== 'skip');
  const total = actionable.length;
  const byId = new Map(items.map((i) => [i.id, i] as const));

  // Build commands in plan order (parents-first).
  const commands: ItemCommand[] = [];
  for (const step of actionable) {
    const item = byId.get(step.itemId)!;
    if (step.action === 'create') {
      const data = await toSerializeItemData(engine, item);
      commands.push({ itemID: item.id, parentID: item.parent, database: 'master', command: 'CREATE', data: JSON.stringify(data) });
    } else {
      commands.push({ itemID: item.id, parentID: item.parent, database: 'master', command: 'UPDATE', data: toUpdateCommandData(step.ops ?? []) });
    }
  }

  // Byte-aware batching: an oversized single command goes solo.
  const batches: ItemCommand[][] = [];
  let cur: ItemCommand[] = []; let curBytes = 0;
  for (const c of commands) {
    const size = Buffer.byteLength(c.data, 'utf8');
    if (cur.length > 0 && curBytes + size > budget) { batches.push(cur); cur = []; curBytes = 0; }
    cur.push(c); curBytes += size;
    if (curBytes > budget) { batches.push(cur); cur = []; curBytes = 0; } // solo oversized
  }
  if (cur.length > 0) batches.push(cur);

  let completed = 0;
  for (const batch of batches) {
    if (opts.signal?.aborted) {
      return emit({ kind: 'error', completed, total, message: 'Cancelled', errors: [] });
    }
    const res = await client.executeSerializationCommands(batch);
    if (!res.ok) {
      return emit({ kind: 'error', completed, total, message: res.errors.join('; ') || 'Install failed', errors: res.errors.map((e) => ({ itemId: '', reason: e })) });
    }
    completed += batch.length;
    emit({ kind: 'progress', completed, total, message: `Installing ${completed} of ${total} items` });
  }

  return emit({ kind: 'done', completed, total, message: `Installed ${completed} of ${total} item(s)` });
}
