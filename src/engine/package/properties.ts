// src/engine/package/properties.ts
//
// Per-version properties companion emitter. Produces the bytes that go into
// the `properties/items/<db>/<path>/<id>/<lang>/<ver>/xml` zip entry of a
// classic Sitecore .zip package - the sibling of the item-XML entry emitted
// by `item-xml.ts`.
//
// Format authority:
//   - Emitter:  Sitecore.Install.Items.ItemToEntryConverter.InternalConvert
//               + Sitecore.Install.Items.ItemFieldsProperties.GetFieldsProperties
//               + Sitecore.IO.StreamUtil.SaveDictionary
//   - Parser:   Sitecore.IO.StreamUtil.LoadDictionary (line-by-line `key=value`).
//
// Empirical:  tests/fixtures/package/known-good/expected-inner/properties/.../xml
//
// Format details (from the empirical findings appendix + fixture hex-dump):
//   - UTF-8 bytes prefixed with a BOM (EF BB BF). This is the only entry
//     class in the package that uses a BOM.
//   - `key=value\r\n` per line (CRLF, the Windows-emitted form via
//     `StreamWriter.WriteLine` + `Environment.NewLine`).
//   - Trailing CRLF after the last line is present in the fixture.
//   - Keys emitted in this order:
//       1. database=master
//       2. id={UPPER-BRACED-ID}              (Sitecore.Data.ID.ToString)
//       3. language=<lang>                   (e.g. en)
//       4. version=<int>                     (1, 2, ...)
//       5. revision=<value>                  (verbatim from __Revision field;
//                                             fresh GUID lowercase-no-braces
//                                             when the field is absent)
//       6. fieldproperties={tfid}:SharingType|...  (no leading pipe)
//       7. id_InstallMode=Merge              (constant in v1)
//       8. id_VersionMergeMode=Merge         (constant in v1)
//
// SharingType labels per `ItemFieldsProperties.GetSharingType`:
//   - field.shared      -> "Shared"
//   - field.unversioned -> "Unversioned"
//   - else              -> "Versioned"
//
// Field iteration order:
//   Sitecore Desktop iterates `item.Fields` (kernel-internal SQL row order).
//   This emitter walks `getTemplateSchema(...)` in its natural order
//   (sections by sortOrder/name, fields-within-section likewise) - same as
//   item-xml.ts. Fixture round-trip compares the field set structurally
//   rather than byte-for-byte on order.

import type { Engine } from '../index.js';
import type { ScsItem, ScsField } from '../types.js';
import { formatGuidBraced, generateGuid } from '../guid.js';
import { getTemplateSchema, type TemplateFieldSchema } from '../template-schema.js';
import { FIELD_IDS } from '../constants.js';
import type { VersionRef } from './item-xml.js';

export type { VersionRef } from './item-xml.js';

const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
const NEWLINE = '\r\n';

/**
 * Emit the per-version properties companion as bytes (with UTF-8 BOM prefix).
 * The caller writes these bytes directly into the zip entry at
 * `properties/<full-item-key>`.
 */
export function emitProperties(
  engine: Engine,
  item: ScsItem,
  versionRef: VersionRef,
): Uint8Array {
  const lines: string[] = [];

  lines.push(`database=master`);
  lines.push(`id=${formatGuidBraced(item.id)}`);
  lines.push(`language=${versionRef.language}`);
  lines.push(`version=${String(versionRef.version)}`);
  lines.push(`revision=${resolveRevision(item, versionRef)}`);
  lines.push(`fieldproperties=${buildFieldProperties(engine, item)}`);
  lines.push(`id_InstallMode=Merge`);
  lines.push(`id_VersionMergeMode=Merge`);

  // CRLF separator between lines + trailing CRLF after the last line, per
  // StreamWriter.WriteLine's Environment.NewLine behavior on Windows. The
  // fixture's last 2 bytes are `0D 0A`, confirming the trailing newline.
  const text = lines.join(NEWLINE) + NEWLINE;
  const body = new TextEncoder().encode(text);

  const out = new Uint8Array(BOM.length + body.length);
  out.set(BOM, 0);
  out.set(body, BOM.length);
  return out;
}

/**
 * Resolve the `revision` value for the per-version properties dict.
 *
 * Sitecore's `Item.Statistics.Revision` returns the value of the `__Revision`
 * field on the version. The property dict emits whatever that field contains
 * verbatim - in real fixtures, lowercase-no-braces (`38ea58d9-...`).
 *
 * Fallback when the field is absent: generate a fresh GUID in
 * lowercase-no-braces form. The install pipeline sets `ReadOnlyStatistics =
 * true` so the target keeps whatever revision the package supplies.
 */
function resolveRevision(item: ScsItem, versionRef: VersionRef): string {
  const fieldId = FIELD_IDS.revision;
  const lang = item.languages.find(l => l.language === versionRef.language);
  if (lang) {
    const ver = lang.versions.find(v => v.version === versionRef.version);
    if (ver) {
      const stored = findFieldValue(ver.fields, fieldId);
      if (stored !== '') return stored;
    }
    const unversioned = findFieldValue(lang.fields, fieldId);
    if (unversioned !== '') return unversioned;
  }
  const shared = findFieldValue(item.sharedFields, fieldId);
  if (shared !== '') return shared;
  // No __Revision stored anywhere - generate one. uuid v4 returns
  // lowercase-no-braces, matching Sitecore Desktop's emission shape.
  return generateGuid();
}

function findFieldValue(fields: ScsField[], fieldIdLc: string): string {
  for (const f of fields) {
    if (f.id.toLowerCase() === fieldIdLc) return f.value;
  }
  return '';
}

/**
 * Build the `fieldproperties` value: pipe-delimited list of
 * `{tfid}:SharingType` for every field defined on the item's template
 * (including inherited base-template fields). No leading pipe.
 *
 * Mirrors `ItemFieldsProperties.GetFieldsProperties`:
 *   foreach (Field f in item.Fields) sb.AppendFormat("|{0}:{1}", f.ID, GetSharingType(f));
 *   return sb.ToString().Substring(1);
 */
function buildFieldProperties(engine: Engine, item: ScsItem): string {
  const schema = getTemplateSchema(item.template, engine);
  const parts: string[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      parts.push(`${formatGuidBraced(field.id)}:${sharingType(field)}`);
    }
  }
  return parts.join('|');
}

/**
 * SharingType label per `ItemFieldsProperties.GetSharingType`. The enum
 * names ("Shared", "Unversioned", "Versioned") are emitted verbatim - they
 * are the .NET `SharingType` enum's `ToString()` output.
 */
function sharingType(field: TemplateFieldSchema): 'Shared' | 'Unversioned' | 'Versioned' {
  if (field.shared) return 'Shared';
  if (field.unversioned) return 'Unversioned';
  return 'Versioned';
}
