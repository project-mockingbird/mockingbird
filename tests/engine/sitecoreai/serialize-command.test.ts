import { describe, it, expect, vi } from 'vitest';
import type { ScsItem } from '../../../src/engine/types.js';

vi.mock('../../../src/engine/package/blobs.js', () => ({
  collectItemBlobs: vi.fn(async () => []),
  deriveBlobGuid: (a: string, b: string) => `guid-${a}-${b}`,
}));

import { toSerializeItemData } from '../../../src/engine/sitecoreai/serialize-command.js';
import { collectItemBlobs } from '../../../src/engine/package/blobs.js';

const engine = { getItemById: () => undefined } as any;

const item: ScsItem = {
  id: 'item-1', parent: 'parent-1', template: 'tpl-1',
  path: '/sitecore/content/Home/Widget',
  sharedFields: [{ id: 'sf1', hint: 'Shared One', value: 'sv' }],
  languages: [
    {
      language: 'en',
      fields: [{ id: 'uf1', hint: 'Unversioned', value: 'uv' }],
      versions: [{ version: 1, fields: [{ id: 'vf1', hint: 'Title', value: 'Hello' }] }],
    },
  ],
};

describe('toSerializeItemData', () => {
  it('maps ids, name, all-zero branchId, and the three field tiers', async () => {
    const data = await toSerializeItemData(engine, item);
    expect(data).toMatchObject({
      id: 'item-1', parentId: 'parent-1', templateId: 'tpl-1',
      path: '/sitecore/content/Home/Widget', name: 'Widget',
      branchId: '00000000-0000-0000-0000-000000000000',
    });
    expect(data.sharedFields).toEqual([{ fieldId: 'sf1', value: 'sv', nameHint: 'Shared One' }]);
    expect(data.unversionedFields).toEqual([{ language: 'en', fields: [{ fieldId: 'uf1', value: 'uv', nameHint: 'Unversioned' }] }]);
    expect(data.versions).toEqual([{ language: 'en', version: 1, fields: [{ fieldId: 'vf1', value: 'Hello', nameHint: 'Title' }] }]);
  });

  it('inlines a blob field as base64 with a blobId', async () => {
    (collectItemBlobs as any).mockResolvedValueOnce([
      { fieldId: 'blob-field', blobGuid: 'blob-guid-1', bytes: new Uint8Array([1, 2, 3]) },
    ]);
    const withBlob: ScsItem = { ...item, sharedFields: [{ id: 'blob-field', hint: 'Blob', value: '' }] };
    const data = await toSerializeItemData(engine, withBlob);
    const bf = data.sharedFields.find((f) => f.fieldId === 'blob-field')!;
    expect(bf.value).toBe(Buffer.from([1, 2, 3]).toString('base64'));
    expect(bf.blobId).toBe('blob-guid-1');
  });

  it('injects a blob field on the warm-cache path where sharedFields does not carry it', async () => {
    (collectItemBlobs as any).mockResolvedValueOnce([
      { fieldId: 'blob-field', blobGuid: 'blob-guid-1', bytes: new Uint8Array([1, 2, 3]) },
    ]);
    // Simulates the warm-cache index, which strips the Blob field from sharedFields.
    const warmCacheItem: ScsItem = { ...item, sharedFields: [] };
    const data = await toSerializeItemData(engine, warmCacheItem);
    expect(data.sharedFields).toEqual([
      { fieldId: 'blob-field', value: Buffer.from([1, 2, 3]).toString('base64'), blobId: 'blob-guid-1', nameHint: '' },
    ]);
  });

  it('preserves an explicit branchId when present', async () => {
    const data = await toSerializeItemData(engine, { ...item, branchId: 'branch-9' });
    expect(data.branchId).toBe('branch-9');
  });
});
