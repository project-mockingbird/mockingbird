import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../../src/engine/index.js';
import {
  resolveSiteForRequest,
  synthesizeFromEnv,
} from '../../../src/engine/sites/request-resolver.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../../fixtures/sites');

describe('synthesizeFromEnv', () => {
  it('derives name from penultimate path segment', () => {
    expect(synthesizeFromEnv('/sitecore/content/Tenant/SiteA/Home')).toEqual({
      name: 'SiteA',
      hostname: '*',
      language: '',
      rootPath: '/sitecore/content/Tenant/SiteA/Home',
      startItem: '',
      linkable: false,
    });
  });

  it('returns rootPath verbatim (preserves single-site path semantics)', () => {
    const result = synthesizeFromEnv('/sitecore/content/Foo');
    expect(result.rootPath).toBe('/sitecore/content/Foo');
    expect(result.hostname).toBe('*');
  });

  it('handles short paths without crashing', () => {
    const result = synthesizeFromEnv('/x');
    expect(result.rootPath).toBe('/x');
    expect(result.name).toBe('');
  });

  it('handles empty path', () => {
    const result = synthesizeFromEnv('');
    expect(result.rootPath).toBe('');
    expect(result.name).toBe('');
  });

  it('handles a trailing slash without crashing', () => {
    // Trailing slash produces an empty trailing segment that filter() drops,
    // so the penultimate-segment derivation still picks the right site name.
    const result = synthesizeFromEnv('/sitecore/content/tenant/site/Home/');
    expect(result.name).toBe('site');
    expect(result.rootPath).toBe('/sitecore/content/tenant/site/Home/');
  });
});

describe('resolveSiteForRequest', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
  });

  it('uses siteArg when matched (highest precedence)', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: 'SiteA',
      host: 'site-b.test',  // Host would match SiteB but siteArg wins
      envFallback: '/anything',
    });
    expect(site?.name).toBe('SiteA');
  });

  it('falls through to host when siteArg is unknown', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: 'Unknown',
      host: 'site-b.test',
      envFallback: '/anything',
    });
    expect(site?.name).toBe('SiteB');
  });

  it('uses host when no siteArg', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: undefined,
      host: 'site-a.test',
      envFallback: '/anything',
    });
    expect(site?.name).toBe('SiteA');
  });

  it('falls through to env fallback when host is unmatched', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: undefined,
      host: 'unknown.test',
      envFallback: '/sitecore/content/Tenant/Default/Home',
    });
    expect(site?.name).toBe('Default');
    expect(site?.hostname).toBe('*');
  });

  it('returns null when nothing resolves and no envFallback', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: undefined,
      host: 'unknown.test',
      envFallback: '',
    });
    expect(site).toBeNull();
  });

  it('returns null when only siteArg is set and unknown', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: 'Unknown',
      host: undefined,
      envFallback: '',
    });
    expect(site).toBeNull();
  });

  it('uses envFallback when host is absent entirely', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: undefined,
      host: undefined,
      envFallback: '/sitecore/content/Tenant/Default/Home',
    });
    expect(site?.name).toBe('Default');
    expect(site?.hostname).toBe('*');
  });

  it('falls through all three rungs to envFallback when siteArg and host are both unmatched', () => {
    const site = resolveSiteForRequest({
      engine,
      siteArg: 'Unknown',
      host: 'unknown.test',
      envFallback: '/sitecore/content/Tenant/Default/Home',
    });
    expect(site?.name).toBe('Default');
    expect(site?.hostname).toBe('*');
  });
});
