import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { resolveLookupSource } from '../../engine/lookup-sources.js';

interface LookupQuery {
  source?: string;
  contextId?: string;
  kind?: string;
}

export function registerLookupSourceRoutes(app: FastifyInstance, engine: Engine): void {
  // GET /api/lookup-source?source=<sitecore source string>&contextId=<item id>&kind=<field type>
  // Resolves a Droplink/Droplist field's Source attribute into the list of
  // selectable items. contextId is the item being edited; required for
  // sources that contain SXA tokens ($site, $tenant, $pageDesigns, ...).
  //
  // kind carries the field type so a `query:` source gets the kernel's
  // matched-node semantics for the flat-select controls (Droplink/Droplist ->
  // LookupSources.GetItems/ProcessQuerySource) while the tree-rooted controls
  // (Treelist/Droptree) keep the child-descent approximation of a
  // datasource-rooted tree.
  app.get('/api/lookup-source', async (request, reply) => {
    const { source = '', contextId, kind } = request.query as LookupQuery;
    const flatSelect = kind === 'Droplink' || kind === 'Droplist';
    const result = resolveLookupSource(source, contextId, engine, { flatSelect });
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
