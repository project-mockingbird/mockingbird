// @vitest-environment jsdom
// Regression tests for backlog #28 plus the broader "field-type routing must
// match Sitecore's case-insensitive lookup" fix.
//
// Sitecore Field-type definitions live under /sitecore/system/Field types/
// and are looked up case-insensitively. The OOTB content tree stores both modern
// (e.g. "Treelist", "Checkbox") and legacy (e.g. "tree list", "checkbox")
// spellings of the same field type. Routing in FieldEditor lowercases the
// field-type string before set/literal comparison so both spellings land on
// the same editor. Aliases that differ beyond casing (e.g. "tree list" vs
// "treelist") are listed explicitly in the routing sets.
//
// The Base Template field on the Standard template (item id
// 12c33f3f-86c5-43a5-aeb4-5598cec45116) is the most visible case:
// its Type field stores "tree list" (lowercase, with a space).
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { FieldEditor } from '../../../../src/web/components/detail/FieldEditor';
import { TreelistFieldEditor } from '../../../../src/web/components/detail/field-editors/TreelistFieldEditor';
import {
  parseNameValueListValue,
  serializeNameValueListValue,
  parseLookupNameLookupValueListValue,
  serializeLookupNameLookupValueListValue,
} from '../../../../src/web/components/detail/field-editors/NameValueListEditor';
import {
  canonicalMultiSelectValue,
  normalizeFieldType,
  parseTreelistValue,
} from '../../../../src/web/components/detail/field-editors/utils';

const GUID_A = '{11111111-1111-1111-1111-111111111111}';
const GUID_B = '{22222222-2222-2222-2222-222222222222}';
const GUID_C = '{33333333-3333-3333-3333-333333333333}';

vi.mock('../../../../src/web/hooks/useEngineStatus', () => ({
  useEngineReady: () => true,
}));

vi.mock('../../../../src/web/hooks/useValidation', () => ({
  useFieldTypes: () => ({ data: [] }),
}));

describe('normalizeFieldType', () => {
  it('lowercases mixed-case input', () => {
    expect(normalizeFieldType('Treelist')).toBe('treelist');
    expect(normalizeFieldType('CHECKBOX')).toBe('checkbox');
  });

  it('returns empty string for undefined input', () => {
    expect(normalizeFieldType(undefined)).toBe('');
  });

  it('preserves whitespace-bearing legacy aliases', () => {
    expect(normalizeFieldType('tree list')).toBe('tree list');
    expect(normalizeFieldType('Tree List')).toBe('tree list');
  });
});

describe('canonicalMultiSelectValue', () => {
  it('passes pipe-delimited GUID list through unchanged', () => {
    const v = `${GUID_A}|${GUID_B}|${GUID_C}`;
    expect(canonicalMultiSelectValue(v)).toBe(v);
  });

  it('rewrites newline-delimited GUID list to pipe form (block-scalar YAML shape)', () => {
    const v = `${GUID_A}\n${GUID_B}\n${GUID_C}`;
    expect(canonicalMultiSelectValue(v)).toBe(`${GUID_A}|${GUID_B}|${GUID_C}`);
  });

  it('returns single GUID unchanged', () => {
    expect(canonicalMultiSelectValue(GUID_A)).toBe(GUID_A);
  });

  it('returns plain text unchanged', () => {
    expect(canonicalMultiSelectValue('hello world')).toBe('hello world');
  });

  it('returns mixed (GUID + plain text) unchanged so we do not corrupt non-multi-select fields', () => {
    const v = `${GUID_A}\nnot-a-guid`;
    expect(canonicalMultiSelectValue(v)).toBe(v);
  });

  it('handles empty input', () => {
    expect(canonicalMultiSelectValue('')).toBe('');
  });
});

describe('parseTreelistValue (now splits on pipe OR newline)', () => {
  it('parses inline pipe form', () => {
    expect(parseTreelistValue(`${GUID_A}|${GUID_B}`)).toEqual([GUID_A, GUID_B]);
  });

  it('parses block-scalar newline form (regression for #28)', () => {
    expect(parseTreelistValue(`${GUID_A}\n${GUID_B}\n${GUID_C}`)).toEqual([GUID_A, GUID_B, GUID_C]);
  });
});

describe('FieldEditor case-insensitive routing (regression for #28 root cause)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }

  // Base Template's actual fieldType in the OOTB registry. Before this fix
  // it fell through to the generic <Input> which collapsed newlines and
  // produced `{a}{b}{c}` with no separators when the YAML used block-scalar
  // form. After the fix it routes through TreelistFieldEditor (raw view
  // shows the canonical pipe form).
  it('routes "tree list" (legacy lowercase) to the Treelist editor', () => {
    const value = `${GUID_A}\n${GUID_B}\n${GUID_C}`;
    render(
      <FieldEditor
        fieldId="12c33f3f-86c5-43a5-aeb4-5598cec45116"
        hint="__Base template"
        value={value}
        fieldType="tree list"
        viewMode="raw"
        editing={false}
        onChange={() => {}}
      />,
      { wrapper },
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.tagName.toLowerCase()).toBe('textarea');
    expect(ta.value).toBe(`${GUID_A}|${GUID_B}|${GUID_C}`);
  });

  it('routes "TREELIST" (upper) and "Treelist" (canonical) to the same editor', () => {
    for (const ft of ['TREELIST', 'Treelist']) {
      qc.clear();
      const { unmount } = render(
        <FieldEditor
          fieldId="00000000-0000-0000-0000-000000000001"
          hint="X"
          value={`${GUID_A}|${GUID_B}`}
          fieldType={ft}
          viewMode="raw"
          editing={false}
          onChange={() => {}}
        />,
        { wrapper },
      );
      const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(ta.tagName.toLowerCase()).toBe('textarea');
      unmount();
    }
  });

  it('routes "checkbox" (legacy lowercase) to the Checkbox control', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000002"
        hint="Active"
        value="1"
        fieldType="checkbox"
        editing={false}
        onChange={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('routes "rich text" (legacy lowercase) to a multi-line textarea', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000003"
        hint="Body"
        value="<p>hi</p>"
        fieldType="rich text"
        editing={false}
        onChange={() => {}}
      />,
      { wrapper },
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.tagName.toLowerCase()).toBe('textarea');
  });

  // SXA introduces "Multiroot Treelist" (and the hyphenated variant in some
  // template builds). Both should route through the Treelist editor.
  it('routes "Multiroot Treelist" (SXA variant) to the Treelist editor', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000004"
        hint="Allowed roots"
        value={`${GUID_A}|${GUID_B}`}
        fieldType="Multiroot Treelist"
        viewMode="raw"
        editing={false}
        onChange={() => {}}
      />,
      { wrapper },
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.tagName.toLowerCase()).toBe('textarea');
  });
});

// Password fields store cleartext in Sitecore (not hashed - they're
// round-trippable), so the security concern is shoulder-surfing. The
// browser's native type="password" handles masking + autocomplete-off.
describe('FieldEditor Password routing (backlog #35)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }

  it('renders a masked input for fieldType="Password" in normal view', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000010"
        hint="API Key"
        value="hunter2"
        fieldType="Password"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    // type="password" inputs have no role; query by display value.
    const input = screen.getByDisplayValue('hunter2') as HTMLInputElement;
    expect(input.tagName.toLowerCase()).toBe('input');
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('off');
  });

  it('routes "password" (legacy lowercase) to the same masked input', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000011"
        hint="Secret"
        value="abc"
        fieldType="password"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    const input = screen.getByDisplayValue('abc') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('unmasks the value in raw view so editors can verify the on-disk content', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000012"
        hint="API Key"
        value="hunter2"
        fieldType="Password"
        viewMode="raw"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    const input = screen.getByDisplayValue('hunter2') as HTMLInputElement;
    expect(input.type).toBe('text');
  });
});

// Sitecore's NameValueListField wire format: pairs separated by `&`,
// each pair is `<HttpUtility.UrlEncode(key)>=<HttpUtility.UrlEncode(value)>`,
// spaces encode as `+`. Representative shapes:
// `IsRenderingsWithDynamicPlaceholders=true&IsAutoDatasourceRendering=true`
// (SXA Extended Options OtherProperties on rendering items) and
// `<lang>=<pos>` (Multisite Site Settings POS).
describe('parseNameValueListValue / serializeNameValueListValue', () => {
  it('parses a simple ampersand-delimited pair list', () => {
    expect(parseNameValueListValue('a=1&b=2')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });

  it('decodes `+` as space (HttpUtility.UrlEncode form)', () => {
    expect(parseNameValueListValue('first+name=John+Doe')).toEqual([
      { key: 'first name', value: 'John Doe' },
    ]);
  });

  it('decodes percent-encoded characters', () => {
    expect(parseNameValueListValue('key=a%26b')).toEqual([{ key: 'key', value: 'a&b' }]);
  });

  it('handles a value-less key (no `=`)', () => {
    expect(parseNameValueListValue('flag')).toEqual([{ key: 'flag', value: '' }]);
  });

  it('returns empty array on empty input', () => {
    expect(parseNameValueListValue('')).toEqual([]);
  });

  it('serializes pairs back to ampersand-delimited form', () => {
    expect(serializeNameValueListValue([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ])).toBe('a=1&b=2');
  });

  it('encodes spaces as `+` (matches HttpUtility.UrlEncode)', () => {
    expect(serializeNameValueListValue([
      { key: 'first name', value: 'John Doe' },
    ])).toBe('first+name=John+Doe');
  });

  it('percent-encodes special characters in values', () => {
    expect(serializeNameValueListValue([{ key: 'key', value: 'a&b' }])).toBe('key=a%26b');
  });

  it('drops pairs with empty keys (in-progress edit rows)', () => {
    expect(serializeNameValueListValue([
      { key: 'a', value: '1' },
      { key: '', value: 'orphan' },
      { key: 'b', value: '2' },
    ])).toBe('a=1&b=2');
  });

  it('round-trips a real content tree value', () => {
    const wire = 'IsRenderingsWithDynamicPlaceholders=true&IsAutoDatasourceRendering=true';
    const parsed = parseNameValueListValue(wire);
    expect(parsed).toEqual([
      { key: 'IsRenderingsWithDynamicPlaceholders', value: 'true' },
      { key: 'IsAutoDatasourceRendering', value: 'true' },
    ]);
    expect(serializeNameValueListValue(parsed)).toBe(wire);
  });
});

describe('FieldEditor NameValueList routing (backlog #34)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }

  it('routes "Name Value List" to a 2-column row editor with one row per pair', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000020"
        hint="OtherProperties"
        value="a=1&b=2"
        fieldType="Name Value List"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByDisplayValue('a')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('b')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add row/i })).toBeInTheDocument();
  });

  it('routes "name value list" (lowercase) the same way', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000021"
        hint="POS"
        value="en=foo"
        fieldType="name value list"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByDisplayValue('en')).toBeInTheDocument();
    expect(screen.getByDisplayValue('foo')).toBeInTheDocument();
  });

  it('emits the serialised wire form when a row is removed', async () => {
    const calls: string[] = [];
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000022"
        hint="OtherProperties"
        value="a=1&b=2"
        fieldType="Name Value List"
        editing={true}
        onChange={(v) => calls.push(v)}
      />,
      { wrapper },
    );
    const removeButtons = screen.getAllByRole('button', { name: /remove row/i });
    expect(removeButtons).toHaveLength(2);
    removeButtons[0].click();
    expect(calls.at(-1)).toBe('b=2');
  });

  it('shows an empty-state hint when value is empty', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000023"
        hint="POS"
        value=""
        fieldType="Name Value List"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  it('shows raw value as a single Input in raw view', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000024"
        hint="OtherProperties"
        value="a=1&b=2"
        fieldType="Name Value List"
        viewMode="raw"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    const input = screen.getByDisplayValue('a=1&b=2') as HTMLInputElement;
    expect(input.tagName.toLowerCase()).toBe('input');
  });

  // NameLookupValueList: with no fieldSource (the content tree has 0 actual
  // usages and the OOTB declaration's source resolution is non-trivial)
  // the value column falls back to a raw GUID input.
  it('routes "Name Lookup Value List" with empty source to a raw-input fallback in the value column', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000025"
        hint="MWidths"
        value="320={11111111-1111-1111-1111-111111111111}"
        fieldType="Name Lookup Value List"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByDisplayValue('320')).toBeInTheDocument();
    expect(screen.getByDisplayValue('{11111111-1111-1111-1111-111111111111}')).toBeInTheDocument();
  });
});

// SXA TemplatesMapping wire format. Asymmetric double-URL-encoding:
// keys encoded once, values encoded twice. Verified against a
// real-world value on a /sitecore/content/<tenant>/<site>/Presentation/
// Page Designs item.
describe('parseLookupNameLookupValueListValue / serializeLookupNameLookupValueListValue', () => {
  const TID = '{5F486933-4FCC-425C-9DAA-F293B9020E4E}';
  const DID = '{C1804445-7226-49CF-A3DC-172FB372EE6D}';

  it('round-trips a single template-to-design pair', () => {
    const pairs = [{ key: TID, value: DID }];
    const wire = serializeLookupNameLookupValueListValue(pairs);
    expect(parseLookupNameLookupValueListValue(wire)).toEqual(pairs);
  });

  it('round-trips multiple pairs', () => {
    const TID2 = '{46AC8888-1111-2222-3333-444455556666}';
    const DID2 = '{99998888-7777-6666-5555-444433332222}';
    const pairs = [{ key: TID, value: DID }, { key: TID2, value: DID2 }];
    const wire = serializeLookupNameLookupValueListValue(pairs);
    expect(parseLookupNameLookupValueListValue(wire)).toEqual(pairs);
  });

  it('encodes the value side once more than the key side (asymmetric)', () => {
    const wire = serializeLookupNameLookupValueListValue([{ key: TID, value: DID }]);
    // Outer-encoded view: key braces are %7B, value braces are %257B
    // (encoded twice). After ONE decode pass, we should see the inner
    // form where key is raw `{...}` and value is `%7B...%7D`.
    const inner = decodeURIComponent(wire);
    expect(inner.startsWith(TID + '=')).toBe(true);
    const valueHalf = inner.slice(TID.length + 1);
    expect(valueHalf).toMatch(/^%7B[0-9A-F-]+%7D$/i);
  });

  it('parses a fixture matching the user-visible Sitecore CM stored shape', () => {
    // Build a stored value the same way Sitecore would: inner URL-encode
    // the design-id only, then outer URL-encode the whole pair list.
    const inner = `${TID}=${encodeURIComponent(DID)}`;
    const wire = encodeURIComponent(inner);
    const parsed = parseLookupNameLookupValueListValue(wire);
    expect(parsed).toEqual([{ key: TID, value: DID }]);
  });

  it('decodes a value with multiple pairs separated by encoded ampersand', () => {
    const TID2 = '{AAAAAAAA-1111-2222-3333-444444444444}';
    const DID2 = '{BBBBBBBB-1111-2222-3333-444444444444}';
    const inner = `${TID}=${encodeURIComponent(DID)}&${TID2}=${encodeURIComponent(DID2)}`;
    const wire = encodeURIComponent(inner);
    expect(parseLookupNameLookupValueListValue(wire)).toEqual([
      { key: TID, value: DID },
      { key: TID2, value: DID2 },
    ]);
  });

  it('drops pairs with empty keys when serialising', () => {
    const wire = serializeLookupNameLookupValueListValue([
      { key: TID, value: DID },
      { key: '', value: 'orphan' },
    ]);
    expect(parseLookupNameLookupValueListValue(wire)).toEqual([{ key: TID, value: DID }]);
  });
});

describe('FieldEditor LookupNameLookupValueList routing (backlog #5)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }

  it('routes "Lookup Name Lookup Value List" to a 2-column editor with raw-GUID fallbacks (no Source)', () => {
    const TID = '{5F486933-4FCC-425C-9DAA-F293B9020E4E}';
    const DID = '{C1804445-7226-49CF-A3DC-172FB372EE6D}';
    const inner = `${TID}=${encodeURIComponent(DID)}`;
    const wire = encodeURIComponent(inner);
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000030"
        hint="TemplatesMapping"
        value={wire}
        fieldType="Lookup Name Lookup Value List"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    // Source is empty (no live engine here) - both columns should fall
    // back to raw GUID inputs and display the parsed values.
    expect(screen.getByDisplayValue(TID)).toBeInTheDocument();
    expect(screen.getByDisplayValue(DID)).toBeInTheDocument();
  });

  it('routes the legacy lower-case spelling identically', () => {
    render(
      <FieldEditor
        fieldId="00000000-0000-0000-0000-000000000031"
        hint="TemplatesMapping"
        value=""
        fieldType="lookup name lookup value list"
        editing={true}
        onChange={() => {}}
      />,
      { wrapper },
    );
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add row/i })).toBeInTheDocument();
  });
});

describe('TreelistFieldEditor raw view (block-scalar YAML)', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }

  it('renders inline pipe-delimited value verbatim', () => {
    const value = `${GUID_A}|${GUID_B}|${GUID_C}`;
    render(
      <TreelistFieldEditor
        fieldId="abcd1234-1111-2222-3333-444455556666"
        label="Test"
        value={value}
        fieldSource=""
        editing={false}
        viewMode="raw"
        onChange={() => {}}
      />,
      { wrapper },
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe(value);
  });

  it('normalizes newline-delimited value to pipe form (block-scalar YAML)', () => {
    const value = `${GUID_A}\n${GUID_B}\n${GUID_C}`;
    render(
      <TreelistFieldEditor
        fieldId="abcd1234-1111-2222-3333-444455556666"
        label="Test"
        value={value}
        fieldSource=""
        editing={false}
        viewMode="raw"
        onChange={() => {}}
      />,
      { wrapper },
    );
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe(`${GUID_A}|${GUID_B}|${GUID_C}`);
  });
});
