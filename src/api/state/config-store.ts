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
 * Read config.mockingbird. ENOENT and parse-failure both return the default
 * empty shape - the caller should not need to distinguish "no file yet" from
 * "empty registry". Other IO errors propagate.
 */
export async function readConfig(filePath: string): Promise<MockingbirdConfig> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, projects: {} };
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { version: 1, projects: {} };
    if (parsed.version !== 1) return { version: 1, projects: {} };
    const out: MockingbirdConfig = {
      version: 1,
      projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {},
    };
    if (typeof parsed.lastOpenedHash === 'string') {
      out.lastOpenedHash = parsed.lastOpenedHash;
    }
    return out;
  } catch {
    return { version: 1, projects: {} };
  }
}

/**
 * Write config.mockingbird atomically. Writes to `<path>.tmp-<pid>-<rand>` first,
 * then renames over the target. Creates the parent directory if missing.
 */
export async function writeConfig(filePath: string, config: MockingbirdConfig): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const json = JSON.stringify(config, null, 2) + '\n';
  await writeFile(tmp, json, 'utf-8');
  await rename(tmp, filePath);
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
