import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { join, resolve } from 'path';
import {
  encodeSegment,
  computePhysicalPath,
  buildTreeSpecContext,
  resolveChildFilePath,
  DEFAULT_MAX_RELATIVE_PATH_LENGTH,
  type TreeSpecContext,
} from '../../src/engine/child-file-path.js';
import type { ModuleConfig } from '../../src/engine/types.js';

/**
 * Pinning the SCS-parity port of `SubtreeFilesystemPathProvider`. Lines
 * referenced are from
 * `Sitecore.DevEx.Serialization.Client.decompiled.cs` unless noted.
 */
describe('encodeSegment - SCS ConvertItemPathSegmentToValidFilesystemPathSegment (5143)', () => {
  it('passes through a clean name unchanged', () => {
    expect(encodeSegment('Home')).toBe('Home');
    expect(encodeSegment('about-us')).toBe('about-us');
    expect(encodeSegment('Item 01')).toBe('Item 01');
  });

  it('strips leading and trailing spaces', () => {
    expect(encodeSegment('  Home  ')).toBe('Home');
    expect(encodeSegment(' Foo ')).toBe('Foo');
  });

  it('replaces invalid filename chars with #', () => {
    // SCS _invalidFileNameCharacters: " < > | : * ? \ / $ + 32 control chars
    expect(encodeSegment('a:b')).toBe('a#b');
    expect(encodeSegment('a*b')).toBe('a#b');
    expect(encodeSegment('a?b')).toBe('a#b');
    expect(encodeSegment('a/b')).toBe('a#b');
    expect(encodeSegment('a\\b')).toBe('a#b');
    expect(encodeSegment('a$b')).toBe('a#b');
    expect(encodeSegment('a"b')).toBe('a#b');
    expect(encodeSegment('a<b')).toBe('a#b');
    expect(encodeSegment('a>b')).toBe('a#b');
    expect(encodeSegment('a|b')).toBe('a#b');
  });

  it('replaces ASCII control chars with #', () => {
    expect(encodeSegment('a\tb')).toBe('a#b');
    expect(encodeSegment('a\nb')).toBe('a#b');
    expect(encodeSegment('a\rb')).toBe('a#b');
    expect(encodeSegment('a\x00b')).toBe('a#b');
    expect(encodeSegment('a\x1Fb')).toBe('a#b');
  });

  it('prepends # to reserved Windows filenames (case-insensitive)', () => {
    // SCS _invalidFileNames: CON PRN AUX NUL COM1-9 LPT1-9
    expect(encodeSegment('CON')).toBe('#CON');
    expect(encodeSegment('con')).toBe('#con');
    expect(encodeSegment('PrN')).toBe('#PrN');
    expect(encodeSegment('NUL')).toBe('#NUL');
    expect(encodeSegment('COM1')).toBe('#COM1');
    expect(encodeSegment('LPT9')).toBe('#LPT9');
  });

  it('does not prepend # for not-reserved names', () => {
    expect(encodeSegment('CONS')).toBe('CONS');
    expect(encodeSegment('COM10')).toBe('COM10');
    expect(encodeSegment('CONcat')).toBe('CONcat');
  });

  it('applies invalid-char replacement before reserved-name check', () => {
    // " a:CON " -> trim -> "a:CON" -> "a#CON" (not a reserved name)
    expect(encodeSegment(' a:CON ')).toBe('a#CON');
  });
});

describe('computePhysicalPath - SCS GetPhysicalPathForItemPath (5089)', () => {
  const ctx: TreeSpecContext = {
    includePath: '/sitecore/content/Site/Home',
    physicalPath: '/phys/home',
    aliases: [],
    maxRelativePathLength: DEFAULT_MAX_RELATIVE_PATH_LENGTH,
  };

  it('places the include root item at <phys>/<leaf>.yml', () => {
    expect(computePhysicalPath('/sitecore/content/Site/Home', ctx)).toBe(
      join('/phys/home', 'Home.yml'),
    );
  });

  it('places a child at <phys>/<leaf>/<child>.yml (sibling-style)', () => {
    expect(computePhysicalPath('/sitecore/content/Site/Home/About', ctx)).toBe(
      join('/phys/home', 'Home', 'About.yml'),
    );
  });

  it('places a grandchild at <phys>/<leaf>/<child>/<grand>.yml', () => {
    expect(computePhysicalPath('/sitecore/content/Site/Home/About/Sub', ctx)).toBe(
      join('/phys/home', 'Home', 'About', 'Sub.yml'),
    );
  });

  it('throws when the item is not under the include scope', () => {
    expect(() =>
      computePhysicalPath('/sitecore/templates/Project/Page', ctx),
    ).toThrow(/not under include/);
  });

  it('matches include path case-insensitively', () => {
    expect(computePhysicalPath('/SITECORE/content/site/home/about', ctx)).toBe(
      join('/phys/home', 'home', 'about.yml'),
    );
  });
});

describe('computePhysicalPath - segment encoding inside the pipeline', () => {
  const ctx: TreeSpecContext = {
    includePath: '/sitecore/content/Site/Home',
    physicalPath: '/phys/home',
    aliases: [],
    maxRelativePathLength: DEFAULT_MAX_RELATIVE_PATH_LENGTH,
  };

  it('encodes invalid chars in descendant segments', () => {
    expect(computePhysicalPath('/sitecore/content/Site/Home/A:B', ctx)).toBe(
      join('/phys/home', 'Home', 'A#B.yml'),
    );
  });

  it('prepends # to reserved Windows filenames', () => {
    expect(computePhysicalPath('/sitecore/content/Site/Home/CON', ctx)).toBe(
      join('/phys/home', 'Home', '#CON.yml'),
    );
  });
});

describe('computePhysicalPath - ApplyPathLengthHashes (SCS 5221)', () => {
  // SCS PathLength = sum(segment.Length) + segments.Count.
  // For "/Home/AAAA...A" with one A-segment, PathLength of skip(1) =
  // segment.length + 1.
  it('does not hash when relative path fits in the budget', () => {
    const ctx: TreeSpecContext = {
      includePath: '/sitecore/content/Site/Home',
      physicalPath: '/phys/home',
      aliases: [],
      maxRelativePathLength: 120,
    };
    // Descendant with name length under 119 -> total skip(1) length under 120.
    const longName = 'A'.repeat(80);
    expect(computePhysicalPath(`/sitecore/content/Site/Home/${longName}`, ctx)).toBe(
      join('/phys/home', 'Home', `${longName}.yml`),
    );
  });

  it('hashes the truncated prefix and preserves the popped tail', () => {
    // 5 ten-char descendants + max=20.
    //   originalPL = 50 + 5 = 55. target = floor(55/20) = 2.
    //   currentRatio = 2.75 -> 2.2 -> 1.65 (after 2 pops). Loop exits.
    //   truncated = 3 segments; keptTail = 2 segments.
    // Result: leaf + hash(3 prefix segs) + 2 tail segs.
    const ctx: TreeSpecContext = {
      includePath: '/sitecore/content/Site/Home',
      physicalPath: '/phys/home',
      aliases: [],
      maxRelativePathLength: 20,
    };
    const segs = ['AAAAAAAAAA', 'BBBBBBBBBB', 'CCCCCCCCCC', 'DDDDDDDDDD', 'EEEEEEEEEE'];
    const result = computePhysicalPath(
      `/sitecore/content/Site/Home/${segs.join('/')}`,
      ctx,
    );
    const truncatedPrefix = segs.slice(0, 3);
    const expectedHash = createHash('sha256')
      .update('/' + truncatedPrefix.join('/'), 'utf8')
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
    expect(result).toBe(
      join('/phys/home', 'Home', expectedHash, 'DDDDDDDDDD', 'EEEEEEEEEE.yml'),
    );
  });

  it('throws when the path cannot be reduced below the budget', () => {
    // Single 60-char descendant with max=50: SCS pops the lone segment,
    // truncated becomes empty, throws InvalidConfigurationException.
    const ctx: TreeSpecContext = {
      includePath: '/sitecore/content/Site/Home',
      physicalPath: '/phys/home',
      aliases: [],
      maxRelativePathLength: 50,
    };
    const longName = 'A'.repeat(60);
    expect(() =>
      computePhysicalPath(`/sitecore/content/Site/Home/${longName}`, ctx),
    ).toThrow(/cannot be reduced/);
  });
});

describe('computePhysicalPath - TryApplyPathAliases (SCS 5185)', () => {
  it('substitutes the alias for the matching rule path', () => {
    const ctx: TreeSpecContext = {
      includePath: '/sitecore/content/Site/Home',
      physicalPath: '/phys/home',
      aliases: [
        { rulePath: '/About', aliasPath: '/aliased-about' },
      ],
      maxRelativePathLength: DEFAULT_MAX_RELATIVE_PATH_LENGTH,
    };
    // Item under the rule path: relative becomes alias + leaf-prepend
    // logic (mirrors SCS line 5205-5207).
    expect(computePhysicalPath('/sitecore/content/Site/Home/About/Sub', ctx)).toBe(
      join('/phys/home', 'aliased-about', 'About', 'Sub.yml'),
    );
  });

  it('does not substitute when no rule matches', () => {
    const ctx: TreeSpecContext = {
      includePath: '/sitecore/content/Site/Home',
      physicalPath: '/phys/home',
      aliases: [
        { rulePath: '/About', aliasPath: '/aliased-about' },
      ],
      maxRelativePathLength: DEFAULT_MAX_RELATIVE_PATH_LENGTH,
    };
    expect(computePhysicalPath('/sitecore/content/Site/Home/News/Story', ctx)).toBe(
      join('/phys/home', 'Home', 'News', 'Story.yml'),
    );
  });

  it('matches alias rules case-insensitively', () => {
    const ctx: TreeSpecContext = {
      includePath: '/sitecore/content/Site/Home',
      physicalPath: '/phys/home',
      aliases: [
        { rulePath: '/About', aliasPath: '/aliased' },
      ],
      maxRelativePathLength: DEFAULT_MAX_RELATIVE_PATH_LENGTH,
    };
    expect(computePhysicalPath('/sitecore/content/Site/Home/about/x', ctx)).toBe(
      join('/phys/home', 'aliased', 'about', 'x.yml'),
    );
  });
});

describe('buildTreeSpecContext - module include -> tree spec', () => {
  it('builds a context from a typical module include', () => {
    const mod: ModuleConfig = {
      namespace: 'Test',
      filePath: resolve('/some/dir/test.module.json'),
      items: {
        includes: [{ name: 'home', path: '/sitecore/content/Site/Home' }],
      },
    };
    const ctx = buildTreeSpecContext(mod, mod.items.includes[0]);
    expect(ctx.includePath).toBe('/sitecore/content/Site/Home');
    expect(ctx.physicalPath).toBe(resolve('/some/dir/home'));
    expect(ctx.aliases).toEqual([]);
    expect(ctx.maxRelativePathLength).toBe(DEFAULT_MAX_RELATIVE_PATH_LENGTH);
  });

  it('extracts aliases from include rules', () => {
    const mod: ModuleConfig = {
      namespace: 'Test',
      filePath: resolve('/some/dir/test.module.json'),
      items: {
        includes: [
          {
            name: 'home',
            path: '/sitecore/content/Site/Home',
            rules: [
              { path: '/Foo', scope: 'ItemAndDescendants', alias: 'foo-alias' },
              { path: '/Bar', scope: 'Ignored' },
            ],
          },
        ],
      },
    };
    const ctx = buildTreeSpecContext(mod, mod.items.includes[0]);
    expect(ctx.aliases).toEqual([{ rulePath: '/Foo', aliasPath: '/foo-alias' }]);
  });
});

describe('resolveChildFilePath - longest-prefix include match', () => {
  it('picks the deepest include whose physical root is a prefix of parentFilePath', () => {
    const broadMod: ModuleConfig = {
      namespace: 'Broad',
      filePath: resolve('/primary/broad.module.json'),
      items: {
        includes: [{ name: 'site', path: '/sitecore/content/Site' }],
      },
    };
    const narrowMod: ModuleConfig = {
      namespace: 'Narrow',
      filePath: resolve('/content/narrow.module.json'),
      items: {
        includes: [{ name: 'home', path: '/sitecore/content/Site/Home' }],
      },
    };
    // Parent lives in the narrow root's physical area.
    const parentFilePath = resolve('/content/home/Home.yml');
    const result = resolveChildFilePath(
      parentFilePath,
      '/sitecore/content/Site/Home/NewChild',
      [broadMod, narrowMod],
    );
    expect(result).toBe(resolve('/content/home/Home/NewChild.yml'));
  });

  it('routes a descendant create to the scope-covering include, not a SingleItem seed at the same path', () => {
    // Two includes at the SAME Sitecore path: an authoring "seed" (SingleItem,
    // covers only the node itself) and a content include (ItemAndDescendants).
    // A new descendant must land in the content include - else it is written
    // out-of-scope under the seed and dropped on the next scan.
    const authoringMod: ModuleConfig = {
      namespace: 'Authoring',
      filePath: resolve('/authoring/auth.module.json'),
      items: { includes: [{ name: 'home-seed', path: '/sitecore/content/Site/Home', scope: 'SingleItem' }] },
    };
    const contentMod: ModuleConfig = {
      namespace: 'Content',
      filePath: resolve('/content/content.module.json'),
      items: { includes: [{ name: 'home', path: '/sitecore/content/Site/Home', scope: 'ItemAndDescendants' }] },
    };
    const parentFilePath = resolve('/content/home/Home/section/leaf.yml');
    // Authoring listed FIRST: reproduces the scope-blind tie going to the seed.
    const result = resolveChildFilePath(
      parentFilePath,
      '/sitecore/content/Site/Home/section/leaf/new-page',
      [authoringMod, contentMod],
    );
    expect(result).toBe(resolve('/content/home/Home/section/leaf/new-page.yml'));
  });

  it('falls back to parent-stem when no include matches parentFilePath', () => {
    const mod: ModuleConfig = {
      namespace: 'Test',
      filePath: resolve('/somewhere/else/test.module.json'),
      items: {
        includes: [{ name: 'home', path: '/sitecore/content/Site/Home' }],
      },
    };
    const orphanParent = resolve('/totally/different/root/Item.yml');
    const result = resolveChildFilePath(
      orphanParent,
      '/sitecore/content/Foo/Bar/Child',
      [mod],
    );
    // Fallback: <parentStem>/<encodedChildName>.yml
    expect(result).toBe(resolve('/totally/different/root/Item/Child.yml'));
  });
});
