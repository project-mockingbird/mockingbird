import type { ResolvedEnvironment } from './types.js';

export const AUTH_TOKEN_URL = 'https://auth.sitecorecloud.io/oauth/token';
export const AUTH_AUDIENCE = 'https://api.sitecorecloud.io';
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface TokenProvider { getToken(force?: boolean): Promise<string>; }
export interface AuthDeps { fetch?: typeof globalThis.fetch; now?: () => number; }

export function createTokenProvider(env: ResolvedEnvironment, deps: AuthDeps = {}): TokenProvider {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => Date.now());
  let token: string | undefined;
  let expiresAtMs = 0;

  async function mint(): Promise<string> {
    const res = await doFetch(AUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: env.clientId,
        client_secret: env.clientSecret,
        audience: AUTH_AUDIENCE,
      }),
    });
    if (!res.ok) throw new Error(`SitecoreAI token request failed (${res.status}) for environment "${env.name}"`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error(`SitecoreAI token response missing access_token for "${env.name}"`);
    token = body.access_token;
    const ttlMs = (body.expires_in ?? 3600) * 1000;
    expiresAtMs = now() + ttlMs;
    return token;
  }

  return {
    async getToken(force = false): Promise<string> {
      if (!force && token && now() < expiresAtMs - REFRESH_SKEW_MS) return token;
      return mint();
    },
  };
}
