import { describe, it, expect } from 'vitest';
import { LAYER_COLOR_PALETTE, assignLayerColor } from './layer-colors';

describe('LAYER_COLOR_PALETTE', () => {
  it('contains 8 hex colors', () => {
    expect(LAYER_COLOR_PALETTE).toHaveLength(8);
    for (const c of LAYER_COLOR_PALETTE) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(LAYER_COLOR_PALETTE).size).toBe(LAYER_COLOR_PALETTE.length);
  });
});

describe('assignLayerColor', () => {
  it('returns palette[0] for index 0', () => {
    expect(assignLayerColor(0)).toBe(LAYER_COLOR_PALETTE[0]);
  });

  it('cycles the palette on overflow', () => {
    expect(assignLayerColor(LAYER_COLOR_PALETTE.length)).toBe(LAYER_COLOR_PALETTE[0]);
    expect(assignLayerColor(LAYER_COLOR_PALETTE.length + 3)).toBe(LAYER_COLOR_PALETTE[3]);
  });

  it('is deterministic for the same index', () => {
    expect(assignLayerColor(2)).toBe(assignLayerColor(2));
  });
});
