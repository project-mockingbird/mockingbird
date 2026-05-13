import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readLastSession, writeLastSession } from './last-session-store.js';

describe('last-session-store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-ls-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
  });
  afterEach(() => {
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads null when missing', async () => {
    expect(await readLastSession()).toBeNull();
  });

  it('round-trips a pointer', async () => {
    await writeLastSession({ projectHash: 'a', profileName: 'dev' });
    expect(await readLastSession()).toEqual({ projectHash: 'a', profileName: 'dev' });
  });

  it('clears to null', async () => {
    await writeLastSession({ projectHash: 'a', profileName: 'dev' });
    await writeLastSession(null);
    expect(await readLastSession()).toBeNull();
  });

  it('readLastSession returns null on partial data (missing profileName)', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(join(dir, 'last-session.json'), JSON.stringify({ projectHash: 'abc' }));
    expect(await readLastSession()).toBeNull();
  });
});
