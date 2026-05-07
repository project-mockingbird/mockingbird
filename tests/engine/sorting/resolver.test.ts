import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Engine } from '../../../src/engine/index.js';
import { resolveComparer, _resetWarnedUnknownIdsForTesting } from '../../../src/engine/sorting/resolver.js';
import {
  defaultComparer,
  logicalComparer,
  displayNameComparer,
  reverseComparer,
  updatedComparer,
  createdComparer,
} from '../../../src/engine/sorting/comparers.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../../fixtures/valid');

describe('resolveComparer', () => {
  let engine: Engine;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    engine = new Engine({ rootDir: FIXTURES });
    await engine.startInit();
    await engine.readiness.ready();
  });

  beforeEach(() => {
    _resetWarnedUnknownIdsForTesting();
  });

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  it('returns defaultComparer for unresolvable parent id', () => {
    const c = resolveComparer(engine, '00000000-0000-0000-0000-000000000099');
    expect(c).toBe(defaultComparer);
  });

  it('returns defaultComparer when parent has no __Subitems Sorting', () => {
    // Use any existing item from the fixture - none of them have the field set.
    const items = engine.getAllItems();
    if (items.length === 0) return; // skip if fixture is empty
    const c = resolveComparer(engine, items[0].item.id);
    expect(c).toBe(defaultComparer);
  });

  it('maps the 6 OOTB GUIDs to the right comparers', () => {
    const cases: Array<[string, typeof defaultComparer]> = [
      ['781247d2-9785-400f-8935-c818ec757967', defaultComparer],
      ['ea1decb2-b4f2-4ae0-99a8-30fded9b8b50', logicalComparer],
      ['44d1a0d2-e17b-4daa-addf-53f2e8f58525', displayNameComparer],
      ['c3e3f0e3-0162-4f1f-ab3e-40348e371a3f', reverseComparer],
      ['32416a95-4197-4d33-8ce7-7bb4ffebeb42', updatedComparer],
      ['c1ff011e-b02a-44e3-8444-9fc89cfc28ce', createdComparer],
    ];
    for (const [guid, expected] of cases) {
      const stubEngine = {
        getItemById: () => undefined,
        getRegistryItem: () => ({
          id: 'parent',
          template: 't',
          sharedFields: { '6fd695e7-7f6d-4ca5-8b49-a829e5950ae9': guid },
        }),
      } as unknown as Engine;
      const c = resolveComparer(stubEngine, 'parent');
      expect(c).toBe(expected);
    }
  });

  it('accepts brace-wrapped GUIDs', () => {
    const stubEngine = {
      getItemById: () => undefined,
      getRegistryItem: () => ({
        id: 'parent',
        template: 't',
        sharedFields: { '6fd695e7-7f6d-4ca5-8b49-a829e5950ae9': '{EA1DECB2-B4F2-4AE0-99A8-30FDED9B8B50}' },
      }),
    } as unknown as Engine;
    expect(resolveComparer(stubEngine, 'parent')).toBe(logicalComparer);
  });

  it('returns defaultComparer + warns once for unknown GUIDs', () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unknownGuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const stubEngine = {
      getItemById: () => undefined,
      getRegistryItem: () => ({
        id: 'parent',
        template: 't',
        sharedFields: { '6fd695e7-7f6d-4ca5-8b49-a829e5950ae9': unknownGuid },
      }),
    } as unknown as Engine;
    expect(resolveComparer(stubEngine, 'parent')).toBe(defaultComparer);
    expect(resolveComparer(stubEngine, 'parent')).toBe(defaultComparer);
    expect(resolveComparer(stubEngine, 'parent')).toBe(defaultComparer);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(unknownGuid);
  });

  it('returns defaultComparer for empty / whitespace value', () => {
    const stubEngine = {
      getItemById: () => undefined,
      getRegistryItem: () => ({
        id: 'parent',
        template: 't',
        sharedFields: { '6fd695e7-7f6d-4ca5-8b49-a829e5950ae9': '  ' },
      }),
    } as unknown as Engine;
    expect(resolveComparer(stubEngine, 'parent')).toBe(defaultComparer);
  });
});
