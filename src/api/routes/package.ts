// src/api/routes/package.ts
//
// POST /api/package - HTTP wrapper around `buildPackage()`.
//
// Accepts a JSON body of `{ sources, metadata }` matching the package-builder
// design's "Build request shape (server-side)" section, calls the engine-side
// emitter, and streams the resulting classic Sitecore .zip back as
// `application/zip` with a `Content-Disposition: attachment` header.
//
// Two custom response headers carry build telemetry:
//   - `X-Mockingbird-Package-Warnings`: JSON-encoded `PackageWarning[]`,
//     capped at WARNINGS_HEADER_BUDGET; if the JSON exceeds the budget the
//     header is replaced with a single `{ kind: 'truncated', droppedCount }`
//     sentinel so the browser can still surface "we have warnings, fetch
//     them another way" rather than silently lose the signal.
//   - `X-Mockingbird-Package-Item-Count`: integer count of items resolved
//     into the package (post-deduplication), so the success toast can read
//     "Downloaded `name.zip` (847 items)".
//
// CORS exposure: both custom headers are listed in `exposedHeaders` on the
// CORS plugin in src/api/server.ts so cross-origin browser fetches can read
// them off the response. Without that, `fetch(...).headers.get(...)` returns
// null even when the server set the header.

import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { buildPackage } from '../../engine/package/index.js';
import { collectSources } from '../../engine/package/collect.js';
import type {
  CartSource,
  PackageMetadata,
  PackageWarning,
} from '../../engine/package/types.js';

const VALID_SCOPES: ReadonlySet<CartSource['scope']> = new Set([
  'itemAndDescendants',
  'itemAndChildren',
  'descendantsOnly',
  'childrenOnly',
]);

/**
 * Per HTTP/1.1, individual response header values can be very large but
 * proxies and browsers tend to drop the request after ~8 KB total header
 * size. 8 KB is a comfortable per-header ceiling that leaves room for the
 * rest of the response headers. Anything larger gets replaced with a
 * single truncation sentinel; the browser-side toast surfaces the
 * truncation rather than silently dropping warnings.
 */
const WARNINGS_HEADER_BUDGET = 8 * 1024;

export function registerPackageRoutes(app: FastifyInstance, engine: Engine): void {
  app.post('/api/package', async (request, reply) => {
    const body = request.body as {
      sources?: CartSource[];
      metadata?: PackageMetadata;
    } | null;

    if (!body || !Array.isArray(body.sources) || body.sources.length === 0) {
      return reply.status(400).send({
        error: 'Add at least one source before building.',
        statusCode: 400,
      });
    }
    if (!body.metadata?.name) {
      return reply.status(400).send({
        error: 'metadata.name is required',
        statusCode: 400,
      });
    }

    let result;
    try {
      result = await buildPackage(engine, body.sources, body.metadata);
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : String(e),
        statusCode: 400,
      });
    }

    // Sanitize the user-provided package name into a safe filename: only
    // ASCII alphanumerics, dots, underscores, and hyphens survive. Anything
    // else (path separators, quotes, control chars, non-ASCII) becomes `_`.
    // This blocks both filename-injection in Content-Disposition and
    // path-traversal attempts like "../etc/passwd".
    const safeName = body.metadata.name.replace(/[^A-Za-z0-9._-]/g, '_');
    reply.header('Content-Type', 'application/zip');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${safeName}.zip"`,
    );
    reply.header(
      'X-Mockingbird-Package-Warnings',
      encodeWarnings(result.warnings),
    );
    reply.header(
      'X-Mockingbird-Package-Item-Count',
      String(result.itemCount),
    );
    return reply.send(Buffer.from(result.zip));
  });

  // GET /api/package/source-size - returns the resolved item count for a
  // single (rootItemId, scope) pair. Used by the cart pane to populate the
  // "N items" label per source. Cheap on the engine: just walks the subtree
  // (or its filtered slice) once with no XML/zip emission.
  app.get('/api/package/source-size', async (request, reply) => {
    const q = request.query as { rootItemId?: string; scope?: string };
    if (!q.rootItemId) {
      return reply.status(400).send({ error: 'rootItemId is required', statusCode: 400 });
    }
    const scope = (q.scope ?? 'itemAndDescendants') as CartSource['scope'];
    if (!VALID_SCOPES.has(scope)) {
      return reply.status(400).send({
        error: `invalid scope: ${q.scope}`,
        statusCode: 400,
      });
    }
    const source: CartSource = {
      id: 'size-probe',
      rootItemId: q.rootItemId,
      rootItemPath: '',
      rootItemName: '',
      scope,
      database: 'master',
    };
    const { items, warnings } = collectSources(engine, [source]);
    if (warnings.some(w => w.kind === 'unresolved-root')) {
      return reply.status(404).send({
        error: `Item not found: ${q.rootItemId}`,
        statusCode: 404,
      });
    }
    return { count: items.length };
  });
}

function encodeWarnings(warnings: PackageWarning[]): string {
  const json = JSON.stringify(warnings);
  if (json.length <= WARNINGS_HEADER_BUDGET) return json;
  return JSON.stringify([{ kind: 'truncated', droppedCount: warnings.length }]);
}
