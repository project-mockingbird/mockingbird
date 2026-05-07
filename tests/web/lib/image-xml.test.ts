import { describe, it, expect } from 'vitest';
import {
  parseImageXml,
  serializeImageXml,
  type ParsedImage,
} from '@/lib/image-xml';

describe('parseImageXml', () => {
  it('returns null for empty / non-image strings', () => {
    expect(parseImageXml('')).toBeNull();
    expect(parseImageXml('  ')).toBeNull();
    expect(parseImageXml('<other />')).toBeNull();
  });

  it('returns null when the image tag has no mediaid', () => {
    expect(parseImageXml('<image alt="x" />')).toBeNull();
  });

  it('returns null for malformed XML (unclosed attribute quote)', () => {
    expect(parseImageXml('<image mediaid="abc')).toBeNull();
  });

  it('parses mediaid alone', () => {
    const r = parseImageXml('<image mediaid="{ABC-123}" />');
    expect(r).toEqual({ mediaid: 'abc-123' });
  });

  it('normalises mediaid: lowercase + brace-stripped', () => {
    const r = parseImageXml('<image mediaid="{ABCDEF12-3456-7890-ABCD-EF1234567890}" />');
    expect(r?.mediaid).toBe('abcdef12-3456-7890-abcd-ef1234567890');
  });

  it('parses all 7 per-usage attributes alongside mediaid', () => {
    const xml =
      '<image mediaid="{1}" alt="hi" width="100" height="50" hspace="2" vspace="3" class="hero" border="1" />';
    expect(parseImageXml(xml)).toEqual({
      mediaid: '1',
      alt: 'hi',
      width: '100',
      height: '50',
      hspace: '2',
      vspace: '3',
      cssClass: 'hero',
      border: '1',
    });
  });

  it('round-trips through serialize unchanged for the canonical attribute set', () => {
    const input: ParsedImage = {
      mediaid: 'abc',
      alt: 'hi',
      width: '100',
      height: '50',
      cssClass: 'hero',
    };
    const xml = serializeImageXml(input);
    expect(parseImageXml(xml)).toEqual(input);
  });
});

describe('serializeImageXml', () => {
  it('emits mediaid first, then alphabetical-by-attribute-name', () => {
    const xml = serializeImageXml({
      mediaid: 'abc',
      width: '100',
      alt: 'hi',
      height: '50',
      cssClass: 'hero',
    });
    expect(xml).toBe('<image mediaid="abc" alt="hi" class="hero" height="50" width="100" />');
  });

  it('omits empty / undefined attributes', () => {
    const xml = serializeImageXml({ mediaid: 'abc', alt: '', width: undefined });
    expect(xml).toBe('<image mediaid="abc" />');
  });

  it('emits all 7 per-usage attributes when present', () => {
    const xml = serializeImageXml({
      mediaid: 'abc',
      alt: 'hi',
      width: '100',
      height: '50',
      hspace: '2',
      vspace: '3',
      cssClass: 'hero',
      border: '1',
    });
    expect(xml).toBe(
      '<image mediaid="abc" alt="hi" border="1" class="hero" height="50" hspace="2" vspace="3" width="100" />',
    );
  });

  it('escapes quote characters in attribute values', () => {
    const xml = serializeImageXml({ mediaid: 'abc', alt: 'a"b' });
    expect(xml).toBe('<image mediaid="abc" alt="a&quot;b" />');
  });

  it('escapes angle brackets and ampersands in attribute values', () => {
    const xml = serializeImageXml({ mediaid: 'abc', alt: 'a<b&c>d' });
    expect(xml).toBe('<image mediaid="abc" alt="a&lt;b&amp;c&gt;d" />');
  });
});
