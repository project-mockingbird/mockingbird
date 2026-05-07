import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { registerItemRoutes } from '../../src/api/routes/items.js';
import { FIELD_IDS } from '../../src/engine/constants.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/valid');

describe('POST /api/items/preview-update', () => {
  let dir: string;
  let engine: Engine;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mb-preview-'));
    cpSync(FIXTURES, dir, { recursive: true });
    engine = new Engine({ rootDir: dir });
    await engine.init();
    app = Fastify();
    registerItemRoutes(app, engine);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('returns a diff plan and does not modify disk', async () => {
    const tpl = await engine.createTemplate('PreviewUpdateTpl', '/sitecore/templates/Project/MyProject');
    const before = await readFile(tpl.filePath, 'utf-8');

    const res = await app.inject({
      method: 'POST',
      url: '/api/items/preview-update',
      payload: { id: tpl.item.id, fields: { [FIELD_IDS.created]: '20260101T000000Z' }, language: 'en', version: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { diff: string; summary: string; warnings: string[]; wouldWrite: { path: string; bytes: number }[] };
    expect(body.diff).toContain('---');
    expect(body.diff).toContain('+++');
    expect(body.summary).toContain('field');

    // Disk untouched
    const after = await readFile(tpl.filePath, 'utf-8');
    expect(after).toBe(before);
  });

  it('returns 400 when no fields provided', async () => {
    const tpl = await engine.createTemplate('PreviewUpdateBar', '/sitecore/templates/Project/MyProject');
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/preview-update',
      payload: { id: tpl.item.id, fields: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when item not found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/preview-update',
      payload: { id: '00000000-0000-0000-0000-000000000000', fields: { x: 'y' } },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/items/preview-create', () => {
  let dir: string;
  let engine: Engine;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mb-preview-'));
    cpSync(FIXTURES, dir, { recursive: true });
    engine = new Engine({ rootDir: dir });
    await engine.init();
    app = Fastify();
    registerItemRoutes(app, engine);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('returns a create-style plan diff for a template', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/preview-create',
      payload: { type: 'template', name: 'NewPreviewTpl', parentPath: '/sitecore/templates/Project/MyProject' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { diff: string; wouldWrite: { path: string; op: string }[] };
    expect(body.wouldWrite.every(w => w.op === 'create')).toBe(true);
    expect(body.diff).toContain('+++');
  });

  it('returns 404 when parent path is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/preview-create',
      payload: { type: 'template', name: 'X', parentPath: '/nope' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/items/preview-delete', () => {
  let dir: string;
  let engine: Engine;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mb-preview-'));
    cpSync(FIXTURES, dir, { recursive: true });
    engine = new Engine({ rootDir: dir });
    await engine.init();
    app = Fastify();
    registerItemRoutes(app, engine);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await engine.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('returns a delete-style plan diff', async () => {
    const tpl = await engine.createTemplate('PreviewDeleteTpl', '/sitecore/templates/Project/MyProject');
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/preview-delete',
      payload: { id: tpl.item.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { diff: string; wouldWrite: { path: string; op: string }[] };
    expect(body.wouldWrite.every(w => w.op === 'delete')).toBe(true);
    expect(body.diff).toContain('---');
  });

  it('returns 404 when item not found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/preview-delete',
      payload: { id: 'no-such-id' },
    });
    expect(res.statusCode).toBe(404);
  });
});
