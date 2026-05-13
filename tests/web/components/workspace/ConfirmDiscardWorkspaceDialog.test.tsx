// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfirmDiscardWorkspaceDialog } from '@/components/workspace/ConfirmDiscardWorkspaceDialog';

describe('ConfirmDiscardWorkspaceDialog', () => {
  it('does not render when action is null', () => {
    render(
      <ConfirmDiscardWorkspaceDialog
        action={null}
        dirtyCount={0}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('renders close-specific copy when action=close', () => {
    render(
      <ConfirmDiscardWorkspaceDialog
        action="close"
        dirtyCount={1}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/Closing the project/i)).toBeInTheDocument();
    expect(screen.getByText(/1 tab\b/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard and close/i })).toBeInTheDocument();
  });

  it('renders switch-specific copy and pluralizes tab count', () => {
    render(
      <ConfirmDiscardWorkspaceDialog
        action="switch"
        dirtyCount={3}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText(/Switching projects/i)).toBeInTheDocument();
    expect(screen.getByText(/3 tabs/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard and switch/i })).toBeInTheDocument();
  });

  it('fires onConfirm and onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDiscardWorkspaceDialog
        action="close"
        dirtyCount={2}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /discard and close/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
