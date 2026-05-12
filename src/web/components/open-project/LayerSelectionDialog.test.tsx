// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LayerSelectionDialog } from './LayerSelectionDialog';

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
});
