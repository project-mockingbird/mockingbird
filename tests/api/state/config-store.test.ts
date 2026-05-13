import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdir, rm, writeFile, readFile, stat, readdir } from 'fs/promises';
import { resolve, join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { readConfig, writeConfig, type MockingbirdConfig } from '../../../src/api/state/config-store.js';

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
});
