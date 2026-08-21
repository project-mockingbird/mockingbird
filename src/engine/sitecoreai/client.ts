import type { ItemCommand, ItemSnapshot, ResolvedEnvironment, SnapshotField } from './types.js';
import { createTokenProvider, type AuthDeps, type TokenProvider } from './auth.js';

export interface ExecResult { ok: boolean; errors: string[]; messages: string[]; }
export interface SitecoreAiClient {
  itemExists(itemId: string): Promise<boolean>;
  templateExists(templateId: string): Promise<boolean>;
  readItem(itemPath: string): Promise<ItemSnapshot | null>;
  executeSerializationCommands(commands: ItemCommand[]): Promise<ExecResult>;
}
export interface ClientDeps extends AuthDeps { tokenProvider?: TokenProvider; }

export const authoringUrl = (cmHost: string) => `https://${cmHost}/sitecore/api/authoring/graphql/v1`;
export const managementUrl = (cmHost: string) => `https://${cmHost}/sitecore/api/management`;

const ITEM_QUERY = `query($id: ID!) { item(where: { itemId: $id, database: "master" }) { itemId } }`;
const EXEC_MUTATION = `mutation($commands: [ItemCommand!]!, $logLevel: SerializationResultLogLevel) {
  executeSerializationCommands(commands: $commands, minimumLogLevel: $logLevel) {
    name
    success
    messages { logLevel message eventID { id name } }
  }
}`;

// Management API serialize read. SINGLE_ITEM scope; enum inline (not a variable). Do NOT pass
// excludedFieldIds - it trips server-side CLI-version header checks (SMS 5.2.125+).
const serializeQuery = (path: string) =>
  `{ serialize(path: ${JSON.stringify(path)}, database: "master", scope: SINGLE_ITEM) { data } }`;

type GqlError = { message: string; path?: (string | number)[]; extensions?: Record<string, unknown> };

function formatGqlErrors(errors: GqlError[]): string {
  return errors
    .map((e) => {
      const parts = [e.message];
      if (e.path?.length) parts.push(`path=${e.path.join('.')}`);
      const ext = e.extensions?.message ?? e.extensions?.code;
      if (typeof ext === 'string' && ext) parts.push(`detail=${ext}`);
      return parts.join(' ');
    })
    .join('; ');
}

function mapSerializedItem(raw: unknown): ItemSnapshot | null {
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, any> | null;
  if (!data || !data.id) return null;
  const mapFields = (fs: any[] = []): SnapshotField[] =>
    (fs ?? []).map((f) => ({ fieldId: f.fieldId, value: f.value ?? '', ...(f.blobId ? { blobId: f.blobId } : {}) }));
  return {
    id: data.id,
    templateId: data.templateId ?? '',
    sharedFields: mapFields(data.sharedFields),
    unversionedFields: (data.unversionedFields ?? []).map((u: any) => ({ language: u.language, fields: mapFields(u.fields) })),
    versions: (data.versions ?? []).map((v: any) => ({ language: v.language, version: v.versionNumber, fields: mapFields(v.fields) })),
  };
}

export function createSitecoreAiClient(env: ResolvedEnvironment, deps: ClientDeps = {}): SitecoreAiClient {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const tokenProvider = deps.tokenProvider ?? createTokenProvider(env, deps);

  // One retry on 401: force a fresh token and re-issue the same request.
  async function post(url: string, body: unknown): Promise<{ data?: any; errors?: GqlError[] }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await tokenProvider.getToken(attempt === 1);
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.status === 401 && attempt === 0) continue;
      if (!res.ok) throw new Error(`SitecoreAI request to ${url} failed (${res.status})`);
      return (await res.json()) as { data?: any; errors?: GqlError[] };
    }
    throw new Error(`SitecoreAI request to ${url} failed after token re-mint (401)`);
  }

  async function existsByQuery(id: string): Promise<boolean> {
    const json = await post(authoringUrl(env.cmHost), { query: ITEM_QUERY, variables: { id } });
    if (json.errors?.length) throw new Error(formatGqlErrors(json.errors));
    return !!json.data?.item;
  }

  return {
    itemExists: existsByQuery,
    templateExists: existsByQuery, // a template is just an item; same probe by GUID
    async readItem(itemPath: string): Promise<ItemSnapshot | null> {
      const json = await post(managementUrl(env.cmHost), { query: serializeQuery(itemPath) });
      if (json.errors?.length && !(json.data?.serialize?.length)) throw new Error(formatGqlErrors(json.errors));
      const rows = (json.data?.serialize ?? []) as { data?: unknown }[];
      const first = rows[0];
      if (!first) return null;
      return mapSerializedItem(first.data ?? first);
    },
    async executeSerializationCommands(commands: ItemCommand[]): Promise<ExecResult> {
      const json = await post(managementUrl(env.cmHost), { query: EXEC_MUTATION, variables: { commands, logLevel: 'INFORMATION' } });
      if (json.errors?.length) return { ok: false, errors: [formatGqlErrors(json.errors)], messages: [] };
      const results = (json.data?.executeSerializationCommands ?? []) as { name?: string; success?: boolean; messages?: { logLevel?: string; message?: string }[] }[];
      const messages = results.flatMap((r) => (r.messages ?? []).map((m) => m.message ?? ''));

      // Check if any result has success === false
      const failedResults = results.filter((r) => r.success === false);
      if (failedResults.length > 0) {
        const errors = failedResults.flatMap((r) =>
          (r.messages ?? []).length > 0
            ? (r.messages ?? []).map((m) => m.message ?? 'command failed')
            : ['command failed']
        );
        return { ok: false, errors, messages };
      }

      return { ok: true, errors: [], messages }; // empty array == success (no messages at minimumLogLevel)
    },
  };
}
