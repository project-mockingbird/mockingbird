import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { resolve } from 'path';

const fixture = resolve(__dirname, '../fixtures/valid');
const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
let engine: Engine | null = null;

afterEach(async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
});

describe('Engine.closeWorkspace()', () => {
  it('transitions a ready engine back to no-project', async () => {
    engine = new Engine({
      rootDir: fixture,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('ready');

    await engine.closeWorkspace();

    expect(engine.readiness.state).toBe('no-project');
    expect(engine.getAllItems().length).toBe(0);
  });

  it('is a no-op when called from no-project state', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();
    expect(engine.readiness.state).toBe('no-project');

    await engine.closeWorkspace();

    expect(engine.readiness.state).toBe('no-project');
  });

  it('preserves the OOTB registry after close', async () => {
    engine = new Engine({
      rootDir: fixture,
      watch: false,
      registryPath: registryFixture,
    });
    await engine.startInit();
    await engine.readiness.ready();

    await engine.closeWorkspace();

    expect(engine.isRegistryLoaded()).toBe(true);
    expect(engine.registrySize()).toBeGreaterThan(0);
  });
});
