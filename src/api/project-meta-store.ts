import { readJsonOrDefault, writeJsonAtomic } from './state-io.js';
import { getProjectMetaPath } from './state-paths.js';

export interface ProjectMeta {
  projectHash: string;
  lastProjectName: string;
  layerPaths: string[];
  lastOpenedAt: string;
}

export async function readProjectMeta(projectHash: string): Promise<ProjectMeta | null> {
  const meta = await readJsonOrDefault<ProjectMeta | null>(getProjectMetaPath(projectHash), null);
  if (!meta || typeof meta !== 'object' || typeof meta.projectHash !== 'string') return null;
  return meta;
}

export async function writeProjectMeta(meta: ProjectMeta): Promise<void> {
  await writeJsonAtomic(getProjectMetaPath(meta.projectHash), meta);
}
