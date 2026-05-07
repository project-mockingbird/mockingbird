import type { Engine } from './index.js';
import {
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  STANDARD_TEMPLATE_ID,
  FIELD_IDS,
  parseBraceGuids,
} from './constants.js';
import {
  type UnifiedItem,
  getId,
  getName,
  getTemplate,
  getSharedField,
  getChildren,
  lookupUnifiedItem,
} from './layout/unified-item.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TemplateFieldSchema {
  id: string;
  name: string;
  type: string;
  source: string;
  shared: boolean;
  unversioned: boolean;
  sortOrder: number;
}

export interface TemplateSectionSchema {
  id: string;
  name: string;
  sortOrder: number;
  isStandard: boolean;
  sourceTemplateId: string;
  fields: TemplateFieldSchema[];
}

export interface TemplateSchema {
  sections: TemplateSectionSchema[];
}

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

const schemaCache = new Map<string, TemplateSchema>();

export function clearTemplateSchemaCache(): void {
  schemaCache.clear();
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function parseSortOrder(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

// parseBaseTemplates was a local copy of parseBraceGuids; deduped per the DRY rule.

function sortByOrderThenName<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Collect sections and fields from a single template (not its bases).
 */
function collectOwnSections(templateItem: UnifiedItem, engine: Engine, isStandard: boolean): TemplateSectionSchema[] {
  const templateId = getId(templateItem);
  const children = getChildren(templateItem, engine);
  const sections: TemplateSectionSchema[] = [];

  for (const child of children) {
    if (getTemplate(child).toLowerCase() !== TEMPLATE_SECTION_TEMPLATE_ID) continue;

    const sectionChildren = getChildren(child, engine);
    const fields: TemplateFieldSchema[] = [];

    for (const fieldChild of sectionChildren) {
      if (getTemplate(fieldChild).toLowerCase() !== TEMPLATE_FIELD_TEMPLATE_ID) continue;

      fields.push({
        id: getId(fieldChild),
        name: getName(fieldChild),
        type: getSharedField(fieldChild, FIELD_IDS.type) ?? '',
        source: getSharedField(fieldChild, FIELD_IDS.source) ?? '',
        shared: getSharedField(fieldChild, FIELD_IDS.shared) === '1',
        unversioned: getSharedField(fieldChild, FIELD_IDS.unversioned) === '1',
        sortOrder: parseSortOrder(getSharedField(fieldChild, FIELD_IDS.sortorder)),
      });
    }

    sections.push({
      id: getId(child),
      name: getName(child),
      sortOrder: parseSortOrder(getSharedField(child, FIELD_IDS.sortorder)),
      isStandard,
      sourceTemplateId: templateId,
      fields: sortByOrderThenName(fields),
    });
  }

  return sections;
}

/**
 * Recursively walk the inheritance chain, collecting sections.
 * Uses BFS-like ordering: own sections first, then base template sections.
 * Deduplication: first occurrence (most-derived) wins.
 */
function collectAllSections(
  templateId: string,
  engine: Engine,
  visited: Set<string>,
  isStandard: boolean,
): TemplateSectionSchema[] {
  const normalizedId = templateId.toLowerCase();
  if (visited.has(normalizedId)) return [];
  visited.add(normalizedId);

  const templateItem = lookupUnifiedItem(normalizedId, engine);
  if (!templateItem) return [];

  const currentIsStandard = isStandard || normalizedId === STANDARD_TEMPLATE_ID;
  const ownSections = collectOwnSections(templateItem, engine, currentIsStandard);

  // Parse base templates
  const baseTemplateValue = getSharedField(templateItem, FIELD_IDS.baseTemplate);
  const baseIds = parseBraceGuids(baseTemplateValue);

  // Recurse into bases
  const baseSections: TemplateSectionSchema[] = [];
  for (const baseId of baseIds) {
    baseSections.push(...collectAllSections(baseId, engine, visited, currentIsStandard));
  }

  return [...ownSections, ...baseSections];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the parameters schema for a rendering item.
 *
 * Reads the rendering's "Parameters Template" field (`FIELD_IDS.parametersTemplate`),
 * which stores a brace-wrapped GUID pointing at a Sitecore template item. When
 * present, delegates to `getTemplateSchema` (which walks the full base-template
 * chain). Returns null when the field is absent, empty, or the rendering item
 * does not exist.
 *
 * Mirrors `RenderingItem.GetParametersStandardValues` in Sitecore.Kernel
 * (Sitecore.Kernel.decompiled.cs:381641-381661): no fallback to Standard
 * Rendering Parameters - callers decide what to do when the field is absent.
 */
export function getRenderingParametersSchema(engine: Engine, renderingId: string): TemplateSchema | null {
  const normalizedRenderingId = renderingId.toLowerCase();
  const renderingItem = lookupUnifiedItem(normalizedRenderingId, engine);
  if (!renderingItem) return null;

  const rawValue = getSharedField(renderingItem, FIELD_IDS.parametersTemplate);
  if (!rawValue) return null;

  // The field stores a single brace-wrapped GUID, e.g. "{AFE34E90-...}".
  // parseBraceGuids handles both brace and plain forms.
  const guids = parseBraceGuids(rawValue);
  if (guids.length === 0) return null;

  return getTemplateSchema(guids[0], engine);
}

export function getTemplateSchema(templateId: string, engine: Engine): TemplateSchema {
  const normalizedId = templateId.toLowerCase();

  const cached = schemaCache.get(normalizedId);
  if (cached) return cached;

  const visited = new Set<string>();
  const allSections = collectAllSections(normalizedId, engine, visited, false);

  // Merge by case-insensitive section NAME, not by section ID. Sitecore
  // treats section name as the cross-template identity:
  //   - `Template.GetSection(string sectionName)` lowercases the name and
  //     walks own-then-bases via DoGetSection, returning the first match
  //     (Sitecore.Kernel.decompiled.cs:341273-341276, 341628-341662).
  //   - `TemplateItem.AddSection(name, allowInheritedSection: true)` reuses
  //     an existing inherited section instead of creating a duplicate
  //     (382217-382228).
  // Field-ID dedup also follows first-wins, mirroring `Template.AddFields`
  // (341505-341518). Most-derived wins for both section metadata and any
  // colliding field IDs because `collectAllSections` returns own sections
  // before base-template sections.
  const merged = new Map<string, TemplateSectionSchema>();
  const seenFieldIdsBySection = new Map<string, Set<string>>();
  for (const section of allSections) {
    const key = section.name.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...section, fields: [...section.fields] });
      seenFieldIdsBySection.set(key, new Set(section.fields.map(f => f.id.toLowerCase())));
      continue;
    }
    const seenFieldIds = seenFieldIdsBySection.get(key)!;
    for (const f of section.fields) {
      const fid = f.id.toLowerCase();
      if (seenFieldIds.has(fid)) continue;
      seenFieldIds.add(fid);
      existing.fields.push(f);
    }
  }

  // Re-sort each merged section's fields (the union may have arrived in
  // most-derived-then-base order; `sortByOrderThenName` lands them in the
  // editor-visible order regardless of contributor walk order).
  for (const section of merged.values()) {
    section.fields = sortByOrderThenName(section.fields);
  }

  const schema: TemplateSchema = {
    sections: sortByOrderThenName(Array.from(merged.values())),
  };

  schemaCache.set(normalizedId, schema);
  return schema;
}

/**
 * Augment a base schema with stored-field fallbacks.
 *
 * Sitecore is permissive about field storage: an item may carry fields
 * whose IDs aren't declared in its template's chain. The Kernel's
 * `Field.Type` returns empty for those off-chain fields
 * (Sitecore.Kernel.decompiled.cs:385694 + 593 - `GetTemplateField()` walks
 * the chain and yields null when the field isn't there). Sitecore Pages
 * is more permissive than the Kernel and resolves the editor type by
 * looking up the field-definition item directly by ID, so SXA-installed
 * fields like `OtherProperties` (Extended Options template, NOT in the
 * Json Rendering chain) still render with their native Name Value List
 * editor.
 *
 * This function mirrors the Pages mechanism: for any stored field ID not
 * already present in `schema`, look up the field-definition item by ID,
 * read its Type/Source from the standard template-field shared fields,
 * and synthesize a section entry. Section grouping uses the field-def's
 * parent item name (the section item it lives under) - if a section with
 * that name already exists in the base schema, the field is appended;
 * otherwise a new section is added at the end.
 *
 * Returns a NEW TemplateSchema; does not mutate `schema`.
 */
export function enrichSchemaWithStoredFields(
  schema: TemplateSchema,
  storedFieldIds: Iterable<string>,
  engine: Engine,
): TemplateSchema {
  const seen = new Set<string>();
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      seen.add(f.id.toLowerCase());
    }
  }

  // Gather the off-chain fields, grouped by their parent-section name.
  const additions: { sectionName: string; sectionId: string; field: TemplateFieldSchema }[] = [];
  for (const rawId of storedFieldIds) {
    const id = rawId.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const fieldDef = lookupUnifiedItem(id, engine);
    if (!fieldDef) continue;
    if (getTemplate(fieldDef).toLowerCase() !== TEMPLATE_FIELD_TEMPLATE_ID) continue;

    const fieldType = getSharedField(fieldDef, FIELD_IDS.type) ?? '';
    if (!fieldType) continue; // No type info means we can't improve on the fallback path

    const parentId = fieldDef.kind === 'node' ? fieldDef.value.item.parent : fieldDef.value.parent;
    const parentItem = parentId ? lookupUnifiedItem(parentId.toLowerCase(), engine) : undefined;
    const sectionName = parentItem ? getName(parentItem) : 'Other Fields';
    const sectionId = parentItem ? getId(parentItem) : `synthetic-${id}`;

    additions.push({
      sectionName,
      sectionId,
      field: {
        id: getId(fieldDef),
        name: getName(fieldDef),
        type: fieldType,
        source: getSharedField(fieldDef, FIELD_IDS.source) ?? '',
        shared: getSharedField(fieldDef, FIELD_IDS.shared) === '1',
        unversioned: getSharedField(fieldDef, FIELD_IDS.unversioned) === '1',
        sortOrder: parseSortOrder(getSharedField(fieldDef, FIELD_IDS.sortorder)),
      },
    });
  }

  if (additions.length === 0) return schema;

  // Clone sections + add the new fields. Lower-cased section name is the
  // merge key, mirroring `getTemplateSchema`.
  const sectionsByName = new Map<string, TemplateSectionSchema>();
  const ordered: TemplateSectionSchema[] = [];
  for (const sec of schema.sections) {
    const cloned = { ...sec, fields: [...sec.fields] };
    sectionsByName.set(sec.name.toLowerCase(), cloned);
    ordered.push(cloned);
  }

  for (const add of additions) {
    const key = add.sectionName.toLowerCase();
    const existing = sectionsByName.get(key);
    if (existing) {
      existing.fields.push(add.field);
      continue;
    }
    const newSection: TemplateSectionSchema = {
      id: add.sectionId,
      name: add.sectionName,
      sortOrder: 999_999, // append after declared sections
      isStandard: false,
      sourceTemplateId: '',
      fields: [add.field],
    };
    sectionsByName.set(key, newSection);
    ordered.push(newSection);
  }

  // Re-sort the affected sections' fields.
  for (const sec of ordered) {
    sec.fields = sortByOrderThenName(sec.fields);
  }

  return { sections: sortByOrderThenName(ordered) };
}
