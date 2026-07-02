// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RowActionIcons } from '../../../src/web/components/tree/RowActionIcons';

const baseProps = {
  isRegistry: false,
  onInsert: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
};

describe('RowActionIcons', () => {
  it('renders all three icons with accessible labels', () => {
    render(<RowActionIcons {...baseProps} />);
    expect(screen.getByRole('button', { name: /insert/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('renders nothing when isRegistry=true', () => {
    const { container } = render(<RowActionIcons {...baseProps} isRegistry />);
    expect(container.firstChild).toBeNull();
  });

  it('fires the insert handler on + click', () => {
    const onInsert = vi.fn();
    render(<RowActionIcons {...baseProps} onInsert={onInsert} />);
    fireEvent.click(screen.getByRole('button', { name: /insert/i }));
    expect(onInsert).toHaveBeenCalledOnce();
  });

  it('fires the duplicate handler on duplicate click', () => {
    const onDuplicate = vi.fn();
    render(<RowActionIcons {...baseProps} onDuplicate={onDuplicate} />);
    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it('fires the delete handler on trash click', () => {
    const onDelete = vi.fn();
    render(<RowActionIcons {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('stops click propagation so the row click handler does not fire', () => {
    const onInsert = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <RowActionIcons {...baseProps} onInsert={onInsert} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /insert/i }));
    expect(onInsert).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders only the Insert icon for an insertable registry node', () => {
    render(<RowActionIcons isRegistry insertable onInsert={() => {}} onDuplicate={() => {}} onRefresh={() => {}} onDelete={() => {}} />);
    expect(screen.getByLabelText('Insert')).toBeInTheDocument();
    expect(screen.queryByLabelText('Duplicate')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument();
  });

  it('renders nothing for an uncovered registry node', () => {
    const { container } = render(<RowActionIcons isRegistry insertable={false} onInsert={() => {}} onDuplicate={() => {}} onRefresh={() => {}} onDelete={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
