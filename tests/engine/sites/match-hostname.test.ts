import { describe, it, expect } from 'vitest';
import { matchesHostname } from '../../../src/engine/sites/request-resolver.js';

describe('matchesHostname', () => {
  it('returns true for the catch-all "*"', () => {
    expect(matchesHostname('any-host.test', '*')).toBe(true);
    expect(matchesHostname('', '*')).toBe(true);
  });

  it('returns false on empty hostname field', () => {
    expect(matchesHostname('site-a.test', '')).toBe(false);
  });

  it('matches exact hostname case-insensitively', () => {
    expect(matchesHostname('site-a.test', 'site-a.test')).toBe(true);
    expect(matchesHostname('SITE-A.TEST', 'site-a.test')).toBe(true);
    expect(matchesHostname('site-a.test', 'SITE-A.TEST')).toBe(true);
  });

  it('does not match different hostnames', () => {
    expect(matchesHostname('site-a.test', 'site-b.test')).toBe(false);
  });

  it('handles pipe-delimited list of exact hostnames', () => {
    expect(matchesHostname('site-a.test', 'site-a.test|site-b.test')).toBe(true);
    expect(matchesHostname('site-b.test', 'site-a.test|site-b.test')).toBe(true);
    expect(matchesHostname('other.test', 'site-a.test|site-b.test')).toBe(false);
  });

  it('trims whitespace around pipe entries', () => {
    expect(matchesHostname('site-a.test', '  site-a.test  |  site-b.test  ')).toBe(true);
    expect(matchesHostname('site-b.test', '  site-a.test  |  site-b.test  ')).toBe(true);
  });

  it('matches wildcard patterns', () => {
    expect(matchesHostname('foo.preview.test', '*.preview.test')).toBe(true);
    expect(matchesHostname('bar.preview.test', '*.preview.test')).toBe(true);
    expect(matchesHostname('preview.test', '*.preview.test')).toBe(false);
  });

  it('matches mixed exact + wildcard pipe list', () => {
    const hostField = 'site-b.test|*.preview.test';
    expect(matchesHostname('site-b.test', hostField)).toBe(true);
    expect(matchesHostname('foo.preview.test', hostField)).toBe(true);
    expect(matchesHostname('other.test', hostField)).toBe(false);
  });

  it('escapes regex specials in non-wildcard parts', () => {
    // Verify both branches: no-wildcard branch uses string equality; wildcard branch
    // must escape literal dots in the pattern (otherwise '.' would mean "any char").
    expect(matchesHostname('siteXa.test', 'site.a.test')).toBe(false);
    expect(matchesHostname('site.a.test', 'site.a.test')).toBe(true);
    // These go through wildcardToRegex; without dot-escaping, 'siteXatest' would match
    expect(matchesHostname('siteXa.test', '*.a.test')).toBe(false);
    expect(matchesHostname('site.a.test', '*.a.test')).toBe(true);
  });

  it('treats catch-all "*" inside pipe list as match-anything', () => {
    expect(matchesHostname('anything.test', 'site-a.test|*')).toBe(true);
  });
});
