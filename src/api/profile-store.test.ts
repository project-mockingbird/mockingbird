import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  listProfiles,
  readProfile,
  upsertProfile,
  deleteProfile,
  renameProfile,
  type Profile,
} from './profile-store.js';

const HASH = 'abc123def456';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: 'dev',
    projectName: 'mockingbird-demo',
    layers: [
      { sitecoreJsonPath: '/sitecore.json', name: 'core', color: '#3b82f6' },
    ],
    createdAt: '2026-05-12T20:00:00.000Z',
    updatedAt: '2026-05-12T20:00:00.000Z',
    ...overrides,
  };
}

describe('profile-store', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-profile-'));
    process.env.MOCKINGBIRD_STATE_ROOT = dir;
  });
  afterEach(() => {
    delete process.env.MOCKINGBIRD_STATE_ROOT;
    rmSync(dir, { recursive: true, force: true });
  });

  it('listProfiles returns empty array when project dir does not exist', async () => {
    const result = await listProfiles(HASH);
    expect(result).toEqual([]);
  });

  it('upsertProfile + readProfile round-trip', async () => {
    const p = makeProfile();
    await upsertProfile(HASH, p);
    const read = await readProfile(HASH, 'dev');
    expect(read).toEqual(p);
  });

  it('upsertProfile updates updatedAt on overwrite', async () => {
    const original = makeProfile({ createdAt: '2020-01-01T00:00:00.000Z' });
    await upsertProfile(HASH, original);
    const updated = makeProfile({ projectName: 'renamed' });
    await upsertProfile(HASH, updated);
    const read = await readProfile(HASH, 'dev');
    expect(read?.projectName).toBe('renamed');
    expect(read?.createdAt).toBe('2020-01-01T00:00:00.000Z'); // preserved
    expect(read?.updatedAt).not.toBe('2020-01-01T00:00:00.000Z'); // bumped
  });

  it('listProfiles returns summaries sorted by updatedAt desc', async () => {
    await upsertProfile(HASH, makeProfile({ name: 'a', updatedAt: '2020-01-01T00:00:00.000Z' }));
    await upsertProfile(HASH, makeProfile({ name: 'b', updatedAt: '2026-01-01T00:00:00.000Z' }));
    const result = await listProfiles(HASH);
    expect(result.map((p) => p.name)).toEqual(['b', 'a']);
    expect(result[0]).toMatchObject({ name: 'b', layerCount: 1 });
  });

  it('readProfile returns null for missing profile', async () => {
    const result = await readProfile(HASH, 'missing');
    expect(result).toBeNull();
  });

  it('readProfile returns null for invalid profile JSON', async () => {
    const { writeFileSync, mkdirSync } = await import('fs');
    const profilesDir = join(dir, 'projects', HASH, 'profiles');
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(join(profilesDir, 'corrupt.json'), '{not valid json');
    const result = await readProfile(HASH, 'corrupt');
    expect(result).toBeNull();
  });

  it('deleteProfile removes the file', async () => {
    await upsertProfile(HASH, makeProfile());
    expect(await readProfile(HASH, 'dev')).not.toBeNull();
    await deleteProfile(HASH, 'dev');
    expect(await readProfile(HASH, 'dev')).toBeNull();
  });

  it('renameProfile moves the file and updates the inner name field', async () => {
    await upsertProfile(HASH, makeProfile());
    const renamed = await renameProfile(HASH, 'dev', 'production');
    expect(renamed?.name).toBe('production');
    expect(await readProfile(HASH, 'dev')).toBeNull();
    expect((await readProfile(HASH, 'production'))?.name).toBe('production');
  });

  it('renameProfile returns null on missing source', async () => {
    const result = await renameProfile(HASH, 'nope', 'whatever');
    expect(result).toBeNull();
  });

  it('upsertProfile rejects invalid names', async () => {
    await expect(upsertProfile(HASH, makeProfile({ name: '../escape' }))).rejects.toThrow(/invalid profile name/);
    await expect(upsertProfile(HASH, makeProfile({ name: 'with/slash' }))).rejects.toThrow();
    await expect(upsertProfile(HASH, makeProfile({ name: '' }))).rejects.toThrow();
  });
});
