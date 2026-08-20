import type { ScsItem } from '../types.js';
import { ALL_ZERO_GUID, type ConflictStrategy, type InstallPlan, type PlanStep } from './types.js';

export interface PlannerProbes {
  itemExists(itemId: string): Promise<boolean>;
  templateExists(templateId: string): Promise<boolean>;
}

/** Called after each item is evaluated, so callers can show preview progress. */
export type PlannerProgress = (completed: number, total: number) => void;

export async function buildInstallPlan(
  items: ScsItem[], strategy: ConflictStrategy, probes: PlannerProbes, onProgress?: PlannerProgress,
): Promise<InstallPlan> {
  const payloadIds = new Set(items.map((i) => i.id.toLowerCase()));
  const steps: PlanStep[] = [];
  const blockingErrors: InstallPlan['blockingErrors'] = [];
  const warnings: InstallPlan['warnings'] = [];
  const summary = { create: 0, update: 0, skip: 0 };
  const total = items.length;
  let completed = 0;
  onProgress?.(0, total);

  // Cache template probes so N items on one template do not probe N times.
  const templateCache = new Map<string, boolean>();
  const templatePresent = async (tid: string): Promise<boolean> => {
    const key = tid.toLowerCase();
    if (payloadIds.has(key)) return true;
    if (templateCache.has(key)) return templateCache.get(key)!;
    const present = await probes.templateExists(tid);
    templateCache.set(key, present);
    return present;
  };

  for (const item of items) {
    const name = item.path.slice(item.path.lastIndexOf('/') + 1);
    const refs: string[] = [item.template];
    if (item.branchId && item.branchId !== ALL_ZERO_GUID) refs.push(item.branchId);

    const missing: string[] = [];
    for (const ref of refs) if (!(await templatePresent(ref))) missing.push(ref);

    if (missing.length > 0) {
      blockingErrors.push({ itemId: item.id, path: item.path, reason: `references template(s) not present on target or in payload: ${missing.join(', ')}` });
      steps.push({ itemId: item.id, path: item.path, name, action: 'skip', reason: 'blocked' });
      summary.skip++;
      completed++;
      onProgress?.(completed, total);
      continue;
    }

    const exists = await probes.itemExists(item.id);
    let action: PlanStep['action'];
    let reason: string;
    if (!exists) { action = 'create'; reason = 'new on target'; summary.create++; }
    else if (strategy === 'overwrite') { action = 'update'; reason = 'exists; overwrite'; summary.update++; }
    else { action = 'skip'; reason = 'exists; kept'; summary.skip++; }

    steps.push({ itemId: item.id, path: item.path, name, action, reason });
    completed++;
    onProgress?.(completed, total);
  }

  return { steps, blockingErrors, warnings, summary };
}
