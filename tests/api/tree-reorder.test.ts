import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const PARENT = '/sitecore/templates/Project/MyProject';
// Real OOTB registry, needed for the 400 (registry/OOTB child) guard test.
// The tempDir fixture only covers serialized items under
// /sitecore/templates/Project/MyProject, so it never collides with the
// registry's System templates subtree.
const REGISTRY_JSON_GZ = resolve(__dirname, '../../data/registry.json.gz');

describe('POST /api/tree/reorder', () => {
  let app: FastifyInstance;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-reorder-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    const result = await createServer({ rootDir: tempDir });
    app = result.app;
    await result.engine.readiness.ready();
  });
  afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

  async function create(payload: Record<string, unknown>) {
    const res = await app.inject({ method: 'POST', url: '/api/items', payload });
    expect(res.statusCode).toBe(201);
    return res.json();
  }
  async function childNames(parentId: string): Promise<string[]> {
    const res = await app.inject({ method: 'GET', url: `/api/tree/children/${parentId}` });
    return res.json().map((c: { name: string }) => c.name);
  }

  it('assigns spaced ascending __Sortorder in the requested order', async () => {
    const tpl = await create({ type: 'template', name: 'ReorderTest', parentPath: PARENT });
    await create({ type: 'section', name: 'Content', parentPath: tpl.path });
    const a = await create({ type: 'field', name: 'Alpha', parentPath: `${tpl.path}/Content`, fieldType: 'Single-Line Text' });
    const b = await create({ type: 'field', name: 'Bravo', parentPath: `${tpl.path}/Content`, fieldType: 'Single-Line Text' });
    const c = await create({ type: 'field', name: 'Charlie', parentPath: `${tpl.path}/Content`, fieldType: 'Single-Line Text' });
    const section = (await app.inject({ method: 'GET', url: `/api/items/by-path?path=${encodeURIComponent(tpl.path + '/Content')}` })).json();

    // Default order (no sortorder set) is by name: Alpha, Bravo, Charlie.
    expect(await childNames(section.id)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    // Reorder to Charlie, Alpha, Bravo.
    const res = await app.inject({
      method: 'POST',
      url: '/api/tree/reorder',
      payload: { parentId: section.id, orderedChildIds: [c.id, a.id, b.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(await childNames(section.id)).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('returns 404 when the parent does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tree/reorder',
      payload: { parentId: '11111111-1111-1111-1111-111111111111', orderedChildIds: ['22222222-2222-2222-2222-222222222222'] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when orderedChildIds is not a permutation of the children', async () => {
    const tpl = await create({ type: 'template', name: 'PermTest', parentPath: PARENT });
    await create({ type: 'section', name: 'Content', parentPath: tpl.path });
    const a = await create({ type: 'field', name: 'Alpha', parentPath: `${tpl.path}/Content`, fieldType: 'Single-Line Text' });
    await create({ type: 'field', name: 'Bravo', parentPath: `${tpl.path}/Content`, fieldType: 'Single-Line Text' });
    const section = (await app.inject({ method: 'GET', url: `/api/items/by-path?path=${encodeURIComponent(tpl.path + '/Content')}` })).json();

    // Missing one child id.
    const res = await app.inject({
      method: 'POST',
      url: '/api/tree/reorder',
      payload: { parentId: section.id, orderedChildIds: [a.id] },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when a child is a registry/OOTB item', async () => {
    // The shared `app` above boots with no registryPath (registry-free, so
    // the plain-hex-GUID 404 test above stays a true not-found case). This
    // test needs real OOTB registry data, so it spins up its own server with
    // registryPath set and no rootDir (no-project mode; registry only).
    // /sitecore/templates/System has registry (OOTB) children only.
    const registryResult = await createServer({ registryPath: REGISTRY_JSON_GZ });
    const registryApp = registryResult.app;
    await registryResult.engine.readiness.ready();
    try {
      const parent = (await registryApp.inject({ method: 'GET', url: `/api/items/by-path?path=${encodeURIComponent('/sitecore/templates/System')}` })).json();
      const children = (await registryApp.inject({ method: 'GET', url: `/api/tree/children/${parent.id}` })).json();
      expect(children.length).toBeGreaterThan(1);
      expect(children.every((c: { source: string }) => c.source === 'registry')).toBe(true);
      const res = await registryApp.inject({
        method: 'POST',
        url: '/api/tree/reorder',
        payload: { parentId: parent.id, orderedChildIds: children.map((c: { id: string }) => c.id) },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await registryApp.close();
    }
  });
});
