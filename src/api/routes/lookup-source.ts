import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { resolveLookupSource } from '../../engine/lookup-sources.js';

interface LookupQuery {
  source?: string;
  contextId?: string;
}

export function registerLookupSourceRoutes(app: FastifyInstance, engine: Engine): void {
  // GET /api/lookup-source?source=<sitecore source string>&contextId=<item id>
  // Resolves a Droplink/Droplist field's Source attribute into the list of
  // selectable items. contextId is the item being edited; required for
  // sources that contain SXA tokens ($site, $tenant, $pageDesigns, ...).
  app.get('/api/lookup-source', async (request, reply) => {
    const { source = '', contextId } = request.query as LookupQuery;
    const result = resolveLookupSource(source, contextId, engine);
    if (!result.resolved) {
      return reply.status(422).send({
        error: 'Source format not supported',
        reason: result.reason,
        statusCode: 422,
      });
    }
    return result.items;
  });
}
