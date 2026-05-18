import type { Engine } from '../index.js';
import type { ItemNode, ScsItem } from '../types.js';
import { toCanonicalGuid } from '../guid.js';

/** Clause shape matching the GraphQL `SearchClause` input type. */
export interface SearchClause {
  name: string;
  value: string;
  operator?: 'EQ' | 'CONTAINS' | null;
}

export interface SearchWhere {
  AND?: SearchClause[] | null;
}

export interface SearchOptions {
  first?: number | null;
  after?: string | null;
}

export interface SearchResultItem {
  item: ScsItem;
}

export interface SearchResultPage {
  results: SearchResultItem[];
  pageInfo: {
    hasNext: boolean;
    endCursor: string | null;
  };
}

const DEFAULT_FIRST = 50;
const MAX_FIRST = 500;

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

/** Decode a base64 cursor back to an integer offset. Invalid/empty → 0. */
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

/**
 * Pull the normalized item id out of an ItemNode for a `_templates` or
 * `_path` clause comparison. `item.template` is already 32-hex-lowercase-
 * dashed in the tree, but we canonicalize anyway to be robust.
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

/**
 * Walk the engine tree, apply the clause filters, and return a paginated
 * slice. Scope-limited on purpose: only the three clause kinds the
 * consuming app actually issues are supported (`_templates`, `_language`,
 * `_path`), only top-level `AND`, only `EQ` / `CONTAINS`.
 */
export function resolveSearch(
  engine: Engine,
  where: SearchWhere | null | undefined,
  options: SearchOptions = {},
): SearchResultPage {
  const clauses = where?.AND ?? [];

  // Pre-normalise each clause into a typed predicate on ItemNode. A clause
  // whose value can't be canonicalised (bad GUID, missing ancestor) turns
  // into a `never` predicate so the search returns 0 matches instead of
  // silently matching everything.
  const predicates: Array<(node: ItemNode) => boolean> = [];
  for (const clause of clauses) {
    switch (clause.name) {
      case '_templates': {
        const canonical = normalizeGuid(clause.value);
        if (!canonical) { predicates.push(() => false); break; }
        predicates.push(node => itemTemplateId(node).replace(/-/g, '') === canonical);
        break;
      }
      case '_language': {
        const lang = (clause.value ?? '').trim();
        if (!lang) { predicates.push(() => false); break; }
        predicates.push(node => itemHasLanguageVersion(node.item, lang));
        break;
      }
      case '_path': {
        const prefix = resolvePathAncestorPrefix(engine, clause.value);
        if (!prefix) { predicates.push(() => false); break; }
        predicates.push(node => node.item.path.toLowerCase().startsWith(prefix));
        break;
      }
      default:
        // Unknown clause names are permissive - ignored so future callers
        // don't crash on a clause mockingbird hasn't seen.
        break;
    }
  }

  const all = engine.getAllItems();
  const matched: ItemNode[] = [];
  for (const node of all) {
    let ok = true;
    for (const pred of predicates) {
      if (!pred(node)) { ok = false; break; }
    }
    if (ok) matched.push(node);
  }

  const first = Math.min(Math.max(1, options.first ?? DEFAULT_FIRST), MAX_FIRST);
  const offset = decodeCursor(options.after ?? null);
  const page = matched.slice(offset, offset + first);
  const end = offset + page.length;
  const hasNext = end < matched.length;

  return {
    results: page.map(n => ({ item: n.item })),
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
