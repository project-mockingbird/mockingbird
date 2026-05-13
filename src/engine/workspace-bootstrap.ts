import { mkdir, writeFile, readFile, access } from 'fs/promises';
import { join } from 'path';

const GITIGNORE_LINE = '.mockingbird/';
const GITIGNORE_PATTERN = /^\.mockingbird\/?$/m;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureCacheDir(workspaceRoot: string): Promise<void> {
  const cacheDir = join(workspaceRoot, '.mockingbird', 'cache');
  await mkdir(cacheDir, { recursive: true });
  const gitkeep = join(cacheDir, '.gitkeep');
  if (!(await exists(gitkeep))) {
    await writeFile(gitkeep, '', 'utf-8');
  }
}

async function ensureGitignore(workspaceRoot: string): Promise<void> {
  const gitignorePath = join(workspaceRoot, '.gitignore');
  let current = '';
  if (await exists(gitignorePath)) {
    current = await readFile(gitignorePath, 'utf-8');
  }
  if (GITIGNORE_PATTERN.test(current)) return;
  const prefix = current.length === 0 || current.endsWith('\n') ? '' : '\n';
  const next = current + prefix + GITIGNORE_LINE + '\n';
  await writeFile(gitignorePath, next, 'utf-8');
}

/**
 * One-shot workspace bootstrap. Idempotent. Run on engine init when the
 * workspace root is known. Creates the cache dir + gitkeep and appends
 * `.mockingbird/` to root .gitignore so cache artifacts don't enter git.
 */
export async function ensureWorkspaceLayout(workspaceRoot: string): Promise<void> {
  await ensureCacheDir(workspaceRoot);
  await ensureGitignore(workspaceRoot);
}
