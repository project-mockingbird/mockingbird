import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  listEnvironments, getResolvedEnvironment, upsertEnvironment, deleteEnvironment,
} from '../../../src/engine/sitecoreai/environments.js';

let dir: string;
let defsPath: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'mb-env-')); defsPath = join(dir, 'config.mockingbird.environments'); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); delete process.env.ACME_SECRET; });

describe('environments store', () => {
  it('missing file lists nothing', async () => {
    expect(await listEnvironments(defsPath)).toEqual([]);
  });

  it('upsert writes def to tracked file and secret to .local; list reports hasSecret', async () => {
    await upsertEnvironment(
      { id: 'e1', name: 'Acme DEV', cmHost: 'acme-dev.example' },
      { clientId: 'cid', clientSecret: 'shh' },
      defsPath,
    );
    const tracked = JSON.parse(await readFile(defsPath, 'utf-8'));
    expect(tracked.environments[0]).toMatchObject({ id: 'e1', name: 'Acme DEV', cmHost: 'acme-dev.example' });
    const local = JSON.parse(await readFile(`${defsPath}.local`, 'utf-8'));
    expect(local.secrets.e1).toMatchObject({ clientId: 'cid', clientSecret: 'shh' });
    // Secret must NOT be in the tracked file.
    expect(JSON.stringify(tracked)).not.toContain('shh');

    const list = await listEnvironments(defsPath);
    expect(list).toEqual([{ id: 'e1', name: 'Acme DEV', cmHost: 'acme-dev.example', hasSecret: true }]);
  });

  it('resolves a literal secret', async () => {
    await upsertEnvironment({ id: 'e1', name: 'A', cmHost: 'h' }, { clientId: 'cid', clientSecret: 'shh' }, defsPath);
    const env = await getResolvedEnvironment('e1', defsPath);
    expect(env).toMatchObject({ id: 'e1', cmHost: 'h', clientId: 'cid', clientSecret: 'shh' });
  });

  it('resolves a secret from an env var when secretEnv is set', async () => {
    process.env.ACME_SECRET = 'from-env';
    await upsertEnvironment({ id: 'e1', name: 'A', cmHost: 'h' }, { clientId: 'cid', secretEnv: 'ACME_SECRET' }, defsPath);
    const env = await getResolvedEnvironment('e1', defsPath);
    expect(env.clientSecret).toBe('from-env');
  });

  it('getResolvedEnvironment throws when the env var named by secretEnv is unset', async () => {
    await upsertEnvironment({ id: 'e1', name: 'A', cmHost: 'h' }, { clientId: 'cid', secretEnv: 'MISSING_VAR' }, defsPath);
    await expect(getResolvedEnvironment('e1', defsPath)).rejects.toThrow(/MISSING_VAR/);
  });

  it('delete removes both def and secret', async () => {
    await upsertEnvironment({ id: 'e1', name: 'A', cmHost: 'h' }, { clientId: 'cid', clientSecret: 'shh' }, defsPath);
    await deleteEnvironment('e1', defsPath);
    expect(await listEnvironments(defsPath)).toEqual([]);
    const local = JSON.parse(await readFile(`${defsPath}.local`, 'utf-8'));
    expect(local.secrets.e1).toBeUndefined();
  });
});
