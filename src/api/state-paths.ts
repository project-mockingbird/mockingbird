import { resolve, join } from 'path';

export function getStateRoot(): string {
  return resolve(process.env.MOCKINGBIRD_STATE_ROOT ?? '/data/state');
}

export function getRecentsPath(): string {
  return join(getStateRoot(), 'recents.json');
}

export function getLastSessionPath(): string {
  return join(getStateRoot(), 'last-session.json');
}

export function getPrefsPath(): string {
  return join(getStateRoot(), 'prefs.json');
}

export function getProjectDir(projectHash: string): string {
  return join(getStateRoot(), 'projects', projectHash);
}

export function getProjectMetaPath(projectHash: string): string {
  return join(getProjectDir(projectHash), 'meta.json');
}

export function getProfilesDir(projectHash: string): string {
  return join(getProjectDir(projectHash), 'profiles');
}

export function getProfilePath(projectHash: string, name: string): string {
  return join(getProfilesDir(projectHash), `${name}.json`);
}
