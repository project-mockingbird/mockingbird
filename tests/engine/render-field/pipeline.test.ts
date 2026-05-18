import { describe, it, expect } from 'vitest';
import { renderField } from '../../../src/engine/render-field/pipeline.js';
import { walkElementAttrs } from '../../../src/engine/render-field/html-walker.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';
import { MEDIA_WIDTH_FIELD_ID, MEDIA_HEIGHT_FIELD_ID } from '../../../src/engine/render-field/media.js';

function makeMediaItem(id: string, path: string, ext = 'png') {
  return makeItem({
    id,
    path,
    sharedFields: [
      { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: ext },
    ],
  });
}

describe('renderField - image processor stub', () => {
  it('emits <img> with authored attrs in source order + src projection', () => {
    const mediaId = 'abababab-0000-0000-0000-000000000001';
    const media = makeMediaItem(mediaId, '/sitecore/media library/Project/imgs/hero', 'jpg');
    const engine = buildEngine([media]);

    const html = renderField({
      fieldType: 'image',
      value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="Hero" class="headline" hspace="30" />`,
      engine,
      siteRootPath: '/sitecore/content/site/Home',
      mediaBaseUrl: '',
    });

    // width/height drop out when neither the authored XML nor the media
    // item carries a dimension - matches prod Edge's rule of omitting
    // empty-valued optional dim attrs.
    expect(html).toBe(
      '<img alt="Hero" class="headline" hspace="30" src="/-/media/Project/imgs/hero.jpg?iar=0" />',
    );
  });

  it('returns "" when the field has no mediaid', () => {
    const engine = buildEngine([]);
    const html = renderField({
      fieldType: 'image',
      value: '<image alt="No id" />',
      engine,
      siteRootPath: '',
      mediaBaseUrl: '',
    });
    expect(html).toBe('');
  });

  it('returns "" when mediaid does not resolve to an item', () => {
    const engine = buildEngine([]);
    const html = renderField({
      fieldType: 'image',
      value: '<image mediaid="{DEADBEEF-0000-0000-0000-000000000000}" alt="Gone" />',
      engine,
      siteRootPath: '',
      mediaBaseUrl: '',
    });
    expect(html).toBe('');
  });

  it('drops authored width="" and height="" when the media item has no dimensions', () => {
    // Real-world evidence: authored XML is `<image width="" height="" .../>`.
    // Sitecore emits only `{alt, src}`; the 0.4.0 pipeline was leaking
    // `{width:"", height:""}` into `spotlightImage.jsonValue.value`.
    const mediaId = 'cdcdcdcd-0000-0000-0000-000000000001';
    const media = makeMediaItem(mediaId, '/sitecore/media library/Project/imgs/asl', 'png');
    const engine = buildEngine([media]);

    const html = renderField({
      fieldType: 'image',
      value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="ASL" width="" height="" />`,
      engine,
      siteRootPath: '/sitecore/content/site/Home',
      mediaBaseUrl: '',
    });

    expect(html).toBe('<img alt="ASL" src="/-/media/Project/imgs/asl.png?iar=0" />');

    // Confirm the walker result (end-to-end client shape) is 2-key only.
    expect(walkElementAttrs(html, 'img')).toEqual({
      alt: 'ASL',
      src: '/-/media/Project/imgs/asl.png?iar=0',
    });
  });

  it('round-trips through walkElementAttrs back to the authored key set plus src - empty dims dropped', () => {
    const mediaId = 'cdcdcdcd-0000-0000-0000-000000000002';
    const media = makeMediaItem(mediaId, '/sitecore/media library/x/y');
    const engine = buildEngine([media]);

    const html = renderField({
      fieldType: 'image',
      value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="" class="" hspace="" vspace="" title="" />`,
      engine,
      siteRootPath: '',
      mediaBaseUrl: '',
    });
    const attrs = walkElementAttrs(html, 'img');
    // alt was authored (as ""), so the projection doesn't overwrite.
    // width/height weren't authored and the media item carries none,
    // so they're dropped - the 0.4.0.5 contract suppresses empty dim
    // projections.
    expect(attrs).toEqual({
      alt: '',
      class: '',
      hspace: '',
      vspace: '',
      title: '',
      src: '/-/media/x/y.png?iar=0',
    });
  });

  it('emits src with ?h=&iar=0&w= query when media item has dimensions', () => {
    const mediaId = 'cdcdcdcd-0000-0000-0000-000000000003';
    const media = makeMediaItem(mediaId, '/sitecore/media library/Project/logos/logo', 'svg');
    // Seed width + height shared fields on the media item.
    media.sharedFields.push(
      { id: MEDIA_WIDTH_FIELD_ID, hint: 'Width', value: '1650' },
      { id: MEDIA_HEIGHT_FIELD_ID, hint: 'Height', value: '1079' },
    );
    const engine = buildEngine([media]);

    const html = renderField({
      fieldType: 'image',
      value: `<image mediaid="{${mediaId.toUpperCase()}}" alt="" />`,
      engine,
      siteRootPath: '',
      mediaBaseUrl: '',
    });

    const attrs = walkElementAttrs(html, 'img');
    expect(attrs.src).toBe('/-/media/Project/logos/logo.svg?h=1079&iar=0&w=1650');
    expect(attrs.width).toBe('1650');
    expect(attrs.height).toBe('1079');
  });
});

describe('renderField - link processor stub', () => {
  it('emits <a> with authored attrs in source order + href projection for internal linktype', () => {
    const targetId = 'eeeeeeee-0000-0000-0000-000000000003';
    const target = makeItem({ id: targetId, path: '/sitecore/content/site/Home/about' });
    const engine = buildEngine([target]);

    const html = renderField({
      fieldType: 'general-link',
      value: `<link text="About" anchor="" linktype="internal" class="" title="" target="" querystring="" id="{${targetId.toUpperCase()}}" />`,
      engine,
      siteRootPath: '/sitecore/content/site/Home',
      mediaBaseUrl: '',
    });
    const attrs = walkElementAttrs(html, 'a');
    expect(attrs).toEqual({
      text: 'About',
      anchor: '',
      linktype: 'internal',
      class: '',
      title: '',
      target: '',
      querystring: '',
      id: `{${targetId.toUpperCase()}}`,
      href: '/about',
    });
  });

  it('projects href = url for external linktype', () => {
    const engine = buildEngine([]);
    const html = renderField({
      fieldType: 'general-link',
      value: '<link linktype="external" url="https://x.test" target="_blank" text="Docs" anchor="" />',
      engine,
      siteRootPath: '',
      mediaBaseUrl: '',
    });
    const attrs = walkElementAttrs(html, 'a');
    expect(attrs.href).toBe('https://x.test');
    expect(attrs.linktype).toBe('external');
    expect(attrs.url).toBe('https://x.test');
    expect(attrs.target).toBe('_blank');
    expect(attrs.anchor).toBe('');
  });

  it('returns "" for an empty link field', () => {
    const engine = buildEngine([]);
    expect(renderField({
      fieldType: 'general-link', value: '', engine, siteRootPath: '', mediaBaseUrl: '',
    })).toBe('');
    expect(renderField({
      fieldType: 'general-link', value: '<link />', engine, siteRootPath: '', mediaBaseUrl: '',
    })).toBe('');
  });
});

describe('walkElementAttrs', () => {
  it('extracts all attrs in source order, lowercased keys', () => {
    expect(walkElementAttrs('<img Alt="A" CLASS="c" src="s" />', 'img')).toEqual({
      alt: 'A', class: 'c', src: 's',
    });
  });

  it('decodes HTML entities in values', () => {
    expect(walkElementAttrs('<a href="/x?a=1&amp;b=2" />', 'a')).toEqual({
      href: '/x?a=1&b=2',
    });
  });

  it('returns {} when the tag is missing', () => {
    expect(walkElementAttrs('', 'img')).toEqual({});
    expect(walkElementAttrs('<span alt="x" />', 'img')).toEqual({});
  });
});
