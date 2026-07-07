import type { ReactNode } from "react";
import { EmptyState } from "../ui/empty-state";

/**
 * V3-styled replacement for a dense "one row per record, one column per field"
 * admin/settings table. Renders each record as a thin-bordered card with a
 * title line and a wrapped label/value meta line, matching EmployeeCardRow's
 * visual pattern. Meant for the many Settings/Admin/Reports pages that render
 * arbitrary Record<string, unknown> rows against a fixed column list.
 */

export type KeyValueField = {
  label: string;
  value: ReactNode;
};

export function KeyValueCardRow({
  title,
  subtitle,
  fields,
  badge,
  actions
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  fields: KeyValueField[];
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "0.9rem 1.1rem",
        background: "var(--v3-surface-2)",
        border: "0.5px solid var(--v3-border)",
        borderRadius: "var(--v3-radius-card)"
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" style={{ color: "var(--v3-text-primary)" }}>{title}</div>
          {subtitle ? <div className="mt-0.5 truncate text-xs" style={{ color: "var(--v3-text-secondary)" }}>{subtitle}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          {actions}
        </div>
      </div>
      {fields.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {fields.map((field, index) => (
            <div key={`${field.label}-${index}`} className="flex min-w-0 items-baseline gap-1.5 text-xs">
              <span className="shrink-0" style={{ color: "var(--v3-text-muted)" }}>{field.label}</span>
              <span className="truncate font-medium" style={{ color: "var(--v3-text-secondary)" }}>{field.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CardRowList({ children, empty, emptyTitle, emptyDescription }: { children: ReactNode; empty: boolean; emptyTitle: string; emptyDescription?: string }) {
  if (empty) return <EmptyState title={emptyTitle} description={emptyDescription ?? "No rows are available yet."} />;
  return <div className="flex flex-col gap-2 p-2">{children}</div>;
}
