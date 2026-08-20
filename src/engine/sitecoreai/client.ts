import type { ItemCommand, ResolvedEnvironment } from './types.js';
import { createTokenProvider, type AuthDeps, type TokenProvider } from './auth.js';

export interface ExecResult { ok: boolean; errors: string[]; messages: string[]; }
export interface SitecoreAiClient {
  itemExists(itemId: string): Promise<boolean>;
  templateExists(templateId: string): Promise<boolean>;
  executeSerializationCommands(commands: ItemCommand[]): Promise<ExecResult>;
}
export interface ClientDeps extends AuthDeps { tokenProvider?: TokenProvider; }

export const authoringUrl = (cmHost: string) => `https://${cmHost}/sitecore/api/authoring/graphql/v1`;
export const managementUrl = (cmHost: string) => `https://${cmHost}/sitecore/api/management`;

const ITEM_QUERY = `query($id: ID!) { item(where: { itemId: $id, database: "master" }) { itemId } }`;
// Kept minimal to what our ok/failure logic needs. `minimumLogLevel` (enum
// SerializationResultLogLevel) and the result `messages` subfields are omitted:
// live SitecoreAI rejected the guessed `WARN` value and the `messages { text }`
// selection, and we only rely on per-command `success`.
const EXEC_MUTATION = `mutation($commands: [ItemCommand!]!) {
  executeSerializationCommands(commands: $commands) { name success }
}`;

export function createSitecoreAiClient(env: ResolvedEnvironment, deps: ClientDeps = {}): SitecoreAiClient {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const tokenProvider = deps.tokenProvider ?? createTokenProvider(env, deps);

  // One retry on 401: force a fresh token and re-issue the same request.
  async function post(url: string, body: unknown): Promise<{ data?: any; errors?: { message: string }[] }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await tokenProvider.getToken(attempt === 1);
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.status === 401 && attempt === 0) continue;
      if (!res.ok) throw new Error(`SitecoreAI request to ${url} failed (${res.status})`);
      return (await res.json()) as { data?: any; errors?: { message: string }[] };
    }
    throw new Error(`SitecoreAI request to ${url} failed after token re-mint (401)`);
  }

  async function existsByQuery(id: string): Promise<boolean> {
    const json = await post(authoringUrl(env.cmHost), { query: ITEM_QUERY, variables: { id } });
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    return !!json.data?.item;
  }

  return {
    itemExists: existsByQuery,
    templateExists: existsByQuery, // a template is just an item; same probe by GUID
    async executeSerializationCommands(commands: ItemCommand[]): Promise<ExecResult> {
      const json = await post(managementUrl(env.cmHost), { query: EXEC_MUTATION, variables: { commands } });
      if (json.errors?.length) return { ok: false, errors: json.errors.map((e) => e.message), messages: [] };
      const results = (json.data?.executeSerializationCommands ?? []) as { name?: string; success?: boolean; messages?: { text: string }[] }[];
      const messages = results.flatMap((r) => (r.messages ?? []).map((m) => m.text));

      // Check if any result has success === false
      const failedResults = results.filter((r) => r.success === false);
      if (failedResults.length > 0) {
        const errors = failedResults.flatMap((r) =>
          (r.messages ?? []).length > 0
            ? (r.messages ?? []).map((m) => m.text)
            : ['command failed']
        );
        return { ok: false, errors, messages };
      }

      return { ok: true, errors: [], messages }; // empty array == success (no messages at minimumLogLevel)
    },
  };
}
