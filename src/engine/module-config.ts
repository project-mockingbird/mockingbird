import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { glob } from 'glob';
import type { ModuleConfig, ProjectConfig } from './types.js';

export async function loadProjectConfig(filePath: string): Promise<ProjectConfig> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as ProjectConfig;
}

export async function loadModuleConfig(filePath: string): Promise<ModuleConfig | null> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  // Skip modules that don't have an items block (e.g., security/roles-only modules)
  if (!parsed.items?.includes) return null;
  return { ...parsed, filePath } as ModuleConfig;
}

export async function discoverModules(rootDir: string): Promise<ModuleConfig[]> {
  const projectConfigPath = resolve(rootDir, 'sitecore.json');
  const projectConfig = await loadProjectConfig(projectConfigPath);

  const configs: ModuleConfig[] = [];
  for (const pattern of projectConfig.modules) {
    const matches = await glob(pattern, { cwd: rootDir });
    for (const match of matches) {
      const absolutePath = resolve(rootDir, match);
      const config = await loadModuleConfig(absolutePath);
      if (config) configs.push(config);
    }
  }

  return configs;
}
