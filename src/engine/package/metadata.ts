// src/engine/package/metadata.ts
//
// Package-level metadata emitter. Produces one zip entry per populated
// metadata field at `metadata/sc_<lower-name>.txt` for the inner
// `package.zip` of a classic Sitecore .zip package.
//
// Format authority:
//   - Emitter:  Sitecore.Install.Metadata.MetadataSource.Populate
//               + Sitecore.Install.Metadata.MetadataView (key list)
//               + Sitecore.IO.StreamUtil.SaveString (UTF-8, no BOM)
//   - Parser:   Sitecore.Install.Metadata.MetadataSink + MetadataView.GetValue
//               (whole-stream ReadToEnd, dictionary key lowercased on read).
//
// Empirical:  tests/fixtures/package/known-good/expected-inner/metadata/sc_*.txt
//
// Format details (from the empirical findings appendix + fixture hex-dump):
//   - UTF-8 raw text. No BOM (StreamUtil.SaveString uses
//     `Encoding.UTF8.GetBytes` which writes bare bytes).
//   - No trailing newline. The fixture's sc_*.txt files end at the last
//     value byte; the parser does `streamReader.ReadToEnd()` so any trailing
//     newline would become part of the stored value.
//   - No XML wrapping. The body is the raw value of the metadata field.
//   - Empty / undefined fields are skipped. Sitecore Desktop emits an empty
//     `sc_readme.txt` (0 bytes) for an unset Readme; the parser tolerates
//     either presence or absence. Mockingbird v1 omits empty fields.
//
// Recognized keys per `MetadataView` (PackageName, Author, Version,
// Revision, License, Comment, Readme, Publisher, PostStep, PackageID).
// Phase 2 v1 emits only the six fields exposed on `PackageMetadata`:
// name, author, version, comment, publisher, license. The other four
// (revision, readme, poststep, packageid) are not on the type and are
// not emitted; they can be added later by extending PackageMetadata.

import type { PackageMetadata } from './types.js';

/**
 * Build the per-field metadata zip entries for a package.
 *
 * Returns a map of zip-entry-key -> UTF-8 body bytes. Each key is
 * `metadata/sc_<lower-name>.txt`. Empty / undefined values are skipped
 * entirely.
 */
export function metadataEntries(meta: PackageMetadata): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  // Field order is not load-bearing - the install-side EntrySorter resorts
  // entries before applying. Listed alphabetically by zip key for
  // diff-friendliness.
  const fields: Array<[string, string | undefined]> = [
    ['metadata/sc_author.txt', meta.author],
    ['metadata/sc_comment.txt', meta.comment],
    ['metadata/sc_license.txt', meta.license],
    ['metadata/sc_name.txt', meta.name],
    ['metadata/sc_publisher.txt', meta.publisher],
    ['metadata/sc_version.txt', meta.version],
  ];

  for (const [key, value] of fields) {
    if (value === undefined || value === '') continue;
    out[key] = encoder.encode(value);
  }

  return out;
}
