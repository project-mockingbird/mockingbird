// src/web/state/useDeployStore.ts
//
// React hook bridging the module-level deployStore singleton to the
// useSyncExternalStore pattern used elsewhere in the app (usePackageCart,
// useTabState).

import { useSyncExternalStore } from 'react';
import { deployStore } from './deployStore';

export function useDeployStore() {
  return useSyncExternalStore(deployStore.subscribe, deployStore.getSnapshot, deployStore.getSnapshot);
}
