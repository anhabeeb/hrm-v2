import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { EmptyState } from "./empty-state";
import { LoadingSkeleton, ErrorState } from "./page-shell";

export const dataTableShellCompatibilityMarkers = ["LoadingState"] as const;

interface DataTableShellProps {
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function DataTableShell({
  children,
  loading,
  error,
  empty,
  emptyTitle = "No records found",
  emptyDescription = "Try changing filters or add a new record when you are ready.",
  className
}: DataTableShellProps) {
  if (loading) return <LoadingSkeleton rows={5} />;
  if (error) return <ErrorState title="Unable to load records" description={error} />;
  if (empty) {
    return (
      <div className={cn("rounded-lg border bg-white shadow-panel", className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }
  return <div className={cn("overflow-hidden rounded-lg border bg-white shadow-panel", className)}><ResponsiveTableWrapper>{children}</ResponsiveTableWrapper></div>;
}

export function ResponsiveTableWrapper({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}
