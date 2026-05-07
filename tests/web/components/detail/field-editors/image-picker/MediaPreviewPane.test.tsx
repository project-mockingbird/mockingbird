// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MediaPreviewPane } from '@/components/detail/field-editors/image-picker/MediaPreviewPane';
import * as engineStatusModule from '@/hooks/useEngineStatus';

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe('MediaPreviewPane', () => {
  beforeEach(() => {
    vi.spyOn(engineStatusModule, 'useEngineReady').mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders empty-state copy when itemId is null', () => {
    render(withClient(<MediaPreviewPane itemId={null} />));
    expect(screen.getByText(/no image selected/i)).toBeInTheDocument();
  });

  it('renders thumbnail + path + dimensions when item resolves', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'm1',
        name: 'Hero',
        path: '/sitecore/media library/project/hero',
        sharedFields: [
          { id: '22eac599-f13b-4607-a89d-c091763a467d', value: '1920' },
          { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', value: '1080' },
          { id: '65885c44-8fcd-4a7f-94f1-ee63703fe193', value: 'Marketing hero' },
          { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', value: 'jpg' },
        ],
      }),
    }) as unknown as typeof fetch;
    render(withClient(<MediaPreviewPane itemId="m1" />));
    await waitFor(() => expect(screen.getByText(/project\/hero/)).toBeInTheDocument());
    expect(screen.getByText(/1920 x 1080/)).toBeInTheDocument();
    expect(screen.getByText(/Marketing hero/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('/-/media/project/hero.jpg'));
  });

  it('shows loading state while item is resolving', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(withClient(<MediaPreviewPane itemId="m1" />));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
