import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { dirname, resolve, join } from 'path';
import { getWorkspaceRoot } from '../../api/state/workspace-path.js';
import type { EnvironmentDef, EnvironmentSecret, ResolvedEnvironment } from './types.js';

export interface EnvironmentListEntry { id: string; name: string; cmHost: string; hasSecret: boolean; }

interface DefsFile { version: 1; environments: EnvironmentDef[]; }
interface SecretsFile { version: 1; secrets: Record<string, EnvironmentSecret>; }

export function resolveEnvDefsPath(): string {
  if (process.env.MOCKINGBIRD_ENV_CONFIG_PATH) return resolve(process.env.MOCKINGBIRD_ENV_CONFIG_PATH);
  return join(resolve(getWorkspaceRoot()), 'config.mockingbird.environments');
}
const localPath = (p: string) => `${p}.local`;

async function readJson<T>(p: string, empty: T): Promise<T> {
  try {
    const parsed = JSON.parse(await readFile(p, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return empty;
    return parsed as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return empty;
    if (err instanceof SyntaxError) return empty;
    throw err;
  }
}
async function atomicWrite(p: string, payload: unknown): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  await rename(tmp, p);
}

async function readDefs(path: string): Promise<DefsFile> {
  return readJson<DefsFile>(path, { version: 1, environments: [] });
}
async function readSecrets(path: string): Promise<SecretsFile> {
  return readJson<SecretsFile>(localPath(path), { version: 1, secrets: {} });
}

export async function listEnvironments(path = resolveEnvDefsPath()): Promise<EnvironmentListEntry[]> {
  const [defs, secrets] = await Promise.all([readDefs(path), readSecrets(path)]);
  return defs.environments.map((d) => {
    const s = secrets.secrets[d.id];
    return { id: d.id, name: d.name, cmHost: d.cmHost, hasSecret: !!(s && s.clientId && (s.clientSecret || s.secretEnv)) };
  });
}

function resolveSecret(id: string, secret: EnvironmentSecret): string {
  if (secret.secretEnv) {
    const v = process.env[secret.secretEnv];
    if (!v) throw new Error(`Environment "${id}" secret env var ${secret.secretEnv} is not set`);
    return v;
  }
  if (secret.clientSecret) return secret.clientSecret;
  throw new Error(`Environment "${id}" has no client secret configured`);
}

export async function getResolvedEnvironment(id: string, path = resolveEnvDefsPath()): Promise<ResolvedEnvironment> {
  const [defs, secrets] = await Promise.all([readDefs(path), readSecrets(path)]);
  const def = defs.environments.find((d) => d.id === id);
  if (!def) throw new Error(`Environment "${id}" not found`);
  const secret = secrets.secrets[id];
  if (!secret) throw new Error(`Environment "${id}" has no stored credentials`);
  return { id: def.id, name: def.name, cmHost: def.cmHost, clientId: secret.clientId, clientSecret: resolveSecret(id, secret) };
}

export async function upsertEnvironment(def: EnvironmentDef, secret: EnvironmentSecret, path = resolveEnvDefsPath()): Promise<void> {
  const [defs, secrets] = await Promise.all([readDefs(path), readSecrets(path)]);
  const i = defs.environments.findIndex((d) => d.id === def.id);
  if (i >= 0) defs.environments[i] = def; else defs.environments.push(def);

  const existing = secrets.secrets[def.id];
  const mergedClientId = secret.clientId || existing?.clientId || '';
  const material = secret.clientSecret
    ? { clientSecret: secret.clientSecret }
    : secret.secretEnv
      ? { secretEnv: secret.secretEnv }
      : { clientSecret: existing?.clientSecret, secretEnv: existing?.secretEnv };
  const merged: EnvironmentSecret = { clientId: mergedClientId, ...material };

  if (!merged.clientId && !merged.clientSecret && !merged.secretEnv) {
    delete secrets.secrets[def.id];
  } else {
    secrets.secrets[def.id] = merged;
  }

  await atomicWrite(path, defs);
  await atomicWrite(localPath(path), secrets);
}

export async function deleteEnvironment(id: string, path = resolveEnvDefsPath()): Promise<void> {
  const [defs, secrets] = await Promise.all([readDefs(path), readSecrets(path)]);
  defs.environments = defs.environments.filter((d) => d.id !== id);
  delete secrets.secrets[id];
  await atomicWrite(path, defs);
  await atomicWrite(localPath(path), secrets);
}
