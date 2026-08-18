import { readErrorMessage } from './http';

export interface DeploySource {
  id: string; rootItemId: string; rootItemPath: string; rootItemName: string;
  scope: 'itemAndDescendants' | 'itemAndChildren' | 'descendantsOnly' | 'childrenOnly';
  database: 'master';
}
export interface DeployPlan {
  steps: { itemId: string; path: string; name: string; action: 'create' | 'update' | 'skip'; reason: string }[];
  blockingErrors: { itemId: string; path: string; reason: string }[];
  warnings: { itemId: string; path: string; reason: string }[];
  summary: { create: number; update: number; skip: number };
}
export interface DeployProgress {
  kind: 'progress' | 'done' | 'error'; completed: number; total: number;
  message?: string; errors?: { itemId: string; reason: string }[];
}

export function formatPlanSummary(plan: DeployPlan): string {
  const { create, update, skip } = plan.summary;
  return `${create} create, ${update} update, ${skip} skip`;
}

export async function previewDeploy(envId: string, sources: DeploySource[], strategy: string): Promise<DeployPlan> {
  const res = await fetch('/api/sitecoreai/install/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ envId, sources, strategy }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `Preview failed (${res.status})`));
  return res.json();
}

export async function runDeploy(
  envId: string, sources: DeploySource[], strategy: string,
  onProgress: (p: DeployProgress) => void, signal?: AbortSignal,
): Promise<DeployProgress> {
  const res = await fetch('/api/sitecoreai/install', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ envId, sources, strategy }), signal,
  });
  if (!res.ok || !res.body) throw new Error(`Install failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = ''; let last: DeployProgress = { kind: 'error', completed: 0, total: 0, message: 'No progress received' };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      const p = JSON.parse(line) as DeployProgress;
      last = p; onProgress(p);
    }
  }
  return last;
}
