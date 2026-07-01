// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddSerializationRootDialog } from '@/components/tree/AddSerializationRootDialog';

function renderDialog() {
  vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === '/api/serialization-roots' && (!init || init.method === undefined)) {
      return new Response(
        JSON.stringify({
          modules: [
            { filePath: '/ws/serialization/existing.module.json', namespace: 'Existing', includes: [] },
          ],
        }),
        { status: 200 },
      );
    }
    // dry-run POST and real POST
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return new Response(
      JSON.stringify({
        applied: !body.dryRun,
        willCreateFile: false,
        include: {},
        contents: '{}',
        warnings: [],
        targetFilePath: '/ws/serialization/existing.module.json',
      }),
      { status: 200 },
    );
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AddSerializationRootDialog
        open
        onOpenChange={() => {}}
        itemPath="/sitecore/system/Tasks/Commands"
        database="master"
      />
    </QueryClientProvider>,
  );
}

describe('AddSerializationRootDialog', () => {
  it('shows the path read-only and defaults scope to DescendantsOnly', async () => {
    renderDialog();
    expect(await screen.findByText('/sitecore/system/Tasks/Commands')).toBeInTheDocument();
    // DescendantsOnly is the default selected option - visible as the option text in the native select
    expect(screen.getByText('DescendantsOnly')).toBeInTheDocument();
  });

  it('lists discovered modules in the target select', async () => {
    renderDialog();
    await screen.findByText('/sitecore/system/Tasks/Commands');
    // Wait for the async modules query to resolve, then check the target select option is present
    expect(await screen.findByText(/Existing/)).toBeInTheDocument();
  });
});
