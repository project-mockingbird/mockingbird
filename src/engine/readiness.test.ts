import { describe, it, expect } from 'vitest';
import { ReadinessState } from './readiness.js';

describe('ReadinessState.markProgress', () => {
  it('records scanned/total with no layer name when none is given', () => {
    const r = new ReadinessState();
    r.markProgress(10, 100);
    expect(r.progress.scanned).toBe(10);
    expect(r.progress.total).toBe(100);
    expect(r.progress.layer).toBeUndefined();
  });

  it('records the layer name when provided', () => {
    const r = new ReadinessState();
    r.markProgress(50, 200, 'authoring layer');
    expect(r.progress.scanned).toBe(50);
    expect(r.progress.total).toBe(200);
    expect(r.progress.layer).toBe('authoring layer');
  });

  it('clears the layer name on reset', () => {
    const r = new ReadinessState();
    r.markProgress(50, 200, 'authoring layer');
    r.reset();
    expect(r.progress.scanned).toBe(0);
    expect(r.progress.total).toBe(0);
    expect(r.progress.layer).toBeUndefined();
  });

  it('ignores progress updates once no longer initializing', () => {
    const r = new ReadinessState();
    r.markReady();
    r.markProgress(5, 5, 'content layer');
    expect(r.progress.scanned).toBe(0);
    expect(r.progress.layer).toBeUndefined();
  });
});
