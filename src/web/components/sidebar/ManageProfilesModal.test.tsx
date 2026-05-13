// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ManageProfilesModal } from './ManageProfilesModal';

const PROFILES = [
  { name: 'dev', projectName: 'demo', layerCount: 2, updatedAt: 'T0' },
  { name: 'qa', projectName: 'demo', layerCount: 3, updatedAt: 'T1' },
];

describe('ManageProfilesModal', () => {
  it('renders both profiles', () => {
    render(
      <ManageProfilesModal
        open
        profiles={PROFILES}
        activeName="dev"
        onClose={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.getByText('qa')).toBeInTheDocument();
  });

  it('disables delete on the active profile', () => {
    render(
      <ManageProfilesModal
        open
        profiles={PROFILES}
        activeName="dev"
        onClose={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    const devRow = screen.getByText('dev').closest('li')!;
    const deleteBtn = devRow.querySelector('button[aria-label*="Delete"]') as HTMLButtonElement;
    expect(deleteBtn).toBeDisabled();
  });

  it('fires onRename with the new name on commit', () => {
    const onRename = vi.fn();
    render(
      <ManageProfilesModal
        open
        profiles={PROFILES}
        activeName="dev"
        onClose={() => {}}
        onRename={onRename}
        onDelete={() => {}}
      />,
    );
    const qaRow = screen.getByText('qa').closest('li')!;
    fireEvent.click(qaRow.querySelector('button[aria-label*="Rename"]')!);
    const input = qaRow.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'qa-review' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('qa', 'qa-review');
  });

  it('escape cancels rename without firing onRename', () => {
    const onRename = vi.fn();
    render(
      <ManageProfilesModal
        open
        profiles={PROFILES}
        activeName="dev"
        onClose={() => {}}
        onRename={onRename}
        onDelete={() => {}}
      />,
    );
    const qaRow = screen.getByText('qa').closest('li')!;
    fireEvent.click(qaRow.querySelector('button[aria-label*="Rename"]')!);
    const input = qaRow.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'qa-review' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('renders empty-state message when no profiles', () => {
    render(
      <ManageProfilesModal
        open
        profiles={[]}
        activeName={null}
        onClose={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/no profiles for this project/i)).toBeInTheDocument();
  });
});
