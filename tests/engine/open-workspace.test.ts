import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { resolve, join } from 'path';

const fixture = resolve(__dirname, '../fixtures/valid');
const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
let engine: Engine | null = null;

afterEach(async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
});

describe('Engine.openWorkspace() - single layer', () => {
  it('opens a workspace from no-project state', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('no-project');

    await engine.openWorkspace([
      { sitecoreJsonPath: join(fixture, 'sitecore.json'), name: 'default' },
    ]);

    expect(engine.readiness.state).toBe('ready');
    expect(engine.getAllItems().length).toBeGreaterThan(0);
  });

  it('exposes the active layer set via getLayers()', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();

    const layer = { sitecoreJsonPath: join(fixture, 'sitecore.json'), name: 'default', color: '#4a9eff' };
    await engine.openWorkspace([layer]);

    const layers = engine.getLayers();
    expect(layers.length).toBe(1);
    expect(layers[0].name).toBe('default');
    expect(layers[0].color).toBe('#4a9eff');
  });

  it('closes a previously-open workspace before opening a new one', async () => {
    engine = new Engine({
      rootDir: fixture,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');
    const initialItemCount = engine.getAllItems().length;

    // Re-open with the same workspace - tree should match initial count after reload
    await engine.openWorkspace([
      { sitecoreJsonPath: join(fixture, 'sitecore.json'), name: 'reopened' },
    ]);

    expect(engine.readiness.state).toBe('ready');
    expect(engine.getAllItems().length).toBe(initialItemCount);
    expect(engine.getLayers()[0].name).toBe('reopened');
  });

  it('returns to no-project on openWorkspace with empty layer list', async () => {
    engine = new Engine({
      rootDir: fixture,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();

    await engine.openWorkspace([]);

    expect(engine.readiness.state).toBe('no-project');
    expect(engine.getLayers().length).toBe(0);
  });

  it('getProjectName returns the name passed to openWorkspace', async () => {
    engine = new Engine({ watch: false, registryPath: registryFixture });
    await engine.openWorkspace(
      [{ sitecoreJsonPath: join(fixture, 'sitecore.json'), name: 'default' }],
      { projectName: 'my-project' },
    );
    expect(engine.getProjectName()).toBe('my-project');
  });

  it('getProjectName returns null when no projectName is passed', async () => {
    engine = new Engine({ watch: false, registryPath: registryFixture });
    await engine.openWorkspace([
      { sitecoreJsonPath: join(fixture, 'sitecore.json'), name: 'default' },
    ]);
    expect(engine.getProjectName()).toBeNull();
  });

  it('getProjectName is cleared when closeWorkspace is called', async () => {
    engine = new Engine({ watch: false, registryPath: registryFixture });
    await engine.openWorkspace(
      [{ sitecoreJsonPath: join(fixture, 'sitecore.json'), name: 'default' }],
      { projectName: 'cleared-after-close' },
    );
    expect(engine.getProjectName()).toBe('cleared-after-close');
    await engine.closeWorkspace();
    expect(engine.getProjectName()).toBeNull();
  });
});
