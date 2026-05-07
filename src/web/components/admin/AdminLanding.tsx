import { Icon } from '@/lib/icon';
import { mdiHeartPulse, mdiTextBoxOutline } from '@mdi/js';

export function AdminLanding() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="px-6 py-4">
        <a href="/" aria-label="Home" className="inline-flex items-center gap-3">
          <img src="/mockingbird-tile.svg" alt="" className="size-10" />
          <span className="font-semibold text-xl">Mockingbird</span>
        </a>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-12 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <div className="grid grid-cols-2 gap-6">
          <a
            href="/admin/status"
            className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 w-56 transition-colors hover:bg-accent hover:border-primary"
          >
            <Icon path={mdiHeartPulse} className="size-16 text-foreground" />
            <span className="text-base font-medium">Status</span>
          </a>
          <a
            href="/admin/logs"
            className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 w-56 transition-colors hover:bg-accent hover:border-primary"
          >
            <Icon path={mdiTextBoxOutline} className="size-16 text-foreground" />
            <span className="text-base font-medium">Logs</span>
          </a>
        </div>
      </div>
    </div>
  );
}
