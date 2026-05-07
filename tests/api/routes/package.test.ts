import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { unzipSync } from 'fflate';
import { Engine } from '../../../src/engine/index.js';
import { ItemTree } from '../../../src/engine/tree.js';
import { Registry } from '../../../src/engine/registry.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { clearTemplateSchemaCache } from '../../../src/engine/template-schema.js';
import { registerPackageRoutes } from '../../../src/api/routes/package.js';
import type { CartSource } from '../../../src/engine/package/types.js';

// ---------------------------------------------------------------------------
// Engine fixture builders (mirror tests/engine/package/build.test.ts)
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ScsItem> & { id: string; path: string }): ScsItem {
  return {
    parent: '00000000-0000-0000-0000-000000000000',
    template: 'ab86861a-6030-46c5-b394-e8f99e8b87db',
    sharedFields: [],
    languages: [],
    ...overrides,
  };
}

function buildEngine(items: ScsItem[]): Engine {
  const engine = Object.create(Engine.prototype) as Engine;
  const tree = new ItemTree();
  for (const item of items) tree.addItem(item, `/fake/${item.id}.yml`);
  (engine as unknown as { tree: ItemTree }).tree = tree;
  (engine as unknown as { registry: Registry | null }).registry = null;
  (engine as unknown as { options: { rootDir: string } }).options = { rootDir: '/fake' };
  return engine;
}

function buildTemplate(opts: {
  templateId: string;
  templateName: string;
  fields: Array<{
    id: string;
    name: string;
    type?: string;
    shared?: boolean;
    unversioned?: boolean;
    sortOrder?: number;
  }>;
}): ScsItem[] {
  const items: ScsItem[] = [];
  items.push(makeItem({
    id: opts.templateId,
    path: `/sitecore/templates/Test/${opts.templateName}`,
    template: TEMPLATE_TEMPLATE_ID,
    sharedFields: [],
  }));
  const sectionId = `aaaaaaaa-aaaa-aaaa-aaaa-${opts.templateId.slice(-12)}`;
  items.push(makeItem({
    id: sectionId,
    parent: opts.templateId,
    path: `/sitecore/templates/Test/${opts.templateName}/Data`,
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  }));
  for (const f of opts.fields) {
    const sharedFields: ScsItem['sharedFields'] = [
      { id: FIELD_IDS.type, hint: 'Type', value: f.type ?? 'Single-Line Text' },
    ];
    if (f.shared) sharedFields.push({ id: FIELD_IDS.shared, hint: 'Shared', value: '1' });
    if (f.unversioned) sharedFields.push({ id: FIELD_IDS.unversioned, hint: 'Unversioned', value: '1' });
    if (f.sortOrder !== undefined) {
      sharedFields.push({ id: FIELD_IDS.sortorder, hint: '__Sortorder', value: String(f.sortOrder) });
    }
    items.push(makeItem({
      id: f.id,
      parent: sectionId,
      path: `/sitecore/templates/Test/${opts.templateName}/Data/${f.name}`,
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields,
    }));
  }
  return items;
}

const ITEM_ID = 'a1b2c3d4-e5f6-7890-1234-5678901234ab';
const ITEM_PARENT_ID = '11111111-1111-1111-1111-111111111111';
const TPL_ID = '22222222-2222-2222-2222-222222222222';

function setupSimpleEngine(): Engine {
  clearTemplateSchemaCache();
  const tplItems = buildTemplate({
    templateId: TPL_ID,
    templateName: 'TestTpl',
    fields: [],
  });
  const item = makeItem({
    id: ITEM_ID,
    parent: ITEM_PARENT_ID,
    template: TPL_ID,
    path: '/sitecore/content/Hello',
    languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
  });
  return buildEngine([...tplItems, item]);
}

function helloSource(overrides: Partial<CartSource> = {}): CartSource {
  return {
    id: 'src-hello',
    rootItemId: ITEM_ID,
    rootItemPath: '/sitecore/content/Hello',
    rootItemName: 'Hello',
    scope: 'itemAndDescendants',
    database: 'master',
    ...overrides,
  };
}

async function createTestApp(engine: Engine): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerPackageRoutes(app, engine);
  await app.ready();
  return app;
}

// ===========================================================================

describe('POST /api/package', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp(setupSimpleEngine());
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns a zip with attachment headers and item count for valid sources', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/package',
      payload: {
        sources: [helloSource()],
        metadata: { name: 'test-pkg' },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe('attachment; filename="test-pkg.zip"');
    expect(res.headers['x-mockingbird-package-item-count']).toBe('1');
    expect(res.rawPayload.length).toBeGreaterThan(0);

    // Body is a real zip: outer has exactly `package.zip`.
    const outer = unzipSync(new Uint8Array(res.rawPayload));
    expect(Object.keys(outer)).toEqual(['package.zip']);
  });

  it('returns 400 when sources is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/package',
      payload: { sources: [], metadata: { name: 'x' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: expect.stringMatching(/at least one source/i),
      statusCode: 400,
    });
  });

  it('returns 400 when metadata.name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/package',
      payload: { sources: [helloSource()], metadata: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: expect.stringMatching(/metadata\.name is required/i),
      statusCode: 400,
    });
  });

  it('returns 400 when the body is missing entirely', async () => {
    // Empty body. Fastify's own JSON body parser returns a 400 here ("Bad
    // Request") before our handler runs; either route is fine - the
    // contract from the caller's POV is "no body -> 400".
    const res = await app.inject({
      method: 'POST',
      url: '/api/package',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when sources is omitted from the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/package',
      payload: { metadata: { name: 'x' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: expect.stringMatching(/at least one source/i),
      statusCode: 400,
    });
  });

  it('exposes warnings via X-Mockingbird-Package-Warnings header', async () => {
    // One unresolved root + one good root: build still succeeds.
    const res = await app.inject({
      method: 'POST',
      url: '/api/package',
      payload: {
        sources: [
          {
            id: 'src-dead',
            rootItemId: 'deadbeef-dead-beef-dead-beefdeadbeef',
            rootItemPath: '/sitecore/dead',
            rootItemName: 'dead',
            scope: 'itemAndDescendants',
            database: 'master',
          },
          helloSource(),
        ],
        metadata: { name: 'test-pkg' },
      },
    });
    expect(res.statusCode).toBe(200);
    const header = res.headers['x-mockingbird-package-warnings'];
    expect(typeof header).toBe('string');
    const parsed = JSON.parse(header as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({
      kind: 'unresolved-root',
      sourceId: 'src-dead',
      rootPath: '/sitecore/dead',
    });
    // Good source still produces an item.
    expect(res.headers['x-mockingbird-package-item-count']).toBe('1');
  });

  it('sanitizes path-traversal and reserved chars in metadata.name for the filename', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/package',
      payload: {
        sources: [helloSource()],
        metadata: { name: '../etc/passwd' },
      },
    });
    expect(res.statusCode).toBe(200);
    const cd = res.headers['content-disposition'] as string;
    // Slashes, dots-in-the-middle that form '..', and other special chars
    // collapse to underscores. The dot at the start ('.') and dots inside
    // segments are kept by the regex but the slashes break the traversal.
    expect(cd).toBe('attachment; filename=".._etc_passwd.zip"');
    expect(cd).not.toContain('/');
    expect(cd).not.toContain('\\');
  });
});

describe('GET /api/package/source-size', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    clearTemplateSchemaCache();
    const tplItems = buildTemplate({
      templateId: 'aaaaaaaa-1111-1111-1111-111111111111',
      templateName: 'Sample',
      fields: [{ id: '11111111-1111-1111-1111-aaaaaaaaaaaa', name: 'Title' }],
    });
    // Tree shape:
    //   root  (children: a, b)
    //     a   (children: a1)
    //       a1
    //     b
    const root = makeItem({ id: 'root-id', path: '/sitecore/content/Site/Root', template: 'aaaaaaaa-1111-1111-1111-111111111111' });
    const a = makeItem({ id: 'child-a', parent: 'root-id', path: '/sitecore/content/Site/Root/A', template: 'aaaaaaaa-1111-1111-1111-111111111111' });
    const a1 = makeItem({ id: 'child-a1', parent: 'child-a', path: '/sitecore/content/Site/Root/A/A1', template: 'aaaaaaaa-1111-1111-1111-111111111111' });
    const b = makeItem({ id: 'child-b', parent: 'root-id', path: '/sitecore/content/Site/Root/B', template: 'aaaaaaaa-1111-1111-1111-111111111111' });
    const engine = buildEngine([...tplItems, root, a, a1, b]);

    app = Fastify({ logger: false });
    registerPackageRoutes(app, engine);
    await app.ready();
  });

  afterAll(async () => { await app?.close(); });

  it('returns the correct count for itemAndDescendants (root + 3 descendants = 4)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size?rootItemId=root-id&scope=itemAndDescendants',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ count: 4 });
  });

  it('returns the correct count for itemAndChildren (root + 2 direct = 3)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size?rootItemId=root-id&scope=itemAndChildren',
    });
    expect(JSON.parse(res.body)).toEqual({ count: 3 });
  });

  it('returns the correct count for descendantsOnly (3 descendants, no root)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size?rootItemId=root-id&scope=descendantsOnly',
    });
    expect(JSON.parse(res.body)).toEqual({ count: 3 });
  });

  it('returns the correct count for childrenOnly (2 direct children)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size?rootItemId=root-id&scope=childrenOnly',
    });
    expect(JSON.parse(res.body)).toEqual({ count: 2 });
  });

  it('defaults to itemAndDescendants when scope is omitted', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size?rootItemId=root-id',
    });
    expect(JSON.parse(res.body)).toEqual({ count: 4 });
  });

  it('returns 400 when rootItemId is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when scope is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size?rootItemId=root-id&scope=bogus',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the rootItemId does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/package/source-size?rootItemId=does-not-exist&scope=itemAndDescendants',
    });
    expect(res.statusCode).toBe(404);
  });
});
