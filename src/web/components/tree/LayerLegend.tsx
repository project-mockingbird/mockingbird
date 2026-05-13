interface LegendLayer {
  name: string;
  color: string;
}

interface LayerLegendProps {
  layers: LegendLayer[];
  layerVisibility: Record<string, boolean>;
}

export function LayerLegend({ layers, layerVisibility }: LayerLegendProps) {
  if (layers.length === 0) return null;
  const isVisible = (n: string) => layerVisibility[n] !== false;
  return (
    <div className="flex flex-wrap gap-2 px-3 py-1.5 border-t bg-card/50 text-xs">
      {layers.map((l) => (
        <span
          key={l.name}
          data-legend-pill
          data-layer-name={l.name}
          className={`inline-flex items-center gap-1 ${isVisible(l.name) ? '' : 'opacity-40'}`}
        >
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ backgroundColor: l.color }}
          />
          {l.name}
        </span>
      ))}
      <span data-legend-pill data-layer-name="ootb" className="inline-flex items-center gap-1">
        <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: '#cbd5e1' }} />
        Sitecore IAR
      </span>
    </div>
  );
}
