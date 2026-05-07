import { describe, it, expect, vi, afterEach } from 'vitest';
import { FileWatcher } from '../../src/engine/watcher.js';
import { writeFile, mkdir, rm } from 'fs/promises';
import { resolve } from 'path';
import { tmpdir } from 'os';

describe('FileWatcher', () => {
  const testDir = resolve(tmpdir(), `scp-watcher-test-${Date.now()}`);
  let watcher: FileWatcher | null = null;

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    await rm(testDir, { recursive: true, force: true });
  });

  it('detects new .yml files', async () => {
    await mkdir(testDir, { recursive: true });
    const onChange = vi.fn();
    watcher = new FileWatcher(testDir, onChange);
    await watcher.ready();

    const filePath = resolve(testDir, 'test.yml');
    await writeFile(filePath, '---\nID: "aaa"\n');

    await new Promise(r => setTimeout(r, 500));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'add', path: filePath }));
  });

  it('detects changed .yml files', async () => {
    await mkdir(testDir, { recursive: true });
    const filePath = resolve(testDir, 'test.yml');
    await writeFile(filePath, '---\nID: "aaa"\n');

    const onChange = vi.fn();
    watcher = new FileWatcher(testDir, onChange);
    await watcher.ready();

    await writeFile(filePath, '---\nID: "bbb"\n');

    await new Promise(r => setTimeout(r, 500));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'change', path: filePath }));
  });

  it('ignores non-.yml files', async () => {
    await mkdir(testDir, { recursive: true });
    const onChange = vi.fn();
    watcher = new FileWatcher(testDir, onChange);
    await watcher.ready();

    await writeFile(resolve(testDir, 'test.txt'), 'not yaml');

    await new Promise(r => setTimeout(r, 500));
    expect(onChange).not.toHaveBeenCalled();
  });
});
