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
});
