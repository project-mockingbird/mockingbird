import { describe, it, expect, vi } from 'vitest';
import { createSitecoreAiClient, authoringUrl, managementUrl } from '../../../src/engine/sitecoreai/client.js';
import type { ResolvedEnvironment, ItemCommand } from '../../../src/engine/sitecoreai/types.js';

const env: ResolvedEnvironment = { id: 'e1', name: 'A', cmHost: 'acme.example', clientId: 'c', clientSecret: 's' };
const tokenProvider = { getToken: vi.fn(async () => 'tok') };
function gql(data: unknown, status = 200) { return new Response(JSON.stringify({ data }), { status }); }

it('builds the two endpoint URLs from cmHost', () => {
  expect(authoringUrl('acme.example')).toBe('https://acme.example/sitecore/api/authoring/graphql/v1');
  expect(managementUrl('acme.example')).toBe('https://acme.example/sitecore/api/management');
});

it('itemExists is true when the authoring item query returns a node', async () => {
  const fetch = vi.fn(async () => gql({ item: { itemId: 'abc' } }));
  const c = createSitecoreAiClient(env, { fetch: fetch as unknown as typeof globalThis.fetch, tokenProvider });
  expect(await c.itemExists('abc')).toBe(true);
});

it('itemExists is false when the authoring item query returns null', async () => {
  const fetch = vi.fn(async () => gql({ item: null }));
  const c = createSitecoreAiClient(env, { fetch: fetch as unknown as typeof globalThis.fetch, tokenProvider });
  expect(await c.itemExists('abc')).toBe(false);
});

it('executeSerializationCommands treats an empty array as success', async () => {
  const fetch = vi.fn(async () => gql({ executeSerializationCommands: [] }));
  const c = createSitecoreAiClient(env, { fetch: fetch as unknown as typeof globalThis.fetch, tokenProvider });
  const cmd: ItemCommand = { itemID: 'i', parentID: 'p', database: 'master', command: 'CREATE', data: '{}' };
  const r = await c.executeSerializationCommands([cmd]);
  expect(r.ok).toBe(true);
  expect(r.errors).toEqual([]);
});

it('executeSerializationCommands surfaces GraphQL top-level errors as failure', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'boom' }] }), { status: 200 }));
  const c = createSitecoreAiClient(env, { fetch: fetch as unknown as typeof globalThis.fetch, tokenProvider });
  const cmd: ItemCommand = { itemID: 'i', parentID: 'p', database: 'master', command: 'CREATE', data: '{}' };
  const r = await c.executeSerializationCommands([cmd]);
  expect(r.ok).toBe(false);
  expect(r.errors).toContain('boom');
});

it('re-mints the token once and retries on a 401, then succeeds', async () => {
  const tp = { getToken: vi.fn().mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh') };
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
    .mockResolvedValueOnce(gql({ executeSerializationCommands: [] }));
  const c = createSitecoreAiClient(env, { fetch: fetch as unknown as typeof globalThis.fetch, tokenProvider: tp });
  const cmd: ItemCommand = { itemID: 'i', parentID: 'p', database: 'master', command: 'CREATE', data: '{}' };
  const r = await c.executeSerializationCommands([cmd]);
  expect(r.ok).toBe(true);
  expect(tp.getToken).toHaveBeenCalledWith(true); // forced re-mint on retry
  expect(fetch).toHaveBeenCalledTimes(2);
});
