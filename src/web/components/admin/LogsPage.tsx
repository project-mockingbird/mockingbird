import { useState } from 'react';
import { ServerLogTab } from './ServerLogTab';
import { GraphqlLogTab } from './GraphqlLogTab';

type TabId = 'server' | 'graphql';

export function LogsPage() {
  const [tab, setTab] = useState<TabId>('server');

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="px-6 py-4 flex items-center gap-4 border-b">
        <a href="/" aria-label="Home" className="inline-flex items-center gap-3">
          <img src="/mockingbird-tile.svg" alt="" className="size-10" />
          <span className="font-semibold text-xl">Mockingbird</span>
        </a>
        <h1 className="text-lg font-semibold">Logs</h1>
      </div>
      <div role="tablist" className="flex border-b bg-card">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'server'}
          onClick={() => setTab('server')}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            tab === 'server' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Server
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'graphql'}
          onClick={() => setTab('graphql')}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            tab === 'graphql' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          GraphQL
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'server' ? <ServerLogTab /> : <GraphqlLogTab />}
      </div>
    </div>
  );
}
