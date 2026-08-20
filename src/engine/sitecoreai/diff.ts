import { FIELD_IDS } from '../constants.js';
import type { ItemSnapshot, ItemUpdateOp, SnapshotField } from './types.js';

const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

// Volatile system/statistics fields dropped from BOTH sides before diffing, matching SCS
// default serialization (the workspace YAML omits them). Prevents spurious UPDATE/RESET churn
// and makes empty-diff -> skip hold. Superset of graphql-dotnet's __Revision-on-Template guard.
const EXCLUDED_FIELD_IDS = new Set(
  [
    'b1e16562-f3f9-4ddd-84ca-6e099950ecc0', // __Last run
    FIELD_IDS.revision,                      // __Revision
    '52807595-0f8f-4b20-8d2a-cb71d28c6103', // __Owner
    FIELD_IDS.updated,                       // __Updated
    FIELD_IDS.updatedBy,                     // __Updated by
    '001dd393-96c5-490b-924a-b0f25cd9efd8', // __Lock
  ].map(normalizeId),
);

function normalizeId(id: string): string {
  return (id ?? '').replace(/[{}]/g, '').toLowerCase();
}
function keep(fields: SnapshotField[] = []): SnapshotField[] {
  return fields.filter((f) => !EXCLUDED_FIELD_IDS.has(normalizeId(f.fieldId)));
}
function stripNewlines(v: string): string {
  return (v ?? '').replace(/[\r\n]/g, '');
}

/** Port of ItemComparer.IsFieldDifferent (left = source, right = target). */
export function isFieldDifferent(left: SnapshotField, right: SnapshotField): boolean {
  const lv = left.value ?? null;
  const rv = right.value ?? null;
  if (lv === null && rv === null) return false;
  if (left.blobId && right.blobId && normalizeId(left.blobId) !== normalizeId(right.blobId)) return true;
  if (lv === null || rv === null) return true;
  return stripNewlines(lv) !== stripNewlines(rv);
}

function isTemplateChanged(sTid: string, tTid: string): boolean {
  const s = normalizeId(sTid);
  const t = normalizeId(tTid);
  if ((s === '' || s === ZERO_GUID) && (t === '' || t === ZERO_GUID)) return false;
  return s !== t;
}

/** Field-set diff shared by shared/unversioned/versioned scopes. */
function fieldOps(
  sourceFields: SnapshotField[],
  targetFields: SnapshotField[],
  language: string | undefined,
  version: number | undefined,
): ItemUpdateOp[] {
  const ops: ItemUpdateOp[] = [];
  const targetById = new Map(targetFields.map((f) => [normalizeId(f.fieldId), f] as const));
  const sourceIds = new Set<string>();
  for (const f of sourceFields) {
    sourceIds.add(normalizeId(f.fieldId));
    const tf = targetById.get(normalizeId(f.fieldId));
    if (!tf || isFieldDifferent(f, tf)) {
      ops.push({ kind: 'updateField', fieldId: f.fieldId, value: f.value, blobId: f.blobId, language, version });
    }
  }
  for (const tf of targetFields) {
    if (!sourceIds.has(normalizeId(tf.fieldId))) {
      ops.push({ kind: 'resetField', fieldId: tf.fieldId, language, version });
    }
  }
  return ops;
}

/**
 * Diff a source snapshot against a target snapshot, producing the faithful UPDATE op list.
 * Port of graphql-dotnet ItemComparer + AddItemCommands (see spec 2.5), cross-checked against
 * Rift's live buildUpdateSubCommands (spec 2.7). Order: template, versions, unversioned, shared.
 */
export function diffItem(source: ItemSnapshot, target: ItemSnapshot): ItemUpdateOp[] {
  const ops: ItemUpdateOp[] = [];

  if (isTemplateChanged(source.templateId, target.templateId)) {
    ops.push({ kind: 'changeTemplate', templateId: source.templateId });
  }

  // Versions
  const vkey = (language: string, version: number) => `${language.toLowerCase()}:${version}`;
  const targetByKey = new Map((target.versions ?? []).map((v) => [vkey(v.language, v.version), v] as const));
  const sourceKeys = new Set((source.versions ?? []).map((v) => vkey(v.language, v.version)));
  for (const sv of source.versions ?? []) {
    const tv = targetByKey.get(vkey(sv.language, sv.version));
    const sFields = keep(sv.fields);
    if (!tv) {
      if (sv.fields.length === 0) {
        ops.push({ kind: 'addVersion', language: sv.language, version: sv.version });
      } else {
        ops.push(...fieldOps(sFields, [], sv.language, sv.version));
      }
    } else {
      ops.push(...fieldOps(sFields, keep(tv.fields), sv.language, sv.version));
    }
  }
  for (const tv of target.versions ?? []) {
    if (!sourceKeys.has(vkey(tv.language, tv.version))) {
      ops.push({ kind: 'removeVersion', language: tv.language, version: tv.version });
    }
  }

  // Unversioned (per language)
  const targetUnvByLang = new Map((target.unversionedFields ?? []).map((u) => [u.language.toLowerCase(), u] as const));
  const sourceLangs = new Set((source.unversionedFields ?? []).map((u) => u.language.toLowerCase()));
  for (const su of source.unversionedFields ?? []) {
    const tu = targetUnvByLang.get(su.language.toLowerCase());
    ops.push(...fieldOps(keep(su.fields), keep(tu?.fields), su.language, undefined));
  }
  for (const tu of target.unversionedFields ?? []) {
    if (!sourceLangs.has(tu.language.toLowerCase())) {
      for (const tf of keep(tu.fields)) ops.push({ kind: 'resetField', fieldId: tf.fieldId, language: tu.language });
    }
  }

  // Shared
  ops.push(...fieldOps(keep(source.sharedFields), keep(target.sharedFields), undefined, undefined));

  return ops;
}
