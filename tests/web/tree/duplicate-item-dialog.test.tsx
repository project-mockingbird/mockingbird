// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DuplicateItemDialog } from '../../../src/web/components/tree/DuplicateItemDialog';

describe('DuplicateItemDialog', () => {
  it('pre-fills the name field with "<sourceName> (1)"', () => {
    render(
      <DuplicateItemDialog
        open
        sourceName="Foo"
        parentPath="/sitecore/content"
        siblings={['Foo']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Foo (1)');
  });

  it('auto-increments suffix when "(1)" already exists among siblings', () => {
    render(
      <DuplicateItemDialog
        open
        sourceName="Foo"
        parentPath="/sitecore/content"
        siblings={['Foo', 'Foo (1)']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Foo (2)');
  });

  it('shows validation error live as the user edits to a colliding name', () => {
    render(
      <DuplicateItemDialog
        open
        sourceName="Foo"
        parentPath="/sitecore/content"
        siblings={['Foo']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Foo' } });
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  });

  it('confirm button disabled while validation error present', () => {
    render(
      <DuplicateItemDialog
        open
        sourceName="Foo"
        parentPath="/sitecore/content"
        siblings={['Foo', 'Foo (1)', 'Foo (2)']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Foo' } });
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
  });

  it('fires onConfirm with the typed name on Enter', () => {
    const onConfirm = vi.fn();
    render(
      <DuplicateItemDialog
        open
        sourceName="Foo"
        parentPath="/sitecore/content"
        siblings={['Foo']}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith('Foo (1)');
  });

  it('surfaces a server error', () => {
    render(
      <DuplicateItemDialog
        open
        sourceName="Foo"
        parentPath="/sitecore/content"
        siblings={['Foo']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        serverError="Something blew up on the engine"
      />,
    );
    expect(screen.getByText(/blew up/)).toBeInTheDocument();
  });
});
