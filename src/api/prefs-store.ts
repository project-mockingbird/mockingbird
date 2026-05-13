import { readJsonOrDefault, writeJsonAtomic } from './state-io.js';
import { getPrefsPath } from './state-paths.js';

export interface Prefs {
  autoRestoreLastSession: boolean;
}

const DEFAULTS: Prefs = { autoRestoreLastSession: false };

export async function readPrefs(): Promise<Prefs> {
  const raw = await readJsonOrDefault<Partial<Prefs>>(getPrefsPath(), {});
  return { ...DEFAULTS, ...raw };
}

export async function writePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const current = await readPrefs();
  const next = { ...current, ...patch };
  await writeJsonAtomic(getPrefsPath(), next);
  return next;
}
