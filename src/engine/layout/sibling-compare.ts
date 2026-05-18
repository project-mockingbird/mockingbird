import type { Engine } from '../index.js';
import type { ScsItem } from '../types.js';
import { readSortOrder } from './contents-resolvers.js';

/**
 * Collator for sibling name tiebreak. `sensitivity: 'base'` collapses case
 * + accent variations. Hyphens are stripped BEFORE comparison (see
 * {@link stripHyphens}) while spaces and other characters are kept - this
 * matches prod's observed ordering on `/resources/glossary` where:
 *
 *   - `"Deep Learning"` sorts before `"De-Identified Data"` (0.4.0.29/H.2)
 *     because the hyphen strip produces `"Deep Learning"` vs
 *     `"DeIdentified Data"` and `"Deep"` < `"DeI"` at primary weight.
 *   - `"Cloud-native"` sorts AFTER the entire `"Cloud <word>"` cluster
 *     (0.4.0.37/H.2 extension) because hyphen-stripping produces
 *     `"Cloudnative"` (no space) and the space-preserving cluster entries
 *     (`"Cloud Run"`, `"Cloud Scheduler"`, `"Cloud SQL"`) have a space at
 *     position 5 which sorts before letters.
 *
 * 0.4.0.29 used `Intl.Collator`'s `ignorePunctuation: true` option, which
 * stripped BOTH hyphens AND spaces. That collapsed `"Cloud-native"` and
 * `"Cloud Run"` to the same prefix-compare, placing the hyphenated form
 * mid-cluster. Preserving spaces (only hyphens stripped) gives prod-
 * matching order in both the H.2 original case and the Cloud-native case.
 */
const NAME_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

function stripHyphens(s: string): string {
  return s.replace(/-/g, '');
}

/**
 * Compare two items by Sitecore's native sibling order: `__Sortorder`
 * ascending, with punctuation-ignoring, case-insensitive name-ascending
 * tiebreak. Matches Sitecore's `ChildListOptions` + content tree sort used
 * by the Kernel whenever siblings are emitted in natural order.
 *
 * Shared between the RCR query factories (`rcr-queries.ts`) and
 * `resolveItemChildren` (`item-query/index.ts`). Name is pulled from the
 * last path segment - matches Sitecore item-name semantics (the same
 * derivation previously used by both sites' inline comparators).
 *
 * 0.4.0.28: `engine` threaded so the underlying `readSortOrder` can cascade
 * __Sortorder through the template SV chain. Callers using `.sort()` should
 * wrap in an arrow: `.sort((a, b) => compareSitecoreSiblings(engine, a, b))`.
 *
 * 0.4.0.29: name tiebreak switched to `Intl.Collator` with `ignorePunctuation:
 * true` so hyphen-bearing names collate as their punctuation-stripped form.
 *
 * 0.4.0.37: dropped `ignorePunctuation: true` (was stripping spaces as well
 * as hyphens) in favour of explicit hyphen-only preprocessing. Preserves the
 * H.2 closure from 0.4.0.29 AND fixes the `Cloud-native` mid-cluster
 * misplacement on `/resources/glossary`.
 */
export function compareSitecoreSiblings(engine: Engine, a: ScsItem, b: ScsItem): number {
  const diff = readSortOrder(engine, a) - readSortOrder(engine, b);
  if (diff !== 0) return diff;
  const nameA = a.path.split('/').pop()!;
  const nameB = b.path.split('/').pop()!;
  return NAME_COLLATOR.compare(stripHyphens(nameA), stripHyphens(nameB));
}
