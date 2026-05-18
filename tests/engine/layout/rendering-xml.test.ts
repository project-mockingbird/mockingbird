import { describe, it, expect } from 'vitest';
import { parseRenderingXml, DEFAULT_DEVICE_ID } from '../../../src/engine/layout/rendering-xml.js';
import { HIDE_RENDERING_ACTION_ID } from '../../../src/engine/constants.js';

describe('parseRenderingXml', () => {
  it('returns empty array for empty string', () => {
    expect(parseRenderingXml('')).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseRenderingXml(undefined as unknown as string)).toEqual([]);
  });

  it('parses a single rendering with all attributes', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{AAA}" s:id="{11111111-1111-1111-1111-111111111111}"
           s:ph="headless-main" s:ds="{22222222-2222-2222-2222-222222222222}"
           s:par="GridParameters=col-12&amp;Styles=boxed" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result).toEqual([
      {
        uid: 'aaa',
        renderingId: '11111111-1111-1111-1111-111111111111',
        placeholder: 'headless-main',
        dataSource: '{22222222-2222-2222-2222-222222222222}',
        params: { GridParameters: 'col-12', Styles: 'boxed' },
      },
    ]);
  });

  it('parses multiple renderings preserving document order', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="headless-header" s:ds="" s:par="" />
        <r uid="{B}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="headless-main" s:ds="" s:par="" />
        <r uid="{C}" s:id="{33333333-3333-3333-3333-333333333333}" s:ph="headless-footer" s:ds="" s:par="" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result).toHaveLength(3);
    expect(result[0].uid).toBe('a');
    expect(result[1].uid).toBe('b');
    expect(result[2].uid).toBe('c');
  });

  it('handles nested placeholder paths', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}"
           s:ph="/headless-header/sxa-header/container-1" s:ds="" s:par="" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result[0].placeholder).toBe('/headless-header/sxa-header/container-1');
  });

  it('defaults to empty string for missing s:ds', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="main" s:par="" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result[0].dataSource).toBe('');
  });

  it('defaults to empty object for missing s:par', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="main" s:ds="" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result[0].params).toEqual({});
  });

  it('filters to matching device ID only', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="main" s:ds="" s:par="" />
      </d>
      <d id="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}">
        <r uid="{B}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="other" s:ds="" s:par="" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('a');
  });

  it('handles URL-encoded ampersands in params', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="main" s:ds=""
           s:par="Key1=Value1&amp;Key2=Value2&amp;Key3=Value3" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result[0].params).toEqual({ Key1: 'Value1', Key2: 'Value2', Key3: 'Value3' });
  });

  it('parses renderings with personalization rules (full open/close form, default rule present)', () => {
    // SXA serialises renderings that carry `<rls>` personalisation conditions
    // as full `<r ...>...</r>` element pairs rather than self-closing tags.
    // A `<rls>` containing the default all-zeros rule uid represents the
    // "always matches" baseline that Sitecore keeps in every layout output.
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="main" s:ds="" s:par="" />
        <r uid="{B}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="main" s:ds="" s:par="">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default">
                <conditions>
                  <condition uid="ABC" s:id="{33333333-3333-3333-3333-333333333333}" />
                </conditions>
                <actions>
                  <action uid="DEF" s:id="{44444444-4444-4444-4444-444444444444}" />
                </actions>
              </rule>
            </ruleset>
          </rls>
        </r>
        <r uid="{C}" s:id="{55555555-5555-5555-5555-555555555555}" s:ph="main" s:ds="" s:par="" />
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result).toHaveLength(3);
    expect(result.map(e => e.uid)).toEqual(['a', 'b', 'c']);
    expect(result[1].renderingId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('drops renderings whose <rls> contains only non-default rules (item 10)', () => {
    // Sitecore's layout service emits only the baseline / default-rule variant
    // of a rendering in normal (non-editor) mode. Personalisation variants -
    // `<r>` entries whose `<rls>` carries only an audience-specific rule uid
    // and no default rule - are editor-only and must be dropped in the
    // layout output. The 0.1.19 parser emitted all variants, over-reporting
    // by ~2x on pages that used personalization-only renderings.
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="main" s:ds="" s:par="">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default" />
            </ruleset>
          </rls>
        </r>
        <r uid="{B}" s:id="{22222222-2222-2222-2222-222222222222}" s:ph="main" s:ds="" s:par="">
          <rls>
            <ruleset>
              <rule uid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}" s:name="Audience A" />
            </ruleset>
          </rls>
        </r>
        <r uid="{C}" s:id="{33333333-3333-3333-3333-333333333333}" s:ph="main" s:ds="" s:par="">
          <rls>
            <ruleset>
              <rule uid="{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}" s:name="Audience B" />
              <rule uid="{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}" s:name="Audience C" />
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    // Only entry A (default rule present) survives. Entries B and C each
    // carry only non-default rules and are dropped.
    expect(result.map(e => e.uid)).toEqual(['a']);
  });

  it('keeps renderings whose <rls> contains both default and non-default rules (item 10)', () => {
    // A `<rls>` that mixes the default rule with audience variants still
    // evaluates the default rule first (TrueCondition) in Sitecore's
    // RunFirstMatching - the rendering is kept.
    const xml = `<r xmlns:s="s" xmlns:p="p" p:p="1">
      <d id="{${DEFAULT_DEVICE_ID}}">
        <r uid="{A}" s:id="{11111111-1111-1111-1111-111111111111}" s:ph="main" s:ds="" s:par="">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default" />
              <rule uid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}" s:name="Audience A" />
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;
    const result = parseRenderingXml(xml);
    expect(result.map(e => e.uid)).toEqual(['a']);
  });
});

describe('parseRenderingXml - default rule action extraction (0.4.0.9)', () => {
  // Parser captures `<rule uid="{00000000-...}">/<actions>/<action s:DataSource="...">`
  // into `entry.rules.defaultActionDataSource`. The personalization pass
  // (`applyDefaultRulePersonalization` in `personalization.ts`) consumes it.

  it('extracts default rule action datasource into rules field', () => {
    // Fixture pattern lifted from a real-world rendering XML.
    const xml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{E9D6F7FB-6C88-4E67-87F2-202A9228143E}"
           s:ds="{DB1987D3-1740-45E3-AD83-988DFF315677}"
           s:id="{9C6D53E3-FE57-4638-AF7B-6D68304C7A94}"
           s:ph="/headless-main/accordion-0-0-1">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default">
                <conditions>
                  <condition uid="199F1C05AEF74F1293180EA3E427EE5A" s:id="{4888ABBB-F17D-4485-B14B-842413F88732}" />
                </conditions>
                <actions>
                  <action uid="1C48B29A90CF4FD78EB49F326B544241"
                          s:id="{0F3C6BEC-E56B-4875-93D7-2846A75881D2}"
                          s:DataSource="{17B42AD7-A3F3-4F8D-A4EC-FA98FD57660C}" />
                </actions>
              </rule>
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].rules?.defaultActionDataSource).toBe('17b42ad7-a3f3-4f8d-a4ec-fa98fd57660c');
    // `dataSource` is the un-substituted authored value - the personalization
    // pass (applied downstream in `page-design.ts`) mutates this.
    expect(entries[0].dataSource).toBe('{DB1987D3-1740-45E3-AD83-988DFF315677}');
  });

  it('omits rules field when no <rls> block', () => {
    const xml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
           s:ds="{DEFAULT-DS}"
           s:id="{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}"
           s:ph="/foo" />
      </d>
    </r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].rules).toBeUndefined();
  });

  it('omits rules field when default rule has no action datasource', () => {
    const xml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}"
           s:ds="{DEFAULT-DS}"
           s:id="{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}"
           s:ph="/foo">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default" />
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].rules).toBeUndefined();
  });

  it('does not leak variant rule action into self-closing default rule (0.4.0.9 regex bug fix)', () => {
    // Regression guard: when the default rule is self-closing and a
    // sibling non-default variant has body with actions, a too-greedy
    // regex would capture the variant's `</rule>` as the default's
    // closing tag and mis-attribute the variant's action datasource to
    // the default. The regex's `[^/>]*>` tail excludes `/` so self-
    // closing forms don't match at all - the default correctly falls
    // through to `undefined`, and the personalization pass leaves
    // dataSource unchanged.
    const xml = `<r xmlns:s="http://www.sitecore.net/xmlconfig/" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r uid="{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}"
           s:ds="{DEFAULT-DS}"
           s:id="{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}"
           s:ph="/foo">
          <rls>
            <ruleset>
              <rule uid="{00000000-0000-0000-0000-000000000000}" s:name="Default" />
              <rule uid="{11111111-1111-1111-1111-111111111111}" s:name="Variant">
                <actions>
                  <action s:DataSource="{BBBB0000-0000-0000-0000-000000000000}" />
                </actions>
              </rule>
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    // Must NOT capture the variant's datasource - default is self-closing.
    expect(entries[0].rules).toBeUndefined();
  });
});

describe('parseRenderingXml - P3b HideRenderingAction detection', () => {
  it('flags rendering hidden when default rule contains HideRenderingAction', () => {
    const actionId = `{${HIDE_RENDERING_ACTION_ID.toUpperCase()}}`;
    const xml = `<r xmlns:s="s" xmlns:p="p"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{AABBCCDD-0000-0000-0000-000000000001}" s:id="{AA000001-0000-0000-0000-000000000001}" s:ph="main"><rls><ruleset><rule uid="{00000000-0000-0000-0000-000000000000}"><conditions /><actions><action id="${actionId}" /></actions></rule></ruleset></rls></r></d></r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].hidden).toBe(true);
  });

  it('does not flag hidden when default rule has only SetDataSource action', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{AABBCCDD-0000-0000-0000-000000000002}" s:id="{AA000001-0000-0000-0000-000000000002}" s:ph="main"><rls><ruleset><rule uid="{00000000-0000-0000-0000-000000000000}"><conditions /><actions><action s:DataSource="{DD000001-0000-0000-0000-000000000001}" /></actions></rule></ruleset></rls></r></d></r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].hidden).toBeUndefined();
    expect(entries[0].rules?.defaultActionDataSource).toBe('dd000001-0000-0000-0000-000000000001');
  });

  it('flags hidden when default rule has both Hide and SetDataSource (Hide wins)', () => {
    const actionId = `{${HIDE_RENDERING_ACTION_ID.toUpperCase()}}`;
    const xml = `<r xmlns:s="s" xmlns:p="p"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{AABBCCDD-0000-0000-0000-000000000003}" s:id="{AA000001-0000-0000-0000-000000000003}" s:ph="main"><rls><ruleset><rule uid="{00000000-0000-0000-0000-000000000000}"><conditions /><actions><action s:DataSource="{DD000001-0000-0000-0000-000000000002}" /><action id="${actionId}" /></actions></rule></ruleset></rls></r></d></r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].hidden).toBe(true);
  });

  it('does not flag hidden when <rls> is absent', () => {
    const xml = `<r xmlns:s="s" xmlns:p="p"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{AABBCCDD-0000-0000-0000-000000000004}" s:id="{AA000001-0000-0000-0000-000000000004}" s:ph="main" /></d></r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].hidden).toBeUndefined();
  });

  it('does not flag hidden when only variant rules have HideAction (no default rule)', () => {
    const actionId = `{${HIDE_RENDERING_ACTION_ID.toUpperCase()}}`;
    // Non-default rule uids - this body gets dropped by `hasDefaultOrEmptyRules`
    // so the entry won't surface at all. Confirm the drop still happens.
    const xml = `<r xmlns:s="s" xmlns:p="p"><d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}"><r uid="{AABBCCDD-0000-0000-0000-000000000005}" s:id="{AA000001-0000-0000-0000-000000000005}" s:ph="main"><rls><ruleset><rule uid="{11111111-0000-0000-0000-000000000001}"><conditions /><actions><action id="${actionId}" /></actions></rule></ruleset></rls></r></d></r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(0);
  });

  it('flags hidden for real-YAML namespaced s:id attribute on action (0.4.0.19)', () => {
    // Real-world accordion-0 child shape - HideRenderingAction identified by
    // `s:id="{25F351A1-...}"` (namespaced), not plain `id=`. The prior regex
    // required `\s` before `id=`; `:` in `s:id=` broke the match.
    const xml = `<r xmlns:s="s" xmlns:p="p">
      <d id="{FE5D7FDF-89C0-4D99-9AA3-B5FBD009C9F3}">
        <r
          uid="{C4A3BF11-8F01-4A68-BBF4-B136EB71C1E3}"
          s:id="{4D0982FB-065B-4FF7-B894-1C92EE8FF2FE}"
          s:ph="/headless-main/accordion-0">
          <rls>
            <ruleset>
              <rule
                uid="{00000000-0000-0000-0000-000000000000}"
                s:name="Default">
                <conditions>
                  <condition
                    uid="7443D21865474DF0A885C2755BDF7FBD"
                    s:id="{4888ABBB-F17D-4485-B14B-842413F88732}" />
                </conditions>
                <actions>
                  <action
                    uid="CFDA1E2C8FED461EBB9F12C87AF29629"
                    s:id="{25F351A1-712D-45F8-857D-8AD95BB2ACE9}" />
                </actions>
              </rule>
            </ruleset>
          </rls>
        </r>
      </d>
    </r>`;
    const entries = parseRenderingXml(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].hidden).toBe(true);
  });
});
