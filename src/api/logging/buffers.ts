import { RingBuffer } from './ring-buffer.js';
import type { ServerLogEntry } from './pino-bridge.js';

export interface GraphqlLogEntry {
  id: number;
  ts: number;
  requestId: string;
  operationName: string | null;
  operationType: 'query' | 'mutation' | 'subscription' | null;
  statusCode: number;
  durationMs: number;
  request: { query: string; variables: unknown; truncated: boolean } | null;
  response: { body: string; truncated: boolean } | null;
  errorCount: number;
  firstError: string | null;
  captureError?: string;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const SERVER_BUFFER_SIZE = envInt('MOCKINGBIRD_LOGS_SERVER_BUFFER', 1000);
export const GRAPHQL_BUFFER_SIZE = envInt('MOCKINGBIRD_LOGS_GRAPHQL_BUFFER', 200);
export const GRAPHQL_BODY_CAP = envInt('MOCKINGBIRD_LOGS_GRAPHQL_BODY_CAP', 65536);

export const serverLogBuffer = new RingBuffer<ServerLogEntry>(SERVER_BUFFER_SIZE);
export const graphqlLogBuffer = new RingBuffer<GraphqlLogEntry>(GRAPHQL_BUFFER_SIZE);
