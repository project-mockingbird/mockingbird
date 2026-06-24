// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InsertItemDialog } from '@/components/tree/InsertItemDialog';

describe('InsertItemDialog', () => {
  const baseProps = {
    open: true,
    templateName: 'Page',
    // A non-Template templateId keeps the base-template picker hidden (it only
    // shows when creating an actual Template definition), so these cases stay
    // focused on the name flow without needing a QueryClient.
    templateId: '11111111-1111-1111-1111-111111111111',
    parentPath: '/sitecore/content',
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    isPending: false,
  };

  it('pre-fills name with template display name (Sitecore CE parity)', () => {
    render(<InsertItemDialog {...baseProps} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Page');
  });

  it('disables OK when name is invalid', () => {
    render(<InsertItemDialog {...baseProps} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bad/Name' } });
    expect(screen.getByRole('button', { name: /create|ok/i })).toBeDisabled();
    expect(screen.getByText(/invalid characters/i)).toBeInTheDocument();
  });

  it('calls onConfirm with the name on OK', () => {
    const onConfirm = vi.fn();
    render(<InsertItemDialog {...baseProps} onConfirm={onConfirm} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'NewItem' } });
    fireEvent.click(screen.getByRole('button', { name: /create|ok/i }));
    // Non-template insert -> no base template passed.
    expect(onConfirm).toHaveBeenCalledWith('NewItem', undefined);
  });

  it('disables OK while pending', () => {
    render(<InsertItemDialog {...baseProps} isPending />);
    // While pending the OK button label flips to "Creating..." - match either.
    expect(screen.getByRole('button', { name: /create|ok|creating/i })).toBeDisabled();
  });
});
