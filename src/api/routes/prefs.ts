import type { FastifyInstance } from 'fastify';
import { readPrefs, writePrefs, type Prefs } from '../prefs-store.js';

export function registerPrefsRoutes(app: FastifyInstance): void {
  app.get('/api/prefs', async () => readPrefs());

  app.put<{ Body: Partial<Prefs> }>('/api/prefs', async (req, reply) => {
    const patch = req.body ?? {};
    const allowed: Partial<Prefs> = {};
    if (typeof patch.autoRestoreLastSession === 'boolean') {
      allowed.autoRestoreLastSession = patch.autoRestoreLastSession;
    }
    const next = await writePrefs(allowed);
    reply.send(next);
  });
}
