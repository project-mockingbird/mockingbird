import { describe, it, expect } from 'vitest';
import { shouldSkipSignatureVerify } from '../../src/engine/index-cache.js';

describe('shouldSkipSignatureVerify', () => {
  const NOW = 1_700_000_000_000;

  it('skips verify when cache is fresher than the default 30s threshold', () => {
    expect(shouldSkipSignatureVerify(NOW - 5_000, NOW, {})).toBe(true);
    expect(shouldSkipSignatureVerify(NOW - 29_900, NOW, {})).toBe(true);
  });

  it('runs verify when cache is older than the default threshold', () => {
    expect(shouldSkipSignatureVerify(NOW - 30_001, NOW, {})).toBe(false);
    expect(shouldSkipSignatureVerify(NOW - 60_000, NOW, {})).toBe(false);
  });

  it('respects MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS override', () => {
    const env = { MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS: '60' };
    expect(shouldSkipSignatureVerify(NOW - 45_000, NOW, env)).toBe(true);
    expect(shouldSkipSignatureVerify(NOW - 75_000, NOW, env)).toBe(false);
  });

  it('skip threshold of 0 forces verify (legacy behavior)', () => {
    const env = { MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS: '0' };
    expect(shouldSkipSignatureVerify(NOW - 1_000, NOW, env)).toBe(false);
    expect(shouldSkipSignatureVerify(NOW - 100_000, NOW, env)).toBe(false);
  });

  it('negative threshold forces verify (defensive)', () => {
    const env = { MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS: '-1' };
    expect(shouldSkipSignatureVerify(NOW - 1_000, NOW, env)).toBe(false);
  });

  it('non-numeric threshold falls back to verify (fail-safe)', () => {
    const env = { MOCKINGBIRD_CACHE_VERIFY_SKIP_SECONDS: 'abc' };
    expect(shouldSkipSignatureVerify(NOW - 1_000, NOW, env)).toBe(false);
  });

  it('cache mtime in the future (clock skew) does not skip', () => {
    // (now - mtime) is negative, < threshold * 1000 numerically, but
    // future-stamped cache is suspicious. Treat as "do not skip" since
    // negative deltas mean the writer's clock disagrees with ours.
    expect(shouldSkipSignatureVerify(NOW + 5_000, NOW, {})).toBe(false);
  });
});
