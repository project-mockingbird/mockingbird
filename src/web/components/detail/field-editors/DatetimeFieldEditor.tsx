// src/web/components/detail/field-editors/DatetimeFieldEditor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icon } from '@/lib/icon';
import { mdiCalendar } from '@mdi/js';
import { FieldShell } from './FieldShell';

interface DatetimeFieldEditorProps {
  fieldId: string;
  label: string;
  value: string;
  editing: boolean;
  /** Datetime renders both date + time inputs. Date renders date only. */
  withTime: boolean;
  viewMode?: 'normal' | 'raw';
  onChange: (newValue: string) => void;
  onNavigate?: (id: string) => void;
}

interface ParsedDate {
  date: string;     // YYYY-MM-DD (HTML5 date input format)
  time: string;     // HH:MM (HTML5 time input format)
}

/**
 * Sitecore stores Date / Datetime fields as `YYYYMMDDTHHmmss[Z]`. Tolerates
 * the trailing `Z`, missing time portion, and extra whitespace. Returns null
 * if the value doesn't look like a Sitecore ISO date.
 */
function parseSitecoreDate(raw: string): ParsedDate | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?Z?$/);
  if (!m) return null;
  const [, y, M, d, hh, mm] = m;
  return {
    date: `${y}-${M}-${d}`,
    time: hh && mm ? `${hh}:${mm}` : '00:00',
  };
}

function serializeSitecoreDate(date: string, time: string, withTime: boolean): string {
  if (!date) return '';
  const dateOnly = date.replace(/-/g, '');
  if (!withTime) return `${dateOnly}T000000Z`;
  const timePart = (time || '00:00').replace(/:/g, '') + '00';
  return `${dateOnly}T${timePart}Z`;
}

function nowParts(): ParsedDate {
  const now = new Date();
  const yyyy = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${M}-${d}`, time: `${h}:${m}` };
}

export function DatetimeFieldEditor({ fieldId, label, value, editing, withTime, viewMode = 'normal', onChange, onNavigate }: DatetimeFieldEditorProps) {
  if (viewMode === 'raw') {
    return (
      <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-12 font-mono text-xs"
          readOnly={!editing}
        />
      </FieldShell>
    );
  }

  const parsed = parseSitecoreDate(value);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Convert YYYY-MM-DD to a Date for react-day-picker. Construct in local time
  // so the calendar highlights the correct day; UTC parsing of YYYY-MM-DD
  // can land a day earlier in negative offsets.
  const dateForPicker: Date | undefined = parsed
    ? (() => {
        const [y, m, d] = parsed.date.split('-').map(Number);
        return new Date(y, m - 1, d);
      })()
    : undefined;
  const dateLabel = parsed
    ? new Date(parsed.date + 'T00:00:00').toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : 'Select date...';

  const handleNow = () => {
    const { date, time } = nowParts();
    onChange(serializeSitecoreDate(date, time, withTime));
  };
  const handleClear = () => onChange('');
  const handleDateSelect = (selected: Date | undefined) => {
    if (!selected) {
      onChange('');
      setPopoverOpen(false);
      return;
    }
    const yyyy = selected.getFullYear();
    const M = String(selected.getMonth() + 1).padStart(2, '0');
    const d = String(selected.getDate()).padStart(2, '0');
    onChange(serializeSitecoreDate(`${yyyy}-${M}-${d}`, parsed?.time ?? '00:00', withTime));
    setPopoverOpen(false);
  };
  const handleTimeChange = (newTime: string) => {
    onChange(serializeSitecoreDate(parsed?.date ?? nowParts().date, newTime, withTime));
  };

  const linkClass = 'text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed';

  return (
    <FieldShell fieldId={fieldId} label={label} onNavigate={onNavigate}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-[11px]">
          <button type="button" onClick={handleNow} disabled={!editing} className={linkClass}>
            Now
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button type="button" onClick={handleClear} disabled={!editing || !value} className={linkClass}>
            Clear
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={popoverOpen} onOpenChange={editing ? setPopoverOpen : undefined}>
            <PopoverTrigger
              type="button"
              disabled={!editing}
              className="inline-flex items-center w-44 px-2 py-1 border border-border rounded-md bg-background text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon path={mdiCalendar} className="size-3.5 mr-2 text-muted-foreground" />
              <span className="text-left">{dateLabel}</span>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateForPicker}
                onSelect={handleDateSelect}
                captionLayout="dropdown"
              />
            </PopoverContent>
          </Popover>
          {withTime && (
            <Input
              type="time"
              value={parsed?.time ?? ''}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="text-xs w-32"
              readOnly={!editing}
            />
          )}
        </div>
        {value && !parsed && (
          <span className="text-[10px] text-amber-500/80">
            Stored value <code>{value}</code> is not in Sitecore ISO format. Switch to Raw Values to edit.
          </span>
        )}
      </div>
    </FieldShell>
  );
}
