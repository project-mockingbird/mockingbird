// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Tabstrip } from '@/components/workspace/Tabstrip';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderStrip() {
  const qc = new QueryClient();
  const tabs = workspaceStore.getState().panes[0].tabIds.map((id) => ({
    tabId: id,
    selectedItemId: workspaceStore.getState().tabs[id]?.selectedItemId ?? null,
    isActive: id === workspaceStore.getState().panes[0].activeTabId,
  }));
  return render(
    <QueryClientProvider client={qc}>
      <Tabstrip tabs={tabs} paneIndex={0} onAdd={() => {}} />
    </QueryClientProvider>,
  );
}

describe('Tabstrip ARIA roving tabindex + arrow nav', () => {
  beforeEach(() => {
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => workspaceStore.collapseSplit());
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => workspaceStore.closeTab(id));
    }
  });

  it('active tab has tabIndex=0; inactive have tabIndex=-1', () => {
    const tA = workspaceStore.addTab(0, { selectedItemId: 'A' });
    renderStrip();
    const tabs = screen.getAllByRole('tab');
    const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    const inactive = tabs.filter((t) => t.getAttribute('aria-selected') === 'false');
    expect(active?.tabIndex).toBe(0);
    for (const t of inactive) expect(t.tabIndex).toBe(-1);
  });

  it('ArrowRight cycles focus to next tab and updates active', () => {
    const tA = workspaceStore.addTab(0, { selectedItemId: 'A' });
    // active = tA after focus:true addTab; tabIds = [DEFAULT, tA]
    renderStrip();
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    // wraps from tA -> DEFAULT
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
  });

  it('Home jumps to first tab; End jumps to last', () => {
    const tA = workspaceStore.addTab(0, { selectedItemId: 'A' });
    const tB = workspaceStore.addTab(0, { selectedItemId: 'B' });
    renderStrip();
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(DEFAULT_TAB_ID);
    fireEvent.keyDown(list, { key: 'End' });
    expect(workspaceStore.getState().panes[0].activeTabId).toBe(tB);
  });
});
