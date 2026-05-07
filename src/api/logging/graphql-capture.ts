import type { FastifyInstance, FastifyRequest } from 'fastify';
import { parse as parseGraphql } from 'graphql';
import { graphqlLogBuffer, GRAPHQL_BODY_CAP, type GraphqlLogEntry } from './buffers.js';

export const GRAPHQL_CAPTURE_PATHS = ['/api/graphql', '/sitecore/api/graph/edge'] as const;

interface PendingCapture {
  startedAt: number;
  request: { query: string; variables: unknown; truncated: boolean } | null;
  operationName: string | null;
  operationType: GraphqlLogEntry['operationType'];
  captureError?: string;
}

function truncate(s: string, cap: number): { value: string; truncated: boolean } {
  if (s.length <= cap) return { value: s, truncated: false };
  // Slice in code-unit space; UTF-16 surrogate pair could be split, but
  // the pretty-printer downstream tolerates replacement chars and pino
  // / EventSource don't choke on them. Cheap-and-correct beats perfect.
  return { value: s.slice(0, cap), truncated: true };
}

function detectOperationType(query: string): GraphqlLogEntry['operationType'] {
  try {
    const doc = parseGraphql(query);
    for (const def of doc.definitions) {
      if (def.kind === 'OperationDefinition') return def.operation;
    }
    return null;
  } catch {
    return null;
  }
}

function pathMatches(req: FastifyRequest): boolean {
  const routePath = req.routeOptions?.url;
  if (routePath && (GRAPHQL_CAPTURE_PATHS as readonly string[]).includes(routePath)) {
    return true;
  }
  const urlPath = req.url.split('?')[0];
  return (GRAPHQL_CAPTURE_PATHS as readonly string[]).includes(urlPath);
}

function captureVariables(input: unknown, cap: number): { variables: unknown; truncated: boolean } {
  if (input === null || input === undefined) return { variables: null, truncated: false };
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { variables: { __mockingbirdTruncated: true, reason: 'not-serializable' }, truncated: true };
  }
  if (serialized.length <= cap) return { variables: input, truncated: false };
  return {
    variables: { __mockingbirdTruncated: true, originalSize: serialized.length },
    truncated: true,
  };
}

const PENDING = new WeakMap<FastifyRequest, PendingCapture>();

export async function registerGraphqlCapture(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    if (!pathMatches(req)) return;
    const pending: PendingCapture = {
      startedAt: Date.now(),
      request: null,
      operationName: null,
      operationType: null,
    };
    try {
      const body = req.body as { query?: string; variables?: unknown; operationName?: string } | undefined;
      if (!body || typeof body !== 'object') {
        pending.captureError = 'non-json body';
      } else {
        const queryRaw = typeof body.query === 'string' ? body.query : '';
        const queryT = truncate(queryRaw, GRAPHQL_BODY_CAP);
        const varsT = captureVariables(body.variables, GRAPHQL_BODY_CAP);
        pending.request = {
          query: queryT.value,
          variables: varsT.variables,
          truncated: queryT.truncated || varsT.truncated,
        };
        pending.operationName = typeof body.operationName === 'string' ? body.operationName : null;
        pending.operationType = detectOperationType(queryRaw);
      }
    } catch (err) {
      pending.captureError = `preHandler ${(err as Error).message}`;
    }
    PENDING.set(req, pending);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const pending = PENDING.get(req);
    if (!pending) return payload;
    try {
      const bodyRaw =
        typeof payload === 'string' ? payload :
        Buffer.isBuffer(payload) ? payload.toString('utf8') :
        '';
      const t = truncate(bodyRaw, GRAPHQL_BODY_CAP);
      let errorCount = 0;
      let firstError: string | null = null;
      if (bodyRaw.length > 0) {
        try {
          const parsed = JSON.parse(bodyRaw) as { errors?: { message?: string }[] };
          if (Array.isArray(parsed.errors)) {
            errorCount = parsed.errors.length;
            firstError = parsed.errors[0]?.message ?? null;
          }
        } catch {
          // Non-JSON response; leave errorCount/firstError defaults.
        }
      }
      graphqlLogBuffer.push({
        ts: Date.now(),
        requestId: String(req.id ?? ''),
        operationName: pending.operationName,
        operationType: pending.operationType,
        statusCode: reply.statusCode,
        durationMs: Date.now() - pending.startedAt,
        request: pending.request,
        response: { body: t.value, truncated: t.truncated },
        errorCount,
        firstError,
        captureError: pending.captureError,
      });
    } catch (err) {
      app.log.warn({ err }, 'graphql-capture onSend failed; entry skipped');
    } finally {
      PENDING.delete(req);
    }
    return payload;
  });
}
