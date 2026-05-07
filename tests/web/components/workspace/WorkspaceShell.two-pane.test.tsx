// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { workspaceStore, DEFAULT_TAB_ID } from '@/state/workspaceStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '@/settings/SettingsProvider';

function renderShell() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SettingsProvider>
        <WorkspaceShell
          validationOpen={false}
          setValidationOpen={() => {}}
          persistedSize={20}
          onTreePanelResize={() => {}}
        />
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

describe('WorkspaceShell two-pane render', () => {
  beforeEach(() => {
    const s = workspaceStore.getState();
    if (s.panes.length === 2) act(() => { workspaceStore.collapseSplit(); });
    for (const id of Object.keys(workspaceStore.getState().tabs)) {
      if (id !== DEFAULT_TAB_ID) act(() => { workspaceStore.closeTab(id); });
    }
  });

  it('renders one pane when panes.length === 1', () => {
    renderShell();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
  });

  it('renders two panes when panes.length === 2', () => {
    const t = workspaceStore.addTab(0, { selectedItemId: 'A' });
    act(() => { workspaceStore.splitRight(t); });
    renderShell();
    expect(screen.getAllByRole('tablist')).toHaveLength(2);
  });
});
