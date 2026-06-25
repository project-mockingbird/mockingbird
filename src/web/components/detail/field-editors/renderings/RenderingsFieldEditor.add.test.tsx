// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RenderingsFieldEditor } from './RenderingsFieldEditor';
import type { RenderingEntry } from './types';

const hooks = vi.hoisted(() => ({
  useComposedLayout: vi.fn((): { data: unknown } => ({ data: undefined })),
  usePlaceholderPaths: vi.fn((): { data: unknown } => ({ data: undefined })),
  useRenderingMeta: vi.fn((): { data: unknown } => ({ data: undefined })),
}));
vi.mock('./hooks', () => hooks);

// Stub the dialog UI: clicking save returns an entry at the initialPlaceholder
// the editor handed it (mirrors AddRenderingDialog, which uses it verbatim).
vi.mock('./AddRenderingDialog', () => ({
  AddRenderingDialog: ({ initialPlaceholder, onSave }: { initialPlaceholder?: string; onSave: (e: RenderingEntry) => void }) => (
    <button
      type="button"
      data-testid="stub-add-save"
      onClick={() => onSave({ uid: '{ADDED}', renderingId: '{RICHTEXT}', placeholder: initialPlaceholder ?? '', dataSource: '', params: {} })}
    >
      stub add save
    </button>
  ),
}));
vi.mock('./EditRenderingDialog', () => ({ EditRenderingDialog: () => null }));
vi.mock('./ConfirmRemoveRenderingDialog', () => ({ ConfirmRemoveRenderingDialog: () => null }));
vi.mock('@/hooks/useNavState', () => ({
  useDialogRoute: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

function renderEditor(value: string, onChange: (v: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RenderingsFieldEditor
        fieldId="fr"
        label="__Final Renderings"
        value={value}
        contextItemId="page-1"
        editing
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
}

describe('RenderingsFieldEditor - add into a composed placeholder', () => {
  it('serializes a component to the page at the composed placeholder path verbatim', () => {
    const composedPath = '/headless-main/sxa-abc/container-1';
    hooks.useComposedLayout.mockReturnValue({
      data: { entries: [], placeholders: [{ value: composedPath, source: 'discovered' }] },
    });
    const onChange = vi.fn();
    renderEditor('', onChange);

    fireEvent.click(screen.getByLabelText(`Add rendering to ${composedPath}`));
    fireEvent.click(screen.getByTestId('stub-add-save'));

    const calls = onChange.mock.calls;
    const xml = calls[calls.length - 1][0] as string;
    // No de-composition: the composed (post-wrapper) path is stored verbatim.
    expect(xml).toContain(`s:ph="${composedPath}"`);
    expect(xml).toContain('s:id="{RICHTEXT}"');
  });
});
