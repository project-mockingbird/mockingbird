import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import { writeConfig } from '../../src/api/state/config-store.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;
let workspaceRoot: string;
let projectPath: string;
let configPath: string;
const registryFixture = resolve(__dirname, '../../data/registry.json.gz');

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `boot-replay-test-${Date.now()}`);
  projectPath = join(workspaceRoot, 'project-r');
  await mkdir(join(projectPath, 'items'), { recursive: true });
  await writeFile(
    join(projectPath, 'sitecore.json'),
    JSON.stringify({
      modules: ['*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(projectPath, 'r.module.json'),
    JSON.stringify({
      namespace: 'R',
      items: { path: 'items', includes: [{ name: 'foo', path: '/sitecore/content/r', allowedPushOperations: 'CreateUpdateAndDelete' }] },
    }),
  );
  configPath = join(workspaceRoot, 'config.mockingbird');
  process.env.MOCKINGBIRD_WORKSPACE = workspaceRoot;
  process.env.MOCKINGBIRD_CONFIG_PATH = configPath;
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  delete process.env.MOCKINGBIRD_WORKSPACE;
  delete process.env.MOCKINGBIRD_CONFIG_PATH;
});

afterEach(async () => {
  if (app) { await app.close(); app = null; }
  await rm(configPath, { force: true });
});

describe('boot replay', () => {
  it('replays openWorkspace when config has a valid lastOpenedHash', async () => {
    await writeConfig(configPath, {
      version: 1,
      projects: {
        'abc123abc123': {
          hash: 'abc123abc123',
          name: 'Project R',
          layers: [{ sitecoreJsonPath: '/project-r/sitecore.json', name: 'project-r', color: '#22c55e' }],
          createdAt: 1,
          lastOpenedAt: 2,
        },
      },
      lastOpenedHash: 'abc123abc123',
    });

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;

    // After createServer returns, engine should NOT be in no-project state.
    expect(['initializing', 'ready']).toContain(created.engine.readiness.state);

    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('ready');
  });

  it('stays in no-project when lastOpenedHash points to a missing project', async () => {
    await writeConfig(configPath, {
      version: 1,
      projects: {},
      lastOpenedHash: 'stale-hash-xx',
    });

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('no-project');
  });

  it('stays in no-project when config has no lastOpenedHash', async () => {
    await writeConfig(configPath, { version: 1, projects: {} });

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('no-project');
  });

  it('skips replay when SCS_SITECORE_JSON / rootDir is set (env wins)', async () => {
    await writeConfig(configPath, {
      version: 1,
      projects: {
        'abc123abc123': {
          hash: 'abc123abc123',
          name: 'Project R',
          layers: [{ sitecoreJsonPath: '/project-r/sitecore.json', name: 'project-r', color: '#22c55e' }],
          createdAt: 1,
          lastOpenedAt: 2,
        },
      },
      lastOpenedHash: 'abc123abc123',
    });

    // Pass a rootDir to createServer; this is what index.ts does when
    // SCS_SITECORE_JSON is set. Boot-replay must NOT fire.
    const created = await createServer({
      registryPath: registryFixture,
      rootDir: projectPath,
    });
    app = created.app;
    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('ready');

    // Hash should still be in the config, untouched by boot-replay path
    const { readConfig } = await import('../../src/api/state/config-store.js');
    const after = await readConfig(configPath);
    expect(after.lastOpenedHash).toBe('abc123abc123');
  });

  it('catches openWorkspace failure and continues in no-project', async () => {
    // Use a reserved layer name ('ootb') which engine.openWorkspace rejects
    // synchronously with a throw regardless of lazy mode.
    await writeConfig(configPath, {
      version: 1,
      projects: {
        'badpaths-hash': {
          hash: 'badpaths-hash',
          name: 'Bad Paths',
          layers: [{ sitecoreJsonPath: '/project-r/sitecore.json', name: 'ootb', color: '#000' }],
          createdAt: 1,
          lastOpenedAt: 2,
        },
      },
      lastOpenedHash: 'badpaths-hash',
    });

    const created = await createServer({ registryPath: registryFixture });
    app = created.app;
    await created.engine.readiness.ready();
    expect(created.engine.readiness.state).toBe('no-project');
  });
});
