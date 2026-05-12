// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NoProjectState } from './NoProjectState';

describe('NoProjectState', () => {
  it('renders the headline and helper copy', () => {
    render(<NoProjectState onOpenProject={() => {}} />);
    expect(screen.getByText('No project loaded')).toBeInTheDocument();
    expect(
      screen.getByText(/Pick a folder under \/workspaces to scan for sitecore\.json/i),
    ).toBeInTheDocument();
  });

  it('fires onOpenProject when the primary CTA is clicked', () => {
    const onOpen = vi.fn();
    render(<NoProjectState onOpenProject={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /open a project/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
