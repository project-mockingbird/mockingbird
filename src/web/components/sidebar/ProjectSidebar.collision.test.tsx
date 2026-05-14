// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { ProjectSidebar } from './ProjectSidebar';
import { resetLayerState } from '@/state/layerState';
import { useProjectsStore, resetProjectsStore } from '@/state/projectsStore';
import { setSetting } from '@/settings/store';
import { computeProjectHash } from '@/state/project-hash';
import { workspaceStore } from '@/state/workspaceStore';

// Mock LayerSourcePicker so we can drive onConfirm without exercising FolderBrowser.
// Both pickers (add and replace) call the same component, so we capture each
// most-recent onConfirm by mode. The add picker is the only one rendered in the
// add flow.
let lastAddOnConfirm: ((path: string) => void) | null = null;
let lastReplaceOnConfirm: ((path: string) => void) | null = null;

vi.mock('./LayerSourcePicker', () => ({
  LayerSourcePicker: (props: {
    open: boolean;
    mode: 'add' | 'replace';
    onConfirm: (path: string) => void;
    onCancel: () => void;
  }) => {
    if (props.mode === 'add') lastAddOnConfirm = props.onConfirm;
    if (props.mode === 'replace') lastReplaceOnConfirm = props.onConfirm;
    if (!props.open) return null;
    return (
      <div data-testid={`picker-${props.mode}`}>
        <button onClick={() => props.onConfirm('/workspaces/p/extra/sitecore.json')}>
          pick-extra
        </button>
      </div>
    );
  },
}));

// Minimal localStorage stub for jsdom
const localStorageStub = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageStub });

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SettingsProvider>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </SettingsProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  lastAddOnConfirm = null;
  lastReplaceOnConfirm = null;
  resetLayerState();
  resetProjectsStore();
  workspaceStore.reset();
  localStorageStub.clear();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const statusReady = {
  state: 'ready' as const,
  layers: [
    { name: 'authoring', sitecoreJsonPath: '/workspaces/p/authoring/sitecore.json', color: '#22c55e', effectiveCount: 340 },
    { name: 'content', sitecoreJsonPath: '/workspaces/p/content/sitecore.json', color: '#3b82f6', effectiveCount: 1234 },
    { name: 'ootb', effectiveCount: 22613 },
  ],
};

describe('<ProjectSidebar> collision dialog', () => {
  it('add layer that collides with another saved project surfaces the collision dialog', async () => {
    const user = userEvent.setup();

    const currentLayers = [
      { sitecoreJsonPath: '/workspaces/p/authoring/sitecore.json', name: 'authoring', color: '#22c55e' },
      { sitecoreJsonPath: '/workspaces/p/content/sitecore.json', name: 'content', color: '#3b82f6' },
    ];
    const currentHash = await computeProjectHash(currentLayers.map((l) => l.sitecoreJsonPath));
    const collidingLayers = [
      ...currentLayers,
      { sitecoreJsonPath: '/workspaces/p/extra/sitecore.json', name: 'extra', color: '#a855f7' },
    ];
    const collidingHash = await computeProjectHash(collidingLayers.map((l) => l.sitecoreJsonPath));

    useProjectsStore.getState().setAll({
      [currentHash]: {
        hash: currentHash, name: 'current', layers: currentLayers, createdAt: 1, lastOpenedAt: 2,
      },
      [collidingHash]: {
        hash: collidingHash, name: 'existing-collider', layers: collidingLayers, createdAt: 3, lastOpenedAt: 4,
      },
    });
    setSetting('session.lastOpenedHash', currentHash);

    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);

    // Open the picker via the Add layer button. The mock renders a stub picker
    // with a button that calls onConfirm directly with the colliding path.
    await user.click(screen.getByRole('button', { name: /add layer/i }));
    await user.click(screen.getByText('pick-extra'));

    // Collision dialog appears with the existing project's name.
    expect(await screen.findByText(/existing-collider/i)).toBeInTheDocument();
    // The /api/projects/open POST was NOT fired
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
