import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSxaRoutes } from '../../src/api/routes/sxa.js';
import { buildEngine, makeItem } from '../engine/layout/_helpers.js';

// ---------------------------------------------------------------------------
// Field + template IDs (mirrored from the engine unit tests)
// ---------------------------------------------------------------------------
const HEADLESS_VARIANTS_FOLDER_TEMPLATE = '49c111d0-6867-4798-a724-1f103166e6e9';
const VARIANT_DEFINITION_TEMPLATE = '4d50cdae-c2d9-4de8-b080-8f992bfb1b55';
const COMPATIBLE_RENDERINGS_FIELD_ID = '087c0553-9162-41f5-98d3-87eb0d80edbb';

const STYLE_TEMPLATE_ID = '6b8aabef-d650-46e0-97d0-c0b04f7f016b';
const STYLE_FOLDER_TEMPLATE_ID = 'c6dc7393-15bb-4cd7-b798-ab63e77ebac4';
const VALUE_FIELD_ID = '09147fb2-ebfb-4949-8c8e-26a424409d5e';

const GRID_ROOT_PATH =
  '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 5/Bootstrap 5 Grid Definition';

// Site paths used as the envFallback when registering the site-context hook.
const SITE_ROOT = '/sitecore/content/tenant/site';
const COMMON_ROOT = '/sitecore/content/tenant/common';

// Rendering ID that the variants + styles fixtures wire up.
const RENDERING_ID = '{F473E58A-64BB-4EA9-89BE-2155F3D916E9}';

// ---------------------------------------------------------------------------
// Fixture builders (self-contained, matching the engine-unit-test approach)
// ---------------------------------------------------------------------------

function buildVariantsEngine() {
  return buildEngine([
    makeItem({ id: 'tenant', path: '/sitecore/content/tenant' }),
    makeItem({ id: 'site', parent: 'tenant', path: SITE_ROOT }),
    makeItem({ id: 'pres', parent: 'site', path: `${SITE_ROOT}/Presentation` }),
    makeItem({ id: 'hv-root', parent: 'pres', path: `${SITE_ROOT}/Presentation/Headless Variants` }),
    makeItem({
      id: 'compat-folder',
      parent: 'hv-root',
      template: HEADLESS_VARIANTS_FOLDER_TEMPLATE,
      path: `${SITE_ROOT}/Presentation/Headless Variants/Case Study Header`,
      sharedFields: [{ id: COMPATIBLE_RENDERINGS_FIELD_ID, hint: 'Compatible Renderings', value: RENDERING_ID }],
    }),
    makeItem({
      id: 'variant-a',
      parent: 'compat-folder',
      template: VARIANT_DEFINITION_TEMPLATE,
      path: `${SITE_ROOT}/Presentation/Headless Variants/Case Study Header/CaseStudyHeader`,
    }),
  ]);
}

function buildStylesEngine() {
  return buildEngine([
    makeItem({ id: 'tenant', path: '/sitecore/content/tenant' }),
    makeItem({ id: 'common', parent: 'tenant', path: COMMON_ROOT }),
    makeItem({ id: 'common-pres', parent: 'common', path: `${COMMON_ROOT}/Presentation` }),
    makeItem({ id: 'common-styles', parent: 'common-pres', path: `${COMMON_ROOT}/Presentation/Styles` }),
    makeItem({
      id: 'common-bg-cat',
      parent: 'common-styles',
      template: STYLE_FOLDER_TEMPLATE_ID,
      path: `${COMMON_ROOT}/Presentation/Styles/Background colors`,
    }),
    makeItem({
      id: 'common-black',
      parent: 'common-bg-cat',
      template: STYLE_TEMPLATE_ID,
      path: `${COMMON_ROOT}/Presentation/Styles/Background colors/Black`,
      sharedFields: [{ id: VALUE_FIELD_ID, hint: 'Value', value: 'background-black' }],
    }),
    makeItem({ id: 'site', parent: 'tenant', path: SITE_ROOT }),
    makeItem({ id: 'site-pres', parent: 'site', path: `${SITE_ROOT}/Presentation` }),
    makeItem({ id: 'site-styles', parent: 'site-pres', path: `${SITE_ROOT}/Presentation/Styles` }),
    makeItem({
      id: 'site-cat',
      parent: 'site-styles',
      template: STYLE_FOLDER_TEMPLATE_ID,
      path: `${SITE_ROOT}/Presentation/Styles/Container`,
    }),
    makeItem({
      id: 'site-boxed',
      parent: 'site-cat',
      template: STYLE_TEMPLATE_ID,
      path: `${SITE_ROOT}/Presentation/Styles/Container/Boxed`,
      sharedFields: [{ id: VALUE_FIELD_ID, hint: 'Value', value: 'boxed' }],
    }),
  ]);
}

function buildGridEngine() {
  return buildEngine([
    makeItem({ id: 'sitecore-root', path: '/sitecore' }),
    makeItem({ id: 'sys', parent: 'sitecore-root', path: '/sitecore/system' }),
    makeItem({ id: 'settings', parent: 'sys', path: '/sitecore/system/Settings' }),
    makeItem({ id: 'feature', parent: 'settings', path: '/sitecore/system/Settings/Feature' }),
    makeItem({ id: 'sxa', parent: 'feature', path: '/sitecore/system/Settings/Feature/Experience Accelerator' }),
    makeItem({ id: 'b5', parent: 'sxa', path: '/sitecore/system/Settings/Feature/Experience Accelerator/Bootstrap 5' }),
    makeItem({ id: 'gridroot', parent: 'b5', path: GRID_ROOT_PATH }),
    makeItem({ id: 'bp-xs', parent: 'gridroot', path: `${GRID_ROOT_PATH}/Extra small` }),
    makeItem({ id: 'xs-size', parent: 'bp-xs', path: `${GRID_ROOT_PATH}/Extra small/Size` }),
    makeItem({ id: 'xs-size-12', parent: 'xs-size', path: `${GRID_ROOT_PATH}/Extra small/Size/12` }),
    makeItem({ id: 'bp-lg', parent: 'gridroot', path: `${GRID_ROOT_PATH}/Large` }),
    makeItem({ id: 'lg-size', parent: 'bp-lg', path: `${GRID_ROOT_PATH}/Large/Size` }),
    makeItem({ id: 'lg-size-6', parent: 'lg-size', path: `${GRID_ROOT_PATH}/Large/Size/6` }),
  ]);
}

// ---------------------------------------------------------------------------
// Helpers to spin up a Fastify app for a given engine + siteRootPath.
// ---------------------------------------------------------------------------

async function buildApp(engine: ReturnType<typeof buildEngine>, siteRootPath: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { registerSiteContextHook } = await import('../../src/api/hooks/site-context.js');
  registerSiteContextHook(app, engine, siteRootPath);
  registerSxaRoutes(app, engine);
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// /api/sxa/variants
// ---------------------------------------------------------------------------

describe('GET /api/sxa/variants', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(buildVariantsEngine(), SITE_ROOT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 when renderingId is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sxa/variants' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'renderingId is required' });
  });

  it('returns 200 with variants array for a known rendering', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sxa/variants?renderingId=${encodeURIComponent(RENDERING_ID)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.variants).toBeInstanceOf(Array);
    expect(body.variants.length).toBeGreaterThan(0);
    expect(body.variants[0]).toMatchObject({
      id: expect.stringMatching(/^\{[A-Z0-9-]+\}$/),
      name: expect.any(String),
      folderName: expect.any(String),
      isShared: expect.any(Boolean),
    });
  });
});

// ---------------------------------------------------------------------------
// /api/sxa/style-options
// ---------------------------------------------------------------------------

describe('GET /api/sxa/style-options', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(buildStylesEngine(), SITE_ROOT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 when renderingId is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sxa/style-options' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'renderingId is required' });
  });

  it('returns 200 with categories array for a known rendering', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sxa/style-options?renderingId=${encodeURIComponent(RENDERING_ID)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.categories).toBeInstanceOf(Array);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.categories[0]).toMatchObject({
      name: expect.any(String),
      isShared: expect.any(Boolean),
      styles: expect.any(Array),
    });
  });
});

// ---------------------------------------------------------------------------
// /api/sxa/grid-options
// ---------------------------------------------------------------------------

describe('GET /api/sxa/grid-options', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(buildGridEngine(), SITE_ROOT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with breakpoints, dimensions, and cells', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sxa/grid-options' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.breakpoints).toBeInstanceOf(Array);
    expect(body.dimensions).toBeInstanceOf(Array);
    expect(body.cells).toBeInstanceOf(Array);
    expect(body.breakpoints.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 400 group: empty envFallback -> no site context resolved -> 400
// ---------------------------------------------------------------------------

describe('SXA routes - 400 when no site context', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Any engine works; the route bails out before touching it.
    // Empty envFallback means synthesizeFromEnv does not fire, so request.site is null.
    app = await buildApp(buildGridEngine(), '');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/sxa/variants returns 400 with diagnostic', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sxa/variants?renderingId=${encodeURIComponent(RENDERING_ID)}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no site context (set ?site=<name> or send Host header matching a Site Grouping)' });
  });

  it('GET /api/sxa/style-options returns 400 with diagnostic', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sxa/style-options?renderingId=${encodeURIComponent(RENDERING_ID)}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no site context (set ?site=<name> or send Host header matching a Site Grouping)' });
  });

  it('GET /api/sxa/grid-options returns 400 with diagnostic', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sxa/grid-options' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no site context (set ?site=<name> or send Host header matching a Site Grouping)' });
  });
});
