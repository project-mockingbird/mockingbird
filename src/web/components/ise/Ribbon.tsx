import { Icon } from '@/lib/icon';
import { mdiPlay, mdiStop } from '@mdi/js';
import { Button } from '@/components/ui/button';

interface RibbonProps {
  onExecute: () => void;
  onAbort: () => void;
  canExecute: boolean;
  canAbort: boolean;
  database: string;
  onDatabaseChange: (db: string) => void;
}

export function Ribbon({ onExecute, onAbort, canExecute, canAbort, database, onDatabaseChange }: RibbonProps) {
  return (
    <div className="flex items-center gap-6 border-b bg-card px-4 py-2">
      {/* Script Execution group */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onExecute}
          disabled={!canExecute}
          title="Execute (F5)"
        >
          <Icon path={mdiPlay} />
          Execute
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAbort}
          disabled={!canAbort}
          title="Abort (Shift+F5)"
        >
          <Icon path={mdiStop} />
          Abort
        </Button>
      </div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">|</div>
      {/* Context group */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Database:</span>
        <select
          value={database}
          onChange={(e) => onDatabaseChange(e.target.value)}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="master">master</option>
          <option value="core">core</option>
          <option value="web">web</option>
        </select>
      </div>
    </div>
  );
}
