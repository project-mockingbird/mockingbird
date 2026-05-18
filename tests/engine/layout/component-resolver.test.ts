import { describe, it, expect } from 'vitest';
import {
  PLACEHOLDERS_FIELD_ID,
  PLACEHOLDER_KEY_FIELD_ID,
  RENDERING_CONTENTS_RESOLVER_FIELD_ID,
  COMPONENT_NAME_FIELD_ID,
} from '../../../src/engine/constants.js';
import { resolveComponents } from '../../../src/engine/layout/component-resolver.js';
import type { PlaceholderNode } from '../../../src/engine/layout/types.js';
import {
  RENDERING_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
} from '../../../src/engine/constants.js';
import { makeItem, buildEngine } from './_helpers.js';
import {
  RCR_FIELD_ID as RCR_FIELD,
  RCR_TYPE_FIELD_ID,
  RCR_QUERY_FIELD_ID,
  RCR_USE_CONTEXT_FIELD_ID,
  DEFAULT_RCR_TYPE,
} from '../../../src/engine/layout/contents-resolvers.js';

const renderingItem = makeItem({
  id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  path: '/sitecore/layout/Renderings/Project/site/HeroBanner',
  template: RENDERING_TEMPLATE_ID,
});

const datasourceItem = makeItem({
  id: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  path: '/sitecore/content/site/Home/Data/HeroBanner',
  template: 'dddd4444-dddd-dddd-dddd-dddddddddddd',
  languages: [{
    language: 'en',
    fields: [],
    versions: [{
      version: 1,
      fields: [
        { id: 'f1', hint: 'Title', value: 'Welcome' },
        { id: 'f2', hint: 'Subtitle', value: 'Hello World' },
      ],
    }],
  }],
});

const dsTemplate = makeItem({
  id: 'dddd4444-dddd-dddd-dddd-dddddddddddd',
  path: '/sitecore/templates/Project/site/HeroBanner',
  template: TEMPLATE_TEMPLATE_ID,
});
const dsSection = makeItem({
  id: 'dddd5555-dddd-dddd-dddd-dddddddddddd',
  parent: 'dddd4444-dddd-dddd-dddd-dddddddddddd',
  path: '/sitecore/templates/Project/site/HeroBanner/Content',
  template: TEMPLATE_SECTION_TEMPLATE_ID,
});
const dsFieldTitle = makeItem({
  id: 'f1',
  parent: 'dddd5555-dddd-dddd-dddd-dddddddddddd',
  path: '/sitecore/templates/Project/site/HeroBanner/Content/Title',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
});
const dsFieldSubtitle = makeItem({
  id: 'f2',
  parent: 'dddd5555-dddd-dddd-dddd-dddddddddddd',
  path: '/sitecore/templates/Project/site/HeroBanner/Content/Subtitle',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
});

describe('resolveComponents', () => {
  it('resolves rendering GUID to component name', () => {
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].componentName).toBe('HeroBanner');
  });

  it('emits componentName from the rendering item\'s componentName field when set (0.4.0.16)', () => {
    // Port of Sitecore `Initialize.GetComponentName`:
    //   text = renderingItem[FieldIDs.JsonRendering.ComponentName]
    //   if blank → renderingItem.Name
    // When the field is set, it wins over item.Name. Closes Gap 2 Class 1 for
    // renderings where the item name differs from prod's emitted componentName
    // (e.g. Event Calendar Widget aliased to SearchResultsWidget).
    const aliased = makeItem({
      id: 'aaaa9999-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/layout/Renderings/Project/site/Event Calendar Widget',
      template: RENDERING_TEMPLATE_ID,
      sharedFields: [
        { id: COMPONENT_NAME_FIELD_ID, hint: 'componentName', value: 'Search Results Widget' },
      ],
    });
    const engine = buildEngine([aliased]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{ALIAS}',
        renderingId: 'aaaa9999-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    // Field value wins; JSS whitespace-strip still applies.
    expect(result['headless-main'][0].componentName).toBe('SearchResultsWidget');
  });

  it('falls back to item name when componentName field is empty (0.4.0.16)', () => {
    // Blank / whitespace-only componentName → falls through to renderingItem.Name.
    const blank = makeItem({
      id: 'aaaa8888-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/layout/Renderings/Project/site/BlankName',
      template: RENDERING_TEMPLATE_ID,
      sharedFields: [
        { id: COMPONENT_NAME_FIELD_ID, hint: 'componentName', value: '   ' },
      ],
    });
    const engine = buildEngine([blank]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{BLANK}',
        renderingId: 'aaaa8888-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].componentName).toBe('BlankName');
  });

  it('passes through the `sid` param unchanged (raw GUID reference)', () => {
    const partial = makeItem({
      id: '1b4f478d-e643-41f9-8d02-ce8d6750a05d',
      path: '/sitecore/content/site/Presentation/Partial Designs/FWB',
    });
    const engine = buildEngine([renderingItem, partial]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: {
          sid: '{1B4F478D-E643-41F9-8D02-CE8D6750A05D}',
          ph: 'headless-main',
          sig: 'sxa-full-width-body',
        },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].params.sid).toBe('{1B4F478D-E643-41F9-8D02-CE8D6750A05D}');
  });

  it('URL-decodes plain param values', () => {
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: { CacheClearingBehavior: 'Clear%20on%20publish', DynamicPlaceholderId: '1' },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].params.CacheClearingBehavior).toBe('Clear on publish');
    expect(result['headless-main'][0].params.DynamicPlaceholderId).toBe('1');
  });

  it('resolves a single-GUID param value through the item Value field', () => {
    const styleItem = makeItem({
      id: 'ffff1111-ffff-ffff-ffff-ffffffffffff',
      path: '/sitecore/content/site/Presentation/Styles/image-tall',
      sharedFields: [{
        id: '09147fb2-ebfb-4949-8c8e-26a424409d5e',
        hint: 'Value',
        value: 'image-tall',
      }],
    });
    const engine = buildEngine([renderingItem, styleItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: { Styles: '%7BFFFF1111-FFFF-FFFF-FFFF-FFFFFFFFFFFF%7D' },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].params.Styles).toBe('image-tall');
  });

  it('cascades param Value through template __Standard Values when item has no own value (0.4.0.28)', () => {
    // Sitecore's param-item Value resolution walks `item.Fields["Value"].Value`
    // which cascades to template SV. Pre-0.4.0.28 mockingbird read only the
    // item's own sharedFields and fell to path-name/grid-class - losing any
    // SV-defined defaults.
    const templateId = 'abbbbbbb-0000-0000-0000-000000000001';
    const svId = 'abbbbbbb-0000-0000-0000-000000000002';
    const styleItem = makeItem({
      id: 'ffff2222-ffff-ffff-ffff-ffffffffffff',
      template: templateId,
      path: '/sitecore/content/site/Presentation/Styles/from-sv',
      // No own Value sharedField - SCS would strip if equal to SV.
    });
    const template = makeItem({ id: templateId, path: '/sitecore/templates/Style' });
    const sv = makeItem({
      id: svId,
      parent: templateId,
      path: '/sitecore/templates/Style/__Standard Values',
      sharedFields: [{ id: '09147fb2-ebfb-4949-8c8e-26a424409d5e', hint: 'Value', value: 'sv-default-class' }],
    });
    const engine = buildEngine([renderingItem, template, sv, styleItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: { Styles: '%7BFFFF2222-FFFF-FFFF-FFFF-FFFFFFFFFFFF%7D' },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].params.Styles).toBe('sv-default-class');
  });

  it('joins pipe-separated GUID params with spaces', () => {
    const a = makeItem({
      id: 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      path: '/sitecore/content/site/Presentation/Styles/image-tall',
      sharedFields: [{ id: '09147fb2-ebfb-4949-8c8e-26a424409d5e', hint: 'Value', value: 'image-tall' }],
    });
    const b = makeItem({
      id: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      path: '/sitecore/content/site/Presentation/Styles/bg-anchor-bl',
      sharedFields: [{ id: '09147fb2-ebfb-4949-8c8e-26a424409d5e', hint: 'Value', value: 'background-anchor-bottom-left' }],
    });
    const engine = buildEngine([renderingItem, a, b]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: { Styles: '%7BAAAA2222-AAAA-AAAA-AAAA-AAAAAAAAAAAA%7D%7C%7BBBBB2222-BBBB-BBBB-BBBB-BBBBBBBBBBBB%7D' },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].params.Styles).toBe('image-tall background-anchor-bottom-left');
  });

  it('falls back to item name for GUID params without a Value field', () => {
    const bareItem = makeItem({
      id: 'cccc2222-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/system/Settings/Grid/12',
    });
    const engine = buildEngine([renderingItem, bareItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: { GridParameters: '%7BCCCC2222-CCCC-CCCC-CCCC-CCCCCCCCCCCC%7D' },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].params.GridParameters).toBe('12');
  });

  it('leaves unresolvable GUID params as the decoded raw value', () => {
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: { FieldNames: '%7B00000000-0000-0000-0000-000000000000%7D' },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    // Fallback: decoded value, unchanged
    expect(result['headless-main'][0].params.FieldNames).toBe('{00000000-0000-0000-0000-000000000000}');
  });

  it('strips whitespace from multi-word component names (JSS convention)', () => {
    const multiWord = makeItem({
      id: 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee',
      path: '/sitecore/layout/Renderings/Project/site/Site Alert',
      template: RENDERING_TEMPLATE_ID,
    });
    const engine = buildEngine([multiWord]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee',
        dataSource: '',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].componentName).toBe('SiteAlert');
  });

  it('title-cases lowercase words when joining a multi-word component name', () => {
    const mixed = makeItem({
      id: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
      path: '/sitecore/layout/Renderings/Project/site/SearchBox with Suggestions',
      template: RENDERING_TEMPLATE_ID,
    });
    const engine = buildEngine([mixed]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
        dataSource: '',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].componentName).toBe('SearchBoxWithSuggestions');
  });

  it('resolves datasource GUID to item fields', () => {
    const engine = buildEngine([
      renderingItem, datasourceItem, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle,
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '{BBBB2222-BBBB-BBBB-BBBB-BBBBBBBBBBBB}',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    const comp = result['headless-main'][0];
    expect(comp.fields['Title']).toEqual({ value: 'Welcome' });
    expect(comp.fields['Subtitle']).toEqual({ value: 'Hello World' });
  });

  it('resolves datasource by absolute path', () => {
    const engine = buildEngine([
      renderingItem, datasourceItem, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle,
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '/sitecore/content/site/Home/Data/HeroBanner',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].fields['Title']).toEqual({ value: 'Welcome' });
  });

  it('rewrites a resolved local: datasource to the resolved item full path', () => {
    const pageItem = makeItem({
      id: 'page-id',
      path: '/sitecore/content/site/Home',
    });
    const engine = buildEngine([
      renderingItem, datasourceItem, pageItem, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle,
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: 'local:Data/HeroBanner',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '/sitecore/content/site/Home', '');
    expect(result['headless-main'][0].dataSource).toBe('/sitecore/content/site/Home/Data/HeroBanner');
  });

  it('leaves an unresolved local: datasource unchanged', () => {
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: 'local:Data/Missing',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '/sitecore/content/site/Home', '');
    expect(result['headless-main'][0].dataSource).toBe('local:Data/Missing');
  });

  it('leaves a GUID datasource as the raw reference', () => {
    const engine = buildEngine([
      renderingItem, datasourceItem, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle,
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '{BBBB2222-BBBB-BBBB-BBBB-BBBBBBBBBBBB}',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].dataSource).toBe('{BBBB2222-BBBB-BBBB-BBBB-BBBBBBBBBBBB}');
  });

  it('resolves local: datasource relative to page item', () => {
    const pageItem = makeItem({
      id: 'page-id',
      path: '/sitecore/content/site/Home',
    });
    const engine = buildEngine([
      renderingItem, datasourceItem, pageItem, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle,
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: 'local:Data/HeroBanner',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '/sitecore/content/site/Home', '');
    expect(result['headless-main'][0].fields['Title']).toEqual({ value: 'Welcome' });
  });

  it('resolves local: datasource with leading slash', () => {
    const pageItem = makeItem({
      id: 'page-id',
      path: '/sitecore/content/site/Home',
    });
    const engine = buildEngine([
      renderingItem, datasourceItem, pageItem, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle,
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: 'local:/Data/HeroBanner',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '/sitecore/content/site/Home', '');
    expect(result['headless-main'][0].fields['Title']).toEqual({ value: 'Welcome' });
  });

  it('local: on a node tagged with ownerItemPath resolves to the owner, not the page', () => {
    const partialLocalDatasource = makeItem({
      id: 'eeee5555-eeee-eeee-eeee-eeeeeeeeeeee',
      path: '/sitecore/content/site/Presentation/Partial Designs/Header/Data/Modal Text',
      template: 'dddd4444-dddd-dddd-dddd-dddddddddddd',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: 'f1', hint: 'Title', value: 'From Partial' },
          ],
        }],
      }],
    });
    const engine = buildEngine([
      renderingItem, partialLocalDatasource, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle,
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-header': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: 'local:Data/Modal Text',
        params: {},
        ownerItemPath: '/sitecore/content/site/Presentation/Partial Designs/Header',
      }],
    };
    // Page path points somewhere else - the local: must ignore it and use
    // ownerItemPath so the datasource resolves to the partial's own data.
    const result = resolveComponents(tree, engine, '', '/sitecore/content/site/Home', '');
    expect(result['headless-header'][0].fields['Title']).toEqual({ value: 'From Partial' });
  });

  it('drops rendering entirely when renderingId is unresolvable (0.4.0.29)', () => {
    // Pre-0.4.0.29 emitted `{componentName: "Unknown", uid, ...}` as a
    // fallback. Prod Edge emits nothing at IAR/client-side rendering slots
    // so mockingbird now follows suit - unresolvable renderings drop.
    const engine = buildEngine([]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [{
        uid: '{A}',
        renderingId: 'nonexistent-id',
        dataSource: '',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['main']).toEqual([]);
  });

  it('omits fields key when datasource GUID does not resolve (P1 contract)', () => {
    // A non-empty dataSource that points at a missing item: dsItem is undefined,
    // no RCR configured → shouldEmitFields returns false → fields key absent.
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '{99999999-9999-9999-9999-999999999999}',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['main'][0].fields).toBeUndefined();
  });

  it('recurses into nested placeholders', () => {
    const childRendering = makeItem({
      id: 'cccc3333-cccc-cccc-cccc-cccccccccccc',
      path: '/sitecore/layout/Renderings/Project/site/Image',
      template: RENDERING_TEMPLATE_ID,
    });
    const engine = buildEngine([renderingItem, childRendering]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [{
        uid: '{PARENT}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: {},
        placeholders: {
          'container-{*}': [{
            uid: '{CHILD}',
            renderingId: 'cccc3333-cccc-cccc-cccc-cccccccccccc',
            dataSource: '',
            params: {},
          }],
        },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    const parent = result['main'][0];
    expect(parent.componentName).toBe('HeroBanner');
    expect(parent.placeholders!['container-{*}'][0].componentName).toBe('Image');
  });
});

describe('resolveNode - RCR dispatch (InteractionNavigation-style)', () => {
  it('populates fields.items when rendering has a registered RCR and no componentName resolver', () => {
    // Use the same synthetic fixture pattern as contents-resolvers-rcr.test.ts.

    const EXCLUDE_FOLDER_TMPL = 'dc341f6b-784e-45e5-97d1-faa87efa6f06';

    // Template for the child pages (so Title resolves via schema).
    const pageTemplateId = 'fb11fb11-fb11-fb11-fb11-fb11fb11fb11';
    const tmpl = makeItem({ id: pageTemplateId, path: '/sitecore/templates/Test/LeafPage', template: TEMPLATE_TEMPLATE_ID });
    const section = makeItem({ id: 'fb22fb22-fb22-fb22-fb22-fb22fb22fb22', parent: pageTemplateId, path: '/sitecore/templates/Test/LeafPage/Data', template: TEMPLATE_SECTION_TEMPLATE_ID });
    const titleField = makeItem({ id: 'fb33fb33-fb33-fb33-fb33-fb33fb33fb33', parent: section.id, path: '/sitecore/templates/Test/LeafPage/Data/Title', template: TEMPLATE_FIELD_TEMPLATE_ID, sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }] });

    const folder = makeItem({
      id: 'fcfc0000-0000-0000-0000-000000000001',
      path: '/sitecore/content/site/Home/section',
      template: EXCLUDE_FOLDER_TMPL,
    });
    const ctxPage = makeItem({
      id: 'fcfc1111-0000-0000-0000-000000000001',
      parent: folder.id,
      template: pageTemplateId,
      path: '/sitecore/content/site/Home/section/event-streaming',
      sharedFields: [{ id: 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e', hint: '__Sortorder', value: '300' }],
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [{ id: titleField.id, hint: 'Title', value: 'Event Streaming' }] }] }],
    });
    const otherPage = makeItem({
      id: 'fcfc2222-0000-0000-0000-000000000002',
      parent: folder.id,
      template: pageTemplateId,
      path: '/sitecore/content/site/Home/section/read',
      sharedFields: [{ id: 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e', hint: '__Sortorder', value: '100' }],
      languages: [{ language: 'en', fields: [], versions: [{ version: 1, fields: [{ id: titleField.id, hint: 'Title', value: 'Read' }] }] }],
    });

    const rcr = makeItem({
      id: '7e5919e7-a96f-430a-bd74-1c8ef96030d1',
      path: '/sitecore/system/Modules/Layout Service/Rendering Contents Resolvers/Example/Section Navigation',
      sharedFields: [
        { id: RCR_TYPE_FIELD_ID, hint: 'Type', value: DEFAULT_RCR_TYPE },
        { id: RCR_QUERY_FIELD_ID, hint: 'ItemSelectorQuery', value: "../*[@@templateid!='{DC341F6B-784E-45E5-97D1-FAA87EFA6F06}']" },
        { id: RCR_USE_CONTEXT_FIELD_ID, hint: 'UseContextItem', value: '1' },
      ],
    });
    const rendering = makeItem({
      id: 'rend8888-0000-0000-0000-000000000001',
      path: '/sitecore/layout/Renderings/InteractionNavigation',
      template: RENDERING_TEMPLATE_ID,
      sharedFields: [
        { id: RCR_FIELD, hint: 'Rendering Contents Resolver', value: `{${rcr.id.toUpperCase()}}` },
      ],
    });

    const engine = buildEngine([tmpl, section, titleField, folder, ctxPage, otherPage, rcr, rendering]);

    const placeholderTree: PlaceholderNode[] = [
      {
        uid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        renderingId: rendering.id,
        dataSource: '',
        params: {},
        placeholders: {},
      } as PlaceholderNode,
    ];

    const result = resolveComponents(
      { main: placeholderTree } as Record<string, PlaceholderNode[]>,
      engine,
      '',
      ctxPage.path,
      '/sitecore/content/site/Home',
      undefined,
    );

    const component = result.main[0];
    expect(component.componentName).toBe('InteractionNavigation');
    const items = (component.fields.items as unknown as Array<{ name: string; fields: { Title: { value: string } } }>);
    expect(items.map(i => i.name)).toEqual(['read', 'event-streaming']);
    expect(items[0].fields.Title.value).toBe('Read');
  });
});

describe('resolveNode - P1/P2 emission contract', () => {
  it('omits fields key when rendering has no datasource and default RCR', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000201',
        path: '/sitecore/layout/renderings/test/default-rcr',
        sharedFields: [],
      }),
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [
        {
          uid: 'cc000001-0000-0000-0000-000000000001',
          renderingId: 'aa000001-0000-0000-0000-000000000201',
          dataSource: '',
          params: {},
        },
      ],
    };
    const result = resolveComponents(tree, engine, 'https://cdn', '/site/home', '/site');
    expect(result.main[0].fields).toBeUndefined();
  });

  it('emits context-item fields when RCR has UseContextItem=1 and no datasource (0.4.0.15)', () => {
    // Port of Sitecore's `GetContextItem` dispatch
    // (`Sitecore.LayoutService.decompiled.cs:4241`): `UseContextItem=true`
    // yields `Context.Item` → `ProcessItem(Context.Item)` serializes the
    // ROUTE item's typed fields. 0.4.0.14 emitted `{}` here, which under-
    // reported populated fields for Navigation/Breadcrumb/Page Title-style
    // renderings that draw content from the page context.
    const pageTemplateId = 'ff000001-0000-0000-0000-000000000001';
    const titleFieldId = 'ff000002-0000-0000-0000-000000000001';
    const engine = buildEngine([
      // Template with a Title field (so the context item's field is typed).
      makeItem({ id: pageTemplateId, path: '/sitecore/templates/test/ctx-page', template: TEMPLATE_TEMPLATE_ID }),
      makeItem({
        id: 'ff000003-0000-0000-0000-000000000001',
        parent: pageTemplateId,
        path: '/sitecore/templates/test/ctx-page/Data',
        template: TEMPLATE_SECTION_TEMPLATE_ID,
      }),
      makeItem({
        id: titleFieldId,
        parent: 'ff000003-0000-0000-0000-000000000001',
        path: '/sitecore/templates/test/ctx-page/Data/Title',
        template: TEMPLATE_FIELD_TEMPLATE_ID,
        sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
      }),
      // Route/context page item - Title value "Home".
      makeItem({
        id: 'ff000004-0000-0000-0000-000000000001',
        path: '/site/home',
        template: pageTemplateId,
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [{ id: titleFieldId, hint: 'Title', value: 'Home' }],
          }],
        }],
      }),
      // Rendering with RCR pointing at a UseContextItem=1 settings item.
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000202',
        path: '/sitecore/layout/renderings/test/ctx',
        sharedFields: [
          {
            id: RENDERING_CONTENTS_RESOLVER_FIELD_ID,
            hint: 'Rendering Contents Resolver',
            value: '{CC000001-0000-0000-0000-000000000001}',
          },
        ],
      }),
      makeItem({
        id: 'cc000001-0000-0000-0000-000000000001',
        path: '/sitecore/system/settings/rendering contents resolvers/ctx',
        sharedFields: [
          { id: 'ee000001-0000-0000-0000-000000000001', hint: 'UseContextItem', value: '1' },
        ],
      }),
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [
        {
          uid: 'cc000002-0000-0000-0000-000000000001',
          renderingId: 'aa000001-0000-0000-0000-000000000202',
          dataSource: '',
          params: {},
        },
      ],
    };
    const result = resolveComponents(tree, engine, 'https://cdn', '/site/home', '/site');
    // Fields come from the route item, not `{}`.
    expect(result.main[0].fields).toBeDefined();
    expect(result.main[0].fields!.Title).toEqual({ value: 'Home' });
  });

  it('emits {} when RCR has UseContextItem=1 but the context item is unresolvable', () => {
    // Sitecore's `Context.Item` is always present when a rendering is emitted,
    // so in production this branch never fires; the fallback to `{}` exists
    // defensively for unit-test fixtures that do not register a route item
    // at `pageItemPath`.
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000203',
        path: '/sitecore/layout/renderings/test/ctx-no-route',
        sharedFields: [
          {
            id: RENDERING_CONTENTS_RESOLVER_FIELD_ID,
            hint: 'Rendering Contents Resolver',
            value: '{CC000001-0000-0000-0000-000000000002}',
          },
        ],
      }),
      makeItem({
        id: 'cc000001-0000-0000-0000-000000000002',
        path: '/sitecore/system/settings/rendering contents resolvers/ctx-no-route',
        sharedFields: [
          { id: 'ee000001-0000-0000-0000-000000000001', hint: 'UseContextItem', value: '1' },
        ],
      }),
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [
        {
          uid: 'cc000003-0000-0000-0000-000000000001',
          renderingId: 'aa000001-0000-0000-0000-000000000203',
          dataSource: '',
          params: {},
        },
      ],
    };
    // pageItemPath references a route that doesn't exist in the engine.
    const result = resolveComponents(tree, engine, 'https://cdn', '/site/does-not-exist', '/site');
    expect(result.main[0].fields).toEqual({});
  });

  it('merges declared-but-empty slots into placeholders', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000210',
        path: '/sitecore/layout/renderings/test/two-slot-container',
        sharedFields: [
          {
            id: PLACEHOLDERS_FIELD_ID,
            hint: 'Placeholders',
            value:
              '{BB000001-0000-0000-0000-000000000001}|{BB000001-0000-0000-0000-000000000002}',
          },
        ],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000001',
        path: '/sitecore/layout/placeholder settings/slot-a',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'slot-a' }],
      }),
      makeItem({
        id: 'bb000001-0000-0000-0000-000000000002',
        path: '/sitecore/layout/placeholder settings/slot-b',
        sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'slot-b' }],
      }),
      // A child rendering with no datasource and no RCR - emits a minimal node.
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000211',
        path: '/sitecore/layout/renderings/test/child',
        sharedFields: [],
      }),
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [
        {
          uid: 'cc000003-0000-0000-0000-000000000001',
          renderingId: 'aa000001-0000-0000-0000-000000000210',
          dataSource: '',
          params: {},
          placeholders: {
            'slot-a': [
              {
                uid: 'cc000003-0000-0000-0000-000000000002',
                renderingId: 'aa000001-0000-0000-0000-000000000211',
                dataSource: '',
                params: {},
              },
            ],
          },
        },
      ],
    };
    const result = resolveComponents(tree, engine, 'https://cdn', '/site/home', '/site');
    expect(result.main[0].placeholders).toBeDefined();
    expect(Object.keys(result.main[0].placeholders!).sort()).toEqual(['slot-a', 'slot-b']);
    expect(result.main[0].placeholders!['slot-b']).toEqual([]);
    expect(result.main[0].placeholders!['slot-a']).toHaveLength(1);
  });

  it('preserves existing placeholders key absent when neither declared nor populated', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000220',
        path: '/sitecore/layout/renderings/test/leaf',
        sharedFields: [],
      }),
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [
        {
          uid: 'cc000004-0000-0000-0000-000000000001',
          renderingId: 'aa000001-0000-0000-0000-000000000220',
          dataSource: '',
          params: {},
        },
      ],
    };
    const result = resolveComponents(tree, engine, 'https://cdn', '/site/home', '/site');
    expect(result.main[0].placeholders).toBeUndefined();
  });
});

describe('resolveNode - P3b hidden stub emission', () => {
  it('emits experience stub shape when node.hidden is true', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000301',
        path: '/sitecore/layout/renderings/test/would-be-rendered',
        sharedFields: [],
      }),
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [
        {
          uid: 'c4a3bf11-0000-0000-0000-000000000001',
          renderingId: 'aa000001-0000-0000-0000-000000000301',
          dataSource: '',
          params: {},
          hidden: true,
        },
      ],
    };
    const result = resolveComponents(tree, engine, 'https://cdn', '/site/home', '/site');
    expect(result.main[0]).toEqual({
      uid: 'c4a3bf11-0000-0000-0000-000000000001',
      componentName: null,
      dataSource: null,
      experiences: {},
    });
  });

  it('ignores hidden flag false - resolves normally', () => {
    const engine = buildEngine([
      makeItem({
        id: 'aa000001-0000-0000-0000-000000000302',
        path: '/sitecore/layout/renderings/test/visible',
        sharedFields: [],
      }),
    ]);
    const tree: Record<string, PlaceholderNode[]> = {
      'main': [
        {
          uid: 'c4a3bf11-0000-0000-0000-000000000002',
          renderingId: 'aa000001-0000-0000-0000-000000000302',
          dataSource: '',
          params: {},
        },
      ],
    };
    const result = resolveComponents(tree, engine, 'https://cdn', '/site/home', '/site');
    expect(result.main[0].componentName).toBe('visible');
    expect(result.main[0].experiences).toBeUndefined();
  });
});

describe('resolveComponents - composite-field placeholder suppression (0.4.0.29)', () => {
  // FaqList (and similar) absorb their children into a composite field
  // (`FaqGroups`) via the RCR. Sitecore prod emits the FaqList with
  // populated `fields.FaqGroups` and NO `placeholders` - the accordion
  // children never reach the layout response as distinct renderings.
  // Mockingbird previously walked the placeholder tree for FaqList, which
  // double-emitted FAQ entries (once as FaqGroups, once as accordion-N
  // RichText). Regression guard for /case-studies/case-01.
  //
  // Implementation: a small allowlist of componentName values that suppress
  // child-placeholder walking. Generalising to "any rendering whose RCR
  // produces composite children" is nicer but requires reasoning over RCR
  // configuration that isn't consistently available in site's registry.

  const FAQ_LIST_RENDERING_ID = 'faafaafa-0000-0000-0000-000000000001';
  const faqListRendering = makeItem({
    id: FAQ_LIST_RENDERING_ID,
    path: '/sitecore/layout/Renderings/SXA/FaqList',
    template: RENDERING_TEMPLATE_ID,
  });

  it('emits no placeholders for FaqList even when the tree has accordion-N children', () => {
    const engine = buildEngine([faqListRendering]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{FAQ}',
        renderingId: FAQ_LIST_RENDERING_ID,
        dataSource: '',
        params: {},
        placeholders: {
          'accordion-0': [{
            uid: '{A0}',
            renderingId: FAQ_LIST_RENDERING_ID, // reuse for the test - any resolvable id works
            dataSource: '',
            params: {},
          }],
          'accordion-1': [{
            uid: '{A1}',
            renderingId: FAQ_LIST_RENDERING_ID,
            dataSource: '',
            params: {},
          }],
        },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main']).toHaveLength(1);
    const faq = result['headless-main'][0];
    expect(faq.componentName).toBe('FaqList');
    expect(faq.placeholders).toBeUndefined();
  });

  it('does not suppress placeholders for non-composite components', () => {
    // Regression guard: the suppression must be narrow - an ordinary
    // rendering with children should continue emitting placeholders.
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{H}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // HeroBanner
        dataSource: '',
        params: {},
        placeholders: {
          'child': [{
            uid: '{C}',
            renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            dataSource: '',
            params: {},
          }],
        },
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main'][0].placeholders).toBeDefined();
    expect(result['headless-main'][0].placeholders!['child']).toHaveLength(1);
  });
});

describe('resolveComponents - datasource publishing filter (opt-in from 0.4.0.30)', () => {
  // Port of Sitecore's `Database.GetItem`-returns-null-on-draft behaviour.
  //
  // 0.4.0.30: default flipped to off - the predicate is opt-in via
  // `MOCKINGBIRD_PUBLISHING_VALIDATION=approved` because site's actual Edge
  // preview doesn't filter by `__Workflow state` alone (items in the same
  // state can have different publish status). Tests explicitly enable the
  // filter via env var below so the integration path stays exercised.

  const WORKFLOW_STATE_ID = '3e431de1-525e-47a3-b6b0-1ccbec3a8c98';
  const APPROVED = '{F7FE5BDD-A991-4A58-9735-CD08F9B097AB}';
  const DRAFT = '{4460E76C-87E9-4859-9DE6-DE122774937F}';

  const savedEnv = { ...process.env };
  beforeEach(() => {
    process.env.MOCKINGBIRD_PUBLISHING_VALIDATION = 'approved';
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('is OFF by default - draft datasource emits normally with no env var set', () => {
    // 0.4.0.30 regression guard against the 0.4.0.29 default-on breakage.
    delete process.env.MOCKINGBIRD_PUBLISHING_VALIDATION;
    const dsId = 'dfaf3333-0000-0000-0000-000000000001';
    const draftDs = makeItem({
      id: dsId,
      path: '/sitecore/content/site/Home/Data/Text Default',
      template: 'dddd4444-dddd-dddd-dddd-dddddddddddd',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: 'f1', hint: 'Title', value: 'draft but visible' },
            { id: WORKFLOW_STATE_ID, hint: '__Workflow state', value: DRAFT },
          ],
        }],
      }],
    });
    const engine = buildEngine([renderingItem, draftDs, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: `{${dsId.toUpperCase()}}`,
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main']).toHaveLength(1);
  });

  it('drops a rendering whose datasource item is in the Draft workflow state', () => {
    const dsId = 'dfaf1111-0000-0000-0000-000000000001';
    const draftDatasource = makeItem({
      id: dsId,
      path: '/sitecore/content/site/Home/Data/Text 3',
      template: 'dddd4444-dddd-dddd-dddd-dddddddddddd',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: 'f1', hint: 'Title', value: 'Draft text' },
            { id: WORKFLOW_STATE_ID, hint: '__Workflow state', value: DRAFT },
          ],
        }],
      }],
    });
    const engine = buildEngine([renderingItem, draftDatasource, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: `{${dsId.toUpperCase()}}`,
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main']).toEqual([]);
  });

  it('emits a rendering whose datasource item is in the Approved workflow state', () => {
    const dsId = 'dfaf2222-0000-0000-0000-000000000001';
    const approvedDatasource = makeItem({
      id: dsId,
      path: '/sitecore/content/site/Home/Data/Approved Text',
      template: 'dddd4444-dddd-dddd-dddd-dddddddddddd',
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: 'f1', hint: 'Title', value: 'Published text' },
            { id: WORKFLOW_STATE_ID, hint: '__Workflow state', value: APPROVED },
          ],
        }],
      }],
    });
    const engine = buildEngine([renderingItem, approvedDatasource, dsTemplate, dsSection, dsFieldTitle, dsFieldSubtitle]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: `{${dsId.toUpperCase()}}`,
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main']).toHaveLength(1);
    expect(result['headless-main'][0].fields?.Title).toEqual({ value: 'Published text' });
  });

  it('passes through renderings with no datasource (UseContextItem fallback)', () => {
    // A rendering with no `s:ds` attribute isn't affected by the datasource
    // filter - it binds to the context item via `UseContextItem=true`.
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [{
        uid: '{A}',
        renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        dataSource: '',
        params: {},
      }],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main']).toHaveLength(1);
  });
});

describe('resolveComponents - unresolvable renderings (0.4.0.29)', () => {
  // Sitecore Edge emits nothing at a placeholder slot when a rendering's
  // s:id cannot be resolved to a component definition - client-side / IAR-
  // shipped renderings (SXA OOTB SearchResults, etc.) never reach the layout
  // pipeline because they're resolved at render time by the CSDK. Mockingbird
  // previously emitted `{componentName: "Unknown", uid, ...}` which created
  // a phantom position that prod has nothing at. Suppress entirely.

  it('omits a rendering whose renderingId cannot be resolved in tree or registry', () => {
    // Only a known rendering is registered; the second uses an unregistered id.
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [
        {
          uid: '{A}',
          renderingId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          dataSource: '',
          params: {},
        },
        {
          uid: '{B}',
          renderingId: 'cafebabe-0000-0000-0000-000000000000',
          dataSource: '',
          params: {},
        },
      ],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    // The known rendering emits, the unresolvable one is dropped entirely.
    expect(result['headless-main']).toHaveLength(1);
    expect(result['headless-main'][0].uid).toBe('{A}');
  });

  it('does not emit any rendering with componentName === "Unknown"', () => {
    const engine = buildEngine([renderingItem]);
    const tree: Record<string, PlaceholderNode[]> = {
      'headless-main': [
        {
          uid: '{X}',
          renderingId: 'deadbeef-1111-2222-3333-444444444444',
          dataSource: '',
          params: {},
        },
      ],
    };
    const result = resolveComponents(tree, engine, '', '', '');
    expect(result['headless-main']).toEqual([]);
  });
});
