import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { dirname } from 'path';

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
}

const DEFAULT_CONFIG: MockingbirdConfig = { version: 1, projects: {} };

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
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG };
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONFIG };
    return {
      version: parsed.version === 1 ? 1 : 1,
      projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {},
    };
  } catch {
    return { ...DEFAULT_CONFIG };
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
