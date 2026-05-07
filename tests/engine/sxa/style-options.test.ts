import { describe, expect, it } from 'vitest';
import { resolveStyleOptions } from '../../../src/engine/sxa/style-options.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';
import type { ScsField } from '../../../src/engine/types.js';

const STYLE_TEMPLATE_ID = '6b8aabef-d650-46e0-97d0-c0b04f7f016b';
const STYLE_FOLDER_TEMPLATE_ID = 'c6dc7393-15bb-4cd7-b798-ab63e77ebac4';
const VALUE_FIELD_ID = '09147fb2-ebfb-4949-8c8e-26a424409d5e';
const ALLOWED_RENDERINGS_FIELD_ID = '69bb49f3-da64-4b0e-abd6-184b832ff6ab';

const RENDERING_ID = '{7A1D9A21-B8D7-42F9-9B0B-92ABF8D1974F}';

function valueField(value: string): ScsField {
  return { id: VALUE_FIELD_ID, hint: 'Value', value };
}

function allowedField(value: string): ScsField {
  return { id: ALLOWED_RENDERINGS_FIELD_ID, hint: 'Allowed Renderings', value };
}

function tenantStylesFixture() {
  return [
    makeItem({ id: 'tenant', path: '/sitecore/content/tenant' }),
    makeItem({ id: 'common', parent: 'tenant', path: '/sitecore/content/tenant/common' }),
    makeItem({ id: 'common-pres', parent: 'common', path: '/sitecore/content/tenant/common/Presentation' }),
    makeItem({ id: 'common-styles', parent: 'common-pres', path: '/sitecore/content/tenant/common/Presentation/Styles' }),
    makeItem({
      id: 'common-bg-cat',
      parent: 'common-styles',
      template: STYLE_FOLDER_TEMPLATE_ID,
      path: '/sitecore/content/tenant/common/Presentation/Styles/Background colors',
    }),
    makeItem({
      id: 'common-black',
      parent: 'common-bg-cat',
      template: STYLE_TEMPLATE_ID,
      path: '/sitecore/content/tenant/common/Presentation/Styles/Background colors/Black',
      sharedFields: [valueField('background-black')],
    }),
    makeItem({ id: 'site', parent: 'tenant', path: '/sitecore/content/tenant/site' }),
    makeItem({ id: 'site-pres', parent: 'site', path: '/sitecore/content/tenant/site/Presentation' }),
    makeItem({ id: 'site-styles', parent: 'site-pres', path: '/sitecore/content/tenant/site/Presentation/Styles' }),
    makeItem({
      id: 'site-cat',
      parent: 'site-styles',
      template: STYLE_FOLDER_TEMPLATE_ID,
      path: '/sitecore/content/tenant/site/Presentation/Styles/Container',
    }),
    makeItem({
      id: 'site-boxed',
      parent: 'site-cat',
      template: STYLE_TEMPLATE_ID,
      path: '/sitecore/content/tenant/site/Presentation/Styles/Container/Boxed',
      sharedFields: [valueField('boxed')],
    }),
  ];
}

describe('resolveStyleOptions', () => {
  it('returns categories from common (Shared) and site, filtered by allowed renderings', () => {
    const engine = buildEngine(tenantStylesFixture());
    const result = resolveStyleOptions(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    expect(result.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Background colors',
        isShared: true,
        styles: expect.arrayContaining([
          expect.objectContaining({ id: '{COMMON-BLACK}', cssValue: 'background-black' }),
        ]),
      }),
      expect.objectContaining({
        name: 'Container',
        isShared: false,
        styles: expect.arrayContaining([
          expect.objectContaining({ id: '{SITE-BOXED}', cssValue: 'boxed' }),
        ]),
      }),
    ]));
  });

  it('excludes styles whose Allowed Renderings is set and does not include the rendering id', () => {
    const fx = tenantStylesFixture();
    const blackItem = fx.find(i => i.id === 'common-black')!;
    blackItem.sharedFields = [
      ...blackItem.sharedFields,
      allowedField('{99999999-9999-9999-9999-999999999999}'),
    ];
    const engine = buildEngine(fx);
    const result = resolveStyleOptions(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    const bgCategory = result.categories.find(c => c.name === 'Background colors');
    expect(bgCategory?.styles ?? []).toEqual([]);
  });

  it('treats empty Allowed Renderings as permissive', () => {
    const engine = buildEngine(tenantStylesFixture());
    const result = resolveStyleOptions(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    const bgCategory = result.categories.find(c => c.name === 'Background colors');
    expect(bgCategory?.styles).toHaveLength(1);
  });

  it('merges same-named categories from common and site (isShared=true, common styles first)', () => {
    const fx = tenantStylesFixture();
    // Add a Container category in common (same name as site's Container)
    fx.push(
      makeItem({
        id: 'common-container-cat',
        parent: 'common-styles',
        template: STYLE_FOLDER_TEMPLATE_ID,
        path: '/sitecore/content/tenant/common/Presentation/Styles/Container',
      }),
      makeItem({
        id: 'common-fluid',
        parent: 'common-container-cat',
        template: STYLE_TEMPLATE_ID,
        path: '/sitecore/content/tenant/common/Presentation/Styles/Container/Fluid',
        sharedFields: [valueField('container-fluid')],
      }),
    );
    const engine = buildEngine(fx);
    const result = resolveStyleOptions(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    const container = result.categories.find(c => c.name === 'Container');
    expect(container).toBeDefined();
    expect(container!.isShared).toBe(true);
    expect(container!.styles.map(s => s.cssValue)).toEqual(['container-fluid', 'boxed']);
  });

  it('respects __Sortorder when ordering styles within a category', () => {
    const SORTORDER_FIELD_ID = 'ba3f86a2-4a1c-4d78-b63d-91c2779c1b5e';
    const sortField = (n: number): ScsField => ({ id: SORTORDER_FIELD_ID, hint: '__Sortorder', value: String(n) });
    const fx = tenantStylesFixture();
    fx.push(
      makeItem({
        id: 'common-white',
        parent: 'common-bg-cat',
        template: STYLE_TEMPLATE_ID,
        path: '/sitecore/content/tenant/common/Presentation/Styles/Background colors/White',
        sharedFields: [valueField('background-white'), sortField(50)],
      }),
    );
    // Boost Black's sortorder above White's so it appears later
    const blackItem = fx.find(i => i.id === 'common-black')!;
    blackItem.sharedFields = [...blackItem.sharedFields, sortField(200)];
    const engine = buildEngine(fx);
    const result = resolveStyleOptions(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    const bg = result.categories.find(c => c.name === 'Background colors')!;
    expect(bg.styles.map(s => s.cssValue)).toEqual(['background-white', 'background-black']);
  });
});
