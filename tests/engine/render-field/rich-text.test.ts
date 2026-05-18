import { describe, it, expect } from 'vitest';
import { rewriteRichText } from '../../../src/engine/render-field/rich-text.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';

describe('rewriteRichText - Dynamic link tokens', () => {
  it('rewrites ~/link.aspx?_id={GUID} to a site-relative URL', () => {
    const targetId = 'af176413-1cfe-4c54-9fcb-4f0545258bff';
    const target = makeItem({ id: targetId, path: '/sitecore/content/site/Home/about' });
    const engine = buildEngine([target]);

    const body = `<p>See <a href="~/link.aspx?_id=${targetId.toUpperCase()}&_z=z">details</a>.</p>`;
    const out = rewriteRichText(body, engine, '', '/sitecore/content/site/Home');
    expect(out).toContain('href="/about"');
    expect(out).not.toContain('~/link.aspx');
  });

  it('rewrites ~/link.aspx to notfound.aspx when the referenced item is not in the tree (0.4.0.9)', () => {
    // Sitecore's `DynamicLink.SetLinkItemNotFoundError` emits a
    // `notfound.aspx` URL rather than leaving the raw `~/link.aspx`
    // token. See decompile at `Sitecore.Kernel.decompiled.cs:213076-213092`
    // + `Settings.ItemNotFoundUrl` docstring at 442535. URL encoding is
    // HttpUtility.UrlEncode (lowercase hex): `:` → `%3a`, `{` → `%7b`,
    // `}` → `%7d`, `@` → `%40`. Language hardcoded to `en` for the SITE
    // English-only content tree.
    const engine = buildEngine([]);
    const body = '<a href="~/link.aspx?_id=DEADBEEFDEADBEEFDEADBEEFDEADBEEF">x</a>';
    expect(rewriteRichText(body, engine, '', '')).toBe(
      '<a href="/sitecore/service/notfound.aspx?item=master%3a%7bDEADBEEF-DEAD-BEEF-DEAD-BEEFDEADBEEF%7d%40en">x</a>',
    );
  });

  it('formats notfound.aspx URL with upper-dashed GUID + en language + HttpUtility-style encoding (0.4.0.9)', () => {
    // Concrete fixture: a GUID pointing at a deleted item. Pins the
    // exact URL shape byte-exact against Sitecore's notfound.aspx
    // redirect format.
    const engine = buildEngine([]);
    const body = '<a href="~/link.aspx?_id=0C7B1CDC4F234FF2A0BCCE49D8611228&_z=z">ref</a>';
    const out = rewriteRichText(body, engine, '', '');
    expect(out).toContain('/sitecore/service/notfound.aspx?item=master%3a%7b0C7B1CDC-4F23-4FF2-A0BC-CE49D8611228%7d%40en');
    expect(out).not.toContain('~/link.aspx');
  });

  it('malformed ~/link.aspx token (no _id param) passes through unchanged (0.4.0.9)', () => {
    // Regression guard: only unresolved-but-valid GUIDs trigger the
    // notfound URL. Malformed tokens (missing/invalid _id) still fall
    // through the `!idMatch` and `!id` branches returning `match`
    // verbatim - preserves the two existing malformed-token test paths.
    const engine = buildEngine([]);
    const body = '<a href="~/link.aspx?_other=x">no id</a>';
    expect(rewriteRichText(body, engine, '', '')).toBe(body);
  });

  it('accepts bare 32-hex, dashed, and braced guid forms in the _id parameter', () => {
    const targetId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    const target = makeItem({ id: targetId, path: '/sitecore/content/site/Home/bar' });
    const engine = buildEngine([target]);
    for (const form of [
      targetId,
      targetId.toUpperCase(),
      targetId.replace(/-/g, '').toUpperCase(),
      `{${targetId.toUpperCase()}}`,
    ]) {
      const body = `<a href="~/link.aspx?_id=${form}">x</a>`;
      expect(rewriteRichText(body, engine, '', '/sitecore/content/site/Home'))
        .toContain('href="/bar"');
    }
  });
});

describe('rewriteRichText - Dynamic media tokens', () => {
  it('rewrites -/media/<32hex>.ashx to the resolved media path, preserving querystring', () => {
    const mediaId = 'eeeeeeee-3333-4444-5555-666666666666';
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/Project/pics/hero',
      sharedFields: [
        { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'jpg' },
      ],
    });
    const engine = buildEngine([media]);

    const body = `<img src="-/media/${mediaId.replace(/-/g, '').toUpperCase()}.ashx?h=100&w=200" />`;
    const out = rewriteRichText(body, engine, '', '');
    expect(out).toContain('src="/-/media/Project/pics/hero.jpg?h=100&w=200"');
    expect(out).not.toContain('.ashx');
  });

  it('leaves -/media tokens untouched when the media item is not in the tree', () => {
    const engine = buildEngine([]);
    const body = '<img src="-/media/0123456789ABCDEF0123456789ABCDEF.ashx" />';
    expect(rewriteRichText(body, engine, '', '')).toBe(body);
  });

  it('rewrites multiple tokens in a single body (link + media mixed)', () => {
    const targetId = 'a1a1a1a1-0000-0000-0000-000000000001';
    const mediaId = 'b2b2b2b2-0000-0000-0000-000000000002';
    const target = makeItem({ id: targetId, path: '/sitecore/content/site/Home/docs' });
    const media = makeItem({
      id: mediaId,
      path: '/sitecore/media library/x/y',
      sharedFields: [{ id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'png' }],
    });
    const engine = buildEngine([target, media]);

    const body =
      `<p><a href="~/link.aspx?_id=${targetId.toUpperCase()}">docs</a>` +
      ` and <img src="-/media/${mediaId.replace(/-/g, '').toUpperCase()}.ashx" /></p>`;
    const out = rewriteRichText(body, engine, '', '/sitecore/content/site/Home');
    expect(out).toContain('href="/docs"');
    expect(out).toContain('src="/-/media/x/y.png"');
    expect(out).not.toContain('~/link.aspx');
    expect(out).not.toContain('.ashx');
  });
});

describe('rewriteRichText - pass-through', () => {
  it('leaves bodies without tokens unchanged', () => {
    const engine = buildEngine([]);
    const body = '<p>Just some plain HTML, no tokens.</p>';
    expect(rewriteRichText(body, engine, '', '')).toBe(body);
  });

  it('returns empty string unchanged', () => {
    const engine = buildEngine([]);
    expect(rewriteRichText('', engine, '', '')).toBe('');
  });
});

describe('rewriteRichText - whitespace normalization (0.4.0.10 item 9)', () => {
  // Real-world: a FAQ page Answer field has a bare `\r` (CR with no
  // following LF) that Sitecore does not emit. A typical client-side
  // normalizer already collapses `\r\n` -> `\n`, but bare CRs slip
  // through. Strip at emission time; preserve `\r\n` pairs so the
  // downstream normalizer continues to handle them.

  it('strips bare \\r characters from RichText output', () => {
    const engine = buildEngine([]);
    const input = '<p>hello</p>\rworld';
    expect(rewriteRichText(input, engine, '', '')).toBe('<p>hello</p>world');
  });

  it('preserves \\r\\n pairs (downstream normalizer collapses them)', () => {
    // Regression guard: the strip must NOT touch CRLF pairs - removing
    // the CR from a `\r\n` sequence would corrupt the downstream
    // normalizer's expected input shape.
    const engine = buildEngine([]);
    const input = '<p>hello</p>\r\nworld';
    expect(rewriteRichText(input, engine, '', '')).toBe('<p>hello</p>\r\nworld');
  });
});

describe('rewriteRichText - SXA xa-variable span resolution (0.4.0.29)', () => {
  // Sitecore Edge resolves `<span class="xa-variable" data-variableitemid="{ID}">label</span>`
  // by looking up the referenced Content Token item and replacing the entire
  // span with the token's `Value` field. Mockingbird previously passed the
  // span through unchanged - the headless app's SDK doesn't resolve these
  // client-side, so the page rendered the raw span markup. Regression guard
  // for a FAQ Answer field with an embedded variable token.
  const VALUE_FIELD_ID = '09147fb2-ebfb-4949-8c8e-26a424409d5e';

  it('replaces the span with the referenced token\'s Value field', () => {
    const tokenId = '0dd6d88c-decb-48b8-b91f-c98f81a7a6a2';
    const token = makeItem({
      id: tokenId,
      path: '/sitecore/content/site/Home/Data/Content Tokens/NumPy',
      sharedFields: [
        { id: VALUE_FIELD_ID, hint: 'Value', value: 'A free software machine learning library for Python.' },
      ],
    });
    const engine = buildEngine([token]);
    const body = 'Scikit-learn <span class="xa-variable" contenteditable="false" data-variableitemid="{0DD6D88C-DECB-48B8-B91F-C98F81A7A6A2}">NumPy</span>, pandas...';
    const out = rewriteRichText(body, engine, '', '');
    expect(out).toBe('Scikit-learn A free software machine learning library for Python., pandas...');
    expect(out).not.toContain('xa-variable');
  });

  it('resolves token Value from versioned field when shared is absent', () => {
    const tokenId = 'aabbccdd-1111-2222-3333-444455556666';
    const token = makeItem({
      id: tokenId,
      path: '/sitecore/content/site/Home/Data/Content Tokens/pandas',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: VALUE_FIELD_ID, hint: 'Value', value: 'A data analysis library.' }],
        }],
      }],
    });
    const engine = buildEngine([token]);
    const body = 'See <span class="xa-variable" data-variableitemid="{AABBCCDD-1111-2222-3333-444455556666}">pandas</span>.';
    const out = rewriteRichText(body, engine, '', '');
    expect(out).toBe('See A data analysis library..');
  });

  it('leaves span unchanged when the referenced item is not in the tree', () => {
    // Unresolvable reference falls through - preserves existing markup
    // rather than silently stripping content, matching the
    // ~/link.aspx malformed-token behaviour.
    const engine = buildEngine([]);
    const body = '<span class="xa-variable" data-variableitemid="{DEADBEEF-0000-0000-0000-000000000000}">gone</span>';
    expect(rewriteRichText(body, engine, '', '')).toBe(body);
  });

  it('matches the authored attribute `data-variableid` (no "item") - 0.4.0.30 regex fix', () => {
    // The actual site authoring attribute is `data-variableid` (no "item"
    // prefix). 0.4.0.29 matched only `data-variableitemid` because the
    // initial spec called for the longer form; a real-world site grep
    // showed only the shorter form in use. Regex now accepts both
    // defensively.
    const tokenId = '51d83b1b-16db-46ac-b6ce-ec0ffe345520';
    const token = makeItem({
      id: tokenId,
      path: '/sitecore/content/site/Home/Data/Content Tokens/Scikit-Learn',
      sharedFields: [{ id: VALUE_FIELD_ID, hint: 'Value', value: 'A free software ML library.' }],
    });
    const engine = buildEngine([token]);
    const body = '<span class="xa-variable" contenteditable="false" data-variableid="{51D83B1B-16DB-46AC-B6CE-EC0FFE345520}">Scikit-Learn</span>';
    expect(rewriteRichText(body, engine, '', '')).toBe('A free software ML library.');
  });

  it('accepts braced, dashed, and bare 32-hex forms in data-variableid (and the longer item-prefixed form)', () => {
    const tokenId = '11112222-3333-4444-5555-666677778888';
    const token = makeItem({
      id: tokenId,
      path: '/Data/Token X',
      sharedFields: [{ id: VALUE_FIELD_ID, hint: 'Value', value: 'resolved' }],
    });
    const engine = buildEngine([token]);
    for (const form of [
      tokenId,
      tokenId.toUpperCase(),
      `{${tokenId.toUpperCase()}}`,
      tokenId.replace(/-/g, '').toUpperCase(),
    ]) {
      // Both the short and legacy-long attribute name should resolve.
      const shortAttr = `<span class="xa-variable" data-variableid="${form}">label</span>`;
      const longAttr = `<span class="xa-variable" data-variableitemid="${form}">label</span>`;
      expect(rewriteRichText(shortAttr, engine, '', '')).toBe('resolved');
      expect(rewriteRichText(longAttr, engine, '', '')).toBe('resolved');
    }
  });
});
