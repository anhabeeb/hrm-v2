import { MoreVertical } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import { EmployeeIdentityCell } from "./EmployeeIdentityCell";
import { Panel } from "../ui/panel";
import { cn } from "../../lib/utils";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";
import type { Employee } from "../../types/employees";

/**
 * V3-styled replacement for a dense employee table row: an avatar-led card
 * with a wrapped meta line and a pastel status pill, instead of ten separate
 * table columns. Scoped to the Employees page — other pages keep the shared
 * Table/StatusBadge components untouched.
 */

type PillTone = "success" | "warning" | "danger" | "neutral";

const pillTones: Record<PillTone, { bg: string; text: string }> = {
  success: { bg: "var(--v3-bg-success)", text: "var(--v3-text-success)" },
  warning: { bg: "var(--v3-bg-warning)", text: "var(--v3-text-warning)" },
  danger: { bg: "var(--v3-bg-danger)", text: "var(--v3-text-danger)" },
  neutral: { bg: "var(--v3-bg-accent)", text: "var(--v3-text-accent)" }
};

export function EmployeeStatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const { bg, text } = pillTones[tone];
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        padding: "4px 12px",
        borderRadius: 999,
        background: bg,
        color: text,
        whiteSpace: "nowrap"
      }}
    >
      {children}
    </span>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <span style={{ fontSize: 12, color: "var(--v3-text-secondary)" }}>{children}</span>
  );
}

function Dot() {
  return <span style={{ color: "var(--v3-border-strong)" }}>&middot;</span>;
}

export function employeeStatusTone(key?: string | null): PillTone {
  if (key === "ACTIVE" || key === "ON_LEAVE") return "success";
  if (["DRAFT_ONBOARDING", "PENDING_SETUP", "PENDING_FINAL_VERIFICATION", "PENDING_APPROVAL", "ONBOARDING", "NOT_ACTIVE"].includes(key ?? "")) return "warning";
  if (key === "ARCHIVED") return "neutral";
  return "danger";
}

export function EmployeeCardRow({
  employee,
  token,
  to,
  colorIndex,
  actions,
  overflowActions
}: {
  employee: Employee;
  token?: string | null;
  to: string;
  colorIndex?: number;
  actions?: ReactNode;
  overflowActions?: ReactNode;
}) {
  const statusLabel = employee.status_name ?? employee.status_key ?? "-";
  const tone = employeeStatusTone(employee.status_key);

  return (
    <Panel className="flex items-center gap-4 p-3.5">
      <div className="min-w-0 flex-1">
        <EmployeeIdentityCell
          employee={employee}
          token={token}
          size="md"
          showMetadata={false}
          employeeName={employee.full_name}
          employeeNumber={employee.employee_no}
          to={to}
          colorIndex={colorIndex}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[52px]">
          <MetaChip>{employee.employee_no}</MetaChip>
          {employee.department_name ? <><Dot /><MetaChip>{employee.department_name}</MetaChip></> : null}
          <Dot /><MetaChip>{humanizeTechnicalLabel(employee.employment_type)}</MetaChip>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <EmployeeStatusPill tone={tone}>{statusLabel}</EmployeeStatusPill>
        <div className="flex items-center gap-1 border-l pl-3" style={{ borderColor: "var(--v3-border)" }}>
          {actions}
          {overflowActions ? <RowOverflowMenu>{overflowActions}</RowOverflowMenu> : null}
        </div>
      </div>
    </Panel>
  );
}

export function RowOverflowMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More actions"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <Panel className="absolute right-0 top-9 z-30 w-44 p-1" onClick={() => setOpen(false)}>
          <div className="flex flex-col">{children}</div>
        </Panel>
      ) : null}
    </div>
  );
}

export function MenuAction({
  icon: Icon,
  destructive,
  disabled,
  onClick,
  children
}: {
  icon: ComponentType<{ className?: string }>;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium disabled:pointer-events-none disabled:opacity-50",
        destructive ? "text-[#A32D2D] hover:bg-[#FCEBEB]" : "text-slate-700 hover:bg-slate-100"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
    </button>
  );
}
