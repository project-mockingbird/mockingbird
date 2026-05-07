// src/engine/package/zip-builder.ts
//
// Inner + outer zip assembler for classic Sitecore .zip packages. Produces the
// bytes that `Sitecore.Install.PackageReader` ingests via
// `Sitecore.Install.Zip.PackageWriter` semantics.
//
// Two-phase shape (per format reference, "Package zip layout" section):
//   1. Inner package.zip  - holds installer/version, metadata/sc_*.txt,
//                           items/.../xml, properties/items/.../xml.
//   2. Outer .zip         - holds exactly one entry: package.zip (the inner
//                           zip's bytes verbatim).
//
// Format authority:
//   - Sitecore.Install.Zip.PackageWriter.Finish (outer wrap)
//   - Sitecore.Install.Zip.PackageWriter.Put (inner entry naming)
//   - Sitecore.Install.Constants (prefix names: items, metadata, properties,
//     installer)
//   - Sitecore.Install.Items.ItemKeyUtils.GetKey + ItemReference.ToString
//     (zip-key encoding for items/.../xml, computed by the caller)
//
// Notes:
//   - The caller passes already-encoded bytes for every entry. This module
//     does not transform keys or content. `metadata` keys arrive as full zip
//     paths (e.g. `metadata/sc_name.txt`); `itemEntries` keys arrive as full
//     zip paths (e.g. `items/master/.../xml` and
//     `properties/items/master/.../xml`).
//   - `installer/project` is OPTIONAL. v1 omits it; the install pipeline
//     tolerates absence per `PackageProject.Builder.Put` (try/catch around
//     deserialize).
//   - `installer/version` body is `installerVersion` UTF-8 bytes verbatim,
//     no BOM, no trailing newline. The fixture value is `41.00.000000.000000`
//     (19 bytes); any string the parser tolerates works.

import { zipSync } from 'fflate';

export interface InnerZipArgs {
  /** e.g. '41.00.000000.000000' to match Sitecore Desktop's emission. */
  installerVersion: string;
  /** Keys are full zip paths like 'metadata/sc_name.txt'. Bytes verbatim. */
  metadata: Record<string, Uint8Array>;
  /**
   * Keys are full zip paths like
   * 'items/master/sitecore/content/.../en/1/xml' and
   * 'properties/items/master/sitecore/content/.../en/1/xml'.
   * Bytes verbatim - caller has already emitted XML and properties text.
   */
  itemEntries: Record<string, Uint8Array>;
}

/**
 * Assemble the inner package.zip. Caller has already encoded every entry.
 * Per the format reference, top-level prefixes are `installer/`, `metadata/`,
 * `items/`, `properties/` (NOT `installer/items/`).
 */
export function buildInnerZip(args: InnerZipArgs): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'installer/version': new TextEncoder().encode(args.installerVersion),
  };

  for (const [key, value] of Object.entries(args.metadata)) {
    entries[key] = value;
  }
  for (const [key, value] of Object.entries(args.itemEntries)) {
    entries[key] = value;
  }

  return zipSync(entries);
}

/**
 * Outer zip contains exactly one entry: package.zip (the inner zip's bytes).
 * Per Sitecore.Install.Zip.PackageWriter.Finish; format reference doc
 * "Outer zip" section. There is no outer `metadata.xml`.
 */
export function buildOuterZip(innerPackageZip: Uint8Array): Uint8Array {
  return zipSync({ 'package.zip': innerPackageZip });
}
