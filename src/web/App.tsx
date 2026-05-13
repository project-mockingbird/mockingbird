import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { Header } from '@/components/layout/Header';
import { StatusBar } from '@/components/layout/StatusBar';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFocusedTabState } from '@/state/useFocusedTabState';
import { useWorkspaceUrlSync } from '@/state/useWorkspaceUrlSync';
import { useWorkspaceKeyboardShortcuts } from '@/state/useWorkspaceKeyboardShortcuts';
import { useBeforeUnloadDirtyGuard } from '@/state/useBeforeUnloadDirtyGuard';
import { SettingsProvider, useSettings } from '@/settings/SettingsProvider';
import { LaunchPage } from '@/components/LaunchPage';
import { AdminLanding } from '@/components/admin/AdminLanding';
import { StatusPage } from '@/components/admin/StatusPage';
import { LogsPage } from '@/components/admin/LogsPage';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { CartPane, readPersistedCartPaneOpen } from '@/components/package/CartPane';
import { CheckoutDialog } from '@/components/package/CheckoutDialog';
import { ProjectSidebar } from '@/components/sidebar/ProjectSidebar';
import { OpenProjectWizard } from '@/components/open-project/OpenProjectWizard';
import { FirstRunChooser } from '@/components/open-project/FirstRunChooser';
import { useCloseProject } from '@/hooks/useCloseProject';
import { useOpenProject } from '@/hooks/useOpenProject';
import { useProjectsStore } from '@/state/projectsStore';
import { ProjectsStoreHydrator } from '@/state/projectsStoreHydrator';
import { useConfirmDiscardWorkspace } from '@/components/workspace/useConfirmDiscardWorkspace';
import { ConfirmDiscardWorkspaceDialog } from '@/components/workspace/ConfirmDiscardWorkspaceDialog';
import { toast } from 'sonner';

// IsePage pulls Monaco (~3.5 MB) and xterm into its dependency tree. Loading
// it lazily keeps the launch page + content tree responsive: the ISE chunk is
// fetched only when the user navigates to /scripts.
const IsePage = lazy(() => import('@/components/ise/IsePage').then(m => ({ default: m.IsePage })));

function WebSocketConnection() {
  useWebSocket();
  return null;
}

function ContentTreePage() {
  // Mounted only when pathname is on the tree route. This keeps URL <-> store
  // sync inactive while the user is on LaunchPage, so a stored selection in
  // localStorage doesn't auto-bounce them away from /.
  useWorkspaceUrlSync();
  useWorkspaceKeyboardShortcuts();
  useBeforeUnloadDirtyGuard();
  const { state, navigate } = useFocusedTabState();
  const database = state.database;
  const setDatabase = useCallback(
    (db: string) => navigate({ database: db }),
    [navigate],
  );
  const [validationOpen, setValidationOpen] = useState(false);
  // Seed cart pane open/closed from localStorage so the pane survives reloads
  // (matches the spec's "persists open/closed state" behavior).
  const [cartPaneOpen, setCartPaneOpen] = useState(() => readPersistedCartPaneOpen(false));
  // Checkout dialog open state lives at the page level: the cart pane fires
  // onCheckout, we open the dialog. The dialog itself reads the cart from
  // packageCartStore so we don't have to thread sources through.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const { settings, setSetting } = useSettings();
  const persistedSize = settings['layout.treePanelSize'];

  const onTreePanelResize = useCallback(
    (size: number) => {
      const rounded = Math.round(size * 10) / 10;
      if (rounded !== settings['layout.treePanelSize']) {
        setSetting('layout.treePanelSize', rounded);
      }
    },
    [setSetting, settings],
  );

  const { data: status } = useEngineStatus();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const close = useCloseProject();
  const openProject = useOpenProject();
  const currentProjectHash = settings['session.lastOpenedHash'];
  const touchLastOpened = useProjectsStore((s) => s.touchLastOpened);
  const discardGate = useConfirmDiscardWorkspace();

  const handleSwitch = () => setChooserOpen(true);
  const handleClose = () => {
    discardGate.request('close', () => close.mutate());
  };
  const handleOpenSaved = (project: { hash: string; name: string; layers: Array<{ sitecoreJsonPath: string; name: string; color: string }> }) => {
    const proceed = () => {
      setChooserOpen(false);
      close.mutate(undefined, {
        onSuccess: () => {
          openProject.mutate(
            { layers: project.layers, projectName: project.name },
            {
              onSuccess: () => {
                touchLastOpened(project.hash);
                setSetting('session.lastOpenedHash', project.hash);
              },
            },
          );
        },
      });
    };
    discardGate.request('switch', proceed);
  };

  const { data: validation } = useQuery({
    queryKey: ['validation'],
    // The readiness middleware returns 503 for /api/* during the brief window
    // when the engine is transitioning state (open-project, indexing). Without
    // the res.ok guard, .json() would parse the 503 body ({status, progress})
    // and React Query would cache it as the validation result, breaking any
    // consumer that expects an `errors` array. Throw on non-OK so the query
    // enters error state and consumers keep the previous good value (or
    // remain undefined until a real response arrives).
    queryFn: async () => {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`validate ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });
  const errorCount =
    validation?.errors?.filter((e: { severity: string }) => e.severity === 'error').length ?? 0;

  return (
    <div className="flex h-screen flex-col">
      <ProjectsStoreHydrator />
      <Header
        validationErrorCount={errorCount}
        onValidationClick={() => setValidationOpen(true)}
        onCartToggle={() => setCartPaneOpen((o) => !o)}
      />
      <div className="flex flex-1 min-h-0">
        <WorkspaceShell
          validationOpen={validationOpen}
          setValidationOpen={setValidationOpen}
          persistedSize={persistedSize}
          onTreePanelResize={onTreePanelResize}
        />
        {status?.state === 'ready' && status.layers && status.layers.length > 0 && (
          <ProjectSidebar
            status={{
              state: status.state,
              layers: status.layers.map((l) => ({
                name: l.name,
                sitecoreJsonPath: l.sitecoreJsonPath,
                color: l.color,
                effectiveCount: l.effectiveCount ?? 0,
              })),
              projectName: status.projectName ?? null,
            }}
            onSwitch={handleSwitch}
            onClose={handleClose}
          />
        )}
      </div>
      <FirstRunChooser
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        onCreateNew={() => {
          setChooserOpen(false);
          setWizardOpen(true);
        }}
        onOpenExisting={handleOpenSaved}
        currentProjectHash={currentProjectHash}
      />
      {wizardOpen && (
        <OpenProjectWizard
          open
          onClose={() => setWizardOpen(false)}
          initialMode="switch"
        />
      )}
      <ConfirmDiscardWorkspaceDialog
        action={discardGate.pendingAction}
        dirtyCount={discardGate.pendingDirtyCount}
        onConfirm={discardGate.onConfirm}
        onCancel={discardGate.onCancel}
      />

      <StatusBar database={database} onDatabaseChange={setDatabase} />
      <CartPane
        open={cartPaneOpen}
        onOpenChange={setCartPaneOpen}
        onCheckout={() => setCheckoutOpen(true)}
      />
      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        onSuccess={({ filename, itemCount, warnings }) => {
          const itemSuffix = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
          const warnSuffix = warnings > 0
            ? `, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`
            : '';
          toast.success(`Downloaded ${filename} (${itemSuffix}${warnSuffix})`);
        }}
        onError={(message) => toast.error(`Build failed: ${message}`)}
      />
    </div>
  );
}

// popstate-only: routing here is binary (/ vs not-/), and SPA-internal
// pushState in useNavState always stays on /tree, so it never crosses
// the routing boundary. If this hook is ever reused for finer-grained
// pathname checks, also subscribe to navChannel 'navchange'.
function useCurrentPathname(): string {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const handler = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  return pathname;
}

// Admin routes are gated by the server-side TACO=1 env flag, surfaced through
// /api/status. When the flag is off, direct navigation falls back to the
// LaunchPage so the URL doesn't reveal a hidden namespace. Server-side
// readiness/state is the source of truth - this gate is UX only.
function AdminGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useEngineStatus();
  if (isLoading) return null;
  if (data?.taco !== true) return <LaunchPage />;
  return <>{children}</>;
}

function Routes() {
  const pathname = useCurrentPathname();
  if (pathname === '/') return <LaunchPage />;
  if (pathname === '/scripts') return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading ISE...</div>}>
      <IsePage />
    </Suspense>
  );
  if (pathname === '/admin') return <AdminGate><AdminLanding /></AdminGate>;
  if (pathname === '/admin/status') return <AdminGate><StatusPage /></AdminGate>;
  if (pathname === '/admin/logs') return <AdminGate><LogsPage /></AdminGate>;
  // No TabContextProvider here: Pane (inside WorkspaceShell) wraps each
  // pane's active Workspace in a fresh TabContextProvider tabId={activeTabId}.
  // Page-level reads (e.g. StatusBar database) use useFocusedTabState to
  // track the focused-active tab rather than depending on context.
  return <ContentTreePage />;
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <SettingsProvider>
        <QueryClientProvider client={queryClient}>
          <WebSocketConnection />
          <Routes />
          <Toaster />
        </QueryClientProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
