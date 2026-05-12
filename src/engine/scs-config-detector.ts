import { readdir, stat, readFile } from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { glob } from 'glob';

/**
 * Common noise directories we never recurse into when looking for SCS configs.
 * Matches the convention used by the /api/fs/list endpoint.
 */
const SKIP_DIRS = new Set(['.git', '.vscode', '.DS_Store', '.idea', 'node_modules']);

/** Per-candidate result from a content-shape scan. */
export interface ScsConfigCandidate {
  /** Absolute path to the JSON file. */
  sitecoreJsonPath: string;
  /** Number of modules the file's modules-glob resolves to on disk. */
  moduleCount: number;
  /**
   * Comma-separated summary of allowedPushOperations values seen across
   * this candidate's modules' includes (e.g. "CreateUpdateAndDelete, CreateOnly").
   * Empty string when no modules resolve.
   */
  pushOpsSummary: string;
}

/**
 * Detects SCS config files (regardless of filename) by content shape:
 * - JSON parses successfully
 * - Top-level object has `modules` array of strings
 * - Top-level object has `plugins` array referencing Sitecore.DevEx.Extensibility.*
 *   OR a `$schema` ending in `RootConfigurationFile.schema.json`
 *
 * Recursively scans `rootDir`, skipping common noise dirs.
 */
export async function discoverScsConfigs(rootDir: string): Promise<ScsConfigCandidate[]> {
  const candidates: ScsConfigCandidate[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const absolutePath = join(dir, name);
      let entryStat;
      try {
        entryStat = await stat(absolutePath);
      } catch {
        continue;
      }
      if (entryStat.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entryStat.isFile()) continue;
      if (!name.toLowerCase().endsWith('.json')) continue;
      if (await isScsConfigShape(absolutePath)) {
        const summary = await summarizeCandidate(absolutePath);
        candidates.push({ sitecoreJsonPath: absolutePath, ...summary });
      }
    }
  }

  await walk(resolve(rootDir));
  return candidates;
}

export async function isScsConfigShape(filePath: string): Promise<boolean> {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;

  const hasModulesArray =
    Array.isArray(obj.modules) && obj.modules.every((m) => typeof m === 'string');
  if (!hasModulesArray) return false;

  // Either a Sitecore-shaped $schema OR a plugins array referencing DevEx.Extensibility.
  const schema = typeof obj.$schema === 'string' ? obj.$schema : '';
  if (schema.endsWith('RootConfigurationFile.schema.json')) return true;

  const plugins = Array.isArray(obj.plugins) ? obj.plugins : [];
  return plugins.some(
    (p) => typeof p === 'string' && p.includes('Sitecore.DevEx.Extensibility'),
  );
}

export async function summarizeCandidate(
  sitecoreJsonPath: string,
): Promise<{ moduleCount: number; pushOpsSummary: string }> {
  const raw = await readFile(sitecoreJsonPath, 'utf8');
  const parsed = JSON.parse(raw) as { modules?: string[] };
  const moduleGlobs = parsed.modules ?? [];
  const rootDir = dirname(sitecoreJsonPath);

  let moduleCount = 0;
  const opsSeen = new Set<string>();
  for (const pattern of moduleGlobs) {
    const matches = await glob(pattern, { cwd: rootDir });
    moduleCount += matches.length;
    for (const m of matches) {
      try {
        const moduleRaw = await readFile(join(rootDir, m), 'utf8');
        const moduleParsed = JSON.parse(moduleRaw) as {
          items?: { includes?: Array<{ allowedPushOperations?: string }> };
        };
        const includes = moduleParsed.items?.includes ?? [];
        for (const inc of includes) {
          if (inc.allowedPushOperations) opsSeen.add(inc.allowedPushOperations);
        }
      } catch {
        // ignore - module file malformed; don't crash discovery
      }
    }
  }

  return { moduleCount, pushOpsSummary: Array.from(opsSeen).sort().join(', ') };
}
