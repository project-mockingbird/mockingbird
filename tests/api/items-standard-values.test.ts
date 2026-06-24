import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const TPL_ID = 'aaaa1111-2222-3333-4444-555566667777';

describe('POST /api/items/:id/standard-values', () => {
  let app: FastifyInstance;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mb-sv-api-'));
    await mkdir(join(tempDir, 'items'), { recursive: true });
    await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({ modules: ['*.module.json'] }));
    await writeFile(
      join(tempDir, 'mod.module.json'),
      JSON.stringify({ namespace: 'mod', items: { includes: [{ name: 'items', path: '/sitecore/templates' }] } }),
    );
    // A Template item that has NO __Standard values yet.
    await writeFile(
      join(tempDir, 'items', 'NoSv.yml'),
      `---
ID: "{AAAA1111-2222-3333-4444-555566667777}"
Parent: "{00000000-0000-0000-0000-000000000000}"
Template: "{AB86861A-6030-46C5-B394-E8F99E8B87DB}"
Path: /sitecore/templates/NoSv
`,
    );
    const result = await createServer({ rootDir: tempDir });
    app = result.app;
    await result.engine.readiness.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a __Standard Values item for a template (201)', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/items/${TPL_ID}/standard-values` });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.path).toBe('/sitecore/templates/NoSv/__Standard Values');
    expect(body.template).toBe(TPL_ID);
  });

  it('rejects a second call once standard values exist (400)', async () => {
    const first = await app.inject({ method: 'POST', url: `/api/items/${TPL_ID}/standard-values` });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: `/api/items/${TPL_ID}/standard-values` });
    expect(second.statusCode).toBe(400);
    expect(second.json().error).toMatch(/standard values/i);
  });

  it('returns 404 for an unknown item id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/99999999-9999-9999-9999-999999999999/standard-values',
    });
    expect(res.statusCode).toBe(404);
  });
});
