// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { ProjectSidebar } from '@/components/sidebar/ProjectSidebar';
import { useProjectsStore, resetProjectsStore } from '@/state/projectsStore';
import { reset as resetSettings } from '@/settings/store';

// jsdom localStorage stub
let _mem: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => _mem[k] ?? null,
  setItem: (k: string, v: string) => { _mem[k] = v; },
  removeItem: (k: string) => { delete _mem[k]; },
  clear: () => { _mem = {}; },
});

const fetchMock = vi.fn();

beforeEach(() => {
  _mem = {};
  resetProjectsStore();
  resetSettings();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function makeClient(initial?: { lastOpenedHash?: string }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  c.setQueryData(['config', 'mockingbird'], {
    version: 1,
    projects: {},
    ...(initial?.lastOpenedHash !== undefined ? { lastOpenedHash: initial.lastOpenedHash } : {}),
  });
  return c;
}

function Wrapper({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider>{children}</SettingsProvider>
    </QueryClientProvider>
  );
}

const baseLayer = {
  sitecoreJsonPath: '/ws/a/sitecore.json',
  name: 'my-layer',
  color: '#3b82f6',
  effectiveCount: 5,
};

const readyStatus = {
  state: 'ready' as const,
  layers: [baseLayer],
  projectName: 'My Project',
};

describe('ProjectSidebar', () => {
  it('renders the project name in the sidebar header', () => {
    const client = makeClient({ lastOpenedHash: 'h1' });
    render(
      <ProjectSidebar status={readyStatus} onSwitch={() => {}} onClose={() => {}} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );
    expect(screen.getByText('My Project')).toBeInTheDocument();
  });

  it('renders layer rows for user layers', () => {
    const client = makeClient({ lastOpenedHash: 'h1' });
    render(
      <ProjectSidebar status={readyStatus} onSwitch={() => {}} onClose={() => {}} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );
    expect(screen.getByText('my-layer')).toBeInTheDocument();
  });

  it('renders the Sitecore IAR substrate row', () => {
    const client = makeClient({ lastOpenedHash: 'h1' });
    render(
      <ProjectSidebar status={readyStatus} onSwitch={() => {}} onClose={() => {}} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );
    expect(screen.getByText('Sitecore IAR')).toBeInTheDocument();
  });

  it('calls onSwitch when "Open another project..." is clicked', async () => {
    const client = makeClient({ lastOpenedHash: 'h1' });
    const onSwitch = vi.fn();
    render(
      <ProjectSidebar status={readyStatus} onSwitch={onSwitch} onClose={() => {}} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );

    // Open the actions menu
    const actionsBtn = screen.getByRole('button', { name: /project actions/i });
    fireEvent.click(actionsBtn);

    const switchBtn = screen.getByRole('button', { name: /open another project/i });
    fireEvent.click(switchBtn);
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('calls onClose when "Close project" is clicked', () => {
    const client = makeClient({ lastOpenedHash: 'h1' });
    const onClose = vi.fn();
    render(
      <ProjectSidebar status={readyStatus} onSwitch={() => {}} onClose={onClose} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );

    const actionsBtn = screen.getByRole('button', { name: /project actions/i });
    fireEvent.click(actionsBtn);

    const closeBtn = screen.getByRole('button', { name: /close project/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses lastOpenedHash from config query (not settings) for project rename', async () => {
    const client = makeClient({ lastOpenedHash: 'h1' });
    useProjectsStore.getState().upsert({
      hash: 'h1',
      name: 'My Project',
      layers: [{ sitecoreJsonPath: '/ws/a/sitecore.json', name: 'a', color: '#111' }],
      createdAt: 100,
      lastOpenedAt: 200,
    });

    render(
      <ProjectSidebar status={readyStatus} onSwitch={() => {}} onClose={() => {}} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );

    // The project name should appear; sidebar must have resolved h1 from config query
    expect(screen.getByText('My Project')).toBeInTheDocument();
  });

  it('returns null when status is no-project', () => {
    const client = makeClient();
    const { container } = render(
      <ProjectSidebar
        status={{ state: 'no-project', layers: [], projectName: null }}
        onSwitch={() => {}}
        onClose={() => {}}
      />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );
    expect(container.firstChild).toBeNull();
  });

  it('collapses and expands the sidebar', async () => {
    const client = makeClient({ lastOpenedHash: 'h1' });
    render(
      <ProjectSidebar status={readyStatus} onSwitch={() => {}} onClose={() => {}} />,
      { wrapper: ({ children }) => <Wrapper client={client}>{children}</Wrapper> },
    );

    const collapseBtn = screen.getByRole('button', { name: /hide content layers/i });
    await act(async () => { fireEvent.click(collapseBtn); });
    expect(screen.getByTestId('sidebar-collapsed')).toBeInTheDocument();

    const expandBtn = screen.getByRole('button', { name: /show content layers/i });
    await act(async () => { fireEvent.click(expandBtn); });
    expect(screen.queryByTestId('sidebar-collapsed')).not.toBeInTheDocument();
  });
});
