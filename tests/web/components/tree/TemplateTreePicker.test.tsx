// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateTreePicker } from '../../../../src/web/components/tree/insert-from-template/TemplateTreePicker';
import type { TemplateMeta } from '../../../../src/web/lib/types';

const TEMPLATE = 'ab86861a-6030-46c5-b394-e8f99e8b87db';
const BRANCH = '35e75c72-4985-4e09-88c3-0eac6cd1e64f';
const TEMPLATE_FOLDER = '0437fee2-44c9-46a6-abe9-28858d9fee8c';

const fixture: TemplateMeta[] = [
  { id: '{P}', name: 'Project', displayName: 'Project', path: '/sitecore/templates/Project', template: TEMPLATE_FOLDER },
  { id: '{F}', name: 'FooTpl', displayName: 'FooTpl', path: '/sitecore/templates/Project/FooTpl', template: TEMPLATE },
  { id: '{B}', name: 'BarBranch', displayName: 'BarBranch', path: '/sitecore/templates/Project/BarBranch', template: BRANCH },
];

describe('TemplateTreePicker', () => {
  it('renders folders and leaves', () => {
    render(<TemplateTreePicker templates={fixture} selectedId="" onSelect={() => {}} filter="" />);
    // Project is a folder; expand it to see children.
    fireEvent.click(screen.getByText('Project'));
    expect(screen.getByText('FooTpl')).toBeInTheDocument();
    // Branch leaf shows [branch] suffix. The suffix is a nested muted span,
    // so use a function matcher that checks combined textContent.
    expect(
      screen.getByText((_, el) =>
        el?.tagName === 'SPAN' && /BarBranch.*\[branch\]/.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<TemplateTreePicker templates={[]} selectedId="" onSelect={() => {}} filter="" isLoading />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows empty message when no templates', () => {
    render(<TemplateTreePicker templates={[]} selectedId="" onSelect={() => {}} filter="" emptyMessage="None." />);
    expect(screen.getByText('None.')).toBeInTheDocument();
  });

  it('calls onSelect with templateId when a leaf is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateTreePicker templates={fixture} selectedId="" onSelect={onSelect} filter="" />);
    fireEvent.click(screen.getByText('Project'));
    fireEvent.click(screen.getByText('FooTpl'));
    expect(onSelect).toHaveBeenCalledWith('{F}');
  });

  it('does not call onSelect when a folder is clicked (toggles instead)', () => {
    const onSelect = vi.fn();
    render(<TemplateTreePicker templates={fixture} selectedId="" onSelect={onSelect} filter="" />);
    fireEvent.click(screen.getByText('Project'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('filter narrows the visible tree to matching leaves and their ancestors', () => {
    render(<TemplateTreePicker templates={fixture} selectedId="" onSelect={() => {}} filter="foo" />);
    // FooTpl matches; ancestors auto-expand.
    expect(screen.getByText('FooTpl')).toBeInTheDocument();
    // BarBranch does not match - should not be visible.
    expect(screen.queryByText(/BarBranch/)).not.toBeInTheDocument();
  });

  it('filter matches case-insensitively against displayName', () => {
    render(<TemplateTreePicker templates={fixture} selectedId="" onSelect={() => {}} filter="FOOTPL" />);
    expect(screen.getByText('FooTpl')).toBeInTheDocument();
  });

  it('filter matches against path as well as displayName', () => {
    // "branch" only appears in displayName + path of BarBranch; "Project" appears in
    // path of all three. Filtering by "Project" should keep matches visible.
    render(<TemplateTreePicker templates={fixture} selectedId="" onSelect={() => {}} filter="Project" />);
    expect(screen.getByText('FooTpl')).toBeInTheDocument();
    expect(screen.getByText(/BarBranch/)).toBeInTheDocument();
  });
});
