// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteConfirmDialog } from '@/components/tree/DeleteConfirmDialog';

const baseProps = {
  open: true,
  itemName: 'Favorite',
  itemPath: '/sitecore/content/Site/Datasources/Favorite',
  hasChildren: false,
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

describe('DeleteConfirmDialog', () => {
  it('shows the item name in the title', () => {
    render(<DeleteConfirmDialog {...baseProps} />);
    expect(screen.getByText(/Delete "Favorite"\?/i)).toBeInTheDocument();
  });

  it('shows the item path', () => {
    render(<DeleteConfirmDialog {...baseProps} />);
    expect(screen.getByText('/sitecore/content/Site/Datasources/Favorite')).toBeInTheDocument();
  });

  it('warns about descendants when hasChildren=true', () => {
    render(<DeleteConfirmDialog {...baseProps} hasChildren />);
    expect(screen.getByText(/descendants/i)).toBeInTheDocument();
  });

  it('does NOT show the descendant warning when hasChildren=false', () => {
    render(<DeleteConfirmDialog {...baseProps} hasChildren={false} />);
    expect(screen.queryByText(/descendants/i)).not.toBeInTheDocument();
  });

  it('Cancel button calls onClose, not onConfirm', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<DeleteConfirmDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Delete button calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(<DeleteConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('isPending disables both buttons and shows loading state on Delete', () => {
    render(<DeleteConfirmDialog {...baseProps} isPending />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled();
  });
});
