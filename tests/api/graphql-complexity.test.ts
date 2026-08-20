import { describe, it, expect } from 'vitest';
import { parse } from 'graphql';
import {
  analyzeComplexity,
  validateComplexity,
  readComplexityConfig,
  DEFAULT_COMPLEXITY_CONFIG,
  type ComplexityConfig,
} from '../../src/api/graphql/complexity.js';

// Every expected number in this file is hand-computed from Sitecore's actual
// mechanism: graphql-dotnet 2.4.0 `ComplexityAnalyzer` (the library
// Sitecore.Services.GraphQL pins), decompiled from
// ~/.nuget/packages/graphql/2.4.0. The recurrence:
//   - a composite field records `currentEndNodeImpact` and increments depth;
//   - a leaf field records the endNodeImpact inherited from its parent;
//   - descending into a field multiplies the sub-selection impact by
//     `fieldImpact` (or by `first`/`last`, or by 1 when `id` is present);
//   - `id` arg => impact 1, `first: N`/`last: N` => impact N, else the fieldImpact.
// See the module for the full port.

describe('analyzeComplexity (graphql-dotnet 2.4.0 port)', () => {
  it('scores a flat scalar selection: fieldImpact per node', () => {
    // item(composite)=2; id/name/path leaves each inherit endNode 2 => 2+2+2+2
    const doc = parse('{ item { id name path } }');
    const r = analyzeComplexity(doc, 2);
    expect(r.complexity).toBe(8);
    expect(r.totalQueryDepth).toBe(1);
  });

  it('multiplies sub-selection impact geometrically with nesting', () => {
    // item=2 (subSel->4); children=4 (subSel->8); id leaf=4 => 2+4+4
    const doc = parse('{ item { children { id } } }');
    const r = analyzeComplexity(doc, 2);
    expect(r.complexity).toBe(10);
    expect(r.totalQueryDepth).toBe(2);
  });

  it('treats first: N as impact N', () => {
    // item=2 (subSel->4); children(first:10) endNode=10/2*4=20 (subSel->40);
    // id leaf inherits endNode 20 => 2+20+20
    const doc = parse('{ item { children(first: 10) { id } } }');
    const r = analyzeComplexity(doc, 2);
    expect(r.complexity).toBe(42);
    expect(r.totalQueryDepth).toBe(2);
  });

  it('treats last: N as impact N', () => {
    // children(last:5) endNode=5/2*4=10; id leaf inherits 10 => 2+10+10
    const doc = parse('{ item { children(last: 5) { id } } }');
    const r = analyzeComplexity(doc, 2);
    expect(r.complexity).toBe(22);
    expect(r.totalQueryDepth).toBe(2);
  });

  it('treats an id argument as impact 1 (single item)', () => {
    // a(id) endNode=1/2*2=1 (subSel->2); b leaf inherits 1 => 1+1
    const doc = parse('{ a(id: "x") { b } }');
    const r = analyzeComplexity(doc, 2);
    expect(r.complexity).toBe(2);
    expect(r.totalQueryDepth).toBe(1);
  });

  it('flattens inline fragments transparently (same impact level)', () => {
    // Equivalent to `{ item { id name } }`: item=2; id,name leaves=2 each
    const doc = parse('{ item { ... on Item { id name } } }');
    const r = analyzeComplexity(doc, 2);
    expect(r.complexity).toBe(6);
    expect(r.totalQueryDepth).toBe(1);
  });

  it('scores a named fragment spread from its precomputed complexity', () => {
    // fragment F {id name}: two leaves at endNode 1.0 => complexity 2, depth 0.
    // main: item=2 (subSel->4); spread records subSel/avgImpact*fragComplexity
    // = 4/2*2 = 4; depth += fragDepth(0). Total 2+4=6, depth 1.
    const doc = parse('query { item { ...F } } fragment F on Item { id name }');
    const r = analyzeComplexity(doc, 2);
    expect(r.complexity).toBe(6);
    expect(r.totalQueryDepth).toBe(1);
  });

  it('rejects a fieldImpact <= 1 (matches graphql-dotnet ArgumentOutOfRange)', () => {
    const doc = parse('{ item { id } }');
    expect(() => analyzeComplexity(doc, 1)).toThrow();
    expect(() => analyzeComplexity(doc, 0.5)).toThrow();
  });
});

describe('validateComplexity (Sitecore Validate)', () => {
  const noLimit: ComplexityConfig = { maxComplexity: null, maxDepth: null, fieldImpact: 2 };

  it('passes a query under both limits', () => {
    const doc = parse('{ item { id name path } }');
    expect(() => validateComplexity(doc, DEFAULT_COMPLEXITY_CONFIG)).not.toThrow();
  });

  it('throws the Sitecore "too complex" message when maxComplexity is exceeded', () => {
    // flat query scores 8; cap at 5.
    const doc = parse('{ item { id name path } }');
    expect(() => validateComplexity(doc, { ...noLimit, maxComplexity: 5 }))
      .toThrow(/^Query is too complex to execute\. The field with the highest complexity is: /);
  });

  it('throws the Sitecore "too nested" message when maxDepth is exceeded', () => {
    // nested query depth 2; cap depth at 1, complexity effectively unlimited.
    const doc = parse('{ item { children { id } } }');
    expect(() => validateComplexity(doc, { maxComplexity: 1_000_000_000, maxDepth: 1, fieldImpact: 2 }))
      .toThrow('Query is too nested to execute. Depth is 2 levels, maximum allowed on this endpoint is 1.');
  });

  it('checks complexity before depth (complexity message wins when both exceed)', () => {
    const doc = parse('{ item { children { id } } }');
    expect(() => validateComplexity(doc, { maxComplexity: 1, maxDepth: 1, fieldImpact: 2 }))
      .toThrow(/^Query is too complex to execute\./);
  });

  it('does not check a limit that is null (unlimited)', () => {
    const doc = parse('{ item { children { id } } }');
    expect(() => validateComplexity(doc, noLimit)).not.toThrow();
  });
});

describe('readComplexityConfig', () => {
  it('defaults to the stock Sitecore values (10000 / 15 / 2)', () => {
    const cfg = readComplexityConfig({});
    expect(cfg).toEqual({ maxComplexity: 10000, maxDepth: 15, fieldImpact: 2 });
    expect(DEFAULT_COMPLEXITY_CONFIG).toEqual({ maxComplexity: 10000, maxDepth: 15, fieldImpact: 2 });
  });

  it('reads env overrides (matching a patched XM Cloud env)', () => {
    const cfg = readComplexityConfig({
      MOCKINGBIRD_GRAPHQL_MAX_COMPLEXITY: '2000000',
      MOCKINGBIRD_GRAPHQL_MAX_DEPTH: '40',
      MOCKINGBIRD_GRAPHQL_FIELD_IMPACT: '3',
    });
    expect(cfg).toEqual({ maxComplexity: 2000000, maxDepth: 40, fieldImpact: 3 });
  });

  it('falls back to the default fieldImpact when the override is <= 1 or invalid', () => {
    expect(readComplexityConfig({ MOCKINGBIRD_GRAPHQL_FIELD_IMPACT: '1' }).fieldImpact).toBe(2);
    expect(readComplexityConfig({ MOCKINGBIRD_GRAPHQL_FIELD_IMPACT: 'abc' }).fieldImpact).toBe(2);
  });
});
