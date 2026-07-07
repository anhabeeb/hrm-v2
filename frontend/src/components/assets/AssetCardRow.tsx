import type { ReactNode } from "react";

/**
 * V3-styled card/row shell shared by the Assets & Uniforms pages: a white
 * surface with a thin border and rounded corners, an optional leading icon
 * avatar, a title/meta block, and trailing content (pills/actions). Mirrors
 * the structure of EmployeeCardRow but with a generic (non-employee) leading
 * slot so it can front asset items, categories, deduction rules, and report
 * rows as well as uniform/asset assignment rows.
 */

export function AssetCardRow({
  leading,
  title,
  meta,
  trailing,
  actions
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0.9rem 1.1rem",
        background: "var(--v3-surface-2)",
        border: "0.5px solid var(--v3-border)",
        borderRadius: "var(--v3-radius-card)"
      }}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{title}</div>
        {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">{meta}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

export function AssetMetaChip({ children }: { children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return <span style={{ fontSize: 12, color: "var(--v3-text-secondary)" }}>{children}</span>;
}

export function AssetMetaDot() {
  return <span style={{ color: "var(--v3-border-strong)" }}>&middot;</span>;
}

export function AssetIconAvatar({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      style={{ background: "var(--v3-bg-accent)", color: "var(--v3-text-accent)" }}
    >
      {children}
    </div>
  );
}
