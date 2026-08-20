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

  it('does NOT traverse a selection set of only inline fragments (graphql-dotnet 2.4.0 quirk)', () => {
    // graphql-dotnet 2.4.0's ComplexityAnalyzer does not treat an inline
    // fragment as a "qualifying child", so `item`'s selection set (only the
    // inline fragment) is a dead end: traversal stops at `item`. So this is
    // NOT equivalent to `{ item { id name } }` (which scores 8) - it scores 2.
    // Reference graphql-dotnet 2.4.0: complexity 2 (avg 2) / 3 (avg 3), depth 1.
    const doc = parse('{ item { ... on Item { id name } } }');
    expect(analyzeComplexity(doc, 2)).toMatchObject({ complexity: 2, totalQueryDepth: 1 });
    expect(analyzeComplexity(doc, 3)).toMatchObject({ complexity: 3, totalQueryDepth: 1 });
  });

  it('DOES traverse an inline fragment when a direct field is its sibling', () => {
    // The selection set `{ id, ... on Item { name job } }` qualifies (has the
    // direct field `id`), so its inline fragment IS recursed at the same impact.
    // Reference graphql-dotnet 2.4.0: complexity 8 (avg 2) / 12 (avg 3), depth 1.
    const doc = parse('{ item { id, ... on Item { name job } } }');
    expect(analyzeComplexity(doc, 2)).toMatchObject({ complexity: 8, totalQueryDepth: 1 });
    expect(analyzeComplexity(doc, 3)).toMatchObject({ complexity: 12, totalQueryDepth: 1 });
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

// These expected numbers are NOT hand-derived - they were produced by running
// the ACTUAL graphql-dotnet 2.4.0 ComplexityAnalyzer.Analyze (the assembly
// Sitecore.Services.GraphQL pins) on each query and reading ComplexityResult.
// A real head-app navigation query is almost entirely `results { ... on T {} }`
// inline fragments, so graphql-dotnet scores it LOW (it stops at each inline-
// fragment-only selection set) - which is why real Sitecore accepts it. Deep
// *direct*-field nesting is what actually accumulates complexity.
describe('analyzeComplexity conformance vs real graphql-dotnet 2.4.0', () => {
  const MODULAR_NAV = `query ModularNavigation($datasource: String!, $language: String!) {
    modularNavigation: item(path: $datasource, language: $language) {
      rootItems:children(includeTemplateIDs:["{91B46589-67ED-45A3-8804-1563A7E39F4E}"]) {
        results { ... on RootMenuItem {
          id, menuItemText { value }, menuItemLink { jsonValue }, menuIcon { jsonValue },
          hideInSitemap { boolValue }, hideInMainMenu { boolValue },
          columns:children(includeTemplateIDs:["{AEDDB611-901F-4DC3-8F88-3596DC7B5DB3}"]) {
            results { ... on MenuColumn { id,
              elements:children(includeTemplateIDs:["{19E9E732-A61E-40A1-B63A-BF46787828B8}"]) {
                results { id, template { id, name },
                  ... on MenuLinkList {
                    menuItemText { value }, menuItemLink { jsonValue },
                    menuItemTags { targetItems { ...on MenuLinkTag { menuLinkTagText { value } } } },
                    links: children(includeTemplateIDs:["{C792B58A-DB19-408F-9D55-09A28C89C00A}"]) {
                      results { ...on MenuLink { id, menuItemText { value } } }
                    }
                  }
                }
              }
            } }
          }
        } }
      }
    }
  }`;

  it('scores a production inline-fragment navigation query LOW (matches real Sitecore)', () => {
    // Reference graphql-dotnet 2.4.0: complexity 14 (avg 2) / 39 (avg 3), depth 3.
    // This is the ModularNavigation query the consumer's site renders; it must
    // pass even the stock 10000 limit - and far under a patched 2,000,000.
    const doc = parse(MODULAR_NAV);
    expect(analyzeComplexity(doc, 2)).toMatchObject({ complexity: 14, totalQueryDepth: 3 });
    expect(analyzeComplexity(doc, 3)).toMatchObject({ complexity: 39, totalQueryDepth: 3 });
  });

  it('scores deep DIRECT-field nesting geometrically (this is what trips the limit)', () => {
    // Reference graphql-dotnet 2.4.0: complexity 94 (avg 2) / 606 (avg 3), depth 5.
    const doc = parse('{ item { children { results { children { results { id } } } } } }');
    expect(analyzeComplexity(doc, 2)).toMatchObject({ complexity: 94, totalQueryDepth: 5 });
    expect(analyzeComplexity(doc, 3)).toMatchObject({ complexity: 606, totalQueryDepth: 5 });
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
