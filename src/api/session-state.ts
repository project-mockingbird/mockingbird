/**
 * In-memory pointer to the currently active profile. Updated by the
 * /api/projects/open and /api/projects/close handlers; read by /api/status.
 * Re-derived on container start by the auto-restore web flow (if pref is on).
 */
let activeProfile: { projectHash: string; profileName: string } | null = null;
let currentProjectHash: string | null = null;

export function setActiveProfile(value: { projectHash: string; profileName: string } | null): void {
  activeProfile = value;
}

export function getActiveProfile(): { projectHash: string; profileName: string } | null {
  return activeProfile;
}

export function setCurrentProjectHash(value: string | null): void {
  currentProjectHash = value;
}

export function getCurrentProjectHash(): string | null {
  return currentProjectHash;
}
