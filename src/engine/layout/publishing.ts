import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import { getLatestVersion } from './item-fields.js';
import {
  isVersionValid,
  readApprovedStatesFromEnv,
  isPublishingValidationEnabled,
} from './version-validity.js';

/**
 * Item-level publishing validity. Per-version predicate + env config live
 * in `version-validity.ts` (extracted to break the cycle with
 * `item-fields.ts`). See that file's docstring for the Sitecore-side
 * mechanism.
 *
 * This module exposes `isPublishingValid(engine, item, options)` — the
 * entry point callers like `component-resolver.ts` use to decide whether
 * a rendering's datasource is currently publishable. Default-off since
 * 0.4.0.30; opt in with `MOCKINGBIRD_PUBLISHING_VALIDATION=approved`.
 */

// Re-export predicate module for backward compatibility with existing
// consumers + tests that imported from `publishing.ts`.
export {
  WORKFLOW_STATE_FIELD_ID,
  VALID_FROM_FIELD_ID,
  VALID_TO_FIELD_ID,
  HIDE_VERSION_FIELD_ID,
  DEFAULT_APPROVED_STATE,
  isVersionValid,
  readApprovedStatesFromEnv,
  isPublishingValidationEnabled,
  parseSitecoreDate,
  normalizeStateId,
} from './version-validity.js';
export type { IsVersionValidOptions } from './version-validity.js';

export interface PublishingValidationOptions {
  /** Override the approved workflow-state set; default from env. */
  approvedStates?: Set<string>;
  /** Override "now" for deterministic tests. */
  now?: Date;
  /** Override the language used to read the versioned fields. */
  language?: string;
}

/**
 * Return `true` when `item`'s currently-effective version passes the
 * `IsValid` predicate under `requireApproved: true`.
 *
 * Used at rendering datasource resolution to drop renderings whose
 * datasource isn't currently publishable. Does NOT fire when validation
 * is disabled via env var — always returns `true` in that case.
 */
export function isPublishingValid(
  _engine: Engine,
  item: ScsItem,
  options: PublishingValidationOptions = {},
): boolean {
  if (!isPublishingValidationEnabled()) return true;

  const language = options.language ?? 'en';
  const now = options.now ?? new Date();
  const approved = options.approvedStates ?? readApprovedStatesFromEnv();

  const version = getLatestVersion(item, language);
  if (!version) return false;

  const lang = item.languages.find(l => l.language === language);
  return isVersionValid(version, lang?.fields, now, {
    requireApproved: true,
    approvedStates: approved,
  });
}
