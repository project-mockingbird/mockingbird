import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { toHostPath } from '../host-path.js';

export function registerValidateRoutes(app: FastifyInstance, engine: Engine): void {
  app.post('/api/validate', async () => {
    // Translate filePath at the HTTP boundary so the validation issues panel
    // shows host paths the operator can paste into Explorer / their editor,
    // matching the Quick Info File field. Falls back to container path
    // silently when /proc/self/mountinfo discovery fails.
    const result = engine.validate();
    return {
      ...result,
      errors: result.errors.map(e => ({ ...e, filePath: toHostPath(e.filePath) })),
    };
  });
}
