import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import {
  discoverTenantDefinitions,
  discoverSiteDefinitions,
} from '../../engine/scaffolding/definition-items.js';

/**
 * Read-only discovery endpoints for the scaffolding dialogs. Both
 * routes return [] of DefinitionItem with `actions: []` (action
 * arrays are hydrated server-side at scaffold-dispatch time, not
 * exposed to the dialog which only needs name/description/source).
 */
export function registerScaffoldingRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/scaffolding/tenant-definitions', async () => {
    const list = await discoverTenantDefinitions(engine);
    return list.map(({ actions: _ignored, ...rest }) => rest);
  });

  app.get('/api/scaffolding/site-definitions', async () => {
    const list = await discoverSiteDefinitions(engine);
    return list.map(({ actions: _ignored, ...rest }) => rest);
  });
}
