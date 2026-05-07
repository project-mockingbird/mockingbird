import { describe, it, expect } from 'vitest';
import { compareSitecoreSiblings } from '../../../src/engine/layout/sibling-compare.js';
import { makeItem, buildEngine } from './_helpers.js';

describe('compareSitecoreSiblings (0.4.0.11)', () => {
  // Shared comparator for Sitecore's native child-ordering contract:
  // `__Sortorder` ascending (empty/missing → 100), then name ascending
  // case-insensitive. Used by rcr-queries factories + resolveItemChildren.

  const SORTORDER_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

  function withSortOrder(opts: { id: string; path: string; sortOrder?: string }) {
    return makeItem({
      id: opts.id,
      path: opts.path,
      sharedFields: opts.sortOrder !== undefined
        ? [{ id: SORTORDER_ID, hint: '__Sortorder', value: opts.sortOrder }]
        : [],
    });
  }

  it('different __Sortorder values → lower first', () => {
    const a = withSortOrder({ id: 'aa', path: '/x/alpha', sortOrder: '50' });
    const b = withSortOrder({ id: 'bb', path: '/x/zeta', sortOrder: '200' });
    const engine = buildEngine([a, b]);
    expect(compareSitecoreSiblings(engine, a, b)).toBeLessThan(0);
    expect(compareSitecoreSiblings(engine, b, a)).toBeGreaterThan(0);
  });

  it('equal __Sortorder, different names → alphabetical ascending', () => {
    const a = withSortOrder({ id: 'aa', path: '/x/lab', sortOrder: '100' });
    const b = withSortOrder({ id: 'bb', path: '/x/microbiology', sortOrder: '100' });
    const engine = buildEngine([a, b]);
    expect(compareSitecoreSiblings(engine, a, b)).toBeLessThan(0);
    expect(compareSitecoreSiblings(engine, b, a)).toBeGreaterThan(0);
  });

  it('equal __Sortorder, case-different names → case-insensitive', () => {
    const a = withSortOrder({ id: 'aa', path: '/x/Lab', sortOrder: '100' });
    const b = withSortOrder({ id: 'bb', path: '/x/alpha', sortOrder: '100' });
    const engine = buildEngine([a, b]);
    // Lowercased comparison: "alpha" < "lab"
    expect(compareSitecoreSiblings(engine, a, b)).toBeGreaterThan(0);
    expect(compareSitecoreSiblings(engine, b, a)).toBeLessThan(0);
  });

  it('__Sortorder absent on both → treated as default 100, tiebreak to name', () => {
    const a = withSortOrder({ id: 'aa', path: '/x/flowsheet' });
    const b = withSortOrder({ id: 'bb', path: '/x/pathology' });
    const engine = buildEngine([a, b]);
    expect(compareSitecoreSiblings(engine, a, b)).toBeLessThan(0);
  });

  it('name tiebreak ignores punctuation — "Deep Learning" < "De-Identified Data" (0.4.0.29)', () => {
    // Sitecore sorts ContentTokenList items by item-name with punctuation-ignoring
    // collation: stripping non-alphanumeric characters before comparing. Default
    // localeCompare treats `-` as a low-weight character so "De-" sorts before
    // "Dee"; Sitecore's behavior sorts as if the hyphen is absent, so "Deep" <
    // "DeIdentified" and "Deep Learning" lands first. Regression guard for
    // /resources/glossary index 109-110 swap.
    const a = withSortOrder({ id: 'aa', path: '/x/Deep Learning', sortOrder: '100' });
    const b = withSortOrder({ id: 'bb', path: '/x/De-Identified Data', sortOrder: '100' });
    const engine = buildEngine([a, b]);
    expect(compareSitecoreSiblings(engine, a, b)).toBeLessThan(0);
    expect(compareSitecoreSiblings(engine, b, a)).toBeGreaterThan(0);
  });

  it('hyphenated name sorts after space-containing peer cluster — "Cloud SQL" < "Cloud-native" (0.4.0.37)', () => {
    // Prod emits `/resources/glossary` ContentTokenList with `Cloud-native`
    // AFTER the entire `Cloud <word>` cluster (Cloud Run, Cloud Scheduler,
    // Cloud SQL). 0.4.0.29's `ignorePunctuation: true` stripped both hyphens
    // AND spaces, collapsing `Cloud-native` and `Cloud Run` to the same
    // `Cloud*` prefix-compare — placing `Cloud-native` mid-cluster (between
    // `Cloud Landing Zone` and `Cloud Run`).
    //
    // 0.4.0.37 switches to hyphen-only preprocessing + default space-sortable
    // collator: `Cloud-native` → `Cloudnative` (no space), `Cloud SQL` →
    // `Cloud SQL` (space kept). At position 5 the space sorts before the
    // letter `n`, so `Cloud <word>` < `Cloud-native` for every peer in the
    // space-separated cluster.
    const sql = withSortOrder({ id: 'aa', path: '/x/Cloud SQL', sortOrder: '100' });
    const native = withSortOrder({ id: 'bb', path: '/x/Cloud-native', sortOrder: '100' });
    const engine = buildEngine([sql, native]);
    expect(compareSitecoreSiblings(engine, sql, native)).toBeLessThan(0);
    expect(compareSitecoreSiblings(engine, native, sql)).toBeGreaterThan(0);
  });

  it('hyphenated name still sorts before its space-containing peer when strip produces an ASCII-lower prefix — "Cloud App Factory" < "Cloud-native" (0.4.0.37)', () => {
    // Confirm the full Cloud cluster ordering: the first entry in the cluster
    // (`Cloud App Factory`) sorts before `Cloud-native` — position 5 space <
    // position 5 `n`. This pins the "whole cluster before `Cloud-native`"
    // invariant at both ends.
    const app = withSortOrder({ id: 'aa', path: '/x/Cloud App Factory', sortOrder: '100' });
    const native = withSortOrder({ id: 'bb', path: '/x/Cloud-native', sortOrder: '100' });
    const engine = buildEngine([app, native]);
    expect(compareSitecoreSiblings(engine, app, native)).toBeLessThan(0);
    expect(compareSitecoreSiblings(engine, native, app)).toBeGreaterThan(0);
  });
});
