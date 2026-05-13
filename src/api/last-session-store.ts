import { readJsonOrDefault, writeJsonAtomic } from './state-io.js';
import { getLastSessionPath } from './state-paths.js';

export interface LastSession {
  projectHash: string;
  profileName: string;
}

export async function readLastSession(): Promise<LastSession | null> {
  const value = await readJsonOrDefault<LastSession | null>(getLastSessionPath(), null);
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.projectHash !== 'string' ||
    typeof value.profileName !== 'string'
  ) {
    return null;
  }
  return value;
}

export async function writeLastSession(value: LastSession | null): Promise<void> {
  await writeJsonAtomic(getLastSessionPath(), value);
}
