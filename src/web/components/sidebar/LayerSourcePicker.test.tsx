// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock FolderBrowser so tests can drive the file pick path directly.
// Captures the onFilePick prop and exposes it via a test-controlled button.
let lastOnFilePick: ((path: string, count: number, summary: string) => void) | null = null;
let lastOnClose: (() => void) | null = null;
vi.mock('@/components/open-project/FolderBrowser', () => ({
  FolderBrowser: (props: {
    open: boolean;
    onClose: () => void;
    onFilePick: (filePath: string, moduleCount: number, pushOpsSummary: string) => void;
  }) => {
    lastOnFilePick = props.onFilePick;
    lastOnClose = props.onClose;
    if (!props.open) return null;
    return (
      <div data-testid="folder-browser-stub">
        <button onClick={() => props.onFilePick('/picked/path/sitecore.json', 1, 'CRUD')}>
          stub-pick-default
        </button>
        <button onClick={props.onClose}>stub-cancel</button>
      </div>
    );
  },
}));

// Mock sonner toast so we can assert warning was called.
const toastWarning = vi.fn();
vi.mock('sonner', () => ({
  toast: { warning: (msg: string) => toastWarning(msg), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { LayerSourcePicker } from './LayerSourcePicker';

beforeEach(() => {
  lastOnFilePick = null;
  lastOnClose = null;
  toastWarning.mockReset();
});

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('<LayerSourcePicker> banner', () => {
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
});

describe('<LayerSourcePicker> add mode validation', () => {
  it('confirms a fresh path that is not already in existingPaths', () => {
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
    lastOnFilePick!('/ws/b/sitecore.json', 1, 'CRUD');
    expect(onConfirm).toHaveBeenCalledWith('/ws/b/sitecore.json');
    expect(onCancel).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('rejects a path already in existingPaths and toasts a warning', () => {
    const onConfirm = vi.fn();
    renderWith(
      <LayerSourcePicker
        open
        mode="add"
        existingPaths={['/ws/a/sitecore.json']}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    lastOnFilePick!('/ws/a/sitecore.json', 1, 'CRUD');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/already/i));
  });

  it('rejects a path whose derived name is "ootb" (case-insensitive)', () => {
    const onConfirm = vi.fn();
    renderWith(
      <LayerSourcePicker
        open
        mode="add"
        existingPaths={[]}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    lastOnFilePick!('/ws/ootb/sitecore.json', 1, 'CRUD');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/ootb/i));

    toastWarning.mockReset();
    lastOnFilePick!('/ws/OOTB/sitecore.json', 1, 'CRUD');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalled();
  });
});

describe('<LayerSourcePicker> replace mode validation', () => {
  it('re-picking the current path calls onCancel (noop)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWith(
      <LayerSourcePicker
        open
        mode="replace"
        currentPath="/ws/a/sitecore.json"
        existingPaths={['/ws/a/sitecore.json', '/ws/b/sitecore.json']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    lastOnFilePick!('/ws/a/sitecore.json', 1, 'CRUD');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('rejects picking a path that is another existing layer (not currentPath)', () => {
    const onConfirm = vi.fn();
    renderWith(
      <LayerSourcePicker
        open
        mode="replace"
        currentPath="/ws/a/sitecore.json"
        existingPaths={['/ws/a/sitecore.json', '/ws/b/sitecore.json']}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    lastOnFilePick!('/ws/b/sitecore.json', 1, 'CRUD');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(toastWarning).toHaveBeenCalled();
  });

  it('confirms a fresh path different from any existing layer', () => {
    const onConfirm = vi.fn();
    renderWith(
      <LayerSourcePicker
        open
        mode="replace"
        currentPath="/ws/a/sitecore.json"
        existingPaths={['/ws/a/sitecore.json', '/ws/b/sitecore.json']}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    lastOnFilePick!('/ws/c/sitecore.json', 1, 'CRUD');
    expect(onConfirm).toHaveBeenCalledWith('/ws/c/sitecore.json');
  });
});

describe('<LayerSourcePicker> Cancel button', () => {
  it('Cancel triggers onCancel without onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWith(
      <LayerSourcePicker
        open
        mode="add"
        existingPaths={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByText('stub-cancel'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});
