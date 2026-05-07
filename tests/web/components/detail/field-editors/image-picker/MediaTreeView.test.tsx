// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MediaTreeView } from '@/components/detail/field-editors/image-picker/MediaTreeView';
import type { MediaTreeNode } from '@/components/detail/field-editors/image-picker/media-tree';

const tree: MediaTreeNode[] = [
  {
    id: 'a',
    name: 'A',
    path: '/r/A',
    template: 't',
    hasChildren: true,
    children: [
      { id: 'b', name: 'B', path: '/r/A/B', template: 't', hasChildren: false, children: [] },
      { id: 'c', name: 'Cat', path: '/r/A/Cat', template: 't', hasChildren: false, children: [] },
    ],
  },
  {
    id: 'd',
    name: 'D',
    path: '/r/D',
    template: 't',
    hasChildren: false,
    children: [],
  },
];

describe('MediaTreeView', () => {
  it('renders top-level nodes', () => {
    render(<MediaTreeView tree={tree} filter="" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('does not render children until expanded', () => {
    render(<MediaTreeView tree={tree} filter="" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />);
    expect(screen.queryByText('B')).toBeNull();
  });

  it('renders descendants for autoExpanded ancestors', () => {
    render(<MediaTreeView tree={tree} filter="" selectedId="b" onSelect={() => {}} autoExpandIds={new Set(['a'])} />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('toggles children visibility when expand chevron is clicked', () => {
    render(<MediaTreeView tree={tree} filter="" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />);
    fireEvent.click(screen.getByLabelText('Expand A'));
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('calls onSelect with the node when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<MediaTreeView tree={tree} filter="" selectedId={null} onSelect={onSelect} autoExpandIds={new Set()} />);
    fireEvent.click(screen.getByText('D'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'd' }));
  });

  it('marks the selected row visually', () => {
    render(<MediaTreeView tree={tree} filter="" selectedId="d" onSelect={() => {}} autoExpandIds={new Set()} />);
    const row = screen.getByText('D').closest('div');
    expect(row?.className).toContain('bg-primary/15');
  });

  it('filter narrows visible nodes case-insensitively, force-expanding ancestors', () => {
    render(<MediaTreeView tree={tree} filter="cat" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />);
    expect(screen.getByText('Cat')).toBeInTheDocument();
    expect(screen.queryByText('B')).toBeNull(); // sibling not matching
    expect(screen.queryByText('D')).toBeNull(); // top-level not matching
    expect(screen.getByText('A')).toBeInTheDocument(); // ancestor force-expanded
  });

  it('filter empty -> all top-level nodes visible again', () => {
    const { rerender } = render(
      <MediaTreeView tree={tree} filter="cat" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />
    );
    expect(screen.queryByText('D')).toBeNull();
    rerender(
      <MediaTreeView tree={tree} filter="" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />
    );
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('toggles back to collapsed when expand chevron is clicked twice', () => {
    render(<MediaTreeView tree={tree} filter="" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />);
    const chevron = screen.getByLabelText('Expand A');
    fireEvent.click(chevron);
    expect(screen.getByText('B')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Collapse A'));
    expect(screen.queryByText('B')).toBeNull();
  });

  it('merges autoExpandIds when the prop changes after mount', () => {
    const { rerender } = render(
      <MediaTreeView tree={tree} filter="" selectedId={null} onSelect={() => {}} autoExpandIds={new Set()} />
    );
    expect(screen.queryByText('B')).toBeNull();
    rerender(
      <MediaTreeView tree={tree} filter="" selectedId={null} onSelect={() => {}} autoExpandIds={new Set(['a'])} />
    );
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
