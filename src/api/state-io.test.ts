import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readJsonOrDefault, writeJsonAtomic } from './state-io.js';

describe('state-io', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-state-io-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('readJsonOrDefault returns default when file does not exist', async () => {
    const result = await readJsonOrDefault(join(dir, 'missing.json'), { hello: 'world' });
    expect(result).toEqual({ hello: 'world' });
  });

  it('readJsonOrDefault parses existing JSON', async () => {
    const path = join(dir, 'present.json');
    writeFileSync(path, JSON.stringify({ value: 42 }));
    const result = await readJsonOrDefault(path, { value: 0 });
    expect(result).toEqual({ value: 42 });
  });

  it('readJsonOrDefault returns default on parse error', async () => {
    const path = join(dir, 'corrupt.json');
    writeFileSync(path, 'not-json{');
    const result = await readJsonOrDefault(path, { fallback: true });
    expect(result).toEqual({ fallback: true });
  });

  it('writeJsonAtomic creates parent directories and writes file', async () => {
    const nestedPath = join(dir, 'a', 'b', 'c.json');
    await writeJsonAtomic(nestedPath, { ok: true });
    expect(existsSync(nestedPath)).toBe(true);
    expect(JSON.parse(readFileSync(nestedPath, 'utf8'))).toEqual({ ok: true });
  });

  it('writeJsonAtomic uses temp+rename', async () => {
    const path = join(dir, 'atomic.json');
    await writeJsonAtomic(path, { v: 1 });
    await writeJsonAtomic(path, { v: 2 });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ v: 2 });
    expect(existsSync(path + '.tmp')).toBe(false);
  });
});
