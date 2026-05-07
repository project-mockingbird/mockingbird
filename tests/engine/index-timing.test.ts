import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startPhase,
  getPhaseTimings,
  clearPhaseTimings,
} from '../../src/engine/index-timing.js';

describe('phase timing capture', () => {
  beforeEach(() => {
    clearPhaseTimings();
    // Suppress stderr during the test - the existing console.error emit is
    // a side effect we don't care to verify here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('records each phase end into getPhaseTimings()', () => {
    const a = startPhase('alpha');
    a.end();
    const b = startPhase('beta');
    b.end({ items: 42 });
    const recorded = getPhaseTimings();
    expect(recorded).toHaveLength(2);
    expect(recorded[0]?.label).toBe('alpha');
    expect(recorded[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(recorded[1]?.label).toBe('beta');
    expect(recorded[1]?.extras).toEqual({ items: 42 });
  });

  it('clearPhaseTimings() empties the list', () => {
    startPhase('one').end();
    startPhase('two').end();
    expect(getPhaseTimings()).toHaveLength(2);
    clearPhaseTimings();
    expect(getPhaseTimings()).toHaveLength(0);
  });

  it('getPhaseTimings() returns a snapshot that does not mutate the internal list', () => {
    startPhase('x').end();
    const snapshot = getPhaseTimings();
    startPhase('y').end();
    // The earlier snapshot should still see only 1 item even after a new push,
    // OR the contract is "live view" - either way, mutating the snapshot must
    // not corrupt internal state. Simplest contract: caller gets a frozen copy.
    expect(getPhaseTimings()).toHaveLength(2);
    expect(() => {
      // @ts-expect-error - readonly array; runtime push should also fail if frozen
      (snapshot as unknown as Array<unknown>).push({ label: 'rogue', durationMs: 0 });
    }).toThrow();
  });

  it('returned timings carry rounded durationMs (number, not bigint)', () => {
    startPhase('rounded').end();
    const t = getPhaseTimings()[0]!;
    expect(typeof t.durationMs).toBe('number');
    expect(Number.isFinite(t.durationMs)).toBe(true);
  });
});
