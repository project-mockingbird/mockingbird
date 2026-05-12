import { LAYER_COLOR_PALETTE } from '@/components/open-project/layer-colors';

interface ColorSwatchProps {
  value: string;
  onChange: (newColor: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Compact color square. Click cycles through LAYER_COLOR_PALETTE; an
 * off-palette value lands on palette[0] on first cycle. Reused by
 * LayerSelectionDialog and LayerRow.
 */
export function ColorSwatch({ value, onChange, disabled, className, ariaLabel }: ColorSwatchProps) {
  const handleClick = () => {
    if (disabled) return;
    const idx = LAYER_COLOR_PALETTE.indexOf(value as (typeof LAYER_COLOR_PALETTE)[number]);
    const nextIdx = idx < 0 ? 0 : (idx + 1) % LAYER_COLOR_PALETTE.length;
    onChange(LAYER_COLOR_PALETTE[nextIdx]);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      style={{ backgroundColor: value }}
      aria-label={ariaLabel ?? 'Cycle layer color'}
      className={`size-4 rounded border shrink-0 disabled:cursor-not-allowed ${className ?? ''}`}
    />
  );
}
