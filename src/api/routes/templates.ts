import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { listTemplates } from '../../engine/templates/list.js';

export function registerTemplatesRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/templates', async () => {
    return { templates: listTemplates(engine) };
  });
}
