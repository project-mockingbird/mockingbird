import { describe, expect, it } from 'vitest';
import { substituteDynamicPlaceholder } from '../../../src/engine/renderings/dynamic-placeholders.js';
import type { RenderingEntry } from '../../../src/engine/layout/types.js';

const parentEntry = (params: Record<string, string>): RenderingEntry => ({
  uid: '{47ACAE0E-79A6-4C04-B66C-D26C5C9A6E03}',
  renderingId: '{4B5A6F21-7745-4657-9643-6D660223CBC9}',
  placeholder: '/whatever',
  dataSource: '',
  params,
});

describe('substituteDynamicPlaceholder', () => {
  it('substitutes {*} with the parent rendering DynamicPlaceholderId', () => {
    expect(
      substituteDynamicPlaceholder('container-{*}', parentEntry({ DynamicPlaceholderId: '2' })),
    ).toBe('container-2');
  });

  it('substitutes {0} with the parent rendering DynamicPlaceholderId', () => {
    expect(
      substituteDynamicPlaceholder('accordion-{0}', parentEntry({ DynamicPlaceholderId: '5' })),
    ).toBe('accordion-5');
  });

  it('substitutes {N} with the parent rendering DynamicPlaceholderId', () => {
    expect(
      substituteDynamicPlaceholder('tab-{N}', parentEntry({ DynamicPlaceholderId: '3' })),
    ).toBe('tab-3');
  });

  it('returns the template unchanged when no token is present', () => {
    expect(
      substituteDynamicPlaceholder('content', parentEntry({ DynamicPlaceholderId: '2' })),
    ).toBe('content');
  });

  it('returns the template unchanged when DynamicPlaceholderId is missing', () => {
    expect(substituteDynamicPlaceholder('container-{*}', parentEntry({}))).toBe('container-{*}');
  });

  it('returns the template unchanged when DynamicPlaceholderId is empty string', () => {
    expect(
      substituteDynamicPlaceholder('container-{*}', parentEntry({ DynamicPlaceholderId: '' })),
    ).toBe('container-{*}');
  });

  it('substitutes multiple distinct tokens (v1: all with the same DynamicPlaceholderId)', () => {
    // Per research, multi-token semantics aren't fully decoded; v1 substitutes
    // all tokens uniformly. If content tree reveals positional semantics later, this
    // test needs updating.
    expect(
      substituteDynamicPlaceholder('grid-{0}-{1}', parentEntry({ DynamicPlaceholderId: '7' })),
    ).toBe('grid-7-7');
  });

  it('substitutes the same token multiple times in one template', () => {
    expect(
      substituteDynamicPlaceholder('row-{*}-col-{*}', parentEntry({ DynamicPlaceholderId: '2' })),
    ).toBe('row-2-col-2');
  });

  it('produces correct results across consecutive calls (no stateful-regex carryover)', () => {
    // Regression: the module-level /g regex is stateful via lastIndex; consecutive
    // calls in a tight loop must not corrupt each other's results. This is the
    // exact call pattern Task 7's placeholder-paths discovery uses.
    const parent = parentEntry({ DynamicPlaceholderId: '4' });
    expect(substituteDynamicPlaceholder('container-{*}', parent)).toBe('container-4');
    expect(substituteDynamicPlaceholder('container-{*}', parent)).toBe('container-4');
    expect(substituteDynamicPlaceholder('accordion-{0}', parent)).toBe('accordion-4');
    expect(substituteDynamicPlaceholder('container-{*}', parent)).toBe('container-4');
  });
});
