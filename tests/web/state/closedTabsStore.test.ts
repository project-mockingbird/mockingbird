import { describe, it, expect } from 'vitest';
import {
  createClosedTabsStore,
  CLOSED_TABS_LIMIT,
} from '@/state/closedTabsStore';
import { getDefaultTabState } from '@/state/workspaceStore';

describe('closedTabsStore', () => {
  it('starts empty', () => {
    const cts = createClosedTabsStore();
    expect(cts.peek()).toBe(null);
    expect(cts.size()).toBe(0);
  });

  it('push records snapshot then pop returns it (LIFO)', () => {
    const cts = createClosedTabsStore();
    const tab = getDefaultTabState('t1');
    cts.push({ tab, paneIndex: 0 });
    expect(cts.size()).toBe(1);
    const popped = cts.pop();
    expect(popped?.paneIndex).toBe(0);
    expect(popped?.tab.id).toBe('t1');
    expect(cts.size()).toBe(0);
  });

  it('caps history at CLOSED_TABS_LIMIT, dropping oldest', () => {
    const cts = createClosedTabsStore();
    for (let i = 0; i < CLOSED_TABS_LIMIT + 5; i++) {
      cts.push({ tab: getDefaultTabState(`t${i}`), paneIndex: 0 });
    }
    expect(cts.size()).toBe(CLOSED_TABS_LIMIT);
    // Most recent push should pop first
    expect(cts.pop()?.tab.id).toBe(`t${CLOSED_TABS_LIMIT + 4}`);
  });

  it('subscribers fire on push and pop', () => {
    const cts = createClosedTabsStore();
    let calls = 0;
    cts.subscribe(() => { calls++; });
    cts.push({ tab: getDefaultTabState('t1'), paneIndex: 0 });
    expect(calls).toBe(1);
    cts.pop();
    expect(calls).toBe(2);
  });
});
