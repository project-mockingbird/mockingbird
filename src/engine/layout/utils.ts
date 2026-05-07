import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import type { JssFieldValue } from './types.js';
import { getTemplateSchema } from '../template-schema.js';
import { formatField, emptyValueForType } from './field-formatter.js';
import { buildItemValueIndex, resolveFieldValue } from './item-fields.js';
import { isSiteMetadataSection } from './section-filters.js';

/** Get the item name (last path segment) from a Sitecore path. */
export function itemName(path: string): string {
  return path.split('/').pop() ?? '';
}

interface FormatItemFieldsOptions {
  /** Skip fields from standard template sections (default: true). */
  skipStandardSections?: boolean;
  /**
   * Reserved for backwards compatibility — schema-driven emission only iterates
   * fields known to the template schema, so unknown fields are inherently skipped.
   */
  skipUnknownFields?: boolean;
}

/**
 * Format all fields from an item, schema-driven: walk the template's full
 * inheritance chain (own + base templates) and emit a value for every field.
 * Stored values come from the YAML; missing fields get a typed empty default
 * so consumers (JSS rendering host) see a stable shape.
 *
 * Edge mirrors this behaviour — components bind to `fields.Foo` even when the
 * item has never been authored with a value for `Foo`.
 */
export function formatItemFields(
  item: ScsItem,
  engine: Engine,
  mediaBaseUrl: string,
  siteRootPath: string,
  language: string,
  options: FormatItemFieldsOptions = {},
): Record<string, JssFieldValue> {
  // Default to skipping standard sections (Statistics, Workflow, etc.) — Edge
  // never emits those system fields.
  const { skipStandardSections = true } = options;
  const fields: Record<string, JssFieldValue> = {};

  // Build the per-item value index once — shared → unversioned → versioned,
  // later entries overwrite — and re-use it for every schema field below.
  const index = buildItemValueIndex(item, language);

  // Walk the schema and emit one entry per field defined on the template.
  const schema = getTemplateSchema(item.template, engine);
  for (const section of schema.sections) {
    if (skipStandardSections && section.isStandard) continue;
    if (skipStandardSections && isSiteMetadataSection(section.sourceTemplateId, engine)) continue;
    for (const f of section.fields) {
      if (f.name.startsWith('__')) continue;
      // `resolveFieldValue` applies the three-branch rule (stored non-empty,
      // explicit empty suppresses SV, missing cascades to SV). Returns
      // `undefined` when the caller should emit the type's empty default.
      const value = resolveFieldValue(index, f.id, f.name, item, language, engine, siteRootPath);
      fields[f.name] = value !== undefined
        ? formatField(value, f.type, engine, mediaBaseUrl, siteRootPath)
        : emptyValueForType(f.type);
    }
  }

  return fields;
}
