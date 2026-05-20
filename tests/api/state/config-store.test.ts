import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdir, rm, writeFile, readFile, stat, readdir } from 'fs/promises';
import { resolve, join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { readConfig, writeConfig, ensureConfigExists, migrateConfigIfLegacy, resolveConfigPath, type MockingbirdConfig } from '../../../src/api/state/config-store.js';

let tmpRoot: string;
let configPath: string;

beforeAll(async () => {
  tmpRoot = resolve(tmpdir(), `config-store-test-${Date.now()}`);
  await mkdir(tmpRoot, { recursive: true });
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  configPath = join(tmpRoot, `config-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});

describe('readConfig', () => {
  it('returns the default shape when file does not exist', async () => {
    const result = await readConfig(configPath);
    expect(result).toEqual({ version: 1, projects: {} });
  });

  it('parses an existing file', async () => {
    const config: MockingbirdConfig = {
      version: 1,
      projects: {
        'abc123': {
          hash: 'abc123',
          name: 'Test Project',
          layers: [{ sitecoreJsonPath: '/foo/sitecore.json', name: 'foo', color: '#22c55e' }],
          createdAt: 1700000000000,
          lastOpenedAt: 1700000000000,
        },
      },
    };
    await writeFile(configPath, JSON.stringify(config), 'utf-8');
    const result = await readConfig(configPath);
    expect(result).toEqual(config);
  });

  it('returns the default shape on a malformed file (does not throw)', async () => {
    await writeFile(configPath, 'not json', 'utf-8');
    const result = await readConfig(configPath);
    expect(result).toEqual({ version: 1, projects: {} });
  });

  it('returns a fresh default object each call (does not share the projects ref)', async () => {
    const a = await readConfig(configPath); // ENOENT path
    a.projects['poison'] = {
      hash: 'poison', name: 'p', layers: [], createdAt: 0, lastOpenedAt: 0,
    };
    const b = await readConfig(configPath); // also ENOENT
    expect(b.projects).toEqual({});
  });

  it('returns the default shape when version is not 1', async () => {
    await writeFile(configPath, JSON.stringify({ version: 99, projects: { x: 1 } }), 'utf-8');
    const result = await readConfig(configPath);
    expect(result).toEqual({ version: 1, projects: {} });
  });

  it('returns lastOpenedHash when present', async () => {
    await writeFile(
      configPath,
      JSON.stringify({ version: 1, projects: {}, lastOpenedHash: 'abc123def456' }),
      'utf-8',
    );
    const result = await readConfig(configPath);
    expect(result.lastOpenedHash).toBe('abc123def456');
  });

  it('returns undefined lastOpenedHash when absent', async () => {
    await writeFile(configPath, JSON.stringify({ version: 1, projects: {} }), 'utf-8');
    const result = await readConfig(configPath);
    expect(result.lastOpenedHash).toBeUndefined();
  });

  it('normalizes lastOpenedHash to undefined when not a string', async () => {
    await writeFile(
      configPath,
      JSON.stringify({ version: 1, projects: {}, lastOpenedHash: 42 }),
      'utf-8',
    );
    const result = await readConfig(configPath);
    expect(result.lastOpenedHash).toBeUndefined();
  });

  it('normalizes lastOpenedHash to undefined when null in file', async () => {
    await writeFile(
      configPath,
      JSON.stringify({ version: 1, projects: {}, lastOpenedHash: null }),
      'utf-8',
    );
    const result = await readConfig(configPath);
    expect(result.lastOpenedHash).toBeUndefined();
  });
});

describe('writeConfig', () => {
  it('writes the file atomically (no .tmp left behind on success)', async () => {
    const config: MockingbirdConfig = { version: 1, projects: {} };
    await writeConfig(configPath, config);
    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written).toEqual(config);
    // No leftover *.tmp files
    const dir = dirname(configPath);
    const baseName = basename(configPath);
    const files = await readdir(dir);
    const tmpFiles = files.filter((f) => f.startsWith(`${baseName}.tmp-`));
    expect(tmpFiles).toEqual([]);
  });

  it('creates the parent directory if missing', async () => {
    const nested = join(tmpRoot, 'a', 'b', 'config.mockingbird');
    await writeConfig(nested, { version: 1, projects: {} });
    const written = JSON.parse(await readFile(nested, 'utf-8'));
    expect(written.version).toBe(1);
  });

  it('round-trips through read', async () => {
    const config: MockingbirdConfig = {
      version: 1,
      projects: {
        'h1': {
          hash: 'h1',
          name: 'P',
          layers: [{ sitecoreJsonPath: '/x/sitecore.json', name: 'x', color: '#000' }],
          createdAt: 1,
          lastOpenedAt: 2,
        },
      },
    };
    await writeConfig(configPath, config);
    const read = await readConfig(configPath);
    expect(read).toEqual(config);
  });

  it('round-trips lastOpenedHash', async () => {
    const config: MockingbirdConfig = {
      version: 1,
      projects: {},
      lastOpenedHash: 'def456abc789',
    };
    await writeConfig(configPath, config);
    const read = await readConfig(configPath);
    expect(read.lastOpenedHash).toBe('def456abc789');
  });
});

describe('ensureConfigExists', () => {
  it('creates an empty default config when the file is missing', async () => {
    await ensureConfigExists(configPath);
    const written = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(written).toEqual({ version: 1, projects: {} });
  });

  it('leaves an existing file untouched (idempotent)', async () => {
    const existing: MockingbirdConfig = {
      version: 1,
      projects: {
        'h1': {
          hash: 'h1', name: 'preexisting', layers: [], createdAt: 1, lastOpenedAt: 2,
        },
      },
    };
    await writeFile(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    const before = await stat(configPath);
    await ensureConfigExists(configPath);
    const after = await stat(configPath);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    const onDisk = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(onDisk).toEqual(existing);
  });

  it('creates parent directories if missing', async () => {
    const nested = join(tmpRoot, 'fresh-workspace', 'config.mockingbird');
    await ensureConfigExists(nested);
    const written = JSON.parse(await readFile(nested, 'utf-8'));
    expect(written).toEqual({ version: 1, projects: {} });
  });
});

describe('per-dev split (config.mockingbird.local)', () => {
  it('reads lastOpenedHash from the .local file when the tracked file does not have it', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        projects: {
          h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1 },
        },
      }),
      'utf-8',
    );
    await writeFile(
      `${configPath}.local`,
      JSON.stringify({ version: 1, lastOpenedHash: 'h1' }),
      'utf-8',
    );
    const result = await readConfig(configPath);
    expect(result.lastOpenedHash).toBe('h1');
    expect(result.projects.h1.name).toBe('p');
  });

  it('reads per-project lastOpenedAt from the .local file', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        projects: {
          h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1 },
        },
      }),
      'utf-8',
    );
    await writeFile(
      `${configPath}.local`,
      JSON.stringify({ version: 1, lastOpenedAt: { h1: 12345 } }),
      'utf-8',
    );
    const result = await readConfig(configPath);
    expect(result.projects.h1.lastOpenedAt).toBe(12345);
  });

  it('returns lastOpenedAt as 0 when the .local file has no entry for that project', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        projects: {
          h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1 },
        },
      }),
      'utf-8',
    );
    // No .local file at all.
    const result = await readConfig(configPath);
    expect(result.projects.h1.lastOpenedAt).toBe(0);
  });

  it('writes per-dev fields ONLY to .local; tracked file has no lastOpenedHash or per-project lastOpenedAt', async () => {
    const merged: MockingbirdConfig = {
      version: 1,
      lastOpenedHash: 'h1',
      projects: {
        h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1, lastOpenedAt: 99 },
      },
    };
    await writeConfig(configPath, merged);

    const trackedOnDisk = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(trackedOnDisk.lastOpenedHash).toBeUndefined();
    expect(trackedOnDisk.projects.h1.lastOpenedAt).toBeUndefined();
    expect(trackedOnDisk.projects.h1.name).toBe('p');

    const localOnDisk = JSON.parse(await readFile(`${configPath}.local`, 'utf-8'));
    expect(localOnDisk.lastOpenedHash).toBe('h1');
    expect(localOnDisk.lastOpenedAt).toEqual({ h1: 99 });
  });

  it('writeConfig + readConfig round-trip preserves the merged shape', async () => {
    const merged: MockingbirdConfig = {
      version: 1,
      lastOpenedHash: 'h2',
      projects: {
        h1: { hash: 'h1', name: 'a', layers: [], createdAt: 1, lastOpenedAt: 10 },
        h2: { hash: 'h2', name: 'b', layers: [], createdAt: 2, lastOpenedAt: 20 },
      },
    };
    await writeConfig(configPath, merged);
    const read = await readConfig(configPath);
    expect(read).toEqual(merged);
  });

  it('migrates legacy embedded per-dev fields from tracked file on the next write', async () => {
    // Existing repos may have config.mockingbird with embedded lastOpenedHash
    // and per-project lastOpenedAt - the pre-split shape. Reading still works
    // (back-compat); the next write should split them out, leaving the tracked
    // file clean.
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        lastOpenedHash: 'h1',
        projects: {
          h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1, lastOpenedAt: 7 },
        },
      }),
      'utf-8',
    );

    const before = await readConfig(configPath);
    expect(before.lastOpenedHash).toBe('h1');
    expect(before.projects.h1.lastOpenedAt).toBe(7);

    await writeConfig(configPath, before);

    const trackedAfter = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(trackedAfter.lastOpenedHash).toBeUndefined();
    expect(trackedAfter.projects.h1.lastOpenedAt).toBeUndefined();

    const localAfter = JSON.parse(await readFile(`${configPath}.local`, 'utf-8'));
    expect(localAfter.lastOpenedHash).toBe('h1');
    expect(localAfter.lastOpenedAt.h1).toBe(7);
  });

  it('tolerates a malformed .local file (falls back to no per-dev state, no throw)', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        projects: {
          h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1 },
        },
      }),
      'utf-8',
    );
    await writeFile(`${configPath}.local`, 'not json', 'utf-8');
    const result = await readConfig(configPath);
    expect(result.lastOpenedHash).toBeUndefined();
    expect(result.projects.h1.lastOpenedAt).toBe(0);
  });
});

describe('migrateConfigIfLegacy', () => {
  it('splits embedded per-dev fields out to .local when the tracked file is legacy-shaped', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        lastOpenedHash: 'h1',
        projects: {
          h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1, lastOpenedAt: 42 },
        },
      }),
      'utf-8',
    );

    await migrateConfigIfLegacy(configPath);

    const trackedAfter = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(trackedAfter.lastOpenedHash).toBeUndefined();
    expect(trackedAfter.projects.h1.lastOpenedAt).toBeUndefined();

    const localAfter = JSON.parse(await readFile(`${configPath}.local`, 'utf-8'));
    expect(localAfter.lastOpenedHash).toBe('h1');
    expect(localAfter.lastOpenedAt.h1).toBe(42);
  });

  it('is a no-op when the tracked file already has the split shape', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        projects: { h1: { hash: 'h1', name: 'p', layers: [], createdAt: 1 } },
      }),
      'utf-8',
    );
    const before = await stat(configPath);

    await migrateConfigIfLegacy(configPath);

    const after = await stat(configPath);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    // No .local file created spuriously - nothing to migrate, nothing to write.
    let localExists = true;
    try {
      await stat(`${configPath}.local`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') localExists = false;
      else throw err;
    }
    expect(localExists).toBe(false);
  });

  it('is a no-op when the tracked file does not exist', async () => {
    // Fresh workspace, no config files anywhere. Migrate must not crash and
    // must not create either file.
    await migrateConfigIfLegacy(configPath);

    let trackedExists = true;
    try {
      await stat(configPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') trackedExists = false;
      else throw err;
    }
    expect(trackedExists).toBe(false);
  });
});

describe('resolveConfigPath', () => {
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    delete process.env.MOCKINGBIRD_CONFIG_PATH;
    delete process.env.MOCKINGBIRD_WORKSPACE;
    delete process.env.MOCKINGBIRD_WORKSPACE_ROOT;
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('honors MOCKINGBIRD_CONFIG_PATH when set', () => {
    process.env.MOCKINGBIRD_CONFIG_PATH = '/explicit/path/cfg.mockingbird';
    expect(resolveConfigPath()).toBe(resolve('/explicit/path/cfg.mockingbird'));
  });

  it('joins config.mockingbird onto MOCKINGBIRD_WORKSPACE when CONFIG_PATH is unset', () => {
    process.env.MOCKINGBIRD_WORKSPACE = '/ws';
    expect(resolveConfigPath()).toBe(join(resolve('/ws'), 'config.mockingbird'));
  });

  it('falls back to /workspaces when nothing is set', () => {
    expect(resolveConfigPath()).toBe(join(resolve('/workspaces'), 'config.mockingbird'));
  });
});
