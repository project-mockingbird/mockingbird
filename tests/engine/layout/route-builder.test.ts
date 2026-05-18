import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveLayout } from '../../../src/engine/layout/index.js';
import {
  RENDERING_TEMPLATE_ID,
  TEMPLATE_TEMPLATE_ID,
  TEMPLATE_SECTION_TEMPLATE_ID,
  TEMPLATE_FIELD_TEMPLATE_ID,
  FIELD_IDS,
  PLACEHOLDERS_FIELD_ID,
  PLACEHOLDER_KEY_FIELD_ID,
} from '../../../src/engine/constants.js';
import {
  FINAL_RENDERINGS_FIELD_ID,
  PAGE_DESIGN_OVERRIDE_FIELD_ID,
  TEMPLATES_MAPPING_FIELD_ID,
  PARTIAL_DESIGNS_FIELD_ID,
} from '../../../src/engine/layout/page-design.js';
import { makeItem, buildEngine } from './_helpers.js';

const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

const pageTemplateId = 'eeee1111-eeee-eeee-eeee-eeeeeeeeeeee';
const pageTemplate = makeItem({
  id: pageTemplateId,
  path: '/sitecore/templates/Project/site/Content Page',
  template: TEMPLATE_TEMPLATE_ID,
});
const pageSection = makeItem({
  id: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
  parent: pageTemplateId,
  path: '/sitecore/templates/Project/site/Content Page/Content',
  template: TEMPLATE_SECTION_TEMPLATE_ID,
});
const titleField = makeItem({
  id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee',
  parent: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
  path: '/sitecore/templates/Project/site/Content Page/Content/Title',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
});
const contentField = makeItem({
  id: 'eeee4444-eeee-eeee-eeee-eeeeeeeeeeee',
  parent: 'eeee2222-eeee-eeee-eeee-eeeeeeeeeeee',
  path: '/sitecore/templates/Project/site/Content Page/Content/Content',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Rich Text' }],
});

const heroBannerRendering = makeItem({
  id: 'rend1111-rend-rend-rend-rendrendrend',
  path: '/sitecore/layout/Renderings/Project/site/HeroBanner',
  template: RENDERING_TEMPLATE_ID,
  sharedFields: [
    { id: 'a77e8568-1ab3-44f1-a664-b7c37ec7810d', hint: 'Parameters Template', value: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
  ],
});
const headerRendering = makeItem({
  id: 'rend2222-rend-rend-rend-rendrendrend',
  path: '/sitecore/layout/Renderings/Project/site/Header',
  template: RENDERING_TEMPLATE_ID,
});
const footerRendering = makeItem({
  id: 'rend3333-rend-rend-rend-rendrendrend',
  path: '/sitecore/layout/Renderings/Project/site/Footer',
  template: RENDERING_TEMPLATE_ID,
});

function renderingXml(renderings: Array<{ uid: string; id: string; ph: string; par?: string }>): string {
  const inner = renderings
    .map(r => `<r uid="{${r.uid}}" s:id="{${r.id}}" s:ph="${r.ph}" s:ds="" s:par="${r.par ?? ''}" />`)
    .join('');
  return `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}">${inner}</d></r>`;
}

const homePage = makeItem({
  id: 'home1111-home-home-home-homehomehome',
  path: '/sitecore/content/site/Home',
  template: pageTemplateId,
  languages: [{
    language: 'en',
    fields: [],
    versions: [{
      version: 1,
      fields: [
        {
          id: FINAL_RENDERINGS_FIELD_ID,
          hint: '__Final Renderings',
          type: 'layout',
          value: renderingXml([
            { uid: 'AAA00000-0000-0000-0000-000000000000', id: 'REND1111-REND-REND-REND-RENDRENDREND', ph: 'headless-main', par: 'GridParameters=col-12' },
          ]),
        },
        { id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Title', value: 'Welcome Home' },
        { id: 'eeee4444-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Content', value: '<p>Hello</p>' },
      ],
    }],
  }],
});

const siteRootPath = '/sitecore/content/site/Home';

describe('resolveLayout', () => {
  it('returns null for nonexistent route', async () => {
    const engine = buildEngine([]);
    const result = await resolveLayout('/nonexistent', engine, { siteRootPath, mediaBaseUrl: '' });
    expect(result).toBeNull();
  });

  it('resolves the home page with route-level fields', async () => {
    const engine = buildEngine([
      homePage, pageTemplate, pageSection, titleField, contentField, heroBannerRendering,
    ]);
    const result = await resolveLayout('/', engine, { siteRootPath, mediaBaseUrl: '' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Home');
    expect(result!.fields['Title']).toEqual({ value: 'Welcome Home' });
    expect(result!.fields['Content']).toEqual({ value: '<p>Hello</p>' });
  });

  it('includes route metadata', async () => {
    const engine = buildEngine([
      homePage, pageTemplate, pageSection, titleField, contentField, heroBannerRendering,
    ]);
    const result = await resolveLayout('/', engine, { siteRootPath, mediaBaseUrl: '' });
    expect(result!.itemId).toBe('home1111-home-home-home-homehomehome');
    expect(result!.templateId).toBe(pageTemplateId);
    expect(result!.templateName).toBe('Content Page');
    expect(result!.databaseName).toBe('master');
    expect(result!.itemLanguage).toBe('en');
  });

  it('resolves placeholders with components from the page own __Final Renderings', async () => {
    const engine = buildEngine([
      homePage, pageTemplate, pageSection, titleField, contentField, heroBannerRendering,
    ]);
    const result = await resolveLayout('/', engine, { siteRootPath, mediaBaseUrl: '' });
    expect(result!.placeholders['headless-main']).toHaveLength(1);
    expect(result!.placeholders['headless-main'][0].componentName).toBe('HeroBanner');
    expect(result!.placeholders['headless-main'][0].params).toEqual({ GridParameters: 'col-12', FieldNames: 'Default' });
  });

  it('does not default FieldNames for renderings without a Parameters Template', async () => {
    // Non-SXA renderings (e.g. Tealium) have no Parameters Template set and
    // therefore no FieldNames field - Edge does NOT emit the default for them.
    const tealiumRendering = makeItem({
      id: 'rend4444-rend-rend-rend-rendrendrend',
      path: '/sitecore/layout/Renderings/Project/site/Tealium',
      template: RENDERING_TEMPLATE_ID,
    });
    const tealiumPage = makeItem({
      id: 'home2222-home-home-home-homehomehome',
      path: '/sitecore/content/site/Tealium',
      template: pageTemplateId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            type: 'layout',
            value: renderingXml([
              { uid: 'BBB00000-0000-0000-0000-000000000000', id: 'REND4444-REND-REND-REND-RENDRENDREND', ph: 'headless-main', par: '' },
            ]),
          }],
        }],
      }],
    });
    const engine = buildEngine([
      tealiumPage, pageTemplate, pageSection, titleField, contentField, tealiumRendering,
    ]);
    const result = await resolveLayout('/', engine, { siteRootPath: '/sitecore/content/site/Tealium', mediaBaseUrl: '' });
    expect(result!.placeholders['headless-main'][0].params).toEqual({});
  });

  it('returns empty placeholders when the page has no __Final Renderings', async () => {
    const pageNoRenderings = makeItem({
      id: 'page2222-page-page-page-pagepagepage',
      path: '/sitecore/content/site/Home/About',
      parent: 'home1111-home-home-home-homehomehome',
      template: pageTemplateId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields: [{ id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Title', value: 'About' }] }],
      }],
    });
    const engine = buildEngine([
      homePage, pageNoRenderings, pageTemplate, pageSection, titleField, contentField,
    ]);
    // 0.4.0.18: `resolveLayout` emits a scaffolded empty-placeholders route
    // regardless of `allowScaffoldForEmptyLayout` when no own renderings and
    // no partial-design entries exist. The layoutId falls back to
    // JSS_LAYOUT_ID, whose declared placeholders in-registry are empty but
    // are hardcoded to the three Headless keys via the
    // `JSS_LAYOUT_DEFAULT_PLACEHOLDER_KEYS` fallback in
    // `emptyPlaceholdersFromLayoutItem`.
    const result = await resolveLayout('/About', engine, {
      siteRootPath,
      mediaBaseUrl: '',
      allowScaffoldForEmptyLayout: true,
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('About');
    expect(result!.placeholders).toEqual({
      'headless-header': [],
      'headless-main': [],
      'headless-footer': [],
    });
  });

  it('merges partial design renderings before page renderings via Page Design mapping', async () => {
    const headerPartialId = 'ph111111-pppp-pppp-pppp-pppppppppppp';
    const footerPartialId = 'pf111111-pppp-pppp-pppp-pppppppppppp';
    const pageDesignId = 'pd111111-pppp-pppp-pppp-pppppppppppp';

    const headerPartial = makeItem({
      id: headerPartialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/Header',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: renderingXml([
              { uid: 'HDR00000-0000-0000-0000-000000000000', id: 'REND2222-REND-REND-REND-RENDRENDREND', ph: 'headless-header' },
            ]),
          }],
        }],
      }],
    });
    const footerPartial = makeItem({
      id: footerPartialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/Footer',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: renderingXml([
              { uid: 'FTR00000-0000-0000-0000-000000000000', id: 'REND3333-REND-REND-REND-RENDRENDREND', ph: 'headless-footer' },
            ]),
          }],
        }],
      }],
    });
    const pageDesignItem = makeItem({
      id: pageDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Content Page',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${headerPartialId.toUpperCase()}}|{${footerPartialId.toUpperCase()}}`,
      }],
    });
    const pageDesignsRoot = makeItem({
      id: 'pdr11111-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        // Double URL-encoded: {pageTemplateId}={pageDesignId}
        value: encodeURIComponent(encodeURIComponent(`{${pageTemplateId.toUpperCase()}}={${pageDesignId.toUpperCase()}}`)),
      }],
    });
    const engine = buildEngine([
      homePage, pageTemplate, pageSection, titleField, contentField,
      headerPartial, footerPartial, pageDesignItem, pageDesignsRoot,
      heroBannerRendering, headerRendering, footerRendering,
    ]);
    const result = await resolveLayout('/', engine, { siteRootPath, mediaBaseUrl: '' });
    expect(result).not.toBeNull();
    // Partials contributed header + footer, page contributed hero banner
    expect(result!.placeholders['headless-header']).toHaveLength(1);
    expect(result!.placeholders['headless-header'][0].componentName).toBe('Header');
    expect(result!.placeholders['headless-footer']).toHaveLength(1);
    expect(result!.placeholders['headless-footer'][0].componentName).toBe('Footer');
    expect(result!.placeholders['headless-main']).toHaveLength(1);
    expect(result!.placeholders['headless-main'][0].componentName).toBe('HeroBanner');
  });

  it('per-item `Page Design` field overrides TemplatesMapping', async () => {
    const mappedDesignId = 'pd000000-0000-0000-0000-000000000000';
    const overrideDesignId = 'pd111111-1111-1111-1111-111111111111';
    const mappedPartialId = 'pp000000-0000-0000-0000-000000000000';
    const overridePartialId = 'pp111111-1111-1111-1111-111111111111';

    const mappedPartial = makeItem({
      id: mappedPartialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/Mapped',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: renderingXml([
              { uid: 'MAP00000-0000-0000-0000-000000000000', id: 'REND2222-REND-REND-REND-RENDRENDREND', ph: 'headless-chrome' },
            ]),
          }],
        }],
      }],
    });
    const overridePartial = makeItem({
      id: overridePartialId,
      path: '/sitecore/content/site/Presentation/Partial Designs/Override',
      template: TEMPLATE_TEMPLATE_ID,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: renderingXml([
              { uid: 'OVR00000-0000-0000-0000-000000000000', id: 'REND3333-REND-REND-REND-RENDRENDREND', ph: 'headless-chrome' },
            ]),
          }],
        }],
      }],
    });
    const mappedDesign = makeItem({
      id: mappedDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Mapped',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${mappedPartialId.toUpperCase()}}`,
      }],
    });
    const overrideDesign = makeItem({
      id: overrideDesignId,
      path: '/sitecore/content/site/Presentation/Page Designs/Override',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: PARTIAL_DESIGNS_FIELD_ID,
        hint: 'PartialDesigns',
        value: `{${overridePartialId.toUpperCase()}}`,
      }],
    });
    const pageDesignsRoot = makeItem({
      id: 'pdr22222-pppp-pppp-pppp-pppppppppppp',
      path: '/sitecore/content/site/Presentation/Page Designs',
      template: TEMPLATE_TEMPLATE_ID,
      sharedFields: [{
        id: TEMPLATES_MAPPING_FIELD_ID,
        hint: 'TemplatesMapping',
        value: encodeURIComponent(encodeURIComponent(`{${pageTemplateId.toUpperCase()}}={${mappedDesignId.toUpperCase()}}`)),
      }],
    });
    // Provide a minimal own entry so there's a page-level rendering in the
    // merged tree alongside the override partial's contribution. (Pre-0.4.0.15
    // this also worked around the P3a own-layout gate - that gate has since
    // been removed; the own entry is still useful here for the merge check.)
    const homeWithOverride = makeItem({
      id: 'home2222-home-home-home-homehomehome',
      path: '/sitecore/content/site/Home',
      template: pageTemplateId,
      sharedFields: [{
        id: PAGE_DESIGN_OVERRIDE_FIELD_ID,
        hint: 'Page Design',
        value: `{${overrideDesignId.toUpperCase()}}`,
      }],
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [{
            id: FINAL_RENDERINGS_FIELD_ID,
            hint: '__Final Renderings',
            value: renderingXml([
              { uid: 'OWN22222-0000-0000-0000-000000000000', id: 'REND2222-REND-REND-REND-RENDRENDREND', ph: 'headless-main' },
            ]),
          }],
        }],
      }],
    });

    const engine = buildEngine([
      homeWithOverride, pageTemplate, pageSection, titleField, contentField,
      mappedPartial, overridePartial, mappedDesign, overrideDesign, pageDesignsRoot,
      headerRendering, footerRendering,
    ]);
    const result = await resolveLayout('/', engine, { siteRootPath, mediaBaseUrl: '' });
    expect(result).not.toBeNull();
    expect(result!.placeholders['headless-chrome']).toHaveLength(1);
    // Override wins → Footer rendering, not Header
    expect(result!.placeholders['headless-chrome'][0].componentName).toBe('Footer');
  });

  it('falls back to own renderings when no Page Design applies', async () => {
    const engine = buildEngine([
      homePage, pageTemplate, pageSection, titleField, contentField, heroBannerRendering,
    ]);
    const result = await resolveLayout('/', engine, { siteRootPath, mediaBaseUrl: '' });
    expect(result!.placeholders['headless-main']).toHaveLength(1);
    expect(result!.placeholders['headless-main'][0].componentName).toBe('HeroBanner');
  });

  it('resolves a child page by path segments', async () => {
    const aboutPage = makeItem({
      id: 'about111-abou-abou-abou-aboutaboutab',
      path: '/sitecore/content/site/Home/About',
      parent: 'home1111-home-home-home-homehomehome',
      template: pageTemplateId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{ version: 1, fields: [{ id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Title', value: 'About Us' }] }],
      }],
    });
    const engine = buildEngine([
      homePage, aboutPage, pageTemplate, pageSection, titleField, contentField,
    ]);
    // Fixture omits renderings; this test exercises routePath → item + field
    // emission, not the scaffold-vs-null policy. Flip the dev flag so the
    // result materializes regardless of layout state.
    const result = await resolveLayout('/About', engine, { siteRootPath, mediaBaseUrl: '', allowScaffoldForEmptyLayout: true });
    expect(result!.name).toBe('About');
    expect(result!.fields['Title']).toEqual({ value: 'About Us' });
  });

  describe('0.1.15 template-default fields on route items and referenced items', () => {
    // Case Study template with StartDate that's never set by the author.
    const caseStudyTmplId = 'cs-tmpl-0000-0000-000000000000';
    const caseStudySectionId = 'cs-sect-0000-0000-000000000000';
    const startDateFieldId = 'cs-fld1-0000-0000-000000000000';
    const selectedPeopleFieldId = 'cs-fld2-0000-0000-000000000000';
    const caseStudyTmpl = makeItem({
      id: caseStudyTmplId,
      path: '/sitecore/templates/Project/site/Case Study Page',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const caseStudySection = makeItem({
      id: caseStudySectionId,
      parent: caseStudyTmplId,
      path: '/sitecore/templates/Project/site/Case Study Page/Content',
      template: TEMPLATE_SECTION_TEMPLATE_ID,
    });
    const startDateFieldDef = makeItem({
      id: startDateFieldId,
      parent: caseStudySectionId,
      path: '/sitecore/templates/Project/site/Case Study Page/Content/StartDate',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Date' }],
    });
    const selectedPeopleFieldDef = makeItem({
      id: selectedPeopleFieldId,
      parent: caseStudySectionId,
      path: '/sitecore/templates/Project/site/Case Study Page/Content/SelectedPeople',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Treelist' }],
    });
    const titleFieldCS = makeItem({
      id: 'cs-fld3-0000-0000-000000000000',
      parent: caseStudySectionId,
      path: '/sitecore/templates/Project/site/Case Study Page/Content/Title',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });

    // Person template
    const personTmplId = 'pr-tmpl-0000-0000-000000000000';
    const personSectionId = 'pr-sect-0000-0000-000000000000';
    const personTmpl = makeItem({
      id: personTmplId,
      path: '/sitecore/templates/Project/site/Person',
      template: TEMPLATE_TEMPLATE_ID,
    });
    const personSection = makeItem({
      id: personSectionId,
      parent: personTmplId,
      path: '/sitecore/templates/Project/site/Person/Bio',
      template: TEMPLATE_SECTION_TEMPLATE_ID,
    });
    const firstNameFieldDef = makeItem({
      id: 'pr-fld1-0000-0000-000000000000',
      parent: personSectionId,
      path: '/sitecore/templates/Project/site/Person/Bio/FirstName',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });
    const namePrefixFieldDef = makeItem({
      id: 'pr-fld2-0000-0000-000000000000',
      parent: personSectionId,
      path: '/sitecore/templates/Project/site/Person/Bio/NamePrefix',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });
    const middleInitialFieldDef = makeItem({
      id: 'pr-fld3-0000-0000-000000000000',
      parent: personSectionId,
      path: '/sitecore/templates/Project/site/Person/Bio/MiddleInitial',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });
    const nameSuffixFieldDef = makeItem({
      id: 'pr-fld4-0000-0000-000000000000',
      parent: personSectionId,
      path: '/sitecore/templates/Project/site/Person/Bio/NameSuffix',
      template: TEMPLATE_FIELD_TEMPLATE_ID,
      sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
    });

    // Person content item with only FirstName set
    const personItem = makeItem({
      id: 'person01-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Data/People/DrSmith',
      template: personTmplId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            { id: 'pr-fld1-0000-0000-000000000000', hint: 'FirstName', value: 'Smith' },
          ],
        }],
      }],
    });

    // Case Study page with Title set, StartDate unset, SelectedPeople pointing at the Person
    const caseStudyPage = makeItem({
      id: 'case0001-0000-0000-0000-000000000000',
      path: '/sitecore/content/site/Home/case-studies/case-study-01',
      template: caseStudyTmplId,
      languages: [{
        language: 'en',
        fields: [],
        versions: [{
          version: 1,
          fields: [
            {
              id: FINAL_RENDERINGS_FIELD_ID,
              hint: '__Final Renderings',
              type: 'layout',
              value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"></d></r>`,
            },
            { id: 'cs-fld3-0000-0000-000000000000', hint: 'Title', value: 'Case Study 01' },
            { id: selectedPeopleFieldId, hint: 'SelectedPeople', value: '{PERSON01-0000-0000-0000-000000000000}' },
          ],
        }],
      }],
    });

    const caseStudyFixtures = [
      caseStudyTmpl, caseStudySection, startDateFieldDef, selectedPeopleFieldDef, titleFieldCS,
      personTmpl, personSection, firstNameFieldDef, namePrefixFieldDef, middleInitialFieldDef, nameSuffixFieldDef,
      personItem,
      caseStudyPage,
    ];

    it('route.fields includes unset StartDate with DateTime.MinValue default', async () => {
      // 0.2.0: Date-typed fields default to DateTime.MinValue ISO
      // (`0001-01-01T00:00:00Z`) rather than empty string, matching
      // prod Edge. Previously this emitted `{ value: '' }`, which
      // crashed React date-parse consumers.
      const engine = buildEngine(caseStudyFixtures);
      const result = await resolveLayout(
        '/case-studies/case-study-01',
        engine,
        { siteRootPath, mediaBaseUrl: '', allowScaffoldForEmptyLayout: true },
      );
      expect(result).not.toBeNull();
      expect(result!.fields['Title']).toEqual({ value: 'Case Study 01' });
      expect(result!.fields['StartDate']).toEqual({ value: '0001-01-01T00:00:00Z' });
    });

    it('referenced Person items in SelectedPeople include NamePrefix, MiddleInitial, NameSuffix with defaults', async () => {
      const engine = buildEngine(caseStudyFixtures);
      const result = await resolveLayout(
        '/case-studies/case-study-01',
        engine,
        { siteRootPath, mediaBaseUrl: '', allowScaffoldForEmptyLayout: true },
      );
      expect(result).not.toBeNull();
      const people = result!.fields['SelectedPeople'] as unknown as Array<{ fields: Record<string, unknown> }>;
      expect(people).toHaveLength(1);
      const person = people[0].fields;
      expect(person['FirstName']).toEqual({ value: 'Smith' });
      expect(person['NamePrefix']).toEqual({ value: '' });
      expect(person['MiddleInitial']).toEqual({ value: '' });
      expect(person['NameSuffix']).toEqual({ value: '' });
    });

    it('Home page fields unchanged (regression)', async () => {
      const engine = buildEngine([
        homePage, pageTemplate, pageSection, titleField, contentField, heroBannerRendering,
      ]);
      const result = await resolveLayout('/', engine, { siteRootPath, mediaBaseUrl: '' });
      expect(result).not.toBeNull();
      expect(result!.fields['Title']).toEqual({ value: 'Welcome Home' });
      expect(result!.fields['Content']).toEqual({ value: '<p>Hello</p>' });
    });

    it('Empty Content Page includes template fields even when all are unset', async () => {
      const emptyPage = makeItem({
        id: 'empty001-0000-0000-0000-000000000000',
        path: '/sitecore/content/site/Home/empty-page',
        template: pageTemplateId,
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [
              {
                id: FINAL_RENDERINGS_FIELD_ID,
                hint: '__Final Renderings',
                type: 'layout',
                value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"></d></r>`,
              },
            ],
          }],
        }],
      });
      const engine = buildEngine([
        emptyPage, pageTemplate, pageSection, titleField, contentField, heroBannerRendering,
      ]);
      // Fixture has a __Final Renderings field but the device block is empty
      // - zero rendering entries. Default policy returns null; flip the flag
      // so the test can assert route-field emission on an empty layout.
      const result = await resolveLayout('/empty-page', engine, { siteRootPath, mediaBaseUrl: '', allowScaffoldForEmptyLayout: true });
      expect(result).not.toBeNull();
      expect(result!.fields['Title']).toEqual({ value: '' });
      expect(result!.fields['Content']).toEqual({ value: '' });
    });
  });

  describe('URL-safe routePath resolution', () => {
    // The Content SDK consumer translates a sitemap URL like
    // `/.../faq-item-01` into `layout(routePath: "/.../Faq-Item-01")`.
    // Real Sitecore's URL pipeline reverses dash-vs-space and case so the
    // request resolves to the underlying item `Faq Item 01`. The tree-
    // level URL-safe alias index makes this work without per-call retry
    // logic in `resolveRouteItem`.
    it('resolves a routePath whose terminal segment uses dashes for a spaced item name', async () => {
      const faqItem = makeItem({
        id: 'faq01-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        path: '/sitecore/content/site/Home/resources/faqs/general/Faq Item 01',
        parent: 'home1111-home-home-home-homehomehome',
        template: pageTemplateId,
        languages: [{
          language: 'en',
          fields: [],
          versions: [{
            version: 1,
            fields: [
              { id: 'eeee3333-eeee-eeee-eeee-eeeeeeeeeeee', hint: 'Title', value: 'FAQ #01' },
            ],
          }],
        }],
      });
      const engine = buildEngine([
        homePage, faqItem, pageTemplate, pageSection, titleField, contentField,
      ]);
      const result = await resolveLayout(
        '/resources/faqs/general/Faq-Item-01',
        engine,
        { siteRootPath, mediaBaseUrl: '', allowScaffoldForEmptyLayout: true },
      );
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Faq Item 01');
      expect(result!.fields['Title']).toEqual({ value: 'FAQ #01' });
    });
  });

  describe('resolveLayout - P3a three-state null-route', () => {
    // Shared layout item: JSS Layout with three empty slots.
    function layoutItemFixture() {
      return [
        makeItem({
          id: '96e5f4ba-a2cf-4a4c-a4e7-64da88226362', // JSS_LAYOUT_ID
          path: '/sitecore/layout/Layouts/jss-layout',
          sharedFields: [
            {
              id: PLACEHOLDERS_FIELD_ID,
              hint: 'Placeholders',
              value:
                '{BB000001-0000-0000-0000-000000000901}|{BB000001-0000-0000-0000-000000000902}|{BB000001-0000-0000-0000-000000000903}',
            },
          ],
        }),
        makeItem({
          id: 'bb000001-0000-0000-0000-000000000901',
          path: '/sitecore/layout/placeholder settings/h-header',
          sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'headless-header' }],
        }),
        makeItem({
          id: 'bb000001-0000-0000-0000-000000000902',
          path: '/sitecore/layout/placeholder settings/h-main',
          sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'headless-main' }],
        }),
        makeItem({
          id: 'bb000001-0000-0000-0000-000000000903',
          path: '/sitecore/layout/placeholder settings/h-footer',
          sharedFields: [{ id: PLACEHOLDER_KEY_FIELD_ID, hint: 'Placeholder Key', value: 'headless-footer' }],
        }),
      ];
    }

    it('emits empty-placeholders route for item with no own layout AND no Page Design match (0.4.0.18)', async () => {
      // 0.4.0.18: consolidated states (a) and (b). Items that resolve to no
      // design AND no own layout still emit a scaffolded empty-placeholders
      // route - matches Sitecore for container-template category items.
      // Tradeoff: the 0.3.7 data-folder null-exclusion no longer applies
      // here; residual true-data-folder items show up as
      // BRANCH_MISSING_LOCAL in the page-level diff (~2 items tolerated
      // in exchange for closing the BRANCH_MISSING_PROD cases).
      const engine = buildEngine([
        ...layoutItemFixture(),
        makeItem({
          id: 'e3000001-0000-0000-0000-000000000001',
          path: '/site/data-folder',
          template: 'ee000001-0000-0000-0000-0000000000aa', // no mapping
        }),
      ]);
      const result = await resolveLayout('/data-folder', engine, {
        siteRootPath: '/site',
        mediaBaseUrl: 'https://cdn',
      });
      expect(result).not.toBeNull();
      expect(result!.placeholders).toEqual({
        'headless-header': [],
        'headless-main': [],
        'headless-footer': [],
      });
    });

    it('emits empty-placeholders route for item with no own layout but a Page Design match', async () => {
      const pageTemplateId = 'ee000001-0000-0000-0000-0000000000bb';
      const pageDesignId = 'ed000001-0000-0000-0000-0000000000bb';
      const engine = buildEngine([
        ...layoutItemFixture(),
        // Page Designs root with TemplatesMapping binding pageTemplate to design.
        makeItem({
          id: 'e1000001-0000-0000-0000-0000000000bb',
          path: '/Presentation/Page Designs',
          sharedFields: [
            {
              id: TEMPLATES_MAPPING_FIELD_ID,
              hint: 'TemplatesMapping',
              value: `%7b${pageTemplateId}%7d%3d%257B${pageDesignId.toUpperCase()}%257D`,
            },
          ],
        }),
        makeItem({ id: pageDesignId, path: '/Presentation/Page Designs/Design' }),
        makeItem({ id: pageTemplateId, path: '/sitecore/templates/Page' }),
        makeItem({
          id: 'e3000001-0000-0000-0000-0000000000bb',
          path: '/site/Home/empty-but-mapped',
          template: pageTemplateId,
        }),
      ]);
      const result = await resolveLayout('/Home/empty-but-mapped', engine, {
        siteRootPath: '/site',
        mediaBaseUrl: 'https://cdn',
      });
      expect(result).not.toBeNull();
      expect(result!.placeholders).toEqual({
        'headless-header': [],
        'headless-main': [],
        'headless-footer': [],
      });
    });

    it('emits declared layout slots as [] when partial designs populate only a subset (0.4.0.15)', async () => {
      // Port of Sitecore's `PlaceholderRenderingService.RenderPlaceholders`
      // (`Sitecore.LayoutService.decompiled.cs:3434-3443`): every declared
      // placeholder path is rendered, empty or not. At the route level this
      // means a page whose partials populate only headless-main still emits
      // headless-header and headless-footer as `[]`.
      const pageTemplateId = 'ee000001-0000-0000-0000-0000000000cc';
      const pageDesignId = 'ed000001-0000-0000-0000-0000000000cc';
      const partialId = 'ef000001-0000-0000-0000-0000000000cc';
      const engine = buildEngine([
        ...layoutItemFixture(),
        // Page Designs root → design → partial targeting headless-main only.
        makeItem({
          id: 'e1000001-0000-0000-0000-0000000000cc',
          path: '/Presentation/Page Designs',
          sharedFields: [
            {
              id: TEMPLATES_MAPPING_FIELD_ID,
              hint: 'TemplatesMapping',
              value: `%7b${pageTemplateId}%7d%3d%257B${pageDesignId.toUpperCase()}%257D`,
            },
          ],
        }),
        makeItem({
          id: pageDesignId,
          path: '/Presentation/Page Designs/MainOnly',
          sharedFields: [
            { id: PARTIAL_DESIGNS_FIELD_ID, hint: 'PartialDesigns', value: `{${partialId.toUpperCase()}}` },
          ],
        }),
        makeItem({
          id: partialId,
          path: '/Presentation/Partial Designs/Main',
          languages: [{
            language: 'en',
            fields: [],
            versions: [{
              version: 1,
              fields: [{
                id: FINAL_RENDERINGS_FIELD_ID,
                hint: '__Final Renderings',
                value: `<r xmlns:s="s" xmlns:p="p"><d id="{${DEFAULT_DEVICE}}"><r uid="{AAAA1111-0000-0000-0000-000000000001}" s:id="{${'rend2222-rend-rend-rend-rendrendrend'.toUpperCase()}}" s:ph="headless-main" /></d></r>`,
              }],
            }],
          }],
        }),
        makeItem({ id: pageTemplateId, path: '/sitecore/templates/Page' }),
        makeItem({
          id: 'e3000001-0000-0000-0000-0000000000cc',
          path: '/site/Home/main-only-page',
          template: pageTemplateId,
        }),
        headerRendering,
      ]);
      const result = await resolveLayout('/Home/main-only-page', engine, {
        siteRootPath: '/site',
        mediaBaseUrl: 'https://cdn',
      });
      expect(result).not.toBeNull();
      // headless-main is populated; headless-header and headless-footer come
      // from the layout item's declared Placeholders as empty arrays.
      expect(result!.placeholders['headless-main']).toHaveLength(1);
      expect(result!.placeholders['headless-header']).toEqual([]);
      expect(result!.placeholders['headless-footer']).toEqual([]);
    });
  });

  describe('scaffolded empty-placeholders policy (0.4.0.18)', () => {
    // 0.4.0.18: every item under the site root resolves to a route - when
    // the merged rendering tree is empty, a scaffolded empty-placeholders
    // route is emitted using the layout item's declared top-level slots
    // (with JSS_LAYOUT_ID fallback to the three Headless keys). Matches
    // Sitecore's behaviour on container-template items that carry an
    // empty `{headless-header: [], headless-main: [], headless-footer: []}`
    // in their `route.placeholders`.
    const siteRootPath = '/sitecore/content/site/Home';

    it('emits scaffolded route when the route item has no renderings and no partial designs apply (0.4.0.18)', async () => {
      const homePage = makeItem({
        id: 'home9999-home-home-home-homehomehome',
        path: '/sitecore/content/site/Home',
        template: pageTemplateId,
      });
      // Leaf item under the site root with no __Final Renderings field.
      const leaf = makeItem({
        id: 'leaf0001-leaf-leaf-leaf-leafleafleaf',
        parent: 'home9999-home-home-home-homehomehome',
        path: '/sitecore/content/site/Home/data/DataFolder',
        template: pageTemplateId,
      });
      const engine = buildEngine([homePage, leaf, pageTemplate, pageSection, titleField, contentField]);
      const result = await resolveLayout('/data/DataFolder', engine, {
        siteRootPath,
        mediaBaseUrl: '',
      });
      expect(result).not.toBeNull();
      expect(result!.placeholders).toEqual({
        'headless-header': [],
        'headless-main': [],
        'headless-footer': [],
      });
      expect(result!.name).toBe('DataFolder');
    });

    it('allowScaffoldForEmptyLayout=true still emits the three-key skeleton (0.4.0.18)', async () => {
      const homePage = makeItem({
        id: 'home9998-home-home-home-homehomehome',
        path: '/sitecore/content/site/Home',
        template: pageTemplateId,
      });
      const leaf = makeItem({
        id: 'leaf0002-leaf-leaf-leaf-leafleafleaf',
        parent: 'home9998-home-home-home-homehomehome',
        path: '/sitecore/content/site/Home/data/DataFolder',
        template: pageTemplateId,
      });
      const engine = buildEngine([homePage, leaf, pageTemplate, pageSection, titleField, contentField]);
      const result = await resolveLayout('/data/DataFolder', engine, {
        siteRootPath,
        mediaBaseUrl: '',
        allowScaffoldForEmptyLayout: true,
      });
      expect(result).not.toBeNull();
      expect(result!.placeholders).toEqual({
        'headless-header': [],
        'headless-main': [],
        'headless-footer': [],
      });
      expect(result!.name).toBe('DataFolder');
    });

    it('still returns null for unknown routes (item not found) regardless of flag', async () => {
      const homePage = makeItem({
        id: 'home9997-home-home-home-homehomehome',
        path: '/sitecore/content/site/Home',
        template: pageTemplateId,
      });
      const engine = buildEngine([homePage, pageTemplate, pageSection, titleField, contentField]);
      const result = await resolveLayout('/nonexistent', engine, {
        siteRootPath,
        mediaBaseUrl: '',
        allowScaffoldForEmptyLayout: true,
      });
      expect(result).toBeNull();
    });
  });
});
