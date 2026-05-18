import type { Engine } from '../index.js';
import type { ItemNode, ScsItem } from '../types.js';
import {
  BLOB_FIELD_ID,
  MIME_TYPE_FIELD_ID,
  EXTENSION_FIELD_ID,
  MEDIA_LIBRARY_PATH_PREFIX,
} from '../constants.js';
import { readSharedFieldOnItem } from '../layout/item-fields.js';
import { toCanonicalGuid } from '../guid.js';
import { parseItem } from '../parser.js';

export interface ResolvedMedia {
  buffer: Buffer;
  contentType: string;
}

/**
 * LRU cache of resolved media buffers, keyed by canonical item id.
 * 0.4.0.25: `Blob` fields are no longer cached in the main index (they
 * were 89% of decompressed cache bytes); `extractBlob` fault-reads them
 * from the item's YAML on demand. The LRU absorbs the bind-mount IO
 * cost so repeat hits on the same media URL within a session stay fast.
 *
 * Capacity 64 covers a typical page's worth of distinct media assets;
 * memory ceiling is ~64 × average-image-size (headshots ~500 KB, so
 * ~30 MB worst case). Promoted on access via Map delete+set.
 */
const BLOB_CACHE_MAX = 64;
const blobCache = new Map<string, ResolvedMedia>();

function getCachedBlob(id: string): ResolvedMedia | undefined {
  const hit = blobCache.get(id);
  if (!hit) return undefined;
  // Promote to MRU end.
  blobCache.delete(id);
  blobCache.set(id, hit);
  return hit;
}

function putCachedBlob(id: string, media: ResolvedMedia): void {
  if (blobCache.has(id)) blobCache.delete(id);
  blobCache.set(id, media);
  if (blobCache.size > BLOB_CACHE_MAX) {
    const oldest = blobCache.keys().next().value;
    if (oldest) blobCache.delete(oldest);
  }
}

/** Reset the LRU. Only used in tests for isolation. */
export function clearBlobCache(): void {
  blobCache.clear();
}

/**
 * Minimal extension→MIME fallback used when the item has no `Mime Type`
 * shared field but does have an `Extension`. Only types mockingbird is
 * likely to serve locally - Edge CDN handles everything else in prod.
 */
const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  ico: 'image/x-icon',
};

/**
 * Detect whether a URL path segment is a 32-hex Sitecore media ID,
 * optionally containing a single `-` splitting the hex into two halves of
 * 16 chars each (both real-world formats - Sitecore emits no-hyphen, some
 * callers inject one). Returns the canonical dashed GUID, or `undefined`
 * if the segment isn't a valid ID.
 */
function parseMediaIdSegment(segment: string): string | undefined {
  // Accept `769DB9C9E8324657-95E6F4EFECA10DDD` and `769db9c9e832465795e6f4efeca10ddd`.
  const cleaned = segment.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(cleaned)) return undefined;
  return toCanonicalGuid(cleaned);
}

/** Strip a trailing file extension from a path segment. Keeps names that start with `.`. */
function stripExtension(segment: string): string {
  const dot = segment.lastIndexOf('.');
  if (dot <= 0) return segment;
  return segment.slice(0, dot);
}

function pickContentType(item: ScsItem): string {
  const mime = readSharedFieldOnItem(item, MIME_TYPE_FIELD_ID)?.trim();
  if (mime) return mime;
  const ext = readSharedFieldOnItem(item, EXTENSION_FIELD_ID)?.trim().toLowerCase();
  if (ext && EXTENSION_MIME[ext]) return EXTENSION_MIME[ext];
  return 'application/octet-stream';
}

/**
 * Resolve a `/-/media/*` URL (path portion only - strip the query string
 * before calling) to the media item's decoded blob and Content-Type. Two
 * URL formats are supported:
 *
 *   1. ID form - a single segment of 32 hex chars (optionally with one
 *      `-` splitting it in half) followed by `.ashx`. Example:
 *      `/769DB9C9E8324657-95E6F4EFECA10DDD.ashx`.
 *   2. Path form - a Sitecore-ish path under the media library, with the
 *      last segment carrying a file extension. The
 *      `/sitecore/media library/` prefix is prepended automatically.
 *      Example: `/Project/site/icons/four-squares-white.svg`.
 *
 * Returns `null` when the item can't be found or has no `Blob` field.
 */
export async function resolveMediaItem(
  engine: Engine,
  urlPath: string,
): Promise<ResolvedMedia | null> {
  if (!urlPath) return null;
  const clean = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
  if (!clean) return null;

  // --- ID form: single segment ending in `.ashx` ---
  if (!clean.includes('/') && clean.toLowerCase().endsWith('.ashx')) {
    const withoutExt = clean.slice(0, -'.ashx'.length);
    const canonical = parseMediaIdSegment(withoutExt);
    if (!canonical) return null;
    const node = engine.getItemById(canonical);
    return node ? await extractBlob(node) : null;
  }

  // --- Path form: prepend the media library prefix, strip the extension ---
  const segments = clean.split('/');
  const last = segments[segments.length - 1];
  segments[segments.length - 1] = stripExtension(last);
  const itemPath = `${MEDIA_LIBRARY_PATH_PREFIX}/${segments.join('/')}`;
  const node = engine.getItemByPath(itemPath);
  return node ? await extractBlob(node) : null;
}

/**
 * Resolve a media item's Blob to a decoded buffer. 0.4.0.25: the cache
 * no longer persists Blob fields, so the fast path reads from the
 * in-memory item; if the field isn't present there, fault-reads the
 * item's YAML from disk and memoizes via {@link blobCache}.
 */
async function extractBlob(node: ItemNode): Promise<ResolvedMedia | null> {
  const cached = getCachedBlob(node.item.id);
  if (cached) return cached;

  // Fast path: Blob still on the in-memory item (e.g. item came from a
  // watcher add/change after cache load).
  let base64 = readSharedFieldOnItem(node.item, BLOB_FIELD_ID);

  // Slow path: stripped-from-cache fault. Re-parse the YAML to pick up
  // the Blob, then leave the in-memory tree untouched (we don't want to
  // re-inflate every media item's RAM footprint; LRU absorbs repeat
  // hits).
  if (!base64) {
    try {
      const fresh = await parseItem(node.filePath);
      base64 = readSharedFieldOnItem(fresh, BLOB_FIELD_ID);
    } catch {
      return null;
    }
  }

  if (!base64) return null;
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) return null;
    const resolved: ResolvedMedia = { buffer, contentType: pickContentType(node.item) };
    putCachedBlob(node.item.id, resolved);
    return resolved;
  } catch {
    return null;
  }
}
