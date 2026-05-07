import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { resolveSxaContext } from '../../engine/sxa/site-context.js';
import { resolveVariantsForRendering } from '../../engine/sxa/variant-options.js';
import { resolveStyleOptions } from '../../engine/sxa/style-options.js';
import { resolveGridOptions } from '../../engine/sxa/grid-options.js';

export function registerSxaRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/sxa/variants', async (request, reply) => {
    if (!request.site) {
      return reply.code(400).send({ error: 'no site context (set ?site=<name> or send Host header matching a Site Grouping)' });
    }
    const { renderingId } = request.query as { renderingId?: string };
    if (!renderingId) {
      return reply.code(400).send({ error: 'renderingId is required' });
    }
    const ctx = resolveSxaContext(request.site.rootPath);
    if (!ctx) return reply.code(404).send({ error: 'Site root not found' });
    return resolveVariantsForRendering(engine, ctx.siteRootPath, ctx.commonRootPath, renderingId);
  });

  app.get('/api/sxa/style-options', async (request, reply) => {
    if (!request.site) {
      return reply.code(400).send({ error: 'no site context (set ?site=<name> or send Host header matching a Site Grouping)' });
    }
    const { renderingId } = request.query as { renderingId?: string };
    if (!renderingId) {
      return reply.code(400).send({ error: 'renderingId is required' });
    }
    const ctx = resolveSxaContext(request.site.rootPath);
    if (!ctx) return reply.code(404).send({ error: 'Site root not found' });
    return resolveStyleOptions(engine, ctx.siteRootPath, ctx.commonRootPath, renderingId);
  });

  app.get('/api/sxa/grid-options', async (request, reply) => {
    if (!request.site) {
      return reply.code(400).send({ error: 'no site context (set ?site=<name> or send Host header matching a Site Grouping)' });
    }
    const ctx = resolveSxaContext(request.site.rootPath);
    if (!ctx) return reply.code(404).send({ error: 'Site root not found' });
    return resolveGridOptions(engine, ctx.siteRootPath);
  });
}
