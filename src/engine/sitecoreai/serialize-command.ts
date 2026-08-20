import type { Engine } from '../index.js';
import type { ScsItem, ScsField } from '../types.js';
import { resolveItemName } from '../package/lookups.js';
import { collectItemBlobs } from '../package/blobs.js';
import { ALL_ZERO_GUID, type SerializeFieldData, type SerializeItemData, type ItemUpdateOp } from './types.js';

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

  // The index cache strips the Blob (attachment) field from cached items, so on a
  // warm-cache restart the Blob field is not in item.sharedFields even though
  // collectItemBlobs still finds the on-disk blob. Append a synthetic shared field
  // for any collected blob not already covered by mapField, so media survives the
  // warm-cache path instead of being created on the target with an empty attachment.
  const shared = item.sharedFields.map(mapField);
  const present = new Set(shared.map((f) => f.fieldId.toLowerCase()));
  for (const b of blobs) {
    if (!present.has(b.fieldId.toLowerCase())) {
      shared.push({ fieldId: b.fieldId, value: Buffer.from(b.bytes).toString('base64'), blobId: b.blobGuid, nameHint: '' });
    }
  }

  return {
    id: item.id,
    parentId: item.parent,
    path: item.path,
    name: resolveItemName(item),
    branchId: item.branchId ?? ALL_ZERO_GUID,
    templateId: item.template,
    sharedFields: shared,
    unversionedFields: item.languages.map((l) => ({ language: l.language, fields: l.fields.map(mapField) })),
    versions: item.languages.flatMap((l) => l.versions.map((v) => ({ language: l.language, version: v.version, fields: v.fields.map(mapField) }))),
  };
}

const UPDATE_WIRE = {
  changeTemplate: 'CHANGE_TEMPLATE',
  update: 'UPDATE',
  resetField: 'RESET_FIELD',
  removeVersion: 'REMOVE_VERSION',
  addVersion: 'ADD_VERSION',
} as const;

/**
 * Serialize UPDATE ops into the `data` string executeSerializationCommands expects for an
 * UPDATE command: a JSON array of { command: <UPPER_SNAKE>, data: <dict|guid string> }.
 * Enum values, camelCase, dict key set, and string versions all mirror graphql-dotnet's
 * MapUpdateCommand + [EnumMember] wire form.
 */
export function toUpdateCommandData(ops: ItemUpdateOp[]): string {
  const wire = ops.map((op) => {
    switch (op.kind) {
      case 'changeTemplate':
        return { command: UPDATE_WIRE.changeTemplate, data: op.templateId };
      case 'addVersion':
        return { command: UPDATE_WIRE.addVersion, data: { language: op.language, version: String(op.version) } };
      case 'removeVersion':
        return { command: UPDATE_WIRE.removeVersion, data: { language: op.language, version: String(op.version) } };
      case 'resetField': {
        const data: Record<string, string> = { fieldId: op.fieldId };
        if (op.language != null) data.language = op.language;
        if (op.version != null) data.version = String(op.version);
        return { command: UPDATE_WIRE.resetField, data };
      }
      case 'updateField': {
        const data: Record<string, string> = { fieldId: op.fieldId, value: op.value };
        if (op.blobId) data.blobId = op.blobId;
        if (op.language != null) data.language = op.language;
        if (op.version != null) data.version = String(op.version);
        return { command: UPDATE_WIRE.update, data };
      }
    }
  });
  return JSON.stringify(wire);
}
