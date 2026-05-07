// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useTreeKeyboardNav } from '../../../src/web/components/tree/useTreeKeyboardNav';

/**
 * Regression net for the bug where typing Space (or Enter) into a Radix
 * Dialog input rendered inside a tree node was eaten by the tree's
 * keyboard-nav handler. React's synthetic events bubble up the React tree
 * across portals, so a Dialog input that lives under a tree-row in JSX
 * still routes keystrokes through the tree container's `onKeyDown`. The
 * hook now bails early when the event target is editable.
 */
function Harness({ onActivate }: { onActivate: (id: string) => void }) {
  const kb = useTreeKeyboardNav({
    initialFocusedId: 'row-1',
    onActivate,
    onExpand: () => {},
    onCollapse: () => {},
  });
  return (
    <div {...kb.containerProps} data-testid="tree-container">
      <div data-tree-row-id="row-1" data-tree-level="0" tabIndex={0}>
        <input data-testid="dialog-input" type="text" />
      </div>
    </div>
  );
}

describe('useTreeKeyboardNav - editable-target bail', () => {
  it('does not call preventDefault on Space when the event originates from an input', () => {
    let activateCalls = 0;
    const onActivate = () => { activateCalls++; };
    const { getByTestId } = render(<Harness onActivate={onActivate} />);
    const input = getByTestId('dialog-input');
    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(false);
    expect(activateCalls).toBe(0);
  });

  it('does not call preventDefault on Enter when the event originates from an input', () => {
    let activateCalls = 0;
    const onActivate = () => { activateCalls++; };
    const { getByTestId } = render(<Harness onActivate={onActivate} />);
    const input = getByTestId('dialog-input');
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(activateCalls).toBe(0);
  });

  it('does not eat ArrowDown when the event originates from a textarea', () => {
    function HarnessWithTextarea() {
      const kb = useTreeKeyboardNav({
        initialFocusedId: 'row-1',
        onActivate: () => {},
        onExpand: () => {},
        onCollapse: () => {},
      });
      return (
        <div {...kb.containerProps}>
          <div data-tree-row-id="row-1" data-tree-level="0" tabIndex={0} />
          <div data-tree-row-id="row-2" data-tree-level="0" tabIndex={0}>
            <textarea data-testid="dialog-textarea" />
          </div>
        </div>
      );
    }
    const { getByTestId } = render(<HarnessWithTextarea />);
    const textarea = getByTestId('dialog-textarea');
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('still handles tree-nav keys when the event target is not editable', () => {
    let activateCalls = 0;
    const onActivate = () => { activateCalls++; };
    const { getByTestId } = render(
      <Harness onActivate={onActivate} />,
    );
    // Dispatch on the tree row itself (not on the input inside it).
    const row = getByTestId('tree-container').querySelector('[data-tree-row-id="row-1"]')!;
    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    row.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(activateCalls).toBe(1);
  });
});
