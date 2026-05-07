// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ConfirmCloseDialog } from '@/components/workspace/ConfirmCloseDialog';

describe('ConfirmCloseDialog', () => {
  it('does not render when no tab is queued', () => {
    render(
      <ConfirmCloseDialog
        confirmTabId={null}
        confirmTabName={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('renders title and tab name when active', () => {
    render(
      <ConfirmCloseDialog
        confirmTabId="t1"
        confirmTabName="Home"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    expect(screen.getByText(/Home/)).toBeInTheDocument();
  });

  it('confirm and cancel buttons fire callbacks', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmCloseDialog
        confirmTabId="t1"
        confirmTabName="Home"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
