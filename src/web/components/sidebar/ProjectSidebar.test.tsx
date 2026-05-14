// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectSidebar } from './ProjectSidebar';
import { resetLayerState } from '@/state/layerState';
import { SettingsProvider } from '@/settings/SettingsProvider';

// Provide a minimal localStorage stub for jsdom environments that may not have it
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

const statusReady = {
  state: 'ready' as const,
  layers: [
    { name: 'authoring', sitecoreJsonPath: '/workspaces/p/authoring/sitecore.json', color: '#22c55e', effectiveCount: 340 },
    { name: 'content', sitecoreJsonPath: '/workspaces/p/content/sitecore.json', color: '#3b82f6', effectiveCount: 1234 },
    { name: 'ootb', effectiveCount: 22613 },
  ],
};

const statusNoProject = { state: 'no-project' as const, layers: [] };

beforeEach(() => {
  resetLayerState();
  localStorageStub.clear();
  // stub fetch for any /api/fs/list call FolderBrowser makes when the picker mounts
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ path: '/', entries: [] }), { status: 200 }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('<ProjectSidebar>', () => {
  it('renders nothing when state is no-project', () => {
    const { container } = renderWithClient(
      <ProjectSidebar status={statusNoProject} onSwitch={() => {}} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per user layer + a Sitecore IAR substrate row', () => {
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    expect(screen.getByText('authoring')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText(/Sitecore IAR/)).toBeInTheDocument();
    expect(screen.getByText('22613')).toBeInTheDocument();
  });

  it('kebab menu "Open another project" invokes onSwitch', async () => {
    const onSwitch = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={onSwitch} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /project actions/i }));
    await user.click(screen.getByRole('button', { name: /open another project/i }));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('kebab menu "Close project" invokes onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /project actions/i }));
    await user.click(screen.getByRole('button', { name: /close project/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('collapse button hides layer rows and shows an expand button', async () => {
    const user = userEvent.setup();
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    // Layer rows are visible initially
    expect(screen.getByText('authoring')).toBeInTheDocument();
    // Click the collapse button
    await user.click(screen.getByRole('button', { name: /hide content layers/i }));
    // Layer rows are now hidden
    expect(screen.queryByText('authoring')).not.toBeInTheDocument();
    // The collapsed strip shows an expand button
    expect(screen.getByRole('button', { name: /show content layers/i })).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-collapsed')).toBeInTheDocument();
  });

  it('expand button restores sidebar content after collapse', async () => {
    const user = userEvent.setup();
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /hide content layers/i }));
    await user.click(screen.getByRole('button', { name: /show content layers/i }));
    expect(screen.getByText('authoring')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-collapsed')).not.toBeInTheDocument();
  });

  it('persists collapsed state to localStorage', async () => {
    const user = userEvent.setup();
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /hide content layers/i }));
    expect(localStorageStub.getItem('mockingbird.sidebar.collapsed')).toBe('true');
  });

  it('uses status.projectName for the header label when provided', () => {
    const statusWithName = { ...statusReady, projectName: 'my-workspace' };
    renderWithClient(<ProjectSidebar status={statusWithName} onSwitch={() => {}} onClose={() => {}} />);
    expect(screen.getByText('my-workspace')).toBeInTheDocument();
  });

  it('falls back to path-strip heuristic when status.projectName is absent', () => {
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    // statusReady layers have paths like /workspaces/p/{layer}/sitecore.json
    // stripping two segments from authoring path -> /workspaces/p -> basename = "p"
    expect(screen.getByText('p')).toBeInTheDocument();
  });
});

describe('<ProjectSidebar> add layer', () => {
  it('renders "+ Add layer" button below the user-layer list', () => {
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /add layer/i })).toBeInTheDocument();
    // OOTB row still present below
    expect(screen.getByText(/Sitecore IAR/)).toBeInTheDocument();
  });

  it('clicking "+ Add layer" opens the LayerSourcePicker in add mode', async () => {
    const user = userEvent.setup();
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /add layer/i }));
    // LayerSourcePicker's add-mode banner uses data-testid="layer-source-picker-mode"
    expect(screen.getByTestId('layer-source-picker-mode')).toHaveTextContent(/add a layer/i);
  });
});

describe('<ProjectSidebar> replace source', () => {
  it('clicking Replace source... on a layer kebab opens the picker in replace mode', async () => {
    const user = userEvent.setup();
    renderWithClient(<ProjectSidebar status={statusReady} onSwitch={() => {}} onClose={() => {}} />);
    const kebabs = screen.getAllByRole('button', { name: /layer actions/i });
    expect(kebabs.length).toBeGreaterThan(0);
    await user.click(kebabs[0]);
    await user.click(screen.getByRole('button', { name: /replace source/i }));
    expect(screen.getByTestId('layer-source-picker-mode')).toHaveTextContent(/replace layer source/i);
  });
});
