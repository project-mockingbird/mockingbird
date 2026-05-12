import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReadinessState } from '../../engine/readiness.js';

export function registerReadinessGate(app: FastifyInstance, readiness: ReadinessState): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split('?')[0];
    const gated = url.startsWith('/api/') || url.startsWith('/sitecore/api/graph/');
    if (!gated) return;
    if (url === '/api/status') return;
    // Admin tooling is observable-during-indexing on purpose: the Logs
    // page is most useful precisely while the engine is warming up.
    if (url.startsWith('/api/admin/')) return;
    if (readiness.isReady() || readiness.state === 'no-project') return;
    if (readiness.state === 'error') {
      reply.code(503).send({
        status: 'error',
        error: readiness.error?.message ?? 'indexing failed',
      });
      return;
    }
    reply.code(503).send({
      status: 'indexing',
      progress: readiness.progress,
    });
  });
}
