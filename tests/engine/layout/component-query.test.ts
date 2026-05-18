import { describe, it, expect, vi } from 'vitest';
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
  COMPONENT_QUERY_FIELD_ID,
  readComponentQuery,
  collectComponentQueryRequests,
  executeComponentQueryRequests,
  rewriteResultRowIds,
} from '../../../src/engine/layout/component-query.js';
import { buildPlaceholderTree } from '../../../src/engine/layout/placeholder-tree.js';
import { parseRenderingXml } from '../../../src/engine/layout/rendering-xml.js';
import { makeItem, buildEngine } from './_helpers.js';

const DEFAULT_DEVICE = 'fe5d7fdf-89c0-4d99-9aa3-b5fbd009c9f3';

const pageTemplateId = 'ccae0000-page-page-page-pagepagepage';
const pageTemplate = makeItem({
  id: pageTemplateId,
  path: '/sitecore/templates/Project/site/Page',
  template: TEMPLATE_TEMPLATE_ID,
});
const pageSection = makeItem({
  id: 'ccae0001-sect-sect-sect-sectsectsect',
  parent: pageTemplateId,
  path: '/sitecore/templates/Project/site/Page/Content',
  template: TEMPLATE_SECTION_TEMPLATE_ID,
});
const titleField = makeItem({
  id: 'ccae0002-fiel-fiel-fiel-fielfielfiel',
  parent: 'ccae0001-sect-sect-sect-sectsectsect',
  path: '/sitecore/templates/Project/site/Page/Content/Title',
  template: TEMPLATE_FIELD_TEMPLATE_ID,
  sharedFields: [{ id: FIELD_IDS.type, hint: 'Type', value: 'Single-Line Text' }],
});

const titleComponentQuery = `
  query TitleDatasource($datasource: String!, $contextItem: String!, $language: String!) {
    datasource: item(path: $datasource, language: $language) {
      titleText: field(name: "Title") { jsonValue }
    }
  }
`;

const titleRenderingWithQuery = makeItem({
  id: 'ccae1000-rend-rend-rend-rendrendrend',
  path: '/sitecore/layout/Renderings/Project/site/Title',
  template: RENDERING_TEMPLATE_ID,
  sharedFields: [
    { id: COMPONENT_QUERY_FIELD_ID, hint: 'ComponentQuery', value: titleComponentQuery },
  ],
});

const titleRenderingWithoutQuery = makeItem({
  id: 'ccae2000-rend-rend-rend-rendrendrend',
  path: '/sitecore/layout/Renderings/Project/site/PlainTitle',
  template: RENDERING_TEMPLATE_ID,
});

const datasourceItem = makeItem({
  id: 'ccae3000-daaa-daaa-daaa-daaadaaadaaa',
  path: '/sitecore/content/site/Home/Data/Titles/Hero',
  template: pageTemplateId,
  languages: [
    {
      language: 'en',
      fields: [],
      versions: [{
        version: 1,
        fields: [
          { id: 'ccae0002-fiel-fiel-fiel-fielfielfiel', hint: 'Title', value: 'Hero Title' },
        ],
      }],
    },
  ],
});

function homePage(renderingId: string): ReturnType<typeof makeItem> {
  return makeItem({
    id: 'ccae9000-home-home-home-homehomehome',
    path: '/sitecore/content/site/Home',
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
          value: `<r xmlns:s="s" xmlns:p="p" p:p="1"><d id="{${DEFAULT_DEVICE}}"><r uid="{AA000000-0000-0000-0000-000000000001}" s:id="{${renderingId.toUpperCase()}}" s:ph="headless-main" s:ds="{CCAE3000-DAAA-DAAA-DAAA-DAAADAAADAAA}" s:par="" /></d></r>`,
        }],
      }],
    }],
  });
}

describe('rewriteResultRowIds', () => {
  it('rewrites id fields inside .results arrays to bare-upper-hex', () => {
    const input = {
      datasource: {
        links: {
          results: [
            { id: '88da64de-28b6-4620-b108-5d8c61564f6f', name: 'One' },
            { id: '1784e092-fc48-4d86-8cad-6da223618e82', name: 'Two' },
          ],
        },
      },
    };
    const out = rewriteResultRowIds(input) as typeof input;
    expect(out.datasource.links.results[0].id).toBe('88DA64DE28B64620B1085D8C61564F6F');
    expect(out.datasource.links.results[1].id).toBe('1784E092FC484D868CAD6DA223618E82');
  });

  it('leaves ids OUTSIDE .results arrays untouched', () => {
    const input = {
      datasource: {
        id: 'cafebabe-0000-0000-0000-000000000001',
        template: { id: 'deadbeef-0000-0000-0000-000000000002' },
      },
    };
    const out = rewriteResultRowIds(input) as typeof input;
    expect(out.datasource.id).toBe('cafebabe-0000-0000-0000-000000000001');
    expect(out.datasource.template.id).toBe('deadbeef-0000-0000-0000-000000000002');
  });

  it('handles non-guid-shaped id values by leaving them alone', () => {
    const input = { results: [{ id: 'not-a-guid', name: 'X' }] };
    const out = rewriteResultRowIds(input) as typeof input;
    expect(out.results[0].id).toBe('not-a-guid');
  });

  it('handles null, primitives, and arrays without throwing', () => {
    expect(rewriteResultRowIds(null)).toBeNull();
    expect(rewriteResultRowIds('x')).toBe('x');
    expect(rewriteResultRowIds(42)).toBe(42);
    expect(rewriteResultRowIds([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('readComponentQuery', () => {
  it('returns the ComponentQuery value when the rendering item carries one', () => {
    const engine = buildEngine([titleRenderingWithQuery]);
    expect(readComponentQuery(titleRenderingWithQuery.id, engine)).toContain('query TitleDatasource');
  });

  it('returns undefined when the rendering item has no ComponentQuery field', () => {
    const engine = buildEngine([titleRenderingWithoutQuery]);
    expect(readComponentQuery(titleRenderingWithoutQuery.id, engine)).toBeUndefined();
  });

  it('returns undefined when the rendering id is unknown', () => {
    const engine = buildEngine([]);
    expect(readComponentQuery('00000000-0000-0000-0000-000000000000', engine)).toBeUndefined();
  });
});

describe('collectComponentQueryRequests', () => {
  it('collects one request per rendering with a non-empty ComponentQuery', () => {
    const page = homePage(titleRenderingWithQuery.id);
    const engine = buildEngine([
      page, titleRenderingWithQuery, datasourceItem, pageTemplate, pageSection, titleField,
    ]);
    const xml = page.languages[0].versions[0].fields[0].value;
    const entries = parseRenderingXml(xml);
    const tree = buildPlaceholderTree(entries);
    const requests = collectComponentQueryRequests(
      tree, engine, page.id, page.path, 'en',
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].uid).toBe('aa000000-0000-0000-0000-000000000001');
    expect(requests[0].query).toContain('query TitleDatasource');
    expect(requests[0].variables.contextItem).toBe(page.id);
    expect(requests[0].variables.datasource).toBe(datasourceItem.id);
    expect(requests[0].variables.language).toBe('en');
  });

  it('returns no requests when no renderings carry ComponentQuery', () => {
    const page = homePage(titleRenderingWithoutQuery.id);
    const engine = buildEngine([
      page, titleRenderingWithoutQuery, datasourceItem, pageTemplate, pageSection, titleField,
    ]);
    const xml = page.languages[0].versions[0].fields[0].value;
    const entries = parseRenderingXml(xml);
    const tree = buildPlaceholderTree(entries);
    const requests = collectComponentQueryRequests(
      tree, engine, page.id, page.path, 'en',
    );
    expect(requests).toEqual([]);
  });
});

describe('resolveLayout ComponentQuery dispatch (item 8)', () => {
  it('emits fields.data from the executor result when the rendering has ComponentQuery', async () => {
    const page = homePage(titleRenderingWithQuery.id);
    const engine = buildEngine([
      page, titleRenderingWithQuery, datasourceItem, pageTemplate, pageSection, titleField,
    ]);
    const fakeData = {
      datasource: {
        titleText: { jsonValue: { value: 'Hero Title' } },
      },
    };
    const executor = vi.fn().mockResolvedValue(fakeData);

    const result = await resolveLayout('/', engine, {
      siteRootPath: '/sitecore/content/site/Home',
      mediaBaseUrl: '',
      graphqlExecutor: executor,
    });

    expect(result).not.toBeNull();
    const node = result!.placeholders['headless-main'][0];
    expect(node.fields).toEqual({ data: fakeData });

    // Executor received the right variables.
    expect(executor).toHaveBeenCalledTimes(1);
    const [query, variables] = executor.mock.calls[0];
    expect(query).toContain('query TitleDatasource');
    expect(variables).toEqual({
      contextItem: page.id,
      datasource: datasourceItem.id,
      language: 'en',
    });
  });

  it('falls back to schema-driven field emission when no executor is wired', async () => {
    const page = homePage(titleRenderingWithQuery.id);
    const engine = buildEngine([
      page, titleRenderingWithQuery, datasourceItem, pageTemplate, pageSection, titleField,
    ]);

    const result = await resolveLayout('/', engine, {
      siteRootPath: '/sitecore/content/site/Home',
      mediaBaseUrl: '',
      // No graphqlExecutor - ComponentQuery ignored; default field emission runs.
    });

    expect(result).not.toBeNull();
    const node = result!.placeholders['headless-main'][0];
    expect(node.fields).toHaveProperty('Title');
    expect(node.fields).not.toHaveProperty('data');
  });

  it('surfaces GraphQL validation errors (r.reason.errors) in the executor warn log', async () => {
    // Mercurius rejects with a FastifyError whose `.errors` array carries the
    // specific validation messages (e.g. "Cannot query field 'path' on type
    // 'ItemUrl'"). The prior log format only stringified `r.reason` which
    // elided that detail - the next schema gap was invisible without a
    // rebuild-redeploy cycle. This test pins the improved message shape.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fastifyLikeError = Object.assign(
        new Error('Graphql validation error'),
        { errors: [{ message: "Cannot query field 'path' on type 'ItemUrl'." }] },
      );
      const requests = [{
        uid: 'uid-aaa',
        renderingId: 'rend-bbb',
        query: 'query { x }',
        variables: { contextItem: 'ctx', datasource: 'ds', language: 'en' },
      }];
      const executor = vi.fn().mockRejectedValue(fastifyLikeError);

      await executeComponentQueryRequests(requests, executor);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const logged = String(warnSpy.mock.calls[0][0]);
      expect(logged).toContain('rend-bbb');
      expect(logged).toContain('uid-aaa');
      expect(logged).toContain("Cannot query field 'path' on type 'ItemUrl'.");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('reformats links.results[*].id to bare-upper-hex post-execution (Spotlight carve-out)', async () => {
    // Prod Edge emits `id` in bare 32-hex uppercase only for ComponentQuery-
    // executed IGQL result rows (Spotlight-style `children(...) { results }`
    // projections). Mercurius's AnyItem.id resolver returns canonical
    // lowercase-dashed for everything else in 0.3.4 - so when a
    // ComponentQuery selects `id` under a `results[*]` it must be rewritten
    // back to the Edge shape. Restoring the 0.3.4 carve-out that was
    // reverted along with the AnyItem paths (209 deep-path regression).
    const canonical = '88da64de-28b6-4620-b108-5d8c61564f6f';
    const executor = vi.fn().mockResolvedValue({
      datasource: {
        // datasource-level id stays canonical - NOT inside a results array.
        id: 'cafebabe-0000-0000-0000-000000000001',
        links: {
          results: [
            { id: canonical, link: { jsonValue: { value: {} } } },
            { id: '1784e092-fc48-4d86-8cad-6da223618e82', link: { jsonValue: { value: {} } } },
          ],
        },
      },
    });
    const requests = [{
      uid: 'uid-spotlight',
      renderingId: 'rend-spotlight',
      query: 'query { x }',
      variables: { contextItem: 'ctx', datasource: 'ds', language: 'en' },
    }];

    const out = await executeComponentQueryRequests(requests, executor);
    const data = out.get('uid-spotlight') as {
      datasource: {
        id: string;
        links: { results: Array<{ id: string }> };
      };
    };
    expect(data.datasource.id).toBe('cafebabe-0000-0000-0000-000000000001'); // unchanged
    expect(data.datasource.links.results[0].id).toBe('88DA64DE28B64620B1085D8C61564F6F');
    expect(data.datasource.links.results[1].id).toBe('1784E092FC484D868CAD6DA223618E82');
  });

  it('suppresses fields.data but keeps the rendering when the executor throws', async () => {
    // Prior behaviour should resume: the per-rendering ComponentQuery call
    // fails, but the rendering itself stays in the layout and its fields
    // come from the default resolver chain - a single bad query must not
    // null the whole route.
    const page = homePage(titleRenderingWithQuery.id);
    const engine = buildEngine([
      page, titleRenderingWithQuery, datasourceItem, pageTemplate, pageSection, titleField,
    ]);
    const executor = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await resolveLayout('/', engine, {
      siteRootPath: '/sitecore/content/site/Home',
      mediaBaseUrl: '',
      graphqlExecutor: executor,
    });

    expect(result).not.toBeNull();
    const node = result!.placeholders['headless-main'][0];
    expect(node.fields).not.toHaveProperty('data');
    expect(node.fields).toHaveProperty('Title');
  });
});
