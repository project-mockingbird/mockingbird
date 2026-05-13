import type { Prefs } from '@/hooks/usePrefs';

interface SettingsPopoverProps {
  autoRestoreLastSession: boolean;
  onChange: (patch: Partial<Prefs>) => void;
}

export function SettingsPopover({ autoRestoreLastSession, onChange }: SettingsPopoverProps) {
  return (
    <div className="rounded border bg-popover p-3 shadow-md w-72 text-sm">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoRestoreLastSession}
          onChange={(e) => onChange({ autoRestoreLastSession: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium block">Auto-restore last session on container start</span>
          <span className="text-xs text-muted-foreground">
            When on, mockingbird re-opens your last profile after a Docker restart. Closing a project
            clears the pointer.
          </span>
        </span>
      </label>
    </div>
  );
}
