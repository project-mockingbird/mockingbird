/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Polyfill ResizeObserver for jsdom
if (!global.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserver as any;
}

vi.mock('@/hooks/useEngineStatus', () => ({
  useEngineStatus: () => ({
    data: {
      state: 'ready',
      layers: [
        { name: 'a', color: '#22c55e', effectiveCount: 1 },
        { name: 'b', color: '#3b82f6', effectiveCount: 1 },
        { name: 'ootb', effectiveCount: 1 },
      ],
      registryItemCount: 1,
    },
    isLoading: false,
  }),
}));

const defaultTreeData = [
  {
    id: 'r',
    name: 'root',
    path: '/sitecore',
    template: 't',
    type: 'unknown',
    source: 'registry',
    hasChildren: true,
    autoExpand: true,
    provenance: { winnerLayer: 'ootb', contributingLayers: ['ootb'] },
    children: [
      {
        id: 'a-item',
        name: 'a-item',
        path: '/sitecore/a',
        template: 't',
        type: 'unknown',
        source: 'serialized',
        hasChildren: false,
        provenance: { winnerLayer: 'a', contributingLayers: ['a'] },
      },
      {
        id: 'b-item',
        name: 'b-item',
        path: '/sitecore/b',
        template: 't',
        type: 'unknown',
        source: 'serialized',
        hasChildren: false,
        provenance: { winnerLayer: 'b', contributingLayers: ['b'] },
      },
    ],
  },
];

// useTree is a vi.fn() so individual tests can call mockReturnValue to override.
const mockUseTree = vi.fn(() => ({ data: defaultTreeData, isLoading: false }));

vi.mock('@/hooks/useItems', () => ({
  useTree: () => mockUseTree(),
  useChildren: () => ({ data: [] }),
  useCreateItem: () => ({ mutateAsync: vi.fn() }),
  useDeleteItem: () => ({ mutateAsync: vi.fn() }),
  useAncestors: () => ({ data: [] }),
}));

vi.mock('@/hooks/useValidation', () => ({
  useValidation: () => ({ data: { valid: true, errors: [] } }),
}));

vi.mock('@/hooks/useInsertOptions', () => ({ useInsertOptions: () => ({ data: [] }) }));
vi.mock('@/hooks/useInsertItem', () => ({ useInsertItem: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useDuplicateItem', () => ({ useDuplicateItem: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useCopyItem', () => ({ useCopyItem: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useMoveItem', () => ({ useMoveItem: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useRefreshItem', () => ({ useRefreshItem: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useRenameItem', () => ({ useRenameItem: () => ({ mutateAsync: vi.fn(), isPending: false }) }));

import { ContentTree } from './ContentTree';
import { resetLayerState, useLayerState } from '@/state/layerState';

describe('ContentTree filter pass', () => {
  beforeEach(() => resetLayerState());

  it('hides nodes whose winnerLayer is toggled off (OOTB always shown)', async () => {
    render(<ContentTree selectedId={null} onSelect={() => {}} database="master" />);
    expect(await screen.findByText('a-item')).toBeInTheDocument();
    expect(screen.getByText('b-item')).toBeInTheDocument();

    act(() => {
      useLayerState.getState().setVisibility('a', false);
    });

    expect(screen.queryByText('a-item')).not.toBeInTheDocument();
    expect(screen.getByText('b-item')).toBeInTheDocument();
    expect(screen.getByText('root')).toBeInTheDocument();
  });
});

describe('ContentTree layer filter - lazy-load preservation', () => {
  afterEach(() => {
    // Restore default fixture so other describe blocks are unaffected.
    mockUseTree.mockReturnValue({ data: defaultTreeData, isLoading: false });
  });

  beforeEach(() => {
    resetLayerState();
    // Override useTree to return a depth-boundary node:
    // hasChildren=true but children=undefined (not yet fetched from API).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseTree.mockReturnValue({
      data: [
        {
          id: 'lazy-parent',
          name: 'lazy-parent',
          path: '/sitecore/lazy-parent',
          template: 't',
          type: 'unknown',
          source: 'serialized',
          hasChildren: true,
          // children intentionally absent (undefined) - depth boundary node
          provenance: { winnerLayer: 'a', contributingLayers: ['a'] },
        } as any,
      ],
      isLoading: false,
    });
  });

  it('does not coerce undefined children to [] so the expand button remains', async () => {
    render(<ContentTree selectedId={null} onSelect={() => {}} database="master" />);
    // The row must appear - the layer filter must not drop a visible node.
    expect(await screen.findByText('lazy-parent')).toBeInTheDocument();
    // hasChildren=true + children=undefined means the row renders an Expand
    // button. The pre-fix filter coerced children to [], which was still spread
    // over the node, but the lazy-load condition `!node.children` would then be
    // false, so useChildren would never fire on expand. The expand button being
    // present here confirms the node shape was preserved by the filter.
    expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
  });
});

describe('ContentTreeNode provenance tooltip', () => {
  beforeEach(() => resetLayerState());

  it('hover on a tree row reveals the contributing-layer attribution', async () => {
    const user = userEvent.setup();
    render(<ContentTree selectedId={null} onSelect={() => {}} database="master" />);
    const row = await screen.findByText('a-item');
    await user.hover(row);
    // Radix tooltip renders into a portal; query by role.
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/a/);
  });
});
