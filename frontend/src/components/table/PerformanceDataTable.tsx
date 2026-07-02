import type { ReactNode } from "react";
import { TableSkeleton } from "../loading/TableSkeleton";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/page-shell";
import { cn } from "../../lib/utils";
import { shouldVirtualizeRows } from "../../lib/tablePerformance";
import { TableLoadingOverlay } from "./TableLoadingOverlay";

interface PerformanceDataTableProps {
  children: ReactNode;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  empty?: boolean;
  rowCount?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  skeletonRows?: number;
  skeletonColumns?: number;
  skeleton?: ReactNode;
}

export function PerformanceDataTable({
  children,
  loading,
  refreshing,
  error,
  empty,
  rowCount = 0,
  emptyTitle = "No rows found",
  emptyDescription = "Try changing filters or page settings.",
  className,
  skeletonRows = 5,
  skeletonColumns = 6,
  skeleton
}: PerformanceDataTableProps) {
  if (loading) return skeleton ?? <TableSkeleton rows={skeletonRows} columns={skeletonColumns} label="Loading table rows" />;
  if (error) return <ErrorState title="Unable to load table" description={error} />;
  if (empty) return <div className={cn("box-border w-full max-w-none min-w-0 rounded-lg border bg-white shadow-panel", className)}><EmptyState title={emptyTitle} description={emptyDescription} /></div>;
  const virtualized = shouldVirtualizeRows(rowCount);
  return (
    <div
      className={cn("relative box-border w-full max-w-none min-w-0 overflow-hidden rounded-lg border bg-white shadow-panel", className)}
      data-performance-table
      data-virtualization-threshold={virtualized ? "active" : "page-size-capped"}
    >
      <TableLoadingOverlay show={refreshing} />
      <div className="box-border w-full max-w-none min-w-0 overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
