// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestartButton } from '@/components/RestartButton';
import { api } from '@/lib/api';

describe('RestartButton', () => {
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function openMenu() {
    fireEvent.click(screen.getByRole('button', { name: /restart mockingbird/i }));
  }

  it('opens a menu with both restart actions', () => {
    render(<RestartButton />);
    openMenu();
    expect(screen.getByRole('menuitem', { name: /^restart$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /clear cache and restart/i })).toBeInTheDocument();
  });

  it('Restart calls api.reindex(false) and reloads', async () => {
    const reindex = vi.spyOn(api, 'reindex').mockResolvedValue({ status: 'reindexing', clearCache: false });
    render(<RestartButton />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /^restart$/i }));
    await waitFor(() => expect(reindex).toHaveBeenCalledWith(false));
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it('Clear Cache and Restart confirms, then reindexes with clearCache and reloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reindex = vi.spyOn(api, 'reindex').mockResolvedValue({ status: 'reindexing', clearCache: true });
    render(<RestartButton />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /clear cache and restart/i }));
    await waitFor(() => expect(reindex).toHaveBeenCalledWith(true));
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it('does nothing when the cache-clear confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const reindex = vi.spyOn(api, 'reindex');
    render(<RestartButton />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /clear cache and restart/i }));
    expect(reindex).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
