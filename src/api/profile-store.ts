import { readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { readJsonOrDefault, writeJsonAtomic } from './state-io.js';
import { getProfilePath, getProfilesDir } from './state-paths.js';

export interface ProfileLayer {
  sitecoreJsonPath: string;
  name: string;
  color: string;
  allowedPushOperations?: 'CreateOnly' | 'CreateAndUpdate' | 'CreateUpdateAndDelete';
}

export interface Profile {
  name: string;
  projectName: string;
  layers: ProfileLayer[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSummary {
  name: string;
  projectName: string;
  layerCount: number;
  updatedAt: string;
}

const VALID_NAME = /^[A-Za-z0-9_\-. ]{1,64}$/;

function assertValidName(name: string): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(`invalid profile name: ${JSON.stringify(name)}`);
  }
}

function isValidProfileLayer(value: unknown): value is ProfileLayer {
  if (!value || typeof value !== 'object') return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l.sitecoreJsonPath === 'string' &&
    typeof l.name === 'string' &&
    typeof l.color === 'string'
  );
}

export async function readProfile(projectHash: string, name: string): Promise<Profile | null> {
  assertValidName(name);
  const path = getProfilePath(projectHash, name);
  if (!existsSync(path)) return null;
  const raw = await readJsonOrDefault<Profile | null>(path, null);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !Array.isArray(raw.layers) ||
    !raw.layers.every(isValidProfileLayer)
  ) {
    return null;
  }
  return raw;
}

export async function listProfiles(projectHash: string): Promise<ProfileSummary[]> {
  const dir = getProfilesDir(projectHash);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const summaries: ProfileSummary[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const name = entry.slice(0, -'.json'.length);
    if (!VALID_NAME.test(name)) continue;
    const profile = await readProfile(projectHash, name);
    if (!profile) continue;
    summaries.push({
      name: profile.name,
      projectName: profile.projectName,
      layerCount: profile.layers.length,
      updatedAt: profile.updatedAt,
    });
  }
  summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return summaries;
}

export async function upsertProfile(projectHash: string, profile: Profile): Promise<Profile> {
  assertValidName(profile.name);
  const path = getProfilePath(projectHash, profile.name);
  const now = new Date().toISOString();
  const existing = await readProfile(projectHash, profile.name);
  const merged: Profile = {
    ...profile,
    createdAt: existing?.createdAt ?? profile.createdAt ?? now,
    updatedAt: existing ? now : (profile.updatedAt ?? now),
  };
  if (!merged.layers.every(isValidProfileLayer)) {
    throw new Error('invalid profile layer entry');
  }
  await writeJsonAtomic(path, merged);
  return merged;
}

export async function deleteProfile(projectHash: string, name: string): Promise<void> {
  assertValidName(name);
  const path = getProfilePath(projectHash, name);
  if (!existsSync(path)) return;
  await unlink(path);
}

export async function renameProfile(
  projectHash: string,
  oldName: string,
  newName: string,
): Promise<Profile | null> {
  assertValidName(oldName);
  assertValidName(newName);
  if (oldName === newName) return readProfile(projectHash, oldName);
  const existing = await readProfile(projectHash, oldName);
  if (!existing) return null;
  const collision = await readProfile(projectHash, newName);
  if (collision) {
    throw new Error(`profile already exists: ${JSON.stringify(newName)}`);
  }
  const renamed: Profile = { ...existing, name: newName, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(getProfilePath(projectHash, newName), renamed);
  await deleteProfile(projectHash, oldName);
  return renamed;
}
