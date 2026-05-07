import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../src/engine/index.js';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const REGISTRY_JSON = resolve(__dirname, '../fixtures/registry/test-registry.json');

describe('Items API', () => {
  describe('GET /api/items/:id', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns an item by GUID', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe('a1b2c3d4-e5f6-7890-abcd-000000000001');
      expect(body.sharedFields).toBeDefined();
    });

    it('returns 404 for unknown GUID', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000000' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/items/by-path', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns an item by Sitecore path', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/by-path?path=/sitecore/templates/Project/MyProject/MyTemplate' });
      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe('a1b2c3d4-e5f6-7890-abcd-000000000001');
    });

    it('returns 404 for unknown path', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/by-path?path=/sitecore/nonexistent' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/items', () => {
    let app: FastifyInstance;
    let tempDir: string;
    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-test-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      const result = await createServer({ rootDir: tempDir }); app = result.app; await result.engine.readiness.ready();
    });
    afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

    it('creates a template', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'template', name: 'ApiTemplate', parentPath: '/sitecore/templates/Project/MyProject' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().path).toContain('ApiTemplate');
    });

    it('creates a section', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'section', name: 'Content', parentPath: '/sitecore/templates/Project/MyProject/MyTemplate' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().path).toContain('Content');
    });

    it('creates a field', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'field', name: 'Heading', parentPath: '/sitecore/templates/Project/MyProject/MyTemplate/Data', fieldType: 'Single-Line Text' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().path).toContain('Heading');
    });

    it('returns 400 for unknown type', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'invalid', name: 'X', parentPath: '/sitecore/templates' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /api/items/:id', () => {
    let app: FastifyInstance;
    let tempDir: string;
    const CONTENT_ID = 'c0010001-0000-0000-0000-000000000001';
    const TITLE_FIELD_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000003';
    const STANDARD_VALUES_FIELD_ID = 'f7d48a55-2158-4f02-9356-756654404f73';
    const CONTENT_YAML = `---
ID: "c0010001-0000-0000-0000-000000000001"
Parent: "b2c3d4e5-f6a7-8901-bcde-000000000000"
Template: "a1b2c3d4-e5f6-7890-abcd-000000000001"
Path: /sitecore/templates/Project/MyProject/MyContent
SharedFields:
- ID: "f7d48a55-2158-4f02-9356-756654404f73"
  Hint: __Standard values
  Value: ""
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "a1b2c3d4-e5f6-7890-abcd-000000000003"
      Hint: Title
      Value: Original v1 Title
  - Version: 2
    Fields:
    - ID: "a1b2c3d4-e5f6-7890-abcd-000000000003"
      Hint: Title
      Value: Original v2 Title
`;

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-put-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      await writeFile(resolve(tempDir, 'authoring/items/templates/MyProject/MyContent.yml'), CONTENT_YAML, 'utf-8');
      const result = await createServer({ rootDir: tempDir }); app = result.app; await result.engine.readiness.ready();
    });
    afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

    it('versioned-field write updates only the targeted (lang, version) slot', async () => {
      const response = await app.inject({
        method: 'PUT', url: `/api/items/${CONTENT_ID}`,
        payload: { fields: { [TITLE_FIELD_ID]: 'Updated v1' }, language: 'en', version: 1 },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();

      const en = body.languages.find((l: { language: string }) => l.language === 'en');
      const v1 = en.versions.find((v: { version: number }) => v.version === 1);
      const v2 = en.versions.find((v: { version: number }) => v.version === 2);
      expect(v1.fields.find((f: { id: string }) => f.id === TITLE_FIELD_ID).value).toBe('Updated v1');
      expect(v2.fields.find((f: { id: string }) => f.id === TITLE_FIELD_ID).value).toBe('Original v2 Title');
    });

    it('versioned-field write does not pollute SharedFields', async () => {
      const response = await app.inject({
        method: 'PUT', url: `/api/items/${CONTENT_ID}`,
        payload: { fields: { [TITLE_FIELD_ID]: 'Anything' }, language: 'en', version: 1 },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sharedFields.find((f: { id: string }) => f.id === TITLE_FIELD_ID)).toBeUndefined();
    });

    it('versioned-field write to a missing version creates that version slot', async () => {
      const response = await app.inject({
        method: 'PUT', url: `/api/items/${CONTENT_ID}`,
        payload: { fields: { [TITLE_FIELD_ID]: 'Brand new v3' }, language: 'en', version: 3 },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const en = body.languages.find((l: { language: string }) => l.language === 'en');
      const v3 = en.versions.find((v: { version: number }) => v.version === 3);
      expect(v3).toBeDefined();
      expect(v3.fields.find((f: { id: string }) => f.id === TITLE_FIELD_ID).value).toBe('Brand new v3');
      const v1 = en.versions.find((v: { version: number }) => v.version === 1);
      expect(v1.fields.find((f: { id: string }) => f.id === TITLE_FIELD_ID).value).toBe('Original v1 Title');
    });

    it('shared-field write routes to SharedFields (regression)', async () => {
      const response = await app.inject({
        method: 'PUT', url: `/api/items/${CONTENT_ID}`,
        payload: { fields: { [STANDARD_VALUES_FIELD_ID]: '{ABCDEF12-3456-7890-ABCD-EF1234567890}' }, language: 'en', version: 1 },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sharedFields.find((f: { id: string }) => f.id === STANDARD_VALUES_FIELD_ID).value).toBe('{ABCDEF12-3456-7890-ABCD-EF1234567890}');
      const en = body.languages.find((l: { language: string }) => l.language === 'en');
      const v1 = en.versions.find((v: { version: number }) => v.version === 1);
      expect(v1.fields.find((f: { id: string }) => f.id === STANDARD_VALUES_FIELD_ID)).toBeUndefined();
    });
  });

  describe('POST /api/items/:id/trim-versions', () => {
    let app: FastifyInstance;
    let tempDir: string;
    const CONTENT_ID = 'c0010002-0000-0000-0000-000000000002';
    const TITLE_FIELD_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000003';
    const STANDARD_VALUES_FIELD_ID = 'f7d48a55-2158-4f02-9356-756654404f73';
    const UNVERSIONED_FIELD_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
    const versionsBlock = (count: number) => Array.from({ length: count }, (_, i) => `  - Version: ${i + 1}
    Fields:
    - ID: "${TITLE_FIELD_ID}"
      Hint: Title
      Value: v${i + 1} title`).join('\n');
    const CONTENT_YAML = `---
ID: "${CONTENT_ID}"
Parent: "b2c3d4e5-f6a7-8901-bcde-000000000000"
Template: "a1b2c3d4-e5f6-7890-abcd-000000000001"
Path: /sitecore/templates/Project/MyProject/TrimMe
SharedFields:
- ID: "${STANDARD_VALUES_FIELD_ID}"
  Hint: __Standard values
  Value: ""
Languages:
- Language: en
  Fields:
  - ID: "${UNVERSIONED_FIELD_ID}"
    Hint: SomeUnversionedField
    Value: stays
  Versions:
${versionsBlock(8)}
- Language: de
  Versions:
${versionsBlock(3)}
`;

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-trim-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      await writeFile(resolve(tempDir, 'authoring/items/templates/MyProject/TrimMe.yml'), CONTENT_YAML, 'utf-8');
      const result = await createServer({ rootDir: tempDir }); app = result.app; await result.engine.readiness.ready();
    });
    afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

    it('keeps top-N versions by number for the targeted language; drops the rest', async () => {
      const response = await app.inject({
        method: 'POST', url: `/api/items/${CONTENT_ID}/trim-versions`,
        payload: { language: 'en', keepCount: 5 },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const en = body.languages.find((l: { language: string }) => l.language === 'en');
      expect(en.versions.map((v: { version: number }) => v.version).sort((a: number, b: number) => a - b)).toEqual([4, 5, 6, 7, 8]);
    });

    it('does not touch other languages', async () => {
      const response = await app.inject({
        method: 'POST', url: `/api/items/${CONTENT_ID}/trim-versions`,
        payload: { language: 'en', keepCount: 5 },
      });
      const body = response.json();
      const de = body.languages.find((l: { language: string }) => l.language === 'de');
      expect(de.versions.map((v: { version: number }) => v.version).sort((a: number, b: number) => a - b)).toEqual([1, 2, 3]);
    });

    it('does not touch SharedFields or unversioned (Language.Fields) entries', async () => {
      const response = await app.inject({
        method: 'POST', url: `/api/items/${CONTENT_ID}/trim-versions`,
        payload: { language: 'en', keepCount: 5 },
      });
      const body = response.json();
      expect(body.sharedFields.find((f: { id: string }) => f.id === STANDARD_VALUES_FIELD_ID)).toBeDefined();
      const en = body.languages.find((l: { language: string }) => l.language === 'en');
      expect(en.fields.find((f: { id: string }) => f.id === UNVERSIONED_FIELD_ID)?.value).toBe('stays');
    });

    it('is a no-op when version count is already <= keepCount', async () => {
      const response = await app.inject({
        method: 'POST', url: `/api/items/${CONTENT_ID}/trim-versions`,
        payload: { language: 'de', keepCount: 5 },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const de = body.languages.find((l: { language: string }) => l.language === 'de');
      expect(de.versions.map((v: { version: number }) => v.version).sort((a: number, b: number) => a - b)).toEqual([1, 2, 3]);
    });

    it('returns 400 on invalid keepCount', async () => {
      const r = await app.inject({
        method: 'POST', url: `/api/items/${CONTENT_ID}/trim-versions`,
        payload: { language: 'en', keepCount: 0 },
      });
      expect(r.statusCode).toBe(400);
    });

    it('returns 404 on unknown language', async () => {
      const r = await app.inject({
        method: 'POST', url: `/api/items/${CONTENT_ID}/trim-versions`,
        payload: { language: 'fr', keepCount: 5 },
      });
      expect(r.statusCode).toBe(404);
    });

    it('item GET response includes fileSizeBytes', async () => {
      const r = await app.inject({ method: 'GET', url: `/api/items/${CONTENT_ID}` });
      expect(r.statusCode).toBe(200);
      const body = r.json();
      expect(typeof body.fileSizeBytes).toBe('number');
      expect(body.fileSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/items/:id', () => {
    let app: FastifyInstance;
    let tempDir: string;
    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-del-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      const result = await createServer({ rootDir: tempDir }); app = result.app; await result.engine.readiness.ready();
    });
    afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

    it('deletes an item', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000004' });
      expect(response.statusCode).toBe(200);
      expect(response.json().deleted).toBe(true);
    });

    it('returns 404 for unknown item', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/items/00000000-0000-0000-0000-000000000000' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT/DELETE rollback semantics on applyPlan failure', () => {
    let app: FastifyInstance;
    let engine: Engine;
    let tempDir: string;
    const CONTENT_ID = 'c0010001-0000-0000-0000-000000000001';
    const TITLE_FIELD_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000003';
    const CONTENT_YAML = `---
ID: "c0010001-0000-0000-0000-000000000001"
Parent: "b2c3d4e5-f6a7-8901-bcde-000000000000"
Template: "a1b2c3d4-e5f6-7890-abcd-000000000001"
Path: /sitecore/templates/Project/MyProject/MyContent
SharedFields:
- ID: "f7d48a55-2158-4f02-9356-756654404f73"
  Hint: __Standard values
  Value: ""
Languages:
- Language: en
  Versions:
  - Version: 1
    Fields:
    - ID: "a1b2c3d4-e5f6-7890-abcd-000000000003"
      Hint: Title
      Value: Original Title
`;

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-rollback-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      await writeFile(resolve(tempDir, 'authoring/items/templates/MyProject/MyContent.yml'), CONTENT_YAML, 'utf-8');
      const result = await createServer({ rootDir: tempDir });
      app = result.app;
      engine = result.engine;
      await engine.readiness.ready();
    });
    afterEach(async () => { vi.restoreAllMocks(); await app.close(); await rm(tempDir, { recursive: true, force: true }); });

    it('rolls back PUT in-memory mutation if applyPlan fails', async () => {
      // Mock applyPlan to throw on its next call. The handler has already
      // mutated node.item.fields in-memory by then, so absent rollback the
      // tree would show "Brand New" while disk still has "Original Title".
      const spy = vi.spyOn(engine, 'applyPlan').mockRejectedValueOnce(new Error('synthetic disk failure'));

      const response = await app.inject({
        method: 'PUT', url: `/api/items/${CONTENT_ID}`,
        payload: { fields: { [TITLE_FIELD_ID]: 'Brand New' }, language: 'en', version: 1 },
      });
      expect(response.statusCode).toBe(500);
      expect(spy).toHaveBeenCalledTimes(1);

      // The in-memory tree must still show the OLD value.
      const node = engine.getItemById(CONTENT_ID);
      expect(node).toBeDefined();
      const en = node!.item.languages.find(l => l.language === 'en')!;
      const v1 = en.versions.find(v => v.version === 1)!;
      const titleField = v1.fields.find(f => f.id === TITLE_FIELD_ID);
      expect(titleField?.value).toBe('Original Title');
    });

    it('DELETE deletes in-memory before disk so applyPlan failure does not leave a phantom item', async () => {
      // Pick an item that exists in the fixture content tree.
      const TARGET_ID = 'a1b2c3d4-e5f6-7890-abcd-000000000004';
      // Prove the item exists in-memory before the call.
      expect(engine.getItemById(TARGET_ID)).toBeDefined();

      const spy = vi.spyOn(engine, 'applyPlan').mockRejectedValueOnce(new Error('synthetic disk failure'));

      const response = await app.inject({ method: 'DELETE', url: `/api/items/${TARGET_ID}` });
      // applyPlan threw, so the route should surface a 5xx (Fastify wraps
      // unhandled errors as 500). Either way, the in-memory delete must
      // have already happened.
      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      expect(spy).toHaveBeenCalledTimes(1);

      // Critical: in-memory tree no longer has the item, even though the
      // disk-side delete failed. The next reload (or watcher event) will
      // reconcile the orphan YAML.
      expect(engine.getItemById(TARGET_ID)).toBeUndefined();
    });
  });

  describe('GET /api/items/:itemId/placeholder-paths', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      const result = await createServer({ rootDir: FIXTURES });
      app = result.app;
      await result.engine.readiness.ready();
    });
    afterAll(async () => {
      await app.close();
    });

    it('returns 404 for an unknown item', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000099/placeholder-paths' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Item not found' });
    });

    it('returns paths array for a known item', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/placeholder-paths' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.paths).toBeInstanceOf(Array);
      if (body.paths.length > 0) {
        expect(body.paths[0]).toMatchObject({
          value: expect.any(String),
          source: expect.stringMatching(/^(in-xml|discovered)$/),
        });
      }
    });

    it('accepts optional language query parameter', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/placeholder-paths?language=de' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.paths).toBeInstanceOf(Array);
    });
  });

  describe('GET /api/items/:id - registry fallback', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES, registryPath: REGISTRY_JSON }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns a registry-only item with source="registry"', async () => {
      // Sitecore "Standard template" - present in tests/fixtures/registry/test-registry.json
      const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
      const response = await app.inject({ method: 'GET', url: `/api/items/${STANDARD_TEMPLATE_ID}` });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.source).toBe('registry');
      expect(body.id).toBe(STANDARD_TEMPLATE_ID);
      expect(Array.isArray(body.sharedFields)).toBe(true);
      expect(body.languages).toEqual([]);
      expect(body.filePath).toBe('');
    });

    it('returns 404 for a GUID present in neither store', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000000' });
      expect(response.statusCode).toBe(404);
    });

    it('template-schema endpoint resolves for a registry-only item', async () => {
      const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
      const response = await app.inject({ method: 'GET', url: `/api/items/${STANDARD_TEMPLATE_ID}/template-schema` });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sections).toBeDefined();
    });

    it('template-schema endpoint still 404s for unknown GUIDs', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000000/template-schema' });
      expect(response.statusCode).toBe(404);
    });

    it('placeholder-paths endpoint resolves for a registry-only item', async () => {
      const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';
      const response = await app.inject({ method: 'GET', url: `/api/items/${STANDARD_TEMPLATE_ID}/placeholder-paths` });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.paths)).toBe(true);
    });

    it('by-path returns a registry-only item with source="registry"', async () => {
      const STANDARD_TEMPLATE_PATH = '/sitecore/templates/System/Templates/Standard template';
      const response = await app.inject({ method: 'GET', url: `/api/items/by-path?path=${encodeURIComponent(STANDARD_TEMPLATE_PATH)}` });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.source).toBe('registry');
      expect(body.id).toBe('1930bbeb-7805-471a-a3be-4858ac7cf696');
      expect(body.path).toBe(STANDARD_TEMPLATE_PATH);
      expect(Array.isArray(body.sharedFields)).toBe(true);
    });

    it('by-path returns 404 when the path is in neither tree nor registry', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/by-path?path=/sitecore/nonexistent' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/items - fromTemplate', () => {
    let app: FastifyInstance;
    let tempDir: string;
    const PARENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const PAGE_TPL_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const EXISTING_CHILD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-from-tpl-'));
      await mkdir(join(tempDir, 'items', 'Parent'), { recursive: true });

      await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
        modules: ['*.module.json'],
      }), 'utf-8');
      await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
        namespace: 'mod',
        items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
      }), 'utf-8');

      // Parent at /sitecore/content/Parent
      await writeFile(join(tempDir, 'items', 'Parent.yml'), `---
ID: "{${PARENT_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${PAGE_TPL_ID.toUpperCase()}}"
Path: /sitecore/content/Parent
`, 'utf-8');

      // Existing child of Parent named "Existing" - for collision test
      await writeFile(join(tempDir, 'items', 'Parent', 'Existing.yml'), `---
ID: "{${EXISTING_CHILD_ID.toUpperCase()}}"
Parent: "{${PARENT_ID.toUpperCase()}}"
Template: "{${PAGE_TPL_ID.toUpperCase()}}"
Path: /sitecore/content/Parent/Existing
`, 'utf-8');

      // Page template item (id PAGE_TPL_ID)
      await writeFile(join(tempDir, 'items', 'Page.yml'), `---
ID: "{${PAGE_TPL_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"
Path: /sitecore/content/Page
`, 'utf-8');

      const result = await createServer({ rootDir: tempDir });
      app = result.app;
      await result.engine.readiness.ready();
    });

    afterEach(async () => {
      await app.close();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('creates an item from a template (happy path)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: {
          type: 'fromTemplate',
          parentPath: '/sitecore/content/Parent',
          templateId: PAGE_TPL_ID,
          name: 'NewChild',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: string; name: string; template: string; path: string };
      expect(body.name).toBe('NewChild');
      expect(body.template).toBe(PAGE_TPL_ID);
      expect(body.path).toBe('/sitecore/content/Parent/NewChild');
    });

    it('returns 400 when fromTemplate name has invalid characters', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: {
          type: 'fromTemplate',
          parentPath: '/sitecore/content/Parent',
          templateId: PAGE_TPL_ID,
          name: 'Bad/Name',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/invalid characters/);
    });

    it('returns 400 when fromTemplate name collides with existing sibling (case-insensitive)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: {
          type: 'fromTemplate',
          parentPath: '/sitecore/content/Parent',
          templateId: PAGE_TPL_ID,
          name: 'EXISTING',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/already exists/);
    });

    it('returns 400 when templateId is missing', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'fromTemplate', parentPath: '/sitecore/content/Parent', name: 'X' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/templateId/);
    });

    it('returns 404 when fromTemplate parentPath does not resolve', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: {
          type: 'fromTemplate', parentPath: '/sitecore/content/DoesNotExist',
          templateId: PAGE_TPL_ID, name: 'X',
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when templateId does not resolve', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: {
          type: 'fromTemplate', parentPath: '/sitecore/content/Parent',
          templateId: '00000000-0000-0000-0000-000000000999', name: 'X',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/Template not found/i);
    });
  });

  describe('POST /api/items - duplicate', () => {
    let app: FastifyInstance;
    let tempDir: string;
    const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const SOURCE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const PAGE_TPL_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-dup-'));
      await mkdir(join(tempDir, 'items', 'Parent'), { recursive: true });
      await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
        modules: ['*.module.json'],
      }), 'utf-8');
      await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
        namespace: 'mod',
        items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
      }), 'utf-8');

      // Parent at /sitecore/content/Parent
      await writeFile(join(tempDir, 'items', 'Parent.yml'), `---
ID: "{${PARENT_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{${PAGE_TPL_ID.toUpperCase()}}"
Path: /sitecore/content/Parent
`, 'utf-8');

      // Source at /sitecore/content/Parent/Source
      await writeFile(join(tempDir, 'items', 'Parent', 'Source.yml'), `---
ID: "{${SOURCE_ID.toUpperCase()}}"
Parent: "{${PARENT_ID.toUpperCase()}}"
Template: "{${PAGE_TPL_ID.toUpperCase()}}"
Path: /sitecore/content/Parent/Source
`, 'utf-8');

      // Page template
      await writeFile(join(tempDir, 'items', 'Page.yml'), `---
ID: "{${PAGE_TPL_ID.toUpperCase()}}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"
Path: /sitecore/content/Page
`, 'utf-8');

      const result = await createServer({ rootDir: tempDir });
      app = result.app;
      await result.engine.readiness.ready();
    });

    afterEach(async () => {
      await app.close();
      await rm(tempDir, { recursive: true, force: true });
    });

    it('duplicates an item (happy path)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'duplicate', sourceId: SOURCE_ID, name: 'SourceCopy' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe('SourceCopy');
      expect(body.id).not.toBe(SOURCE_ID);
      expect(body.path).toBe('/sitecore/content/Parent/SourceCopy');
    });

    it('returns 400 when sourceId is missing', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'duplicate', name: 'Copy' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/sourceId/);
    });

    it('returns 404 when sourceId does not resolve', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'duplicate', sourceId: '00000000-0000-0000-0000-000000000000', name: 'Copy' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 on invalid name', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'duplicate', sourceId: SOURCE_ID, name: 'Bad/Name' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/invalid characters/i);
    });

    it('returns 400 on name collision with existing sibling', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/items',
        payload: { type: 'duplicate', sourceId: SOURCE_ID, name: 'Source' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/already exists/i);
    });
  });

  describe('GET /api/items/:id/yaml', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns yaml + filePath for a disk item', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/yaml' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.yaml).toBe('string');
      expect(body.yaml.length).toBeGreaterThan(0);
      expect(body.yaml).toContain('a1b2c3d4-e5f6-7890-abcd-000000000001');
      expect(typeof body.filePath).toBe('string');
      expect(body.filePath).toMatch(/\.yml$/);
    });

    it('returns 404 for a registry-only id (registry YAML is out of scope for v1)', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/1930bbeb-7805-471a-a3be-4858ac7cf696/yaml' });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for a totally unknown id', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000000/yaml' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/items/search', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns items matching a Name eq predicate', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items/search',
        payload: { predicate: { field: 'Name', op: 'eq', value: 'MyTemplate' } },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ id: string; path: string }>; total: number };
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.some(i => i.path === '/sitecore/templates/Project/MyProject/MyTemplate')).toBe(true);
    });

    it('returns items matching a Path like predicate', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items/search',
        payload: { predicate: { field: 'Path', op: 'like', value: '*MyTemplate*' } },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ id: string; path: string }> };
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every(i => i.path.toLowerCase().includes('mytemplate'))).toBe(true);
    });

    it('returns 400 when predicate is missing', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items/search',
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for unsupported predicate ops', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items/search',
        payload: { predicate: { field: 'Name', op: 'regex', value: '.*' } },
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toMatch(/not supported/i);
    });

    it('respects the limit parameter', async () => {
      const response = await app.inject({
        method: 'POST', url: '/api/items/search',
        payload: { predicate: { field: 'Path', op: 'like', value: '/sitecore/*' }, limit: 1 },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ id: string; path: string }> };
      expect(body.items.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/items/:id/references', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns items referenced by the given item via shared field GUIDs', async () => {
      // MyTemplate has __Base template field pointing to {1930BBEB-7805-471A-A3BE-4858AC7CF696}
      const response = await app.inject({ method: 'GET', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/references' });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ id: string; path: string }> };
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000000/references' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/items/:id/referrers', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns items whose fields contain the target id', async () => {
      // MyTemplate Standard Values is referenced from MyTemplate's __Standard values shared field
      const response = await app.inject({ method: 'GET', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000005/referrers' });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ id: string; path: string }> };
      expect(Array.isArray(body.items)).toBe(true);
      // MyTemplate references Standard Values via the __Standard values field
      expect(body.items.some(i => i.id === 'a1b2c3d4-e5f6-7890-abcd-000000000001')).toBe(true);
    });

    it('returns 404 for unknown id', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000000/referrers' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/items/:id/unused-datasources', () => {
    let app: FastifyInstance;
    beforeAll(async () => { const result = await createServer({ rootDir: FIXTURES }); app = result.app; await result.engine.readiness.ready(); });
    afterAll(async () => { await app.close(); });

    it('returns 404 for unknown item', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/00000000-0000-0000-0000-000000000000/unused-datasources' });
      expect(response.statusCode).toBe(404);
    });

    it('returns { count: 0, items: [] } for an item with no Page Data folder', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/unused-datasources' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ count: 0, items: [] });
    });
  });

  describe('POST /api/items/:id/unused-datasources/cleanup', () => {
    let app: FastifyInstance;
    let tempDir: string;
    beforeEach(async () => {
      tempDir = await mkdtemp(resolve(tmpdir(), 'scp-api-cleanup-'));
      cpSync(FIXTURES, tempDir, { recursive: true });
      const result = await createServer({ rootDir: tempDir }); app = result.app; await result.engine.readiness.ready();
    });
    afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

    it('returns 404 for unknown parent item', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/items/00000000-0000-0000-0000-000000000000/unused-datasources/cleanup',
        payload: { itemIds: [] },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 200 with empty deleted/failed when itemIds is empty', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/unused-datasources/cleanup',
        payload: { itemIds: [] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ deleted: [], failed: [] });
    });

    it('returns 400 when an itemId is not currently unused (defense-in-depth)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/items/a1b2c3d4-e5f6-7890-abcd-000000000001/unused-datasources/cleanup',
        payload: { itemIds: ['00000000-0000-0000-0000-000000000099'] },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().invalidItemIds).toContain('00000000-0000-0000-0000-000000000099');
    });
  });
});
