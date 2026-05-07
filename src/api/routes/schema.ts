import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { VALID_FIELD_TYPES } from '../../engine/constants.js';

export function registerSchemaRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/schema/field-types', async () => [...VALID_FIELD_TYPES]);
  app.get('/api/schema/standard-templates', async () => ({
    loaded: engine.isRegistryLoaded(),
    templates: engine.getRegistryTemplates(),
  }));
}
