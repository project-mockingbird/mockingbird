import { describe, expect, it } from 'vitest';
import { makeItem, buildEngine, seedRenderingPlaceholders } from '../layout/_helpers.js';
import { getComposedLayout } from '../../../src/engine/renderings/composed-layout.js';
import { resolveLayout } from '../../../src/engine/layout/index.js';
import {
  FINAL_RENDERINGS_FIELD_ID,
  PARTIAL_DESIGNS_FIELD_ID,
  TEMPLATES_MAPPING_FIELD_ID,
  SIGNATURE_FIELD_ID,
} from '../../../src/engine/layout/page-design.js';
import type { Engine } from '../../../src/engine/index.js';
import type { ScsItem } from '../../../src/engine/types.js';

const DEV = 'FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3';

// Stable GUIDs for fixtures.
const PAGE_ID = 'eeeeeeee-0000-0000-0000-0000000000aa';
const SITE_ROOT = '/sitecore/content/site';
const PAGE_PATH = '/sitecore/content/site/page';
// findPageDesignsNode looks at <siteParent>/Presentation/Page Designs; with
// siteRoot = /sitecore/content/site the parent is /sitecore/content.
const PAGE_DESIGNS_ROOT_PATH = '/sitecore/content/Presentation/Page Designs';

/** Wrap rendering tags inside a standard device block. */
function deviceBlock(inner: string): string {
  return `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p" p:p="1"><d id="{${DEV}}">${inner}</d></r>`;
}

/** Build a single self-closing <r> tag string. */
function rTag(opts: { uid: string; id: string; ph: string; par?: string; ds?: string }): string {
  return `<r uid="{${opts.uid.toUpperCase()}}" s:id="{${opts.id.toUpperCase()}}" s:ph="${opts.ph}" s:ds="${opts.ds ?? ''}" s:par="${opts.par ?? ''}" />`;
}

/** Build an en/version-1 language carrying a __Final Renderings field. */
function enV1FinalRenderings(xml: string) {
  return [{
    language: 'en',
    fields: [],
    versions: [{
      version: 1,
      fields: [{ id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: xml }],
    }],
  }];
}

/** Double-URL-encode a TemplatesMapping pair (the field's on-disk form). */
function mapping(templateId: string, pageDesignId: string): string {
  return encodeURIComponent(encodeURIComponent(`{${templateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`));
}

describe('getComposedLayout', () => {
  it('surfaces layout root placeholders for a page with empty own renderings', () => {
    // A page with no __Renderings (so getLayoutId falls back to the JSS Layout)
    // and no __Final Renderings (no own entries, no page design) must still
    // surface the three headless root slots so components can be added.
    const page = makeItem({ id: PAGE_ID, path: '/sitecore/content/site/home' });
    const engine = buildEngine([page]);

    const out = getComposedLayout(engine, PAGE_ID, SITE_ROOT, 'en');

    expect(out.placeholders.map(p => p.value)).toEqual(
      expect.arrayContaining(['headless-header', 'headless-main', 'headless-footer']),
    );
    expect(out.entries).toHaveLength(0);
  });

  // -- Page design composition fixture (Header partial + page's own rendering) --

  const PAGE_TEMPLATE = 'aaaa1111-0000-0000-0000-000000000001';
  const PAGE_DESIGN_ID = 'dddd1111-0000-0000-0000-000000000001';
  const PARTIAL_ID = 'bbbb1111-0000-0000-0000-000000000001';
  const PARTIAL_PATH = '/sitecore/content/site/Presentation/Partial Designs/Header';

  function buildPageWithPageDesign(): Engine {
    const partial = makeItem({
      id: PARTIAL_ID,
      path: PARTIAL_PATH,
      languages: enV1FinalRenderings(deviceBlock(
        rTag({ uid: 'pa110000-0000-0000-0000-000000000001', id: '11111111-0000-0000-0000-000000000001', ph: 'headless-header' }),
      )),
    });
    const pageDesign = makeItem({
      id: PAGE_DESIGN_ID,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{ id: PARTIAL_DESIGNS_FIELD_ID, hint: 'PartialDesigns', value: `{${PARTIAL_ID.toUpperCase()}}` }],
    });
    const pageDesignsRoot = makeItem({
      id: 'ffff1111-0000-0000-0000-000000000001',
      path: PAGE_DESIGNS_ROOT_PATH,
      sharedFields: [{ id: TEMPLATES_MAPPING_FIELD_ID, hint: 'TemplatesMapping', value: mapping(PAGE_TEMPLATE, PAGE_DESIGN_ID) }],
    });
    const page = makeItem({
      id: PAGE_ID,
      path: PAGE_PATH,
      template: PAGE_TEMPLATE,
      languages: enV1FinalRenderings(deviceBlock(
        rTag({ uid: 'ow110000-0000-0000-0000-000000000001', id: '22222222-0000-0000-0000-000000000001', ph: 'headless-main' }),
      )),
    });
    return buildEngine([partial, pageDesign, pageDesignsRoot, page]);
  }

  it('tags partial-design entries owner=partial and page entries owner=page', () => {
    const engine = buildPageWithPageDesign();
    const out = getComposedLayout(engine, PAGE_ID, SITE_ROOT, 'en');

    const partial = out.entries.find(e => e.owner === 'partial');
    expect(partial).toBeDefined();
    expect(partial!.ownerItemPath).not.toBe(PAGE_PATH);
    expect(partial!.ownerItemPath).toBe(PARTIAL_PATH);
    expect(partial!.ownerDisplayName).toBe('Header');

    const page = out.entries.find(e => e.owner === 'page');
    expect(page).toBeDefined();
    expect(page!.ownerItemPath).toBe(PAGE_PATH);
    expect(page!.ownerDisplayName).toBeUndefined();
  });

  it('does not alter resolveLayout output for an unedited page', async () => {
    const engine = buildPageWithPageDesign();
    const before = await resolveLayout('/page', engine, { siteRootPath: SITE_ROOT, mediaBaseUrl: '' });
    getComposedLayout(engine, PAGE_ID, SITE_ROOT, 'en');
    const after = await resolveLayout('/page', engine, { siteRootPath: SITE_ROOT, mediaBaseUrl: '' });
    expect(after).toEqual(before);
  });

  // -- Wrapped-partial fixture for the add-path idempotency keystone --

  const WRAP_TEMPLATE = 'aaaa2222-0000-0000-0000-000000000002';
  const WRAP_DESIGN_ID = 'dddd2222-0000-0000-0000-000000000002';
  const WRAP_PARTIAL_ID = 'bbbb2222-0000-0000-0000-000000000002';
  const CONTAINER_ID = 'cccc2222-0000-0000-0000-000000000002';
  const RICHTEXT_ID = '99999999-0000-0000-0000-0000000000c1';

  function buildPageWithWrappedPartial(): Engine {
    // A partial with Signature 'body' whose Container sits at headless-main and
    // declares container-{*}; composition wraps it as sxa-body and the Container
    // exposes /headless-main/sxa-body/container-1.
    const partial = makeItem({
      id: WRAP_PARTIAL_ID,
      path: '/sitecore/content/site/Presentation/Partial Designs/Body',
      sharedFields: [{ id: SIGNATURE_FIELD_ID, hint: 'Signature', value: 'body' }],
      languages: enV1FinalRenderings(deviceBlock(
        rTag({ uid: 'co220000-0000-0000-0000-000000000001', id: CONTAINER_ID, ph: 'headless-main', par: 'DynamicPlaceholderId=1' }),
      )),
    });
    const pageDesign = makeItem({
      id: WRAP_DESIGN_ID,
      path: '/sitecore/content/site/Presentation/Page Designs/WrapDesign',
      sharedFields: [{ id: PARTIAL_DESIGNS_FIELD_ID, hint: 'PartialDesigns', value: `{${WRAP_PARTIAL_ID.toUpperCase()}}` }],
    });
    const pageDesignsRoot = makeItem({
      id: 'ffff2222-0000-0000-0000-000000000002',
      path: PAGE_DESIGNS_ROOT_PATH,
      sharedFields: [{ id: TEMPLATES_MAPPING_FIELD_ID, hint: 'TemplatesMapping', value: mapping(WRAP_TEMPLATE, WRAP_DESIGN_ID) }],
    });
    const page = makeItem({ id: PAGE_ID, path: PAGE_PATH, template: WRAP_TEMPLATE });
    const engine = buildEngine([partial, pageDesign, pageDesignsRoot, page]);
    seedRenderingPlaceholders(engine, CONTAINER_ID, ['container-{*}']);
    return engine;
  }

  /** Simulate the editor add: append a page entry at the placeholder verbatim. */
  function writePageRenderingAt(engine: Engine, pageId: string, opts: { renderingId: string; placeholder: string }): void {
    const item: ScsItem = engine.getItemById(pageId)!.item;
    const tag = rTag({ uid: 'add00000-0000-0000-0000-000000000001', id: opts.renderingId, ph: opts.placeholder });

    let lang = item.languages.find(l => l.language === 'en');
    if (!lang) { lang = { language: 'en', fields: [], versions: [] }; item.languages.push(lang); }
    let ver = lang.versions.find(v => v.version === 1);
    if (!ver) { ver = { version: 1, fields: [] }; lang.versions.push(ver); }
    const field = ver.fields.find(f => f.id === FINAL_RENDERINGS_FIELD_ID);
    if (field?.value?.includes('</d>')) {
      field.value = field.value.replace('</d>', `${tag}</d>`);
    } else if (field) {
      field.value = deviceBlock(tag);
    } else {
      ver.fields.push({ id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: deviceBlock(tag) });
    }
  }

  it('stores a component at a composed (post-wrapper) placeholder path idempotently', () => {
    const engine = buildPageWithWrappedPartial();

    const composedBefore = getComposedLayout(engine, PAGE_ID, SITE_ROOT, 'en');
    const target = composedBefore.placeholders.find(p => /sxa-.*\/container-1$/.test(p.value));
    expect(target).toBeDefined();

    writePageRenderingAt(engine, PAGE_ID, { renderingId: RICHTEXT_ID, placeholder: target!.value });

    const composedAfter = getComposedLayout(engine, PAGE_ID, SITE_ROOT, 'en');
    const added = composedAfter.entries.find(e => e.renderingId === RICHTEXT_ID);
    expect(added).toBeDefined();
    expect(added!.owner).toBe('page');
    // rewriteThroughWrapper leaves an already-wrapped path alone -> idempotent.
    expect(added!.placeholder).toBe(target!.value);
  });
});
