import { create } from 'zustand';

/**
 * In-memory store for layer visibility + per-layer display overrides (name,
 * color). Identity key = engine-supplied LayerSpec.name. Reset on project
 * switch/close. Plan 4A: in-memory only; Plan 4B persists via profiles.
 */
export interface LayerStateShape {
  /** True/false explicit; missing key = default visible. */
  visibility: Record<string, boolean>;
  /** Per-layer name + color overrides (display only). */
  overrides: Record<string, { name?: string; color?: string }>;
  isVisible(layerName: string): boolean;
  setVisibility(layerName: string, visible: boolean): void;
  rename(layerName: string, newName: string): void;
  recolor(layerName: string, newColor: string): void;
  reset(): void;
}

export const useLayerState = create<LayerStateShape>((set, get) => ({
  visibility: {},
  overrides: {},
  isVisible: (layerName) => get().visibility[layerName] !== false,
  setVisibility: (layerName, visible) =>
    set((s) => ({ visibility: { ...s.visibility, [layerName]: visible } })),
  rename: (layerName, newName) =>
    set((s) => ({
      overrides: {
        ...s.overrides,
        [layerName]: { ...(s.overrides[layerName] ?? {}), name: newName },
      },
    })),
  recolor: (layerName, newColor) =>
    set((s) => ({
      overrides: {
        ...s.overrides,
        [layerName]: { ...(s.overrides[layerName] ?? {}), color: newColor },
      },
    })),
  reset: () => set({ visibility: {}, overrides: {} }),
}));

/** Test helper - resets the global store between tests. */
export function resetLayerState(): void {
  useLayerState.getState().reset();
}
