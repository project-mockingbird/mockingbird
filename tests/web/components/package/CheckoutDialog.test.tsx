// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CheckoutDialog } from '@/components/package/CheckoutDialog';
import { packageCartStore } from '@/state/packageCartStore';
import * as downloadModule from '@/lib/downloadPackage';

const CLEAR_KEY = 'mockingbird.packageClearCartOnSuccess';

let mem: Record<string, string>;

function addOneSource() {
  packageCartStore.addSource({
    rootItemId: '{a1b2c3d4-e5f6-7890-1234-567890abcdef}',
    rootItemPath: '/sitecore/content/Site/Home',
    rootItemName: 'Home',
    scope: 'itemAndDescendants',
  });
}

describe('CheckoutDialog', () => {
  beforeEach(() => {
    mem = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem[k] ?? null,
      setItem: (k: string, v: string) => { mem[k] = v; },
      removeItem: (k: string) => { delete mem[k]; },
      clear: () => { mem = {}; },
    });
    packageCartStore.clearAll();
  });

  afterEach(() => {
    packageCartStore.clearAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders all four fields with sensible defaults', () => {
    render(<CheckoutDialog open onOpenChange={() => {}} />);
    const today = new Date().toISOString().slice(0, 10);
    expect(screen.getByLabelText(/package name/i)).toHaveValue(`mockingbird-package-${today}`);
    expect(screen.getByLabelText(/author/i)).toHaveValue('');
    expect(screen.getByLabelText(/^version$/i)).toHaveValue('1.0');
    expect(screen.getByLabelText(/comment/i)).toHaveValue('');
    expect(screen.getByLabelText(/clear cart after successful download/i)).not.toBeChecked();
  });

  it('Generate button is disabled with empty cart', () => {
    render(<CheckoutDialog open onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: /^generate$/i })).toBeDisabled();
  });

  it('Generate button is disabled when name is empty/whitespace', () => {
    act(() => addOneSource());
    render(<CheckoutDialog open onOpenChange={() => {}} />);
    const nameInput = screen.getByLabelText(/package name/i);
    fireEvent.change(nameInput, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /^generate$/i })).toBeDisabled();
  });

  it('submits to downloadPackage with the right args, calls onSuccess, and closes', async () => {
    act(() => addOneSource());
    const downloadSpy = vi.spyOn(downloadModule, 'downloadPackage').mockResolvedValue({
      filename: 'my-pkg.zip',
      warnings: [],
      itemCount: 42,
    });
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(<CheckoutDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/package name/i), { target: { value: 'my-pkg' } });
    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: 'me' } });
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => expect(downloadSpy).toHaveBeenCalledTimes(1));
    const args = downloadSpy.mock.calls[0]![0];
    expect(args.metadata.name).toBe('my-pkg');
    expect(args.metadata.author).toBe('me');
    expect(args.metadata.version).toBe('1.0');
    expect(args.metadata.comment).toBeUndefined();  // empty -> undefined
    expect(args.sources).toHaveLength(1);
    expect(args.sources[0]).toMatchObject({
      rootItemName: 'Home',
      scope: 'itemAndDescendants',
      database: 'master',
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess).toHaveBeenCalledWith({
      filename: 'my-pkg.zip',
      itemCount: 42,
      warnings: 0,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does NOT clear the cart on success when checkbox is off', async () => {
    act(() => addOneSource());
    vi.spyOn(downloadModule, 'downloadPackage').mockResolvedValue({
      filename: 'a.zip', warnings: [], itemCount: 1,
    });
    render(<CheckoutDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(packageCartStore.getSnapshot().sources).toHaveLength(1));
    expect(mem[CLEAR_KEY]).toBe('0');
  });

  it('clears the cart on success when checkbox is on', async () => {
    act(() => addOneSource());
    vi.spyOn(downloadModule, 'downloadPackage').mockResolvedValue({
      filename: 'a.zip', warnings: [], itemCount: 1,
    });
    render(<CheckoutDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByLabelText(/clear cart after successful download/i));
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(packageCartStore.getSnapshot().sources).toHaveLength(0));
    expect(mem[CLEAR_KEY]).toBe('1');
  });

  it('seeds the clear-on-success checkbox from localStorage', () => {
    mem[CLEAR_KEY] = '1';
    render(<CheckoutDialog open onOpenChange={() => {}} />);
    expect(screen.getByLabelText(/clear cart after successful download/i)).toBeChecked();
  });

  it('calls onError and leaves dialog open on a failed build', async () => {
    act(() => addOneSource());
    vi.spyOn(downloadModule, 'downloadPackage').mockRejectedValue(new Error('boom'));
    const onOpenChange = vi.fn();
    const onError = vi.fn();
    render(<CheckoutDialog open onOpenChange={onOpenChange} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('boom'));
    // onOpenChange should NOT have been called with false on failure
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
