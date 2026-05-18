import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { resolveMediaItem } from '../../engine/media/index.js';

/**
 * Serves Sitecore media items out of the engine's in-memory tree at the
 * public `/-/media/*` and `/-/jssmedia/*` URL prefixes. `jssmedia` is
 * Sitecore's Headless/JSS alias for the same content; both prefixes map
 * to the same handler so rendering hosts can target whichever they
 * emit without config changes.
 *
 * This is a passthrough for local development - no resize, no caching,
 * no auth. Query-string resize params (`h`, `w`, `mh`, `mw`, `thn`, `as`)
 * are stripped before resolution and the original bytes are returned.
 * Browsers scale via CSS in local dev; pixel-perfect thumbnails aren't
 * worth a native image dependency.
 */
export function registerMediaRoutes(app: FastifyInstance, engine: Engine): void {
  const handler = async (
    request: FastifyRequest<{ Params: { '*': string } }>,
    reply: FastifyReply,
  ): Promise<Buffer | undefined> => {
    const wildcard = request.params['*'] ?? '';
    // Params already have the matched prefix stripped, but re-normalise to
    // a leading slash so the resolver gets one consistent shape.
    const urlPath = wildcard.startsWith('/') ? wildcard : `/${wildcard}`;

    const resolved = await resolveMediaItem(engine, urlPath);
    if (!resolved) {
      reply.code(404).send({ error: 'media not found', path: urlPath });
      return undefined;
    }

    reply
      .code(200)
      .header('content-type', resolved.contentType)
      .header('content-length', resolved.buffer.length)
      .header('cache-control', 'public, max-age=3600');
    return resolved.buffer;
  };

  app.get('/-/media/*', handler);
  app.get('/-/jssmedia/*', handler);
}
