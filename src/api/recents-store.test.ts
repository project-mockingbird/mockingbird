import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readRecents, upsertRecent, removeRecent } from './recents-store.js';

describe('recents-store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-recents-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
  });
  afterEach(() => {
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  });

  it('readRecents returns empty when missing', async () => {
    expect(await readRecents()).toEqual([]);
  });

  it('upsertRecent prepends new entry', async () => {
    await upsertRecent({ projectHash: 'a', projectName: 'p1', profileName: 'dev', lastOpenedAt: '2026-01-01T00:00:00.000Z' });
    await upsertRecent({ projectHash: 'b', projectName: 'p2', profileName: 'dev', lastOpenedAt: '2026-02-01T00:00:00.000Z' });
    const out = await readRecents();
    expect(out.map((e) => e.projectHash)).toEqual(['b', 'a']);
  });

  it('upsertRecent moves existing entry to front + replaces timestamp', async () => {
    await upsertRecent({ projectHash: 'a', projectName: 'p1', profileName: 'dev', lastOpenedAt: 'T1' });
    await upsertRecent({ projectHash: 'b', projectName: 'p2', profileName: 'dev', lastOpenedAt: 'T2' });
    await upsertRecent({ projectHash: 'a', projectName: 'p1', profileName: 'dev', lastOpenedAt: 'T3' });
    const out = await readRecents();
    expect(out.map((e) => e.projectHash)).toEqual(['a', 'b']);
    expect(out[0].lastOpenedAt).toBe('T3');
  });

  it('upsertRecent caps at 20 entries', async () => {
    for (let i = 0; i < 25; i++) {
      await upsertRecent({ projectHash: `h${i}`, projectName: 'p', profileName: 'x', lastOpenedAt: `T${i}` });
    }
    const out = await readRecents();
    expect(out.length).toBe(20);
    expect(out[0].projectHash).toBe('h24');
  });

  it('removeRecent drops the matching entry only', async () => {
    await upsertRecent({ projectHash: 'a', projectName: 'p1', profileName: 'dev', lastOpenedAt: 'T1' });
    await upsertRecent({ projectHash: 'a', projectName: 'p1', profileName: 'qa', lastOpenedAt: 'T2' });
    await removeRecent('a', 'dev');
    const out = await readRecents();
    expect(out.map((e) => e.profileName)).toEqual(['qa']);
  });

  it('readRecents filters out malformed entries', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(
      join(dir, 'recents.json'),
      JSON.stringify({
        entries: [
          { projectHash: 'a', projectName: 'p1', profileName: 'dev', lastOpenedAt: 'T1' },
          { projectHash: 'b' }, // missing fields - dropped
          null, // null - dropped
          { projectHash: 'c', projectName: 'p3', profileName: 'qa', lastOpenedAt: 'T2' },
        ],
      }),
    );
    const out = await readRecents();
    expect(out.map((e) => e.projectHash)).toEqual(['a', 'c']);
  });
});
