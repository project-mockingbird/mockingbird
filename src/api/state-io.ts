import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { randomBytes } from 'crypto';

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
  const suffix = randomBytes(4).toString('hex');
  const tmp = `${path}.${suffix}.tmp`;
  const json = JSON.stringify(value, null, 2);
  await writeFile(tmp, json, { encoding: 'utf8' });
  try {
    await rename(tmp, path);
  } catch (err) {
    // On Windows, concurrent renames to the same destination can produce EPERM
    // while the first rename is in flight. Retry once - the contention is transient.
    if ((err as NodeJS.ErrnoException).code === 'EPERM') {
      await rename(tmp, path);
    } else {
      throw err;
    }
  }
}
