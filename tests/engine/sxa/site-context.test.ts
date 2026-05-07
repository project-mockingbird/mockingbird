import { describe, expect, it } from 'vitest';
import { resolveSxaContext } from '../../../src/engine/sxa/site-context.js';

describe('resolveSxaContext', () => {
  it('returns site + tenant + common paths from a typical SXA site root', () => {
    const ctx = resolveSxaContext('/sitecore/content/tenant/site');
    expect(ctx).toEqual({
      siteRootPath: '/sitecore/content/tenant/site',
      tenantRootPath: '/sitecore/content/tenant',
      commonRootPath: '/sitecore/content/tenant/common',
    });
  });

  it('returns null when siteRootPath is empty', () => {
    expect(resolveSxaContext('')).toBeNull();
  });

  it('returns null when siteRootPath has no parent', () => {
    expect(resolveSxaContext('/sitecore')).toBeNull();
  });

  it('strips trailing slash from siteRootPath', () => {
    const ctx = resolveSxaContext('/sitecore/content/tenant/site/');
    expect(ctx?.siteRootPath).toBe('/sitecore/content/tenant/site');
    expect(ctx?.tenantRootPath).toBe('/sitecore/content/tenant');
  });
});
