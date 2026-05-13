import type { RecentEntry } from '@/hooks/useRecents';
import { Icon } from '@/lib/icon';
import { mdiClose } from '@mdi/js';

interface RecentsSectionProps {
  entries: RecentEntry[];
  onOpen: (entry: RecentEntry) => void;
  onRemove: (entry: RecentEntry) => void;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const deltaMs = Date.now() - then;
  const mins = Math.floor(deltaMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function RecentsSection({ entries, onOpen, onRemove }: RecentsSectionProps) {
  if (entries.length === 0) return null;
  const shown = entries.slice(0, 10);
  return (
    <div className="w-full max-w-md mt-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Recent
      </div>
      <ul className="divide-y border rounded">
        {shown.map((entry) => (
          <li key={`${entry.projectHash}/${entry.profileName}`} className="group flex items-center gap-2 p-2 text-sm">
            <div className="flex gap-0.5 shrink-0">
              {entry.layerColors.map((c, i) => (
                <span
                  key={i}
                  className="inline-block size-2 rounded-full"
                  style={{ background: c }}
                  aria-hidden
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (entry.missing) return;
                onOpen(entry);
              }}
              disabled={entry.missing}
              className={
                'flex-1 flex items-center gap-2 text-left ' +
                (entry.missing ? 'opacity-60 cursor-not-allowed' : 'hover:bg-accent rounded px-1')
              }
              title={entry.missing ? 'Profile missing - remove from recents?' : undefined}
            >
              <span className="font-medium">{entry.projectName}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {entry.profileName}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatRelative(entry.lastOpenedAt)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(entry)}
              aria-label={`Remove ${entry.projectName} / ${entry.profileName}`}
              className="opacity-0 group-hover:opacity-100 hover:bg-accent rounded p-1"
            >
              <Icon path={mdiClose} className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
