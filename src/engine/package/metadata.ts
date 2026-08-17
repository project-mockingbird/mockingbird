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
//   - Every recognized `MetadataView` key is emitted, empty where unset.
//     Real Sitecore writes the full set (the sample CM package shipped all
//     ten, populated only on `sc_name`); an unset field becomes a 0-byte
//     file (e.g. `sc_readme.txt`), which the parser reads back as "".
//
// Recognized keys per `MetadataView` (PackageName, Author, Version,
// Revision, License, Comment, Readme, Publisher, PostStep, PackageID).
// `PackageMetadata` exposes six of them (name, author, version, comment,
// publisher, license); the other four (revision, readme, poststep, packageid)
// have no corpus-observed value and are emitted as empty placeholders.

import type { PackageMetadata } from './types.js';

/**
 * Build the per-field metadata zip entries for a package.
 *
 * Returns a map of zip-entry-key -> UTF-8 body bytes, one per recognized
 * `MetadataView` key (`metadata/sc_<lower-name>.txt`). Fields with no value
 * are emitted as 0-byte placeholders to match real Sitecore output.
 */
export function metadataEntries(meta: PackageMetadata): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  // All ten recognized keys, populated from PackageMetadata where available.
  // Order is not load-bearing (the install-side EntrySorter resorts before
  // applying); listed alphabetically by zip key for diff-friendliness.
  const fields: Array<[string, string]> = [
    ['metadata/sc_author.txt', meta.author ?? ''],
    ['metadata/sc_comment.txt', meta.comment ?? ''],
    ['metadata/sc_license.txt', meta.license ?? ''],
    ['metadata/sc_name.txt', meta.name ?? ''],
    ['metadata/sc_packageid.txt', ''],
    ['metadata/sc_poststep.txt', ''],
    ['metadata/sc_publisher.txt', meta.publisher ?? ''],
    ['metadata/sc_readme.txt', ''],
    ['metadata/sc_revision.txt', ''],
    ['metadata/sc_version.txt', meta.version ?? ''],
  ];

  for (const [key, value] of fields) {
    out[key] = encoder.encode(value);
  }

  return out;
}
