import { describe, it, expect } from 'vitest';
import { renderLinkStub } from '../../../src/engine/render-field/processors/link-stub.js';
import { walkElementAttrs } from '../../../src/engine/render-field/html-walker.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';

describe('renderLinkStub — internal-link pointing at media item (0.4.0.8)', () => {
  // Mirrors the layout-side `formatField` tests at the pipeline level.
  // `renderLinkStub` emits `<a ... href="..." />` HTML that
  // `buildJsonValue` walks via `walkElementAttrs(html, 'a')` to produce
  // the `jsonValue.value` object.

  it('internal link pointing at media item emits CDN href', () => {
    const mediaId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffff11';
    const mediaItem = makeItem({
      id: mediaId,
      template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
      path: '/sitecore/media library/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE Office Hours 2025',
      sharedFields: [
        { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'ics' },
      ],
    });
    const engine = buildEngine([mediaItem]);
    const xml = `<link linktype="internal" id="{${mediaId.toUpperCase()}}" url="/sitecore/media library/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE Office Hours 2025" target="" text="Save the Date" />`;

    const html = renderLinkStub({
      fieldType: 'general-link',
      value: xml,
      engine,
      siteRootPath: '/sitecore/content',
      mediaBaseUrl: '',
    });

    const attrs = walkElementAttrs(html, 'a');
    expect(attrs.href).toBe('/-/media/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE-Office-Hours-2025.ics');
    expect(attrs.linktype).toBe('internal');
    expect(attrs.url).toBe('/sitecore/media library/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE Office Hours 2025');
    expect(attrs.text).toBe('Save the Date');
  });

  it('internal link pointing at MediaFolder resolves to CDN href (0.4.0.9)', () => {
    const folderId = 'cccccccc-cccc-cccc-cccc-cccccccccc12';
    const folder = makeItem({
      id: folderId,
      template: 'fe5dd826-48c6-436d-b87a-7c4210c7413b', // MEDIA_FOLDER_TEMPLATE_ID
      path: '/sitecore/media library/Project/calendar-invitations',
    });
    const engine = buildEngine([folder]);
    const xml = `<link linktype="internal" id="{${folderId.toUpperCase()}}" />`;

    const html = renderLinkStub({
      fieldType: 'general-link',
      value: xml,
      engine,
      siteRootPath: '/sitecore/content',
      mediaBaseUrl: '',
    });

    const attrs = walkElementAttrs(html, 'a');
    // 0.4.0.9: MediaFolder exclusion dropped. Pipeline-side mirror of
    // the layout-side field-formatter flip.
    // 0.4.0.10 item 5: Empty Extension → .ashx (Sitecore's
    // Settings.Media.RequestExtension default). Flipped from bare path.
    expect(attrs.href).toBe('/-/media/Project/calendar-invitations.ashx');
  });

  it('internal link pointing at content item still uses site-relative href', () => {
    const contentId = 'dddddddd-dddd-dddd-dddd-dddddddddd13';
    const content = makeItem({
      id: contentId,
      path: '/sitecore/content/site/Home/about',
    });
    const engine = buildEngine([content]);
    const xml = `<link linktype="internal" id="{${contentId.toUpperCase()}}" text="About us" />`;

    const html = renderLinkStub({
      fieldType: 'general-link',
      value: xml,
      engine,
      siteRootPath: '/sitecore/content/site/Home',
      mediaBaseUrl: '',
    });

    const attrs = walkElementAttrs(html, 'a');
    expect(attrs.href).toBe('/about');
  });
});
