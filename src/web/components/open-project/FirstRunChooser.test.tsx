// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FirstRunChooser } from './FirstRunChooser';

describe('FirstRunChooser', () => {
  it('renders all three options', () => {
    render(
      <FirstRunChooser
        open
        onClose={() => {}}
        onOpenExisting={() => {}}
        onBrowseOotbOnly={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /open existing project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /just browse ootb items/i })).toBeInTheDocument();
  });

  it('disables Create new with a "Coming soon" hint', () => {
    render(
      <FirstRunChooser
        open
        onClose={() => {}}
        onOpenExisting={() => {}}
        onBrowseOotbOnly={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /create new project/i })).toBeDisabled();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('fires onOpenExisting when "Open existing project" is clicked', () => {
    const fn = vi.fn();
    render(
      <FirstRunChooser
        open
        onClose={() => {}}
        onOpenExisting={fn}
        onBrowseOotbOnly={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open existing project/i }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires onBrowseOotbOnly when "Just browse OOTB items" is clicked', () => {
    const fn = vi.fn();
    render(
      <FirstRunChooser
        open
        onClose={() => {}}
        onOpenExisting={() => {}}
        onBrowseOotbOnly={fn}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /just browse ootb items/i }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
