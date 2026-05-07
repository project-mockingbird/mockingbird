import type { RenderingEntry, PlaceholderNode } from './types.js';
import type { Engine } from '../index.js';
import { getDeclaredPlaceholderKeys } from './rendering-metadata.js';

/**
 * Normalize a placeholder segment: collapse dynamic-placeholder suffixes to
 * their SXA-rendered form.
 *
 * Examples (no owner context):
 *   "container-1"  → "container-{*}"
 *   "inner-2"      → "inner-{*}"
 *   "widget-5"     → "widget-{*}"
 *   "sxa-header"   → "sxa-header"
 *   "headless-main"→ "headless-main"
 *
 * With `ownerDynId` (terminal segment under a known owner):
 *   "event-streaming-placeholder-0-3" + ownerDynId="3" → "event-streaming-placeholder"
 *   "faq-list-placeholder-0-4"        + ownerDynId="4" → "faq-list-placeholder"
 */
function normalizeSegment(segment: string, ownerDynId?: string): string {
  // SXA uses three distinct tail patterns:
  //
  //   `name-<N>`            — single numeric tail, the dynamic placeholder
  //                           index. Normalize to `name-{*}`.
  //   `name-<N>-<M>-<K>`    — three numeric tails (e.g. `carousel-slide-0-0-6`)
  //                           where the trailing `-<M>-<K>` is a dynamic suffix
  //                           and the first N is the literal slot index. Strip
  //                           the last two numerics; keep `name-<N>` literal.
  //   `name-<N>-<K>`        — two numeric tails where K is the parent
  //                           rendering's DynamicPlaceholderId and N is the
  //                           solo instance index (single-slot declared
  //                           placeholder). SXA renders this to the bare
  //                           literal `name` (0.4.0.20).
  const threeTailMatch = /^(.+?-\d+)-\d+-\d+$/.exec(segment);
  if (threeTailMatch) return threeTailMatch[1];

  // Two-tail parent-dynId collapse — only applies when the owner's dynId is
  // known and matches the trailing numeric. Without this guard, `widget-0-5`
  // would incorrectly collapse to `widget` for an unrelated owner.
  if (ownerDynId) {
    const twoTailMatch = new RegExp(`^(.+?)-\\d+-${ownerDynId}$`).exec(segment);
    if (twoTailMatch) return twoTailMatch[1];
  }

  const singleTailMatch = /^(.+)-(\d+)$/.exec(segment);
  if (singleTailMatch) return `${singleTailMatch[1]}-{*}`;

  return segment;
}

/**
 * Extract the trailing numeric id from a dynamic placeholder segment like
 * `container-2` or `hero-placeholder-1`. Returns undefined when the segment
 * has no numeric suffix.
 */
/** Depth of a placeholder path: top-level (`headless-main`) = 0, `/a/b` = 1, `/a/b/c` = 2, etc. */
function placeholderDepth(ph: string): number {
  if (!ph || !ph.startsWith('/')) return 0;
  // `/a/b` → segments [a, b] → depth 1 (one edge below top-level).
  const segs = ph.slice(1).split('/');
  return segs.length - 1;
}

function dynamicPlaceholderId(segment: string): string | undefined {
  const lastDash = segment.lastIndexOf('-');
  if (lastDash === -1) return undefined;
  const suffix = segment.slice(lastDash + 1);
  return /^\d+$/.test(suffix) ? suffix : undefined;
}

/**
 * Declared-keys-aware owner resolution. Ports Sitecore's structural
 * placeholder filter: a child segment at `/A/B/X` is valid only if some
 * sibling at `/A/B` declares a placeholder whose resolved key equals `X`.
 *
 * Four declared-key match patterns (checked in order, per candidate):
 *
 *   1. Literal:          segment == declared key (static `content`, enumerated `carousel-slide-5`).
 *   2. Dynamic single:   segment = `stem-N`, candidate.DPI = N, declared = `stem-{*}`.
 *   3. Two-tail collapse: segment = `stem-<inst>-<N>`, candidate.DPI = N, declared = `stem`.
 *                         (0.4.0.20 SXA single-slot declared placeholder.)
 *   4. Three-tail collapse: segment = `stem-<N>-<M>-<K>`, declared = `stem-<N>` literally.
 *                           (SXA carousel enumerated placeholders.)
 *
 * Decisive when at least one sibling has non-empty declared keys. When no
 * sibling has registry metadata, returns `{ decided: false }` so the caller
 * can fall through to the legacy behavior (preserves backward compatibility
 * for tests / items whose rendering lacks Placeholders-field enrichment).
 *
 * `resolvedKey` contract: only set by rule 1 (literal declared key).
 * Rules 2/3/4 MUST omit `resolvedKey` — the caller applies normalizeSegment
 * to produce the storage key for dynamic/two-tail/three-tail patterns. If a
 * future rule produces a key where normalizeSegment would corrupt it (as rule
 * 1 does for `carousel-slide-5` → `carousel-slide-{*}`), that rule must also
 * set `resolvedKey: segment` to bypass normalization.
 */
function resolveByDeclaredKeys(
  slot: PlaceholderNode[],
  segment: string,
  engine: Engine,
): { decided: boolean; owner?: PlaceholderNode; resolvedKey?: string } {
  let hasMetadata = false;
  for (let i = slot.length - 1; i >= 0; i--) {
    const candidate = slot[i];
    if (!candidate.renderingId) continue;
    const declared = getDeclaredPlaceholderKeys(engine, candidate.renderingId);
    if (declared.length === 0) continue;
    hasMetadata = true;

    // 1. literal — segment IS a declared key; store under the literal key
    if (declared.includes(segment)) {
      return { decided: true, owner: candidate, resolvedKey: segment };
    }

    const candidateDpi = candidate.params?.DynamicPlaceholderId;

    // 2. stem-N + stem-{*} with DPI match
    const singleTail = /^(.+)-(\d+)$/.exec(segment);
    if (singleTail && candidateDpi === singleTail[2]) {
      const dynKey = `${singleTail[1]}-{*}`;
      if (declared.includes(dynKey)) return { decided: true, owner: candidate };
    }

    // 3. two-tail stem-<inst>-<ownerDPI>
    if (candidateDpi && /^\d+$/.test(candidateDpi)) {
      const twoTail = new RegExp(`^(.+?)-\\d+-${candidateDpi}$`).exec(segment);
      if (twoTail && declared.includes(twoTail[1])) {
        return { decided: true, owner: candidate };
      }
    }

    // 4. three-tail stem-<N>-<M>-<K> → literal stem-<N>
    const threeTail = /^(.+?-\d+)-\d+-\d+$/.exec(segment);
    if (threeTail && declared.includes(threeTail[1])) {
      return { decided: true, owner: candidate };
    }
  }

  // Some sibling had declared keys but none matched → authoritative orphan.
  if (hasMetadata) return { decided: true, owner: undefined };
  // No sibling had registry metadata → let legacy resolve.
  return { decided: false };
}

function isOrphanPruningEnabled(): boolean {
  const v = (process.env.MOCKINGBIRD_PRUNE_ORPHAN_RENDERINGS ?? 'on').toLowerCase();
  return v !== 'off' && v !== '0' && v !== 'false';
}

function isOrphanDebugEnabled(): boolean {
  const v = process.env.MOCKINGBIRD_DEBUG_ORPHAN_RENDERINGS;
  return v === '1' || v?.toLowerCase() === 'true';
}

function logOrphan(entry: RenderingEntry, reason: string, failedSegment: string): void {
  if (!isOrphanDebugEnabled()) return;
  console.error(
    `[orphan-prune] uid=${entry.uid} ph=${entry.placeholder} segment=${failedSegment} reason=${reason}`,
  );
}

/**
 * Find the sibling in `slot` whose `DynamicPlaceholderId` param equals the
 * given id. Falls back to the last node in the slot for non-dynamic segments
 * or when no match is found (so static placeholders still resolve).
 *
 * When `engine` is provided AND some sibling declares placeholder keys, use
 * the strict declared-keys predicate from {@link resolveByDeclaredKeys} —
 * that path orphans entries whose segment has no structural owner (Sitecore
 * parity). Otherwise (no engine, or no sibling has registry metadata) fall
 * through to the legacy DPI-match + last-sibling behavior so existing tests
 * and content without registry enrichment keep working.
 *
 * Returns `{ owner, resolvedKey? }`. When `resolvedKey` is present, the
 * caller MUST store the child under that key instead of running
 * `normalizeSegment` on the raw segment (e.g. literal `carousel-slide-5`
 * must not be collapsed to `carousel-slide-{*}`).
 */
function resolveOwnerBySegment(
  slot: PlaceholderNode[],
  segment: string,
  engine?: Engine,
): { owner: PlaceholderNode | undefined; resolvedKey?: string } {
  // sxa-<sig> wrapper segments (e.g. sxa-full-width-body) are static placeholder
  // names with no numeric tail; normalizeSegment leaves them unchanged at the
  // storage site, so no resolvedKey is needed to bypass normalization.
  if (segment.startsWith('sxa-')) {
    const match = slot.find(n => n.params?.sig === segment);
    if (match) return { owner: match };
  }

  if (engine && isOrphanPruningEnabled()) {
    const strict = resolveByDeclaredKeys(slot, segment, engine);
    if (strict.decided) return { owner: strict.owner, resolvedKey: strict.resolvedKey };
  }

  const id = dynamicPlaceholderId(segment);
  if (id !== undefined) {
    for (let i = slot.length - 1; i >= 0; i--) {
      if (slot[i].params?.DynamicPlaceholderId === id) return { owner: slot[i] };
    }
  }
  return { owner: slot[slot.length - 1] };
}

/**
 * Build a nested placeholder tree from a flat list of RenderingEntry records.
 *
 * Top-level entries (placeholder has no leading `/`) go directly into the root
 * map under their placeholder name.
 *
 * Nested entries (placeholder starts with `/`) are placed inside the appropriate
 * parent node by walking the path segments.
 *
 * Orphaned entries (path references a parent placeholder that doesn't exist) are
 * silently skipped.
 */
export function buildPlaceholderTree(
  entries: RenderingEntry[],
  engine?: Engine,
): Record<string, PlaceholderNode[]> {
  const root: Record<string, PlaceholderNode[]> = {};

  // __Final Renderings XML is not guaranteed to list ancestors before their
  // descendants (in practice SXA serializes deep paths first). Sort by
  // placeholder depth so parents always arrive before children, preserving
  // the original index as a tiebreaker to keep sibling order stable.
  const order = entries.map((e, i) => ({ e, i }));
  order.sort((a, b) => {
    const da = placeholderDepth(a.e.placeholder);
    const db = placeholderDepth(b.e.placeholder);
    if (da !== db) return da - db;
    return a.i - b.i;
  });

  // Convert each entry into a bare PlaceholderNode (no placeholders map yet).
  // Preserve a `nodes` array parallel to the sorted order.
  const nodes: PlaceholderNode[] = order.map(({ e }) => {
    const node: PlaceholderNode = {
      uid: e.uid,
      renderingId: e.renderingId,
      dataSource: e.dataSource,
      params: e.params,
      ownerItemPath: e.ownerItemPath,
    };
    if (e.hidden) node.hidden = true;
    return node;
  });

  for (let i = 0; i < order.length; i++) {
    const entry = order[i].e;
    const node = nodes[i];
    const ph = entry.placeholder;

    if (!ph.startsWith('/')) {
      // Top-level placement.
      if (!root[ph]) root[ph] = [];
      root[ph].push(node);
    } else {
      // Nested placement — parse path segments (drop leading empty string from split).
      const segments = ph.slice(1).split('/');
      // segments[0]              → top-level placeholder name
      // segments[1..n-2]         → intermediate placeholder names (each on a prior node)
      // segments[n-1]            → the final placeholder name to attach the node to

      const topLevelKey = segments[0];
      const intermediates = segments.slice(1, -1);
      const finalSegment = segments[segments.length - 1];

      // Walk down from the top-level slot.
      const topSlot = root[topLevelKey];
      if (!topSlot || topSlot.length === 0) {
        logOrphan(entry, 'no-top-slot', topLevelKey);
        continue;
      }

      let currentSlot: PlaceholderNode[] = topSlot;

      let orphan = false;
      // Track the owner that will receive the final segment. For each
      // intermediate segment we both descend into the matching sibling's
      // placeholder AND remember that sibling as the next owner.
      // When intermediates is empty the `??` resolves to finalSegment, so this
      // initialization already holds the final-segment resolvedKey. When
      // intermediates.length > 0, the last assignment inside the loop below
      // overwrites finalResolvedKey with resolveOwnerBySegment(currentSlot,
      // finalSegment, engine) on the final iteration. Either way,
      // finalResolvedKey ends up keyed to `finalSegment` before storage.
      let { owner, resolvedKey: finalResolvedKey } = resolveOwnerBySegment(
        currentSlot,
        intermediates[0] ?? finalSegment,
        engine,
      );
      for (let s = 0; s < intermediates.length; s++) {
        const seg = intermediates[s];
        const { owner: segOwner } = resolveOwnerBySegment(currentSlot, seg, engine);
        if (!segOwner) {
          logOrphan(entry, 'intermediate-no-owner', seg);
          orphan = true;
          break;
        }

        const normalized = normalizeSegment(seg);
        const ownerPhs = segOwner.placeholders ?? {};
        const nextSlot = ownerPhs[seg] ?? ownerPhs[normalized];
        if (!nextSlot) {
          logOrphan(entry, 'intermediate-parent-slot-missing', seg);
          orphan = true;
          break;
        }
        currentSlot = nextSlot;
        ({ owner, resolvedKey: finalResolvedKey } = resolveOwnerBySegment(currentSlot, intermediates[s + 1] ?? finalSegment, engine));
      }

      if (orphan) continue;
      if (!owner) {
        logOrphan(entry, 'final-no-owner', finalSegment);
        continue;
      }

      // Owner's DynamicPlaceholderId participates in the child segment's
      // trailing numeric for SXA single-slot declared placeholders
      // (`stem-<instance>-<ownerDynId>` → bare `stem`). Pass it so
      // `normalizeSegment` can collapse the parent-dynId suffix.
      // When the declared-keys path already resolved a canonical storage key
      // (e.g. a literal enumerated key like `carousel-slide-5`), use it
      // directly — do NOT let `normalizeSegment` collapse it to `carousel-slide-{*}`.
      const ownerDynId = owner.params?.DynamicPlaceholderId;
      const normalizedFinal = finalResolvedKey ?? normalizeSegment(finalSegment, ownerDynId);
      if (!owner.placeholders) owner.placeholders = {};
      if (!owner.placeholders[normalizedFinal]) owner.placeholders[normalizedFinal] = [];
      owner.placeholders[normalizedFinal].push(node);
    }
  }

  return root;
}
