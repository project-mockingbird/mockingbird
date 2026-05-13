// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { LayerSelectionDialog } from './LayerSelectionDialog';
import type { LayerRowState } from './LayerSelectionDialog';

const CANDIDATES = [
  {
    sitecoreJsonPath: '/workspaces/repo/authoring/sitecore.json',
    moduleCount: 3,
    pushOpsSummary: 'CreateAndUpdate',
  },
  {
    sitecoreJsonPath: '/workspaces/repo/content/sitecore.json',
    moduleCount: 1,
    pushOpsSummary: 'CreateUpdateAndDelete',
  },
];

describe('LayerSelectionDialog', () => {
  it('renders one row per candidate with module count and push-ops summary', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('authoring/sitecore.json')).toBeInTheDocument();
    expect(screen.getByText('content/sitecore.json')).toBeInTheDocument();
    expect(screen.getByText(/3 modules/i)).toBeInTheDocument();
    expect(screen.getByText(/1 module(?!s)/i)).toBeInTheDocument();
    expect(screen.getByText(/CreateAndUpdate/)).toBeInTheDocument();
    expect(screen.getByText(/CreateUpdateAndDelete/)).toBeInTheDocument();
  });

  it('all candidates start checked', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) expect(cb).toBeChecked();
  });

  it('disables Open project when nothing is checked', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) fireEvent.click(cb);
    expect(screen.getByRole('button', { name: /open project/i })).toBeDisabled();
  });

  it('fires onConfirm with checked layers in order on submit', () => {
    const onConfirm = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open project/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.calls[0][0];
    expect(payload).toHaveLength(2);
    expect(payload[0].sitecoreJsonPath).toBe('/workspaces/repo/authoring/sitecore.json');
    expect(payload[0].name).toBe('authoring');
    expect(payload[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(payload[1].sitecoreJsonPath).toBe('/workspaces/repo/content/sitecore.json');
  });

  it('reorder-down moves a candidate after its successor', () => {
    const onConfirm = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getAllByLabelText('Move layer down')[0]);
    fireEvent.click(screen.getByRole('button', { name: /open project/i }));
    const payload = onConfirm.mock.calls[0][0];
    expect(payload[0].name).toBe('content');
    expect(payload[1].name).toBe('authoring');
  });

  it('shows a duplicate-overlap warning for nested candidates', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={[
          { sitecoreJsonPath: '/workspaces/repo/sitecore.json', moduleCount: 1, pushOpsSummary: '' },
          { sitecoreJsonPath: '/workspaces/repo/migration/sitecore.json', moduleCount: 1, pushOpsSummary: '' },
        ]}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/overlaps another candidate/i)).toBeInTheDocument();
  });

  it('renders "Add Layer" button when onAddAnother is provided', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
        onAddAnother={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /add layer/i })).toBeInTheDocument();
  });

  it('does not render "Add Layer" button when onAddAnother is omitted', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /add layer/i })).not.toBeInTheDocument();
  });

  it('fires onAddAnother when the button is clicked', () => {
    const onAddAnother = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
        onAddAnother={onAddAnother}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add layer/i }));
    expect(onAddAnother).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner glyph on the Open project button while isPending', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
        isPending
      />,
    );
    const openBtn = screen.getByRole('button', { name: /opening/i });
    expect(openBtn).toBeDisabled();
    expect(document.body.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('user can rename a layer inline before opening the project', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/p"
        candidates={[{ sitecoreJsonPath: '/p/sitecore.json', moduleCount: 1, pushOpsSummary: 'CreateUpdateAndDelete' }]}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByText('p'));
    const input = screen.getAllByRole('textbox')[0];
    await user.clear(input);
    await user.type(input, 'primary{Enter}');
    await user.click(screen.getByRole('button', { name: /open project/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'primary' })]),
    );
  });

  it('initialRows seeds state so a rename made before remount is preserved', async () => {
    // Simulate wizard passing down previously-edited rows on a second mount
    const seededRows: LayerRowState[] = [
      {
        candidate: { sitecoreJsonPath: '/workspaces/repo/authoring/sitecore.json', moduleCount: 3, pushOpsSummary: 'CreateAndUpdate' },
        checked: true,
        color: '#22c55e',
        name: 'my-custom-name',
      },
    ];
    const onConfirm = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={seededRows.map((r) => r.candidate)}
        initialRows={seededRows}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    // The custom name should appear rather than the auto-derived "authoring"
    expect(screen.getByText('my-custom-name')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open project/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'my-custom-name' })]),
    );
  });

  it('onRowsChange is called when a layer is renamed', async () => {
    const user = userEvent.setup();
    const onRowsChange = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={[{ sitecoreJsonPath: '/workspaces/repo/authoring/sitecore.json', moduleCount: 3, pushOpsSummary: 'CreateAndUpdate' }]}
        onClose={() => {}}
        onConfirm={() => {}}
        onRowsChange={onRowsChange}
      />,
    );
    await user.click(screen.getByText('authoring'));
    const input = screen.getAllByRole('textbox')[0];
    await user.clear(input);
    await user.type(input, 'renamed{Enter}');
    expect(onRowsChange).toHaveBeenCalled();
    const lastCall = onRowsChange.mock.calls[onRowsChange.mock.calls.length - 1][0] as LayerRowState[];
    expect(lastCall[0].name).toBe('renamed');
  });

  it('renders project name input when onProjectNameChange is provided', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
        projectName="my-project"
        onProjectNameChange={() => {}}
      />,
    );
    const input = screen.getByLabelText(/project name/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('my-project');
  });

  it('does not render project name input when onProjectNameChange is omitted', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/project name/i)).not.toBeInTheDocument();
  });

  it('calls onProjectNameChange when the project name input changes', async () => {
    const user = userEvent.setup();
    const onProjectNameChange = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
        projectName="initial"
        onProjectNameChange={onProjectNameChange}
      />,
    );
    const input = screen.getByLabelText(/project name/i);
    await user.clear(input);
    await user.type(input, 'renamed');
    expect(onProjectNameChange).toHaveBeenCalled();
  });

  it('renaming root-level "/sitecore.json" away from "layer" works (deriveName fix)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/"
        candidates={[{ sitecoreJsonPath: '/sitecore.json', moduleCount: 1, pushOpsSummary: 'CreateUpdateAndDelete' }]}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByText('layer'));
    const input = screen.getAllByRole('textbox')[0];
    await user.clear(input);
    await user.type(input, 'workspace-root{Enter}');
    await user.click(screen.getByRole('button', { name: /open project/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'workspace-root' })]),
    );
  });

  it('renders the save-as-profile input', () => {
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByLabelText(/save as profile/i)).toBeInTheDocument();
  });

  it('forwards the typed profile name via onConfirmProfile', () => {
    const onConfirmProfile = vi.fn();
    const onConfirm = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={onConfirm}
        onConfirmProfile={onConfirmProfile}
      />,
    );
    fireEvent.change(screen.getByLabelText(/save as profile/i), { target: { value: 'dev' } });
    fireEvent.click(screen.getByRole('button', { name: /open project/i }));
    expect(onConfirmProfile).toHaveBeenCalledWith('dev');
  });

  it('treats whitespace-only input as undefined', () => {
    const onConfirmProfile = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={() => {}}
        onConfirmProfile={onConfirmProfile}
      />,
    );
    fireEvent.change(screen.getByLabelText(/save as profile/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /open project/i }));
    expect(onConfirmProfile).toHaveBeenCalledWith(undefined);
  });

  it('emits onConfirmProfile only when onConfirmProfile is provided', () => {
    // Without onConfirmProfile prop, no crash; onConfirm still fires.
    const onConfirm = vi.fn();
    render(
      <LayerSelectionDialog
        open
        rootPath="/workspaces/repo"
        candidates={CANDIDATES}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /open project/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
