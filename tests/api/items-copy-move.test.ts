import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/api/server.js';
import type { FastifyInstance } from 'fastify';
import { resolve, join } from 'path';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';

// Synthetic-content-tree harness mirrors tests/api/items.test.ts (fromTemplate /
// duplicate suites). Builds a tiny fixture in tmp so each case starts with
// a known parent + source + alt-parent, then exercises the full route ->
// engine stack with `app.inject`.

describe('POST /api/items - copyTo + moveTo', () => {
  let app: FastifyInstance;
  let tempDir: string;

  const PARENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const ALT_PARENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const SOURCE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const CHILD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const PAGE_TPL_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'mockingbird-api-copy-move-'));
    await mkdir(join(tempDir, 'items', 'Parent', 'Source'), { recursive: true });
    await mkdir(join(tempDir, 'items', 'Alt'), { recursive: true });

    await writeFile(join(tempDir, 'sitecore.json'), JSON.stringify({
      modules: ['*.module.json'],
    }), 'utf-8');
    await writeFile(join(tempDir, 'mod.module.json'), JSON.stringify({
      namespace: 'mod',
      items: { includes: [{ name: 'items', path: '/sitecore/content' }] },
    }), 'utf-8');

    const writeItem = async (
      filePath: string, id: string, parent: string, path: string,
    ) => {
      await writeFile(filePath, `---
ID: "{${id.toUpperCase()}}"
Parent: "{${parent.toUpperCase()}}"
Template: "{${PAGE_TPL_ID.toUpperCase()}}"
Path: ${path}
`, 'utf-8');
    };

    // /sitecore/content/Parent  (root for sources)
    await writeItem(join(tempDir, 'items', 'Parent.yml'), PARENT_ID,
      '00000000-0000-0000-0000-000000000000',
      '/sitecore/content/Parent');
    // /sitecore/content/Parent/Source  (subtree we copy / move)
    await writeItem(join(tempDir, 'items', 'Parent', 'Source.yml'),
      SOURCE_ID, PARENT_ID,
      '/sitecore/content/Parent/Source');
    // /sitecore/content/Parent/Source/Child  (descendant - exercises subtree)
    await writeItem(join(tempDir, 'items', 'Parent', 'Source', 'Child.yml'),
      CHILD_ID, SOURCE_ID,
      '/sitecore/content/Parent/Source/Child');
    // /sitecore/content/Alt  (alternate destination parent)
    await writeItem(join(tempDir, 'items', 'Alt.yml'), ALT_PARENT_ID,
      '00000000-0000-0000-0000-000000000000',
      '/sitecore/content/Alt');

    // Page template (referenced by every item's Template)
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

  it('copyTo creates a new subtree under the destination parent', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'copyTo',
        sourceId: SOURCE_ID,
        destinationParentId: ALT_PARENT_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; path: string };
    // Alt has no existing "Source" sibling, so getCopyOfName keeps the
    // original name (Sitecore parity: "Copy of" prefix only fires on
    // collision).
    expect(body.path).toBe('/sitecore/content/Alt/Source');
    expect(body.id).not.toBe(SOURCE_ID);
  });

  it('copyTo derives "Copy of <name>" when the destination already has a same-named sibling', async () => {
    // Source's own parent already has Source as a child, so copying Source
    // back into Parent forces the getCopyOfName collision branch.
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'copyTo',
        sourceId: SOURCE_ID,
        destinationParentId: PARENT_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; path: string };
    expect(body.path).toBe('/sitecore/content/Parent/Copy of Source');
    expect(body.id).not.toBe(SOURCE_ID);
  });

  it('copyTo accepts an explicit name override', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'copyTo',
        sourceId: SOURCE_ID,
        destinationParentId: ALT_PARENT_ID,
        name: 'CustomName',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; path: string };
    expect(body.path).toBe('/sitecore/content/Alt/CustomName');
    expect(body.id).not.toBe(SOURCE_ID);
  });

  it('moveTo relocates the subtree and preserves the item id', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'moveTo',
        sourceId: SOURCE_ID,
        destinationParentId: ALT_PARENT_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; path: string };
    expect(body.id).toBe(SOURCE_ID);
    expect(body.path).toBe('/sitecore/content/Alt/Source');
  });

  it('copyTo returns 404 when sourceId does not resolve', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'copyTo',
        sourceId: '00000000-0000-0000-0000-000000000000',
        destinationParentId: ALT_PARENT_ID,
      },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toMatch(/Source item not found/);
  });

  it('copyTo returns 404 when destinationParentId does not resolve', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'copyTo',
        sourceId: SOURCE_ID,
        destinationParentId: '00000000-0000-0000-0000-000000000000',
      },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toMatch(/Destination parent not found/);
  });

  it('copyTo returns 400 when sourceId is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: { type: 'copyTo', destinationParentId: ALT_PARENT_ID },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/sourceId/);
  });

  it('copyTo returns 400 when destinationParentId is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: { type: 'copyTo', sourceId: SOURCE_ID },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/destinationParentId/);
  });

  it('moveTo returns 400 when destination is the source itself (move-into-self)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'moveTo',
        sourceId: SOURCE_ID,
        destinationParentId: SOURCE_ID,
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/Cannot move an item into itself/);
  });

  it('moveTo returns 400 when destination is a descendant of the source', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'moveTo',
        sourceId: SOURCE_ID,
        destinationParentId: CHILD_ID,
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/descendants/i);
  });

  it('moveTo returns 400 when destination is the current parent (no-op)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'moveTo',
        sourceId: SOURCE_ID,
        destinationParentId: PARENT_ID,
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/already a child of/);
  });

  it('moveTo returns 404 when sourceId does not resolve', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'moveTo',
        sourceId: '00000000-0000-0000-0000-000000000000',
        destinationParentId: ALT_PARENT_ID,
      },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toMatch(/Source item not found/);
  });

  it('moveTo returns 404 when destinationParentId does not resolve', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/items',
      payload: {
        type: 'moveTo',
        sourceId: SOURCE_ID,
        destinationParentId: '00000000-0000-0000-0000-000000000000',
      },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toMatch(/Destination parent not found/);
  });
});
