// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RenderingCard } from './RenderingCard';
import type { RenderingEntry } from './types';

vi.mock('./hooks', () => ({
  useRenderingMeta: vi.fn(() => ({ data: { name: 'Header Rendering', displayName: 'Header Rendering' } })),
}));
vi.mock('@/hooks/useItems', () => ({
  useItem: vi.fn(() => ({ data: undefined })),
  useItemByPath: vi.fn(() => ({ data: undefined })),
}));

const baseEntry: RenderingEntry = {
  uid: '{U1}',
  renderingId: '{R1}',
  placeholder: '/headless-main/sxa-header',
  dataSource: '',
  params: {},
};
const noop = () => {};
const handlers = { onEdit: noop, onMoveUp: noop, onMoveDown: noop, onRemove: noop };

describe('RenderingCard - partial ownership', () => {
  it('hides move/remove controls and shows a partial badge for owner=partial', () => {
    render(
      <RenderingCard
        entry={{
          ...baseEntry,
          owner: 'partial',
          ownerDisplayName: 'Header',
          ownerItemPath: '/sitecore/content/site/Presentation/Partial Designs/Header',
        }}
        isFirst
        isLast
        editing
        depth={0}
        {...handlers}
      />,
    );
    expect(screen.getByText(/Partial Design: Header/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Remove')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move down')).not.toBeInTheDocument();
  });

  it('shows move/remove controls for a page-owned entry', () => {
    render(
      <RenderingCard entry={{ ...baseEntry, owner: 'page' }} isFirst isLast editing depth={0} {...handlers} />,
    );
    expect(screen.getByLabelText('Remove')).toBeInTheDocument();
    expect(screen.queryByText(/Partial Design:/i)).not.toBeInTheDocument();
  });
});
