import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { EmptyState } from "./empty-state";
import { LoadingState, ErrorState } from "./page-shell";

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
  if (loading) return <LoadingState title="Loading records" description="Preparing the table data." />;
  if (error) return <ErrorState title="Unable to load records" description={error} />;
  if (empty) {
    return (
      <div className={cn("rounded-lg border bg-white shadow-panel", className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }
  return <div className={cn("overflow-hidden rounded-lg border bg-white shadow-panel", className)}><div className="overflow-x-auto">{children}</div></div>;
}
