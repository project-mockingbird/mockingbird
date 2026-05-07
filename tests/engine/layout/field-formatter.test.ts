import { describe, it, expect } from 'vitest';
import { formatField, formatReferenceItem, emptyValueForType } from '../../../src/engine/layout/field-formatter.js';
import {
  makeItem,
  buildEngine,
  buildEngineWithRegistry,
  buildSctFixture,
  addSettingsAndSctFolder,
  addSctItem,
  addPerSiteTemplate,
} from './_helpers.js';
import { buildItemValueIndex, resolveFieldValue } from '../../../src/engine/layout/item-fields.js';
import {
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import type { ScsItem } from '../../../src/engine/types.js';

describe('formatField', () => {
  it('formats Single-Line Text as { value: string }', () => {
    const engine = buildEngine([]);
    expect(formatField('Hello', 'Single-Line Text', engine, '')).toEqual({ value: 'Hello' });
  });

  it('formats Multiline Text as { value: string }', () => {
    const engine = buildEngine([]);
    expect(formatField('Line1\nLine2', 'Multiline Text', engine, '')).toEqual({ value: 'Line1\nLine2' });
  });

  it('formats Rich Text as { value: string }', () => {
    const engine = buildEngine([]);
    expect(formatField('<p>Hello</p>', 'Rich Text', engine, '')).toEqual({ value: '<p>Hello</p>' });
  });

  it('formats Checkbox "1" as { value: true }', () => {
    const engine = buildEngine([]);
    expect(formatField('1', 'Checkbox', engine, '')).toEqual({ value: true });
  });

  it('formats Checkbox "" as { value: false }', () => {
    const engine = buildEngine([]);
    expect(formatField('', 'Checkbox', engine, '')).toEqual({ value: false });
  });

  it('formats Integer as { value: number }', () => {
    const engine = buildEngine([]);
    expect(formatField('42', 'Integer', engine, '')).toEqual({ value: 42 });
  });

  it('formats Number as { value: number }', () => {
    const engine = buildEngine([]);
    expect(formatField('3.14', 'Number', engine, '')).toEqual({ value: 3.14 });
  });

  it('formats Image XML into { value: { src, alt, width, height } }', () => {
    const mediaItem = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/media library/Project/site/logos/logo',
    });
    const engine = buildEngine([mediaItem]);
    const xml = '<image mediaid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}" alt="Logo" width="67" height="67" />';
    const result = formatField(xml, 'Image', engine, '') as any;
    expect(result.value.src).toContain('/-/media/Project/site/logos/logo');
    expect(result.value.src).not.toMatch(/(^|[^-])\/media\//);
    expect(result.value.alt).toBe('Logo');
    expect(result.value.width).toBe('67');
    expect(result.value.height).toBe('67');
  });

  it('uses MEDIA_BASE_URL for image src (with extension and query from media item)', () => {
    const mediaItem = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/media library/Project/site/logos/logo',
      sharedFields: [
        { id: '22eac599-f13b-4607-a89d-c091763a467d', hint: 'Width',     value: '67' },
        { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', hint: 'Height',    value: '67' },
        { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'svg' },
      ],
    });
    const engine = buildEngine([mediaItem]);
    const xml = '<image mediaid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}" alt="" width="" height="" />';
    const result = formatField(xml, 'Image', engine, 'https://cdn.example.com') as any;
    expect(result.value.src).toBe('https://cdn.example.com/-/media/Project/site/logos/logo.svg?h=67&iar=0&w=67');
    expect(result.value.width).toBe('67');
    expect(result.value.height).toBe('67');
  });

  it('formats General Link (internal) with resolved href', () => {
    const targetItem = makeItem({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      path: '/sitecore/content/site/Home/About',
    });
    const engine = buildEngine([targetItem]);
    const xml = '<link linktype="internal" id="{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}" text="About Us" anchor="" class="" title="" target="" querystring="" />';
    const result = formatField(xml, 'General Link', engine, '', '/sitecore/content/site/Home') as any;
    expect(result.value.linktype).toBe('internal');
    expect(result.value.text).toBe('About Us');
    expect(result.value.id).toBe('{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}');
    expect(result.value.href).toBe('/About');
  });

  it('formats General Link (external) with raw href', () => {
    const engine = buildEngine([]);
    const xml = '<link linktype="external" url="https://example.com" text="Example" anchor="" class="" title="" target="_blank" querystring="" />';
    const result = formatField(xml, 'General Link', engine, '') as any;
    expect(result.value.linktype).toBe('external');
    expect(result.value.href).toBe('https://example.com');
    expect(result.value.target).toBe('_blank');
  });

  it('mailto: prepends "mailto:" prefix when authored url is bare email (0.4.0.10 item 4)', () => {
    // Sitecore's `MailtoLinkField.GetHref` prepends the scheme when the
    // authored `url` is a bare email address.
    const engine = buildEngine([]);
    const xml = '<link linktype="mailto" url="team@example.com" text="Email Us" />';
    const result = formatField(xml, 'General Link', engine, '', '') as any;
    expect(result.value.href).toBe('mailto:team@example.com');
  });

  it('mailto: preserves already-prefixed url (idempotency guard, 0.4.0.10 item 4)', () => {
    // Regression guard: double-prefixing an already-prefixed url would
    // emit `mailto:mailto:...` - mirror the `MailtoLinkField.GetHref`
    // idempotent-prefix behaviour.
    const engine = buildEngine([]);
    const xml = '<link linktype="mailto" url="mailto:team@example.com" text="Email Us" />';
    const result = formatField(xml, 'General Link', engine, '', '') as any;
    expect(result.value.href).toBe('mailto:team@example.com');
  });

  it('mailto: case-insensitive scheme detection - "MAILTO:" not double-prefixed (0.4.0.10 item 4 fix-forward)', () => {
    // RFC 5321: URI schemes are case-insensitive. The idempotency guard
    // must detect `MAILTO:` / `Mailto:` / `mailto:` as equivalent.
    const engine = buildEngine([]);
    const xml = '<link linktype="mailto" url="MAILTO:team@example.com" text="x" />';
    const result = formatField(xml, 'General Link', engine, '', '') as any;
    expect(result.value.href).toBe('MAILTO:team@example.com');
  });

  it('mailto: empty url emits empty href (0.4.0.10 item 4 fix-forward)', () => {
    // Regression guard: an author-empty mailto url must not become
    // `mailto:` (a link to nowhere-prefixed). Preserves pre-0.4.0.10
    // empty-string behavior for this degenerate case.
    const engine = buildEngine([]);
    const xml = '<link linktype="mailto" url="" text="x" />';
    const result = formatField(xml, 'General Link', engine, '', '') as any;
    expect(result.value.href).toBe('');
  });

  it('external: passes url through verbatim without mailto prefix (0.4.0.10 item 4)', () => {
    // Regression guard: the split must not accidentally apply `mailto:`
    // prefix to `linktype="external"` links.
    const engine = buildEngine([]);
    const xml = '<link linktype="external" url="https://example.com/x" text="x" />';
    const result = formatField(xml, 'General Link', engine, '', '') as any;
    expect(result.value.href).toBe('https://example.com/x');
  });

  it('formats General Link (media) — resolves media item to href (0.4.0.8)', () => {
    // SXA Event pages carry `CalendarInvitation` / `EventInformation`
    // General Link fields with `linktype="media"` pointing at an .ics /
    // .pdf in the media library. 0.4.0.8 aligned emission to Sitecore's
    // `GeneralLinkFieldSerializer.GetLinkProperties` contract: computed
    // `href` + authored XML attrs verbatim. No computed `url` key.
    const mediaItem = makeItem({
      id: 'bc9669fa-6b5d-4869-aada-9bd1475953bb',
      path: '/sitecore/media library/Project/tenant/site/calendar-invitations/ai-office-hours/2023/AI Office Hours 2023 08-12',
      sharedFields: [
        { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'ics' },
      ],
    });
    const engine = buildEngine([mediaItem]);
    const xml = '<link linktype="media" id="{BC9669FA-6B5D-4869-AADA-9BD1475953BB}" target="" text="Save the Date" />';
    const result = formatField(xml, 'General Link', engine, '', '/sitecore/content') as any;
    expect(result.value.linktype).toBe('media');
    expect(result.value.href).toBe('/-/media/Project/tenant/site/calendar-invitations/ai-office-hours/2023/AI-Office-Hours-2023-08-12.ics');
    // No computed `url` key — the authored XML has no `url` attribute,
    // and 0.4.0.8 dropped the computed-overwrite from the media branch.
    expect(result.value.url).toBeUndefined();
    expect(result.value.text).toBe('Save the Date');
    expect(result.value.id).toBe('{BC9669FA-6B5D-4869-AADA-9BD1475953BB}');
  });

  it('preserves authored Image attributes (hspace/vspace/class/title) when non-empty', () => {
    // SXA-authored <image> XML stores arbitrary HTML attributes for
    // visual layout. Edge emits the complete authored set alongside the
    // computed src — previously mockingbird dropped everything except
    // src/alt/width/height.
    const mediaItem = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/media library/Project/site/photos/team',
      sharedFields: [
        { id: '22eac599-f13b-4607-a89d-c091763a467d', hint: 'Width', value: '500' },
        { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', hint: 'Height', value: '500' },
      ],
    });
    const engine = buildEngine([mediaItem]);
    const xml = '<image mediaid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}" alt="Team photo" hspace="50" vspace="50" class="rounded-border" title="Our Team" />';
    const result = formatField(xml, 'Image', engine, '') as any;
    expect(result.value.src).toContain('/-/media/Project/site/photos/team');
    expect(result.value.alt).toBe('Team photo');
    expect(result.value.width).toBe('500');
    expect(result.value.height).toBe('500');
    expect(result.value.hspace).toBe('50');
    expect(result.value.vspace).toBe('50');
    expect(result.value.class).toBe('rounded-border');
    expect(result.value.title).toBe('Our Team');
    // mediaid is the resolution handle — not emitted on the output.
    expect(result.value.mediaid).toBeUndefined();
  });

  it('omits optional Image attributes whose authored value is empty string', () => {
    // Prod Edge's emission rule is "present-only-if-authored" for
    // optional attrs: hspace="" / vspace="" / class="" / title=""
    // appear in the stored XML on every SXA image but are dropped from
    // the emitted JSON unless they carry a non-empty value. 0.2.0
    // regressed by emitting them as empty-string keys (~3,131 diffs).
    const mediaItem = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/media library/Project/site/logos/logo',
      sharedFields: [
        { id: '22eac599-f13b-4607-a89d-c091763a467d', hint: 'Width', value: '67' },
        { id: 'de2ca9e4-c117-4c8a-a139-1ff4b199d15a', hint: 'Height', value: '67' },
      ],
    });
    const engine = buildEngine([mediaItem]);
    const xml = '<image mediaid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}" alt="" width="" height="" hspace="" vspace="" class="" title="" />';
    const result = formatField(xml, 'Image', engine, '') as any;
    // Required attrs stay even when empty (prod emits them that way).
    expect(result.value).toHaveProperty('src');
    expect(result.value).toHaveProperty('alt');
    // width/height back-filled from the media item's shared fields.
    expect(result.value.width).toBe('67');
    expect(result.value.height).toBe('67');
    // Optional attrs with empty authored value — dropped from the shape.
    expect(result.value).not.toHaveProperty('hspace');
    expect(result.value).not.toHaveProperty('vspace');
    expect(result.value).not.toHaveProperty('class');
    expect(result.value).not.toHaveProperty('title');
  });

  it('formats Multilist as array of reference items', () => {
    const tag1 = makeItem({
      id: '11111111-1111-1111-1111-111111111111',
      path: '/sitecore/content/site/Home/Data/Tags/Tag1',
      template: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [{ id: 'title-field-id', hint: 'Title', value: 'Tag One' }] }] }],
    });
    const tag2 = makeItem({
      id: '22222222-2222-2222-2222-222222222222',
      path: '/sitecore/content/site/Home/Data/Tags/Tag2',
      template: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [{ id: 'title-field-id', hint: 'Title', value: 'Tag Two' }] }] }],
    });
    const engine = buildEngine([tag1, tag2]);
    const result = formatField(
      '{11111111-1111-1111-1111-111111111111}|{22222222-2222-2222-2222-222222222222}',
      'Treelist',
      engine,
      '',
    );
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr).toHaveLength(2);
    expect(arr[0].name).toBe('Tag1');
    expect(arr[1].name).toBe('Tag2');
  });

  it('formats Droplink as single reference item or null', () => {
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/site/Home/Data/Settings/Config',
    });
    const engine = buildEngine([item]);
    const result = formatField('{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}', 'Droplink', engine, '') as any;
    expect(result).not.toBeNull();
    expect(result.name).toBe('Config');
  });

  it('formats Droplink with empty value as null', () => {
    const engine = buildEngine([]);
    expect(formatField('', 'Droplink', engine, '')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    const engine = buildEngine([]);
    expect(formatField(undefined as unknown as string, 'Single-Line Text', engine, '')).toBeNull();
    expect(formatField(null as unknown as string, 'Single-Line Text', engine, '')).toBeNull();
  });

  it('treats unknown field types as text', () => {
    const engine = buildEngine([]);
    expect(formatField('hello', 'CustomType', engine, '')).toEqual({ value: 'hello' });
  });

  it('formats Tag Treelist as array of reference items', () => {
    const tag1 = makeItem({
      id: '11111111-1111-1111-1111-111111111111',
      path: '/sitecore/content/site/Home/Data/Tags/AI',
    });
    const tag2 = makeItem({
      id: '22222222-2222-2222-2222-222222222222',
      path: '/sitecore/content/site/Home/Data/Tags/Cloud',
    });
    const engine = buildEngine([tag1, tag2]);
    const result = formatField(
      '{11111111-1111-1111-1111-111111111111}|{22222222-2222-2222-2222-222222222222}',
      'Tag Treelist',
      engine,
      '',
    );
    expect(Array.isArray(result)).toBe(true);
    const arr = result as any[];
    expect(arr).toHaveLength(2);
    expect(arr[0].name).toBe('AI');
    expect(arr[1].name).toBe('Cloud');
  });

  it('skips unresolvable GUIDs in multilist', () => {
    const tag1 = makeItem({
      id: '11111111-1111-1111-1111-111111111111',
      path: '/sitecore/content/site/Home/Data/Tags/Tag1',
    });
    const engine = buildEngine([tag1]);
    const result = formatField(
      '{11111111-1111-1111-1111-111111111111}|{99999999-9999-9999-9999-999999999999}',
      'Treelist',
      engine,
      '',
    );
    const arr = result as any[];
    expect(arr).toHaveLength(1);
    expect(arr[0].name).toBe('Tag1');
  });
});

describe('formatField — internal-link pointing at media item (0.4.0.8)', () => {
  // Sitecore's `InternalLinkFieldSerializer.GetLinkUrl` dispatches by the
  // resolved item's `IsMediaItem` flag — not by the authored `linktype`
  // attribute — with a carve-out for the `MediaFolder` template. Mockingbird
  // now mirrors that: a `linktype="internal"` link whose target resolves to
  // an asset under `/sitecore/media library` (and is NOT a Media Folder)
  // emits a `/-/media/<path>.<ext>` CDN URL in `href`.

  it('linktype=internal pointing at media item emits CDN href + authored url verbatim', () => {
    const mediaId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffff01';
    const mediaItem = makeItem({
      id: mediaId,
      // `template` is any non-folder GUID (makeItem's default is already a
      // non-folder id; we pin a sentinel here for test readability).
      template: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
      path: '/sitecore/media library/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE Office Hours 2025',
      sharedFields: [
        { id: 'c06867fe-9a43-4c7d-b739-48780492d06f', hint: 'Extension', value: 'ics' },
      ],
    });
    const engine = buildEngine([mediaItem]);
    const xml = `<link linktype="internal" id="{${mediaId.toUpperCase()}}" url="/sitecore/media library/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE Office Hours 2025" target="" text="Save the Date" />`;
    const result = formatField(xml, 'General Link', engine, '', '/sitecore/content') as any;

    // href computed via `buildMediaUrlPath` — space→hyphen + Extension append.
    expect(result.value.href).toBe('/-/media/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE-Office-Hours-2025.ics');
    // Authored XML attrs flow through verbatim — pins the Sitecore
    // `GeneralLinkFieldSerializer.GetLinkProperties` contract.
    expect(result.value.linktype).toBe('internal');
    expect(result.value.url).toBe('/sitecore/media library/Project/tenant/site/calendar-invitations/mde-office-hours/2025/MDE Office Hours 2025');
    expect(result.value.text).toBe('Save the Date');
    expect(result.value.id).toBe(`{${mediaId.toUpperCase()}}`);
  });

  it('linktype=internal pointing at MediaFolder resolves to CDN href (0.4.0.9)', () => {
    // Sitecore's `!item.Template.ID.Equals(TemplateIDs.MediaFolder)` carve-out:
    // folders inside the media library are NOT media assets, so they fall
    // through to regular item-URL resolution (which here returns the path
    // verbatim since it doesn't start with `siteRootPath`).
    const folderId = 'cccccccc-cccc-cccc-cccc-cccccccccc02';
    const folder = makeItem({
      id: folderId,
      template: 'fe5dd826-48c6-436d-b87a-7c4210c7413b', // MEDIA_FOLDER_TEMPLATE_ID
      path: '/sitecore/media library/Project/calendar-invitations',
    });
    const engine = buildEngine([folder]);
    const xml = `<link linktype="internal" id="{${folderId.toUpperCase()}}" />`;
    const result = formatField(xml, 'General Link', engine, '', '/sitecore/content') as any;

    // 0.4.0.9: MediaFolder exclusion dropped — folder targets resolve
    // through the media-URL builder like any other media-library item,
    // matching Edge publish's observed output.
    // 0.4.0.10 item 5: Empty Extension → .ashx (Sitecore's
    // Settings.Media.RequestExtension default). Flipped from bare path.
    expect(result.value.href).toBe('/-/media/Project/calendar-invitations.ashx');
  });

  it('linktype=internal pointing at content item still uses site-relative url', () => {
    // Regression guard — the non-media branch of the dispatch must keep
    // working for the far larger population of ordinary content-tree links.
    const contentId = 'dddddddd-dddd-dddd-dddd-dddddddddd03';
    const content = makeItem({
      id: contentId,
      path: '/sitecore/content/site/Home/about',
    });
    const engine = buildEngine([content]);
    const xml = `<link linktype="internal" id="{${contentId.toUpperCase()}}" text="About us" />`;
    const result = formatField(xml, 'General Link', engine, '', '/sitecore/content/site/Home') as any;

    expect(result.value.href).toBe('/about');
  });
});

describe('emptyValueForType', () => {
  it('returns {value: ""} for text-like types', () => {
    expect(emptyValueForType('Single-Line Text')).toEqual({ value: '' });
    expect(emptyValueForType('Multiline Text')).toEqual({ value: '' });
    expect(emptyValueForType('Rich Text')).toEqual({ value: '' });
    expect(emptyValueForType('Droplist')).toEqual({ value: '' });
  });

  it('returns {value: false} for Checkbox', () => {
    expect(emptyValueForType('Checkbox')).toEqual({ value: false });
  });

  it('returns {value: 0} for Integer / Number', () => {
    expect(emptyValueForType('Integer')).toEqual({ value: 0 });
    expect(emptyValueForType('Number')).toEqual({ value: 0 });
  });

  it('returns {value: {}} for Image (empty default)', () => {
    expect(emptyValueForType('Image')).toEqual({ value: {} });
  });

  it('returns {value: {href: ""}} for General Link (empty default)', () => {
    expect(emptyValueForType('General Link')).toEqual({ value: { href: '' } });
  });

  it('returns [] for multilist family', () => {
    expect(emptyValueForType('Treelist')).toEqual([]);
    expect(emptyValueForType('Multilist')).toEqual([]);
    expect(emptyValueForType('Tag Treelist')).toEqual([]);
    expect(emptyValueForType('Checklist')).toEqual([]);
  });

  it('returns null for single-reference (Droplink / Droptree)', () => {
    expect(emptyValueForType('Droplink')).toBeNull();
    expect(emptyValueForType('Droptree')).toBeNull();
  });

  it('returns DateTime.MinValue ISO for unset Date / Datetime', () => {
    // .NET serializes `DateTime.MinValue` as `0001-01-01T00:00:00Z`; Edge
    // emits that verbatim for unset date fields. React components that
    // parse dates crash on empty string, so the wrapper-always-present
    // contract requires a parseable default.
    expect(emptyValueForType('Date')).toEqual({ value: '0001-01-01T00:00:00Z' });
    expect(emptyValueForType('Datetime')).toEqual({ value: '0001-01-01T00:00:00Z' });
  });

  it('returns "00:00:00" for unset Time (SXA Event PlayFrom / PlayTo)', () => {
    expect(emptyValueForType('Time')).toEqual({ value: '00:00:00' });
  });
});

describe('formatField — Date / Datetime → ISO-8601 conversion', () => {
  const engine = buildEngine([]);

  it('expands Sitecore compact form yyyyMMddTHHmmss to ISO yyyy-MM-ddTHH:mm:ssZ', () => {
    expect(formatField('20240110T090000', 'Date', engine, '')).toEqual({ value: '2024-01-10T09:00:00Z' });
    expect(formatField('20251231T235959', 'Datetime', engine, '')).toEqual({ value: '2025-12-31T23:59:59Z' });
  });

  it('accepts the compact form with a trailing Z', () => {
    expect(formatField('20240118T000000Z', 'Date', engine, '')).toEqual({ value: '2024-01-18T00:00:00Z' });
  });

  it('passes through already-expanded ISO values unchanged', () => {
    expect(formatField('2024-01-10T09:00:00Z', 'Date', engine, '')).toEqual({ value: '2024-01-10T09:00:00Z' });
  });

  it('passes through unrecognized shapes unchanged (falls back to raw)', () => {
    expect(formatField('not a date', 'Date', engine, '')).toEqual({ value: 'not a date' });
  });

  it('expands date-only yyyyMMddZ form to ISO midnight (0.4.0.10 item 1)', () => {
    // Real-world fixture: a FaqDate field authored as `20240327Z`
    // (date-only, no time). Edge emits the full ISO form with
    // midnight. Closes a class of SCALAR_STR_DIFF_ROUTE divergences.
    const engine = buildEngine([]);
    expect(formatField('20240327Z', 'date', engine, '', '').value).toBe('2024-03-27T00:00:00Z');
  });

  it('expands date-only yyyyMMdd form (no trailing Z) to ISO midnight (0.4.0.10 item 1)', () => {
    // Defensive regression guard: regex's `Z?` handles both forms.
    const engine = buildEngine([]);
    expect(formatField('20240327', 'date', engine, '', '').value).toBe('2024-03-27T00:00:00Z');
  });

  it('trims whitespace before expanding date-only form (0.4.0.10 item 1 fix-forward)', () => {
    // Regression guard: the trim() call is the only guard before the
    // regex. If ever removed, a whitespace-padded FAQ date would
    // silently fall through the passthrough branch.
    const engine = buildEngine([]);
    expect(formatField(' 20240327Z ', 'date', engine, '', '').value).toBe('2024-03-27T00:00:00Z');
  });
});

describe('formatField — RichText + plain-text passthrough (0.4.0.7)', () => {
  const engine = buildEngine([]);

  it('preserves leading whitespace on Single-Line Text', () => {
    // Earlier code path stripped whitespace, which clashed with prod Edge's
    // byte-for-byte preservation of authored Text values. Authors
    // sometimes intentionally lead with a space (e.g. visual indent in a
    // Title) and Edge keeps it.
    expect(formatField(' Accelerate AI in the Practice', 'Single-Line Text', engine, '')).toEqual({
      value: ' Accelerate AI in the Practice',
    });
  });

  it('preserves author-intended trailing newline on Rich Text (0.4.0.7)', () => {
    // Pre-0.4.0.7 the RichText branch trimmed trailing whitespace to close
    // 7,774 cases from js-yaml's spec-mandated `|`-scalar `\n` injection.
    // 0.3.3 replaced js-yaml with the Rainbow SCS reader, which is
    // byte-faithful. Case-E encoding (indented blank line inside the
    // block) is how SCS stores an author-intended trailing `\n`; we now
    // preserve it.
    expect(formatField('<p>body</p>\n', 'Rich Text', engine, '')).toEqual({
      value: '<p>body</p>\n',
    });
  });

  it('preserves internal AND trailing newlines on Rich Text (0.4.0.7)', () => {
    // Multi-paragraph Rich Text / Multiline fields keep every `\n` the
    // parser produced — internal paragraph breaks and any author-intended
    // trailing newline both flow through to Edge.
    expect(formatField('<p>line one</p>\n<p>line two</p>\n', 'Rich Text', engine, '')).toEqual({
      value: '<p>line one</p>\n<p>line two</p>\n',
    });
  });

  it('preserves trailing whitespace on plain-text fields byte-for-byte (0.4.0.6)', () => {
    // Sitecore's `RenderFieldPipeline.GetTextFieldValue` is a passthrough
    // for plain-text field types — the stored database value emits
    // byte-for-byte, trailing whitespace included. Pre-0.4.0.6 code used
    // `.replace(/\s+$/, "")` to trim the run, which stripped ~816 cases'
    // worth of authored trailing space / CRLF / NBSP across the site content tree.
    expect(formatField('Title\r\n', 'Single-Line Text', engine, '')).toEqual({ value: 'Title\r\n' });
    expect(formatField('Body text   \n', 'Multiline Text', engine, '')).toEqual({ value: 'Body text   \n' });
  });

  it('preserves both internal and trailing \\n on Multiline Text (0.4.0.6)', () => {
    // MetaDescription canonical case. Pre-0.4.0.6 trimmed the trailing
    // `\n` to match a js-yaml block-literal artifact; 0.3.3 replaced
    // js-yaml with the Rainbow SCS reader (preserves leading whitespace
    // byte-exactly), so trailing preservation also flips to byte-exact.
    expect(formatField('Line one.\nLine two.\n', 'Multiline Text', engine, '')).toEqual({
      value: 'Line one.\nLine two.\n',
    });
  });

  it('preserves trailing non-breaking space (U+00A0) on plain-text fields (0.4.0.6)', () => {
    // Real-world evidence: a Title field ends with U+00A0 (0xa0).
    // Regex `\s+$` matches NBSP, so only full removal of the default-path
    // trim preserves this byte.
    expect(formatField('Sample Title\u00a0', 'Single-Line Text', engine, '')).toEqual({
      value: 'Sample Title\u00a0',
    });
  });
});

describe('formatField — SXA "multiroot treelist" (item 7, no hyphen)', () => {
  // SXA's field-type registration uses the two-word spelling `multiroot
  // treelist`. Mockingbird historically only matched the hyphenated form
  // `multi-root treelist` in `MULTILIST_TYPES`, so fields declared with the
  // SXA spelling fell through to the default text branch and rendered as a
  // pipe-separated GUID string instead of the expected reference array.
  it('expands "multiroot treelist" (no hyphen) as a multilist', () => {
    const item = makeItem({
      id: '11111111-1111-1111-1111-111111111111',
      path: '/sitecore/content/site/Home/Data/Pages/PageOne',
    });
    const engine = buildEngine([item]);
    const result = formatField(
      '{11111111-1111-1111-1111-111111111111}',
      'multiroot treelist',
      engine,
      '',
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].name).toBe('PageOne');
  });
});

describe('formatReferenceItem', () => {
  it('produces { id, url, name, displayName, fields } shape', () => {
    // Multilist reference-item ids flow out as the item's canonical
    // lowercase-dashed form — matching prod Edge's wire contract for
    // `MultiListFieldSerializer` → `{id, url, name, displayName, fields}`.
    // The bare-upper-hex Edge form is reserved for ComponentQuery executor
    // result rows (see Spotlight `data.datasource.links.results`).
    const item = makeItem({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/site/Home/Data/Tags/Tag1',
    });
    const engine = buildEngine([item]);
    const result = formatReferenceItem(item, engine, '', '/sitecore/content/site/Home');
    expect(result.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result.url).toBe('/Data/Tags/Tag1');
    expect(result.name).toBe('Tag1');
    expect(result.displayName).toBe('Tag1');
  });

  it('strips the site parent for items that are siblings of the site root', () => {
    const item = makeItem({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      path: '/sitecore/content/site/Data/Tags/Keywords/Ai Factory',
    });
    const engine = buildEngine([item]);
    const result = formatReferenceItem(item, engine, '', '/sitecore/content/site/Home');
    expect(result.url).toBe('/Data/Tags/Keywords/Ai-Factory');
  });

  it('replaces spaces with hyphens in url segments', () => {
    const item = makeItem({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/content/site/Home/Data/Some Section/Multi Word Name',
    });
    const engine = buildEngine([item]);
    const result = formatReferenceItem(item, engine, '', '/sitecore/content/site/Home');
    expect(result.url).toBe('/Data/Some-Section/Multi-Word-Name');
  });

  it('filters fields from SXA SiteMetadata base templates (ChangeFrequency, Priority)', () => {
    // Referenced item's template inherits from an SXA SiteMetadata base
    // that contributes a section with `ChangeFrequency` and `Priority`
    // fields. Prod Edge omits these because the base template's path is
    // under `/Foundation/Experience Accelerator/SiteMetadata/`.
    // `formatItemFields` already filters them via `isSiteMetadataSection`;
    // `formatReferenceItem` must do the same (fix #3 for 0.4.0.5).
    const SITEMETADATA_TEMPLATE_ID = 'd1d10000-0000-0000-0000-aaaaaaaaaaaa';
    const SITEMETADATA_SECTION_ID = 'd1d10000-0000-0000-0000-bbbbbbbbbbbb';
    const CHANGE_FREQ_FIELD_ID = 'd1d10000-0000-0000-0000-cccccccccccc';
    const PRIORITY_FIELD_ID = 'd1d10000-0000-0000-0000-dddddddddddd';
    const REF_TEMPLATE_ID = 'd1d10000-0000-0000-0000-eeeeeeeeeeee';

    // The SXA _Sitemap base template lives under the SiteMetadata path
    // Mockingbird keys off.
    const sitemapTemplate = makeItem({
      id: SITEMETADATA_TEMPLATE_ID,
      path: '/sitecore/templates/Foundation/Experience Accelerator/SiteMetadata/_Sitemap',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const sitemapSection = makeItem({
      id: SITEMETADATA_SECTION_ID,
      parent: SITEMETADATA_TEMPLATE_ID,
      path: '/sitecore/templates/Foundation/Experience Accelerator/SiteMetadata/_Sitemap/Sitemap',
      template: TEMPLATE_SECTION_TEMPLATE_ID,
    });
    const changeFreqField = makeItem({
      id: CHANGE_FREQ_FIELD_ID,
      parent: SITEMETADATA_SECTION_ID,
      path: '/sitecore/templates/Foundation/Experience Accelerator/SiteMetadata/_Sitemap/Sitemap/ChangeFrequency',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Droplist' }],
    });
    const priorityField = makeItem({
      id: PRIORITY_FIELD_ID,
      parent: SITEMETADATA_SECTION_ID,
      path: '/sitecore/templates/Foundation/Experience Accelerator/SiteMetadata/_Sitemap/Sitemap/Priority',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Number' }],
    });

    // Reference template inherits _Sitemap via __Base template field.
    const refTemplate = makeItem({
      id: REF_TEMPLATE_ID,
      path: '/sitecore/templates/FaqGroup',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [
        { id: FIELD_IDS.baseTemplate, hint: '__Base template', value: `{${SITEMETADATA_TEMPLATE_ID.toUpperCase()}}` },
      ],
    });

    const refItem = makeItem({
      id: 'd1d10000-0000-0000-0000-ffffffffffff',
      path: '/sitecore/content/site/Home/Data/FaqGroups/dlvm-migration',
      template: REF_TEMPLATE_ID,
    });

    const engine = buildEngine([
      sitemapTemplate,
      sitemapSection,
      changeFreqField,
      priorityField,
      refTemplate,
      refItem,
    ]);

    const result = formatReferenceItem(refItem, engine, '', '/sitecore/content/site/Home');
    expect(result.fields.ChangeFrequency).toBeUndefined();
    expect(result.fields.Priority).toBeUndefined();
  });
});

/**
 * Item 11: referenced-item field cascade. Sitecore's MultiListFieldSerializer
 * runs each ref item through `DefaultItemSerializer` → `item.Fields[id].Value`
 * which cascades to `__Standard Values` automatically. Mockingbird's original
 * `formatReferenceItem` read stored values directly, skipping the cascade —
 * so a referenced Tag whose template's SV carries `Color = "blue"` would
 * render `Color: {value: ""}` at the reference level even though prod Edge
 * emits `{value: "blue"}`.
 */
describe('formatReferenceItem — __Standard Values cascade (item 11)', () => {
  const REF_TEMPLATE_ID = 'affe0000-0000-0000-0000-aaaaaaaaaaaa';
  const REF_SECTION_ID = 'affe0000-0000-0000-0000-bbbbbbbbbbbb';
  const REF_FIELD_ID = 'affe0000-0000-0000-0000-cccccccccccc';

  function buildRefTemplate(): ScsItem[] {
    const template = makeItem({
      id: REF_TEMPLATE_ID,
      path: '/sitecore/templates/RefTemplate',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const section = makeItem({
      id: REF_SECTION_ID,
      parent: REF_TEMPLATE_ID,
      path: '/sitecore/templates/RefTemplate/Content',
      template: TEMPLATE_SECTION_TEMPLATE_ID,
    });
    const field = makeItem({
      id: REF_FIELD_ID,
      parent: REF_SECTION_ID,
      path: '/sitecore/templates/RefTemplate/Content/Color',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });
    return [template, section, field];
  }

  it('inherits a shared SV default when the referenced item has no stored value', () => {
    const [template, section, field] = buildRefTemplate();
    const sv = makeItem({
      id: 'affe1000-0000-0000-0000-000000000001',
      parent: REF_TEMPLATE_ID,
      path: '/sitecore/templates/RefTemplate/__Standard Values',
      template: REF_TEMPLATE_ID,
      sharedFields: [{ id: REF_FIELD_ID, hint: 'Color', value: 'blue' }],
    });
    const refItem = makeItem({
      id: 'affe2000-0000-0000-0000-000000000002',
      path: '/sitecore/content/site/Data/Tags/Tag1',
      template: REF_TEMPLATE_ID,
    });
    const engine = buildEngine([template, section, field, sv, refItem]);
    const out = formatReferenceItem(refItem, engine, '', '/sitecore/content/site');
    expect(out.fields.Color).toEqual({ value: 'blue' });
  });

  it('inherits a versioned SV default when the referenced item has no stored value', () => {
    const [template, section, field] = buildRefTemplate();
    const sv = makeItem({
      id: 'affe1000-0000-0000-0000-000000000003',
      parent: REF_TEMPLATE_ID,
      path: '/sitecore/templates/RefTemplate/__Standard Values',
      template: REF_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: REF_FIELD_ID, hint: 'Color', value: 'green' }],
        }],
      }],
    });
    const refItem = makeItem({
      id: 'affe2000-0000-0000-0000-000000000004',
      path: '/sitecore/content/site/Data/Tags/Tag2',
      template: REF_TEMPLATE_ID,
    });
    const engine = buildEngine([template, section, field, sv, refItem]);
    const out = formatReferenceItem(refItem, engine, '', '/sitecore/content/site');
    expect(out.fields.Color).toEqual({ value: 'green' });
  });

  it('prefers stored value over SV default', () => {
    const [template, section, field] = buildRefTemplate();
    const sv = makeItem({
      id: 'affe1000-0000-0000-0000-000000000005',
      parent: REF_TEMPLATE_ID,
      path: '/sitecore/templates/RefTemplate/__Standard Values',
      template: REF_TEMPLATE_ID,
      sharedFields: [{ id: REF_FIELD_ID, hint: 'Color', value: 'blue' }],
    });
    const refItem = makeItem({
      id: 'affe2000-0000-0000-0000-000000000006',
      path: '/sitecore/content/site/Data/Tags/Tag3',
      template: REF_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: REF_FIELD_ID, hint: 'Color', value: 'red' }],
        }],
      }],
    });
    const engine = buildEngine([template, section, field, sv, refItem]);
    const out = formatReferenceItem(refItem, engine, '', '/sitecore/content/site');
    expect(out.fields.Color).toEqual({ value: 'red' });
  });

  it('honours explicit stored empty as suppression — does NOT cascade to SV', () => {
    // Matches SearchBox.TextBoxText behaviour: author sets "" to override a
    // template SV default; the reference-level emission must honour that.
    const [template, section, field] = buildRefTemplate();
    const sv = makeItem({
      id: 'affe1000-0000-0000-0000-000000000007',
      parent: REF_TEMPLATE_ID,
      path: '/sitecore/templates/RefTemplate/__Standard Values',
      template: REF_TEMPLATE_ID,
      sharedFields: [{ id: REF_FIELD_ID, hint: 'Color', value: 'blue' }],
    });
    const refItem = makeItem({
      id: 'affe2000-0000-0000-0000-000000000008',
      path: '/sitecore/content/site/Data/Tags/Tag4',
      template: REF_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: REF_FIELD_ID, hint: 'Color', value: '' }],
        }],
      }],
    });
    const engine = buildEngine([template, section, field, sv, refItem]);
    const out = formatReferenceItem(refItem, engine, '', '/sitecore/content/site');
    expect(out.fields.Color).toEqual({ value: '' });
  });
});

describe('resolveItem — registry fallback (0.4.0.11 item 3)', () => {
  it('resolveItem: falls back to registry when item is not in the tree (0.4.0.11 item 3)', () => {
    // Real-world fixture: NavigationFilter on release-listing pages
    // references items under /sitecore/system/Settings/Foundation/Experience
    // Accelerator/Navigation/Navigation Filters/*, which live in the
    // registry (data/registry.json) but not in the serialized tree.
    //
    // resolveItem now falls back to registry; formatMultilist then emits
    // a JssReferenceItem with the synthesized data.
    const navFilterId = 'c0a86b67-0002-0000-0000-000000000001';
    const engine = buildEngineWithRegistry({
      tree: [],
      registry: [{
        id: navFilterId,
        name: 'Breadcrumb Navigation',
        parent: 'parent-guid',
        template: 'template-guid',
        path: '/sitecore/system/Settings/Foundation/Experience Accelerator/Navigation/Navigation Filters/Breadcrumb Navigation',
        database: 'master',
        sharedFields: {},
      }],
    });
    // Use a Multilist field value referencing the registry-only item.
    const xml = `{${navFilterId.toUpperCase()}}`;
    const result = formatField(xml, 'Multilist', engine, '', '') as any;
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(navFilterId);
    // Name derivation: itemName(path) pulls last segment.
    expect(result[0].name).toBe('Breadcrumb Navigation');
  });

  it('resolveItem: tree-first discipline — tree item wins over registry (0.4.0.11 item 3)', () => {
    // Regression guard: items present in the tree must resolve through
    // the tree, not the registry. Synthesis runs only on the fallback
    // branch; a tree-resolved item emits verbatim.
    const itemId = 'c0a86b67-0003-0000-0000-000000000001';
    const treeItem = makeItem({
      id: itemId,
      path: '/sitecore/content/site/regular-item',
    });
    const engine = buildEngineWithRegistry({
      tree: [treeItem],
      registry: [{
        id: itemId,
        name: 'different-name',
        parent: 'different-parent',
        template: 'different-template',
        path: '/some/different/path',
        database: 'master',
        sharedFields: {},
      }],
    });
    const xml = `{${itemId.toUpperCase()}}`;
    const result = formatField(xml, 'Multilist', engine, '', '') as any;
    expect(result).toHaveLength(1);
    // Tree path wins, not the registry path.
    expect(result[0].name).toBe('regular-item');
  });

  it('resolveItem: returns undefined when neither tree nor registry has the id (0.4.0.11 item 3)', () => {
    // Unresolvable references silently drop — pre-existing formatMultilist
    // behavior. Registry fallback must not break this.
    const engine = buildEngineWithRegistry({ tree: [], registry: [] });
    const xml = '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}';
    const result = formatField(xml, 'Multilist', engine, '', '') as any;
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe('SCT overlay — end-to-end', () => {
  const NAV_TITLE_FIELD_ID = '4e0720e9-9d50-4ddc-87cf-ecd65e8e94c8';

  it('resolveFieldValue routes through SCT overlay when present', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: 'News Article Page' },
    });

    // Subject item has NO stored NavigationTitle — SCT should provide it.
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/article-one',
      template: pageTpl,
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');

    const index = buildItemValueIndex(subjectItem, 'en');
    const value = resolveFieldValue(
      index,
      NAV_TITLE_FIELD_ID,
      'NavigationTitle',
      subjectItem,
      'en',
      fixture.engine,
      '/sitecore/content/tenant/site',
    );
    expect(value).toBe('News Article Page');
  });

  it('stored value on subject item wins over SCT', () => {
    const fixture = buildSctFixture({ tenantName: 'tenant', sites: [{ name: 'site' }] });
    addSettingsAndSctFolder(fixture, '/sitecore/content/tenant/site');
    const pageTpl = addPerSiteTemplate(fixture.engine, 'News Article Page');
    addSctItem({
      engine: fixture.engine,
      siteRootPath: '/sitecore/content/tenant/site',
      fileName: 'News Article Page',
      subjectTemplateId: pageTpl,
      fields: { [NAV_TITLE_FIELD_ID]: 'Default News Title' },
    });

    // Subject item has stored NavigationTitle — should win.
    const subjectItem = makeItem({
      id: 'b0000099-0000-0000-0000-000000000000',
      parent: 'ba000010-0000-0000-0000-000000000000',
      path: '/sitecore/content/tenant/site/article-one',
      template: pageTpl,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{ id: NAV_TITLE_FIELD_ID, hint: 'NavigationTitle', value: 'Authored Override' }],
        }],
      }],
    });
    fixture.engine.getTree().addItem(subjectItem, '/fake/sub.yml');

    const index = buildItemValueIndex(subjectItem, 'en');
    const value = resolveFieldValue(
      index,
      NAV_TITLE_FIELD_ID,
      'NavigationTitle',
      subjectItem,
      'en',
      fixture.engine,
      '/sitecore/content/tenant/site',
    );
    expect(value).toBe('Authored Override');
  });
});
