/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

vi.mock('@/hooks/useItems', () => ({
  useTree: () => ({
    data: [
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
    ],
    isLoading: false,
  }),
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
