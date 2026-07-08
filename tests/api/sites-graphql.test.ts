import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { registerGraphQLRoutes } from '../../src/api/routes/graphql.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/sites');

const SDK_CLI_QUERY = `query { site { siteInfoCollection { name hostName: hostname language } } }`;

describe('site.siteInfoCollection GraphQL resolver', () => {
  let app: FastifyInstance;
  let engine: Engine;

  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
    app = Fastify({ logger: false });
    const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
    registerSiteContextHook(app, engine, '/sitecore/content/Tenant/SiteA');
    await registerGraphQLRoutes(app, engine, {
      mediaBaseUrl: '',
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers the SDK CLI query verbatim', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: { query: SDK_CLI_QUERY },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.site.siteInfoCollection).toHaveLength(2);
    expect(body.data.site.siteInfoCollection).toContainEqual(
      { name: 'SiteA', hostName: 'site-a.test', language: 'en' },
    );
    expect(body.data.site.siteInfoCollection).toContainEqual(
      { name: 'SiteB', hostName: 'site-b.test|*.preview.test', language: 'en' },
    );
  });

  it('also serves the extended scalar fields rootPath + startItem', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query { site { siteInfoCollection { name hostname language rootPath startItem } } }`,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.site.siteInfoCollection).toHaveLength(2);
    expect(body.data.site.siteInfoCollection).toContainEqual({
      name: 'SiteA',
      hostname: 'site-a.test',
      language: 'en',
      rootPath: '/sitecore/content/Tenant/SiteA',
      startItem: 'Home',
    });
    expect(body.data.site.siteInfoCollection).toContainEqual({
      name: 'SiteB',
      hostname: 'site-b.test|*.preview.test',
      language: 'en',
      rootPath: '/sitecore/content/Tenant/SiteB',
      startItem: 'Home',
    });
  });

  it('serves the same data on the /sitecore/api/graph/edge alias', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sitecore/api/graph/edge',
      payload: { query: SDK_CLI_QUERY },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.site.siteInfoCollection).toHaveLength(2);
  });

  it('layout(site: "SiteA") resolves with SiteA rootPath', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query { layout(site: "SiteA", routePath: "/", language: "en") { item { rendered } } }`,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
  });

  it('layout(site: "Unknown") with Host header falls through', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query { layout(site: "Unknown", routePath: "/", language: "en") { item { rendered } } }`,
      },
      headers: { 'content-type': 'application/json', host: 'site-b.test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
  });

  it('siteInfo(site: "SiteA").redirects resolves the Settings/Redirects/MapA fixture', async () => {
    // Regression anchor for the 0.7.4.0 bug where YAML-derived
    // SiteDefinition.rootPath was the SXA site root instead of the start-item
    // path. Under the bug, resolveRedirects's siteParent slice overshot by one
    // segment (=> /sitecore/content/Tenant), the expectedSiteName mismatch
    // gate fired (=> "Tenant" !== "SiteA"), and redirects always returned [].
    // After the routeBaseForSite fix, the start-item path threads through and
    // the Map under Settings/Redirects is found.
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query { site { siteInfo(site: "SiteA") { redirects { pattern target redirectType } } } }`,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const redirects = body.data.site.siteInfo.redirects;
    expect(redirects).toHaveLength(1);
    expect(redirects[0]).toMatchObject({
      pattern: '/old',
      target: '/new',
      redirectType: 'REDIRECT_301',
    });
  });

  it('alias path /sitecore/api/graph/edge threads ctx.engine + ctx.site through resolvers', async () => {
    // Regression anchor for the 0.7.5.0 alias-bypass bug. The alias handler
    // was passing `{}` as the resolver context, so post-0.7.3.0 resolvers
    // (which read ctx.engine + ctx.site) bailed with "no site context" on
    // every alias-routed request. The Mercurius config's context builder ran
    // for `/api/graphql` but not for the alias delegate. Same query that the
    // /api/graphql test above proves works should also work via the alias.
    const res = await app.inject({
      method: 'POST',
      url: '/sitecore/api/graph/edge',
      payload: {
        query: `query { site { siteInfo(site: "SiteA") { redirects { pattern target } } } }`,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const redirects = body.data.site.siteInfo.redirects;
    expect(redirects).toHaveLength(1);
    expect(redirects[0]).toMatchObject({ pattern: '/old', target: '/new' });
  });

  it('SiteInfo exposes full scalar surface (name, rootPath, hostname, language) via siteInfo(site)', async () => {
    // TDD anchor: SiteInfo gains name/rootPath/hostname/language scalars
    // matching the Edge SiteData shape. These fields were absent before Task F1
    // (they lived only on the now-retired SiteInfoSummary). The parent in both
    // the siteInfo(site) and siteInfoCollection paths is a SiteDefinition, so
    // the same resolvers serve both.
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query { site { siteInfo(site: "SiteA") { name rootPath hostname language } } }`,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.site.siteInfo).toMatchObject({
      name: 'SiteA',
      rootPath: '/sitecore/content/Tenant/SiteA',
      hostname: 'site-a.test',
      language: 'en',
    });
  });

  it('allSiteInfo paginates site definitions and returns total', async () => {
    // TDD anchor: SiteData.allSiteInfo(pageSize, pageNumber) returns a
    // SiteInfoResult with paginated results and a total count. Fixture has two
    // sites so total=2; page 1 of size 10 returns both.
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query { site { allSiteInfo(pageSize: 10, pageNumber: 1) { total results { name } } } }`,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const allSiteInfo = body.data.site.allSiteInfo;
    expect(allSiteInfo.total).toBe(2);
    expect(allSiteInfo.results).toHaveLength(2);
    const names = allSiteInfo.results.map((r: { name: string }) => r.name);
    expect(names).toContain('SiteA');
    expect(names).toContain('SiteB');
  });

  it('F2: SiteInfo full surface - RedirectInfo/RoutesResult/ErrorHandlingInfo/DictionaryResult/attributes', async () => {
    // TDD anchor for Task F2 - all new/renamed types and fields on SiteInfo.
    // This test verifies the exact Edge-parity shapes. Before F2 implementation,
    // the query fails because `routes` and `attributes` do not exist on SiteInfo,
    // and `dictionary` lacks the `total` field.
    const res = await app.inject({
      method: 'POST',
      url: '/api/graphql',
      payload: {
        query: `query {
          site {
            siteInfo(site: "SiteA") {
              redirects { pattern target redirectType isQueryStringPreserved isLanguagePreserved locale }
              routes(language: "en") {
                total
                results { routePath route { id } }
                pageInfo { hasNext endCursor }
              }
              errorHandling(language: "en") {
                notFoundPagePath
                notFoundPage { id }
                serverErrorPagePath
                serverErrorPage { id }
              }
              dictionary(language: "en") {
                total
                results { key value }
                pageInfo { hasNext endCursor }
              }
              attributes { key value }
            }
          }
        }`,
      },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toBeUndefined();
    const info = body.data.site.siteInfo;

    // redirects: MapA fixture provides one REDIRECT_301 entry (RedirectType enum).
    expect(info.redirects).toHaveLength(1);
    expect(info.redirects[0]).toMatchObject({
      pattern: '/old',
      target: '/new',
      redirectType: 'REDIRECT_301',
      isQueryStringPreserved: false,
      isLanguagePreserved: false,
      locale: '',
    });

    // routes: fixture Home has no __Renderings, so zero presentation-bearing items.
    expect(typeof info.routes.total).toBe('number');
    expect(Array.isArray(info.routes.results)).toBe(true);
    expect(info.routes.pageInfo.hasNext).toBe(false);

    // errorHandling: empty defaults (site definition has no 404/500 config).
    expect(info.errorHandling).not.toBeNull();
    expect([null, '']).toContain(info.errorHandling.notFoundPagePath);
    expect(info.errorHandling.notFoundPage).toBeNull();
    expect([null, '']).toContain(info.errorHandling.serverErrorPagePath);
    expect(info.errorHandling.serverErrorPage).toBeNull();

    // dictionary: valid-empty DictionaryResult (no dictionary folder in fixture).
    expect(info.dictionary.total).toBe(0);
    expect(info.dictionary.results).toEqual([]);
    expect(info.dictionary.pageInfo.hasNext).toBe(false);

    // attributes: site definition properties as key/value pairs.
    expect(Array.isArray(info.attributes)).toBe(true);
    expect(info.attributes.length).toBeGreaterThan(0);
    expect(info.attributes).toContainEqual({ key: 'name', value: 'SiteA' });
    expect(info.attributes).toContainEqual({ key: 'hostname', value: 'site-a.test' });
    expect(info.attributes).toContainEqual({ key: 'language', value: 'en' });
  });
});
