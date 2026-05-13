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

// useTree and useChildren are vi.fn()s so individual tests can call mockReturnValue.
const mockUseTree = vi.fn(() => ({ data: defaultTreeData, isLoading: false }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseChildren: ReturnType<typeof vi.fn<() => { data: any[] }>> = vi.fn(() => ({ data: [] }));

vi.mock('@/hooks/useItems', () => ({
  useTree: () => mockUseTree(),
  useChildren: () => mockUseChildren(),
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
  beforeEach(() => {
    resetLayerState();
    mockUseChildren.mockReturnValue({ data: [] });
  });

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
    // Restore default fixtures so other describe blocks are unaffected.
    mockUseTree.mockReturnValue({ data: defaultTreeData, isLoading: false });
    mockUseChildren.mockReturnValue({ data: [] });
  });

  beforeEach(() => {
    resetLayerState();
    mockUseChildren.mockReturnValue({ data: [] });
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

describe('ContentTree layer filter - lazy-loaded children', () => {
  // Fixture: a parent node whose children are NOT in the initial tree response
  // (children=undefined, hasChildren=true). useChildren returns a child whose
  // winnerLayer is 'b'. Toggling layer 'b' off must hide that lazy child.
  const lazyParent = {
    id: 'lazy-parent',
    name: 'lazy-parent',
    path: '/sitecore/lazy-parent',
    template: 't',
    type: 'unknown',
    source: 'serialized',
    hasChildren: true,
    autoExpand: true,
    provenance: { winnerLayer: 'a', contributingLayers: ['a'] },
  };

  const lazyBChild = {
    id: 'lazy-b-child',
    name: 'lazy-b-child',
    path: '/sitecore/lazy-parent/lazy-b-child',
    template: 't',
    type: 'unknown',
    source: 'serialized',
    hasChildren: false,
    provenance: { winnerLayer: 'b', contributingLayers: ['b'] },
  };

  afterEach(() => {
    mockUseTree.mockReturnValue({ data: defaultTreeData, isLoading: false });
    mockUseChildren.mockReturnValue({ data: [] });
  });

  beforeEach(() => {
    resetLayerState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseTree.mockReturnValue({ data: [lazyParent as any], isLoading: false });
    // useChildren returns the lazy-b-child when the parent is expanded.
    mockUseChildren.mockReturnValue({ data: [lazyBChild] });
  });

  it('hides lazy-loaded children whose winnerLayer is toggled off', async () => {
    render(<ContentTree selectedId={null} onSelect={() => {}} database="master" />);
    // Parent is visible (layer 'a' is on) and auto-expands; lazy child loads.
    expect(await screen.findByText('lazy-b-child')).toBeInTheDocument();

    act(() => {
      useLayerState.getState().setVisibility('b', false);
    });

    // Lazy-loaded child with winnerLayer 'b' must disappear after toggle.
    expect(screen.queryByText('lazy-b-child')).not.toBeInTheDocument();
    // Parent (layer 'a') is still visible.
    expect(screen.getByText('lazy-parent')).toBeInTheDocument();
  });
});

