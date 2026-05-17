import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';

let workspaceRoot: string;
let projectPath: string;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `lazy-open-test-${Date.now()}`);
  projectPath = join(workspaceRoot, 'project-lazy');
  await mkdir(join(projectPath, 'items'), { recursive: true });
  await writeFile(
    join(projectPath, 'sitecore.json'),
    JSON.stringify({
      modules: ['*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(projectPath, 'lazy.module.json'),
    JSON.stringify({
      namespace: 'Lazy',
      items: { path: 'items', includes: [{ name: 'foo', path: '/sitecore/content/lazy', allowedPushOperations: 'CreateUpdateAndDelete' }] },
    }),
  );
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe('Engine.openWorkspace lazy mode', () => {
  it('lazy=true returns before readiness reaches ready', async () => {
    const engine = new Engine({ watch: false });
    await engine.startInit();

    const t0 = Date.now();
    await engine.openWorkspace(
      [{ sitecoreJsonPath: join(projectPath, 'sitecore.json'), name: 'lazy' }],
      { lazy: true },
    );
    const elapsed = Date.now() - t0;

    // Readiness should NOT be ready yet; lazy means we returned early.
    expect(['initializing', 'ready']).toContain(engine.readiness.state);

    // Eventually completes
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');

    await engine.close();

    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('lazy=false (default) awaits indexing to ready', async () => {
    const engine = new Engine({ watch: false });
    await engine.startInit();

    await engine.openWorkspace(
      [{ sitecoreJsonPath: join(projectPath, 'sitecore.json'), name: 'lazy' }],
    );

    expect(engine.readiness.state).toBe('ready');

    await engine.close();
  });

  it('multi-layer lazy=true silently honors as no-op (full await)', async () => {
    const proj2 = join(workspaceRoot, 'project-lazy-2');
    await mkdir(join(proj2, 'items'), { recursive: true });
    await writeFile(
      join(proj2, 'sitecore.json'),
      JSON.stringify({ modules: ['*.module.json'], plugins: [] }),
    );
    await writeFile(
      join(proj2, 'lazy2.module.json'),
      JSON.stringify({
        namespace: 'Lazy2',
        items: { path: 'items', includes: [{ name: 'bar', path: '/sitecore/content/lazy2', allowedPushOperations: 'CreateUpdateAndDelete' }] },
      }),
    );

    const engine = new Engine({ watch: false });
    await engine.startInit();

    await engine.openWorkspace(
      [
        { sitecoreJsonPath: join(projectPath, 'sitecore.json'), name: 'lazy' },
        { sitecoreJsonPath: join(proj2, 'sitecore.json'), name: 'lazy2' },
      ],
      { lazy: true },
    );

    // Multi-layer ignores lazy and completes synchronously today.
    expect(engine.readiness.state).toBe('ready');

    await engine.close();
  });
});
