import type { FastifyInstance } from 'fastify';
import { readdir, stat, lstat } from 'fs/promises';
import { resolve, join, normalize, sep } from 'path';

interface FsEntry {
  name: string;
  /** Workspace-relative path (always starts with '/'). */
  path: string;
  isDirectory: boolean;
  hasSitecoreJson: boolean;
}

interface FsListResponse {
  /** Workspace-relative path of the listed directory (echoed for client). */
  path: string;
  entries: FsEntry[];
}

/** Directories that are universally noise for a project browser. */
const HIDDEN_ENTRIES = new Set(['.git', '.vscode', '.DS_Store', '.idea', 'node_modules']);

/**
 * Filesystem browser endpoint. Lists immediate children of a workspace-relative
 * path. Path-jailed to MOCKINGBIRD_WORKSPACE_ROOT (default: /workspaces) so the
 * web UI cannot escape into host system directories via ../ or absolute paths.
 *
 * Each entry includes a hasSitecoreJson flag for the first-run wizard to
 * highlight project-root candidates without a second round-trip.
 */
export function registerFsRoutes(app: FastifyInstance): void {
  const workspaceRoot = resolve(process.env.MOCKINGBIRD_WORKSPACE_ROOT ?? '/workspaces');

  app.get<{ Querystring: { path?: string } }>('/api/fs/list', async (req, reply) => {
    const requested = req.query.path ?? '/';

    // Workspace-relative path must start with '/'. Strip and normalize.
    if (!requested.startsWith('/')) {
      reply.code(400).send({ error: 'path must start with /' });
      return;
    }

    // Resolve relative to workspace root; reject any path that escapes.
    const candidate = resolve(workspaceRoot, '.' + requested);
    const normalized = normalize(candidate);
    const rootWithSep = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
    if (normalized !== workspaceRoot && !normalized.startsWith(rootWithSep)) {
      reply.code(400).send({ error: 'path escapes workspace root' });
      return;
    }

    let st;
    try {
      st = await stat(normalized);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reply.code(404).send({ error: 'path not found' });
        return;
      }
      throw err;
    }
    if (!st.isDirectory()) {
      reply.code(400).send({ error: 'path is not a directory' });
      return;
    }

    const names = await readdir(normalized);
    const entries: FsEntry[] = [];
    for (const name of names) {
      if (HIDDEN_ENTRIES.has(name)) continue;
      const childAbs = join(normalized, name);
      let childStat;
      try {
        childStat = await lstat(childAbs);
      } catch {
        continue;
      }
      if (childStat.isSymbolicLink()) continue;
      if (!childStat.isDirectory()) continue;

      let hasSitecoreJson = false;
      try {
        await lstat(join(childAbs, 'sitecore.json'));
        hasSitecoreJson = true;
      } catch {
        // ENOENT or otherwise unreadable - leave hasSitecoreJson false
      }
      const workspaceRel = childAbs.slice(workspaceRoot.length).replace(/\\/g, '/') || '/';
      const normalizedRel = workspaceRel.startsWith('/') ? workspaceRel : '/' + workspaceRel;

      entries.push({
        name,
        path: normalizedRel,
        isDirectory: true,
        hasSitecoreJson,
      });
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    const response: FsListResponse = {
      path: requested,
      entries,
    };
    reply.send(response);
  });
}
