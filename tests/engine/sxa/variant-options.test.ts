import { describe, expect, it } from 'vitest';
import { resolveVariantsForRendering } from '../../../src/engine/sxa/variant-options.js';
import { buildEngine, makeItem } from '../layout/_helpers.js';

const HEADLESS_VARIANTS_FOLDER_TEMPLATE = '49c111d0-6867-4798-a724-1f103166e6e9';
const VARIANT_DEFINITION_TEMPLATE = '4d50cdae-c2d9-4de8-b080-8f992bfb1b55';
const COMPATIBLE_RENDERINGS_FIELD_ID = '087c0553-9162-41f5-98d3-87eb0d80edbb';

const RENDERING_ID = '{F473E58A-64BB-4EA9-89BE-2155F3D916E9}';
const RENDERING_ID_NORMALIZED = 'f473e58a-64bb-4ea9-89be-2155f3d916e9';
const OTHER_RENDERING_ID = '{99999999-9999-9999-9999-999999999999}';

describe('resolveVariantsForRendering', () => {
  it('returns variants from folders whose Compatible Renderings includes the rendering id', () => {
    const engine = buildEngine([
      makeItem({ id: 'site-root', path: '/sitecore/content/tenant/site' }),
      makeItem({ id: 'pres', parent: 'site-root', path: '/sitecore/content/tenant/site/Presentation' }),
      makeItem({ id: 'hv-root', parent: 'pres', path: '/sitecore/content/tenant/site/Presentation/Headless Variants' }),
      makeItem({
        id: 'compat-folder',
        parent: 'hv-root',
        template: HEADLESS_VARIANTS_FOLDER_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Case Study Header',
        sharedFields: [{ id: COMPATIBLE_RENDERINGS_FIELD_ID, hint: 'Compatible Renderings', value: RENDERING_ID }],
      }),
      makeItem({
        id: 'variant-a',
        parent: 'compat-folder',
        template: VARIANT_DEFINITION_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Case Study Header/CaseStudyHeader',
      }),
      makeItem({
        id: 'incompat-folder',
        parent: 'hv-root',
        template: HEADLESS_VARIANTS_FOLDER_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Other Variants',
        sharedFields: [{ id: COMPATIBLE_RENDERINGS_FIELD_ID, hint: 'Compatible Renderings', value: OTHER_RENDERING_ID }],
      }),
      makeItem({
        id: 'variant-b',
        parent: 'incompat-folder',
        template: VARIANT_DEFINITION_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Other Variants/OtherVariant',
      }),
    ]);

    const result = resolveVariantsForRendering(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]).toMatchObject({
      id: '{VARIANT-A}',
      name: 'CaseStudyHeader',
      folderName: 'Case Study Header',
    });
  });

  it('falls back to folder-name match when Compatible Renderings is empty', () => {
    const engine = buildEngine([
      makeItem({ id: 'site-root', path: '/sitecore/content/tenant/site' }),
      makeItem({ id: 'pres', parent: 'site-root', path: '/sitecore/content/tenant/site/Presentation' }),
      makeItem({ id: 'hv-root', parent: 'pres', path: '/sitecore/content/tenant/site/Presentation/Headless Variants' }),
      makeItem({
        id: 'matching-folder',
        parent: 'hv-root',
        template: HEADLESS_VARIANTS_FOLDER_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Matched Rendering',
      }),
      makeItem({
        id: 'variant-x',
        parent: 'matching-folder',
        template: VARIANT_DEFINITION_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Matched Rendering/X',
      }),
      makeItem({
        id: 'unrelated-folder',
        parent: 'hv-root',
        template: HEADLESS_VARIANTS_FOLDER_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Different Name',
      }),
      makeItem({
        id: 'variant-y',
        parent: 'unrelated-folder',
        template: VARIANT_DEFINITION_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Different Name/Y',
      }),
      // The rendering item itself, named "Matched Rendering"
      makeItem({
        id: 'f473e58a-64bb-4ea9-89be-2155f3d916e9',
        parent: 'site-root',
        path: '/sitecore/layout/Renderings/Matched Rendering',
      }),
    ]);

    const result = resolveVariantsForRendering(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    // Folder "Matched Rendering" matches rendering name; folder "Different Name" does not.
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].folderName).toBe('Matched Rendering');
  });

  it('returns empty when Headless Variants folder is missing', () => {
    const engine = buildEngine([
      makeItem({ id: 'site-root', path: '/sitecore/content/tenant/site' }),
    ]);
    const result = resolveVariantsForRendering(engine, '/sitecore/content/tenant/site', '/sitecore/content/tenant/common', RENDERING_ID);
    expect(result.variants).toEqual([]);
  });

  it('walks both common and site roots, merging results with isShared markers', () => {
    const engine = buildEngine([
      makeItem({ id: 'tenant', path: '/sitecore/content/tenant' }),
      // Common root
      makeItem({ id: 'common', parent: 'tenant', path: '/sitecore/content/tenant/common' }),
      makeItem({ id: 'common-pres', parent: 'common', path: '/sitecore/content/tenant/common/Presentation' }),
      makeItem({ id: 'common-hv', parent: 'common-pres', path: '/sitecore/content/tenant/common/Presentation/Headless Variants' }),
      makeItem({
        id: 'common-spotlight-folder',
        parent: 'common-hv',
        template: HEADLESS_VARIANTS_FOLDER_TEMPLATE,
        path: '/sitecore/content/tenant/common/Presentation/Headless Variants/Spotlight',
      }),
      makeItem({
        id: 'common-variant',
        parent: 'common-spotlight-folder',
        template: VARIANT_DEFINITION_TEMPLATE,
        path: '/sitecore/content/tenant/common/Presentation/Headless Variants/Spotlight/NoImage',
      }),
      // Site root
      makeItem({ id: 'site', parent: 'tenant', path: '/sitecore/content/tenant/site' }),
      makeItem({ id: 'site-pres', parent: 'site', path: '/sitecore/content/tenant/site/Presentation' }),
      makeItem({ id: 'site-hv', parent: 'site-pres', path: '/sitecore/content/tenant/site/Presentation/Headless Variants' }),
      makeItem({
        id: 'site-spotlight-folder',
        parent: 'site-hv',
        template: HEADLESS_VARIANTS_FOLDER_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Spotlight',
      }),
      makeItem({
        id: 'site-variant',
        parent: 'site-spotlight-folder',
        template: VARIANT_DEFINITION_TEMPLATE,
        path: '/sitecore/content/tenant/site/Presentation/Headless Variants/Spotlight/CustomVariant',
      }),
      // Spotlight rendering (name = "Spotlight" so folder-name fallback matches)
      makeItem({
        id: 'f473e58a-64bb-4ea9-89be-2155f3d916e9',
        parent: 'tenant',
        path: '/sitecore/layout/Renderings/Spotlight',
      }),
    ]);

    const result = resolveVariantsForRendering(
      engine,
      '/sitecore/content/tenant/site',
      '/sitecore/content/tenant/common',
      RENDERING_ID,
    );
    expect(result.variants).toHaveLength(2);
    const common = result.variants.find(v => v.id === '{COMMON-VARIANT}');
    const site = result.variants.find(v => v.id === '{SITE-VARIANT}');
    expect(common?.isShared).toBe(true);
    expect(site?.isShared).toBe(false);
  });
});
