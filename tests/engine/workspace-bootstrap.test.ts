import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile, access } from 'fs/promises';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { ensureWorkspaceLayout } from '../../src/engine/workspace-bootstrap.js';

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = resolve(tmpdir(), `wsboot-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(workspaceRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe('ensureWorkspaceLayout', () => {
  it('creates .mockingbird/cache/.gitkeep', async () => {
    await ensureWorkspaceLayout(workspaceRoot);
    await expect(access(join(workspaceRoot, '.mockingbird', 'cache', '.gitkeep'))).resolves.toBeUndefined();
  });

  it('appends .mockingbird/ to root .gitignore when missing', async () => {
    await writeFile(join(workspaceRoot, '.gitignore'), 'node_modules/\n', 'utf-8');
    await ensureWorkspaceLayout(workspaceRoot);
    const gitignore = await readFile(join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.mockingbird/');
  });

  it('creates root .gitignore if absent', async () => {
    await ensureWorkspaceLayout(workspaceRoot);
    const gitignore = await readFile(join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.mockingbird/');
  });

  it('does not duplicate the .mockingbird/ entry', async () => {
    await writeFile(join(workspaceRoot, '.gitignore'), '.mockingbird/\n', 'utf-8');
    await ensureWorkspaceLayout(workspaceRoot);
    const gitignore = await readFile(join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(gitignore.match(/\.mockingbird\//g)?.length).toBe(1);
  });

  it('is idempotent across multiple calls', async () => {
    await ensureWorkspaceLayout(workspaceRoot);
    await ensureWorkspaceLayout(workspaceRoot);
    const gitignore = await readFile(join(workspaceRoot, '.gitignore'), 'utf-8');
    expect(gitignore.match(/\.mockingbird\//g)?.length).toBe(1);
  });
});
