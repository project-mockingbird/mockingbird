// src/web/state/tabContext.tsx
import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_TAB_ID, type TabId } from './workspaceStore';

const TabIdContext = createContext<TabId>(DEFAULT_TAB_ID);

export function TabContextProvider({
  tabId,
  children,
}: {
  tabId: TabId;
  children: ReactNode;
}) {
  return <TabIdContext.Provider value={tabId}>{children}</TabIdContext.Provider>;
}

export function useTabId(): TabId {
  return useContext(TabIdContext);
}
