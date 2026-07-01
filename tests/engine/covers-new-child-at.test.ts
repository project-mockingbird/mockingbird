import { describe, it, expect } from 'vitest';
import { coversNewChildAt } from '../../src/engine/child-file-path.js';
import type { ModuleConfig } from '../../src/engine/types.js';

function mod(includes: ModuleConfig['items']['includes']): ModuleConfig {
  return { namespace: 'M', filePath: '/ws/m.module.json', items: { path: 'items', includes } };
}

describe('coversNewChildAt', () => {
  const P = '/sitecore/system/Tasks/Commands';
  it('true for DescendantsOnly at the path', () => {
    expect(coversNewChildAt(P, [mod([{ name: 'c', path: P, scope: 'DescendantsOnly' }])])).toBe(true);
  });
  it('false for SingleItem at the path', () => {
    expect(coversNewChildAt(P, [mod([{ name: 'c', path: P, scope: 'SingleItem' }])])).toBe(false);
  });
  it('true for ItemAndDescendants at an ancestor', () => {
    expect(coversNewChildAt(P, [mod([{ name: 'c', path: '/sitecore/system', scope: 'ItemAndDescendants' }])])).toBe(true);
  });
  it('false when no include matches', () => {
    expect(coversNewChildAt(P, [mod([{ name: 'c', path: '/sitecore/content', scope: 'ItemAndDescendants' }])])).toBe(false);
  });
});
