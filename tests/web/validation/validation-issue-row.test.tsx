// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValidationIssueRow } from '@/components/validation/ValidationIssueRow';
import type { ValidationError } from '@/lib/types';

const baseIssue: ValidationError = {
  severity: 'error',
  rule: 'missing-id',
  message: 'Item is missing an ID',
  filePath: '/data/serialization/items/_roles/Editor.yml',
};

describe('ValidationIssueRow', () => {
  it('renders itemPath as primary and filePath as secondary when both exist', () => {
    render(
      <ValidationIssueRow
        issue={{
          ...baseIssue,
          itemId: '01b8917b-d36b-4fb1-91ad-017dfe055e55',
          itemPath: '/sitecore/content/Site/Home',
        }}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('/sitecore/content/Site/Home')).toBeInTheDocument();
    expect(screen.getByText('/data/serialization/items/_roles/Editor.yml')).toBeInTheDocument();
  });

  it('falls back to filePath as primary when itemPath is absent', () => {
    render(
      <ValidationIssueRow
        issue={{ ...baseIssue, itemId: '01b8917b-d36b-4fb1-91ad-017dfe055e55' }}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('/data/serialization/items/_roles/Editor.yml')).toBeInTheDocument();
    // Only one path on screen - no duplicate secondary line.
    expect(screen.getAllByText('/data/serialization/items/_roles/Editor.yml')).toHaveLength(1);
  });

  it('renders the primary as a clickable link when itemId is present', () => {
    const onNavigate = vi.fn();
    render(
      <ValidationIssueRow
        issue={{
          ...baseIssue,
          itemId: '01b8917b-d36b-4fb1-91ad-017dfe055e55',
          itemPath: '/sitecore/content/Site/Home',
        }}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '/sitecore/content/Site/Home' }));
    expect(onNavigate).toHaveBeenCalledWith('01b8917b-d36b-4fb1-91ad-017dfe055e55');
  });

  it('renders the primary as plain text (no button) when itemId is absent', () => {
    render(
      <ValidationIssueRow
        issue={{ ...baseIssue, itemPath: '/sitecore/content/Site/Home' }}
        onNavigate={vi.fn()}
      />,
    );
    // Path is visible.
    expect(screen.getByText('/sitecore/content/Site/Home')).toBeInTheDocument();
    // No clickable role with that name.
    expect(
      screen.queryByRole('button', { name: '/sitecore/content/Site/Home' }),
    ).not.toBeInTheDocument();
  });

  it('renders the rule message', () => {
    render(<ValidationIssueRow issue={baseIssue} onNavigate={vi.fn()} />);
    expect(screen.getByText('Item is missing an ID')).toBeInTheDocument();
  });

  it('never renders the literal "Unknown path" string', () => {
    render(<ValidationIssueRow issue={baseIssue} onNavigate={vi.fn()} />);
    expect(screen.queryByText(/Unknown path/i)).not.toBeInTheDocument();
  });

  // Regression: the YAML parser initializes ScsItem.path to '' (empty string)
  // for items that lack a Path: key (e.g., role YAMLs). The engine then
  // propagates that empty string into ValidationError.itemPath for missing-id
  // and missing-template errors. The component must treat an empty string as
  // "absent" and fall back to filePath, not render a blank primary line.
  it('treats empty-string itemPath as absent and falls back to filePath', () => {
    render(
      <ValidationIssueRow
        issue={{ ...baseIssue, itemPath: '' }}
        onNavigate={vi.fn()}
      />,
    );
    expect(screen.getByText('/data/serialization/items/_roles/Editor.yml')).toBeInTheDocument();
    // No duplicate secondary line - filePath is shown exactly once.
    expect(screen.getAllByText('/data/serialization/items/_roles/Editor.yml')).toHaveLength(1);
  });

  it('does not render an empty primary when itemPath is empty string with itemId present', () => {
    render(
      <ValidationIssueRow
        issue={{
          ...baseIssue,
          itemId: '01b8917b-d36b-4fb1-91ad-017dfe055e55',
          itemPath: '',
        }}
        onNavigate={vi.fn()}
      />,
    );
    // The clickable Button gets the filePath as its accessible name.
    expect(
      screen.getByRole('button', { name: '/data/serialization/items/_roles/Editor.yml' }),
    ).toBeInTheDocument();
  });
});
