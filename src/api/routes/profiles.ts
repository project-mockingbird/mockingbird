import type { FastifyInstance } from 'fastify';
import {
  listProfiles,
  readProfile,
  upsertProfile,
  deleteProfile,
  renameProfile,
  type Profile,
  type ProfileLayer,
} from '../profile-store.js';

export function registerProfilesRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { projectHash?: string } }>('/api/profiles', async (req, reply) => {
    const projectHash = req.query.projectHash;
    if (typeof projectHash !== 'string' || projectHash.length === 0) {
      reply.code(400).send({ error: 'projectHash query is required' });
      return;
    }
    const profiles = await listProfiles(projectHash);
    reply.send({ profiles });
  });

  app.post<{
    Body: {
      projectHash?: string;
      name?: string;
      projectName?: string;
      layers?: ProfileLayer[];
    };
  }>('/api/profiles', async (req, reply) => {
    const { projectHash, name, projectName, layers } = req.body ?? {};
    if (typeof projectHash !== 'string' || typeof name !== 'string' || typeof projectName !== 'string' || !Array.isArray(layers)) {
      reply.code(400).send({ error: 'projectHash, name, projectName, and layers are required' });
      return;
    }
    const now = new Date().toISOString();
    const profile: Profile = { name, projectName, layers, createdAt: now, updatedAt: now };
    try {
      const saved = await upsertProfile(projectHash, profile);
      reply.send({ profile: saved });
    } catch (err) {
      reply.code(400).send({ error: err instanceof Error ? err.message : 'invalid profile' });
    }
  });

  app.delete<{ Querystring: { projectHash?: string; name?: string } }>('/api/profiles', async (req, reply) => {
    const { projectHash, name } = req.query;
    if (typeof projectHash !== 'string' || typeof name !== 'string') {
      reply.code(400).send({ error: 'projectHash and name query params are required' });
      return;
    }
    await deleteProfile(projectHash, name);
    reply.send({ ok: true });
  });

  app.post<{ Body: { projectHash?: string; oldName?: string; newName?: string } }>(
    '/api/profiles/rename',
    async (req, reply) => {
      const { projectHash, oldName, newName } = req.body ?? {};
      if (typeof projectHash !== 'string' || typeof oldName !== 'string' || typeof newName !== 'string') {
        reply.code(400).send({ error: 'projectHash, oldName, newName are required' });
        return;
      }
      try {
        const profile = await renameProfile(projectHash, oldName, newName);
        if (!profile) {
          reply.code(404).send({ error: 'profile not found' });
          return;
        }
        reply.send({ profile });
      } catch (err) {
        reply.code(400).send({ error: err instanceof Error ? err.message : 'invalid name' });
      }
    },
  );

  app.get<{ Params: { projectHash: string; name: string } }>(
    '/api/profiles/:projectHash/:name',
    async (req, reply) => {
      const profile = await readProfile(req.params.projectHash, req.params.name);
      if (!profile) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      reply.send({ profile });
    },
  );
}
