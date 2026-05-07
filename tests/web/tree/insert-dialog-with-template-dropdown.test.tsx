// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { InsertDialogWithTemplateDropdown } from '@/components/tree/InsertDialogWithTemplateDropdown';
import * as useInsertOptionsModule from '@/hooks/useInsertOptions';

const FAKE_OPTIONS = [
  { templateId: 'tpl-1', templateName: 'PageItem', templatePath: '/sitecore/templates/PageItem', kind: 'template' as const },
  { templateId: 'tpl-2', templateName: 'BranchA', templatePath: '/sitecore/templates/branches/BranchA', kind: 'branch' as const },
];

describe('InsertDialogWithTemplateDropdown', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.restoreAllMocks();
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);

  it('displays the parent path as a read-only label', () => {
    vi.spyOn(useInsertOptionsModule, 'useInsertOptions').mockReturnValue({
      data: { options: FAKE_OPTIONS },
      isLoading: false,
    } as any);

    render(
      <InsertDialogWithTemplateDropdown
        open
        parentId="parent-id"
        parentPath="/sitecore/content/Foo/Bar"
        siblings={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.getByText('/sitecore/content/Foo/Bar')).toBeInTheDocument();
  });

  it('lazy-fetches options when open=true', () => {
    const spy = vi.spyOn(useInsertOptionsModule, 'useInsertOptions').mockReturnValue({
      data: { options: FAKE_OPTIONS },
      isLoading: false,
    } as any);

    render(
      <InsertDialogWithTemplateDropdown
        open
        parentId="parent-id"
        parentPath="/sitecore/content/Parent"
        siblings={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    expect(spy).toHaveBeenCalledWith('parent-id', true);
  });

  it('does not fetch when open=false', () => {
    const spy = vi.spyOn(useInsertOptionsModule, 'useInsertOptions').mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    render(
      <InsertDialogWithTemplateDropdown
        open={false}
        parentId="parent-id"
        parentPath="/sitecore/content/Parent"
        siblings={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );
    expect(spy).toHaveBeenCalledWith('parent-id', false);
  });

  it('renders the templates as dropdown options', async () => {
    vi.spyOn(useInsertOptionsModule, 'useInsertOptions').mockReturnValue({
      data: { options: FAKE_OPTIONS },
      isLoading: false,
    } as any);

    render(
      <InsertDialogWithTemplateDropdown
        open
        parentId="parent-id"
        parentPath="/sitecore/content/Parent"
        siblings={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'PageItem' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'BranchA' })).toBeInTheDocument();
    });
  });

  it('pre-fills the name from the selected template', async () => {
    vi.spyOn(useInsertOptionsModule, 'useInsertOptions').mockReturnValue({
      data: { options: FAKE_OPTIONS },
      isLoading: false,
    } as any);

    render(
      <InsertDialogWithTemplateDropdown
        open
        parentId="parent-id"
        parentPath="/sitecore/content/Parent"
        siblings={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    const nameInput = await screen.findByRole('textbox') as HTMLInputElement;
    expect(nameInput.value).toBe('PageItem');

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'tpl-2' } });
    expect(nameInput.value).toBe('BranchA');
  });

  it('fires onConfirm with templateId + name on Create', async () => {
    vi.spyOn(useInsertOptionsModule, 'useInsertOptions').mockReturnValue({
      data: { options: FAKE_OPTIONS },
      isLoading: false,
    } as any);
    const onConfirm = vi.fn();
    render(
      <InsertDialogWithTemplateDropdown
        open
        parentId="parent-id"
        parentPath="/sitecore/content/Parent"
        siblings={[]}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
      { wrapper },
    );

    const button = await screen.findByRole('button', { name: /create/i });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith({ templateId: 'tpl-1', name: 'PageItem' });
  });

  it('shows Loading... while fetching', () => {
    vi.spyOn(useInsertOptionsModule, 'useInsertOptions').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);
    render(
      <InsertDialogWithTemplateDropdown
        open
        parentId="parent-id"
        parentPath="/sitecore/content/Parent"
        siblings={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
