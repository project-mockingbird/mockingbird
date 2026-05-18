import { describe, it, expect } from 'vitest';
import {
  resolveViaRcrItem,
  RCR_FIELD_ID,
  RCR_TYPE_FIELD_ID,
  RCR_QUERY_FIELD_ID,
  RCR_USE_CONTEXT_FIELD_ID,
  DEFAULT_RCR_TYPE,
} from '../../../src/engine/layout/contents-resolvers.js';
import { buildEngine, makeItem } from './_helpers.js';
import { TEMPLATE_TEMPLATE_ID, TEMPLATE_SECTION_TEMPLATE_ID, TEMPLATE_FIELD_TEMPLATE_ID, FIELD_IDS, RENDERING_TEMPLATE_ID } from '../../../src/engine/constants.js';

const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

const EXCLUDE_FOLDER_TMPL = 'dc341f6b-784e-45e5-97d1-faa87efa6f06';

// Minimal template with a single Title field so formatItemFields produces a
// stable shape. The template below mirrors the shape existing tests use.
const pageTemplateId = 'fa11fa11-fa11-fa11-fa11-fa11fa11fa11';
function makePageTemplate() {
  const tmpl = makeItem({
    id: pageTemplateId,
    path: '/sitecore/templates/Test/LeafPage',
    template: TEMPLATE_TEMPLATE_ID,
  });
  const section = makeItem({
    id: 'fa22fa22-fa22-fa22-fa22-fa22fa22fa22',
    parent: pageTemplateId,
    path: '/sitecore/templates/Test/LeafPage/Data',
    template: TEMPLATE_SECTION_TEMPLATE_ID,
  });
  const titleField = makeItem({
    id: 'fa33fa33-fa33-fa33-fa33-fa33fa33fa33',
    parent: section.id,
    path: '/sitecore/templates/Test/LeafPage/Data/Title',
    template: TEMPLATE_FIELD_TEMPLATE_ID,
    sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
  });
  return [tmpl, section, titleField];
}

function makeRcrItem(opts: { id: string; query: string; useContext: boolean; type?: string }) {
  return makeItem({
    id: opts.id,
    path: `/sitecore/system/Modules/Layout Service/Rendering Contents Resolvers/${opts.id}`,
    sharedFields: [
      { id: RCR_TYPE_FIELD_ID, hint: 'Type', value: opts.type ?? DEFAULT_RCR_TYPE },
      { id: RCR_QUERY_FIELD_ID, hint: 'ItemSelectorQuery', value: opts.query },
      { id: RCR_USE_CONTEXT_FIELD_ID, hint: 'UseContextItem', value: opts.useContext ? '1' : '0' },
    ],
  });
}

function makeRenderingItem(opts: { id: string; rcrId: string }) {
  return makeItem({
    id: opts.id,
    path: `/sitecore/layout/Renderings/${opts.id}`,
    template: RENDERING_TEMPLATE_ID,
    sharedFields: [{ id: RCR_FIELD_ID, hint: 'Rendering Contents Resolver', value: `{${opts.rcrId.toUpperCase()}}` }],
  });
}

function makePage(opts: { id: string; parentId: string; name: string; title: string; sortOrder: number; template?: string }) {
  return makeItem({
    id: opts.id,
    parent: opts.parentId,
    template: opts.template ?? pageTemplateId,
    path: `/sitecore/content/site/Home/section/${opts.name}`,
    sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: String(opts.sortOrder) }],
    languages: [
      {
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields: [{ id: 'fa33fa33-fa33-fa33-fa33-fa33fa33fa33', hint: 'Title', value: opts.title }] }],
      },
    ],
  });
}

describe('resolveViaRcrItem - happy path (InteractionNavigation / UseContextItem=1)', () => {
  function scenario() {
    const templateItems = makePageTemplate();

    // Parent folder uses the "exclude" template so it's filtered out when
    // (incidentally) iterating siblings from the context's perspective.
    const folder = makeItem({
      id: 'fold0000-0000-0000-0000-000000000001',
      path: '/sitecore/content/site/Home/section',
      template: EXCLUDE_FOLDER_TMPL,
    });

    const readPage = makePage({ id: 'read0000-0000-0000-0000-000000000001', parentId: folder.id, name: 'read', title: 'Read', sortOrder: 100 });
    const searchPage = makePage({ id: 'srch0000-0000-0000-0000-000000000002', parentId: folder.id, name: 'search', title: 'Search', sortOrder: 200 });
    const eventPage = makePage({ id: 'evnt0000-0000-0000-0000-000000000003', parentId: folder.id, name: 'event-streaming', title: 'Event Streaming', sortOrder: 300 });

    // A metadata-ish sibling with the EXCLUDED template - must not appear in items.
    const excludedSibling = makeItem({
      id: 'excl0000-0000-0000-0000-000000000001',
      parent: folder.id,
      path: '/sitecore/content/site/Home/section/metadata',
      template: EXCLUDE_FOLDER_TMPL,
    });

    const rcr = makeRcrItem({
      id: '7e5919e7-a96f-430a-bd74-1c8ef96030d1',
      query: "../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']",
      useContext: true,
    });
    const rendering = makeRenderingItem({ id: 'rend0000-0000-0000-0000-000000000001', rcrId: rcr.id });

    const engine = buildEngine([
      ...templateItems,
      folder, readPage, searchPage, eventPage, excludedSibling,
      rcr, rendering,
    ]);
    return { engine, rendering, rcr, folder, readPage, searchPage, eventPage, excludedSibling };
  }

  it('returns items array of included siblings sorted by __Sortorder', () => {
    const { engine, rendering, eventPage } = scenario();
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: eventPage,
      datasourceItem: undefined,
      engine,
      mediaBaseUrl: '',
      siteRootPath: '/sitecore/content/site/Home',
    });

    expect(out).not.toBeNull();
    const items = (out!.items as unknown as Array<{ id: string; url: string; name: string; displayName: string; fields: Record<string, unknown> }>);
    expect(items.map(i => i.name)).toEqual(['read', 'search', 'event-streaming']);
  });

  it('projects {id, url, name, displayName, fields} per item', () => {
    const { engine, rendering, eventPage } = scenario();
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: eventPage,
      datasourceItem: undefined,
      engine,
      mediaBaseUrl: '',
      siteRootPath: '/sitecore/content/site/Home',
    });

    const items = (out!.items as unknown as Array<Record<string, unknown>>);
    const first = items[0] as { id: string; url: string; name: string; displayName: string; fields: Record<string, { value: string }> };
    // Fixture ids use readable prefixes (e.g. "read0000-…") so the shape check
    // accepts any lowercase alphanumeric-dashed GUID form, not strict hex.
    expect(first.id).toMatch(/^[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}$/);
    expect(first.url).toBe('/section/read');
    expect(first.name).toBe('read');
    expect(first.displayName).toBe('read');
    expect(first.fields.Title.value).toBe('Read');
  });

  it('excludes siblings whose template matches the exclusion GUID', () => {
    const { engine, rendering, eventPage, excludedSibling } = scenario();
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: eventPage,
      datasourceItem: undefined,
      engine,
      mediaBaseUrl: '',
      siteRootPath: '/sitecore/content/site/Home',
    });
    const items = (out!.items as unknown as Array<{ id: string }>);
    expect(items.map(i => i.id)).not.toContain(excludedSibling.id);
  });
});

describe('resolveViaRcrItem - fall-through cases return null', () => {
  function minimalEngine() {
    const folder = makeItem({
      id: 'fold0001-0000-0000-0000-000000000001',
      path: '/sitecore/content/x',
      template: EXCLUDE_FOLDER_TMPL,
    });
    const page = makePage({ id: 'page0001-0000-0000-0000-000000000001', parentId: folder.id, name: 'p', title: 'P', sortOrder: 0 });
    return { folder, page };
  }

  it('rendering item not found → null', () => {
    const { page } = minimalEngine();
    const engine = buildEngine([...makePageTemplate(), page]);
    const out = resolveViaRcrItem({
      renderingId: 'dead0000-0000-0000-0000-000000000000',
      contextItem: page,
      datasourceItem: undefined,
      engine, mediaBaseUrl: '', siteRootPath: '/sitecore/content',
    });
    expect(out).toBeNull();
  });

  it('rendering has no RCR field → null', () => {
    const rendering = makeItem({ id: 'rend0002-0000-0000-0000-000000000001', path: '/r', template: RENDERING_TEMPLATE_ID });
    const { page } = minimalEngine();
    const engine = buildEngine([...makePageTemplate(), page, rendering]);
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: page, datasourceItem: undefined,
      engine, mediaBaseUrl: '', siteRootPath: '/sitecore/content',
    });
    expect(out).toBeNull();
  });

  it('RCR item not found → null', () => {
    const rendering = makeRenderingItem({ id: 'rend0003-0000-0000-0000-000000000001', rcrId: 'deadbeef-0000-0000-0000-000000000000' });
    const { page } = minimalEngine();
    const engine = buildEngine([...makePageTemplate(), page, rendering]);
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: page, datasourceItem: undefined,
      engine, mediaBaseUrl: '', siteRootPath: '/sitecore/content',
    });
    expect(out).toBeNull();
  });

  it('RCR type is not the default → null', () => {
    const rcr = makeRcrItem({
      id: 'rcr00004-0000-0000-0000-000000000001',
      query: "../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']",
      useContext: true,
      type: 'Some.Other.Type, Some.Assembly',
    });
    const rendering = makeRenderingItem({ id: 'rend0004-0000-0000-0000-000000000001', rcrId: rcr.id });
    const { page } = minimalEngine();
    const engine = buildEngine([...makePageTemplate(), page, rendering, rcr]);
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: page, datasourceItem: undefined,
      engine, mediaBaseUrl: '', siteRootPath: '/sitecore/content',
    });
    expect(out).toBeNull();
  });

  it('ItemSelectorQuery not registered in RCR_QUERIES → null', () => {
    const rcr = makeRcrItem({
      id: 'rcr00005-0000-0000-0000-000000000001',
      query: "./bogus-unregistered",
      useContext: true,
    });
    const rendering = makeRenderingItem({ id: 'rend0005-0000-0000-0000-000000000001', rcrId: rcr.id });
    const { page } = minimalEngine();
    const engine = buildEngine([...makePageTemplate(), page, rendering, rcr]);
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: page, datasourceItem: undefined,
      engine, mediaBaseUrl: '', siteRootPath: '/sitecore/content',
    });
    expect(out).toBeNull();
  });

  it('base item (context when UseContextItem=1) is undefined → null', () => {
    const rcr = makeRcrItem({
      id: 'rcr00006-0000-0000-0000-000000000001',
      query: "../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']",
      useContext: true,
    });
    const rendering = makeRenderingItem({ id: 'rend0006-0000-0000-0000-000000000001', rcrId: rcr.id });
    const engine = buildEngine([...makePageTemplate(), rendering, rcr]);
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: undefined, datasourceItem: undefined,
      engine, mediaBaseUrl: '', siteRootPath: '/sitecore/content',
    });
    expect(out).toBeNull();
  });

  it('UseContextItem=0 uses datasourceItem as base', () => {
    const { folder, page } = minimalEngine();
    const rcr = makeRcrItem({
      id: 'rcr00007-0000-0000-0000-000000000001',
      query: "../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']",
      useContext: false,
    });
    const rendering = makeRenderingItem({ id: 'rend0007-0000-0000-0000-000000000001', rcrId: rcr.id });
    const engine = buildEngine([...makePageTemplate(), folder, page, rendering, rcr]);
    const out = resolveViaRcrItem({
      renderingId: rendering.id,
      contextItem: undefined,
      datasourceItem: page,
      engine, mediaBaseUrl: '', siteRootPath: '/sitecore/content',
    });
    expect(out).not.toBeNull();
    const items = (out!.items as unknown as Array<{ name: string }>);
    expect(items.map(i => i.name)).toEqual(['p']);
  });
});

describe('resolveViaRcrItem - Datasource Item Children Resolver (0.4.0.11)', () => {
  // OOTB Sitecore class-based RCR "Datasource Item Children Resolver" at
  // /sitecore/system/Modules/Layout Service/Rendering Contents Resolvers/
  // Datasource Item Children Resolver (id {2F5C334E-5615-423C-8281-9FC180191302}).
  // Returns datasource.Children directly - no ItemSelectorQuery. Registered
  // by id because the registry extraction doesn't carry the item's Type field.

  const RCR_FIELD_ID = 'b0b15510-b138-470e-8f33-8da2e228aafe';
  const DATASOURCE_ITEM_CHILDREN_RCR_ID = '{2F5C334E-5615-423C-8281-9FC180191302}';

  it('dispatches by RCR id; returns sorted children', () => {
    const renderingId = 'abcdef12-0000-0000-0000-000000000001';
    const rendering = makeItem({
      id: renderingId,
      path: '/sitecore/layout/Renderings/Test',
      sharedFields: [
        { id: RCR_FIELD_ID, hint: 'Rendering Contents Resolver', value: DATASOURCE_ITEM_CHILDREN_RCR_ID },
      ],
    });

    const datasourceId = 'abcdef12-0000-0000-0000-000000000002';
    const datasource = makeItem({
      id: datasourceId,
      path: '/sitecore/content/tokens',
    });

    // Three children in non-alphabetical insertion order - expect alphabetical emission.
    const c1 = makeItem({ id: 'c1', path: '/sitecore/content/tokens/Zeta', parent: datasourceId });
    const c2 = makeItem({ id: 'c2', path: '/sitecore/content/tokens/Alpha', parent: datasourceId });
    const c3 = makeItem({ id: 'c3', path: '/sitecore/content/tokens/Beta', parent: datasourceId });

    const engine = buildEngine([rendering, datasource, c1, c2, c3]);

    const result = resolveViaRcrItem({
      renderingId,
      contextItem: datasource,
      datasourceItem: datasource,
      engine,
      mediaBaseUrl: '',
      siteRootPath: '/sitecore/content',
    });
    expect(result).not.toBeNull();
    const items = result!.items as unknown as Array<{ name: string }>;
    expect(items.map(i => i.name)).toEqual(['Alpha', 'Beta', 'Zeta']);
  });

  it('non-matching RCR id falls through to existing dispatch', () => {
    // Regression guard: only the known id short-circuits; every other RCR
    // id continues through the Type-field + query lookup path.
    const renderingId = 'abcdef12-0000-0000-0000-000000000010';
    const rendering = makeItem({
      id: renderingId,
      path: '/sitecore/layout/Renderings/Other',
      sharedFields: [
        { id: RCR_FIELD_ID, hint: 'Rendering Contents Resolver', value: '{11111111-1111-1111-1111-111111111111}' },
      ],
    });
    const datasource = makeItem({ id: 'ds2', path: '/sitecore/content/ds2' });
    const engine = buildEngine([rendering, datasource]);
    // Unknown RCR id not in tree or known-RCR map → falls through; returns null.
    const result = resolveViaRcrItem({
      renderingId,
      contextItem: datasource,
      datasourceItem: datasource,
      engine,
      mediaBaseUrl: '',
      siteRootPath: '/sitecore/content',
    });
    expect(result).toBeNull();
  });

  it('returns null when datasourceItem is undefined', () => {
    // Regression guard for the `!datasourceItem` short-circuit branch.
    // A rendering with this RCR id but a missing/dangling datasource must
    // return null (falls to default schema emission downstream), not throw
    // and not emit `{ items: [] }` as a pseudo-success.
    const renderingId = 'abcdef12-0000-0000-0000-000000000003';
    const rendering = makeItem({
      id: renderingId,
      path: '/sitecore/layout/Renderings/NoDatasource',
      sharedFields: [
        { id: RCR_FIELD_ID, hint: 'Rendering Contents Resolver', value: DATASOURCE_ITEM_CHILDREN_RCR_ID },
      ],
    });
    const engine = buildEngine([rendering]);
    const result = resolveViaRcrItem({
      renderingId,
      contextItem: undefined,
      datasourceItem: undefined,
      engine,
      mediaBaseUrl: '',
      siteRootPath: '/sitecore/content',
    });
    expect(result).toBeNull();
  });
});
