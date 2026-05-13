import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readProjectMeta, writeProjectMeta } from './project-meta-store.js';

describe('project-meta-store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-meta-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
  });
  afterEach(() => {
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  });

  it('readProjectMeta returns null when missing', async () => {
    expect(await readProjectMeta('abc')).toBeNull();
  });

  it('round-trips', async () => {
    const meta = {
      projectHash: 'abc',
      lastProjectName: 'demo',
      layerPaths: ['/sitecore.json'],
      lastOpenedAt: new Date().toISOString(),
    };
    await writeProjectMeta(meta);
    expect(await readProjectMeta('abc')).toEqual(meta);
  });
});
