// src/engine/mutate-fields.ts
import type { ScsItem } from './types.js';
import type { MutationPlan } from './mutation-plan.js';

/**
 * Read the current value of `fieldId` on `item`, walking the same
 * shared > unversioned > versioned cascade `applyFieldEdit` writes
 * through. Returns `undefined` if the field is not present in any
 * scope (so a caller doing PUT-rollback knows there was no prior value
 * to restore). Does NOT consult the SV cascade or registry - this is
 * strictly the item's own stored fields.
 *
 * Used by the PUT /api/items/:id rollback path to capture the
 * pre-mutation value of every field being written, so an applyPlan
 * failure can be reverted in-memory without leaving the live tree
 * out of sync with disk.
 */
export function readCurrentFieldValue(
  item: ScsItem,
  fieldId: string,
  lang: string,
  version: number,
): string | undefined {
  const shared = item.sharedFields.find(f => f.id === fieldId);
  if (shared) return shared.value;
  const language = item.languages.find(l => l.language === lang);
  if (!language) return undefined;
  const unversioned = language.fields.find(f => f.id === fieldId);
  if (unversioned) return unversioned.value;
  const ver = language.versions.find(v => v.version === version);
  if (!ver) return undefined;
  const versioned = ver.fields.find(f => f.id === fieldId);
  return versioned?.value;
}

/**
 * Apply a single field write to an in-memory `ScsItem`. Does NOT serialize
 * or write to disk - that is the caller's responsibility.
 *
 * Scope cascade ports Sitecore.Kernel.decompiled.cs:373465-476 (FieldChange):
 * Unversioned > Shared > Versioned (default).
 */
export function applyFieldEdit(
  item: ScsItem,
  fieldId: string,
  value: string,
  lang: string,
  version: number,
  scope: 'shared' | 'unversioned' | 'versioned' | undefined,
  hint: string = '',
): void {
  // Heal-only-when-empty semantics: if the field was previously written
  // without a Hint (legacy/upstream YAML), populate it from `hint` so the
  // FieldEditor displays the field name instead of the GUID. Never
  // overwrite a non-empty existing hint - some authors customize hints,
  // and the parameter is only ever the schema default.
  const existingShared = item.sharedFields.find(f => f.id === fieldId);
  if (existingShared) {
    existingShared.value = value;
    if (!existingShared.hint && hint) existingShared.hint = hint;
    return;
  }

  let language = item.languages.find(l => l.language === lang);
  if (language) {
    const existingUnversioned = language.fields.find(f => f.id === fieldId);
    if (existingUnversioned) {
      existingUnversioned.value = value;
      if (!existingUnversioned.hint && hint) existingUnversioned.hint = hint;
      return;
    }
    const ver = language.versions.find(v => v.version === version);
    if (ver) {
      const existingVersioned = ver.fields.find(f => f.id === fieldId);
      if (existingVersioned) {
        existingVersioned.value = value;
        if (!existingVersioned.hint && hint) existingVersioned.hint = hint;
        return;
      }
    }
  }

  const targetScope = scope ?? 'versioned';
  if (targetScope === 'shared') {
    item.sharedFields.push({ id: fieldId, hint, value });
    return;
  }
  if (!language) {
    language = { language: lang, fields: [], versions: [] };
    item.languages.push(language);
  }
  if (targetScope === 'unversioned') {
    language.fields.push({ id: fieldId, hint, value });
    return;
  }
  let ver = language.versions.find(v => v.version === version);
  if (!ver) {
    ver = { version, fields: [] };
    language.versions.push(ver);
  }
  ver.fields.push({ id: fieldId, hint, value });
}

/** A single field write to be applied (and, on failure, rolled back). */
export interface FieldEditSpec {
  item: ScsItem;
  fieldId: string;
  value: string;
  lang: string;
  version: number;
  scope: 'shared' | 'unversioned' | 'versioned' | undefined;
  hint: string;
}

/**
 * Shared capture/replay/rollback dance for live-tree field writes that must
 * stay in sync with a disk-writing `applyPlan`. Used by both the reorder
 * (`POST /api/tree/reorder`) and field-update (`PUT /api/items/:id`) routes,
 * which otherwise duplicated this exact sequence:
 *
 *   1. Capture each edit's prior value via `readCurrentFieldValue` BEFORE
 *      mutating (so a later revert knows what to restore).
 *   2. Replay `applyFieldEdit` for every edit on the live (in-memory) item,
 *      so the tree matches what the plan is about to write to disk.
 *   3. Run `applyPlan`. On success, return normally - the caller's
 *      post-write side effects (cache invalidation, notifyItemChange, etc.)
 *      are the caller's responsibility and happen after this returns.
 *   4. On failure, revert every edit whose captured prior value was
 *      defined, then rethrow. Edits whose field did not previously exist
 *      are deliberately left in place - removing a freshly-pushed entry
 *      would require pulling it back out of the correct scope array, which
 *      is more invasive than the disk-vs-memory mismatch this guards
 *      against.
 *
 * `applyPlan` is taken as a plain function (callers pass
 * `p => engine.applyPlan(p)`) so this module does not need to import the
 * `Engine` type.
 */
export async function applyFieldEditsWithRollback(
  edits: FieldEditSpec[],
  plan: MutationPlan,
  applyPlan: (plan: MutationPlan) => Promise<void>,
): Promise<void> {
  const previous = edits.map(edit => ({
    edit,
    prev: readCurrentFieldValue(edit.item, edit.fieldId, edit.lang, edit.version),
  }));

  for (const edit of edits) {
    applyFieldEdit(edit.item, edit.fieldId, edit.value, edit.lang, edit.version, edit.scope, edit.hint);
  }

  try {
    await applyPlan(plan);
  } catch (err) {
    for (const { edit, prev } of previous) {
      if (prev !== undefined) {
        applyFieldEdit(edit.item, edit.fieldId, prev, edit.lang, edit.version, edit.scope, edit.hint);
      }
    }
    throw err;
  }
}
