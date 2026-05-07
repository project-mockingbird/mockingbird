import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';

/**
 * Per-item publish-date overrides — the input Sitecore's
 * `PublishHelper.GetVersionToPublish` uses to select which version becomes
 * the active Edge snapshot.
 *
 * Sitecore itself records a separate publish-date per item in its publishing
 * history (each `PublishItem` pipeline call stamps the target's snapshot).
 * Mockingbird reads SCS-serialized source YAML, which has no publish
 * history - so a deployment supplies the per-item publish-date when it
 * matters.
 *
 * ## Fallback chain
 *
 * `getEffectivePublishDate(path)` returns, in order:
 *   1. the per-path override from the loaded YAML file (if present);
 *   2. the global `MOCKINGBIRD_PUBLISH_DATE` env var (if set);
 *   3. `new Date()` — real "now".
 *
 * ## File format
 *
 * Simple YAML map, keys are Sitecore item paths, values are ISO 8601
 * timestamps:
 *
 * ```yaml
 * '/sitecore/content/tenant/site/Home/contact-us': '2024-01-01T00:00:00Z'
 * '/sitecore/content/tenant/site/Home/resources/example-section/example-item': '2024-12-01T00:00:00Z'
 * ```
 *
 * Each date is the publish-date `GetValidVersion` uses for that item —
 * equivalent to "when did you last publish this item to Edge?" For a page
 * whose Edge snapshot is older than V5 of its serialized YAML, set the
 * override to a timestamp before V5's `__Valid from`.
 *
 * ## Loading
 *
 * Engine init calls `loadPublishDateOverrides` with the value of
 * `MOCKINGBIRD_PUBLISH_DATE_OVERRIDES_PATH` (or the default
 * `/app/data/publish-dates.yml`). Missing file is a no-op. Malformed
 * entries log a warning and are skipped.
 */

let overrideMap: Map<string, Date> = new Map();

function parseIsoDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

/** Load overrides from a YAML file. Malformed content and missing file are no-ops. */
export async function loadPublishDateOverrides(filePath: string | undefined): Promise<void> {
  overrideMap = new Map();
  if (!filePath) return;

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    console.error(`[publish-dates] failed to parse ${filePath}: ${(err as Error).message}`);
    return;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`[publish-dates] ${filePath}: expected a mapping of path → ISO date at the top level`);
    return;
  }

  let loaded = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const date = parseIsoDate(value);
    if (!date) {
      console.error(`[publish-dates] ${filePath}: skipping ${key} — value must be an ISO timestamp, got ${JSON.stringify(value)}`);
      skipped++;
      continue;
    }
    overrideMap.set(key, date);
    loaded++;
  }
  console.error(`[publish-dates] loaded ${loaded} override(s) from ${filePath}${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
}

/**
 * Return the publish-date `GetValidVersion` should use for the item at
 * `path`. Falls back to the global env var then to `now`. Pure getter; safe
 * to call repeatedly.
 */
export function getEffectivePublishDate(path: string): Date {
  const override = overrideMap.get(path);
  if (override) return override;

  const envRaw = process.env.MOCKINGBIRD_PUBLISH_DATE;
  if (envRaw) {
    const parsed = parseIsoDate(envRaw);
    if (parsed) return parsed;
  }

  return new Date();
}

/** Number of per-path overrides currently loaded. */
export function publishDateOverrideCount(): number {
  return overrideMap.size;
}

/** Test cleanup — resets the override map. */
export function clearPublishDateOverrides(): void {
  overrideMap = new Map();
}
