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

  it('readProjectMeta returns null when the file content hash mismatches the request', async () => {
    await writeProjectMeta({
      projectHash: 'wrong',
      lastProjectName: 'demo',
      layerPaths: ['/x'],
      lastOpenedAt: 'T0',
    });
    // Read using a different hash - should return null since path resolves to a different file.
    expect(await readProjectMeta('different')).toBeNull();
  });

  it('readProjectMeta returns null when the file is missing required fields', async () => {
    // Manually write a partial blob to the meta path.
    const { writeFileSync, mkdirSync } = await import('fs');
    const metaDir = join(dir, 'projects', 'abc');
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(join(metaDir, 'meta.json'), JSON.stringify({ lastProjectName: 'incomplete' }));
    expect(await readProjectMeta('abc')).toBeNull();
  });
});
