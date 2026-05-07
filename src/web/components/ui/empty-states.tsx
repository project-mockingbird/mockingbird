
import { cn } from "@/lib/utils";
import type * as React from "react";
import { Icon } from "@/lib/icon";
import { mdiFileOutline } from "@mdi/js";

function EmptyState({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function FileLoadError({ title, error }: { title: string; error: unknown }) {
  const message =
    error instanceof Error ? error.message : error == null ? "Unknown error" : String(error);
  return (
    <EmptyState>
      <Icon path={mdiFileOutline} className="size-12 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </EmptyState>
  );
}

export { EmptyState, FileLoadError };
