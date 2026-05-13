// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { EditableLayerName } from './EditableLayerName';

describe('<EditableLayerName>', () => {
  it('renders the value as text by default', () => {
    render(<EditableLayerName value="authoring" onChange={() => {}} />);
    expect(screen.getByText('authoring')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('clicking the text switches to an input', async () => {
    const user = userEvent.setup();
    render(<EditableLayerName value="authoring" onChange={() => {}} />);
    await user.click(screen.getByText('authoring'));
    expect(screen.getByRole('textbox')).toHaveValue('authoring');
  });

  it('Enter commits the value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EditableLayerName value="layer" onChange={onChange} />);
    await user.click(screen.getByText('layer'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'authoring{Enter}');
    expect(onChange).toHaveBeenCalledWith('authoring');
  });

  it('Escape cancels without committing', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EditableLayerName value="layer" onChange={onChange} />);
    await user.click(screen.getByText('layer'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'changed{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('layer')).toBeInTheDocument();
  });

  it('empty/whitespace value is rejected silently on commit', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EditableLayerName value="layer" onChange={onChange} />);
    await user.click(screen.getByText('layer'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '   {Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('layer')).toBeInTheDocument();
  });

  it('blur commits the trimmed value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<EditableLayerName value="layer" onChange={onChange} />);
    await user.click(screen.getByText('layer'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '  spaced  ');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('spaced');
  });

  it('disabled prop prevents click-to-edit', async () => {
    const user = userEvent.setup();
    render(<EditableLayerName value="locked" onChange={() => {}} disabled />);
    await user.click(screen.getByText('locked'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a hover-revealed Rename button that enters edit mode', async () => {
    const user = userEvent.setup();
    render(<EditableLayerName value="authoring" onChange={() => {}} />);
    const renameBtn = screen.getByRole('button', { name: /rename/i });
    expect(renameBtn).toBeInTheDocument();
    await user.click(renameBtn);
    expect(screen.getByRole('textbox')).toHaveValue('authoring');
  });

  it('disabled prop hides the Rename button', () => {
    render(<EditableLayerName value="locked" onChange={() => {}} disabled />);
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });
});
