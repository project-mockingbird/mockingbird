import { describe, it, expect, vi } from 'vitest';
import { createTokenProvider } from '../../../src/engine/sitecoreai/auth.js';
import type { ResolvedEnvironment } from '../../../src/engine/sitecoreai/types.js';

const env: ResolvedEnvironment = { id: 'e1', name: 'A', cmHost: 'h', clientId: 'cid', clientSecret: 'shh' };

function fakeFetch(token: string, expiresIn = 86400) {
  return vi.fn(async () => new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }), { status: 200 }));
}

describe('token provider', () => {
  it('mints then caches (one network call for two getToken calls)', async () => {
    const fetch = fakeFetch('tok-1');
    let t = 1_000_000;
    const p = createTokenProvider(env, { fetch: fetch as unknown as typeof globalThis.fetch, now: () => t });
    expect(await p.getToken()).toBe('tok-1');
    expect(await p.getToken()).toBe('tok-1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes after expiry (minus skew)', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-2', expires_in: 3600 }), { status: 200 }));
    let t = 0;
    const p = createTokenProvider(env, { fetch: fetch as unknown as typeof globalThis.fetch, now: () => t });
    expect(await p.getToken()).toBe('tok-1');
    t = 3_600_000; // advance an hour -> past (expiry - skew)
    expect(await p.getToken()).toBe('tok-2');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('force re-mints even within the cache window', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 86400 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-2', expires_in: 86400 }), { status: 200 }));
    const p = createTokenProvider(env, { fetch: fetch as unknown as typeof globalThis.fetch, now: () => 0 });
    expect(await p.getToken()).toBe('tok-1');
    expect(await p.getToken(true)).toBe('tok-2');
  });

  it('throws a clear error on a non-200 token response', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 401 }));
    const p = createTokenProvider(env, { fetch: fetch as unknown as typeof globalThis.fetch, now: () => 0 });
    await expect(p.getToken()).rejects.toThrow(/token request failed.*401/i);
  });
});
