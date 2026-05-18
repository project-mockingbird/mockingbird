import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createServer } from '../../../src/api/server.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;
let workspaceRoot: string;
let configPath: string;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `config-route-test-${Date.now()}`);
  await mkdir(workspaceRoot, { recursive: true });
  configPath = join(workspaceRoot, 'config.mockingbird');
  process.env.MOCKINGBIRD_CONFIG_PATH = configPath;
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
  await rm(configPath, { force: true });
});

describe('GET /api/config', () => {
  it('returns default empty config when file does not exist', async () => {
    const { app: a } = await createServer({});
    app = a;
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ version: 1, projects: {} });
  });

  it('returns the file content when present', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        projects: {
          h1: { hash: 'h1', name: 'P', layers: [], createdAt: 1, lastOpenedAt: 2 },
        },
      }),
      'utf-8',
    );
    const { app: a } = await createServer({});
    app = a;
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json().projects.h1.name).toBe('P');
  });
});

describe('PUT /api/config', () => {
  it('writes the body to disk', async () => {
    const { app: a } = await createServer({});
    app = a;
    const body = {
      version: 1,
      projects: {
        h2: {
          hash: 'h2',
          name: 'Saved',
          layers: [{ sitecoreJsonPath: '/x/sitecore.json', name: 'x', color: '#fff' }],
          createdAt: 10,
          lastOpenedAt: 20,
        },
      },
    };
    const res = await app.inject({ method: 'PUT', url: '/api/config', payload: body });
    expect(res.statusCode).toBe(200);
    const get = await app.inject({ method: 'GET', url: '/api/config' });
    expect(get.json()).toEqual(body);
  });

  it('rejects malformed bodies with 400', async () => {
    const { app: a } = await createServer({});
    app = a;
    const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { version: 1 } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-version-1 bodies with 400', async () => {
    const { app: a } = await createServer({});
    app = a;
    const res = await app.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { version: 2, projects: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('preserves existing lastOpenedHash when body omits it', async () => {
    const preservePath = join(workspaceRoot, 'config-put-preserve.mockingbird');
    process.env.MOCKINGBIRD_CONFIG_PATH = preservePath;
    const { writeConfig } = await import('../../../src/api/state/config-store.js');
    await writeConfig(preservePath, {
      version: 1,
      projects: {
        h1: { hash: 'h1', name: 'P', layers: [], createdAt: 1, lastOpenedAt: 2 },
      },
      lastOpenedHash: 'preserve-me',
    });

    const { app: a } = await createServer({});
    app = a;

    const res = await app.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        version: 1,
        projects: {
          h2: { hash: 'h2', name: 'Q', layers: [], createdAt: 3, lastOpenedAt: 4 },
        },
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);

    const { readConfig } = await import('../../../src/api/state/config-store.js');
    const after = await readConfig(preservePath);
    expect(after.lastOpenedHash).toBe('preserve-me');
    expect(after.projects['h2']).toBeDefined();
    expect(after.projects['h1']).toBeUndefined();

    process.env.MOCKINGBIRD_CONFIG_PATH = configPath;
    await rm(preservePath, { force: true });
  });

  it('overwrites lastOpenedHash when body provides one', async () => {
    const overwritePath = join(workspaceRoot, 'config-put-overwrite.mockingbird');
    process.env.MOCKINGBIRD_CONFIG_PATH = overwritePath;
    const { writeConfig } = await import('../../../src/api/state/config-store.js');
    await writeConfig(overwritePath, {
      version: 1,
      projects: {},
      lastOpenedHash: 'old',
    });

    const { app: a } = await createServer({});
    app = a;

    await app.inject({
      method: 'PUT',
      url: '/api/config',
      payload: {
        version: 1,
        projects: {},
        lastOpenedHash: 'new',
      },
      headers: { 'content-type': 'application/json' },
    });

    const { readConfig } = await import('../../../src/api/state/config-store.js');
    const after = await readConfig(overwritePath);
    expect(after.lastOpenedHash).toBe('new');

    process.env.MOCKINGBIRD_CONFIG_PATH = configPath;
    await rm(overwritePath, { force: true });
  });
});
