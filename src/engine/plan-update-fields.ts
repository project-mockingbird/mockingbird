// src/engine/plan-update-fields.ts
import type { Engine } from './index.js';
import type { MutationPlan } from './mutation-plan.js';
import { applyFieldEdit } from './mutate-fields.js';
import { serializeItem } from './serializer.js';
import { readFile } from 'fs/promises';
import { getTemplateSchema, type TemplateSchema } from './template-schema.js';

/**
 * Lookup maps derived from a template schema. Shared between planUpdateFields
 * (clone-side dry-run) and the PUT /api/items/:id handler (live-tree replay).
 * Centralised so name resolution stays consistent across both paths.
 */
export interface SchemaFieldMaps {
  /** lowercased field GUID -> scope (shared / unversioned / versioned). */
  scopeByFieldId: Map<string, 'shared' | 'unversioned' | 'versioned'>;
  /** lowercased field GUID -> field-definition item's tree name (YAML Hint). */
  nameByFieldId: Map<string, string>;
  /** lowercased field name OR display name -> lowercased canonical GUID. */
  idByName: Map<string, string>;
}

/**
 * Build the SchemaFieldMaps for a given template schema. The idByName map
 * carries entries for both the field-definition item's tree name (always)
 * and the field's resolved display name (only when it differs from the
 * tree name). Tree-name entries win on collision so Set-ItemField and
 * SPE-edit-context callers passing the SCS hint string land on the
 * intended field even when a downstream template shares a display name.
 */
export function buildSchemaFieldMaps(schema: TemplateSchema): SchemaFieldMaps {
  const scopeByFieldId = new Map<string, 'shared' | 'unversioned' | 'versioned'>();
  const nameByFieldId = new Map<string, string>();
  const idByName = new Map<string, string>();
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const lowerId = field.id.toLowerCase();
      scopeByFieldId.set(lowerId,
        field.unversioned ? 'unversioned' : field.shared ? 'shared' : 'versioned');
      nameByFieldId.set(lowerId, field.name);
      if (field.name) idByName.set(field.name.toLowerCase(), lowerId);
      if (field.displayName && field.displayName !== field.name) {
        const lowerDn = field.displayName.toLowerCase();
        if (!idByName.has(lowerDn)) idByName.set(lowerDn, lowerId);
      }
    }
  }
  return { scopeByFieldId, nameByFieldId, idByName };
}

/**
 * Resolve a user-supplied field key (name, display name, or GUID) to the
 * canonical lowercased GUID using the precomputed maps. Returns the input
 * lowercased when no schema entry matches; callers should treat that as
 * an off-chain field and either warn or fall through to ghost-field
 * semantics.
 */
export function resolveFieldKey(maps: SchemaFieldMaps, rawKey: string): string {
  const lower = rawKey.toLowerCase();
  if (maps.scopeByFieldId.has(lower)) return lower;
  return maps.idByName.get(lower) ?? lower;
}

export async function planUpdateFields(
  engine: Engine,
  id: string,
  fields: Record<string, string>,
  language: string,
  version: number,
): Promise<MutationPlan> {
  const warnings: string[] = [];

  if (!fields || Object.keys(fields).length === 0) {
    return { files: [], summary: 'no-op (no fields to update)', warnings: ['No fields provided'] };
  }

  const node = engine.getItemById(id);
  if (!node) {
    return { files: [], summary: `no-op (item not found: ${id})`, warnings: [`Item not found: ${id}`] };
  }

  // Snapshot before
  const before = await readFile(node.filePath, 'utf-8').catch(() => serializeItem(node.item));

  const schema = getTemplateSchema(node.item.template, engine);
  const maps = buildSchemaFieldMaps(schema);

  // Clone the item so we don't mutate the live tree during planning
  const cloned = structuredClone(node.item);
  for (const [rawId, value] of Object.entries(fields)) {
    const resolved = resolveFieldKey(maps, rawId);
    if (!maps.scopeByFieldId.has(resolved)) {
      warnings.push(`Field ${rawId} has no schema entry; defaulting to versioned scope`);
    }
    applyFieldEdit(cloned, resolved, value, language, version, maps.scopeByFieldId.get(resolved), maps.nameByFieldId.get(resolved) ?? '');
  }

  const after = serializeItem(cloned);

  if (before === after) {
    return { files: [], summary: 'no-op (no effective change)', warnings };
  }

  const fieldCount = Object.keys(fields).length;
  return {
    files: [{ path: node.filePath, before, after, op: 'update' }],
    summary: `Update ${fieldCount} field${fieldCount === 1 ? '' : 's'} on ${node.item.path}`,
    warnings,
  };
}
