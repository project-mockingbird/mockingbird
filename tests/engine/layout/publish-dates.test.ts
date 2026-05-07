import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadPublishDateOverrides,
  getEffectivePublishDate,
  clearPublishDateOverrides,
  publishDateOverrideCount,
} from '../../../src/engine/layout/publish-dates.js';

describe('publish-dates - per-item publish-date overrides (0.4.0.31)', () => {
  // User-authored file mapping item paths to the publish-date
  // `GetValidVersion` should use for that item. Matches Sitecore's
  // per-item publish history (which mockingbird can't derive from SCS
  // YAML alone).

  let tmpDir: string;
  const savedEnv = { ...process.env };
  beforeEach(() => {
    clearPublishDateOverrides();
    tmpDir = mkdtempSync(join(tmpdir(), 'mb-pub-dates-'));
    delete process.env.MOCKINGBIRD_PUBLISH_DATE;
  });
  afterEach(() => {
    clearPublishDateOverrides();
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...savedEnv };
  });

  function writeYaml(content: string): string {
    const path = join(tmpDir, 'publish-dates.yml');
    writeFileSync(path, content, 'utf8');
    return path;
  }

  it('loads path → ISO-date pairs from a simple YAML file', async () => {
    const path = writeYaml(
      "'/sitecore/content/x/contact-us': '2024-01-01T00:00:00Z'\n" +
      "'/sitecore/content/x/sample-page': '2024-12-01T00:00:00Z'\n",
    );
    await loadPublishDateOverrides(path);
    expect(publishDateOverrideCount()).toBe(2);
    expect(getEffectivePublishDate('/sitecore/content/x/contact-us').toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(getEffectivePublishDate('/sitecore/content/x/sample-page').toISOString()).toBe('2024-12-01T00:00:00.000Z');
  });

  it('unpinned path with no env var → returns real "now" (close to Date.now)', () => {
    const nowBefore = Date.now();
    const result = getEffectivePublishDate('/sitecore/content/x/unpinned').getTime();
    const nowAfter = Date.now();
    expect(result).toBeGreaterThanOrEqual(nowBefore);
    expect(result).toBeLessThanOrEqual(nowAfter);
  });

  it('MOCKINGBIRD_PUBLISH_DATE env var → returned for unpinned paths', () => {
    process.env.MOCKINGBIRD_PUBLISH_DATE = '2024-06-01T00:00:00Z';
    expect(getEffectivePublishDate('/any/path').toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('per-path override wins over MOCKINGBIRD_PUBLISH_DATE env var', async () => {
    process.env.MOCKINGBIRD_PUBLISH_DATE = '2024-06-01T00:00:00Z';
    await loadPublishDateOverrides(writeYaml(
      "'/sitecore/content/x/contact-us': '2024-01-01T00:00:00Z'\n",
    ));
    expect(getEffectivePublishDate('/sitecore/content/x/contact-us').toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(getEffectivePublishDate('/sitecore/content/x/other').toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('missing file → empty map, no throw; fallback chain still applies', async () => {
    await loadPublishDateOverrides(join(tmpDir, 'does-not-exist.yml'));
    expect(publishDateOverrideCount()).toBe(0);
  });

  it('undefined path (env not set) → no-op, empty map', async () => {
    await loadPublishDateOverrides(undefined);
    expect(publishDateOverrideCount()).toBe(0);
  });

  it('malformed YAML → empty map, no throw', async () => {
    await loadPublishDateOverrides(writeYaml('this is: not: valid: yaml: [\n'));
    expect(publishDateOverrideCount()).toBe(0);
  });

  it('non-string / non-ISO values are skipped', async () => {
    const path = writeYaml(
      "'/a': 42\n" +
      "'/b': 'not-a-real-date'\n" +
      "'/c': '2024-06-01T00:00:00Z'\n",
    );
    await loadPublishDateOverrides(path);
    expect(publishDateOverrideCount()).toBe(1);
    expect(getEffectivePublishDate('/c').toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('reloading replaces the previous map', async () => {
    await loadPublishDateOverrides(writeYaml("'/a': '2024-01-01T00:00:00Z'\n"));
    expect(publishDateOverrideCount()).toBe(1);
    await loadPublishDateOverrides(writeYaml("'/b': '2024-02-01T00:00:00Z'\n"));
    expect(publishDateOverrideCount()).toBe(1);
  });
});
