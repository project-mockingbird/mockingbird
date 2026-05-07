// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { InsertFromTemplateDialog } from '../../../../src/web/components/tree/InsertFromTemplateDialog';
import { api } from '../../../../src/web/lib/api';

vi.mock('../../../../src/web/hooks/useEngineStatus', () => ({
  useEngineReady: () => true,
}));

const TEMPLATE = 'ab86861a-6030-46c5-b394-e8f99e8b87db';

describe('InsertFromTemplateDialog', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(api, 'getAllTemplates').mockResolvedValue({
      templates: [
        {
          id: '{F00}',
          name: 'FooTpl',
          displayName: 'FooTpl',
          path: '/sitecore/templates/Project/FooTpl',
          template: TEMPLATE,
        },
      ],
    });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }

  it('renders parent path read-only', () => {
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByText('/sitecore/content/Foo')).toBeInTheDocument();
  });

  it('disables Create until template + name are both present', async () => {
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    const create = screen.getByRole('button', { name: /create/i });
    expect(create).toBeDisabled();
    await waitFor(() => screen.getByText('FooTpl'));
    fireEvent.click(screen.getByText('FooTpl'));
    expect(create).not.toBeDisabled();
  });

  it('pre-fills name with template displayName on selection', async () => {
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    await waitFor(() => screen.getByText('FooTpl'));
    fireEvent.click(screen.getByText('FooTpl'));
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('FooTpl');
  });

  it('does not overwrite a user-typed name on subsequent template selection', async () => {
    vi.spyOn(api, 'getAllTemplates').mockResolvedValue({
      templates: [
        { id: '{F00}', name: 'FooTpl', displayName: 'FooTpl', path: '/sitecore/templates/Project/FooTpl', template: TEMPLATE },
        { id: '{B00}', name: 'BarTpl', displayName: 'BarTpl', path: '/sitecore/templates/Project/BarTpl', template: TEMPLATE },
      ],
    });
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    await waitFor(() => screen.getByText('FooTpl'));
    fireEvent.click(screen.getByText('FooTpl'));
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('FooTpl');
    fireEvent.change(nameInput, { target: { value: 'TypedByUser' } });
    expect(nameInput.value).toBe('TypedByUser');
    fireEvent.click(screen.getByText('BarTpl'));
    expect(nameInput.value).toBe('TypedByUser');
  });

  it('surfaces sibling-collision validation error', async () => {
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={['FooTpl']}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    await waitFor(() => screen.getByText('FooTpl'));
    fireEvent.click(screen.getByText('FooTpl'));
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
  });

  it('calls onConfirm with templateId + name on Create', async () => {
    const onConfirm = vi.fn();
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={[]}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
      { wrapper },
    );
    await waitFor(() => screen.getByText('FooTpl'));
    fireEvent.click(screen.getByText('FooTpl'));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onConfirm).toHaveBeenCalledWith({ templateId: '{F00}', name: 'FooTpl' });
  });

  it('shows server error when provided', async () => {
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={[]}
        onConfirm={() => {}}
        onClose={() => {}}
        serverError="Something went wrong on the server"
      />,
      { wrapper },
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('filter narrows the picker', async () => {
    vi.spyOn(api, 'getAllTemplates').mockResolvedValue({
      templates: [
        { id: '{F}', name: 'FooTpl', displayName: 'FooTpl', path: '/sitecore/templates/Project/FooTpl', template: TEMPLATE },
        { id: '{B}', name: 'BarTpl', displayName: 'BarTpl', path: '/sitecore/templates/Project/BarTpl', template: TEMPLATE },
      ],
    });
    render(
      <InsertFromTemplateDialog
        open
        parentPath="/sitecore/content/Foo"
        siblings={[]}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    await waitFor(() => screen.getByText('FooTpl'));
    expect(screen.getByText('BarTpl')).toBeInTheDocument();
    const filter = screen.getByLabelText(/filter/i) as HTMLInputElement;
    fireEvent.change(filter, { target: { value: 'foo' } });
    await waitFor(() => {
      expect(screen.getByText('FooTpl')).toBeInTheDocument();
      expect(screen.queryByText('BarTpl')).not.toBeInTheDocument();
    });
  });
});
