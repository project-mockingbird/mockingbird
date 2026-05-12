import { EditableLayerName } from './EditableLayerName';
import { ColorSwatch } from './ColorSwatch';

interface LayerRowProps {
  layerName: string;
  effectiveCount: number;
  color: string;
  visible: boolean;
  ootbSubstrate?: boolean;
  onToggle: (visible: boolean) => void;
  onRename: (newName: string) => void;
  onRecolor: (newColor: string) => void;
  /** Optional tooltip text shown on hover of the layer name. */
  titleHint?: string;
}

export function LayerRow({
  layerName,
  effectiveCount,
  color,
  visible,
  ootbSubstrate,
  onToggle,
  onRename,
  onRecolor,
  titleHint,
}: LayerRowProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50">
      <input
        type="checkbox"
        checked={visible}
        disabled={ootbSubstrate}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={`Toggle layer ${layerName}`}
      />
      <ColorSwatch
        value={color}
        onChange={onRecolor}
        disabled={ootbSubstrate}
        ariaLabel={`Layer color for ${layerName}`}
      />
      <div className="flex-1 min-w-0" title={titleHint}>
        <EditableLayerName
          value={layerName}
          onChange={onRename}
          disabled={ootbSubstrate}
        />
        {ootbSubstrate && (
          <div className="text-[10px] text-muted-foreground italic">substrate</div>
        )}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{effectiveCount}</span>
    </div>
  );
}
