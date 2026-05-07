import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  BLOB_FIELD_ID,
  MIME_TYPE_FIELD_ID,
  EXTENSION_FIELD_ID,
} from '../../src/engine/constants.js';
import { registerMediaRoutes } from '../../src/api/routes/media.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_PAYLOAD = Buffer.concat([PNG_MAGIC, Buffer.from('tinypayload')]);
const PNG_BASE64 = PNG_PAYLOAD.toString('base64');

const SAMPLE_ID = '769db9c9-e832-4657-95e6-f4efeca10ddd';
const SAMPLE_PATH = '/sitecore/media library/Project/tenant/site/abstract-images/background-gradient-slice-small';

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
  (engine as any).tree = tree;
  (engine as any).registry = null;
  (engine as any).options = { rootDir: '/fake' };
  return engine;
}

async function createTestApp(items: ScsItem[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerMediaRoutes(app, buildEngine(items));
  await app.ready();
  return app;
}

const mediaItem: ScsItem = makeItem({
  id: SAMPLE_ID,
  path: SAMPLE_PATH,
  template: 'f1828a2c-7e5d-4bbd-98ca-320474871548',
  sharedFields: [
    { id: BLOB_FIELD_ID, hint: 'Blob', value: PNG_BASE64 },
    { id: MIME_TYPE_FIELD_ID, hint: 'Mime Type', value: 'image/png' },
    { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'png' },
  ],
});

describe('GET /-/media/*', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await createTestApp([mediaItem]); });
  afterAll(async () => { await app.close(); });

  it('serves the blob by 32-hex ID with .ashx (mixed case, with hyphen)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/-/media/769DB9C9E8324657-95E6F4EFECA10DDD.ashx?h=16&w=16',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.rawPayload.length).toBe(PNG_PAYLOAD.length);
    expect(res.rawPayload.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('serves the blob by lowercase 32-hex ID without hyphen', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/-/media/769db9c9e832465795e6f4efeca10ddd.ashx',
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(PNG_PAYLOAD)).toBe(true);
  });

  it('serves the blob by item path with extension', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/-/media/Project/tenant/site/abstract-images/background-gradient-slice-small.png',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.equals(PNG_PAYLOAD)).toBe(true);
  });

  it('returns 404 for an unknown GUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/-/media/00000000000000000000000000000000.ashx',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an unknown path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/-/media/Project/nonexistent.png',
    });
    expect(res.statusCode).toBe(404);
  });

  it('serves the same blob via the /-/jssmedia/* alias', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/-/jssmedia/769db9c9e832465795e6f4efeca10ddd.ashx',
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(PNG_PAYLOAD)).toBe(true);
  });
});
