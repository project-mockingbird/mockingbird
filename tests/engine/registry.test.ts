import { describe, it, expect, beforeAll } from 'vitest';
import { Registry } from '../../src/engine/registry.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_JSON = resolve(__dirname, '../fixtures/registry/test-registry.json');
const FIXTURE_GZ = resolve(__dirname, '../fixtures/registry/test-registry.json.gz');

describe('Registry', () => {
  describe('loadFromJson', () => {
    let registry: Registry;

    beforeAll(async () => {
      registry = new Registry();
      await registry.loadFromJson(FIXTURE_JSON);
    });

    it('loads all items', () => {
      expect(registry.size).toBe(6);
    });

    it('looks up item by ID', () => {
      const item = registry.getById('1930bbeb-7805-471a-a3be-4858ac7cf696');
      expect(item).toBeDefined();
      expect(item!.name).toBe('Standard template');
    });

    it('looks up item by path', () => {
      const item = registry.getByPath('/sitecore/templates/System/Templates/Standard template');
      expect(item).toBeDefined();
      expect(item!.id).toBe('1930bbeb-7805-471a-a3be-4858ac7cf696');
    });

    it('checks existence with has()', () => {
      expect(registry.has('1930bbeb-7805-471a-a3be-4858ac7cf696')).toBe(true);
      expect(registry.has('00000000-0000-0000-0000-000000000000')).toBe(false);
    });

    it('returns undefined for unknown ID', () => {
      expect(registry.getById('nonexistent')).toBeUndefined();
    });

    it('looks up item by ID regardless of brace/case form', () => {
      // Sitecore writes braced uppercase GUIDs in many places (s:id on rendering
      // XML, Tree references, etc.). Registry must normalize to match the tree's
      // getById behavior - canonical form is bare lowercase. Without this, any
      // call site that hands a braced id to lookupUnifiedItem misses the registry.
      const bare = registry.getById('1930bbeb-7805-471a-a3be-4858ac7cf696');
      expect(registry.getById('{1930BBEB-7805-471A-A3BE-4858AC7CF696}')).toBe(bare);
      expect(registry.getById('{1930bbeb-7805-471a-a3be-4858ac7cf696}')).toBe(bare);
      expect(registry.getById('1930BBEB-7805-471A-A3BE-4858AC7CF696')).toBe(bare);
    });

    it('returns all templates', () => {
      const templates = registry.getAllTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });
  });

  describe('loadFromGzip', () => {
    let registry: Registry;

    beforeAll(async () => {
      registry = new Registry();
      await registry.loadFromGzip(FIXTURE_GZ);
    });

    it('loads all items from gzipped file', () => {
      expect(registry.size).toBe(6);
    });

    it('looks up item by ID after gzip load', () => {
      const item = registry.getById('1930bbeb-7805-471a-a3be-4858ac7cf696');
      expect(item).toBeDefined();
      expect(item!.name).toBe('Standard template');
    });
  });

  describe('metadata', () => {
    it('exposes version and source', async () => {
      const registry = new Registry();
      await registry.loadFromJson(FIXTURE_JSON);
      expect(registry.version).toBe('1.0');
      expect(registry.source).toBe('test-fixture');
    });
  });
});
