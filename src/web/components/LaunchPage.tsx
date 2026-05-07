import { Icon } from '@/lib/icon';
import { mdiFileTree, mdiGraphql, mdiPowershell, mdiShieldCrownOutline } from '@mdi/js';
import { useEngineStatus } from '@/hooks/useEngineStatus';

export function LaunchPage() {
  const { data } = useEngineStatus();
  const tacoOn = data?.taco === true;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-12 p-8 bg-background">
      <div className="flex flex-col items-center gap-4">
        <img
          src="/mockingbird-tile.svg"
          alt=""
          className="size-24"
        />
        <h1 className="text-3xl font-bold tracking-tight">Mockingbird</h1>
      </div>
      <div className={`grid gap-6 ${tacoOn ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'}`}>
        <a
          href="/tree"
          className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 w-56 transition-colors hover:bg-accent hover:border-primary"
        >
          <Icon path={mdiFileTree} className="size-16 text-foreground" />
          <span className="text-base font-medium">Content Tree</span>
        </a>
        <a
          href="/graphiql"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 w-56 transition-colors hover:bg-accent hover:border-primary"
        >
          <Icon path={mdiGraphql} className="size-16 text-foreground" />
          <span className="text-base font-medium">GraphQL Editor</span>
        </a>
        <a
          href="/scripts"
          className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 w-56 transition-colors hover:bg-accent hover:border-primary"
        >
          <Icon path={mdiPowershell} className="size-16 text-foreground" />
          <span className="text-base font-medium">PowerShell ISE</span>
        </a>
        {tacoOn ? (
          <a
            href="/admin"
            className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-10 w-56 transition-colors hover:bg-accent hover:border-primary"
          >
            <Icon path={mdiShieldCrownOutline} className="size-16 text-foreground" />
            <span className="text-base font-medium">Admin</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
