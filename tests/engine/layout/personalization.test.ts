import { describe, it, expect } from 'vitest';
import { applyDefaultRulePersonalization } from '../../../src/engine/layout/personalization.js';
import type { RenderingEntry } from '../../../src/engine/layout/types.js';

describe('applyDefaultRulePersonalization (0.4.0.9)', () => {
  // Port of Sitecore's `InsertRenderings.Personalization` processor.
  // Mutates `RenderingEntry.dataSource` in place when a default-uid rule
  // has an action datasource.

  it('substitutes dataSource when default rule action is present', () => {
    const entry: RenderingEntry = {
      uid: 'e9d6f7fb-6c88-4e67-87f2-202a9228143e',
      renderingId: '9c6d53e3-fe57-4638-af7b-6d68304c7a94',
      placeholder: '/headless-main/accordion-0-0-1',
      dataSource: '{DB1987D3-1740-45E3-AD83-988DFF315677}',
      params: {},
      rules: { defaultActionDataSource: '17b42ad7-a3f3-4f8d-a4ec-fa98fd57660c' },
    };
    applyDefaultRulePersonalization([entry]);
    expect(entry.dataSource).toBe('17b42ad7-a3f3-4f8d-a4ec-fa98fd57660c');
  });

  it('leaves dataSource unchanged when no rules present', () => {
    const entry: RenderingEntry = {
      uid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      renderingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      placeholder: '/foo',
      dataSource: '{DEFAULT-DS}',
      params: {},
    };
    applyDefaultRulePersonalization([entry]);
    expect(entry.dataSource).toBe('{DEFAULT-DS}');
  });

  it('leaves dataSource unchanged when rules present but no action datasource', () => {
    const entry: RenderingEntry = {
      uid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      renderingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      placeholder: '/foo',
      dataSource: '{DEFAULT-DS}',
      params: {},
      rules: {},
    };
    applyDefaultRulePersonalization([entry]);
    expect(entry.dataSource).toBe('{DEFAULT-DS}');
  });

  it('mutates in place (returns void, original array reference unchanged)', () => {
    const entries: RenderingEntry[] = [{
      uid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      renderingId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      placeholder: '/foo',
      dataSource: 'default',
      params: {},
      rules: { defaultActionDataSource: 'substituted' },
    }];
    const result = applyDefaultRulePersonalization(entries);
    expect(result).toBeUndefined();
    expect(entries[0].dataSource).toBe('substituted');
  });
});
