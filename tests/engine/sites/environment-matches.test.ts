import { describe, it, expect } from 'vitest';
import type { Engine } from '../../../src/engine/index.js';
import type { ScsItem } from '../../../src/engine/types.js';
import { environmentMatches } from '../../../src/engine/sites/resolver.js';
import { SITE_FIELD_IDS } from '../../../src/engine/constants.js';

const STANDARD_TEMPLATE_ID = '1930bbeb-7805-471a-a3be-4858ac7cf696';

function makeSiteGroupingItem(envValue: string | undefined): ScsItem {
  const sharedFields = envValue !== undefined
    ? [{ id: SITE_FIELD_IDS.environment, value: envValue, hint: 'Environment' }]
    : [];
  return {
    id: 'site-grouping',
    parent: '',
    template: STANDARD_TEMPLATE_ID,
    name: 'site',
    path: '/sitecore/content/tenant/site/Settings/Site Grouping/site',
    sharedFields,
    languages: [],
  } as unknown as ScsItem;
}

const stubEngine = {
  getItemById: () => undefined,
  getRegistryItem: () => undefined,
  getRegistryChildren: () => [],
} as unknown as Engine;

describe('environmentMatches', () => {
  it('matches when Environment field is unset', () => {
    expect(environmentMatches(stubEngine, makeSiteGroupingItem(undefined), '')).toBe(true);
  });

  it('matches when Environment is empty string', () => {
    expect(environmentMatches(stubEngine, makeSiteGroupingItem(''), 'Local')).toBe(true);
  });

  it('matches when Environment is "*" regardless of active env', () => {
    expect(environmentMatches(stubEngine, makeSiteGroupingItem('*'), 'Production')).toBe(true);
  });

  it('matches active env case-insensitively', () => {
    expect(environmentMatches(stubEngine, makeSiteGroupingItem('Local'), 'local')).toBe(true);
    expect(environmentMatches(stubEngine, makeSiteGroupingItem('LOCAL'), 'local')).toBe(true);
  });

  it('rejects mismatch when both sides are set', () => {
    expect(environmentMatches(stubEngine, makeSiteGroupingItem('Production'), 'Local')).toBe(false);
  });

  it('rejects non-wildcard Environment when activeEnv is empty', () => {
    expect(environmentMatches(stubEngine, makeSiteGroupingItem('Production'), '')).toBe(false);
  });
});
