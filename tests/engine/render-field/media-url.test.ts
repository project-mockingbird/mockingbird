import { describe, it, expect } from 'vitest';
import { buildMediaUrlPath } from '../../../src/engine/render-field/media.js';
import type { ScsItem } from '../../../src/engine/types.js';

/**
 * Build a minimal ScsItem fixture with only the fields
 * `buildMediaUrlPath` reads: `id`, `path`, and optionally a shared
 * `Extension` field. Other fields (languages, versions, template) are
 * stubbed to the empty/default shape.
 */
function makeMedia(opts: { id: string; path: string; extension?: string; template?: string }): ScsItem {
  return {
    id: opts.id,
    path: opts.path,
    template: opts.template ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    sharedFields: opts.extension !== undefined
      ? [{ id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: opts.extension }]
      : [],
    languages: [],
  } as unknown as ScsItem;
}

describe('buildMediaUrlPath (0.4.0.10)', () => {
  // Sitecore-authentic port of `MediaUrlBuilder`. Replaces 0.4.0.8-vintage
  // parallel helpers.

  it('path-based: Extension populated → /-/media/<path>.<ext>', () => {
    const item = makeMedia({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/media library/Project/hero/banner',
      extension: 'png',
    });
    expect(buildMediaUrlPath(item)).toBe('/-/media/Project/hero/banner.png');
  });

  it('path-based: Extension empty -> /-/media/<path>.ashx (item 5 - default extension)', () => {
    // Sitecore's Settings.Media.RequestExtension defaults to "ashx". Applied
    // when the item has no Extension field value - this is what MediaFolder
    // items look like (folders have no extension to append).
    const item = makeMedia({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      path: '/sitecore/media library/Project/tenant/site/calendar-invitations',
      extension: '',
    });
    expect(buildMediaUrlPath(item)).toBe('/-/media/Project/tenant/site/calendar-invitations.ashx');
  });

  it('path-based: Extension casing preserved (item 2 - "JPG" not lowercased)', () => {
    // Real-world evidence: a media item with `Extension="JPG"` (uppercase).
    // Prior implementation force-lowercased to `.jpg`; Sitecore's
    // `MediaItem.Extension` returns the authored string verbatim.
    const item = makeMedia({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/media library/Project/People/sample-person/headshot',
      extension: 'JPG',
    });
    expect(buildMediaUrlPath(item)).toBe('/-/media/Project/People/sample-person/headshot.JPG');
  });

  it('non-library: Extension populated -> /-/media/{ID-UPPER-NODASH}.<ext> (item 3 - ID fallback)', () => {
    // Real-world fixture: a HeroBanner BackgroundImage where the resolved
    // media-shaped item lives at /sitecore/content/tenant/site/Data/banners/...
    // - a media-shaped item NOT under the media library tree. Sitecore
    // Edge's URL builder falls back to the ID form when it can't build a
    // path-based URL. The ID is the item's canonical GUID with braces
    // stripped and uppercased.
    const item = makeMedia({
      id: '686f8c5a-923e-4559-89d8-979436b88e45',
      path: '/sitecore/content/tenant/site/Data/banners/sample-banner',
      extension: 'png',
    });
    expect(buildMediaUrlPath(item)).toBe('/-/media/686F8C5A923E455989D8979436B88E45.png');
  });

  it('non-library: Extension empty → /-/media/{ID-UPPER-NODASH}.ashx', () => {
    // Defensive regression guard: an item both non-library AND with no
    // Extension field should compose both fallbacks.
    const item = makeMedia({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      path: '/sitecore/content/elsewhere/item-without-ext',
      extension: '',
    });
    expect(buildMediaUrlPath(item)).toBe('/-/media/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.ashx');
  });

  it('path with spaces → hyphens in output', () => {
    // Edge applies space→hyphen normalisation per path segment; pinning
    // the contract at `buildMediaUrlPath`'s level.
    const item = makeMedia({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      path: '/sitecore/media library/Project/My Folder/My File',
      extension: 'png',
    });
    expect(buildMediaUrlPath(item)).toBe('/-/media/Project/My-Folder/My-File.png');
  });

  it('absent Extension field (not empty string) also falls back to .ashx (item 5 edge)', () => {
    // Regression guard: `readSharedString` returns `''` for both absent
    // and empty-string Extension fields, so both paths must land on
    // `.ashx`. This case exercises the "field entirely absent from
    // sharedFields" path — e.g. an author-misconfigured media item that
    // never had the field set, distinct from the "field set to empty
    // string" case covered above.
    const item = makeMedia({
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/media library/Project/some-folder/leaf-without-ext-field',
      // `extension` omitted — `sharedFields` will be empty.
    });
    expect(buildMediaUrlPath(item)).toBe('/-/media/Project/some-folder/leaf-without-ext-field.ashx');
  });
});
