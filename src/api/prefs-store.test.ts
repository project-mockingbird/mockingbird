import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readPrefs, writePrefs } from './prefs-store.js';

describe('prefs-store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-prefs-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
  });
  afterEach(() => {
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns defaults when missing', async () => {
    expect(await readPrefs()).toEqual({ autoRestoreLastSession: false });
  });

  it('writePrefs is a patch (merges with defaults)', async () => {
    await writePrefs({ autoRestoreLastSession: true });
    expect(await readPrefs()).toEqual({ autoRestoreLastSession: true });
  });

  it('returns the merged value', async () => {
    const result = await writePrefs({ autoRestoreLastSession: true });
    expect(result).toEqual({ autoRestoreLastSession: true });
  });
});
