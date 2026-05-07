import { describe, it, expect } from 'vitest';
import { routeBaseForSite } from '../../../src/engine/sites/index.js';
import type { SiteDefinition } from '../../../src/engine/sites/index.js';

const base: SiteDefinition = {
  name: 'SiteA',
  hostname: 'site-a.test',
  language: 'en',
  rootPath: '/sitecore/content/Tenant/SiteA',
  startItem: 'Home',
  linkable: false,
};

describe('routeBaseForSite', () => {
  it('joins rootPath and startItem with a slash for a YAML-derived site', () => {
    expect(routeBaseForSite(base)).toBe('/sitecore/content/Tenant/SiteA/Home');
  });

  it('returns rootPath verbatim when startItem is empty (synthetic env-fallback shape)', () => {
    const synth: SiteDefinition = {
      ...base,
      rootPath: '/sitecore/content/Tenant/SiteA/Home',
      startItem: '',
    };
    expect(routeBaseForSite(synth)).toBe('/sitecore/content/Tenant/SiteA/Home');
  });

  it('handles a multi-segment startItem path', () => {
    const nested: SiteDefinition = {
      ...base,
      startItem: 'Home/Landing',
    };
    expect(routeBaseForSite(nested)).toBe('/sitecore/content/Tenant/SiteA/Home/Landing');
  });

  it('returns the synthetic-env shape unchanged when both fields collapse to rootPath alone', () => {
    const empty: SiteDefinition = {
      name: '',
      hostname: '*',
      language: '',
      rootPath: '',
      startItem: '',
    };
    expect(routeBaseForSite(empty)).toBe('');
  });
});
