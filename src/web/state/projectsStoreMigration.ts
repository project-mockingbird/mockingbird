import type { SavedProject } from './projectsStore';

const LEGACY_KEY = 'mockingbird.projects';

export interface MigrationResult {
  projects: Record<string, SavedProject>;
  lastOpenedHash: string | null;
  autoRestore: boolean;
}

function isoToMs(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const d = Date.parse(value);
    return Number.isNaN(d) ? Date.now() : d;
  }
  return Date.now();
}

/**
 * One-shot localStorage -> server migration. Returns null when nothing to migrate.
 * Clears the legacy key after a successful parse so the migration never re-runs.
 */
export async function migrateFromLocalStorage(): Promise<MigrationResult | null> {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage?.getItem(LEGACY_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const p = parsed as Record<string, unknown>;
  const projectsIn =
    p.projects && typeof p.projects === 'object'
      ? (p.projects as Record<string, unknown>)
      : {};
  const projects: Record<string, SavedProject> = {};
  for (const [hash, entry] of Object.entries(projectsIn)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.hash !== 'string' || typeof e.name !== 'string' || !Array.isArray(e.layers))
      continue;
    projects[hash] = {
      hash: e.hash,
      name: e.name,
      layers: e.layers as SavedProject['layers'],
      createdAt: isoToMs(e.createdAt),
      lastOpenedAt: isoToMs(e.lastOpenedAt),
    };
  }

  try {
    globalThis.localStorage?.removeItem(LEGACY_KEY);
  } catch {
    // ignore - migration data is already captured
  }

  return {
    projects,
    lastOpenedHash: typeof p.lastOpenedHash === 'string' ? p.lastOpenedHash : null,
    autoRestore: (p.prefs as Record<string, unknown>)?.autoRestore !== false,
  };
}
