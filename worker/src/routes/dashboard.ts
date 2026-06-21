import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import type { AppBindings } from "../types";
import { ok } from "../utils/http";

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.use("*", requireAuth);

function hasPermission(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

async function count(db: D1Database, sql: string, ...bindings: unknown[]) {
  const row = await db.prepare(sql).bind(...bindings).first<{ value: number }>();
  return Number(row?.value ?? 0);
}

dashboardRoutes.get("/", requirePermission("dashboard.view"), async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const db = c.env.DB;

  const employeesAllowed = hasPermission(c, "employees.view");
  const documentsAllowed = hasPermission(c, "documents.view");
  const leaveAllowed = hasPermission(c, "leave.view");
  const attendanceAllowed = hasPermission(c, "attendance.view");
  const rosterAllowed = hasPermission(c, "roster.view");
  const payrollAllowed = hasPermission(c, "payroll.view");
  const assetsAllowed = hasPermission(c, "assets.view");
  const auditAllowed = hasPermission(c, "audit.view");

  const employees = employeesAllowed
    ? {
        total_employees: await count(db, "SELECT COUNT(*) AS value FROM employees"),
        active_employees: await count(
          db,
          "SELECT COUNT(*) AS value FROM employees e JOIN employee_statuses s ON s.id = e.status_id WHERE s.key = 'ACTIVE' AND e.archived_at IS NULL"
        ),
        onboarding_employees: await count(
          db,
          "SELECT COUNT(*) AS value FROM employees e JOIN employee_statuses s ON s.id = e.status_id WHERE s.key = 'DRAFT_ONBOARDING' AND e.archived_at IS NULL"
        ),
        employees_by_department: (
          await db
            .prepare(
              `SELECT COALESCE(d.name, 'Unassigned') AS label, COUNT(*) AS value
               FROM employees e LEFT JOIN departments d ON d.id = e.primary_department_id
               WHERE e.archived_at IS NULL GROUP BY COALESCE(d.name, 'Unassigned') ORDER BY value DESC LIMIT 8`
            )
            .all()
        ).results,
        employees_by_location: (
          await db
            .prepare(
              `SELECT COALESCE(l.name, 'Unassigned') AS label, COUNT(*) AS value
               FROM employees e LEFT JOIN locations l ON l.id = e.primary_location_id
               WHERE e.archived_at IS NULL GROUP BY COALESCE(l.name, 'Unassigned') ORDER BY value DESC LIMIT 8`
            )
            .all()
        ).results,
        employees_by_status: (
          await db
            .prepare(
              `SELECT s.name AS label, COUNT(*) AS value
               FROM employees e JOIN employee_statuses s ON s.id = e.status_id
               GROUP BY s.name ORDER BY value DESC LIMIT 8`
            )
            .all()
        ).results
      }
    : null;

  const documents = documentsAllowed
    ? {
        missing_required_documents: await count(
          db,
          `SELECT COUNT(*) AS value
           FROM document_required_rules r
           JOIN employees e ON e.archived_at IS NULL
           WHERE r.is_active = 1
             AND (r.employee_type IS NULL OR r.employee_type = e.employee_type)
             AND (r.employment_type IS NULL OR r.employment_type = e.employment_type)
             AND (r.department_id IS NULL OR r.department_id = e.primary_department_id)
             AND (r.position_id IS NULL OR r.position_id = e.primary_position_id)
             AND (r.location_id IS NULL OR r.location_id = e.primary_location_id)
             AND NOT EXISTS (
               SELECT 1 FROM employee_documents ed
               WHERE ed.employee_id = e.id AND ed.document_type_id = r.document_type_id AND ed.status = 'ACTIVE'
             )`
        ),
        expiring_documents: await count(db, "SELECT COUNT(*) AS value FROM employee_documents WHERE status = 'ACTIVE' AND expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= date(?, '+30 day')", today, today),
        expired_documents: await count(db, "SELECT COUNT(*) AS value FROM employee_documents WHERE status = 'ACTIVE' AND expiry_date IS NOT NULL AND expiry_date < ?", today),
        recent_document_uploads: (
          await db
            .prepare(
              `SELECT e.employee_no, e.full_name AS employee_name, dt.name AS document_type_name, ed.created_at
               FROM employee_documents ed
               JOIN employees e ON e.id = ed.employee_id
               JOIN document_types dt ON dt.id = ed.document_type_id
               WHERE ed.status = 'ACTIVE' AND COALESCE(ed.is_sensitive, dt.is_sensitive, 0) = 0
               ORDER BY ed.created_at DESC LIMIT 5`
            )
            .all()
        ).results
      }
    : null;

  const leave = leaveAllowed
    ? {
        pending_leave_approvals: await count(db, "SELECT COUNT(*) AS value FROM leave_request_approvals WHERE status = 'PENDING'"),
        employees_currently_on_leave: await count(db, "SELECT COUNT(DISTINCT employee_id) AS value FROM leave_requests WHERE status = 'APPROVED' AND start_date <= ? AND end_date >= ?", today, today),
        upcoming_leave: await count(db, "SELECT COUNT(*) AS value FROM leave_requests WHERE status IN ('APPROVED','PENDING_APPROVAL') AND start_date > ?", today),
        leave_requests_missing_required_documents: await count(db, "SELECT COUNT(*) AS value FROM leave_requests WHERE document_required = 1 AND document_status = 'REQUIRED_PENDING'")
      }
    : null;

  const attendance = attendanceAllowed
    ? {
        today_present: await count(db, "SELECT COUNT(*) AS value FROM attendance_daily_records WHERE attendance_date = ? AND status IN ('PRESENT','LATE','HALF_DAY')", today),
        today_absent: await count(db, "SELECT COUNT(*) AS value FROM attendance_daily_records WHERE attendance_date = ? AND status = 'ABSENT'", today),
        today_late: await count(db, "SELECT COUNT(*) AS value FROM attendance_daily_records WHERE attendance_date = ? AND COALESCE(late_minutes, 0) > 0", today),
        pending_corrections: await count(db, "SELECT COUNT(*) AS value FROM attendance_correction_requests WHERE status = 'SUBMITTED'"),
        missed_punches_today: await count(db, "SELECT COUNT(*) AS value FROM attendance_daily_records WHERE attendance_date = ? AND missed_punch = 1", today)
      }
    : null;

  const roster = rosterAllowed
    ? {
        current_week_roster_status: (await db.prepare("SELECT status FROM roster_periods ORDER BY week_start_date DESC LIMIT 1").first<{ status: string }>())?.status ?? "NOT_PREPARED",
        employees_scheduled_this_week: await count(db, "SELECT COUNT(DISTINCT employee_id) AS value FROM roster_assignments WHERE status = 'SCHEDULED' AND roster_date >= date(?, 'weekday 1', '-7 days') AND roster_date < date(?, 'weekday 1')", today, today),
        unassigned_employees_this_week: await count(db, "SELECT COUNT(*) AS value FROM roster_assignments WHERE status = 'UNASSIGNED' AND roster_date >= date(?, 'weekday 1', '-7 days') AND roster_date < date(?, 'weekday 1')", today, today),
        employees_on_leave_this_week: await count(db, "SELECT COUNT(DISTINCT employee_id) AS value FROM roster_assignments WHERE status = 'LEAVE' AND roster_date >= date(?, 'weekday 1', '-7 days') AND roster_date < date(?, 'weekday 1')", today, today)
      }
    : null;

  const payroll = payrollAllowed
    ? {
        current_payroll_period: await db.prepare("SELECT id, period_month, period_year, start_date, end_date, salary_payment_date, status FROM payroll_periods ORDER BY period_year DESC, period_month DESC LIMIT 1").first(),
        draft_payroll_runs: await count(db, "SELECT COUNT(*) AS value FROM payroll_runs WHERE status = 'DRAFT'"),
        approved_payroll_runs: await count(db, "SELECT COUNT(*) AS value FROM payroll_runs WHERE status = 'APPROVED'"),
        paid_payroll_runs: await count(db, "SELECT COUNT(*) AS value FROM payroll_runs WHERE status = 'PAID'"),
        pending_advances: await count(db, "SELECT COUNT(*) AS value FROM payroll_advance_payments WHERE status IN ('REQUESTED','APPROVED')"),
        payroll_holds: await count(db, "SELECT COUNT(*) AS value FROM payroll_run_employees WHERE status = 'HELD'"),
        attendance_deduction_candidates: await count(db, "SELECT COUNT(*) AS value FROM attendance_daily_records WHERE payroll_impact_json IS NOT NULL"),
        leave_deduction_candidates: await count(db, "SELECT COUNT(*) AS value FROM leave_requests WHERE salary_deduction_mode IS NOT NULL AND salary_deduction_mode <> 'NONE'")
      }
    : null;

  const assets = assetsAllowed
    ? {
        issued_assets: await count(db, "SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE status = 'ISSUED'"),
        pending_returns: await count(db, "SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE status = 'ISSUED' AND expected_return_date IS NOT NULL AND expected_return_date < ?", today),
        damaged_assets: await count(db, "SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE status = 'DAMAGED'"),
        lost_assets: await count(db, "SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE status = 'LOST'"),
        asset_deductions_pending: await count(db, "SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE deduction_amount IS NOT NULL AND payroll_deduction_id IS NULL")
      }
    : null;

  const audit = auditAllowed
    ? {
        recent_audit_activity: (
          await db
            .prepare(
              `SELECT a.id, u.name AS actor_name, a.action, a.module, a.entity_type, a.entity_id, a.created_at
               FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
               ORDER BY a.created_at DESC LIMIT 8`
            )
            .all()
        ).results,
        sensitive_actions_count: await count(db, "SELECT COUNT(*) AS value FROM audit_logs WHERE action LIKE '%sensitive%' OR module IN ('documents','employee_notes','payroll')")
      }
    : null;

  return ok(c, {
    employees,
    documents,
    leave,
    attendance,
    roster,
    payroll,
    assets,
    audit,
    quick_links: [
      { label: "Missing documents", to: "/documents/missing", permission: "documents.view" },
      { label: "Pending leave approvals", to: "/leave/approvals", permission: "leave.view" },
      { label: "Attendance corrections", to: "/attendance/corrections", permission: "attendance.view" },
      { label: "Payroll holds", to: "/payroll/runs", permission: "payroll.view" },
      { label: "Unassigned roster", to: "/roster/weekly", permission: "roster.view" },
      { label: "Pending asset returns", to: "/assets/assignments", permission: "assets.view" },
      { label: "Audit log", to: "/audit", permission: "audit.view" }
    ]
  });
});
