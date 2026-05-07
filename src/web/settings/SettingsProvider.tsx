
import { createContext, useContext, useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  getOverrides,
  setSetting,
  reset,
} from './store';
import type { Settings, SettingsKey, Overrides } from './schema';

interface SettingsContextValue {
  settings: Settings;
  overrides: Overrides;
  setSetting: <K extends SettingsKey>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const overrides = useSyncExternalStore(subscribe, getOverrides, getOverrides);

  return (
    <SettingsContext.Provider value={{ settings, overrides, setSetting, reset }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
