// src/engine/package/blobs.ts
//
// Media-blob resolution for the package builder.
//
// A media item's bytes live as base64 in its `Blob` shared field in the item
// YAML. index-cache strips that field from the in-memory tree (~89% of cache
// bytes), so the package builder must recover it the same way media serving
// does (engine/media/index.ts extractBlob): read the in-memory shared field
// first, and fault-read the YAML when the field has been stripped.
//
// Real Sitecore packages do NOT inline the bytes. The attachment field in the
// item XML carries a blob GUID and the raw bytes live in a top-level
// `blob/{database}/{guid}` entry (decompiled Sitecore.Kernel 10.4):
//   - Sitecore.Install.Constants.BlobDataPrefix = "blob"
//   - Sitecore.Install.BlobData.BlobEntryData.Key
//       = BlobDataPrefix + "/" + databaseName + "/" + InternalBlobId
//   - Sitecore.Install.BlobData.BlobInstaller.UpdateBlobData installs the
//     bytes when the attachment field value parses as a GUID (< 50 chars) and
//     a matching blob entry is present; a value >= 50 chars is treated as
//     legacy inline base64 instead.
//
// The blob GUID is derived deterministically from (item id, field id) via MD5
// - the same primitive Sitecore uses for file-based media keys
// (MainUtil.GetMD5Hash) - so rebuilds are byte-stable and two blob fields on
// one item never collide.

import { createHash } from 'crypto';
import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import { getTemplateSchema } from '../template-schema.js';
import { readSharedFieldOnItem } from '../layout/item-fields.js';
import { parseItem } from '../parser.js';

/**
 * The template field-type label for blob-backed media fields. Mirrors
 * Sitecore's `Field.TypeKey == "attachment"` test in BlobInstaller.
 */
const ATTACHMENT_TYPE = 'attachment';

export interface ItemBlob {
  /** Lowercase field id of the attachment field carrying the blob. */
  fieldId: string;
  /** Deterministic blob GUID, unbraced lowercase dashed (Guid.ToString "D"). */
  blobGuid: string;
  /** Decoded blob bytes. */
  bytes: Uint8Array;
}

/**
 * Derive a stable blob GUID from an item id + field id. MD5 yields a
 * deterministic 128-bit value formatted as a canonical lowercase-dashed GUID -
 * matching the `blob/{db}/{guid}` entry key Sitecore emits and the value its
 * installer parses back out of the attachment field.
 */
export function deriveBlobGuid(itemId: string, fieldId: string): string {
  const hex = createHash('md5').update(`${itemId}:${fieldId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Resolve every blob-backed field on an item to its decoded bytes + minted
 * blob GUID. Returns [] for items with no attachment fields, or whose
 * attachment fields are empty / undecodable.
 *
 * `filePath` is the item's YAML path, used only for the fault-read slow path
 * when the Blob field has been stripped from the in-memory copy.
 */
export async function collectItemBlobs(
  engine: Engine,
  item: ScsItem,
  filePath: string | undefined,
): Promise<ItemBlob[]> {
  const schema = getTemplateSchema(item.template, engine);
  const attachmentFieldIds: string[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type.toLowerCase() === ATTACHMENT_TYPE) {
        attachmentFieldIds.push(field.id.toLowerCase());
      }
    }
  }
  if (attachmentFieldIds.length === 0) return [];

  // Fault-read the YAML at most once, and only when an attachment field is
  // missing from the in-memory item (the common case: Blob stripped by the
  // cache). Mirrors engine/media/index.ts extractBlob's fast/slow split.
  let fresh: ScsItem | undefined;
  const readValue = async (fieldId: string): Promise<string | undefined> => {
    const fast = readSharedFieldOnItem(item, fieldId);
    if (fast) return fast;
    if (!filePath) return undefined;
    if (fresh === undefined) {
      try {
        fresh = await parseItem(filePath);
      } catch {
        fresh = item; // sentinel: a failed parse must not be retried per field
        return undefined;
      }
    }
    return readSharedFieldOnItem(fresh, fieldId);
  };

  const blobs: ItemBlob[] = [];
  for (const fieldId of attachmentFieldIds) {
    const base64 = await readValue(fieldId);
    if (!base64) continue;
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0) continue;
    blobs.push({ fieldId, blobGuid: deriveBlobGuid(item.id, fieldId), bytes });
  }
  return blobs;
}
