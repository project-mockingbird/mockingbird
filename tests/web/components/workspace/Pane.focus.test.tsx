// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Pane } from '@/components/workspace/Pane';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '@/settings/SettingsProvider';

function renderPane(paneIndex: 0 | 1, activeTabId: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SettingsProvider>
        <Pane
          paneIndex={paneIndex}
          tabs={[{ tabId: activeTabId, selectedItemId: null, isActive: true }]}
          activeTabId={activeTabId}
          validationOpen={false}
          setValidationOpen={() => {}}
          persistedSize={20}
          onTreePanelResize={() => {}}
        />
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

describe('Pane focus tracking', () => {
  beforeEach(() => {
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => workspaceStore.collapseSplit());
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => workspaceStore.closeTab(id));
    }
  });

  it('mousedown inside pane sets focusedPaneIndex', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    act(() => workspaceStore.splitRight(t));
    // After splitRight: focusedPaneIndex = 1.
    // Render pane 0 - clicking it should set focusedPaneIndex to 0.
    const { container } = renderPane(0, DEFAULT_TAB_ID);
    expect(workspaceStore.getState().focusedPaneIndex).toBe(1);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(root);
    expect(workspaceStore.getState().focusedPaneIndex).toBe(0);
  });

  it('does nothing when mousedown lands on already-focused pane', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    act(() => workspaceStore.splitRight(t));
    // focused = 1. Render pane 1 and click it.
    const { container } = renderPane(1, t);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(root);
    expect(workspaceStore.getState().focusedPaneIndex).toBe(1);
  });
});
