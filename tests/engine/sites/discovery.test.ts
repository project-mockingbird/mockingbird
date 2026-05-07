import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../../src/engine/index.js';
import { discoverSiteDefinitions } from '../../../src/engine/sites/discovery.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../../fixtures/sites');

describe('discoverSiteDefinitions', () => {
  let engine: Engine;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MOCKINGBIRD_ENVIRONMENT;
    } else {
      process.env.MOCKINGBIRD_ENVIRONMENT = originalEnv;
    }
    originalEnv = undefined;
  });

  it('returns all Site Grouping definitions for the fixture content tree', () => {
    const sites = discoverSiteDefinitions(engine);
    expect(sites).toHaveLength(2);
    expect(sites).toContainEqual({
      name: 'SiteA',
      hostname: 'site-a.test',
      language: 'en',
      rootPath: '/sitecore/content/Tenant/SiteA',
      startItem: 'Home',
      linkable: false,
    });
    expect(sites).toContainEqual({
      name: 'SiteB',
      hostname: 'site-b.test|*.preview.test',
      language: 'en',
      rootPath: '/sitecore/content/Tenant/SiteB',
      startItem: 'Home',
      linkable: false,
    });
  });

  it('skips Site Grouping items whose Environment does not match MOCKINGBIRD_ENVIRONMENT', () => {
    originalEnv = process.env.MOCKINGBIRD_ENVIRONMENT;
    process.env.MOCKINGBIRD_ENVIRONMENT = 'Production';
    // Fixture's Site Grouping items both have Environment="*" which always passes; this test
    // confirms the * wildcard escapes the env-mismatch branch.
    const sites = discoverSiteDefinitions(engine);
    expect(sites).toHaveLength(2);
    expect(sites).toContainEqual({
      name: 'SiteA',
      hostname: 'site-a.test',
      language: 'en',
      rootPath: '/sitecore/content/Tenant/SiteA',
      startItem: 'Home',
      linkable: false,
    });
    expect(sites).toContainEqual({
      name: 'SiteB',
      hostname: 'site-b.test|*.preview.test',
      language: 'en',
      rootPath: '/sitecore/content/Tenant/SiteB',
      startItem: 'Home',
      linkable: false,
    });
  });

  it('returns [] when an exception is thrown during iteration', () => {
    const broken = {
      getAllItems: () => { throw new Error('boom'); },
    } as unknown as Engine;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(discoverSiteDefinitions(broken)).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  describe('caching', () => {
    it('returns the same array reference on a repeat call (cache hit)', () => {
      const first = discoverSiteDefinitions(engine);
      const second = discoverSiteDefinitions(engine);
      expect(second).toBe(first);
    });

    it('rebuilds when the tree generation advances (mutation invalidates the cache)', () => {
      const first = discoverSiteDefinitions(engine);
      // Simulate a tree mutation by advancing the generation directly. In
      // production, addItem/removeItem/relinkItem do this for us.
      const tree = (engine as unknown as { tree: { generation: number } }).tree;
      Object.defineProperty(tree, 'generation', {
        get: () => 999,
        configurable: true,
      });
      try {
        const second = discoverSiteDefinitions(engine);
        expect(second).not.toBe(first);
        expect(second).toEqual(first);  // same content, fresh array
      } finally {
        // Restore the original getter so subsequent tests see real values.
        delete (tree as unknown as { generation?: number }).generation;
      }
    });

    it('rebuilds when MOCKINGBIRD_ENVIRONMENT changes', () => {
      // Establish a fresh cache slot for this engine under the empty-env key.
      delete process.env.MOCKINGBIRD_ENVIRONMENT;
      const first = discoverSiteDefinitions(engine);
      originalEnv = process.env.MOCKINGBIRD_ENVIRONMENT;
      process.env.MOCKINGBIRD_ENVIRONMENT = 'Production';
      const second = discoverSiteDefinitions(engine);
      expect(second).not.toBe(first);
      expect(second).toEqual(first);  // both fixtures are Environment="*", same content
    });
  });
});
