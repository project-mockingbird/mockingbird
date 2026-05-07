// src/engine/mutate-fields.ts
import type { ScsItem } from './types.js';

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
