import type { ScsVersion } from '../types.js';

/**
 * Per-version validity predicate — port of Sitecore's `ItemPublishing.IsValid`
 * (`Sitecore.Kernel.decompiled.cs:377576-377602`). Used by `getLatestVersion`
 * (to select which version's fields to read) and by the item-level
 * `isPublishingValid` helper in `publishing.ts` (to drop draft-datasource
 * renderings from emission).
 *
 * Kept in a separate module from `publishing.ts` to break the cycle
 * `item-fields.ts → publishing.ts → item-fields.ts`: `item-fields.ts`
 * consumes `isVersionValid` directly; `publishing.ts` consumes both
 * `isVersionValid` and `getLatestVersion`.
 */

/** Versioned standard field: `__Workflow state`. */
export const WORKFLOW_STATE_FIELD_ID = '3e431de1-525e-47a3-b6b0-1ccbec3a8c98';

/** Versioned standard field: `__Valid from`. */
export const VALID_FROM_FIELD_ID = 'c8f93afe-bfd4-4e8f-9c61-152559854661';

/** Versioned standard field: `__Valid to`. Sitecore's canonical GUID. */
export const VALID_TO_FIELD_ID = '4c346442-e859-4efd-89b2-44aedf467d21';

/** Versioned standard field: `Hide version` — excludes this version from publishing. */
export const HIDE_VERSION_FIELD_ID = 'b8f42732-9cb8-478d-ae95-07e25345fb0f';

/**
 * Default "Final/Approved" workflow state. The reference content tree workflow
 * is binary (Draft / Approved); items are published when in this state.
 */
export const DEFAULT_APPROVED_STATE = 'f7fe5bdd-a991-4a58-9735-cd08f9b097ab';

/**
 * Normalize a workflow-state GUID for comparison: lowercase, unbraced,
 * dashed 36-char form. Accepts braced + uppercase variants.
 */
export function normalizeStateId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^\{|\}$/g, '').toLowerCase();
}

/** Parsed env-var approved-state set (or default when unset / empty). */
export function readApprovedStatesFromEnv(): Set<string> {
  const raw = process.env.MOCKINGBIRD_APPROVED_WORKFLOW_STATES;
  if (!raw) return new Set([DEFAULT_APPROVED_STATE]);
  const set = new Set<string>();
  for (const token of raw.split(',')) {
    const id = normalizeStateId(token);
    if (id) set.add(id);
  }
  return set.size > 0 ? set : new Set([DEFAULT_APPROVED_STATE]);
}

/** True when `requireApproved` should be passed to the IsValid predicate. */
export function isPublishingValidationEnabled(): boolean {
  const mode = (process.env.MOCKINGBIRD_PUBLISHING_VALIDATION ?? 'none').toLowerCase();
  return mode === 'approved';
}

/**
 * Parse a Sitecore ISO date (`YYYYMMDDTHHMMSSZ`) to millis-since-epoch.
 * Returns `undefined` when the value doesn't match — callers treat that
 * as "gate not applied".
 */
export function parseSitecoreDate(raw: string): number | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw.trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(
    parseInt(y, 10),
    parseInt(mo, 10) - 1,
    parseInt(d, 10),
    parseInt(h, 10),
    parseInt(mi, 10),
    parseInt(s, 10),
  );
}

export interface IsVersionValidOptions {
  /** When true, enforces the `IsApproved` gate against `approvedStates`. */
  requireApproved?: boolean;
  /** Workflow states considered approved for publishing. */
  approvedStates?: Set<string>;
}

/**
 * Per-version validity — port of Sitecore's `ItemPublishing.IsValid`.
 *
 * Reads `__Valid from`, `__Valid to`, `Hide version`, and (when
 * `requireApproved`) `__Workflow state` off the version's field list OR
 * the item's language-unversioned field list (`langFields`). Both shapes
 * occur in the reference content tree's serialized YAML; version-level fields take precedence.
 *
 * Returns `true` iff the version is publishable at `date`. Matches
 * Sitecore's semantic that missing `__Valid from`/`__Valid to` default to
 * `DateTime.MinValue`/`DateTime.MaxValue` (unbounded range).
 */
export function isVersionValid(
  version: ScsVersion,
  langFields: Array<{ id: string; value: string }> | undefined,
  date: Date,
  options: IsVersionValidOptions = {},
): boolean {
  const readVersionedField = (fieldId: string): string | undefined =>
    version.fields.find(f => f.id.toLowerCase() === fieldId)?.value
    ?? langFields?.find(f => f.id.toLowerCase() === fieldId)?.value;

  // Sitecore's `InValidRange` short-circuits on Hide version regardless of
  // date gates. Accept any non-empty, non-"0", non-"false" value as true.
  const hideRaw = readVersionedField(HIDE_VERSION_FIELD_ID);
  if (hideRaw && hideRaw !== '0' && hideRaw.toLowerCase() !== 'false') return false;

  const dateMs = date.getTime();

  const validFromRaw = readVersionedField(VALID_FROM_FIELD_ID);
  if (validFromRaw) {
    const validFrom = parseSitecoreDate(validFromRaw);
    if (validFrom !== undefined && validFrom > dateMs) return false;
  }

  const validToRaw = readVersionedField(VALID_TO_FIELD_ID);
  if (validToRaw) {
    const validTo = parseSitecoreDate(validToRaw);
    // Sitecore's `InValidRange` uses strict `<` against valid-to — a version
    // is valid up to but not including the valid-to moment.
    if (validTo !== undefined && validTo <= dateMs) return false;
  }

  if (options.requireApproved) {
    const stateRaw = readVersionedField(WORKFLOW_STATE_FIELD_ID);
    const state = normalizeStateId(stateRaw);
    const approved = options.approvedStates ?? new Set([DEFAULT_APPROVED_STATE]);
    // Versions with no workflow state on this version are "not under
    // workflow" → pass. Matches Sitecore's behaviour when the item's
    // template has no workflow assigned.
    if (state !== undefined && !approved.has(state)) return false;
  }

  return true;
}
