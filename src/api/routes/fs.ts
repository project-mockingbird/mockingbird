import type { FastifyInstance } from 'fastify';
import { readdir, stat, lstat } from 'fs/promises';
import { resolve, join, normalize, sep } from 'path';
import { isScsConfigShape, summarizeCandidate } from '../../engine/scs-config-detector.js';

interface FsDirectoryEntry {
  name: string;
  /** Workspace-relative path (always starts with '/'). */
  path: string;
  isDirectory: true;
  hasSitecoreJson: boolean;
  kind: 'directory';
}

interface FsConfigFileEntry {
  name: string;
  path: string;
  isDirectory: false;
  hasSitecoreJson: false;
  kind: 'config-file';
  moduleCount: number;
  pushOpsSummary: string;
}

type FsEntry = FsDirectoryEntry | FsConfigFileEntry;

interface FsListResponse {
  path: string;
  entries: FsEntry[];
}

/** Directories that are universally noise for a project browser. */
const HIDDEN_ENTRIES = new Set(['.git', '.vscode', '.DS_Store', '.idea', 'node_modules', '.mockingbird']);

/**
 * Filesystem browser endpoint. Lists immediate children of a workspace-relative
 * path. Path-jailed to MOCKINGBIRD_WORKSPACE (default: /workspaces) so the
 * web UI cannot escape into host system directories via ../ or absolute paths.
 *
 * Directory entries include a hasSitecoreJson flag for the first-run wizard
 * to highlight project-root candidates without a second round-trip.
 *
 * When `includeFiles=true`, the response also includes JSON files at the level
 * whose content matches the SCS root-config shape, each with moduleCount and
 * pushOpsSummary populated. Files that don't match the shape (or that fail to
 * parse) are silently omitted.
 */
export function registerFsRoutes(app: FastifyInstance): void {
  const workspaceRoot = resolve(
    process.env.MOCKINGBIRD_WORKSPACE ?? process.env.MOCKINGBIRD_WORKSPACE_ROOT ?? '/workspaces',
  );

  app.get<{ Querystring: { path?: string; includeFiles?: string } }>(
    '/api/fs/list',
    async (req, reply) => {
      const requested = req.query.path ?? '/';
      const includeFiles = req.query.includeFiles === 'true';

      if (!requested.startsWith('/')) {
        reply.code(400).send({ error: 'path must start with /' });
        return;
      }

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

        const workspaceRel = childAbs.slice(workspaceRoot.length).replace(/\\/g, '/') || '/';
        const normalizedRel = workspaceRel.startsWith('/') ? workspaceRel : '/' + workspaceRel;

        if (childStat.isDirectory()) {
          let hasSitecoreJson = false;
          try {
            await lstat(join(childAbs, 'sitecore.json'));
            hasSitecoreJson = true;
          } catch {
            // ENOENT or otherwise unreadable - leave hasSitecoreJson false
          }
          entries.push({
            name,
            path: normalizedRel,
            isDirectory: true,
            hasSitecoreJson,
            kind: 'directory',
          });
          continue;
        }

        if (!includeFiles) continue;
        if (!childStat.isFile()) continue;
        if (!name.toLowerCase().endsWith('.json')) continue;
        let matches = false;
        try {
          matches = await isScsConfigShape(childAbs);
        } catch {
          continue;
        }
        if (!matches) continue;
        let summary;
        try {
          summary = await summarizeCandidate(childAbs);
        } catch {
          continue;
        }
        entries.push({
          name,
          path: normalizedRel,
          isDirectory: false,
          hasSitecoreJson: false,
          kind: 'config-file',
          moduleCount: summary.moduleCount,
          pushOpsSummary: summary.pushOpsSummary,
        });
      }

      entries.sort((a, b) => {
        // Directories first, then config-files, then alphabetical within each.
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const response: FsListResponse = {
        path: requested,
        entries,
      };
      reply.send(response);
    },
  );
}
