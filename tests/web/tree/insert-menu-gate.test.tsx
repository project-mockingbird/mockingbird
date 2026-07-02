// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentTree } from '@/components/tree/ContentTree';

// Mirror the mock surface from tests/web/tree/add-serialization-root-menu.test.tsx.
vi.mock('@/lib/api', () => ({
  api: {
    getInsertOptions: vi.fn(),
    insertItem: vi.fn(),
    duplicateItem: vi.fn(),
    getTree: vi.fn(),
    getChildren: vi.fn(),
    getDatabases: vi.fn(),
    getEngineStatus: vi.fn(),
    getAncestors: vi.fn(),
    validate: vi.fn(),
  },
}));

vi.mock('@/hooks/useEngineStatus', () => ({
  useEngineReady: () => true,
  useEngineStatus: () => ({ data: { state: 'ready' } }),
}));

vi.mock('@/hooks/useValidation', () => ({
  useValidation: () => ({ data: { errors: [], warnings: [] } }),
}));

import { api } from '@/lib/api';

// A covered registry node - insertable is true (has a serialization root that covers it).
const coveredRegistryNode = {
  id: 'r-covered',
  name: 'Covered OOTB',
  path: '/sitecore/content/CoveredOOTB',
  type: 'unknown' as const,
  source: 'registry' as const,
  insertable: true,
  hasChildren: false,
  database: 'master',
};

// An uncovered registry node - insertable is false (not under any serialization root).
const uncoveredRegistryNode = {
  id: 'r-uncovered',
  name: 'Uncovered OOTB',
  path: '/sitecore/content/UncoveredOOTB',
  type: 'unknown' as const,
  source: 'registry' as const,
  insertable: false,
  hasChildren: false,
  database: 'master',
};

function renderTree(node: typeof coveredRegistryNode) {
  (api as any).getTree.mockResolvedValue([node]);
  (api as any).getChildren.mockResolvedValue([]);
  (api as any).getDatabases.mockResolvedValue(['master']);
  (api as any).getAncestors.mockResolvedValue([]);
  (api as any).getInsertOptions.mockResolvedValue({ options: [] });

  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ContentTree database="master" selectedId={null} onSelect={() => {}} />
    </QueryClientProvider>,
  );
}

describe('Insert context-menu gate (coverage-driven)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('COVERED registry node: Insert submenu trigger is ENABLED', async () => {
    renderTree(coveredRegistryNode);
    const row = await screen.findByText('Covered OOTB');
    fireEvent.contextMenu(row);
    const insertText = await screen.findByText('Insert');
    // Radix ContextMenuSubTrigger renders as a menuitem; disabled state is
    // reflected via aria-disabled (same pattern as insert-context-menu.test.tsx).
    const trigger = insertText.closest('[role="menuitem"]');
    expect(trigger).not.toBeNull();
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('COVERED registry node: "Add serialization root here..." is ABSENT', async () => {
    renderTree(coveredRegistryNode);
    const row = await screen.findByText('Covered OOTB');
    fireEvent.contextMenu(row);
    // Wait for the context menu to render before asserting absence.
    await screen.findByText('Insert');
    expect(screen.queryByText('Add serialization root here...')).toBeNull();
  });

  it('UNCOVERED registry node: Insert submenu trigger is DISABLED', async () => {
    renderTree(uncoveredRegistryNode);
    const row = await screen.findByText('Uncovered OOTB');
    fireEvent.contextMenu(row);
    const insertText = await screen.findByText('Insert');
    const trigger = insertText.closest('[role="menuitem"]');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });

  it('UNCOVERED registry node: "Add serialization root here..." is PRESENT', async () => {
    renderTree(uncoveredRegistryNode);
    const row = await screen.findByText('Uncovered OOTB');
    fireEvent.contextMenu(row);
    expect(await screen.findByText('Add serialization root here...')).toBeInTheDocument();
  });
});
