import { workspaceStore } from './workspaceStore';

/** True when any tab in the workspace has unsaved field edits. */
export function anyTabDirty(): boolean {
  const s = workspaceStore.getState();
  for (const id of Object.keys(s.tabs)) {
    if (Object.keys(s.tabs[id].editedFields).length > 0) return true;
  }
  return false;
}

/** Count of tabs that have unsaved field edits. */
export function dirtyTabCount(): number {
  const s = workspaceStore.getState();
  let count = 0;
  for (const id of Object.keys(s.tabs)) {
    if (Object.keys(s.tabs[id].editedFields).length > 0) count++;
  }
  return count;
}
