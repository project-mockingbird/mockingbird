/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorSwatch } from './ColorSwatch';
import { LAYER_COLOR_PALETTE } from '@/components/open-project/layer-colors';

describe('<ColorSwatch>', () => {
  it('renders a button with the current color as background', () => {
    render(<ColorSwatch value="#22c55e" onChange={() => {}} />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(window.getComputedStyle(btn).backgroundColor).toBe('rgb(34, 197, 94)');
  });

  it('clicking cycles to the next palette color', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorSwatch value={LAYER_COLOR_PALETTE[0]} onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(LAYER_COLOR_PALETTE[1]);
  });

  it('clicking the last palette color wraps to the first', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorSwatch value={LAYER_COLOR_PALETTE[LAYER_COLOR_PALETTE.length - 1]} onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(LAYER_COLOR_PALETTE[0]);
  });

  it('off-palette color cycles to palette[0]', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorSwatch value="#abcdef" onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(LAYER_COLOR_PALETTE[0]);
  });

  it('disabled prop suppresses click cycling', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorSwatch value={LAYER_COLOR_PALETTE[0]} onChange={onChange} disabled />);
    await user.click(screen.getByRole('button'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
