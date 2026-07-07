import { describe, it, expect } from 'vitest';
import { normalizeString, graphqlTypeize, graphqlFieldize } from '../../../src/engine/schema/name-normalizer.js';

describe('NameNormalizer port', () => {
  it('splits on spaces only, PascalCases each word', () => {
    expect(normalizeString('Page Title')).toBe('PageTitle');
  });
  it('preserves underscores and interior casing', () => {
    expect(normalizeString('f_datePublished')).toBe('F_datePublished');
    expect(normalizeString('T_PeopleProfile')).toBe('T_PeopleProfile');
    expect(normalizeString('Demo Tag CSS Class')).toBe('DemoTagCSSClass');
  });
  it('strips a leading double underscore', () => {
    expect(normalizeString('__Standard Values')).toBe('StandardValues');
  });
  it('drops non-word chars inside a word, keeps underscore', () => {
    expect(normalizeString('Demo-Link_List')).toBe('DemoLink_List');
  });
  it('prefixes underscore when starting with a digit', () => {
    expect(normalizeString('2fa Enabled')).toBe('_2faEnabled');
  });
  it('typeize is PascalCase-first, fieldize is camelCase-first', () => {
    expect(graphqlTypeize('T_PeopleProfile')).toBe('T_PeopleProfile');
    expect(graphqlFieldize('f_datePublished')).toBe('f_datePublished');
    expect(graphqlFieldize('Page Title')).toBe('pageTitle');
  });
});
