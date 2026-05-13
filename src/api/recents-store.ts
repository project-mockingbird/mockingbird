import { readJsonOrDefault, writeJsonAtomic } from './state-io.js';
import { getRecentsPath } from './state-paths.js';

export interface RecentsEntry {
  projectHash: string;
  projectName: string;
  profileName: string;
  lastOpenedAt: string;
}

const MAX_ENTRIES = 20;

interface RecentsFile {
  entries: RecentsEntry[];
}

export async function readRecents(): Promise<RecentsEntry[]> {
  const file = await readJsonOrDefault<RecentsFile>(getRecentsPath(), { entries: [] });
  if (!Array.isArray(file.entries)) return [];
  return file.entries;
}

export async function upsertRecent(entry: RecentsEntry): Promise<void> {
  const current = await readRecents();
  const filtered = current.filter(
    (e) => !(e.projectHash === entry.projectHash && e.profileName === entry.profileName),
  );
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, MAX_ENTRIES);
  await writeJsonAtomic(getRecentsPath(), { entries: trimmed });
}

export async function removeRecent(projectHash: string, profileName: string): Promise<void> {
  const current = await readRecents();
  const next = current.filter(
    (e) => !(e.projectHash === projectHash && e.profileName === profileName),
  );
  await writeJsonAtomic(getRecentsPath(), { entries: next });
}
