import type { FastifyInstance } from 'fastify';
import { readConfig, writeConfig, resolveConfigPath, type MockingbirdConfig } from '../state/config-store.js';

function isValidConfigBody(body: unknown): body is MockingbirdConfig {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (b.version !== 1) return false;
  if (!b.projects || typeof b.projects !== 'object' || Array.isArray(b.projects)) return false;
  if (b.lastOpenedHash !== undefined && typeof b.lastOpenedHash !== 'string') return false;
  // Light shape check on each project entry. Hard errors here surface bugs;
  // we don't enforce every nested field strictly because the migration path
  // ferries data through verbatim.
  for (const value of Object.values(b.projects)) {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.hash !== 'string') return false;
    if (typeof p.name !== 'string') return false;
    if (!Array.isArray(p.layers)) return false;
  }
  return true;
}

export function registerConfigRoutes(app: FastifyInstance): void {
  app.get('/api/config', async (_req, reply) => {
    const config = await readConfig(resolveConfigPath());
    reply.send(config);
  });

  app.put<{ Body: unknown }>('/api/config', async (req, reply) => {
    if (!isValidConfigBody(req.body)) {
      reply.code(400).send({ error: 'invalid config body' });
      return;
    }
    await writeConfig(resolveConfigPath(), req.body);
    reply.send({ ok: true });
  });
}
