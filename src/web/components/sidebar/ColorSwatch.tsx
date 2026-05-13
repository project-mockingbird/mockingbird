import { useState } from 'react';
import { LAYER_COLOR_PALETTE } from '@/components/open-project/layer-colors';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ColorSwatchProps {
  value: string;
  onChange: (newColor: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Compact color square. Click opens a palette picker popover; selecting a
 * swatch fires onChange and closes the popover. Reused by
 * LayerSelectionDialog and LayerRow.
 */
export function ColorSwatch({ value, onChange, disabled, className, ariaLabel }: ColorSwatchProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        style={{ backgroundColor: value }}
        aria-label={ariaLabel ?? 'Pick layer color'}
        className={`size-4 rounded border shrink-0 disabled:cursor-not-allowed ${className ?? ''}`}
      />
      <PopoverContent className="w-auto p-2">
        <div className="grid grid-cols-4 gap-1">
          {LAYER_COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              style={{ backgroundColor: color }}
              aria-label={`Use color ${color}`}
              className="size-6 rounded border hover:scale-110 transition-transform"
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
