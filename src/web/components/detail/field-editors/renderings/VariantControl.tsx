import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface VariantOption {
  id: string;
  displayName: string;
  folderName: string;
  isShared: boolean;
}

interface VariantControlProps {
  value: string;
  options: VariantOption[];
  loading: boolean;
  editing: boolean;
  onChange: (newGuid: string) => void;
}

export function VariantControl({ value, options, loading, editing, onChange }: VariantControlProps) {
  if (loading) {
    return <div className="text-xs text-muted-foreground italic">Loading variants...</div>;
  }
  if (options.length === 0) {
    return <div className="text-xs text-muted-foreground italic">(no variants available for this rendering)</div>;
  }
  const selectedExists = !!options.find(o => o.id === value);
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onChange} disabled={!editing}>
        <SelectTrigger size="sm" className="text-xs">
          <SelectValue placeholder="(none)" />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.id} value={o.id}>
              {o.displayName} <span className="text-[10px] text-muted-foreground">- {o.folderName}{o.isShared ? ' (Shared)' : ''}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && !selectedExists && (
        <p className="text-[10px] text-destructive">[unresolved: {value}]</p>
      )}
    </div>
  );
}
