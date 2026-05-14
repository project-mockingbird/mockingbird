// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayerSourcePicker } from './LayerSourcePicker';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ path: '/', entries: [] }), { status: 200 }),
  );
});

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('<LayerSourcePicker>', () => {
  it('renders the mode banner for add mode', () => {
    renderWith(
      <LayerSourcePicker
        open
        mode="add"
        existingPaths={[]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('layer-source-picker-mode')).toHaveTextContent(/add a layer/i);
  });

  it('renders the mode banner for replace mode', () => {
    renderWith(
      <LayerSourcePicker
        open
        mode="replace"
        currentPath="/ws/a/sitecore.json"
        existingPaths={['/ws/a/sitecore.json']}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('layer-source-picker-mode')).toHaveTextContent(/replace layer source/i);
  });

  it('Cancel button closes via onCancel (no onConfirm call)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWith(
      <LayerSourcePicker
        open
        mode="add"
        existingPaths={['/ws/a/sitecore.json']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});
