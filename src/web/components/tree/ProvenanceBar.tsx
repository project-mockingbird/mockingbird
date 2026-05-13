interface ProvenanceBarProps {
  provenance: { winnerLayer: string; contributingLayers: string[] };
  layerColors: Record<string, string>;
  layerVisibility: Record<string, boolean>;
}

/**
 * Inline provenance indicator rendered between the row's indent and its
 * caret/icon. Single visible layer = one 4px-wide colored bar. Multiple
 * visible layers = a horizontal mini-stack of 3px sub-stripes with 1px
 * gaps inside an 8px-wide container. Winner is rightmost (closest to the
 * icon). 16px tall, 2px rounded corners. Returns null when no visible
 * contributors (caller is responsible for filtering whole-row visibility).
 */
export function ProvenanceBar({ provenance, layerColors, layerVisibility }: ProvenanceBarProps) {
  const visible = provenance.contributingLayers.filter(
    (name) => layerVisibility[name] !== false,
  );
  if (visible.length === 0) return null;

  if (visible.length === 1) {
    const name = visible[0];
    return (
      <span
        data-prov-stripe
        data-layer-name={name}
        aria-hidden="true"
        className="inline-block rounded-sm shrink-0"
        style={{ width: 4, height: 16, backgroundColor: layerColors[name] ?? '#888888', marginRight: 3 }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0"
      style={{ width: 8, height: 16, gap: 1, marginRight: 3 }}
    >
      {visible.map((name, i) => (
        <span
          key={`${name}-${i}`}
          data-prov-stripe
          data-layer-name={name}
          className="rounded-sm"
          style={{ width: 3, height: 16, backgroundColor: layerColors[name] ?? '#888888' }}
        />
      ))}
    </span>
  );
}
