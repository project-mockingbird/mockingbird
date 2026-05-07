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
});
