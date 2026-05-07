// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CartIcon } from '@/components/package/CartIcon';
import { packageCartStore } from '@/state/packageCartStore';

let mem: Record<string, string>;

describe('CartIcon', () => {
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
    vi.unstubAllGlobals();
  });

  it('renders nothing when cart is empty', () => {
    const { container } = render(<CartIcon onToggle={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('appears once at least one source is added and reflects the count', () => {
    const { rerender, container } = render(<CartIcon onToggle={() => {}} />);
    expect(container).toBeEmptyDOMElement();

    act(() => {
      packageCartStore.addSource({
        rootItemId: 'r1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants',
      });
    });
    rerender(<CartIcon onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /package cart/i })).toHaveTextContent('1');

    act(() => {
      packageCartStore.addSource({
        rootItemId: 'r2', rootItemPath: '/b', rootItemName: 'b', scope: 'itemAndChildren',
      });
    });
    rerender(<CartIcon onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /package cart/i })).toHaveTextContent('2');
  });

  it('calls onToggle when clicked', () => {
    act(() => {
      packageCartStore.addSource({
        rootItemId: 'r1', rootItemPath: '/a', rootItemName: 'a', scope: 'itemAndDescendants',
      });
    });
    const onToggle = vi.fn();
    render(<CartIcon onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /package cart/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
