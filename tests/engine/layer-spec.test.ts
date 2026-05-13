import { describe, it, expect } from 'vitest';
import {
  pushOpStrength,
  comparePushOps,
  type AllowedPushOperations,
  type LayerSpec,
} from '../../src/engine/layer-spec.js';

describe('pushOpStrength', () => {
  it('CreateOnly is weakest (strength 0)', () => {
    expect(pushOpStrength('CreateOnly')).toBe(0);
  });

  it('CreateAndUpdate is middle (strength 1)', () => {
    expect(pushOpStrength('CreateAndUpdate')).toBe(1);
  });

  it('CreateUpdateAndDelete is strongest (strength 2)', () => {
    expect(pushOpStrength('CreateUpdateAndDelete')).toBe(2);
  });

  it('undefined defaults to CreateAndUpdate strength', () => {
    expect(pushOpStrength(undefined)).toBe(1);
  });
});

describe('comparePushOps', () => {
  it('returns negative when a is weaker than b', () => {
    expect(comparePushOps('CreateOnly', 'CreateAndUpdate')).toBeLessThan(0);
    expect(comparePushOps('CreateOnly', 'CreateUpdateAndDelete')).toBeLessThan(0);
    expect(comparePushOps('CreateAndUpdate', 'CreateUpdateAndDelete')).toBeLessThan(0);
  });

  it('returns positive when a is stronger than b', () => {
    expect(comparePushOps('CreateUpdateAndDelete', 'CreateOnly')).toBeGreaterThan(0);
    expect(comparePushOps('CreateAndUpdate', 'CreateOnly')).toBeGreaterThan(0);
  });

  it('returns 0 when equal', () => {
    expect(comparePushOps('CreateOnly', 'CreateOnly')).toBe(0);
    expect(comparePushOps(undefined, 'CreateAndUpdate')).toBe(0);
  });
});

describe('LayerSpec type', () => {
  it('accepts the documented shape', () => {
    const layer: LayerSpec = {
      sitecoreJsonPath: '/scs/sitecore.json',
      name: 'authoring',
      color: '#4a9eff',
    };
    expect(layer.sitecoreJsonPath).toBe('/scs/sitecore.json');
  });

  it('color is optional', () => {
    const layer: LayerSpec = {
      sitecoreJsonPath: '/scs/content/sitecore.json',
      name: 'content',
    };
    expect(layer.color).toBeUndefined();
  });
});
