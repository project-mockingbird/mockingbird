// src/api/routes/admin-reindex.ts
//
// POST /api/admin/reindex - the backend for the in-app "Restart" /
// "Clear Cache and Restart" power button. Re-indexes the currently-loaded
// workspace in place (no process/container restart), optionally wiping the
// on-disk index caches first for a cold rebuild.
//
// Under /api/admin/ on purpose: that prefix is exempt from the readiness gate
// (src/api/hooks/readiness-gate.ts), so the endpoint still responds while the
// engine is re-indexing.

import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';

export function registerAdminReindexRoute(app: FastifyInstance, engine: Engine): void {
  app.post('/api/admin/reindex', async (req, reply) => {
    const clearCache = (req.body as { clearCache?: unknown } | null)?.clearCache === true;

    // beginReindex resets readiness to 'initializing' synchronously and runs
    // the re-index in the background, so the client can reload immediately and
    // land on the starting splash.
    const started = engine.beginReindex({ clearCache });
    if (!started) {
      reply.code(409).send({ error: 'No workspace is loaded to restart.' });
      return;
    }

    // Regenerate the GraphQL schema against the rebuilt tree once it is ready
    // (mirrors the projects/open + boot-replay paths).
    engine.readiness
      .ready()
      .then(() => app.extendMockingbirdSchema?.())
      .catch((err) => app.log.warn({ err }, '[admin/reindex] schema re-extension failed'));

    reply.code(202).send({ status: 'reindexing', clearCache });
  });
}
