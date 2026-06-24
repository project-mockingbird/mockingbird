// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateBuilder, type TemplateBuilderHandle } from './TemplateEditor';

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

  it('flush() includes add-field/add-section text the user typed but never committed with Enter', () => {
    const ref = createRef<TemplateBuilderHandle>();
    wrap(<TemplateBuilder ref={ref} sections={[]} onChanges={() => {}} />);

    // Commit a section, then type a field name WITHOUT pressing Enter (the
    // exact sequence that silently dropped the field on Save).
    const sectionInput = screen.getByPlaceholderText('Add a new section');
    fireEvent.change(sectionInput, { target: { value: 'Data' } });
    fireEvent.keyDown(sectionInput, { key: 'Enter' });
    const fieldInput = screen.getByPlaceholderText('Add a new field');
    fireEvent.change(fieldInput, { target: { value: 'Url' } });

    const changes = ref.current!.flush();
    expect(changes.newSections).toContain('Data');
    expect(changes.newFields.map(f => f.name)).toContain('Url');
  });

  it('flush() also commits an uncommitted section name', () => {
    const ref = createRef<TemplateBuilderHandle>();
    wrap(<TemplateBuilder ref={ref} sections={[]} onChanges={() => {}} />);
    const sectionInput = screen.getByPlaceholderText('Add a new section');
    fireEvent.change(sectionInput, { target: { value: 'Loose Section' } });
    // no Enter
    const changes = ref.current!.flush();
    expect(changes.newSections).toContain('Loose Section');
  });

  it('reset() clears staged pending rows', () => {
    const ref = createRef<TemplateBuilderHandle>();
    wrap(<TemplateBuilder ref={ref} sections={[]} onChanges={() => {}} />);
    const sectionInput = screen.getByPlaceholderText('Add a new section');
    fireEvent.change(sectionInput, { target: { value: 'Data' } });
    fireEvent.keyDown(sectionInput, { key: 'Enter' });
    expect(screen.getByText('Data')).toBeInTheDocument();

    act(() => ref.current!.reset());
    expect(screen.queryByText('Data')).not.toBeInTheDocument();
  });
});
