// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InsertAnchorDialog } from './InsertAnchorDialog';

describe('InsertAnchorDialog', () => {
  it('renders title and disabled Insert button when Anchor is empty', () => {
    render(
      <InsertAnchorDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
      />,
    );
    expect(screen.getByText('Insert Anchor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert anchor' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('enables Insert once Anchor is non-empty', () => {
    render(
      <InsertAnchorDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('Anchor'), { target: { value: 'section-1' } });
    expect(screen.getByRole('button', { name: 'Insert anchor' })).toBeEnabled();
  });

  it('serializes both url and anchor with the same value (Sitecore CE legacy)', () => {
    const onInsert = vi.fn();
    render(
      <InsertAnchorDialog
        open
        onOpenChange={() => {}}
        onInsert={onInsert}
        existing={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Jump' } });
    fireEvent.change(screen.getByLabelText('Anchor'), { target: { value: 'top' } });
    fireEvent.change(screen.getByLabelText('Alternate text'), { target: { value: 'jump-to-top' } });
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'cta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert anchor' }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    const xml = onInsert.mock.calls[0][0] as string;
    expect(xml).toContain('linktype="anchor"');
    expect(xml).toContain('text="Jump"');
    expect(xml).toContain('url="top"');
    expect(xml).toContain('anchor="top"');
    expect(xml).toContain('title="jump-to-top"');
    expect(xml).toContain('class="cta"');
  });

  it('pre-populates fields from existing anchor link', () => {
    render(
      <InsertAnchorDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{ linktype: 'anchor', text: 'Videos', anchor: 'videos', title: 'go', class: 'nav' }}
      />,
    );
    expect(screen.getByLabelText('Text')).toHaveValue('Videos');
    expect(screen.getByLabelText('Anchor')).toHaveValue('videos');
    expect(screen.getByLabelText('Alternate text')).toHaveValue('go');
    expect(screen.getByLabelText('Style')).toHaveValue('nav');
  });

  it('starts blank when existing link is a different linktype', () => {
    render(
      <InsertAnchorDialog
        open
        onOpenChange={() => {}}
        onInsert={() => {}}
        existing={{ linktype: 'external', url: 'https://example.com', text: 'Foo' }}
      />,
    );
    expect(screen.getByLabelText('Text')).toHaveValue('');
    expect(screen.getByLabelText('Anchor')).toHaveValue('');
  });
});
