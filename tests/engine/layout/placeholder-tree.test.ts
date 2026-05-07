import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPlaceholderTree } from '../../../src/engine/layout/placeholder-tree.js';
import type { RenderingEntry } from '../../../src/engine/layout/types.js';
import { buildEngine, seedRenderingPlaceholders } from './_helpers.js';

function entry(overrides: Partial<RenderingEntry> & { uid: string }): RenderingEntry {
  return {
    renderingId: '11111111-1111-1111-1111-111111111111',
    placeholder: 'headless-main',
    dataSource: '',
    params: {},
    ...overrides,
  };
}

describe('buildPlaceholderTree', () => {
  it('returns empty object for empty array', () => {
    expect(buildPlaceholderTree([])).toEqual({});
  });

  it('normalizes a three-numeric-tail segment by keeping the literal index', () => {
    // Carousel slides use `name-<slot>-<dpid>-<uid>` format. The slot should
    // be preserved, the trailing two numerics stripped. The key lives under
    // whichever sibling in `main` has DynamicPlaceholderId that matches the
    // full (unnormalized) intermediate, but normalization of the FINAL
    // segment determines the placeholder key name.
    const entries = [
      entry({ uid: '{CAR}', placeholder: 'main', params: { DynamicPlaceholderId: '1' } }),
      entry({ uid: '{SLOT0}', placeholder: '/main/carousel-slide-0-0-6' }),
      entry({ uid: '{SLOT5}', placeholder: '/main/carousel-slide-5-0-6' }),
    ];
    const tree = buildPlaceholderTree(entries);
    const car = tree.main[0];
    expect(car.placeholders?.['carousel-slide-0']?.[0].uid).toBe('{SLOT0}');
    expect(car.placeholders?.['carousel-slide-5']?.[0].uid).toBe('{SLOT5}');
  });

  it('matches nested path segments by DynamicPlaceholderId, not position', () => {
    // 3 sibling containers at container-{*}, with DynamicPlaceholderIds 1, 2, 11.
    // Each has a child at `container-N/container-X`. The deep path
    // `container-2/container-47` must attach to the container whose
    // DynamicPlaceholderId is 2, not to "the last sibling".
    const entries = [
      entry({ uid: '{A}', placeholder: 'main', params: { DynamicPlaceholderId: '1' } }),
      entry({ uid: '{B}', placeholder: 'main', params: { DynamicPlaceholderId: '2' } }),
      entry({ uid: '{C}', placeholder: 'main', params: { DynamicPlaceholderId: '11' } }),
      entry({ uid: '{B-child}', placeholder: '/main/container-2', params: { DynamicPlaceholderId: '47' } }),
      entry({ uid: '{A-child}', placeholder: '/main/container-1', params: { DynamicPlaceholderId: '48' } }),
      entry({ uid: '{C-child}', placeholder: '/main/container-11', params: { DynamicPlaceholderId: '49' } }),
    ];
    const tree = buildPlaceholderTree(entries);
    const [a, b, c] = tree.main;
    expect(a.uid).toBe('{A}');
    expect(b.uid).toBe('{B}');
    expect(c.uid).toBe('{C}');
    expect(a.placeholders?.['container-{*}']?.[0].uid).toBe('{A-child}');
    expect(b.placeholders?.['container-{*}']?.[0].uid).toBe('{B-child}');
    expect(c.placeholders?.['container-{*}']?.[0].uid).toBe('{C-child}');
  });

  it('routes deep paths through the correct sibling by DynamicPlaceholderId', () => {
    // Two sibling containers; a grandchild at container-1/container-47/leaf
    // must land on the one whose DynamicPlaceholderId=47 (a child of A).
    const entries = [
      entry({ uid: '{A}', placeholder: 'main', params: { DynamicPlaceholderId: '1' } }),
      entry({ uid: '{B}', placeholder: 'main', params: { DynamicPlaceholderId: '2' } }),
      entry({ uid: '{A-47}', placeholder: '/main/container-1', params: { DynamicPlaceholderId: '47' } }),
      entry({ uid: '{B-48}', placeholder: '/main/container-2', params: { DynamicPlaceholderId: '48' } }),
      entry({ uid: '{LEAF}', placeholder: '/main/container-1/container-47', params: { DynamicPlaceholderId: '99' } }),
    ];
    const tree = buildPlaceholderTree(entries);
    const a47 = tree.main[0].placeholders?.['container-{*}']?.[0];
    expect(a47?.uid).toBe('{A-47}');
    expect(a47?.placeholders?.['container-{*}']?.[0].uid).toBe('{LEAF}');
    // And B-48 should not have picked up the leaf.
    const b48 = tree.main[1].placeholders?.['container-{*}']?.[0];
    expect(b48?.placeholders).toBeUndefined();
  });

  it('groups top-level renderings by placeholder name', () => {
    const entries = [
      entry({ uid: '{A}', placeholder: 'headless-header' }),
      entry({ uid: '{B}', placeholder: 'headless-main' }),
      entry({ uid: '{C}', placeholder: 'headless-footer' }),
    ];
    const tree = buildPlaceholderTree(entries);
    expect(Object.keys(tree)).toEqual(['headless-header', 'headless-main', 'headless-footer']);
    expect(tree['headless-header']).toHaveLength(1);
    expect(tree['headless-header'][0].uid).toBe('{A}');
  });

  it('preserves document order within a placeholder', () => {
    const entries = [
      entry({ uid: '{A}', placeholder: 'main' }),
      entry({ uid: '{B}', placeholder: 'main' }),
      entry({ uid: '{C}', placeholder: 'main' }),
    ];
    const tree = buildPlaceholderTree(entries);
    expect(tree['main'].map(n => n.uid)).toEqual(['{A}', '{B}', '{C}']);
  });

  it('nests a child rendering inside its parent placeholder', () => {
    const entries = [
      entry({ uid: '{PARENT}', placeholder: 'headless-header', params: { DynamicPlaceholderId: '1' } }),
      entry({ uid: '{CHILD}', placeholder: '/headless-header/container-1' }),
    ];
    const tree = buildPlaceholderTree(entries);
    expect(tree['headless-header']).toHaveLength(1);
    const parent = tree['headless-header'][0];
    expect(parent.uid).toBe('{PARENT}');
    expect(parent.placeholders).toBeDefined();
    expect(parent.placeholders!['container-{*}']).toHaveLength(1);
    expect(parent.placeholders!['container-{*}'][0].uid).toBe('{CHILD}');
  });

  it('nests multiple levels deep', () => {
    const entries = [
      entry({ uid: '{L1}', placeholder: 'header', params: { DynamicPlaceholderId: '1' } }),
      entry({ uid: '{L2}', placeholder: '/header/container-1', params: { DynamicPlaceholderId: '2' } }),
      entry({ uid: '{L3}', placeholder: '/header/container-1/inner-2' }),
    ];
    const tree = buildPlaceholderTree(entries);
    const l1 = tree['header'][0];
    const l2 = l1.placeholders!['container-{*}'][0];
    const l3 = l2.placeholders!['inner-{*}'][0];
    expect(l3.uid).toBe('{L3}');
  });

  it('normalizes dynamic placeholder suffixes to {*}', () => {
    const entries = [
      entry({ uid: '{P}', placeholder: 'root', params: { DynamicPlaceholderId: '5' } }),
      entry({ uid: '{C1}', placeholder: '/root/widget-5' }),
      entry({ uid: '{C2}', placeholder: '/root/widget-5' }),
    ];
    const tree = buildPlaceholderTree(entries);
    const parent = tree['root'][0];
    expect(parent.placeholders!['widget-{*}']).toHaveLength(2);
  });

  it('handles non-dynamic placeholders (no numeric suffix)', () => {
    const entries = [
      entry({ uid: '{P}', placeholder: 'header' }),
      entry({ uid: '{C}', placeholder: '/header/sxa-header' }),
    ];
    const tree = buildPlaceholderTree(entries);
    const parent = tree['header'][0];
    expect(parent.placeholders!['sxa-header']).toHaveLength(1);
  });

  it('skips orphan renderings that reference nonexistent parents', () => {
    const entries = [
      entry({ uid: '{ORPHAN}', placeholder: '/nonexistent/container-1' }),
    ];
    const tree = buildPlaceholderTree(entries);
    expect(Object.keys(tree)).toHaveLength(0);
  });

  it('handles a realistic header/main/footer structure', () => {
    const entries = [
      entry({ uid: '{H1}', placeholder: 'headless-header', params: { ph: 'headless-header', sig: 'sxa-header' } }),
      entry({ uid: '{H2}', placeholder: '/headless-header/sxa-header' }),
      entry({ uid: '{M1}', placeholder: 'headless-main' }),
      entry({ uid: '{F1}', placeholder: 'headless-footer' }),
    ];
    const tree = buildPlaceholderTree(entries);
    expect(Object.keys(tree)).toEqual(['headless-header', 'headless-main', 'headless-footer']);
    expect(tree['headless-header'][0].placeholders!['sxa-header']).toHaveLength(1);
  });
});

describe('buildPlaceholderTree — 0.4.0.20 single-slot parent-dynId collapse', () => {
  it('collapses a child segment of shape `name-0-<dynId>` to bare literal when the parent owns <dynId>', () => {
    // Real-world Event Streaming Body shape: InteractionContent parent with
    // DynamicPlaceholderId=3, child at `.../parent/event-streaming-placeholder-0-3`.
    // Sitecore emits the child under the literal key `event-streaming-placeholder`
    // (single-slot declared placeholder; trailing `-3` identifies the parent
    // dynId, `-0` is the solo instance index - both collapse).
    const entries = [
      entry({ uid: '{PARENT}', placeholder: 'main', params: { DynamicPlaceholderId: '3' } }),
      entry({
        uid: '{CHILD}',
        placeholder: '/main/event-streaming-placeholder-0-3',
        params: { DynamicPlaceholderId: '10' },
      }),
    ];
    const tree = buildPlaceholderTree(entries);
    const parent = tree['main'][0];
    expect(parent.uid).toBe('{PARENT}');
    expect(parent.placeholders?.['event-streaming-placeholder']).toHaveLength(1);
    expect(parent.placeholders?.['event-streaming-placeholder']?.[0].uid).toBe('{CHILD}');
    // The dynamic-pattern key must not be emitted.
    expect(parent.placeholders?.['event-streaming-placeholder-0-{*}']).toBeUndefined();
    expect(parent.placeholders?.['event-streaming-placeholder-{*}']).toBeUndefined();
  });

  it('applies the same collapse to FAQ-style `faq-list-placeholder-0-4`', () => {
    const entries = [
      entry({ uid: '{FAQ}', placeholder: 'main', params: { DynamicPlaceholderId: '4' } }),
      entry({ uid: '{ITEM}', placeholder: '/main/faq-list-placeholder-0-4' }),
    ];
    const tree = buildPlaceholderTree(entries);
    const parent = tree['main'][0];
    expect(parent.placeholders?.['faq-list-placeholder']?.[0].uid).toBe('{ITEM}');
    expect(parent.placeholders?.['faq-list-placeholder-0-{*}']).toBeUndefined();
  });

  it('does not collapse when the trailing numeric does not match parent dynId', () => {
    // Defensive: if the trailing numeric isn't the parent's dynId, the segment
    // is a plain single-tail and should normalize to `stem-{*}` (current behavior).
    const entries = [
      entry({ uid: '{P}', placeholder: 'main', params: { DynamicPlaceholderId: '99' } }),
      entry({ uid: '{C}', placeholder: '/main/widget-0-5' }),
    ];
    const tree = buildPlaceholderTree(entries);
    const parent = tree['main'][0];
    // `-5` is not the parent's dynId (99), so fall back to the single-tail rule:
    // `widget-0-5` → `widget-0-{*}`.
    expect(parent.placeholders?.['widget-0-{*}']?.[0].uid).toBe('{C}');
    expect(parent.placeholders?.['widget']).toBeUndefined();
  });

  it('preserves multi-slot index in three-tail `accordion-N-M-K` (regression guard)', () => {
    // accordion-N-M-K: N is the multi-slot index (must be preserved), M is the
    // instance counter, K is the parent dynId. 0.4.0.20 must not disturb this.
    const entries = [
      entry({ uid: '{ACC}', placeholder: 'main', params: { DynamicPlaceholderId: '1' } }),
      entry({ uid: '{S0}', placeholder: '/main/accordion-0-0-1' }),
      entry({ uid: '{S2}', placeholder: '/main/accordion-2-0-1' }),
    ];
    const tree = buildPlaceholderTree(entries);
    const parent = tree['main'][0];
    expect(parent.placeholders?.['accordion-0']?.[0].uid).toBe('{S0}');
    expect(parent.placeholders?.['accordion-2']?.[0].uid).toBe('{S2}');
    // And the bare-literal `accordion` key must NOT appear.
    expect(parent.placeholders?.['accordion']).toBeUndefined();
  });
});

describe('buildPlaceholderTree — P3b hidden propagation', () => {
  it('forwards entry.hidden onto the placeholder node', () => {
    const entries = [
      {
        uid: 'cc000001-0000-0000-0000-000000000001',
        renderingId: 'aa000001-0000-0000-0000-000000000001',
        placeholder: 'main',
        dataSource: '',
        params: {},
        hidden: true,
      },
    ];
    const tree = buildPlaceholderTree(entries);
    expect(tree.main[0].hidden).toBe(true);
  });

  it('omits hidden when entry.hidden is not set', () => {
    const entries = [
      {
        uid: 'cc000001-0000-0000-0000-000000000002',
        renderingId: 'aa000001-0000-0000-0000-000000000002',
        placeholder: 'main',
        dataSource: '',
        params: {},
      },
    ];
    const tree = buildPlaceholderTree(entries);
    expect(tree.main[0].hidden).toBeUndefined();
  });
});

describe('buildPlaceholderTree — 0.4.0.33 orphan-pruning via declared keys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('drops a dynamic-placeholder entry when no sibling has matching DPI', () => {
    // complex placeholder shape — three Container siblings (DPIs 1, 47, 29) each declaring
    // `container-{*}`. An entry targeting `container-9` has no owner: no
    // sibling has DPI=9. Sitecore drops it; mockingbird must too.
    const containerRenderingId = 'c1111111-0000-0000-0000-000000000000';
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, containerRenderingId, ['container-{*}']);

    const entries = [
      entry({
        uid: '{A}',
        renderingId: containerRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '1' },
      }),
      entry({
        uid: '{B}',
        renderingId: containerRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '47' },
      }),
      entry({
        uid: '{C}',
        renderingId: containerRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '29' },
      }),
      entry({
        uid: '{ORPHAN}',
        renderingId: containerRenderingId,
        placeholder: '/main/container-9',
        params: { DynamicPlaceholderId: '9' },
      }),
    ];

    const tree = buildPlaceholderTree(entries, engine);

    // The three owning siblings land correctly.
    expect(tree.main).toHaveLength(3);
    expect(tree.main.map(n => n.uid)).toEqual(['{A}', '{B}', '{C}']);
    // None of them got the orphan grafted into their `container-{*}` slot.
    for (const node of tree.main) {
      expect(node.placeholders?.['container-{*}']).toBeUndefined();
    }
  });

  it('MOCKINGBIRD_PRUNE_ORPHAN_RENDERINGS=off forces legacy last-sibling fallback', () => {
    vi.stubEnv('MOCKINGBIRD_PRUNE_ORPHAN_RENDERINGS', 'off');

    const containerRenderingId = 'c1111111-0000-0000-0000-000000000000';
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, containerRenderingId, ['container-{*}']);

    const entries = [
      entry({
        uid: '{A}',
        renderingId: containerRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '1' },
      }),
      entry({
        uid: '{ORPHAN}',
        renderingId: containerRenderingId,
        placeholder: '/main/container-9',
        params: { DynamicPlaceholderId: '9' },
      }),
    ];

    const tree = buildPlaceholderTree(entries, engine);
    // With pruning OFF, the legacy path catches the orphan under the last sibling's
    // container-{*} slot (same as pre-0.4.0.33).
    expect(tree.main[0].placeholders?.['container-{*}']).toHaveLength(1);

    vi.unstubAllEnvs();
  });

  it('MOCKINGBIRD_DEBUG_ORPHAN_RENDERINGS=1 logs each pruned orphan to stderr', () => {
    vi.stubEnv('MOCKINGBIRD_DEBUG_ORPHAN_RENDERINGS', '1');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const containerRenderingId = 'c1111111-0000-0000-0000-000000000000';
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, containerRenderingId, ['container-{*}']);

    const entries = [
      entry({
        uid: '{A}',
        renderingId: containerRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '1' },
      }),
      entry({
        uid: '{ORPHAN}',
        renderingId: containerRenderingId,
        placeholder: '/main/container-9',
        params: { DynamicPlaceholderId: '9' },
      }),
    ];

    buildPlaceholderTree(entries, engine);

    const logCalls = errSpy.mock.calls.map(c => c.join(' '));
    expect(logCalls.some(s => s.includes('[orphan-prune]') && s.includes('{ORPHAN}'))).toBe(true);
    expect(logCalls.some(s => s.includes('container-9'))).toBe(true);

    errSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('cascade-prunes descendants when their parent is orphaned', () => {
    // complex placeholder shape with B12D3B26 + 3B04001F. Container orphan at container-9,
    // its RichText child at container-9/container-9. When the parent orphans,
    // the child must too (the parent placeholder slot was never created).
    const containerRenderingId = 'c1111111-0000-0000-0000-000000000000';
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, containerRenderingId, ['container-{*}']);

    const entries = [
      entry({
        uid: '{A}',
        renderingId: containerRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '1' },
      }),
      entry({
        uid: '{B12D3B26}',
        renderingId: containerRenderingId,
        placeholder: '/main/container-9',
        params: { DynamicPlaceholderId: '9' },
      }),
      entry({
        uid: '{3B04001F}',
        renderingId: containerRenderingId,
        placeholder: '/main/container-9/container-9',
        params: { DynamicPlaceholderId: '10' },
      }),
    ];

    const tree = buildPlaceholderTree(entries, engine);

    expect(tree.main).toHaveLength(1);
    expect(tree.main[0].uid).toBe('{A}');
    expect(tree.main[0].placeholders).toBeUndefined();
  });

  it('preserves entries whose segment literally matches a declared enumerated key', () => {
    // SXA Carousel declares enumerated placeholders `carousel-slide-0`
    // through `carousel-slide-N` literally (not via {*} substitution).
    // An entry at `.../carousel-slide-5` must land under the Carousel
    // even though no DPI=5 sibling exists.
    const carouselRenderingId = 'ca110101-0000-0000-0000-000000000000';
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, carouselRenderingId, [
      'carousel-slide-0',
      'carousel-slide-1',
      'carousel-slide-5',
    ]);

    const entries = [
      entry({
        uid: '{CAR}',
        renderingId: carouselRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '1' },
      }),
      entry({ uid: '{SLIDE5}', placeholder: '/main/carousel-slide-5' }),
    ];

    const tree = buildPlaceholderTree(entries, engine);
    expect(tree.main[0].placeholders?.['carousel-slide-5']).toHaveLength(1);
    expect(tree.main[0].placeholders?.['carousel-slide-5']?.[0].uid).toBe('{SLIDE5}');
  });

  it('preserves 0.4.0.20 two-tail collapse under declared-keys predicate', () => {
    // InteractionContent parent DPI=3, child at `event-streaming-placeholder-0-3`.
    // With registry seeded, rule 3 (two-tail stem-<inst>-<ownerDPI> + declared
    // stem literally) matches.
    const interactionId = 'f1111111-0000-0000-0000-000000000000';
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, interactionId, ['event-streaming-placeholder']);

    const entries = [
      entry({
        uid: '{PARENT}',
        renderingId: interactionId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '3' },
      }),
      entry({
        uid: '{CHILD}',
        placeholder: '/main/event-streaming-placeholder-0-3',
      }),
    ];

    const tree = buildPlaceholderTree(entries, engine);
    expect(tree.main[0].placeholders?.['event-streaming-placeholder']).toHaveLength(1);
    expect(tree.main[0].placeholders?.['event-streaming-placeholder']?.[0].uid).toBe('{CHILD}');
    // Rule 3 collapses the full segment — the un-collapsed dynamic-key form
    // must NOT also appear (would indicate a double-store bug).
    expect(tree.main[0].placeholders?.['event-streaming-placeholder-0-{*}']).toBeUndefined();
    expect(tree.main[0].placeholders?.['event-streaming-placeholder-{*}']).toBeUndefined();
  });

  it('matches three-tail carousel segment via declared literal stem-N key (rule 4)', () => {
    // SXA Carousel three-tail form: `carousel-slide-<N>-<instance>-<ownerDPI>`.
    // Rule 4 extracts the `stem-N` prefix (`carousel-slide-5`) and matches it
    // against the parent's literal declared keys. The final storage key comes
    // from normalizeSegment's three-tail collapse — same `carousel-slide-5`.
    const carouselRenderingId = 'ca110101-0000-0000-0000-000000000000';
    const engine = buildEngine([]);
    seedRenderingPlaceholders(engine, carouselRenderingId, ['carousel-slide-0', 'carousel-slide-5']);

    const entries = [
      entry({
        uid: '{CAR}',
        renderingId: carouselRenderingId,
        placeholder: 'main',
        params: { DynamicPlaceholderId: '1' },
      }),
      entry({ uid: '{SLIDE5_THREE_TAIL}', placeholder: '/main/carousel-slide-5-0-6' }),
    ];

    const tree = buildPlaceholderTree(entries, engine);
    expect(tree.main[0].placeholders?.['carousel-slide-5']).toHaveLength(1);
    expect(tree.main[0].placeholders?.['carousel-slide-5']?.[0].uid).toBe('{SLIDE5_THREE_TAIL}');
    // Negative: un-collapsed dynamic-key shouldn't also be created.
    expect(tree.main[0].placeholders?.['carousel-slide-5-0-{*}']).toBeUndefined();
  });

  it('falls through to legacy behavior when no engine is passed', () => {
    // Same complex-placeholder-shape fixture as the orphan test, but WITHOUT an engine.
    // The legacy last-sibling fallback fires — this matches pre-0.4.0.33
    // permissive behavior and is what the ~80 existing tests implicitly rely on.
    const entries = [
      entry({ uid: '{A}', placeholder: 'main', params: { DynamicPlaceholderId: '1' } }),
      entry({ uid: '{B}', placeholder: 'main', params: { DynamicPlaceholderId: '47' } }),
      entry({ uid: '{ORPHAN}', placeholder: '/main/container-9', params: { DynamicPlaceholderId: '9' } }),
    ];

    const tree = buildPlaceholderTree(entries);  // no engine
    // Legacy behavior: orphan lands under last sibling's container-{*} slot.
    expect(tree.main[1].placeholders?.['container-{*}']).toHaveLength(1);
    expect(tree.main[1].placeholders?.['container-{*}']?.[0].uid).toBe('{ORPHAN}');
  });
});
