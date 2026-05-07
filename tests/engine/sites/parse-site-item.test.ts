import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../../src/engine/index.js';
import { parseSiteItem } from '../../../src/engine/sites/resolver.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../../fixtures/sites');

describe('parseSiteItem', () => {
  let engine: Engine;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
  });

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  it('returns a populated SiteDefinition for a valid Site Grouping item', () => {
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006');
    expect(node).toBeDefined();
    const result = parseSiteItem(engine, node!);
    expect(result).toEqual({
      name: 'SiteA',
      hostname: 'site-a.test',
      language: 'en',
      rootPath: '/sitecore/content/Tenant/SiteA',
      startItem: 'Home',
      linkable: false,
    });
  });

  it('reads sxaLinkable=true when the SxaLinkable field is "1" (raw checkbox value)', () => {
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const withFlag = {
      ...node,
      item: {
        ...node.item,
        sharedFields: [
          ...node.item.sharedFields,
          { id: '4eeff055-edcd-4387-9e86-c3f40a15dbac', value: '1' },
        ],
      },
    };
    const result = parseSiteItem(engine, withFlag as typeof node);
    expect(result?.linkable).toBe(true);
  });

  it('reads sxaLinkable=true when the SxaLinkable field is "true" (parsed flag value)', () => {
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const withFlag = {
      ...node,
      item: {
        ...node.item,
        sharedFields: [
          ...node.item.sharedFields,
          { id: '4eeff055-edcd-4387-9e86-c3f40a15dbac', value: 'true' },
        ],
      },
    };
    const result = parseSiteItem(engine, withFlag as typeof node);
    expect(result?.linkable).toBe(true);
  });

  it('reads sxaLinkable=false when the SxaLinkable field is "0" or absent', () => {
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const result = parseSiteItem(engine, node);
    expect(result?.linkable).toBe(false);
  });

  it('returns null and warns when SiteName is empty', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const stripped = {
      ...node,
      item: {
        ...node.item,
        sharedFields: node.item.sharedFields.filter(f =>
          f.id.toLowerCase() !== 'cb4e9e2e-2b66-43dc-ad3f-9caf363d28d3'
        ),
      },
    };
    const result = parseSiteItem(engine, stripped as typeof node);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/empty SiteName/));
  });

  it('returns null and warns when StartItem is missing', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const stripped = {
      ...node,
      item: {
        ...node.item,
        sharedFields: node.item.sharedFields.filter(f =>
          f.id.toLowerCase() !== '1ee576af-ba8e-4312-9fbd-2ccf8395baa1'
        ),
      },
    };
    const result = parseSiteItem(engine, stripped as typeof node);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/missing or invalid StartItem/));
  });

  it('returns null and warns when StartItem GUID points at a missing item', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const swapped = {
      ...node,
      item: {
        ...node.item,
        sharedFields: node.item.sharedFields.map(f =>
          f.id.toLowerCase() === '1ee576af-ba8e-4312-9fbd-2ccf8395baa1'
            ? { ...f, value: '{99999999-9999-9999-9999-999999999999}' }
            : f
        ),
      },
    };
    const result = parseSiteItem(engine, swapped as typeof node);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/StartItem.*not found/));
  });

  it('strips whitespace from hostname (matches Sitecore Replace(" ", ""))', () => {
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const padded = {
      ...node,
      item: {
        ...node.item,
        sharedFields: node.item.sharedFields.map(f =>
          f.id.toLowerCase() === '8e0dd914-9afb-4d45-bf8b-7ff5d6e5337e'
            ? { ...f, value: '  site-a.test |  *.preview.test  ' }
            : f
        ),
      },
    };
    const result = parseSiteItem(engine, padded as typeof node);
    expect(result?.hostname).toBe('site-a.test|*.preview.test');
  });

  it('returns startItem as empty when StartItem GUID equals the site root', () => {
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    const startAtRoot = {
      ...node,
      item: {
        ...node.item,
        sharedFields: node.item.sharedFields.map(f =>
          f.id.toLowerCase() === '1ee576af-ba8e-4312-9fbd-2ccf8395baa1'
            ? { ...f, value: '{AAAA1111-0000-0000-0000-000000000002}' }
            : f
        ),
      },
    };
    const result = parseSiteItem(engine, startAtRoot as typeof node);
    expect(result?.startItem).toBe('');
    expect(result?.rootPath).toBe('/sitecore/content/Tenant/SiteA');
  });

  it('returns null and warns when StartItem has no _BaseSiteRoot ancestor', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const node = engine.getItemById('aaaa1111-0000-0000-0000-000000000006')!;
    // Point StartItem at the Tenant item, whose template (_BaseTenant) does
    // not descend from _BaseSiteRoot. walkToSiteRoot will return null.
    const orphaned = {
      ...node,
      item: {
        ...node.item,
        sharedFields: node.item.sharedFields.map(f =>
          f.id.toLowerCase() === '1ee576af-ba8e-4312-9fbd-2ccf8395baa1'
            ? { ...f, value: '{AAAA1111-0000-0000-0000-000000000001}' }
            : f
        ),
      },
    };
    const result = parseSiteItem(engine, orphaned as typeof node);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/no _BaseSiteRoot ancestor/));
  });
});
