import type { Engine } from '../engine/index.js';
import type { RegistryItem, ScsField, ScsLanguage } from '../engine/types.js';
import { classifyItem } from '../engine/constants.js';
import { resolveFieldValue } from './resolve.js';

/**
 * Build an ItemDetail-shaped response from a RegistryItem. Mirrors
 * src/api/routes/items.ts::serializeItemNode but for registry-only items
 * (which have no on-disk YAML, no ItemNode).
 *
 * Returns a plain object so it can be sent over the wire alongside the
 * existing serializeItemNode shape. The `source: 'registry'` discriminator
 * tells the client to render this in read-only mode. Since registry v5.0,
 * the `languages` array is populated from the item's unversionedFields +
 * versionedFields so API consumers see the same shape as serialized items.
 */
export function buildRegistryItemDetail(item: RegistryItem, engine: Engine): Record<string, unknown> {
  const sharedFields: ScsField[] = Object.entries(item.sharedFields).map(([id, value]) => ({
    id,
    hint: '',
    value,
  }));

  const languages = buildLanguages(item);

  const resolvedFields: Record<string, string> = {};
  const allFields = [
    ...sharedFields,
    ...languages.flatMap(l => [...l.fields, ...l.versions.flatMap(v => v.fields)]),
  ];
  for (const field of allFields) {
    if (!field.value) continue;
    const resolved = resolveFieldValue(field.value, engine);
    if (resolved !== field.value) {
      resolvedFields[field.id] = resolved;
    }
  }

  return {
    source: 'registry',
    id: item.id,
    name: item.name,
    path: item.path,
    template: item.template,
    parent: item.parent,
    type: classifyItem(item.template),
    filePath: '',
    sharedFields,
    languages,
    resolvedFields: Object.keys(resolvedFields).length > 0 ? resolvedFields : undefined,
    templateResolved: resolveFieldValue(`{${item.template}}`, engine),
    fileSizeBytes: undefined,
  };
}

function buildLanguages(item: RegistryItem): ScsLanguage[] {
  const unv = item.unversionedFields ?? {};
  const ver = item.versionedFields ?? {};
  const languageNames = new Set<string>([...Object.keys(unv), ...Object.keys(ver)]);
  if (languageNames.size === 0) return [];

  const result: ScsLanguage[] = [];
  for (const lang of languageNames) {
    const unvForLang = unv[lang] ?? {};
    const verForLang = ver[lang] ?? {};

    const unversionedFields: ScsField[] = Object.entries(unvForLang).map(([id, value]) => ({
      id,
      hint: '',
      value,
    }));

    const versionNumbers = Object.keys(verForLang)
      .map(v => parseInt(v, 10))
      .filter(n => !Number.isNaN(n))
      .sort((a, b) => a - b);

    const versions = versionNumbers.map(versionNumber => ({
      version: versionNumber,
      fields: Object.entries(verForLang[String(versionNumber)] ?? {}).map(([id, value]) => ({
        id,
        hint: '',
        value,
      })),
    }));

    result.push({ language: lang, fields: unversionedFields, versions });
  }

  result.sort((a, b) => a.language.localeCompare(b.language));
  return result;
}
