// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayerRow } from './LayerRow';

describe('<LayerRow>', () => {
  const defaults = {
    layerName: 'authoring',
    effectiveCount: 340,
    color: '#22c55e',
    visible: true,
    onToggle: () => {},
    onRename: () => {},
    onRecolor: () => {},
  };

  it('renders name, count, and color swatch', () => {
    render(<LayerRow {...defaults} />);
    expect(screen.getByText('authoring')).toBeInTheDocument();
    expect(screen.getByText('340')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('toggle checkbox calls onToggle with new value', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<LayerRow {...defaults} onToggle={onToggle} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('ootbSubstrate disables the toggle and rename + shows substrate label', () => {
    render(<LayerRow {...defaults} layerName="OOTB Sitecore" ootbSubstrate />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText(/substrate/i)).toBeInTheDocument();
  });

  it('rename calls onRename', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<LayerRow {...defaults} onRename={onRename} />);
    await user.click(screen.getByText('authoring'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'edited{Enter}');
    expect(onRename).toHaveBeenCalledWith('edited');
  });
});
