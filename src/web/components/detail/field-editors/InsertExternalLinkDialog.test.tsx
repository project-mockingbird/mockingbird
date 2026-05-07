// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InsertExternalLinkDialog } from './InsertExternalLinkDialog';

describe('InsertExternalLinkDialog', () => {
  it('renders title, description, and disabled Insert when URL is empty', () => {
    render(
      <InsertExternalLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
      />,
    );
    expect(screen.getByText('Insert External Link')).toBeInTheDocument();
    expect(screen.getByText(/Enter the URL/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();
  });

  it('enables Insert once URL is non-empty', () => {
    render(
      <InsertExternalLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com' } });
    expect(screen.getByRole('button', { name: 'Insert' })).toBeEnabled();
  });

  it('serializes external link XML on Insert', () => {
    const onInsert = vi.fn();
    render(
      <InsertExternalLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={onInsert}
        existing={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Learn more' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com' } });
    fireEvent.change(screen.getByLabelText('Style class'), { target: { value: 'btn' } });
    fireEvent.change(screen.getByLabelText('Alternate text'), { target: { value: 'go' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    const xml = onInsert.mock.calls[0][0] as string;
    expect(xml).toContain('linktype="external"');
    expect(xml).toContain('text="Learn more"');
    expect(xml).toContain('url="https://example.com"');
    expect(xml).toContain('class="btn"');
    expect(xml).toContain('title="go"');
  });

  it('pre-populates fields from existing external link', () => {
    render(
      <InsertExternalLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{
          linktype: 'external',
          url: 'https://google.com',
          text: 'Search',
          target: '_blank',
          title: 't',
          class: 'c',
        }}
      />,
    );
    expect(screen.getByLabelText('URL')).toHaveValue('https://google.com');
    expect(screen.getByLabelText('Description')).toHaveValue('Search');
    expect(screen.getByLabelText('Style class')).toHaveValue('c');
    expect(screen.getByLabelText('Alternate text')).toHaveValue('t');
  });

  it('starts blank when existing link is a different linktype', () => {
    render(
      <InsertExternalLinkDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{ linktype: 'anchor', anchor: 'top', text: 'jump' }}
      />,
    );
    expect(screen.getByLabelText('URL')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });
});
