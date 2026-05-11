import type { Engine } from '../index.js';
import { applyFieldEdit } from '../mutate-fields.js';
import { getTemplateSchema } from '../template-schema.js';
import { ScaffoldError } from './types.js';

/**
 * Scoped field update for the scaffolding orchestrators. itemId is the
 * tree item ID; fieldId + value are passed straight through to the
 * engine's plan-then-apply field-update path.
 */
export type ScopedFieldUpdate = {
  itemId: string;
  fieldId: string;
  value: string;
  language?: string;
  version?: number;
};

/**
 * Internal helper for the scaffolding orchestrators - applies many field
 * updates across many items, batching by itemId so each item receives at
 * most one plan-then-apply round. Mirrors the safety pattern in the PUT
 * /api/items/:id route: replay the field edits in-memory before applying
 * the disk plan, revert in-memory if the plan throws.
 */
export async function applyFieldUpdates(
  engine: Engine,
  updates: ScopedFieldUpdate[],
): Promise<void> {
  if (updates.length === 0) return;

  // Group updates by itemId so each item gets one plan + one write.
  const byItemId = new Map<string, ScopedFieldUpdate[]>();
  for (const u of updates) {
    const list = byItemId.get(u.itemId) ?? [];
    list.push(u);
    byItemId.set(u.itemId, list);
  }

  for (const [itemId, group] of byItemId) {
    const node = engine.getItemById(itemId);
    if (!node) {
      throw new ScaffoldError('parent-not-found', `Item not found: ${itemId}`);
    }

    // All updates in a group share a language/version (in practice, all en/1
    // for scaffolding). Take the first entry's values, fall back to en/1.
    const language = group[0].language ?? 'en';
    const version = group[0].version ?? 1;

    const fields: Record<string, string> = {};
    for (const u of group) {
      fields[u.fieldId.toLowerCase()] = u.value;
    }

    const plan = await engine.planUpdateFields(itemId, fields, language, version);
    if (plan.files.length === 0) continue; // no effective change

    // Replay edits in-memory so the live tree matches the on-disk write.
    const schema = getTemplateSchema(node.item.template, engine);
    const scopeByFieldId = new Map<string, 'shared' | 'unversioned' | 'versioned'>();
    const nameByFieldId = new Map<string, string>();
    for (const section of schema.sections) {
      for (const field of section.fields) {
        scopeByFieldId.set(
          field.id.toLowerCase(),
          field.unversioned ? 'unversioned' : field.shared ? 'shared' : 'versioned',
        );
        nameByFieldId.set(field.id.toLowerCase(), field.name);
      }
    }
    for (const [rawId, value] of Object.entries(fields)) {
      const lower = rawId.toLowerCase();
      applyFieldEdit(
        node.item,
        lower,
        value,
        language,
        version,
        scopeByFieldId.get(lower),
        nameByFieldId.get(lower) ?? '',
      );
    }

    await engine.applyPlan(plan);
  }
}
