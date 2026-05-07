// src/engine/plan-update-fields.ts
import type { Engine } from './index.js';
import type { MutationPlan } from './mutation-plan.js';
import { applyFieldEdit } from './mutate-fields.js';
import { serializeItem } from './serializer.js';
import { readFile } from 'fs/promises';
import { getTemplateSchema } from './template-schema.js';

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

  // Resolve scopes + display names from template schema
  const schema = getTemplateSchema(node.item.template, engine);
  const scopeByFieldId = new Map<string, 'shared' | 'unversioned' | 'versioned'>();
  const nameByFieldId = new Map<string, string>();
  for (const section of schema.sections) {
    for (const field of section.fields) {
      scopeByFieldId.set(field.id.toLowerCase(),
        field.unversioned ? 'unversioned' : field.shared ? 'shared' : 'versioned');
      nameByFieldId.set(field.id.toLowerCase(), field.name);
    }
  }

  // Clone the item so we don't mutate the live tree during planning
  const cloned = structuredClone(node.item);
  for (const [rawId, value] of Object.entries(fields)) {
    const lower = rawId.toLowerCase();
    if (!scopeByFieldId.has(lower)) {
      warnings.push(`Field ${rawId} has no schema entry; defaulting to versioned scope`);
    }
    applyFieldEdit(cloned, lower, value, language, version, scopeByFieldId.get(lower), nameByFieldId.get(lower) ?? '');
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
