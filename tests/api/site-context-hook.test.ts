import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import Fastify, { type FastifyInstance } from 'fastify';
import { Engine } from '../../src/engine/index.js';
import { registerSiteContextHook } from '../../src/api/hooks/site-context.js';
import type { SiteDefinition } from '../../src/engine/sites/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/sites');

async function buildApp(envFallback: string): Promise<{ app: FastifyInstance; engine: Engine }> {
  const engine = new Engine({ rootDir: FIXTURES });
  await engine.startInit();
  await engine.readiness.ready();
  const app = Fastify({ logger: false });
  registerSiteContextHook(app, engine, envFallback);
  app.get('/probe', async (req) => ({ site: req.site }));
  await app.ready();
  return { app, engine };
}

describe('site-context Fastify hook', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp(''));  // no env fallback
  });
  afterAll(async () => {
    await app?.close();
  });

  it('decorates request.site from ?site= query param', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe?site=SiteA' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { site: SiteDefinition | null };
    expect(body.site?.name).toBe('SiteA');
  });

  it('decorates request.site from Host header when no site arg', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { host: 'site-b.test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { site: SiteDefinition | null };
    expect(body.site?.name).toBe('SiteB');
  });

  it('?site= query param wins over Host header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe?site=SiteA',
      headers: { host: 'site-b.test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { site: SiteDefinition | null };
    expect(body.site?.name).toBe('SiteA');
  });

  it('returns null when nothing matches and no env fallback', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { host: 'unknown.test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { site: SiteDefinition | null };
    expect(body.site).toBeNull();
  });

  it('uses first value when ?site= is duplicated', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe?site=SiteA&site=SiteB' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { site: SiteDefinition | null };
    expect(body.site?.name).toBe('SiteA');
  });
});

describe('site-context Fastify hook with env fallback', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    ({ app } = await buildApp('/sitecore/content/Tenant/Default/Home'));
  });
  afterAll(async () => {
    await app?.close();
  });

  it('synthesizes from env when nothing else matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { host: 'unknown.test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { site: SiteDefinition | null };
    expect(body.site?.name).toBe('Default');
    expect(body.site?.hostname).toBe('*');
  });

  it('real Site Grouping wins over env fallback', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { host: 'site-a.test' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { site: SiteDefinition | null };
    expect(body.site?.name).toBe('SiteA');
  });
});

