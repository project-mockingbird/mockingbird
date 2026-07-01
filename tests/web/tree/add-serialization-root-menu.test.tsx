// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentTree } from '@/components/tree/ContentTree';

// Mirror the setup from tests/web/tree/insert-context-menu.test.tsx.
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

// useEngineStatus -> ready (skip indexing wait).
vi.mock('@/hooks/useEngineStatus', () => ({
  useEngineReady: () => true,
  useEngineStatus: () => ({ data: { state: 'ready' } }),
}));

// Validation -> empty.
vi.mock('@/hooks/useValidation', () => ({
  useValidation: () => ({ data: { errors: [], warnings: [] } }),
}));

import { api } from '@/lib/api';

const serializedNode = {
  id: 'i1',
  name: 'Home',
  path: '/sitecore/content/Home',
  type: 'unknown' as const,
  source: 'serialized' as const,
  hasChildren: false,
  database: 'master',
};

const registryNode = {
  ...serializedNode,
  id: 'r1',
  name: 'OOTB Item',
  source: 'registry' as const,
};

function renderTree(node: typeof serializedNode) {
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

describe('Add serialization root context-menu item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Add serialization root here..." when right-clicking a registry node', async () => {
    renderTree(registryNode);
    const row = await screen.findByText('OOTB Item');
    fireEvent.contextMenu(row);
    expect(await screen.findByText('Add serialization root here...')).toBeInTheDocument();
  });

  it('does not show "Add serialization root here..." on a serialized node', async () => {
    renderTree(serializedNode);
    const row = await screen.findByText('Home');
    fireEvent.contextMenu(row);
    // Wait for the context menu to appear before asserting absence.
    await screen.findByText('Insert');
    expect(screen.queryByText('Add serialization root here...')).toBeNull();
  });
});
