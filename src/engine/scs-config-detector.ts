import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { glob } from 'glob';

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
