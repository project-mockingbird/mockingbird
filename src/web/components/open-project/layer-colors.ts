/**
 * Fixed 8-color palette for layer swatches in the open-project wizard.
 * Hex values match the Tailwind v4 default scale's 500-shade for each
 * named hue (green-500, blue-500, etc.), so the swatches read clearly
 * in both light and dark themes.
 */
export const LAYER_COLOR_PALETTE = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#a855f7', // purple
  '#f97316', // orange
  '#ef4444', // red
  '#14b8a6', // teal
  '#eab308', // yellow
  '#ec4899', // pink
] as const;

/**
 * Returns the palette color for a given layer index. Cycles the palette
 * when the index exceeds palette length, so callers do not need to bound
 * the layer count.
 */
export function assignLayerColor(index: number): string {
  return LAYER_COLOR_PALETTE[index % LAYER_COLOR_PALETTE.length];
}
