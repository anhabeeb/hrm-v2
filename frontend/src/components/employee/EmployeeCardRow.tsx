import type { ReactNode } from "react";
import { EmployeeIdentityCell } from "./EmployeeIdentityCell";
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
  actions
}: {
  employee: Employee;
  token?: string | null;
  to: string;
  actions?: ReactNode;
}) {
  const statusLabel = employee.status_name ?? employee.status_key ?? "-";
  const tone = employeeStatusTone(employee.status_key);

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
      <div className="min-w-0 flex-1">
        <EmployeeIdentityCell
          employee={employee}
          token={token}
          size="md"
          showMetadata={false}
          employeeName={employee.full_name}
          employeeNumber={employee.employee_no}
          to={to}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[52px]">
          <MetaChip>{employee.employee_no}</MetaChip>
          {employee.department_name ? <><Dot /><MetaChip>{employee.department_name}</MetaChip></> : null}
          {employee.position_title ? <><Dot /><MetaChip>{employee.position_title}</MetaChip></> : null}
          {employee.location_name ? <><Dot /><MetaChip>{employee.location_name}</MetaChip></> : null}
          {employee.job_level_name ? <><Dot /><MetaChip>{employee.job_level_name}</MetaChip></> : null}
          <Dot /><MetaChip>{employee.employment_type}</MetaChip>
          {employee.joining_date ? <><Dot /><MetaChip>Joined {employee.joining_date}</MetaChip></> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <EmployeeStatusPill tone={employee.user_linked ? "success" : "neutral"}>
          {employee.user_linked ? "User linked" : "No user"}
        </EmployeeStatusPill>
        <EmployeeStatusPill tone={tone}>{statusLabel}</EmployeeStatusPill>
        {actions}
      </div>
    </div>
  );
}
