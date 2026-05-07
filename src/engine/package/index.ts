// src/engine/package/index.ts
//
// `buildPackage` - the public entrypoint for the package builder pipeline.
// Composes the per-emitter modules into a complete classic Sitecore .zip
// package. Server-side; the API route at src/api/routes/package.ts wraps
// this in HTTP plumbing.
//
// Flow:
//   1. validate inputs (sources, metadata.name)
//   2. collectSources(...) -> deduped, sorted ScsItem list
//   3. for each item, for each (language, version): emit item XML + properties
//      (parse-failures become warnings, not abort)
//   4. metadataEntries(metadata) -> per-field zip entries
//   5. buildInnerZip + buildOuterZip -> final bytes

import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import { collectSources } from './collect.js';
import { emitItemXml, type VersionRef } from './item-xml.js';
import { emitProperties } from './properties.js';
import { metadataEntries } from './metadata.js';
import { resolveItemName, resolveTemplateName } from './lookups.js';
import { buildItemKey } from './item-key.js';
import { buildInnerZip, buildOuterZip } from './zip-builder.js';
import { FIELD_IDS } from '../constants.js';
import type {
  CartSource,
  PackageMetadata,
  BuildPackageResult,
  PackageWarning,
} from './types.js';

/**
 * Installer version string emitted into `installer/version`. Matches real
 * Sitecore 10.x emission (`41.00.000000.000000`); `Sitecore.Install.PackageReader`
 * tolerates any non-empty value but using the real one keeps the package
 * indistinguishable from a Sitecore-Desktop-built one for diagnostic tools.
 */
const INSTALLER_VERSION = '41.00.000000.000000';

/**
 * Sitecore ISO format used by `__Created`: `yyyyMMddTHHmmssZ`. Returned when
 * the field is absent on the item version - matches `DateTime.MinValue`'s
 * encoding so the parser sees a deterministic placeholder. Per the format
 * reference doc, the parser tolerates absence but a placeholder keeps the
 * `created` attribute non-empty.
 */
const DEFAULT_CREATED_ISO = '00010101T000000Z';

export async function buildPackage(
  engine: Engine,
  sources: CartSource[],
  metadata: PackageMetadata,
): Promise<BuildPackageResult> {
  if (sources.length === 0) {
    throw new Error('Add at least one source before building.');
  }
  if (!metadata.name) {
    throw new Error('metadata.name is required.');
  }

  const { items, warnings: collectWarnings } = collectSources(engine, sources);
  const warnings: PackageWarning[] = [...collectWarnings];

  const itemEntries: Record<string, Uint8Array> = {};
  const enc = new TextEncoder();

  for (const item of items) {
    try {
      const itemName = resolveItemName(item);
      const templateName = resolveTemplateName(engine, item.template).toLowerCase();

      // For each (language, version) on the item, emit two zip entries:
      // the XML body and its properties companion.
      for (const lang of item.languages) {
        for (const v of lang.versions) {
          const versionRef: VersionRef = { language: lang.language, version: v.version };
          const xml = emitItemXml(engine, item, versionRef, {
            itemName,
            templateName,
            createdIso: deriveCreatedIso(item, lang.language, v.version),
          });
          const propsBytes = emitProperties(engine, item, versionRef);
          const key = buildItemKey(item, versionRef, 'master');
          itemEntries[key] = enc.encode(xml);
          itemEntries[`properties/${key}`] = propsBytes;
        }
      }
    } catch (e) {
      warnings.push({
        kind: 'parse-failure',
        itemId: item.id,
        itemPath: item.path,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const meta = metadataEntries(metadata);

  const innerZip = buildInnerZip({
    installerVersion: INSTALLER_VERSION,
    metadata: meta,
    itemEntries,
  });
  const outerZip = buildOuterZip(innerZip);

  return { zip: outerZip, warnings, itemCount: items.length };
}

/**
 * Read `__Created` for the given (language, version), in the order
 * versioned -> unversioned -> shared. `__Created` is most commonly versioned
 * but can land in any of the three buckets depending on the template; check
 * all three rather than assume.
 *
 * Falls back to `DEFAULT_CREATED_ISO` when the field is absent everywhere.
 * The parser tolerates absence per the format-reference doc, but emitting a
 * deterministic placeholder keeps the `created` attribute non-empty.
 */
function deriveCreatedIso(item: ScsItem, language: string, version: number): string {
  const fieldId = FIELD_IDS.created.toLowerCase();

  const lang = item.languages.find(l => l.language === language);
  if (lang) {
    const ver = lang.versions.find(v => v.version === version);
    if (ver) {
      const versioned = findFieldValue(ver.fields, fieldId);
      if (versioned !== '') return versioned;
    }
    const unversioned = findFieldValue(lang.fields, fieldId);
    if (unversioned !== '') return unversioned;
  }
  const shared = findFieldValue(item.sharedFields, fieldId);
  if (shared !== '') return shared;

  return DEFAULT_CREATED_ISO;
}

function findFieldValue(fields: ScsItem['sharedFields'], fieldIdLc: string): string {
  for (const f of fields) {
    if (f.id.toLowerCase() === fieldIdLc) return f.value;
  }
  return '';
}
