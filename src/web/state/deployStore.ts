// src/web/state/deployStore.ts
//
// Hand-rolled subscribe/notify store for the "Deploy to SitecoreAI" flow,
// mirroring packageCartStore's pattern. Unlike the cart, this store is
// transient (no localStorage) - it only exists to let two unrelated mount
// points (CheckoutDialog inside CartPane, and the context-menu action inside
// ContentTree) open a single DeployDialog / EnvironmentsManager hosted once
// in App.tsx, without threading dialog-open state through their parents.

import type { DeploySource } from '@/lib/deploy';

export interface DeploySnapshot {
  deployOpen: boolean;
  sources: DeploySource[];
  envManagerOpen: boolean;
}

export interface DeployStore {
  getSnapshot: () => DeploySnapshot;
  openDeploy: (sources: DeploySource[]) => void;
  closeDeploy: () => void;
  openEnvManager: () => void;
  closeEnvManager: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createDeployStore(): DeployStore {
  let snapshot: DeploySnapshot = { deployOpen: false, sources: [], envManagerOpen: false };
  const listeners = new Set<() => void>();
  const commit = (next: DeploySnapshot) => { snapshot = next; for (const l of listeners) l(); };
  return {
    getSnapshot: () => snapshot,
    openDeploy: (sources) => commit({ ...snapshot, deployOpen: true, sources }),
    closeDeploy: () => commit({ ...snapshot, deployOpen: false }),
    openEnvManager: () => commit({ ...snapshot, envManagerOpen: true }),
    closeEnvManager: () => commit({ ...snapshot, envManagerOpen: false }),
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const deployStore: DeployStore = createDeployStore();
