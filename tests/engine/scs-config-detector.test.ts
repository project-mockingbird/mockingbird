import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { discoverScsConfigs } from '../../src/engine/scs-config-detector.js';

let workspaceRoot: string;

beforeAll(async () => {
  workspaceRoot = resolve(tmpdir(), `scs-detector-test-${Date.now()}`);
  await mkdir(workspaceRoot, { recursive: true });

  // Project A: standard sitecore.json at root + nested authoring/items module
  await mkdir(join(workspaceRoot, 'project-a', 'authoring', 'items'), { recursive: true });
  await writeFile(
    join(workspaceRoot, 'project-a', 'sitecore.json'),
    JSON.stringify({
      $schema: './.sitecore/schemas/RootConfigurationFile.schema.json',
      modules: ['authoring/items/**/*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );
  await writeFile(
    join(workspaceRoot, 'project-a', 'authoring', 'items', 'a.module.json'),
    JSON.stringify({
      namespace: 'A',
      items: {
        path: 'items',
        includes: [
          { name: 'templates', path: '/sitecore/templates/A', allowedPushOperations: 'CreateUpdateAndDelete' },
        ],
      },
    }),
  );

  // Project B: a sitecore.json under a subdir, named with custom name
  await mkdir(join(workspaceRoot, 'project-b'), { recursive: true });
  await writeFile(
    join(workspaceRoot, 'project-b', 'workspace.json'),
    JSON.stringify({
      $schema: './.sitecore/schemas/RootConfigurationFile.schema.json',
      modules: ['m/*.module.json'],
      plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'],
    }),
  );

  // Decoy: a JSON file with neither modules nor plugins arrays
  await writeFile(
    join(workspaceRoot, 'package.json'),
    JSON.stringify({ name: 'random', dependencies: {} }),
  );

  // Decoy: a tsconfig (no plugins or modules)
  await writeFile(
    join(workspaceRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'esnext' } }),
  );
});

afterAll(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe('discoverScsConfigs', () => {
  it('finds sitecore.json by content shape, not filename', async () => {
    const results = await discoverScsConfigs(workspaceRoot);
    const paths = results.map((r) => r.sitecoreJsonPath);
    expect(paths).toContain(join(workspaceRoot, 'project-a', 'sitecore.json'));
    expect(paths).toContain(join(workspaceRoot, 'project-b', 'workspace.json'));
  });

  it('excludes JSON files that are not SCS configs', async () => {
    const results = await discoverScsConfigs(workspaceRoot);
    const paths = results.map((r) => r.sitecoreJsonPath);
    expect(paths).not.toContain(join(workspaceRoot, 'package.json'));
    expect(paths).not.toContain(join(workspaceRoot, 'tsconfig.json'));
  });

  it('reports moduleCount and pushOpsSummary per candidate', async () => {
    const results = await discoverScsConfigs(workspaceRoot);
    const projectA = results.find((r) =>
      r.sitecoreJsonPath.endsWith(join('project-a', 'sitecore.json')),
    );
    expect(projectA).toBeDefined();
    expect(projectA!.moduleCount).toBe(1);
    expect(projectA!.pushOpsSummary).toContain('CreateUpdateAndDelete');
  });

  it('reports empty moduleCount when no modules resolve from the glob', async () => {
    const results = await discoverScsConfigs(workspaceRoot);
    const projectB = results.find((r) =>
      r.sitecoreJsonPath.endsWith(join('project-b', 'workspace.json')),
    );
    expect(projectB).toBeDefined();
    expect(projectB!.moduleCount).toBe(0);
  });

  it('returns empty array for nonexistent directories', async () => {
    const results = await discoverScsConfigs(join(workspaceRoot, 'does-not-exist'));
    expect(results).toEqual([]);
  });

  it('skips common noise directories (.git, node_modules)', async () => {
    const noisy = resolve(tmpdir(), `scs-detector-noise-${Date.now()}`);
    await mkdir(join(noisy, '.git'), { recursive: true });
    await mkdir(join(noisy, 'node_modules', 'foo'), { recursive: true });
    // Put a sitecore-shaped config inside node_modules - should be ignored
    await writeFile(
      join(noisy, 'node_modules', 'foo', 'sitecore.json'),
      JSON.stringify({ modules: ['*'], plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'] }),
    );
    // And a legit one at root
    await writeFile(
      join(noisy, 'sitecore.json'),
      JSON.stringify({ modules: ['m/*'], plugins: ['Sitecore.DevEx.Extensibility.Serialization@6.0.23'] }),
    );

    const results = await discoverScsConfigs(noisy);
    const paths = results.map((r) => r.sitecoreJsonPath);
    expect(paths).toEqual([join(noisy, 'sitecore.json')]);

    await rm(noisy, { recursive: true, force: true });
  });
});
