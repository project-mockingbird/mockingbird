import { describe, it, expect } from 'vitest';
import { resolveLayout } from '../../../src/engine/layout/index.js';
import {
  RENDERING_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import { FINAL_RENDERINGS_FIELD_ID } from '../../../src/engine/layout/page-design.js';
import {
  RCR_FIELD_ID,
  RCR_TYPE_FIELD_ID,
  RCR_QUERY_FIELD_ID,
  RCR_USE_CONTEXT_FIELD_ID,
  DEFAULT_RCR_TYPE,
} from '../../../src/engine/layout/contents-resolvers.js';
import { makeItem, buildEngine } from './_helpers.js';

const EXCLUDE_FOLDER_TMPL = 'dc341f6b-784e-45e5-97d1-faa87efa6f06';

const DEVICE_ID = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

describe('resolveLayout - InteractionNavigation (Phase D)', () => {
  it('populates InteractionNavigation.fields.items with sibling pages', async () => {
    const pageTemplateId = 'fc11fc11-fc11-fc11-fc11-fc11fc11fc11';
    const pageTemplate = makeItem({ id: pageTemplateId, path: '/sitecore/templates/Test/LeafPage', template: TEMPLATE_TEMPLATE_ID });
    const pageSection = makeItem({ id: 'fc22fc22-fc22-fc22-fc22-fc22fc22fc22', parent: pageTemplateId, path: '/sitecore/templates/Test/LeafPage/Data', template: TEMPLATE_SECTION_TEMPLATE_ID });
    const titleField = makeItem({ id: 'fc33fc33-fc33-fc33-fc33-fc33fc33fc33', parent: pageSection.id, path: '/sitecore/templates/Test/LeafPage/Data/Title', template: TEMPLATE_FIELD_TEMPLATE_ID, sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }] });

    const rcr = makeItem({
      id: '7e5919e7-a96f-430a-bd74-1c8ef96030d1',
      path: '/sitecore/system/Modules/Layout Service/Rendering Contents Resolvers/Example/Section Navigation',
      sharedFields: [
        { id: RCR_TYPE_FIELD_ID, hint: 'Type', value: DEFAULT_RCR_TYPE },
        { id: RCR_QUERY_FIELD_ID, hint: 'ItemSelectorQuery', value: "../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']" },
        { id: RCR_USE_CONTEXT_FIELD_ID, hint: 'UseContextItem', value: '1' },
      ],
    });

    const renderingUid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const renderingId = 'rendffff-0000-0000-0000-000000000001';
    const rendering = makeItem({
      id: renderingId,
      path: '/sitecore/layout/Renderings/Feature/Example/Interaction Navigation',
      template: RENDERING_TEMPLATE_ID,
      sharedFields: [
        { id: RCR_FIELD_ID, hint: 'Rendering Contents Resolver', value: `{${rcr.id.toUpperCase()}}` },
      ],
    });

    const folder = makeItem({
      id: 'fffffff1-0000-0000-0000-000000000001',
      path: '/sitecore/content/site/Home/section/v1',
      template: EXCLUDE_FOLDER_TMPL,
    });

    const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';

    function page(id: string, name: string, title: string, sortOrder: number) {
      return makeItem({
        id,
        parent: folder.id,
        template: pageTemplateId,
        path: `/sitecore/content/site/Home/section/v1/${name}`,
        sharedFields: [{ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: String(sortOrder) }],
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [{ id: titleField.id, hint: 'Title', value: title }],
          }],
        }],
      });
    }

    const readPage = page('00000001-0000-0000-0000-000000000001', 'read', 'Resource.Read', 100);
    const searchPage = page('00000002-0000-0000-0000-000000000002', 'search', 'Resource.Search', 200);

    // The route item — `__Final Renderings` is a versioned field, stored in
    // languages[].versions[].fields (same as the existing route-builder.test.ts fixtures).
    // s:ph must NOT start with "/" for a top-level placeholder (a leading "/" means
    // nested placement and requires a parent slot to already exist in the tree).
    const finalRenderingsXml =
      `<r xmlns:p="p" xmlns:s="s">` +
      `<d id="{${DEVICE_ID.toUpperCase()}}">` +
      `<r uid="{${renderingUid.toUpperCase()}}" s:id="{${renderingId.toUpperCase()}}" s:ph="main" s:ds="" />` +
      `</d>` +
      `</r>`;

    const eventPage = makeItem({
      id: '00000003-0000-0000-0000-000000000003',
      parent: folder.id,
      template: pageTemplateId,
      path: '/sitecore/content/site/Home/section/v1/event-streaming',
      sharedFields: [
        { id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: '300' },
      ],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: FINAL_RENDERINGS_FIELD_ID, hint: '__Final Renderings', value: finalRenderingsXml },
            { id: titleField.id, hint: 'Title', value: 'Resource.Event Streaming' },
          ],
        }],
      }],
    });

    const engine = buildEngine([pageTemplate, pageSection, titleField, rcr, rendering, folder, readPage, searchPage, eventPage]);

    const route = await resolveLayout(
      '/section/v1/event-streaming',
      engine,
      { siteRootPath: '/sitecore/content/site/Home', mediaBaseUrl: '' },
    );
    expect(route).not.toBeNull();

    // Navigate to the rendering's fields.items.
    // Note: resolveComponentName strips whitespace and PascalCases component names,
    // so 'Interaction Navigation' → 'InteractionNavigation'.
    const main = route!.placeholders?.['main'];
    expect(main).toBeDefined();
    const interaction = main![0];
    expect(interaction.componentName).toBe('InteractionNavigation');

    const items = interaction.fields.items as unknown as Array<{ id: string; url: string; name: string; fields: { Title: { value: string } } }>;
    expect(items).toHaveLength(3);
    expect(items.map(i => i.name)).toEqual(['read', 'search', 'event-streaming']);
    expect(items[0].url).toBe('/section/v1/read');
    expect(items[0].fields.Title.value).toBe('Resource.Read');

    // dataSource should stay as authored (empty).
    expect(interaction.dataSource).toBe('');
  });
});
