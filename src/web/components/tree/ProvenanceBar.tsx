interface ProvenanceBarProps {
  provenance: { winnerLayer: string; contributingLayers: string[] };
  layerColors: Record<string, string>;
  layerVisibility: Record<string, boolean>;
}

/**
 * Thin per-row stripe stack showing layer attribution. Each visible
 * contributing layer renders as a 4px-wide colored stripe. Order: weakest
 * left, winner right. OOTB items render a single grey stripe.
 */
export function ProvenanceBar({ provenance, layerColors, layerVisibility }: ProvenanceBarProps) {
  const visible = provenance.contributingLayers.filter(
    (name) => layerVisibility[name] !== false,
  );
  return (
    <div
      className="absolute left-0 top-0 bottom-0 flex pointer-events-none"
      aria-hidden="true"
    >
      {visible.map((name, i) => (
        <div
          key={`${name}-${i}`}
          data-prov-stripe
          data-layer-name={name}
          style={{ backgroundColor: layerColors[name] ?? '#888888', width: 4 }}
        />
      ))}
    </div>
  );
}
