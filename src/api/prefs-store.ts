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
  // Reconstruct from known DEFAULTS keys only - strips legacy/unknown keys.
  const next = {} as Prefs;
  for (const key of Object.keys(DEFAULTS) as (keyof Prefs)[]) {
    const patchValue = patch[key];
    next[key] = (patchValue !== undefined ? patchValue : current[key]) as Prefs[typeof key];
  }
  await writeJsonAtomic(getPrefsPath(), next);
  return next;
}
