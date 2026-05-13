// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RecentsSection } from './RecentsSection';
import type { RecentEntry } from '@/hooks/useRecents';

const ENTRIES: RecentEntry[] = [
  {
    projectHash: 'h1',
    projectName: 'demo',
    profileName: 'dev',
    lastOpenedAt: '2026-05-12T20:00:00Z',
    layerColors: ['#3b82f6', '#a855f7'],
    layerCount: 2,
  },
  {
    projectHash: 'h2',
    projectName: 'other',
    profileName: 'default',
    lastOpenedAt: '2026-05-10T20:00:00Z',
    layerColors: ['#10b981'],
    layerCount: 1,
  },
];

describe('RecentsSection', () => {
  it('renders nothing when entries is empty', () => {
    const { container } = render(
      <RecentsSection entries={[]} onOpen={() => {}} onRemove={() => {}} />,
    );
    expect(container.textContent ?? '').not.toMatch(/recent/i);
  });

  it('renders each entry', () => {
    render(<RecentsSection entries={ENTRIES} onOpen={() => {}} onRemove={() => {}} />);
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByText('other')).toBeInTheDocument();
  });

  it('fires onOpen with the entry when the row is clicked', () => {
    const onOpen = vi.fn();
    render(<RecentsSection entries={ENTRIES} onOpen={onOpen} onRemove={() => {}} />);
    fireEvent.click(screen.getByText('demo'));
    expect(onOpen).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it('greys out missing entries and blocks click', () => {
    const onOpen = vi.fn();
    const entries: RecentEntry[] = [{ ...ENTRIES[0], missing: true }];
    render(<RecentsSection entries={entries} onOpen={onOpen} onRemove={() => {}} />);
    fireEvent.click(screen.getByText('demo'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('fires onRemove when the X button is clicked', () => {
    const onRemove = vi.fn();
    render(<RecentsSection entries={ENTRIES} onOpen={() => {}} onRemove={onRemove} />);
    const removeButtons = screen.getAllByLabelText(/^Remove/);
    fireEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith(ENTRIES[0]);
  });
});
