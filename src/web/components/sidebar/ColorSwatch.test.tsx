/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ColorSwatch } from './ColorSwatch';
import { LAYER_COLOR_PALETTE } from '@/components/open-project/layer-colors';

describe('<ColorSwatch>', () => {
  it('renders a trigger button with the current color as background', () => {
    render(<ColorSwatch value="#22c55e" onChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /pick layer color/i });
    expect(window.getComputedStyle(btn).backgroundColor).toBe('rgb(34, 197, 94)');
  });

  it('clicking the trigger opens the palette popover', async () => {
    const user = userEvent.setup();
    render(<ColorSwatch value={LAYER_COLOR_PALETTE[0]} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /use color/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /pick layer color/i }));
    expect(screen.getByRole('button', { name: `Use color ${LAYER_COLOR_PALETTE[0]}` })).toBeInTheDocument();
  });

  it('clicking a palette swatch fires onChange with that color', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorSwatch value={LAYER_COLOR_PALETTE[0]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /pick layer color/i }));
    await user.click(screen.getByRole('button', { name: `Use color ${LAYER_COLOR_PALETTE[2]}` }));
    expect(onChange).toHaveBeenCalledWith(LAYER_COLOR_PALETTE[2]);
  });

  it('disabled trigger does not open the popover', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorSwatch value={LAYER_COLOR_PALETTE[0]} onChange={onChange} disabled />);
    const trigger = screen.getByRole('button', { name: /pick layer color/i });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('button', { name: /use color/i })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
