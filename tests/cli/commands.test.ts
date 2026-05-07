import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { cpSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLI = resolve(__dirname, '../../src/cli/index.ts');
const VALID_FIXTURES = resolve(__dirname, '../fixtures/valid');
const REGISTRY_JSON = resolve(__dirname, '../fixtures/registry/test-registry.json');

function run(args: string, cwd?: string, extraEnv?: Record<string, string>): { stdout: string; exitCode: number } {
  const root = cwd ?? VALID_FIXTURES;
  try {
    const stdout = execSync(`npx tsx ${CLI} ${args}`, {
      encoding: 'utf-8',
      env: { ...process.env, SCS_SITECORE_JSON: resolve(root, 'sitecore.json'), ...extraEnv },
      timeout: 10000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: (err.stdout ?? '') + (err.stderr ?? ''), exitCode: err.status ?? 1 };
  }
}

describe('scp init', () => {
  it('scans and reports found items', () => {
    const { stdout, exitCode } = run('init');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('items found');
  });
});

describe('scp validate', () => {
  it('exits 0 for valid items', () => {
    const { exitCode } = run('validate');
    expect(exitCode).toBe(0);
  });

  it('outputs JSON when --format json is passed', () => {
    const { stdout, exitCode } = run('validate --format json');
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.valid).toBe(true);
  });
});

describe('scp tree', () => {
  it('prints the item tree', () => {
    const { stdout, exitCode } = run('tree');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('MyTemplate');
    expect(stdout).toContain('Title');
  });

  it('prints a subtree with --root', () => {
    const { stdout, exitCode } = run('tree --root /sitecore/templates/Project/MyProject/MyTemplate/Data');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Title');
    expect(stdout).not.toContain('MyRendering');
  });
});

describe('scp info', () => {
  it('shows details about an item by path', () => {
    const { stdout, exitCode } = run('info /sitecore/templates/Project/MyProject/MyTemplate/Data/Title');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Title');
    expect(stdout).toContain('Single-Line Text');
  });
});

describe('scp create', () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-cli-test-'));
    cpSync(VALID_FIXTURES, tempDir, { recursive: true });
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('creates a template', () => {
    const { stdout, exitCode } = run('create template "TestTemplate" --path /sitecore/templates/Project/MyProject', tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('TestTemplate');
    expect(stdout).toContain('created');
  });

  it('creates a section', () => {
    const { stdout, exitCode } = run('create section "Content" --template /sitecore/templates/Project/MyProject/MyTemplate', tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Content');
  });

  it('creates a field', () => {
    const { stdout, exitCode } = run('create field "Heading" --section /sitecore/templates/Project/MyProject/MyTemplate/Data --type "Single-Line Text"', tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Heading');
  });
});

describe('scp delete', () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-del-test-'));
    cpSync(VALID_FIXTURES, tempDir, { recursive: true });
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('deletes an item and reports affected files', () => {
    const { stdout, exitCode } = run('delete /sitecore/templates/Project/MyProject/MyTemplate/Data/Description --yes', tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Deleted');
  });
});

describe('scp move', () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'scp-mv-test-'));
    cpSync(VALID_FIXTURES, tempDir, { recursive: true });
  });
  afterEach(async () => { await rm(tempDir, { recursive: true, force: true }); });

  it('moves an item to a new parent', () => {
    run('create section "NewSection" --template /sitecore/templates/Project/MyProject/MyTemplate', tempDir);
    const { stdout, exitCode } = run('move /sitecore/templates/Project/MyProject/MyTemplate/Data/Title --to /sitecore/templates/Project/MyProject/MyTemplate/NewSection', tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Moved');
  });
});

describe('scp init with registry', () => {
  it('reports registry status when REGISTRY_PATH is set', () => {
    const { stdout, exitCode } = run('init', VALID_FIXTURES, { REGISTRY_PATH: REGISTRY_JSON });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Registry:');
    expect(stdout).toContain('OOTB items');
  });
});

describe('scp validate with registry', () => {
  it('reports registry loaded in output', () => {
    const { stdout, exitCode } = run('validate', VALID_FIXTURES, { REGISTRY_PATH: REGISTRY_JSON });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Registry:');
  });
});
