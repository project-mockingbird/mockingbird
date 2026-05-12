import { describe, it, expect, beforeEach } from 'vitest';
import { useLayerState, resetLayerState } from './layerState';

describe('useLayerState store', () => {
  beforeEach(() => resetLayerState());

  it('defaults all layers to visible', () => {
    const s = useLayerState.getState();
    s.setVisibility('a', false);
    expect(useLayerState.getState().visibility.a).toBe(false);
    expect(useLayerState.getState().isVisible('a')).toBe(false);
  });

  it('reads visibility as true when unset (default visible)', () => {
    expect(useLayerState.getState().isVisible('unknown')).toBe(true);
  });

  it('records name overrides', () => {
    useLayerState.getState().rename('layer-1', 'authoring');
    expect(useLayerState.getState().overrides['layer-1']?.name).toBe('authoring');
  });

  it('records color overrides', () => {
    useLayerState.getState().recolor('layer-1', '#3b82f6');
    expect(useLayerState.getState().overrides['layer-1']?.color).toBe('#3b82f6');
  });

  it('reset() clears everything', () => {
    useLayerState.getState().setVisibility('a', false);
    useLayerState.getState().rename('a', 'renamed');
    useLayerState.getState().recolor('a', '#fff');
    useLayerState.getState().reset();
    const s = useLayerState.getState();
    expect(s.visibility).toEqual({});
    expect(s.overrides).toEqual({});
  });

  it('isVisible returns false only when explicitly set to false', () => {
    const s = useLayerState.getState();
    s.setVisibility('a', false);
    s.setVisibility('b', true);
    expect(s.isVisible('a')).toBe(false);
    expect(s.isVisible('b')).toBe(true);
    expect(s.isVisible('c')).toBe(true);
  });
});
