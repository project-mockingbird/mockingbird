import { readErrorMessage } from './http';

export interface EnvEntry { id: string; name: string; cmHost: string; hasSecret: boolean; }
export interface EnvBody { name: string; cmHost: string; clientId: string; clientSecret?: string; secretEnv?: string; }

export async function listEnvs(): Promise<EnvEntry[]> {
  const res = await fetch('/api/sitecoreai/environments');
  if (!res.ok) throw new Error(`Failed to load environments (${res.status})`);
  return res.json();
}
export async function saveEnv(id: string, body: EnvBody): Promise<void> {
  const res = await fetch(`/api/sitecoreai/environments/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, `Save failed (${res.status})`));
}
export async function deleteEnv(id: string): Promise<void> {
  const res = await fetch(`/api/sitecoreai/environments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}
export async function testEnv(id: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/sitecoreai/environments/${encodeURIComponent(id)}/test`, { method: 'POST' });
  if (!res.ok) throw new Error(await readErrorMessage(res, `Test failed (${res.status})`));
  return res.json();
}
