// src/engine/package/item-key.ts
//
// Zip-entry key encoder for per-item-version package entries. Mirrors
// Sitecore's `Sitecore.Install.Items.ItemKeyUtils.GetKey` chained through
// `Sitecore.Install.Items.ItemReference.ToString`.
//
// Format authority:
//   - `ItemKeyUtils.GetKey(reference) = ItemsPrefix + reference.ToString() + "/xml"`
//     where `ItemsPrefix = "items"` (no leading slash).
//   - `ItemReference.ToString()`:
//         string.Join("/", "",
//             FileUtil.MakePath(database, path, '/'),
//             id?.ToString() ?? ID.Null.ToString(),
//             language == Language.Invariant ? "invariant" : language.ToString(),
//             version.ToString())
//     The leading empty segment makes the result start with `/`, so when
//     concatenated with the prefix the full key is
//     `items/<db>/<path>/<id>/<lang>/<ver>/xml`.
//   - GUID per `Sitecore.Data.ID.ToString` -> `_guid.ToString("B").ToUpperInvariant()`.
//   - Path is preserved verbatim. `FileUtil.MakePath` does no escaping;
//     spaces, dots, etc. ride through (it's a zip entry name, not a URL).
//   - `Language.Invariant.ToString()` is the literal string `"invariant"`.
//
// Companion: properties entries reuse this key under the `properties/` prefix
// (per `PackageWriter.Put`: `FileUtil.MakePath("properties", entry.Key, '/')`).

import type { ScsItem } from '../types.js';
import type { VersionRef } from './item-xml.js';
import { formatGuidBraced } from '../guid.js';

/**
 * Build the zip-entry key for an item-version XML body.
 *
 * Format: `items/<db>/<sitecore-path>/<UPPER-BRACED-ID>/<lang>/<version>/xml`.
 *
 * The sitecore path keeps its leading `/sitecore/...` segments verbatim;
 * only the leading `/` is dropped because the `items/<db>/` prefix already
 * ends with a slash. Item names with spaces ride through unescaped.
 *
 * Language `'invariant'` is emitted literally (matches Sitecore's
 * `Language.Invariant.ToString()`); any other language string is used
 * verbatim.
 */
export function buildItemKey(
  item: ScsItem,
  versionRef: VersionRef,
  database: 'master',
): string {
  const path = item.path.startsWith('/') ? item.path.slice(1) : item.path;
  const idBraced = formatGuidBraced(item.id);
  return `items/${database}/${path}/${idBraced}/${versionRef.language}/${versionRef.version}/xml`;
}
