import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../../src/engine/index.js';
import { lookupSiteByName, lookupSiteByHost } from '../../../src/engine/sites/request-resolver.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../../fixtures/sites');

describe('lookupSiteByName', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
  });

  it('finds SiteA by exact name', () => {
    expect(lookupSiteByName(engine, 'SiteA')?.name).toBe('SiteA');
  });

  it('finds SiteB by exact name', () => {
    expect(lookupSiteByName(engine, 'SiteB')?.name).toBe('SiteB');
  });

  it('is case-insensitive', () => {
    expect(lookupSiteByName(engine, 'sitea')?.name).toBe('SiteA');
    expect(lookupSiteByName(engine, 'SITEB')?.name).toBe('SiteB');
  });

  it('returns null for unknown site', () => {
    expect(lookupSiteByName(engine, 'NonExistent')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(lookupSiteByName(engine, '')).toBeNull();
  });
});

describe('lookupSiteByHost', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
  });

  it('finds SiteA by its exact hostname', () => {
    expect(lookupSiteByHost(engine, 'site-a.test')?.name).toBe('SiteA');
  });

  it('finds SiteB by its exact hostname', () => {
    expect(lookupSiteByHost(engine, 'site-b.test')?.name).toBe('SiteB');
  });

  it('finds SiteB by wildcard match in pipe-list', () => {
    expect(lookupSiteByHost(engine, 'foo.preview.test')?.name).toBe('SiteB');
  });

  it('strips port before matching', () => {
    expect(lookupSiteByHost(engine, 'site-a.test:3000')?.name).toBe('SiteA');
    expect(lookupSiteByHost(engine, 'site-b.test:8080')?.name).toBe('SiteB');
  });

  it('is case-insensitive on the host', () => {
    expect(lookupSiteByHost(engine, 'SITE-A.TEST')?.name).toBe('SiteA');
  });

  it('returns null for unmatched host', () => {
    expect(lookupSiteByHost(engine, 'unknown.test')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(lookupSiteByHost(engine, '')).toBeNull();
  });
});
