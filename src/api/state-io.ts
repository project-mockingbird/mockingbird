import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';

export async function readJsonOrDefault<T>(path: string, defaultValue: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const json = JSON.stringify(value, null, 2);
  await writeFile(tmp, json, { encoding: 'utf8' });
  await rename(tmp, path);
}
