import type { Engine } from '../index.js';
import type { ItemNode, ScsItem } from '../types.js';
import { toCanonicalGuid } from '../guid.js';
import { readItemFieldByHint } from '../item-query/index.js';
import { readBaseTemplateIds } from '../schema/generate.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The full set of comparison operators from the GraphQL SearchOperator enum
 * (Phase A). EQ and CONTAINS were the original subset.
 */
export type SearchOperator =
  | 'EQ'
  | 'CONTAINS'
  | 'NEQ'
  | 'NCONTAINS'
  | 'LT'
  | 'LTE'
  | 'GT'
  | 'GTE';

/**
 * A search predicate node. Can be:
 * - A leaf: `name` + `value` + optional `operator`.
 * - A composite: `AND` and/or `OR` arrays of child predicates.
 * - Both shapes coexisting on the same node (leaf + children).
 *
 * Back-compat: the original `SearchWhere = { AND?: SearchClause[] }` shape
 * maps directly - top-level `AND` is preserved with identical semantics.
 */
export interface SearchPredicate {
  name?: string | null;
  value?: string | null;
  operator?: SearchOperator | null;
  AND?: SearchPredicate[] | null;
  OR?: SearchPredicate[] | null;
}

/** Back-compat alias - callers that import `SearchWhere` continue to work. */
export type SearchWhere = SearchPredicate;

/** A leaf clause with required name + value (back-compat). */
export interface SearchClause extends SearchPredicate {
  name: string;
  value: string;
}

export interface SearchOptions {
  first?: number | null;
  after?: string | null;
  /** Sort results by a field hint before pagination. Direction defaults to ASC. */
  orderBy?: { name: string; direction?: 'ASC' | 'DESC' | null } | null;
}

export interface SearchResultItem {
  item: ScsItem;
}

export interface SearchResultPage {
  results: SearchResultItem[];
  total: number;
  pageInfo: {
    hasNext: boolean;
    endCursor: string | null;
  };
}

const DEFAULT_FIRST = 50;
const MAX_FIRST = 500;

// ---------------------------------------------------------------------------
// GUID utilities
// ---------------------------------------------------------------------------

/**
 * Strip braces + dashes + case from a Sitecore GUID. Accepts the three
 * common wire formats emitted by consuming apps (brace-wrapped uppercase
 * dashed, lowercase no-braces no-dashes, bare dashed) and returns the
 * canonical 32-hex-lowercase form that mockingbird's item tree stores.
 *
 * Returns `undefined` for non-GUID input - the search resolver uses this
 * as a signal that a clause value isn't interpretable as an id (so it
 * should produce zero matches instead of silently matching everything).
 */
export function normalizeGuid(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw.replace(/[{}-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(stripped)) return undefined;
  return stripped;
}

/** Encode an integer offset as an opaque base64 string. */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64');
}

/** Decode a base64 cursor back to an integer offset. Invalid/empty -> 0. */
export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const n = parseInt(decoded, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/**
 * Pull the normalized item template id (32-hex-lowercase nodash) from an
 * ItemNode. `item.template` is already lowercase-dashed in the tree; we
 * canonicalize via `normalizeGuid` to be robust.
 */
function itemTemplateId(node: ItemNode): string {
  return normalizeGuid(node.item.template) ?? '';
}

function itemHasLanguageVersion(item: ScsItem, language: string): boolean {
  const lang = item.languages.find(l => l.language === language);
  return !!lang && lang.versions.length > 0;
}

/**
 * Resolve the ancestor item path for a `_path` CONTAINS filter. The value
 * is an item GUID that points at a parent container; the filter matches
 * items whose `path` is a strict descendant of the ancestor's path.
 */
function resolvePathAncestorPrefix(engine: Engine, rawGuid: string): string | undefined {
  const canonical = normalizeGuid(rawGuid);
  if (!canonical) return undefined;
  // Engine stores ids in dashed form - rebuild the dashed key.
  const dashed = `${canonical.slice(0, 8)}-${canonical.slice(8, 12)}-${canonical.slice(12, 16)}-${canonical.slice(16, 20)}-${canonical.slice(20)}`;
  const ancestor = engine.getItemById(dashed);
  if (!ancestor) return undefined;
  return ancestor.item.path.toLowerCase() + '/';
}

// ---------------------------------------------------------------------------
// Base-template transitive walk
// ---------------------------------------------------------------------------

/**
 * Return the set of ALL transitive base template IDs for `templateDashedId`,
 * stored as 32-hex-lowercase nodash canonical form for direct comparison.
 *
 * Mirrors the base-template walk in src/engine/schema/generate.ts
 * (`collectTransitiveBaseInterfaces`) but collects ALL base ids (not only
 * interface-typed templates) and stores them as nodash. Cycle-guarded via
 * a visited set so a base-template cycle terminates instead of hanging.
 */
function getTransitiveBaseTemplateIds(
  engine: Engine,
  templateDashedId: string,
  cache: Map<string, Set<string>>,
): Set<string> {
  const key = templateDashedId.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  // Initialize before recursion to handle cycles.
  const result = new Set<string>();
  cache.set(key, result);

  const tmplNode = engine.getItemById(key);
  if (!tmplNode) return result;

  // readBaseTemplateIds (re-exported from schema/generate.ts) returns
  // dashed-lowercase GUIDs parsed from the __Base template field.
  const directBases = readBaseTemplateIds(tmplNode.item);
  const queue: string[] = [...directBases];
  const visited = new Set<string>([key]);

  while (queue.length > 0) {
    const baseId = queue.shift()!;
    if (visited.has(baseId)) continue;
    visited.add(baseId);
    // Store as nodash canonical for O(1) comparison later.
    result.add(baseId.replace(/-/g, ''));
    const baseNode = engine.getItemById(baseId);
    if (baseNode) {
      for (const next of readBaseTemplateIds(baseNode.item)) {
        queue.push(next);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Operator application
// ---------------------------------------------------------------------------

/**
 * Apply a string comparison operator to `actual` vs `value`.
 * Both sides are lowercased before comparison. Falls back to EQ on unknown
 * operators so the resolver never crashes on an unrecognized value.
 */
function applyStringOp(
  actual: string,
  value: string,
  op: SearchOperator | null | undefined,
): boolean {
  const a = actual.toLowerCase();
  const v = value.toLowerCase();
  switch (op ?? 'EQ') {
    case 'EQ':        return a === v;
    case 'NEQ':       return a !== v;
    case 'CONTAINS':  return a.includes(v);
    case 'NCONTAINS': return !a.includes(v);
    case 'LT':        return a < v;
    case 'LTE':       return a <= v;
    case 'GT':        return a > v;
    case 'GTE':       return a >= v;
    default:          return a === v;
  }
}

// ---------------------------------------------------------------------------
// Predicate builder
// ---------------------------------------------------------------------------

/**
 * Build a leaf predicate for a clause whose `name` is set.
 *
 * Supported clause names:
 * - `_templates`: EQ = exact template id match; CONTAINS = transitive
 *   base-template match (item's template IS or INHERITS the given id).
 * - `_language`: item has at least one version in the given language.
 * - `_path`: item is a strict descendant of the given ancestor id.
 * - `_name`: compare item name (last path segment) using the operator.
 * - Anything else: permissive (always true) so future callers don't crash.
 */
function buildLeafCheck(
  engine: Engine,
  clause: SearchClause,
  baseCache: Map<string, Set<string>>,
): (node: ItemNode) => boolean {
  switch (clause.name) {
    case '_templates': {
      const canonical = normalizeGuid(clause.value);
      if (!canonical) return () => false;

      if ((clause.operator ?? 'EQ') === 'CONTAINS') {
        // Transitive: exact match OR template inherits the target id.
        return (node: ItemNode) => {
          const itemNodash = itemTemplateId(node);
          if (itemNodash === canonical) return true;
          const bases = getTransitiveBaseTemplateIds(engine, node.item.template, baseCache);
          return bases.has(canonical);
        };
      }
      // EQ (or any other operator): exact template-id match only.
      return (node: ItemNode) => itemTemplateId(node) === canonical;
    }

    case '_language': {
      const lang = (clause.value ?? '').trim();
      if (!lang) return () => false;
      return (node: ItemNode) => itemHasLanguageVersion(node.item, lang);
    }

    case '_path': {
      const prefix = resolvePathAncestorPrefix(engine, clause.value);
      if (!prefix) return () => false;
      return (node: ItemNode) => node.item.path.toLowerCase().startsWith(prefix);
    }

    case '_name': {
      const { value, operator } = clause;
      return (node: ItemNode) => {
        const name = node.item.path.split('/').pop() ?? '';
        // Guard: `value` is declared `string | null` on SearchClause but
        // callers can pass undefined from a GraphQL input with no `value`
        // field. `applyStringOp` calls `.toLowerCase()` and would throw on
        // null/undefined. Coerce to empty string so the clause is safe to
        // evaluate (EQ '' matches items whose name is literally empty, all
        // other operators compare against '').
        return applyStringOp(name, value ?? '', operator);
      };
    }

    default:
      // Unknown clause names: permissive so future callers don't crash.
      return () => true;
  }
}

/**
 * Recursively build a predicate for a `SearchPredicate` node.
 *
 * - Leaf (`name` set): delegates to `buildLeafCheck`.
 * - `AND` children: all must match.
 * - `OR` children: at least one must match.
 * - Empty node (no name, no children): permissive (always true).
 * All three can coexist; every check must pass.
 */
function buildPredicate(
  engine: Engine,
  pred: SearchPredicate,
  baseCache: Map<string, Set<string>>,
): (node: ItemNode) => boolean {
  const checks: Array<(n: ItemNode) => boolean> = [];

  // Leaf check
  if (pred.name) {
    checks.push(buildLeafCheck(engine, pred as SearchClause, baseCache));
  }

  // AND: every child predicate must match
  const andChildren = pred.AND ?? [];
  if (andChildren.length > 0) {
    const andPreds = andChildren.map(c => buildPredicate(engine, c, baseCache));
    checks.push(n => andPreds.every(p => p(n)));
  }

  // OR: at least one child predicate must match
  const orChildren = pred.OR ?? [];
  if (orChildren.length > 0) {
    const orPreds = orChildren.map(c => buildPredicate(engine, c, baseCache));
    checks.push(n => orPreds.some(p => p(n)));
  }

  if (checks.length === 0) return () => true;
  return (n: ItemNode) => checks.every(c => c(n));
}

// ---------------------------------------------------------------------------
// Public search resolver
// ---------------------------------------------------------------------------

/**
 * Walk the engine tree, apply the predicate filters, optionally sort by a
 * field hint, and return a paginated slice.
 *
 * `where` supports:
 * - `AND: [...]` - all children must match (back-compat top-level AND).
 * - `OR: [...]` - any child must match.
 * - Leaf fields (`name`, `value`, `operator`) on the same node.
 * - Full recursive nesting.
 *
 * `options.orderBy` sorts the full matched set by a field hint BEFORE
 * pagination, so `total` always reflects the pre-sort filtered count.
 */
export function resolveSearch(
  engine: Engine,
  where: SearchWhere | null | undefined,
  options: SearchOptions = {},
): SearchResultPage {
  const baseCache = new Map<string, Set<string>>();
  const topPredicate = buildPredicate(engine, where ?? {}, baseCache);

  const all = engine.getAllItems();
  const matched: ItemNode[] = [];
  for (const node of all) {
    if (topPredicate(node)) matched.push(node);
  }

  // Sort by field hint before pagination. total is always the filtered count.
  if (options.orderBy?.name) {
    const { name: fieldHint, direction } = options.orderBy;
    const dir = direction === 'DESC' ? -1 : 1; // default ASC
    matched.sort((a, b) => {
      const va = readItemFieldByHint(a.item, fieldHint)?.value ?? '';
      const vb = readItemFieldByHint(b.item, fieldHint)?.value ?? '';
      const na = Number(va);
      const nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) {
        return (na - nb) * dir;
      }
      return va.localeCompare(vb) * dir;
    });
  }

  const first = Math.min(Math.max(1, options.first ?? DEFAULT_FIRST), MAX_FIRST);
  const offset = decodeCursor(options.after ?? null);
  const page = matched.slice(offset, offset + first);
  const end = offset + page.length;
  const hasNext = end < matched.length;

  return {
    results: page.map(n => ({ item: n.item })),
    total: matched.length,
    pageInfo: {
      hasNext,
      endCursor: hasNext ? encodeCursor(end) : null,
    },
  };
}

/**
 * Format a SearchItem's `id` field. Returns the canonical lowercase-dashed
 * form (`toCanonicalGuid` is idempotent for already-canonical ids and
 * re-shapes any 32-hex-undashed variants that may slip through the parser).
 * This is the AnyItem-style wire format; the bare-upper-hex Edge variant
 * is only used by the ComponentQuery executor's result rows.
 */
export function searchItemId(item: ScsItem): string {
  return toCanonicalGuid(item.id) ?? item.id;
}
