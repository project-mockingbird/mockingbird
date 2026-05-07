// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentTree } from '@/components/tree/ContentTree';

// Mock the api module to control insert-options + insertItem responses.
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

const baseNode = {
  id: 'i1',
  name: 'Home',
  path: '/sitecore/content/Home',
  type: 'unknown' as const,
  source: 'serialized' as const,
  hasChildren: false,
  database: 'master',
};

function renderTree(node: any = baseNode, options: any[] = []) {
  (api as any).getTree.mockResolvedValue([node]);
  (api as any).getChildren.mockResolvedValue([]);
  (api as any).getDatabases.mockResolvedValue(['master']);
  (api as any).getAncestors.mockResolvedValue([]);
  (api as any).getInsertOptions.mockResolvedValue({ options });
  (api as any).insertItem.mockResolvedValue({
    id: 'new',
    name: 'NewItem',
    path: '/sitecore/content/Home/NewItem',
    template: 'tpl',
  });

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

describe('Insert context menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Insert as the FIRST item in the right-click menu (serialized item)', async () => {
    renderTree();
    const row = await screen.findByText('Home');
    fireEvent.contextMenu(row);
    const items = await screen.findAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Insert');
  });

  it('disables Insert on registry-only items', async () => {
    const node = { ...baseNode, id: 'r1', name: 'OOTB', source: 'registry' as const };
    renderTree(node);
    const row = await screen.findByText('OOTB');
    fireEvent.contextMenu(row);
    const insertEntry = await screen.findByText('Insert');
    // The submenu trigger is itself a menuitem - its data-disabled / aria-disabled
    // attributes are how Radix flags disabled state.
    const trigger = insertEntry.closest('[role="menuitem"]');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });

  describe('Duplicate context-menu entry', () => {
    it('shows Duplicate after Insert in the context menu', async () => {
      renderTree();
      const row = await screen.findByText('Home');
      fireEvent.contextMenu(row);
      const items = await screen.findAllByRole('menuitem');
      const labels = items.map((el) => el.textContent ?? '');
      const insertIdx = labels.findIndex((l) => l === 'Insert');
      const duplicateIdx = labels.findIndex((l) => l === 'Duplicate');
      expect(insertIdx).toBeGreaterThanOrEqual(0);
      expect(duplicateIdx).toBeGreaterThanOrEqual(0);
      expect(duplicateIdx).toBe(insertIdx + 1);
    });

    it('Duplicate is disabled on registry rows', async () => {
      const node = { ...baseNode, id: 'r1', name: 'OOTB', source: 'registry' as const };
      renderTree(node);
      const row = await screen.findByText('OOTB');
      fireEvent.contextMenu(row);
      const dupEntry = await screen.findByText('Duplicate');
      const item = dupEntry.closest('[role="menuitem"]');
      expect(item).not.toBeNull();
      expect(item).toHaveAttribute('aria-disabled', 'true');
    });

    it('clicking Duplicate opens DuplicateItemDialog', async () => {
      renderTree();
      const row = await screen.findByText('Home');
      fireEvent.contextMenu(row);
      const dupEntry = await screen.findByText('Duplicate');
      fireEvent.click(dupEntry);
      await waitFor(() => {
        expect(screen.getByText('Duplicate "Home"')).toBeInTheDocument();
      });
    });
  });

  describe('row-hover action icons wired to handlers', () => {
    it('+ icon opens InsertDialogWithTemplateDropdown', async () => {
      // The + icon flow uses the combined Insert dialog (with template
      // picker), distinct from the right-click submenu's
      // pre-selected-template flow.
      renderTree(baseNode, [
        { templateId: 't1', templateName: 'Sample Template' },
      ]);
      await screen.findByText('Home');
      const insertBtn = screen.getByRole('button', { name: /insert/i });
      fireEvent.click(insertBtn);
      await waitFor(() => {
        expect(screen.getByText('Insert item')).toBeInTheDocument();
      });
    });

    it('duplicate icon opens DuplicateItemDialog', async () => {
      renderTree();
      await screen.findByText('Home');
      const dupBtn = screen.getByRole('button', { name: /duplicate/i });
      fireEvent.click(dupBtn);
      await waitFor(() => {
        expect(screen.getByText('Duplicate "Home"')).toBeInTheDocument();
      });
    });

    it('trash icon opens DeleteConfirmDialog with item name + path', async () => {
      renderTree();
      await screen.findByText('Home');
      const trashBtn = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(trashBtn);
      // New styled dialog replaces the native window.confirm(). Title carries
      // the item name; body shows the path.
      await waitFor(() => {
        expect(screen.getByText(/Delete "Home"\?/i)).toBeInTheDocument();
      });
    });

    it('icons are not rendered on registry rows', async () => {
      const node = {
        ...baseNode,
        id: 'r1',
        name: 'OOTB',
        source: 'registry' as const,
      };
      renderTree(node);
      await screen.findByText('OOTB');
      expect(screen.queryByRole('button', { name: /insert/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /duplicate/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    });
  });
});
