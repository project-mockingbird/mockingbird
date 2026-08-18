import type { Engine } from '../index.js';
import type { ScsItem, ScsField } from '../types.js';
import { resolveItemName } from '../package/lookups.js';
import { collectItemBlobs } from '../package/blobs.js';
import { ALL_ZERO_GUID, type SerializeFieldData, type SerializeItemData } from './types.js';

/**
 * Map an ScsItem to the serialize-command `data` object executeSerializationCommands
 * consumes. Media attachment fields carry FULL inline base64 + a blobId (unlike the
 * .zip emitter, which writes a separate blob entry and a GUID reference).
 */
export async function toSerializeItemData(engine: Engine, item: ScsItem): Promise<SerializeItemData> {
  const blobs = await collectItemBlobs(engine, item, engine.getItemById(item.id)?.filePath);
  const blobByField = new Map(blobs.map((b) => [b.fieldId.toLowerCase(), b] as const));

  const mapField = (f: ScsField): SerializeFieldData => {
    const blob = blobByField.get(f.id.toLowerCase());
    if (blob) {
      return { fieldId: f.id, value: Buffer.from(blob.bytes).toString('base64'), blobId: blob.blobGuid, nameHint: f.hint };
    }
    return { fieldId: f.id, value: f.value, nameHint: f.hint };
  };

  return {
    id: item.id,
    parentId: item.parent,
    path: item.path,
    name: resolveItemName(item),
    branchId: item.branchId ?? ALL_ZERO_GUID,
    templateId: item.template,
    sharedFields: item.sharedFields.map(mapField),
    unversionedFields: item.languages.map((l) => ({ language: l.language, fields: l.fields.map(mapField) })),
    versions: item.languages.flatMap((l) => l.versions.map((v) => ({ language: l.language, version: v.version, fields: v.fields.map(mapField) }))),
  };
}
