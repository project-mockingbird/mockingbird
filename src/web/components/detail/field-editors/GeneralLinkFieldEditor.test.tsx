// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  parseLinkXml,
  serializeLinkXml,
  serializeExternalLinkXml,
  serializeMediaLinkXml,
  serializeAnchorLinkXml,
  GeneralLinkFieldEditor,
} from './GeneralLinkFieldEditor';

const hookMocks = vi.hoisted(() => ({
  useItem: vi.fn(() => ({ data: undefined })),
  useTree: vi.fn(() => ({ data: [], isLoading: false })),
  useChildren: vi.fn(() => ({ data: [], isLoading: false })),
  useAncestors: vi.fn(() => ({ data: [], isLoading: false })),
  useLookupSource: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  useItemByPath: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

vi.mock('@/hooks/useItems', () => hookMocks);

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('serializeLinkXml', () => {
  it('writes all 8 internal-link attributes in canonical order', () => {
    const xml = serializeLinkXml({
      text: 'View More',
      anchor: 'section-2',
      target: '_blank',
      title: 'tooltip text',
      class: 'btn btn-primary',
      querystring: 'foo=bar',
      id: '7617674a-5874-4d45-803e-b51bbfcdf8b2',
    });
    expect(xml).toBe(
      '<link text="View More" linktype="internal" anchor="section-2" querystring="foo=bar" title="tooltip text" class="btn btn-primary" target="_blank" id="{7617674A-5874-4D45-803E-B51BBFCDF8B2}" />'
    );
  });

  it('writes empty-string values for absent fields (matches Sitecore behavior)', () => {
    const xml = serializeLinkXml({
      text: '',
      anchor: '',
      target: '',
      title: '',
      class: '',
      querystring: '',
      id: '7617674a-5874-4d45-803e-b51bbfcdf8b2',
    });
    expect(xml).toBe(
      '<link text="" linktype="internal" anchor="" querystring="" title="" class="" target="" id="{7617674A-5874-4D45-803E-B51BBFCDF8B2}" />'
    );
  });

  it('escapes XML-significant characters in attribute values', () => {
    const xml = serializeLinkXml({
      text: 'A & B <c> "d"',
      anchor: '',
      target: '',
      title: 'tip & tricks',
      class: '',
      querystring: 'q=a&b=c',
      id: '7617674a-5874-4d45-803e-b51bbfcdf8b2',
    });
    expect(xml).toContain('text="A &amp; B &lt;c&gt; &quot;d&quot;"');
    expect(xml).toContain('title="tip &amp; tricks"');
    expect(xml).toContain('querystring="q=a&amp;b=c"');
  });

  it('strips leading ? from querystring', () => {
    const xml = serializeLinkXml({
      text: '', anchor: '', target: '', title: '', class: '',
      querystring: '?foo=bar',
      id: '7617674a-5874-4d45-803e-b51bbfcdf8b2',
    });
    expect(xml).toContain('querystring="foo=bar"');
  });

  it('produces braced uppercase ID format', () => {
    const xml = serializeLinkXml({
      text: '', anchor: '', target: '', title: '', class: '', querystring: '',
      id: '{7617674a-5874-4d45-803e-b51bbfcdf8b2}',
    });
    expect(xml).toContain('id="{7617674A-5874-4D45-803E-B51BBFCDF8B2}"');
  });

  it('always writes linktype="internal"', () => {
    const xml = serializeLinkXml({
      text: '', anchor: '', target: '', title: '', class: '', querystring: '',
      id: '7617674a-5874-4d45-803e-b51bbfcdf8b2',
    });
    expect(xml).toContain('linktype="internal"');
  });
});

describe('parseLinkXml ↔ serializeLinkXml round-trip', () => {
  it('round-trips the content tree example shape', () => {
    const original = '<link text="View More" anchor="" linktype="internal" class="small-p-1" title="" target="" querystring="" id="{7617674A-5874-4D45-803E-B51BBFCDF8B2}" />';
    const parsed = parseLinkXml(original);
    expect(parsed).not.toBeNull();
    const re = serializeLinkXml({
      text: parsed!.text ?? '',
      anchor: parsed!.anchor ?? '',
      target: parsed!.target ?? '',
      title: parsed!.title ?? '',
      class: parsed!.class ?? '',
      querystring: parsed!.querystring ?? '',
      id: parsed!.id ?? '',
    });
    const reparsed = parseLinkXml(re);
    expect(reparsed?.text).toBe('View More');
    expect(reparsed?.linktype).toBe('internal');
    expect(reparsed?.class).toBe('small-p-1');
    expect(reparsed?.id).toBe('7617674a-5874-4d45-803e-b51bbfcdf8b2');
  });
});

describe('serializeExternalLinkXml', () => {
  it('writes the external-link attributes with linktype=external', () => {
    const xml = serializeExternalLinkXml({
      text: 'Search',
      url: 'https://google.com',
      target: '_blank',
      title: 'go',
      class: 'btn',
    });
    expect(xml).toContain('linktype="external"');
    expect(xml).toContain('text="Search"');
    expect(xml).toContain('url="https://google.com"');
    expect(xml).toContain('target="_blank"');
    expect(xml).toContain('title="go"');
    expect(xml).toContain('class="btn"');
    expect(xml).toContain('anchor=""');
    expect(xml).not.toContain('id=');
  });

  it('xml-escapes ampersands in URLs', () => {
    const xml = serializeExternalLinkXml({
      text: '', url: 'https://x.com/?a=1&b=2', target: '', title: '', class: '',
    });
    expect(xml).toContain('url="https://x.com/?a=1&amp;b=2"');
  });
});

describe('serializeMediaLinkXml', () => {
  it('writes the media-link attributes with linktype=media and braced id', () => {
    const xml = serializeMediaLinkXml({
      text: 'Brochure',
      target: '_blank',
      title: '',
      class: '',
      id: '5ab9d200-c798-41d9-ad18-02ed491996d1',
    });
    expect(xml).toContain('linktype="media"');
    expect(xml).toContain('text="Brochure"');
    expect(xml).toContain('target="_blank"');
    expect(xml).toContain('id="{5AB9D200-C798-41D9-AD18-02ED491996D1}"');
    expect(xml).not.toContain('url=');
    expect(xml).not.toContain('anchor=');
  });
});

describe('serializeAnchorLinkXml', () => {
  it('writes both url and anchor attributes with the same value', () => {
    const xml = serializeAnchorLinkXml({
      text: 'Videos', anchor: 'videos', title: '', class: '',
    });
    expect(xml).toContain('linktype="anchor"');
    expect(xml).toContain('text="Videos"');
    expect(xml).toContain('url="videos"');
    expect(xml).toContain('anchor="videos"');
    expect(xml).not.toContain('target=');
    expect(xml).not.toContain('id=');
  });

  it('round-trips a content tree anchor link via parseLinkXml', () => {
    const original = '<link text="Videos" linktype="anchor" url="videos" anchor="videos" title="" class="" />';
    const parsed = parseLinkXml(original);
    const re = serializeAnchorLinkXml({
      text: parsed!.text ?? '',
      anchor: parsed!.anchor ?? '',
      title: parsed!.title ?? '',
      class: parsed!.class ?? '',
    });
    const reparsed = parseLinkXml(re);
    expect(reparsed?.linktype).toBe('anchor');
    expect(reparsed?.anchor).toBe('videos');
    expect(reparsed?.url).toBe('videos');
    expect(reparsed?.text).toBe('Videos');
  });
});

describe('GeneralLinkFieldEditor Insert link integration', () => {
  it('Insert link button is enabled (not stubbed)', () => {
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Insert link' })).toBeEnabled();
  });

  it('clicking Insert link opens the InsertLinkDialog', () => {
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Insert Link')).toBeInTheDocument();
  });

  it('threads fieldSource and contextItemId into the dialog (useLookupSource receives them)', () => {
    hookMocks.useLookupSource.mockClear();
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        fieldSource="query:$linkableHomes"
        contextItemId="aaaa1111-2222-3333-4444-555555555555"
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
    // Dialog mounts on open; useLookupSource is called inside InsertLinkDialog
    // with the threaded source and context-item id.
    expect(hookMocks.useLookupSource).toHaveBeenCalledWith(
      'query:$linkableHomes',
      'aaaa1111-2222-3333-4444-555555555555',
    );
  });

  it('falls back to empty source when fieldSource is omitted (existing behaviour)', () => {
    hookMocks.useLookupSource.mockClear();
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
    expect(hookMocks.useLookupSource).toHaveBeenCalledWith('', undefined);
  });

  it('exposes Insert media link / Insert external link / Insert anchor toolbar buttons', () => {
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Insert media link' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Insert external link' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Insert anchor' })).toBeEnabled();
  });

  it('does not render Insert email or Insert JavaScript buttons', () => {
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Insert email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Insert JavaScript' })).toBeNull();
  });

  it('clicking Insert external link opens the InsertExternalLinkDialog', () => {
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert external link' }));
    expect(screen.getByText('Insert External Link')).toBeInTheDocument();
  });

  it('clicking Insert anchor opens the InsertAnchorDialog', () => {
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert anchor' }));
    expect(screen.getByText('Insert Anchor')).toBeInTheDocument();
  });

  it('clicking Insert media link opens the InsertMediaLinkDialog', () => {
    wrap(
      <GeneralLinkFieldEditor
        fieldId="{12345678-1234-1234-1234-123456789012}"
        label="Link"
        value=""
        editing
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert media link' }));
    expect(screen.getByText('Insert Media Link')).toBeInTheDocument();
  });
});
