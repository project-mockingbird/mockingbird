// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateBuilder } from './TemplateEditor';

vi.mock('@/hooks/useValidation', () => ({
  useFieldTypes: () => ({ data: ['Single-Line Text', 'Rich Text'] }),
}));

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('TemplateBuilder pending rows', () => {
  it('shows a staged section as a pending row immediately on Enter', () => {
    wrap(<TemplateBuilder sections={[]} onChanges={() => {}} />);
    const input = screen.getByPlaceholderText('Add a new section');
    fireEvent.change(input, { target: { value: 'Demo Section' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Demo Section')).toBeInTheDocument();
  });

  it('shows a staged field under its pending section', () => {
    wrap(<TemplateBuilder sections={[]} onChanges={() => {}} />);
    const sectionInput = screen.getByPlaceholderText('Add a new section');
    fireEvent.change(sectionInput, { target: { value: 'Data' } });
    fireEvent.keyDown(sectionInput, { key: 'Enter' });

    // A pending section exposes its own "Add a new field" input.
    const fieldInput = screen.getByPlaceholderText('Add a new field');
    fireEvent.change(fieldInput, { target: { value: 'Url' } });
    fireEvent.keyDown(fieldInput, { key: 'Enter' });
    expect(screen.getByText('Url')).toBeInTheDocument();
  });
});
