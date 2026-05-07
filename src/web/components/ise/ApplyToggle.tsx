interface ApplyToggleProps {
  applyMode: boolean;
  onChange: (next: boolean) => void;
}

export function ApplyToggle({ applyMode, onChange }: ApplyToggleProps) {
  return (
    <div className="inline-flex items-center rounded-md border bg-background p-0.5">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1 text-xs rounded ${!applyMode ? 'bg-cyan-500/20 text-cyan-200 font-semibold' : 'text-muted-foreground'}`}
      >
        DRY-RUN
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1 text-xs rounded ${applyMode ? 'bg-orange-500/30 text-orange-200 font-semibold' : 'text-muted-foreground'}`}
      >
        APPLY
      </button>
    </div>
  );
}
