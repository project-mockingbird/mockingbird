import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { resolve } from 'path';

const registryFixture = resolve(__dirname, '../../data/registry.json.gz');
let engine: Engine | null = null;

afterEach(async () => {
  if (engine) {
    await engine.close();
    engine = null;
  }
});

describe('Engine no-project boot', () => {
  it('boots into no-project state when rootDir is undefined', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });

    await engine.startInit();
    await engine.readiness.ready();

    expect(engine.readiness.state).toBe('no-project');
  });

  it('loads OOTB registry even without a rootDir', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });

    await engine.startInit();
    await engine.readiness.ready();

    expect(engine.isRegistryLoaded()).toBe(true);
    expect(engine.registrySize()).toBeGreaterThan(0);
  });

  it('reports zero serialized items when no rootDir is configured', async () => {
    engine = new Engine({
      rootDir: undefined,
      watch: false,
      registryPath: registryFixture,
    });

    await engine.startInit();
    await engine.readiness.ready();

    expect(engine.getAllItems().length).toBe(0);
  });
});
