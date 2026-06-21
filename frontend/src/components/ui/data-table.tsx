import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { EmptyState } from "./empty-state";

interface DataTableFrameProps {
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function DataTableFrame({
  children,
  loading,
  error,
  empty,
  emptyTitle = "No rows found",
  emptyDescription = "Try adjusting filters or check back after records are added.",
  className
}: DataTableFrameProps) {
  if (loading) {
    return <div className={cn("rounded-md border bg-white px-4 py-8 text-center text-sm text-muted-foreground", className)}>Loading records...</div>;
  }

  if (error) {
    return <div className={cn("rounded-md border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700", className)}>{error}</div>;
  }

  if (empty) {
    return (
      <div className={cn("rounded-md border bg-white", className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return <div className={cn("overflow-x-auto rounded-md border bg-white", className)}>{children}</div>;
}
