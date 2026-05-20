import { readFile, writeFile, mkdir, rename, access } from 'fs/promises';
import { dirname, resolve, join } from 'path';
import { getWorkspaceRoot } from './workspace-path.js';

export interface SavedProjectLayer {
  sitecoreJsonPath: string;
  name: string;
  color: string;
}

export interface SavedProject {
  hash: string;
  name: string;
  layers: SavedProjectLayer[];
  createdAt: number;
  lastOpenedAt: number;
}

export interface MockingbirdConfig {
  version: 1;
  projects: Record<string, SavedProject>;
  /** Hash of the last-opened project. Server uses this to replay openWorkspace
   *  on boot for headless consumers. Cleared on POST /api/projects/close. */
  lastOpenedHash?: string;
}

/**
 * Per-developer ephemeral state. Persisted alongside the tracked
 * config.mockingbird as <path>.local so different team members don't stomp
 * on each other's session state via the shared file. The .local file is
 * gitignored.
 */
interface LocalConfig {
  version: 1;
  lastOpenedHash?: string;
  lastOpenedAt: Record<string, number>;
}

function localPath(filePath: string): string {
  return `${filePath}.local`;
}

async function readLocalConfig(filePath: string): Promise<LocalConfig> {
  const empty: LocalConfig = { version: 1, lastOpenedAt: {} };
  let raw: string;
  try {
    raw = await readFile(localPath(filePath), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return empty;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    if (parsed.version !== 1) return empty;
    const out: LocalConfig = {
      version: 1,
      lastOpenedAt:
        parsed.lastOpenedAt && typeof parsed.lastOpenedAt === 'object' && !Array.isArray(parsed.lastOpenedAt)
          ? parsed.lastOpenedAt
          : {},
    };
    if (typeof parsed.lastOpenedHash === 'string') out.lastOpenedHash = parsed.lastOpenedHash;
    return out;
  } catch {
    return empty;
  }
}

async function atomicWriteJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const json = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(tmp, json, 'utf-8');
  await rename(tmp, filePath);
}

/**
 * Read config.mockingbird and its sibling .local. ENOENT on either returns
 * the default empty shape - callers should not need to distinguish "no file
 * yet" from "empty registry". Other IO errors propagate.
 *
 * Per-dev fields (lastOpenedHash, per-project lastOpenedAt) are merged from
 * the .local file. If the tracked file still has them embedded (legacy
 * pre-split shape), they're honored as a fallback; the next write splits them
 * out cleanly.
 */
export async function readConfig(filePath: string): Promise<MockingbirdConfig> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const local = await readLocalConfig(filePath);
      const out: MockingbirdConfig = { version: 1, projects: {} };
      if (local.lastOpenedHash) out.lastOpenedHash = local.lastOpenedHash;
      return out;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { version: 1, projects: {} };
  }
  if (!parsed || typeof parsed !== 'object') return { version: 1, projects: {} };
  const p = parsed as Record<string, unknown>;
  if (p.version !== 1) return { version: 1, projects: {} };

  const trackedProjects = (p.projects && typeof p.projects === 'object' ? p.projects : {}) as Record<string, unknown>;
  const local = await readLocalConfig(filePath);

  const projects: Record<string, SavedProject> = {};
  for (const [hash, value] of Object.entries(trackedProjects)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const legacyLastOpenedAt = typeof v.lastOpenedAt === 'number' ? v.lastOpenedAt : 0;
    projects[hash] = {
      hash: typeof v.hash === 'string' ? v.hash : hash,
      name: typeof v.name === 'string' ? v.name : hash,
      layers: Array.isArray(v.layers) ? (v.layers as SavedProjectLayer[]) : [],
      createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
      lastOpenedAt: local.lastOpenedAt[hash] ?? legacyLastOpenedAt,
    };
  }

  const out: MockingbirdConfig = { version: 1, projects };
  const lastOpenedHash =
    local.lastOpenedHash ?? (typeof p.lastOpenedHash === 'string' ? p.lastOpenedHash : undefined);
  if (lastOpenedHash) out.lastOpenedHash = lastOpenedHash;
  return out;
}

/**
 * Write config.mockingbird atomically. Splits per-dev state (lastOpenedHash,
 * per-project lastOpenedAt) into the sibling <path>.local file so the tracked
 * file stays team-shared and merge-conflict-free.
 *
 * Each file is written via tmp + rename. Creates parent directories as needed.
 */
export async function writeConfig(filePath: string, config: MockingbirdConfig): Promise<void> {
  const trackedProjects: Record<string, Omit<SavedProject, 'lastOpenedAt'>> = {};
  const lastOpenedAt: Record<string, number> = {};
  for (const [hash, project] of Object.entries(config.projects)) {
    const { lastOpenedAt: t, ...rest } = project;
    trackedProjects[hash] = rest;
    if (typeof t === 'number' && t > 0) lastOpenedAt[hash] = t;
  }

  const trackedPayload = { version: 1, projects: trackedProjects };
  const localPayload: LocalConfig = { version: 1, lastOpenedAt };
  if (config.lastOpenedHash) localPayload.lastOpenedHash = config.lastOpenedHash;

  await atomicWriteJson(filePath, trackedPayload);
  await atomicWriteJson(localPath(filePath), localPayload);
}

/**
 * Create an empty config.mockingbird at the workspace root if it does not yet
 * exist. Idempotent. Called from server bootstrap so a fresh `docker compose up`
 * leaves a visible, committable file rather than an invisible default served
 * only out of memory until the first project is opened.
 */
export async function ensureConfigExists(filePath: string): Promise<void> {
  try {
    await access(filePath);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await writeConfig(filePath, { version: 1, projects: {} });
}

/**
 * Resolve the path to config.mockingbird from environment. Honors
 * `MOCKINGBIRD_CONFIG_PATH` (explicit override) first, otherwise joins
 * `config.mockingbird` onto the workspace root.
 */
export function resolveConfigPath(): string {
  if (process.env.MOCKINGBIRD_CONFIG_PATH) return resolve(process.env.MOCKINGBIRD_CONFIG_PATH);
  return join(resolve(getWorkspaceRoot()), 'config.mockingbird');
}
