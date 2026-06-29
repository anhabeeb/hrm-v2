import type { ReactNode } from "react";
import { TableSkeleton } from "../loading/TableSkeleton";
import { cn } from "../../lib/utils";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./page-shell";
import { ResponsiveTableWrapper } from "./data-table-shell";

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
    return <TableSkeleton rows={5} />;
  }

  if (error) {
    return <ErrorState title="Unable to load records" description={error} />;
  }

  if (empty) {
    return (
      <div className={cn("box-border w-full max-w-none min-w-0 rounded-md border bg-white", className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return <div className={cn("box-border w-full max-w-none min-w-0 overflow-hidden rounded-md border bg-white shadow-panel", className)}><ResponsiveTableWrapper>{children}</ResponsiveTableWrapper></div>;
}
