import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { FIELD_IDS } from '../../src/engine/constants.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');
const PARENT = '/sitecore/templates/Project/MyProject';

describe('tree API exposes __Icon', () => {
  let app: FastifyInstance;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-tree-icon-'));
    cpSync(FIXTURES, tempDir, { recursive: true });
    const result = await createServer({ rootDir: tempDir });
    app = result.app;
    await result.engine.readiness.ready();
  });
  afterEach(async () => { await app.close(); await rm(tempDir, { recursive: true, force: true }); });

  it('sets node.icon when __Icon is populated, omits it when empty', async () => {
    const parent = (await app.inject({ method: 'GET', url: `/api/items/by-path?path=${encodeURIComponent(PARENT)}` })).json();
    const tpl = (await app.inject({ method: 'POST', url: '/api/items', payload: { type: 'template', name: 'IconTest', parentPath: PARENT } })).json();

    // Freshly created, no __Icon -> node.icon omitted.
    const kidsBefore = (await app.inject({ method: 'GET', url: `/api/tree/children/${parent.id}` })).json();
    const nodeBefore = kidsBefore.find((n: { id: string }) => n.id === tpl.id);
    expect(nodeBefore).toBeDefined();
    expect(nodeBefore.icon).toBeUndefined();

    // Set __Icon via PUT (readFieldWithSvFallback reads shared+versioned, so the
    // tree exposes it regardless of the scope PUT resolves it to).
    await app.inject({ method: 'PUT', url: `/api/items/${tpl.id}`, payload: { fields: { [FIELD_IDS.icon]: 'Office/32x32/folder.png' } } });

    const kidsAfter = (await app.inject({ method: 'GET', url: `/api/tree/children/${parent.id}` })).json();
    const nodeAfter = kidsAfter.find((n: { id: string }) => n.id === tpl.id);
    expect(nodeAfter.icon).toBe('Office/32x32/folder.png');
  });
});
