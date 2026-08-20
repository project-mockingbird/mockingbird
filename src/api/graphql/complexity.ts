// GraphQL query-complexity gating, ported from Sitecore's actual mechanism.
//
// Sitecore.Services.GraphQL pins graphql-dotnet 2.4.0 and gates every public
// GraphQL query with `GraphQL.Validation.Complexity.ComplexityAnalyzer`. This
// module is a faithful port of that analyzer onto the graphql-js AST that
// Mercurius already parses, so a query Mockingbird accepts/rejects matches what
// a stock XM Cloud would. Decompiled from
// ~/.nuget/packages/graphql/2.4.0/lib/netstandard2.0/GraphQL.dll
// (ComplexityAnalyzer.Analyze / .Validate / GetImpactFromArgs) and validated by
// running the real assembly (see tests/api/graphql-complexity.test.ts, whose
// expected numbers were produced by the actual ComplexityAnalyzer).
//
// The recurrence (avgImpact == fieldImpact, must be > 1):
//   - a composite field records `endNodeImpact` and increments the depth count;
//   - a leaf field records the `endNodeImpact` it inherited from its parent;
//   - descending into a field multiplies the running sub-selection impact by
//     the field's impact (fieldImpact by default; `first: N`/`last: N` => N;
//     `id` present => 1, a single item);
//   - the endNode impact of a field with an arg impact is
//     `argImpact / avgImpact * subSelectionImpact`.
//
// Three graphql-dotnet 2.4.0 quirks are reproduced deliberately, because being
// faithful means matching its accept/reject decision exactly:
//   1. `totalQueryDepth` counts every composite (object-selecting) field across
//      the whole query plus each spread fragment's own composite-field count -
//      it is NOT the maximum tree nesting depth.
//   2. INLINE FRAGMENTS are not "qualifying children": a selection set whose
//      selections are ALL inline fragments halts traversal (its contents are
//      not counted). An inline fragment IS traversed only when it sits beside a
//      direct field (or fragment spread) in the same selection set. This is why
//      a real head-app navigation query - almost entirely `results { ... on T
//      {} }` - scores low on real Sitecore and is accepted.
//   3. A fragment definition's own precomputed complexity ignores fragment
//      spreads nested inside it.

import { Kind } from 'graphql';
import type {
  DocumentNode,
  FieldNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  SelectionSetNode,
} from 'graphql';

export interface ComplexityConfig {
  /** Reject when the query's complexity score exceeds this. null = no limit. */
  maxComplexity: number | null;
  /** Reject when the composite-field count exceeds this. null = no limit. */
  maxDepth: number | null;
  /** Assumed fan-out per list field. Must be > 1 (graphql-dotnet contract). */
  fieldImpact: number;
}

export interface ComplexityResult {
  complexity: number;
  totalQueryDepth: number;
  /** Name of the highest-scoring field (for the "too complex" message). */
  highestComplexityField: string | null;
}

/** Stock XM Cloud defaults from /App_Config/Sitecore/Services.GraphQL/Sitecore.Services.GraphQL.config. */
export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  maxComplexity: 10000,
  maxDepth: 15,
  fieldImpact: 2,
};

// Backstop against pathological validation cost (graphql-dotnet's default).
const MAX_RECURSION = 250;

interface Sink {
  complexity: number;
  depth: number;
  highest: { field: string; impact: number } | null;
  loopCounter: number;
}

interface FragmentComplexity {
  complexity: number;
  depth: number;
}

/**
 * graphql-dotnet's GetImpactFromArgs: an `id` argument (any value) => impact 1
 * (a single item); otherwise `first`/`last` as an integer literal => that
 * integer; otherwise null (the caller falls back to fieldImpact). A `first`
 * that is not an integer literal (e.g. a variable) is treated as absent.
 */
function impactFromArgs(field: FieldNode): number | null {
  const args = field.arguments ?? [];
  if (args.some((a) => a.name.value === 'id')) return 1;
  const first = args.find((a) => a.name.value === 'first');
  if (first && first.value.kind === Kind.INT) return parseInt(first.value.value, 10);
  const last = args.find((a) => a.name.value === 'last');
  if (last && last.value.kind === Kind.INT) return parseInt(last.value.value, 10);
  return null;
}

function record(sink: Sink, fieldName: string, impact: number): void {
  sink.complexity += impact;
  // Ties resolve to the first field that reached the max (graphql-dotnet's
  // stable OrderByDescending().First()).
  if (!sink.highest || impact > sink.highest.impact) {
    sink.highest = { field: fieldName, impact };
  }
}

function guard(sink: Sink): void {
  if (sink.loopCounter++ > MAX_RECURSION) {
    throw new Error('Query is too complex to validate.');
  }
}

/**
 * Whether a selection set is a "qualifying child" in graphql-dotnet's sense:
 * it must contain a direct Field (or, on the main pass, a FragmentSpread).
 * Inline fragments alone do NOT qualify - that is quirk #2.
 */
function selectionSetQualifies(ss: SelectionSetNode, handleSpreads: boolean): boolean {
  return ss.selections.some(
    (s) => s.kind === Kind.FIELD || (handleSpreads && s.kind === Kind.FRAGMENT_SPREAD),
  );
}

function visitSelectionSet(
  sink: Sink,
  ss: SelectionSetNode,
  avgImpact: number,
  subSelectionImpact: number,
  endNodeImpact: number,
  fragments: Map<string, FragmentComplexity>,
  handleSpreads: boolean,
): void {
  guard(sink);
  if (!selectionSetQualifies(ss, handleSpreads)) return; // only inline fragments (or empty) -> dead end
  for (const sel of ss.selections) {
    switch (sel.kind) {
      case Kind.FIELD:
        visitField(sink, sel, avgImpact, subSelectionImpact, endNodeImpact, fragments, handleSpreads);
        break;
      case Kind.INLINE_FRAGMENT:
        visitInlineFragment(sink, sel, avgImpact, subSelectionImpact, endNodeImpact, fragments, handleSpreads);
        break;
      case Kind.FRAGMENT_SPREAD:
        if (handleSpreads) visitFragmentSpread(sink, sel, avgImpact, subSelectionImpact, fragments);
        break;
    }
  }
}

function visitField(
  sink: Sink,
  field: FieldNode,
  avgImpact: number,
  subSelectionImpact: number,
  endNodeImpact: number,
  fragments: Map<string, FragmentComplexity>,
  handleSpreads: boolean,
): void {
  guard(sink);
  const ss = field.selectionSet;
  // A field is composite iff it has a non-empty selection set (of ANY selection
  // kind - even one that will itself turn out to be a dead end).
  if (ss && ss.selections.length > 0) {
    sink.depth++;
    const argImpact = impactFromArgs(field);
    const thisEndNode = argImpact !== null ? (argImpact / avgImpact) * subSelectionImpact : subSelectionImpact;
    record(sink, field.name.value, thisEndNode);
    const nextSubSelection = subSelectionImpact * (argImpact !== null ? argImpact : avgImpact);
    visitSelectionSet(sink, ss, avgImpact, nextSubSelection, thisEndNode, fragments, handleSpreads);
  } else {
    // Leaf field: records the endNode impact inherited from its parent.
    record(sink, field.name.value, endNodeImpact);
  }
}

function visitInlineFragment(
  sink: Sink,
  frag: InlineFragmentNode,
  avgImpact: number,
  subSelectionImpact: number,
  endNodeImpact: number,
  fragments: Map<string, FragmentComplexity>,
  handleSpreads: boolean,
): void {
  guard(sink);
  // Not a Field: graphql-dotnet recurses into its selection set with the SAME
  // impacts (reached only when this inline fragment sits beside a direct field).
  if (frag.selectionSet) {
    visitSelectionSet(sink, frag.selectionSet, avgImpact, subSelectionImpact, endNodeImpact, fragments, handleSpreads);
  }
}

function visitFragmentSpread(
  sink: Sink,
  spread: FragmentSpreadNode,
  avgImpact: number,
  subSelectionImpact: number,
  fragments: Map<string, FragmentComplexity>,
): void {
  const frag = fragments.get(spread.name.value);
  if (!frag) return; // undefined fragment; a validation rule reports it
  record(sink, spread.name.value, (subSelectionImpact / avgImpact) * frag.complexity);
  sink.depth += frag.depth;
}

/**
 * Compute the complexity score and composite-field depth of a whole document,
 * mirroring ComplexityAnalyzer.Analyze. `fieldImpact` must be > 1.
 */
export function analyzeComplexity(document: DocumentNode, fieldImpact: number): ComplexityResult {
  if (!(fieldImpact > 1)) {
    // graphql-dotnet throws ArgumentOutOfRangeException("avgImpact").
    throw new RangeError('fieldImpact (avgImpact) must be greater than 1');
  }
  const avgImpact = fieldImpact;

  // Phase 1: precompute each fragment definition's complexity + depth. The
  // fragment pass ignores nested fragment spreads (quirk #3), so definition
  // order does not matter.
  const fragments = new Map<string, FragmentComplexity>();
  for (const def of document.definitions) {
    if (def.kind !== Kind.FRAGMENT_DEFINITION) continue;
    const sink: Sink = { complexity: 0, depth: 0, highest: null, loopCounter: 0 };
    visitSelectionSet(sink, def.selectionSet, avgImpact, avgImpact, 1.0, fragments, false);
    fragments.set(def.name.value, { complexity: sink.complexity, depth: sink.depth });
  }

  // Phase 2: main pass over operations, seeded with subSelectionImpact =
  // avgImpact and endNodeImpact = 1.0 (TreeIterator's seed).
  const sink: Sink = { complexity: 0, depth: 0, highest: null, loopCounter: 0 };
  for (const def of document.definitions) {
    if (def.kind !== Kind.OPERATION_DEFINITION) continue;
    visitSelectionSet(sink, def.selectionSet, avgImpact, avgImpact, 1.0, fragments, true);
  }

  return {
    complexity: sink.complexity,
    totalQueryDepth: sink.depth,
    highestComplexityField: sink.highest?.field ?? null,
  };
}

/**
 * Enforce a ComplexityConfig against a document, mirroring
 * ComplexityAnalyzer.Validate: complexity is checked before depth, and each
 * limit is skipped when null. Throws an Error carrying Sitecore's exact message.
 */
export function validateComplexity(document: DocumentNode, config: ComplexityConfig): void {
  const result = analyzeComplexity(document, config.fieldImpact);
  if (config.maxComplexity !== null && result.complexity > config.maxComplexity) {
    throw new Error(
      `Query is too complex to execute. The field with the highest complexity is: ${result.highestComplexityField}`,
    );
  }
  if (config.maxDepth !== null && result.totalQueryDepth > config.maxDepth) {
    throw new Error(
      `Query is too nested to execute. Depth is ${result.totalQueryDepth} levels, maximum allowed on this endpoint is ${config.maxDepth}.`,
    );
  }
}

function parseIntEnv(raw: string | undefined, fallback: number | null): number | null {
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build a ComplexityConfig from environment variables, defaulting to the stock
 * XM Cloud values. `MOCKINGBIRD_GRAPHQL_MAX_COMPLEXITY`,
 * `MOCKINGBIRD_GRAPHQL_MAX_DEPTH`, `MOCKINGBIRD_GRAPHQL_FIELD_IMPACT`. An invalid
 * or <= 1 fieldImpact falls back to the default (graphql-dotnet requires > 1).
 */
export function readComplexityConfig(env: Record<string, string | undefined> = process.env): ComplexityConfig {
  const maxComplexity = parseIntEnv(env.MOCKINGBIRD_GRAPHQL_MAX_COMPLEXITY, DEFAULT_COMPLEXITY_CONFIG.maxComplexity);
  const maxDepth = parseIntEnv(env.MOCKINGBIRD_GRAPHQL_MAX_DEPTH, DEFAULT_COMPLEXITY_CONFIG.maxDepth);
  const fi = Number(env.MOCKINGBIRD_GRAPHQL_FIELD_IMPACT);
  const fieldImpact = Number.isFinite(fi) && fi > 1 ? fi : DEFAULT_COMPLEXITY_CONFIG.fieldImpact;
  return { maxComplexity, maxDepth, fieldImpact };
}
