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
  type ProfileLayer,
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

  it('listProfiles skips files with invalid names', async () => {
    await upsertProfile(HASH, makeProfile({ name: 'dev' }));
    // Drop a foreign file directly into the profiles dir.
    const { writeFileSync } = await import('fs');
    const profilesDir = join(dir, 'projects', HASH, 'profiles');
    writeFileSync(join(profilesDir, 'tmp!backup.json'), '{}');
    writeFileSync(join(profilesDir, 'not-a-profile.json'), '{}');
    const result = await listProfiles(HASH);
    // Only the valid profile is returned; the listing does not throw.
    expect(result.map((p) => p.name)).toEqual(['dev']);
  });

  it('renameProfile throws when the target name already exists', async () => {
    await upsertProfile(HASH, makeProfile({ name: 'dev' }));
    await upsertProfile(HASH, makeProfile({ name: 'staging' }));
    await expect(renameProfile(HASH, 'dev', 'staging')).rejects.toThrow(/profile already exists/);
    // Both profiles still exist after the failed rename.
    expect(await readProfile(HASH, 'dev')).not.toBeNull();
    expect(await readProfile(HASH, 'staging')).not.toBeNull();
  });

  it('deleteProfile is idempotent (no throw on missing)', async () => {
    await expect(deleteProfile(HASH, 'never-existed')).resolves.toBeUndefined();
  });

  it('upsertProfile rejects malformed layer entries', async () => {
    const bad = makeProfile({
      layers: [
        { sitecoreJsonPath: '/x', name: 'core', color: '#000' },
        // missing color
        { sitecoreJsonPath: '/y', name: 'oops' } as unknown as ProfileLayer,
      ],
    });
    await expect(upsertProfile(HASH, bad)).rejects.toThrow(/invalid profile layer/);
  });

  it('readProfile returns null when stored layers are malformed', async () => {
    // Write a profile JSON directly with a bad layer.
    const { writeFileSync, mkdirSync } = await import('fs');
    const profilesDir = join(dir, 'projects', HASH, 'profiles');
    mkdirSync(profilesDir, { recursive: true });
    writeFileSync(
      join(profilesDir, 'corrupt-layers.json'),
      JSON.stringify({
        name: 'corrupt-layers',
        projectName: 'demo',
        layers: [{ name: 'no-path' }], // missing sitecoreJsonPath and color
        createdAt: 'T0',
        updatedAt: 'T0',
      }),
    );
    expect(await readProfile(HASH, 'corrupt-layers')).toBeNull();
  });
});
