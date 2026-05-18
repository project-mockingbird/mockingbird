import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdir, rm, writeFile, readFile, stat, readdir } from 'fs/promises';
import { resolve, join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { readConfig, writeConfig, ensureConfigExists, resolveConfigPath, type MockingbirdConfig } from '../../../src/api/state/config-store.js';

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
