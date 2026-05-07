// tests/web/renderings/serialize.test.ts
import { describe, expect, it } from 'vitest';
import { parseLayoutXml, serializeLayoutXml } from '../../../src/web/components/detail/field-editors/renderings/serialize';
import type { ParsedLayout, RenderingEntry } from '../../../src/web/components/detail/field-editors/renderings/types';
import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SIMPLE_XML = `<r xmlns:p="p" xmlns:s="s">
  <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1">
    <r uid="{A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1}" p:before="*" s:ds="" s:id="{B1B1B1B1-B1B1-B1B1-B1B1-B1B1B1B1B1B1}" s:par="DynamicPlaceholderId=1" s:ph="/headless-main" />
    <r uid="{C1C1C1C1-C1C1-C1C1-C1C1-C1C1C1C1C1C1}" p:after="r[@uid='{A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1}']" s:ds="local:Data/Hello" s:id="{D1D1D1D1-D1D1-D1D1-D1D1-D1D1D1D1D1D1}" s:par="" s:ph="/headless-main/container-1" />
  </d>
</r>`;

describe('parseLayoutXml', () => {
  it('returns empty entries for empty input', () => {
    const result = parseLayoutXml('');
    expect(result.entries).toEqual([]);
    expect(result.originalXml).toBe('');
  });

  it('extracts Default-device renderings in document order', () => {
    const result = parseLayoutXml(SIMPLE_XML);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      uid: '{A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1}',
      renderingId: '{B1B1B1B1-B1B1-B1B1-B1B1-B1B1B1B1B1B1}',
      placeholder: '/headless-main',
      dataSource: '',
      params: { DynamicPlaceholderId: '1' },
    });
    expect(result.entries[1].dataSource).toBe('local:Data/Hello');
  });

  it('preserves originalXml byte-for-byte', () => {
    const result = parseLayoutXml(SIMPLE_XML);
    expect(result.originalXml).toBe(SIMPLE_XML);
  });

  it('captures rlsRaw on personalized renderings', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" s:id="{B}" s:ph="/main"><rls><ruleset><rule uid="{00000000-0000-0000-0000-000000000000}"/></ruleset></rls></r></d></r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries[0].rlsRaw).toContain('<rls>');
    expect(result.entries[0].rlsRaw).toContain('</rls>');
  });

  it('skips entries inside non-Default device blocks', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1">
        <r uid="{A}" s:id="{X}" s:ph="/main" />
      </d>
      <d id="{46D2F427-4CE5-4E1F-BA10-EF3636F43534}" p:p="1">
        <r uid="{Mobile}" s:id="{Y}" s:ph="/m" />
      </d>
    </r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].uid).toBe('{A}');
  });

  it('parses caching attrs into entry.caching', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" s:id="{B}" s:ph="/main" s:ds="" s:par="" cac="1" vbd="1" vbl="0" vbp="1" vbqs="1" vbu="0" ciu="1" ccb="ClearOnPublish" /></d></r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries[0].caching).toEqual({
      cacheable: true,
      varyByData: true,
      varyByLogin: false,
      varyByParm: true,
      varyByQueryString: true,
      varyByUser: false,
      clearOnIndexUpdate: true,
      clearingBehavior: 'ClearOnPublish',
    });
  });

  it('omits entry.caching when no caching attrs present', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" s:id="{B}" s:ph="/main" s:ds="" s:par="" /></d></r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries[0].caching).toBeUndefined();
  });

  it('parses partial caching attrs (cac only) into entry.caching', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" s:id="{B}" s:ph="/main" s:ds="" s:par="" cac="1" /></d></r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries[0].caching).toEqual({ cacheable: true });
  });

  it('captures unknown <r> attrs into entry.unknownAttrs', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" s:id="{B}" s:ph="/main" s:ds="" s:par="" cnd="some-condition" pt="{TEST-ID}" mvt="{MVT-ID}" /></d></r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries[0].unknownAttrs).toEqual({
      cnd: 'some-condition',
      pt: '{TEST-ID}',
      mvt: '{MVT-ID}',
    });
  });

  it('omits entry.unknownAttrs when only known attrs present', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" s:id="{B}" s:ph="/main" s:ds="" s:par="" cac="1" /></d></r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries[0].unknownAttrs).toBeUndefined();
  });

  it('does not capture p:before / p:after as unknown attrs', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" p:before="*" s:id="{B}" s:ph="/main" s:ds="" s:par="" /></d></r>`;
    const result = parseLayoutXml(xml);
    expect(result.entries[0].unknownAttrs).toBeUndefined();
  });
});

describe('serializeLayoutXml - empty layout', () => {
  it('renders a minimal Default-device block when originalXml is empty and entries are empty', () => {
    const result = serializeLayoutXml({ entries: [], originalXml: '' }, []);
    expect(result).toContain('<d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"');
    expect(result).toContain('p:p="1"');
  });

  it('renders a Default-device block with one rendering when originalXml is empty', () => {
    const entry = {
      uid: '{A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1}',
      renderingId: '{B1B1B1B1-B1B1-B1B1-B1B1-B1B1B1B1B1B1}',
      placeholder: '/main',
      dataSource: '',
      params: { DynamicPlaceholderId: '1' },
    };
    const result = serializeLayoutXml({ entries: [entry], originalXml: '' }, [entry]);
    expect(result).toContain('<r uid="{A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1}"');
    expect(result).toContain(`p:before="*"`);
    expect(result).toContain(`s:id="{B1B1B1B1-B1B1-B1B1-B1B1-B1B1B1B1B1B1}"`);
    expect(result).toContain(`s:par="DynamicPlaceholderId=1"`);
    expect(result).toContain(`s:ph="/main"`);
  });
});

describe('serializeLayoutXml - conditioning autocompute', () => {
  it('first entry per placeholder gets p:before="*", others p:after on previous uid', () => {
    const a = { uid: '{A}', renderingId: '{X}', placeholder: '/main', dataSource: '', params: {} };
    const b = { uid: '{B}', renderingId: '{X}', placeholder: '/main', dataSource: '', params: {} };
    const result = serializeLayoutXml({ entries: [], originalXml: '' }, [a, b]);
    expect(result).toMatch(/<r uid="\{A\}"\s+p:before="\*"/);
    expect(result).toMatch(/<r uid="\{B\}"\s+p:after="r\[@uid='\{A\}'\]"/);
  });
});

describe('serializeLayoutXml - non-Default device preservation', () => {
  it('preserves a Mobile device block byte-for-byte', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" p:before="*" s:id="{X}" s:ph="/main"/></d><d id="{46D2F427-4CE5-4E1F-BA10-EF3636F43534}" p:p="1"><r uid="{Mobile}" s:id="{Y}" s:ph="/m"/></d></r>`;
    const parsed = parseLayoutXml(xml);
    const result = serializeLayoutXml(parsed, parsed.entries);
    expect(result).toContain('<d id="{46D2F427-4CE5-4E1F-BA10-EF3636F43534}"');
    expect(result).toContain('uid="{Mobile}"');
    // Mobile block should be byte-identical to input.
    const mobileMatch = /<d id="\{46D2F427[^>]*>[\s\S]*?<\/d>/.exec(xml)![0];
    expect(result).toContain(mobileMatch);
  });
});

describe('serializeLayoutXml - rls preservation', () => {
  it('splices rlsRaw back inside the rendering body unchanged', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A}" s:id="{X}" s:ph="/main"><rls><ruleset><rule uid="{00000000-0000-0000-0000-000000000000}" name="Default"/></ruleset></rls></r></d></r>`;
    const parsed = parseLayoutXml(xml);
    const result = serializeLayoutXml(parsed, parsed.entries);
    expect(result).toContain('<rls><ruleset><rule uid="{00000000-0000-0000-0000-000000000000}" name="Default"/></ruleset></rls>');
  });
});

describe('serializeLayoutXml - attribute ordering', () => {
  it('emits attrs in canonical order: uid, p:before/p:after, s:ds, s:id, s:par, s:ph', () => {
    const entry = {
      uid: '{A}',
      renderingId: '{X}',
      placeholder: '/main',
      dataSource: 'local:Data/Y',
      params: { DynamicPlaceholderId: '1' },
    };
    const result = serializeLayoutXml({ entries: [], originalXml: '' }, [entry]);
    // Match a single self-closing rendering with attrs in expected order.
    expect(result).toMatch(/<r uid="\{A\}"\s+p:before="\*"\s+s:ds="local:Data\/Y"\s+s:id="\{X\}"\s+s:par="DynamicPlaceholderId=1"\s+s:ph="\/main"\s*\/>/);
  });
});

describe('serializeLayoutXml - param XML escape', () => {
  it('escapes & inside s:par value as &amp; (XML attribute escape)', () => {
    const entry = {
      uid: '{A}',
      renderingId: '{X}',
      placeholder: '/main',
      dataSource: '',
      params: { a: '1', b: '2' },
    };
    const result = serializeLayoutXml({ entries: [entry], originalXml: '' }, [entry]);
    expect(result).toContain('s:par="a=1&amp;b=2"');
  });
});

describe('serializeLayoutXml - caching attrs', () => {
  it('emits caching attrs in fixed order after s:* attrs', () => {
    const parsed: ParsedLayout = { entries: [], originalXml: '' };
    const entry: RenderingEntry = {
      uid: '{A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1}',
      renderingId: '{B1B1B1B1-B1B1-B1B1-B1B1-B1B1B1B1B1B1}',
      placeholder: '/main',
      dataSource: '',
      params: {},
      caching: {
        cacheable: true,
        varyByData: true,
        varyByLogin: false,
        clearingBehavior: 'ClearOnPublish',
      },
    };
    const xml = serializeLayoutXml(parsed, [entry]);
    // Caching attrs appear after s:ph, in fixed order: cac vbd vbl vbp vbqs vbu ciu ccb.
    expect(xml).toContain('s:ph="/main" cac="1" vbd="1" vbl="0" ccb="ClearOnPublish"');
  });

  it('omits caching attrs entirely when entry.caching absent', () => {
    const parsed: ParsedLayout = { entries: [], originalXml: '' };
    const entry: RenderingEntry = {
      uid: '{A}', renderingId: '{B}', placeholder: '/main',
      dataSource: '', params: {},
    };
    const xml = serializeLayoutXml(parsed, [entry]);
    expect(xml).not.toMatch(/\bcac=/);
    expect(xml).not.toMatch(/\bccb=/);
  });
});

describe('serializeLayoutXml - unknownAttrs and round-trip', () => {
  it('emits unknownAttrs after the known attr set', () => {
    const parsed: ParsedLayout = { entries: [], originalXml: '' };
    const entry: RenderingEntry = {
      uid: '{A}', renderingId: '{B}', placeholder: '/main',
      dataSource: '', params: {},
      unknownAttrs: { cnd: 'some-condition', pt: '{TEST}' },
    };
    const xml = serializeLayoutXml(parsed, [entry]);
    expect(xml).toContain('s:ph="/main" cnd="some-condition" pt="{TEST}"');
  });

  it('round-trips parse(serialize(entry)) preserving caching + unknownAttrs', () => {
    const xml = `<r xmlns:p="p" xmlns:s="s"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}" p:p="1"><r uid="{A1A1A1A1-A1A1-A1A1-A1A1-A1A1A1A1A1A1}" s:ds="local:Data/Foo" s:id="{B1B1B1B1-B1B1-B1B1-B1B1-B1B1B1B1B1B1}" s:par="x=1" s:ph="/main" cac="1" vbd="0" cnd="cond" /></d></r>`;
    const parsed = parseLayoutXml(xml);
    const reSerialized = serializeLayoutXml(parsed, parsed.entries);
    const reParsed = parseLayoutXml(reSerialized);
    expect(reParsed.entries[0]).toEqual(parsed.entries[0]);
  });
});

const CONTENT_TREE_ROOT = join(process.cwd(), 'content', 'items');

/**
 * Extract the __Final Renderings field value from a serialized item YAML.
 * Walks the YAML manually to keep the test free of yaml-parser dependencies
 * - the field-value block is a multiline scalar with consistent indentation
 * we can pluck directly.
 *
 * Field id: 04bf00db-f5fb-41f7-8ab7-22408372a981
 */
function extractFinalRenderings(yamlContent: string): string[] {
  const fieldId = '04bf00db-f5fb-41f7-8ab7-22408372a981';
  const out: string[] = [];
  // Look for `- ID: "{04BF00DB-...}"` followed by a Value block.
  const lines = yamlContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].toLowerCase().includes(fieldId)) continue;
    // Find the next `Value:` line at the same or deeper indentation.
    for (let j = i + 1; j < lines.length && j < i + 8; j++) {
      const m = /^(\s*)Value:\s*(\|[+-]?)?\s*$/.exec(lines[j]);
      if (m) {
        const valueIndent = m[1].length + 2;
        const collected: string[] = [];
        for (let k = j + 1; k < lines.length; k++) {
          const line = lines[k];
          if (line.trim() === '' || line.startsWith(' '.repeat(valueIndent))) {
            collected.push(line.slice(valueIndent));
          } else {
            break;
          }
        }
        out.push(collected.join('\n').trimEnd());
        break;
      }
      // Inline Value (single-line): `Value: "..."`
      const inlineM = /^\s*Value:\s*"(.*)"\s*$/.exec(lines[j]);
      if (inlineM) {
        out.push(inlineM[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
        break;
      }
    }
  }
  return out;
}

describe('content-tree-replay round-trip', () => {
  it('parses + reserializes every __Final Renderings value in the content tree without losing entries', async () => {
    const ymlFiles = await glob('**/*.yml', { cwd: CONTENT_TREE_ROOT, absolute: true });
    let total = 0;
    const mismatches: Array<{ file: string; reason: string }> = [];

    for (const file of ymlFiles) {
      const content = readFileSync(file, 'utf-8');
      const values = extractFinalRenderings(content);
      for (const xml of values) {
        if (!xml.trim()) continue;
        total++;
        try {
          const parsed = parseLayoutXml(xml);
          const reserialized = serializeLayoutXml(parsed, parsed.entries);
          // Re-parse the output and confirm semantic equality with first parse.
          const reparsed = parseLayoutXml(reserialized);
          if (reparsed.entries.length !== parsed.entries.length) {
            mismatches.push({ file, reason: `entry count: ${parsed.entries.length} -> ${reparsed.entries.length}` });
            continue;
          }
          for (let i = 0; i < parsed.entries.length; i++) {
            const a = parsed.entries[i];
            const b = reparsed.entries[i];
            if (a.uid !== b.uid || a.renderingId !== b.renderingId || a.placeholder !== b.placeholder || a.dataSource !== b.dataSource) {
              mismatches.push({ file, reason: `entry ${i} attrs differ: ${JSON.stringify({ a, b })}` });
              break;
            }
            if (JSON.stringify(a.params) !== JSON.stringify(b.params)) {
              mismatches.push({ file, reason: `entry ${i} params differ: ${JSON.stringify({ a: a.params, b: b.params })}` });
              break;
            }
          }
        } catch (err: any) {
          mismatches.push({ file, reason: `threw: ${err.message}` });
        }
      }
    }

    if (mismatches.length > 0) {
      // Truncate output - on 100s of content tree items, full dumps are unreadable.
      const summary = mismatches.slice(0, 10).map((m) => `  ${m.file}: ${m.reason}`).join('\n');
      throw new Error(`${mismatches.length}/${total} content tree items failed round-trip. First 10:\n${summary}`);
    }

    expect(total).toBeGreaterThan(0); // sanity - we found and processed content tree items.
  }, 120000);
});
