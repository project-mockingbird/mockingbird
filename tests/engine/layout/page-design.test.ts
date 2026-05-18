import { describe, it, expect } from 'vitest';
import {
  decodeTemplatesMapping,
  findPageDesignsNode,
  resolvePageDesignId,
  getPartialRenderingEntries,
  getCombinedRenderingEntries,
  readVersionedField,
  FINAL_RENDERINGS_FIELD_ID,
  PAGE_DESIGN_OVERRIDE_FIELD_ID,
  TEMPLATES_MAPPING_FIELD_ID,
  PARTIAL_DESIGNS_FIELD_ID,
  SIGNATURE_FIELD_ID,
  BASE_PARTIAL_DESIGN_FIELD_ID,
  PARTIAL_DESIGN_DYNAMIC_PLACEHOLDER_RENDERING_ID,
} from '../../../src/engine/layout/page-design.js';
import { TEMPLATE_TEMPLATE_ID, FIELD_IDS } from '../../../src/engine/constants.js';
import { makeItem, buildEngine } from './_helpers.js';

describe('decodeTemplatesMapping', () => {
  it('returns empty map for empty input', () => {
    expect(decodeTemplatesMapping('').size).toBe(0);
    expect(decodeTemplatesMapping(undefined).size).toBe(0);
  });

  it('decodes a double-URL-encoded single pair', () => {
    const raw = encodeURIComponent(encodeURIComponent('{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}={BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}'));
    const map = decodeTemplatesMapping(raw);
    expect(map.size).toBe(1);
    expect(map.get('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });

  it('decodes multiple pairs', () => {
    const raw = encodeURIComponent(encodeURIComponent(
      '{11111111-1111-1111-1111-111111111111}={22222222-2222-2222-2222-222222222222}' +
      '&{33333333-3333-3333-3333-333333333333}={44444444-4444-4444-4444-444444444444}',
    ));
    const map = decodeTemplatesMapping(raw);
    expect(map.size).toBe(2);
    expect(map.get('11111111-1111-1111-1111-111111111111')).toBe('22222222-2222-2222-2222-222222222222');
    expect(map.get('33333333-3333-3333-3333-333333333333')).toBe('44444444-4444-4444-4444-444444444444');
  });

  it('tolerates single-encoded input', () => {
    const raw = '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}={BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}';
    const map = decodeTemplatesMapping(raw);
    expect(map.get('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });
});

describe('findPageDesignsNode', () => {
  it('finds Page Designs at <siteParent>/Presentation/Page Designs', () => {
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const engine = buildEngine([pageDesignsRoot]);
    const node = findPageDesignsNode('/sitecore/content/site/Home', engine);
    expect(node).toBeDefined();
    expect(node!.item.id).toBe('pdr11111-pppp-pppp-pppp-pppppppppppp');
  });

  it('returns undefined when no Page Designs node exists', () => {
    const engine = buildEngine([]);
    expect(findPageDesignsNode('/sitecore/content/site/Home', engine)).toBeUndefined();
  });
});

describe('resolvePageDesignId', () => {
  const templateId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const pageDesignId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('does NOT walk base template chain to find a mapping (0.4.0.17)', () => {
    // Port of XA's `IPresentationContext.GetDesignItem`: TemplatesMapping
    // lookup is by the item's DIRECT template id only. Walking the base
    // chain caused divergence on container-template pages that inherit
    // from `Page` (`5f486933...`) which is mapped to a default design -
    // mockingbird silently applied the default to items Sitecore leaves
    // undesigned.
    const baseTemplateId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const derivedTemplate = makeItem({
      id: templateId,
      path: '/sitecore/templates/Project/site/Derived',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: FIELD_IDS.baseTemplate,
        hint: '__Base template',
        value: `{${baseTemplateId.toUpperCase()}}`,
      }],
    });
    const baseTemplate = makeItem({
      id: baseTemplateId,
      path: '/sitecore/templates/Project/site/Base',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        value: encodeURIComponent(encodeURIComponent(`{${baseTemplateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
      }],
    });
    const item = makeItem({
      id: 'item1111-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      template: templateId,
    });
    const engine = buildEngine([item, derivedTemplate, baseTemplate, pageDesignsRoot]);
    // Only the base template is mapped; the item's direct template isn't.
    // Sitecore returns `null` for this configuration - no design applies.
    expect(resolvePageDesignId(item, engine, '/sitecore/content/site/Home')).toBeUndefined();
  });

  it('walks ancestor chain for Page Design override (0.4.0.17)', () => {
    // Port of the Sitecore contract used by pages like /about/events/<leaf>:
    // the leaf item has no own Page Design override and its template isn't
    // in TemplatesMapping, but the parent item carries a per-item
    // `Page Design` override. GetDesignItem walks up the content tree and
    // picks up the ancestor's override.
    const ancestorDesignId = 'abcdef00-0000-0000-0000-000000000000';
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const parent = makeItem({
      id: 'parent11-0000-0000-0000-000000000000',
      parent: 'homeroot-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/events',
      template: 'leaftpl0-0000-0000-0000-000000000000',
      sharedFields: [{
        id: PAGE_DESIGN_OVERRIDE_FIELD_ID,
        hint: 'Page Design',
        value: `{${ancestorDesignId.toUpperCase()}}`,
      }],
    });
    const home = makeItem({
      id: 'homeroot-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const leaf = makeItem({
      id: 'leaf1111-0000-0000-0000-000000000000',
      parent: 'parent11-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/events/ai-office-hours',
      template: 'leaftpl0-0000-0000-0000-000000000000',
    });
    const engine = buildEngine([home, parent, leaf, pageDesignsRoot]);
    expect(
      resolvePageDesignId(leaf, engine, '/sitecore/content/site/Home'),
    ).toBe(ancestorDesignId);
  });

  it('does not walk above the site root for Page Design overrides (0.4.0.17)', () => {
    // An override on an item ABOVE the site root (tenant / /sitecore/content)
    // must NOT bleed into pages under the site - Sitecore stops the walk at
    // the site root boundary.
    const aboveRootDesignId = 'feedface-0000-0000-0000-000000000000';
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const aboveRoot = makeItem({
      id: 'above000-0000-0000-0000-000000000000',
      path: '/sitecore/content/site',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: PAGE_DESIGN_OVERRIDE_FIELD_ID,
        hint: 'Page Design',
        value: `{${aboveRootDesignId.toUpperCase()}}`,
      }],
    });
    const home = makeItem({
      id: 'homeroot-0000-0000-0000-000000000000',
      parent: 'above000-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const leaf = makeItem({
      id: 'leafnone-0000-0000-0000-000000000000',
      parent: 'homeroot-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/somepage',
      template: 'rtempl00-0000-0000-0000-000000000000',
    });
    const engine = buildEngine([aboveRoot, home, leaf, pageDesignsRoot]);
    // Walk reaches /Home (the site root) and stops; above-root override not inherited.
    expect(
      resolvePageDesignId(leaf, engine, '/sitecore/content/site/Home'),
    ).toBeUndefined();
  });

  it('direct-template match wins over ancestor Page Design override (0.4.0.18)', () => {
    // 0.4.0.18: precedence is own-override → direct-template → ancestor-walk.
    // Models the site Event Page leaf case: leaf template `f9176b0e...` is
    // directly mapped to the Education Event page design; its ancestor
    // `/about/events` carries an override pointing at the Upcoming Events
    // design. Prod resolves the leaf to the DIRECT mapping (Education),
    // NOT the ancestor override. 0.4.0.17 had the walk ordered the other
    // way and regressed ~599 event-leaf pages.
    const leafTemplateId = 'leaft111-0000-0000-0000-000000000000';
    const directDesignId = 'ddesign1-0000-0000-0000-000000000000';
    const ancestorOverrideId = 'adesign1-0000-0000-0000-000000000000';
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        value: encodeURIComponent(encodeURIComponent(`{${leafTemplateId.toUpperCase()}}={${directDesignId.toUpperCase()}}`)),
      }],
    });
    const ancestor = makeItem({
      id: 'ancestor-0000-0000-0000-000000000000',
      parent: 'homeroot-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/events',
      template: 'ancttmpl-0000-0000-0000-000000000000',
      sharedFields: [{
        id: PAGE_DESIGN_OVERRIDE_FIELD_ID,
        hint: 'Page Design',
        value: `{${ancestorOverrideId.toUpperCase()}}`,
      }],
    });
    const home = makeItem({
      id: 'homeroot-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const leaf = makeItem({
      id: 'leafevnt-0000-0000-0000-000000000000',
      parent: 'ancestor-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/events/2023/event-10',
      template: leafTemplateId,
    });
    const engine = buildEngine([home, ancestor, leaf, pageDesignsRoot]);
    expect(resolvePageDesignId(leaf, engine, '/sitecore/content/site/Home')).toBe(directDesignId);
  });

  it('resolves by direct template in TemplatesMapping (0.4.0.17)', () => {
    // Direct template is in the mapping - returns that design id.
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        value: encodeURIComponent(encodeURIComponent(`{${templateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
      }],
    });
    const item = makeItem({
      id: 'direct00-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/page',
      template: templateId,
    });
    const engine = buildEngine([item, pageDesignsRoot]);
    expect(resolvePageDesignId(item, engine, '/sitecore/content/site/Home')).toBe(pageDesignId);
  });

  it('item override takes precedence over TemplatesMapping', () => {
    const overrideId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        value: encodeURIComponent(encodeURIComponent(`{${templateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
      }],
    });
    const item = makeItem({
      id: 'item1111-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      template: templateId,
      sharedFields: [{
        id: PAGE_DESIGN_OVERRIDE_FIELD_ID,
        hint: 'Page Design',
        value: `{${overrideId.toUpperCase()}}`,
      }],
    });
    const engine = buildEngine([item, pageDesignsRoot]);
    expect(resolvePageDesignId(item, engine, '/sitecore/content/site/Home')).toBe(overrideId);
  });

  it('returns undefined when neither override nor mapping match', () => {
    const item = makeItem({
      id: 'item1111-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      template: templateId,
    });
    const engine = buildEngine([item]);
    expect(resolvePageDesignId(item, engine, '/sitecore/content/site/Home')).toBeUndefined();
  });
});

describe('readVersionedField', () => {
  it('reads the latest version fields for the requested language', () => {
    const item = makeItem({
      id: 'item1111-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      languages: [{
        language: 'en',
        fields: [],
        versions: [
          { version: 1, fields: [{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', hint: 'F', value: 'v1' }] },
          { version: 2, fields: [{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', hint: 'F', value: 'v2' }] },
        ],
      }],
    });
    expect(readVersionedField(item, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'en')).toBe('v2');
  });

  it('returns undefined for missing language', () => {
    const item = makeItem({
      id: 'item1111-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home',
      languages: [],
    });
    expect(readVersionedField(item, 'anything', 'en')).toBeUndefined();
  });
});

describe('getPartialRenderingEntries', () => {
  it('returns entries from partials in order, flat', () => {
    const partialAId = 'aaaa1111-pppp-pppp-pppp-pppppppppppp';
    const partialBId = 'bbbb1111-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'dddd1111-pppp-pppp-pppp-pppppppppppp';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

    const partialA = makeItem({
      id: partialAId,
      path: '/sitecore/content/site/Presentation/Partial Designs/A',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"><r uid="{A1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="ph-a" s:ds="" s:par="" /></d></r>`,
          }],
        }],
      }],
    });
    const partialB = makeItem({
      id: partialBId,
      path: '/sitecore/content/site/Presentation/Partial Designs/B',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"><r uid="{B1}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="ph-b" s:ds="" s:par="" /></d></r>`,
          }],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${partialAId.toUpperCase()}}|{${partialBId.toUpperCase()}}`,
      }],
    });
    const engine = buildEngine([partialA, partialB, pageDesign]);
    const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');
    expect(entries).toHaveLength(2);
    expect(entries[0].placeholder).toBe('ph-a');
    expect(entries[1].placeholder).toBe('ph-b');
  });

  it('wraps a partial with a Signature in a synthetic PartialDesignDynamicPlaceholder', () => {
    const partialId = 'aaaa1111-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'dddd1111-pppp-pppp-pppp-pppppppppppp';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

    const partial = makeItem({
      id: partialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/FWB',
      sharedFields: [{
        id: SIGNATURE_FIELD_ID,
        hint: 'Signature',
        value: 'full-width-body',
      }],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{C1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="headless-main" s:ds="" s:par="DynamicPlaceholderId=1" />` +
              `<r uid="{C2}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="/headless-main/container-1-{*}" s:ds="" s:par="" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${partialId.toUpperCase()}}`,
      }],
    });
    const engine = buildEngine([partial, pageDesign]);

    const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');

    // synthetic wrapper, original top-level, original nested  => 3 entries
    expect(entries).toHaveLength(3);

    const [wrapper, top, nested] = entries;

    // Wrapper lives at the partial's top-level placeholder
    expect(wrapper.placeholder).toBe('headless-main');
    expect(wrapper.renderingId).toBe(PARTIAL_DESIGN_DYNAMIC_PLACEHOLDER_RENDERING_ID);
    expect(wrapper.uid).toBe(partialId.toLowerCase());
    expect(wrapper.dataSource).toBe('');
    expect(wrapper.params).toEqual({
      sid: `{${partialId.toUpperCase()}}`,
      ph: 'headless-main',
      sig: 'sxa-full-width-body',
    });
    expect(wrapper.ownerItemPath).toBe('/sitecore/content/site/Presentation/Partial Designs/FWB');

    // Original top-level entry is re-rooted under the wrapper's sxa-<sig> placeholder
    expect(top.uid).toBe('c1');
    expect(top.placeholder).toBe('/headless-main/sxa-full-width-body');

    // Original nested entry gets sxa-<sig> spliced in after the top-level segment
    expect(nested.uid).toBe('c2');
    expect(nested.placeholder).toBe('/headless-main/sxa-full-width-body/container-1-{*}');
  });

  it('wraps a partial whose top-level entries use the leading-slash convention (s:ph="/headless-main")', () => {
    // 0.4.0.28: some SXA partials (site: Faq List Body, Legacy List Body) serialize
    // their top-level `s:ph` as `/headless-main` rather than bare `headless-main`.
    // Sitecore's runtime treats both forms equivalently; mockingbird's wrapper
    // detection previously only matched the bare form, leaving these partials
    // unwrapped and orphaning the entire subtree. Pin both conventions produce
    // the identical wrapped shape.
    const partialId = 'aaaa2222-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'dddd2222-pppp-pppp-pppp-pppppppppppp';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

    const partial = makeItem({
      id: partialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/FLB',
      sharedFields: [{
        id: SIGNATURE_FIELD_ID,
        hint: 'Signature',
        value: 'faq-list-body',
      }],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{C1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="/headless-main" s:ds="" s:par="DynamicPlaceholderId=1" />` +
              `<r uid="{C2}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="/headless-main/container-1-{*}" s:ds="" s:par="" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${partialId.toUpperCase()}}`,
      }],
    });
    const engine = buildEngine([partial, pageDesign]);

    const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');

    // synthetic wrapper, original top-level, original nested  => 3 entries
    expect(entries).toHaveLength(3);

    const [wrapper, top, nested] = entries;

    // Wrapper lives at the partial's top-level placeholder (bare form - normalised
    // regardless of the leading-slash convention in the authored YAML).
    expect(wrapper.placeholder).toBe('headless-main');
    expect(wrapper.renderingId).toBe(PARTIAL_DESIGN_DYNAMIC_PLACEHOLDER_RENDERING_ID);
    expect(wrapper.uid).toBe(partialId.toLowerCase());
    expect(wrapper.params).toEqual({
      sid: `{${partialId.toUpperCase()}}`,
      ph: 'headless-main',
      sig: 'sxa-faq-list-body',
    });

    // Original top-level entry (whose ph was `/headless-main`) is re-rooted under
    // the wrapper's sxa-<sig> placeholder. Final path is identical to the bare-form
    // convention.
    expect(top.uid).toBe('c1');
    expect(top.placeholder).toBe('/headless-main/sxa-faq-list-body');

    // Original nested entry gets sxa-<sig> spliced in after the top-level segment.
    expect(nested.uid).toBe('c2');
    expect(nested.placeholder).toBe('/headless-main/sxa-faq-list-body/container-1-{*}');
  });

  it('does not wrap a partial that has no Signature field', () => {
    const partialId = 'bbbb1111-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'dddd1111-pppp-pppp-pppp-pppppppppppp';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

    const partial = makeItem({
      id: partialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/NoSig',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"><r uid="{X1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="ph-x" s:ds="" s:par="" /></d></r>`,
          }],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${partialId.toUpperCase()}}`,
      }],
    });
    const engine = buildEngine([partial, pageDesign]);

    const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0].placeholder).toBe('ph-x');
  });

  it('rewrites the page\'s own renderings to flow through a wrapper at the same top-level placeholder', () => {
    const partialId = 'aaaa3333-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'dddd3333-pppp-pppp-pppp-pppppppppppp';
    const templateId = 'eeee3333-tttt-tttt-tttt-tttttttttttt';
    const pageDesignsRootId = 'pdr33333-pppp-pppp-pppp-pppppppppppp';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

    const partial = makeItem({
      id: partialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/FWB',
      sharedFields: [{
        id: SIGNATURE_FIELD_ID,
        hint: 'Signature',
        value: 'full-width-body',
      }],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{PC1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="headless-main" s:ds="" s:par="" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${partialId.toUpperCase()}}`,
      }],
    });
    const pageDesignsRoot = makeItem({
      id: pageDesignsRootId,
      path: '/sitecore/content/site/Presentation/Page Designs',
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        value: encodeURIComponent(encodeURIComponent(`{${templateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
      }],
    });
    // Home page with its own renderings nested under the same top-level ph
    const home = makeItem({
      id: 'home3333-hhhh-hhhh-hhhh-hhhhhhhhhhhh',
      path: '/sitecore/content/site/Home',
      template: templateId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{H1}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="/headless-main/container-1-{*}" s:ds="" s:par="" />` +
              `<r uid="{H2}" s:id="{33333333-3333-3333-3333-333333333333}" s:ph="/headless-main/container-1-{*}/container-2-{*}" s:ds="" s:par="" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const engine = buildEngine([partial, pageDesign, pageDesignsRoot, home]);

    const entries = getCombinedRenderingEntries(home, engine, '/sitecore/content/site/Home', 'en');

    // Must include: wrapper, partial top, H1 (rewritten), H2 (rewritten) = 4 entries
    expect(entries).toHaveLength(4);

    const h1 = entries.find(e => e.uid === 'h1')!;
    const h2 = entries.find(e => e.uid === 'h2')!;
    expect(h1.placeholder).toBe('/headless-main/sxa-full-width-body/container-1-{*}');
    expect(h2.placeholder).toBe('/headless-main/sxa-full-width-body/container-1-{*}/container-2-{*}');
  });

  it('does not double a wrapper sig when the page path already contains it', () => {
    const partialId = 'aaaa4444-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'dddd4444-pppp-pppp-pppp-pppppppppppp';
    const templateId = 'eeee4444-tttt-tttt-tttt-tttttttttttt';
    const pageDesignsRootId = 'pdr44444-pppp-pppp-pppp-pppppppppppp';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

    const partial = makeItem({
      id: partialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/FWB2',
      sharedFields: [{ id: SIGNATURE_FIELD_ID, hint: 'Signature', value: 'full-width-body' }],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{PC1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="headless-main" s:ds="" s:par="" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${partialId.toUpperCase()}}`,
      }],
    });
    const pageDesignsRoot = makeItem({
      id: pageDesignsRootId,
      path: '/sitecore/content/site/Presentation/Page Designs',
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        value: encodeURIComponent(encodeURIComponent(`{${templateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
      }],
    });
    const home = makeItem({
      id: 'home4444-hhhh-hhhh-hhhh-hhhhhhhhhhhh',
      path: '/sitecore/content/site/Home',
      template: templateId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            // Note: path already contains sxa-full-width-body - this is how
            // SXA serializes page renderings when the page design is applied.
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{H1}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="/headless-main/sxa-full-width-body/container-1" s:ds="" s:par="" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const engine = buildEngine([partial, pageDesign, pageDesignsRoot, home]);

    const entries = getCombinedRenderingEntries(home, engine, '/sitecore/content/site/Home', 'en');
    const h1 = entries.find(e => e.uid === 'h1')!;
    // Should NOT be doubled to /headless-main/sxa-full-width-body/sxa-full-width-body/container-1
    expect(h1.placeholder).toBe('/headless-main/sxa-full-width-body/container-1');
  });

  it('returns empty list when Page Design has no PartialDesigns', () => {
    const pageDesign = makeItem({
      id: 'dddd1111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
    });
    const engine = buildEngine([pageDesign]);
    expect(getPartialRenderingEntries('dddd1111-pppp-pppp-pppp-pppppppppppp', engine, 'en')).toEqual([]);
  });

  describe('Base Partial Design inheritance', () => {
    // Real site data shape: a Page Design's `PartialDesigns` field lists only
    // the leaf partials (e.g. `Tutorial Body`), and `Tutorial Body` has a
    // `Base Partial Design` shared field pointing at `_Tutorial Header`. The
    // base partial's renderings must be emitted into the combined stream
    // before the derived partial's renderings so that derived-partial entries
    // whose `s:ph` already targets the base's `sxa-<sig>` wrapper actually
    // land under something. Without this, the derived entries are orphaned
    // and the `sxa-_tutorial-header` placeholder never appears in the tree.
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';
    const basePartialId = 'aaaa5555-pppp-pppp-pppp-pppppppppppp';
    const derivedPartialId = 'bbbb5555-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'dddd5555-pppp-pppp-pppp-pppppppppppp';

    const basePartial = makeItem({
      id: basePartialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/_Base Header',
      sharedFields: [{
        id: SIGNATURE_FIELD_ID,
        hint: 'Signature',
        value: '_base-header',
      }],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{BH1}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="headless-main" s:ds="" s:par="DynamicPlaceholderId=1" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const derivedPartial = makeItem({
      id: derivedPartialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/Derived Body',
      sharedFields: [
        {
          id: SIGNATURE_FIELD_ID,
          hint: 'Signature',
          value: 'derived-body',
        },
        {
          id: BASE_PARTIAL_DESIGN_FIELD_ID,
          hint: 'Base Partial Design',
          value: `{${basePartialId.toUpperCase()}}`,
        },
      ],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            // Derived partial's renderings target the base partial's wrapper
            // directly - they have no top-level (`s:ph="headless-main"`) entry
            // of their own.
            value:
              `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
              `<r uid="{DB1}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="/headless-main/sxa-_base-header/container-1" s:ds="" s:par="" />` +
              `</d></r>`,
          }],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Design',
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        // NOTE: only the derived partial is listed. The base is discovered
        // via the derived partial's `Base Partial Design` field.
        value: `{${derivedPartialId.toUpperCase()}}`,
      }],
    });

    it('emits the base partial\'s renderings before the derived partial\'s renderings', () => {
      const engine = buildEngine([basePartial, derivedPartial, pageDesign]);
      const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');
      // Expected: base wrapper + base top-level entry + derived entry = 3
      const uids = entries.map(e => e.uid);
      const baseIdx = uids.indexOf('bh1');
      const derivedIdx = uids.indexOf('db1');
      expect(baseIdx).toBeGreaterThanOrEqual(0);
      expect(derivedIdx).toBeGreaterThanOrEqual(0);
      expect(baseIdx).toBeLessThan(derivedIdx);
    });

    it('produces a synthetic sxa-<base-sig> wrapper entry for the base partial', () => {
      const engine = buildEngine([basePartial, derivedPartial, pageDesign]);
      const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');
      const wrapper = entries.find(
        e => e.renderingId === PARTIAL_DESIGN_DYNAMIC_PLACEHOLDER_RENDERING_ID
          && e.params.sig === 'sxa-_base-header',
      );
      expect(wrapper).toBeDefined();
      expect(wrapper!.placeholder).toBe('headless-main');
    });

    it('dedupes a base partial that is also listed explicitly in PartialDesigns', () => {
      // If the Page Design's PartialDesigns already includes the base, the
      // derived partial's base-chain walk must NOT re-emit it.
      const pageDesignExplicit = makeItem({
        id: pageDesignId,
        path: '/sitecore/content/site/Presentation/Page Designs/Design',
        sharedFields: [{
          id: PARTIAL_DESIGNS_FIELD_ID,
          hint: 'PartialDesigns',
          value: `{${basePartialId.toUpperCase()}}|{${derivedPartialId.toUpperCase()}}`,
        }],
      });
      const engine = buildEngine([basePartial, derivedPartial, pageDesignExplicit]);
      const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');
      const baseOccurrences = entries.filter(e => e.uid === 'bh1').length;
      expect(baseOccurrences).toBe(1);
    });

    it('tolerates a base chain cycle without blowing the stack', () => {
      // Pathological data: base → derived → base. The walker must visit each
      // partial at most once (first-wins canonical) and not recurse forever.
      const cyclicBase = makeItem({
        ...basePartial,
        sharedFields: [
          ...(basePartial.sharedFields ?? []),
          { id: BASE_PARTIAL_DESIGN_FIELD_ID, hint: 'Base Partial Design', value: `{${derivedPartialId.toUpperCase()}}` },
        ],
      });
      const engine = buildEngine([cyclicBase, derivedPartial, pageDesign]);
      const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');
      // Both partials appear exactly once.
      expect(entries.filter(e => e.uid === 'bh1').length).toBe(1);
      expect(entries.filter(e => e.uid === 'db1').length).toBe(1);
    });

    it('does not rewrite a page entry whose path already nests through one of several wrappers at the same top-level placeholder', () => {
      // Real Release Page Design shape: 3 partials all wrap `headless-main`
      // with distinct sigs (sxa-release-page-header / sxa-full-width-body /
      // sxa-release-page-cta). The page's own renderings target paths like
      // `/headless-main/sxa-full-width-body/container-1` - already correctly
      // routed through the middle wrapper. A naive last-wins map of
      // ph→sig would rewrite this to `/headless-main/sxa-release-page-cta/...`
      // and orphan the entries.
      const partAId = 'aaaa6666-pppp-pppp-pppp-pppppppppppp';
      const partBId = 'bbbb6666-pppp-pppp-pppp-pppppppppppp';
      const partCId = 'cccc6666-pppp-pppp-pppp-pppppppppppp';
      const pageDesignIdMulti = 'dddd6666-pppp-pppp-pppp-pppppppppppp';
      const tmplId = 'eeee6666-tttt-tttt-tttt-tttttttttttt';
      const pageDesignsRootId = 'pdr66666-pppp-pppp-pppp-pppppppppppp';
      const DEV = DEFAULT_DEVICE;

      const make = (id: string, sig: string) => makeItem({
        id,
        path: `/sitecore/content/site/Presentation/Partial Designs/${sig}`,
        sharedFields: [{ id: SIGNATURE_FIELD_ID, hint: 'Signature', value: sig }],
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [{
              id: FINAL_RENDERINGS_FIELD_ID,
              hint: '__Final Renderings',
              value:
                `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEV}}">` +
                `<r uid="{${id.slice(0, 4).toUpperCase()}}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="headless-main" s:ds="" s:par="" />` +
                `</d></r>`,
            }],
          }],
        }],
      });

      const partA = make(partAId, 'release-page-header');
      const partB = make(partBId, 'full-width-body');
      const partC = make(partCId, 'release-page-cta');
      const pageDesign = makeItem({
        id: pageDesignIdMulti,
        path: '/sitecore/content/site/Presentation/Page Designs/Release',
        sharedFields: [{
          id: PARTIAL_DESIGNS_FIELD_ID,
          hint: 'PartialDesigns',
          value: `{${partAId.toUpperCase()}}|{${partBId.toUpperCase()}}|{${partCId.toUpperCase()}}`,
        }],
      });
      const pageDesignsRoot = makeItem({
        id: pageDesignsRootId,
        path: '/sitecore/content/site/Presentation/Page Designs',
        sharedFields: [{
          id: TEMPLATES_MAPPING_FIELD_ID,
          hint: 'TemplatesMapping',
          value: encodeURIComponent(encodeURIComponent(`{${tmplId.toUpperCase()}}={${pageDesignIdMulti.toUpperCase()}}`)),
        }],
      });
      const releasePage = makeItem({
        id: 'rpag6666-rrrr-rrrr-rrrr-rrrrrrrrrrrr',
        path: '/sitecore/content/site/Home',
        template: tmplId,
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [{
              id: FINAL_RENDERINGS_FIELD_ID,
              hint: '__Final Renderings',
              value:
                `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEV}}">` +
                // Page entries already nest through the middle wrapper.
                `<r uid="{P1}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="/headless-main/sxa-full-width-body/container-1" s:ds="" s:par="" />` +
                `<r uid="{P2}" s:id="{33333333-3333-3333-3333-333333333333}" s:ph="/headless-main/sxa-full-width-body/container-1" s:ds="" s:par="" />` +
                `</d></r>`,
            }],
          }],
        }],
      });

      const engine = buildEngine([partA, partB, partC, pageDesign, pageDesignsRoot, releasePage]);
      const entries = getCombinedRenderingEntries(releasePage, engine, '/sitecore/content/site/Home', 'en');
      const p1 = entries.find(e => e.uid === 'p1')!;
      const p2 = entries.find(e => e.uid === 'p2')!;
      expect(p1.placeholder).toBe('/headless-main/sxa-full-width-body/container-1');
      expect(p2.placeholder).toBe('/headless-main/sxa-full-width-body/container-1');
    });

    it('discovers a base chain even when Base Partial Design lives in versioned fields', () => {
      // Real site serialization: `Tutorial Body` and `Tutorial List Body` both
      // store `Base Partial Design` as a VERSIONED field (under the language's
      // Version 1 fields) rather than in sharedFields. The 0.1.17 walker only
      // checked sharedFields and silently produced an empty chain for these
      // partials - causing `_Tutorial Header` to never compose and the
      // `headless-main` placeholder to be entirely absent from the route.
      const derivedVersionedBase = makeItem({
        id: derivedPartialId,
        path: '/sitecore/content/site/Presentation/Partial Designs/Derived Body',
        sharedFields: [{
          id: SIGNATURE_FIELD_ID,
          hint: 'Signature',
          value: 'derived-body',
        }],
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [
              {
                id: FINAL_RENDERINGS_FIELD_ID,
                hint: '__Final Renderings',
                value:
                  `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">` +
                  `<r uid="{DB1}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="/headless-main/sxa-_base-header/container-1" s:ds="" s:par="" />` +
                  `</d></r>`,
              },
              {
                id: BASE_PARTIAL_DESIGN_FIELD_ID,
                hint: 'Base Partial Design',
                value: `{${basePartialId.toUpperCase()}}`,
              },
            ],
          }],
        }],
      });
      const engine = buildEngine([basePartial, derivedVersionedBase, pageDesign]);
      const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');
      const uids = entries.map(e => e.uid);
      expect(uids).toContain('bh1');
      expect(uids).toContain('db1');
      expect(uids.indexOf('bh1')).toBeLessThan(uids.indexOf('db1'));
    });
  });
});

describe('getPartialRenderingEntries - default-rule personalization (0.4.0.9)', () => {
  // Integration test for the parse → personalization pass wiring in
  // page-design.ts:241. A partial design whose __Final Renderings XML
  // carries a default-uid `<rule>/<actions>/<action s:DataSource="...">`
  // should emit entries whose `dataSource` is the rule's action datasource,
  // not the authored `s:ds` attribute.

  it('substitutes entry.dataSource with the default rule action datasource', () => {
    const pageDesignId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const partialId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    // Authored default datasource on the rendering; the rule's action
    // substitutes this with the rule's s:DataSource.
    const defaultDs = 'db1987d3-1740-45e3-ad83-988dff315677';
    const substitutedDs = '17b42ad7-a3f3-4f8d-a4ec-fa98fd57660c';

    // Partial design __Final Renderings XML modeled on a real-world
    // structure - one rendering with a default rule that has an action
    // datasource.
    const finalRenderingsXml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{E9D6F7FB-6C88-4E67-87F2-202A9228143E}"
           s:ds="{${defaultDs.toUpperCase()}}"
           s:id="{9C6D53E3-FE57-4638-AF7B-6D68304C7A94}"
           s:ph="/headless-main/accordion-0-0-1">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default">
                <actions>
                  <action uid="1C48B29A90CF4FD78EB49F326B544241"
                          s:DataSource="{${substitutedDs.toUpperCase()}}" />
                </actions>
              </rule>
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;

    const partial = makeItem({
      id: partialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/Test Partial',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: finalRenderingsXml },
          ],
        }],
      }],
    });

    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Test Page Design',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [
        { id: PARTIAL_DESIGNS_FIELD_ID, hint: 'PartialDesigns', value: `{${partialId.toUpperCase()}}` },
      ],
    });

    const engine = buildEngine([partial, pageDesign]);
    const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');

    expect(entries).toHaveLength(1);
    // The personalization pass substituted the authored default datasource
    // with the rule's action datasource, in place - this is the end-to-end
    // proof that Step 8's wiring runs. Note: the substituted value is the
    // normalized lowercase-dashed form (per `normalizeGuid`), not the
    // braced-upper form of the authored `s:ds`.
    expect(entries[0].dataSource).toBe(substitutedDs);
    // Also confirm the authored braced-upper form did NOT survive - the
    // personalization pass replaced it.
    expect(entries[0].dataSource).not.toBe(`{${defaultDs.toUpperCase()}}`);
    // Confirm the rule data was also captured (defensive - proves the
    // parser populated `entry.rules` before the personalization pass).
    expect(entries[0].rules?.defaultActionDataSource).toBe(substitutedDs);
  });

  it('leaves entry.dataSource unchanged when no rules present', () => {
    // Regression guard: the vast majority of renderings don't carry
    // rules. They must flow through unchanged.
    const pageDesignId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const partialId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const authoredDs = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const finalRenderingsXml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE}"
           s:ds="{${authoredDs.toUpperCase()}}"
           s:id="{9C6D53E3-FE57-4638-AF7B-6D68304C7A94}"
           s:ph="/headless-main/placeholder" />
      </d>
    </r>`;

    const partial = makeItem({
      id: partialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/Plain Partial',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: finalRenderingsXml },
          ],
        }],
      }],
    });
    const pageDesign = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Plain Page Design',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [
        { id: PARTIAL_DESIGNS_FIELD_ID, hint: 'PartialDesigns', value: `{${partialId.toUpperCase()}}` },
      ],
    });

    const engine = buildEngine([partial, pageDesign]);
    const entries = getPartialRenderingEntries(pageDesignId, engine, 'en');

    expect(entries).toHaveLength(1);
    expect(entries[0].dataSource).toBe(`{${authoredDs.toUpperCase()}}`);
    expect(entries[0].rules).toBeUndefined();
  });
});

describe('getCombinedRenderingEntries - no-own-layout partial merge (0.4.0.15)', () => {
  // Shared path convention for these tests:
  //   siteRootPath = /sitecore/content/p3a/Home
  //   → findPageDesignsNode looks for /sitecore/content/p3a/Presentation/Page Designs
  const siteRootPath = '/sitecore/content/p3a/Home';

  it('emits partial entries when item has no own __Final Renderings but a Page Design matches', () => {
    // Sitecore's FlattenedPlaceholdersResolver.ExtractPlaceholders reads the
    // route item's Layout XML via `new LayoutField(item).Value` (SV-cascade-
    // aware) and ALWAYS calls `MergePartialDesignsRenderings` - there is no
    // "has own __Final Renderings" gate. 0.4.0.14 shipped such a gate by
    // mistake and it wiped the rendering tree on every content page whose
    // layout came via Page Design + SV inheritance (~80% of the site content tree).
    //
    // This regression guard enforces the correct contract: an item with no
    // own __Final Renderings (and no SV-inherited value) still gets partial-
    // design entries when a Page Design matches.
    const pageTemplateId = 'ee000001-0000-0000-0000-000000000001';
    const pageDesignId = 'ed000001-0000-0000-0000-000000000001';
    const partialId = 'ef000001-0000-0000-0000-000000000001';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';
    const partialRenderingUid = 'cccccccc-0000-0000-0000-000000000001';
    const engine = buildEngine([
      // Page Designs root - path matches findPageDesignsNode convention.
      makeItem({
        id: 'e1000001-0000-0000-0000-000000000001',
        path: '/sitecore/content/p3a/Presentation/Page Designs',
        sharedFields: [
          {
            id: TEMPLATES_MAPPING_FIELD_ID,
            hint: 'TemplatesMapping',
            value: encodeURIComponent(encodeURIComponent(`{${pageTemplateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
          },
        ],
      }),
      // Page Design with one partial that carries real renderings.
      makeItem({
        id: pageDesignId,
        path: '/sitecore/content/p3a/Presentation/Page Designs/Empty Item Design',
        sharedFields: [
          {
            id: PARTIAL_DESIGNS_FIELD_ID,
            hint: 'PartialDesigns',
            value: `{${partialId.toUpperCase()}}`,
          },
        ],
      }),
      // Partial with one rendering entry.
      makeItem({
        id: partialId,
        path: '/sitecore/content/p3a/Presentation/Partial Designs/Header',
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [{
              id: FINAL_RENDERINGS_FIELD_ID,
              hint: '__Final Renderings',
              value: `<r xmlns:s="s" xmlns:p="p"><d id="{${DEFAULT_DEVICE}}"><r uid="{${partialRenderingUid.toUpperCase()}}" s:id="{DD000001-0000-0000-0000-000000000001}" s:ph="headless-header" /></d></r>`,
            }],
          }],
        }],
      }),
      // Page template (minimal - needs to exist for walkTemplateChain).
      makeItem({
        id: pageTemplateId,
        path: '/sitecore/templates/test/P3aPage',
      }),
      // The page item itself - no `__Final Renderings` in versioned fields
      // and no template SV with one either.
      makeItem({
        id: 'e2000001-0000-0000-0000-000000000001',
        path: '/sitecore/content/p3a/Home/empty-page',
        template: pageTemplateId,
        languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
      }),
    ]);

    const pageItem = engine.getItemByPath('/sitecore/content/p3a/Home/empty-page')!.item;
    const result = getCombinedRenderingEntries(pageItem, engine, siteRootPath, 'en');
    // Partial's rendering entry must be present - the page inherits the Page
    // Design even though it has no own Layout XML.
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(e => e.uid === partialRenderingUid)).toBe(true);
  });

  it('picks up __Final Renderings inherited via template __Standard Values', () => {
    // Sitecore's `LayoutField.Value` walks the SV cascade transparently. When
    // the page template's __Standard Values item carries a `__Final Renderings`
    // value, the page item inherits it automatically - Sitecore never reads
    // the literal item-only field for Layout resolution. Regression guard for
    // the 0.4.0.15 switch from `readVersionedField` (literal-only) to
    // `resolveFieldValue` (SV-cascade-aware).
    const pageTemplateId = 'ee000002-0000-0000-0000-000000000001';
    const svId = 'ee000002-0000-0000-0000-00000000005f';
    const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';
    const svRenderingUid = 'aa222222-0000-0000-0000-000000000001';
    const engine = buildEngine([
      // Page template with a __Standard Values child that carries the
      // inherited layout XML.
      makeItem({
        id: pageTemplateId,
        path: '/sitecore/templates/test/InheritedLayoutPage',
      }),
      makeItem({
        id: svId,
        parent: pageTemplateId,
        path: '/sitecore/templates/test/InheritedLayoutPage/__Standard Values',
        template: pageTemplateId,
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [{
              id: FINAL_RENDERINGS_FIELD_ID,
              hint: '__Final Renderings',
              value: `<r xmlns:s="s" xmlns:p="p"><d id="{${DEFAULT_DEVICE}}"><r uid="{${svRenderingUid.toUpperCase()}}" s:id="{DD000002-0000-0000-0000-000000000001}" s:ph="main" /></d></r>`,
            }],
          }],
        }],
      }),
      // Page item with NO own __Final Renderings - must inherit from template SV.
      makeItem({
        id: 'e2000002-0000-0000-0000-000000000001',
        path: '/sitecore/content/p3a/Home/inherited-layout-page',
        template: pageTemplateId,
        languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [] }] }],
      }),
    ]);

    const pageItem = engine.getItemByPath('/sitecore/content/p3a/Home/inherited-layout-page')!.item;
    const result = getCombinedRenderingEntries(pageItem, engine, siteRootPath, 'en');
    expect(result.some(e => e.uid === svRenderingUid)).toBe(true);
  });

  it('still merges partials when item has own __Final Renderings', () => {
    // Regression guard for the existing happy path - item with own layout
    // gets partial merge as before (partials empty here since design has no
    // PartialDesigns; the own-rendering entry must still appear).
    const pageTemplateId = 'ee000001-0000-0000-0000-000000000002';
    const pageDesignId = 'ed000001-0000-0000-0000-000000000002';
    const engine = buildEngine([
      makeItem({
        id: 'e1000001-0000-0000-0000-000000000002',
        path: '/sitecore/content/p3a/Presentation/Page Designs',
        sharedFields: [
          {
            id: TEMPLATES_MAPPING_FIELD_ID,
            hint: 'TemplatesMapping',
            value: encodeURIComponent(encodeURIComponent(`{${pageTemplateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
          },
        ],
      }),
      makeItem({
        id: pageDesignId,
        path: '/sitecore/content/p3a/Presentation/Page Designs/Design',
        sharedFields: [],
      }),
      makeItem({ id: pageTemplateId, path: '/sitecore/templates/test/P3aPage2' }),
      makeItem({
        id: 'e2000001-0000-0000-0000-000000000002',
        path: '/sitecore/content/p3a/Home/page-with-own',
        template: pageTemplateId,
        languages: [
          {
            language: 'en',
            fields: [],
            versions: [
              {
                version: 1,
                fields: [
                  {
                    id: FINAL_RENDERINGS_FIELD_ID,
                    hint: '__Final Renderings',
                    value: `<r xmlns:s="s" xmlns:p="p"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{AABBCCDD-0000-0000-0000-000000000001}" s:id="{AA000001-0000-0000-0000-000000000001}" s:ph="main" /></d></r>`,
                  },
                ],
              },
            ],
          },
        ],
      }),
    ]);
    const pageItem = engine.getItemByPath('/sitecore/content/p3a/Home/page-with-own')!.item;
    const result = getCombinedRenderingEntries(pageItem, engine, siteRootPath, 'en');
    // Own-layout item returns at least the one own entry (partials empty since design has no PartialDesigns).
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(e => e.uid === 'aabbccdd-0000-0000-0000-000000000001')).toBe(true);
  });
});

describe('getCombinedRenderingEntries - default-rule personalization (0.4.0.9)', () => {
  // Integration test for the parse → personalization pass wiring in
  // page-design.ts:360 (page-own __Final Renderings path). Mirrors the
  // `getPartialRenderingEntries` integration tests above.

  it('substitutes entry.dataSource on page-own rendering when default rule has action', () => {
    const pageId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
    const defaultDs = 'db1987d3-1740-45e3-ad83-988dff315677';
    const substitutedDs = '17b42ad7-a3f3-4f8d-a4ec-fa98fd57660c';

    const finalRenderingsXml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{E9D6F7FB-6C88-4E67-87F2-202A9228143E}"
           s:ds="{${defaultDs.toUpperCase()}}"
           s:id="{9C6D53E3-FE57-4638-AF7B-6D68304C7A94}"
           s:ph="/headless-main/section">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default">
                <actions>
                  <action s:DataSource="{${substitutedDs.toUpperCase()}}" />
                </actions>
              </rule>
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;

    const page = makeItem({
      id: pageId,
      path: '/sitecore/content/site/Home/test-page',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: finalRenderingsXml },
          ],
        }],
      }],
    });

    const engine = buildEngine([page]);
    const entries = getCombinedRenderingEntries(page, engine, '/sitecore/content/site/Home', 'en');

    expect(entries).toHaveLength(1);
    // Personalization pass substituted the authored default datasource
    // with the rule's action datasource on the PAGE'S OWN renderings
    // (wiring site #2 at page-design.ts:360). If this regresses to the
    // authored default, the wiring was removed.
    expect(entries[0].dataSource).toBe(substitutedDs);
    expect(entries[0].dataSource).not.toBe(`{${defaultDs.toUpperCase()}}`);
    expect(entries[0].rules?.defaultActionDataSource).toBe(substitutedDs);
  });

  it('leaves entry.dataSource unchanged on page-own rendering when no rules present', () => {
    const pageId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
    const authoredDs = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    const finalRenderingsXml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE}"
           s:ds="{${authoredDs.toUpperCase()}}"
           s:id="{9C6D53E3-FE57-4638-AF7B-6D68304C7A94}"
           s:ph="/headless-main/placeholder" />
      </d>
    </r>`;

    const page = makeItem({
      id: pageId,
      path: '/sitecore/content/site/Home/plain-page',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: finalRenderingsXml },
          ],
        }],
      }],
    });

    const engine = buildEngine([page]);
    const entries = getCombinedRenderingEntries(page, engine, '/sitecore/content/site/Home', 'en');

    expect(entries).toHaveLength(1);
    expect(entries[0].dataSource).toBe(`{${authoredDs.toUpperCase()}}`);
    expect(entries[0].rules).toBeUndefined();
  });
});
