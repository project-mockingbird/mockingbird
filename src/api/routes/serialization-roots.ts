import type { FastifyInstance } from 'fastify';
import type { Engine } from '../../engine/index.js';
import { SerializationRootError } from '../../engine/serialization/add-serialization-root.js';
import { notifyTreeRefresh } from '../notify.js';

const CODE_TO_STATUS: Record<string, number> = {
  'path-not-found': 404,
  'invalid-scope': 400,
  'module-not-found': 404,
  'include-collision': 409,
  'target-exists': 409,
};

export function registerSerializationRootRoutes(app: FastifyInstance, engine: Engine): void {
  app.get('/api/serialization-roots', async () => {
    const modules = engine.getModules().map(m => ({
      filePath: m.filePath,
      namespace: m.namespace,
      includes: m.items.includes.map(i => ({
        name: i.name, path: i.path, scope: i.scope, database: i.database,
      })),
    }));
    return { modules };
  });

  app.post<{ Body: unknown }>('/api/serialization-roots', async (req, reply) => {
    const body = req.body as {
      path?: string;
      database?: string;
      scope?: string;
      name?: string;
      target?: { modulePath: string } | { newFile: true };
      dryRun?: boolean;
    };
    if (!body?.path || !body.target) {
      return reply.status(400).send({ error: 'path and target are required', statusCode: 400 });
    }
    try {
      const result = await engine.addSerializationRoot(
        {
          path: body.path,
          database: body.database,
          scope: body.scope as never,
          name: body.name,
          target: body.target,
        },
        { dryRun: body.dryRun === true },
      );
      if (body.dryRun === true) {
        return reply.status(200).send(result);
      }
      notifyTreeRefresh(engine, { reason: 'serialization-root', rootItemPath: body.path, createdCount: 0 });
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof SerializationRootError) {
        const status = CODE_TO_STATUS[err.code] ?? 500;
        return reply.status(status).send({ error: err.message, code: err.code, statusCode: status });
      }
      throw err;
    }
  });
}
