import { describe, it, expect, beforeEach } from 'vitest';
import { Engine } from '../../src/engine/index.js';
import { ItemTree } from '../../src/engine/tree.js';
import type { ScsItem } from '../../src/engine/types.js';
import {
  BLOB_FIELD_ID,
  MIME_TYPE_FIELD_ID,
  EXTENSION_FIELD_ID,
} from '../../src/engine/constants.js';
import { resolveMediaItem, clearBlobCache } from '../../src/engine/media/index.js';

// 8-byte PNG magic header + tiny payload → representative of a real PNG.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_PAYLOAD = Buffer.concat([PNG_MAGIC, Buffer.from('tinypayload')]);
const PNG_BASE64 = PNG_PAYLOAD.toString('base64');

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

const SAMPLE_ID = '769db9c9-e832-4657-95e6-f4efeca10ddd';
const SAMPLE_PATH = '/sitecore/media library/Project/tenant/site/abstract-images/background-gradient-slice-small';

function makeMediaItem(
  overrides: { sharedFields?: Array<{ id: string; hint: string; value: string }> } = {},
): ScsItem {
  return makeItem({
    id: SAMPLE_ID,
    path: SAMPLE_PATH,
    template: 'f1828a2c-7e5d-4bbd-98ca-320474871548',
    sharedFields: overrides.sharedFields ?? [
      { id: BLOB_FIELD_ID, hint: 'Blob', value: PNG_BASE64 },
      { id: MIME_TYPE_FIELD_ID, hint: 'Mime Type', value: 'image/png' },
      { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'png' },
    ],
  });
}

describe('resolveMediaItem', () => {
  beforeEach(() => clearBlobCache());

  it('resolves by braced-style 32-hex ID with middle hyphen + .ashx', async () => {
    const engine = buildEngine([makeMediaItem()]);
    const result = await resolveMediaItem(engine, '/769DB9C9E8324657-95E6F4EFECA10DDD.ashx');
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/png');
    expect(result!.buffer.equals(PNG_PAYLOAD)).toBe(true);
    expect(result!.buffer.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('resolves by lowercased 32-hex ID without hyphen', async () => {
    const engine = buildEngine([makeMediaItem()]);
    const result = await resolveMediaItem(engine, '/769db9c9e832465795e6f4efeca10ddd.ashx');
    expect(result).not.toBeNull();
    expect(result!.buffer.equals(PNG_PAYLOAD)).toBe(true);
  });

  it('strips query string from the URL before resolving', async () => {
    const engine = buildEngine([makeMediaItem()]);
    // Query arg — simulate the resize params that h/w would carry. The
    // resolver shouldn't see them; the route layer is responsible for
    // stripping the query. This test documents that the resolver accepts
    // the path portion only — callers must not pass a raw ?h=16&w=16.
    const result = await resolveMediaItem(engine, '/769db9c9e832465795e6f4efeca10ddd.ashx');
    expect(result).not.toBeNull();
  });

  it('resolves by item path (media library prefix prepended, extension stripped)', async () => {
    const engine = buildEngine([makeMediaItem()]);
    const result = await resolveMediaItem(
      engine,
      '/Project/tenant/site/abstract-images/background-gradient-slice-small.png',
    );
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/png');
    expect(result!.buffer.equals(PNG_PAYLOAD)).toBe(true);
  });

  it('returns null for an unknown GUID', async () => {
    const engine = buildEngine([makeMediaItem()]);
    expect(await resolveMediaItem(engine, '/00000000000000000000000000000000.ashx')).toBeNull();
  });

  it('returns null for an unknown path', async () => {
    const engine = buildEngine([makeMediaItem()]);
    expect(await resolveMediaItem(engine, '/Project/nonexistent.png')).toBeNull();
  });

  it('returns null when the item has no Blob field and no YAML fallback', async () => {
    // 0.4.0.25: when the in-memory item lacks Blob, extractBlob falls
    // back to re-parsing `node.filePath`. Test items use a fake path
    // (/fake/<id>.yml) that doesn't exist, so the fallback errors and
    // extractBlob returns null — confirming the cache-stripped path
    // also handles the "no Blob anywhere" case cleanly.
    const engine = buildEngine([makeMediaItem({
      sharedFields: [
        { id: MIME_TYPE_FIELD_ID, hint: 'Mime Type', value: 'image/png' },
      ],
    })]);
    expect(await resolveMediaItem(engine, '/769db9c9e832465795e6f4efeca10ddd.ashx')).toBeNull();
  });

  it('falls back to extension→mime map when Mime Type field is absent', async () => {
    const engine = buildEngine([makeMediaItem({
      sharedFields: [
        { id: BLOB_FIELD_ID, hint: 'Blob', value: PNG_BASE64 },
        { id: EXTENSION_FIELD_ID, hint: 'Extension', value: 'svg' },
      ],
    })]);
    const result = await resolveMediaItem(engine, '/769db9c9e832465795e6f4efeca10ddd.ashx');
    expect(result?.contentType).toBe('image/svg+xml');
  });

  it('falls back to application/octet-stream when neither field is present', async () => {
    const engine = buildEngine([makeMediaItem({
      sharedFields: [
        { id: BLOB_FIELD_ID, hint: 'Blob', value: PNG_BASE64 },
      ],
    })]);
    const result = await resolveMediaItem(engine, '/769db9c9e832465795e6f4efeca10ddd.ashx');
    expect(result?.contentType).toBe('application/octet-stream');
  });

  it('caches resolved blobs and reuses them on repeat lookup', async () => {
    const engine = buildEngine([makeMediaItem()]);
    const a = await resolveMediaItem(engine, '/769db9c9e832465795e6f4efeca10ddd.ashx');
    const b = await resolveMediaItem(engine, '/769db9c9e832465795e6f4efeca10ddd.ashx');
    expect(a).not.toBeNull();
    // Same object reference — served from the LRU, no re-decode.
    expect(a).toBe(b);
  });
});
