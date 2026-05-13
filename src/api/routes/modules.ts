import type { FastifyInstance } from 'fastify';
import { discoverModules } from '../../engine/module-config.js';

export function registerModulesRoutes(app: FastifyInstance, rootDir?: string): void {
  app.get('/api/modules', async () => rootDir ? discoverModules(rootDir) : []);
}
