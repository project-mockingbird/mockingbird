// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { RawYamlTab } from '../../../../src/web/components/detail/RawYamlTab';
import { api } from '../../../../src/web/lib/api';

describe('RawYamlTab', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }

  it('renders yaml content and the filePath footer for a disk item', async () => {
    vi.spyOn(api, 'getItemYaml').mockResolvedValue({
      yaml: 'ID: "abc-123"\nParent: "def-456"\n',
      filePath: '/data/serialization/foo/bar.yml',
    });

    render(<RawYamlTab itemId="abc-123" />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/\/data\/serialization\/foo\/bar\.yml/)).toBeInTheDocument();
    });
    // The yaml string is inside CodeMirror; assert via the document's text content
    // rather than role-based queries because CM renders into a non-semantic div.
    expect(document.body.textContent).toContain('ID:');
    expect(document.body.textContent).toContain('abc-123');
  });
});
