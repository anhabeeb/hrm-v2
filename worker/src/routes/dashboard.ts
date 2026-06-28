import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, type EmployeeScopeFilter } from "../auth/access-scopes";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import type { AppBindings } from "../types";
import { ok } from "../utils/http";

export const dashboardRoutes = new Hono<AppBindings>();

dashboardRoutes.use("*", requireAuth);

type DashboardTone = "neutral" | "success" | "warning" | "danger" | "info";

interface DashboardKpi {
  id: string;
  title: string;
  value: number | string;
  description: string;
  tone: DashboardTone;
  icon_key: string;
  route: string;
  secondary_value?: string | number | null;
}

interface DashboardGroup {
  key: string;
  title: string;
  enabled: boolean;
  available: boolean;
  warning?: string;
  kpis: DashboardKpi[];
}

interface PriorityAction {
  id: string;
  title: string;
  description: string;
  count: number;
  tone: DashboardTone;
  icon_key: string;
  route: string;
}

interface ModuleEnablement {
  attendance: boolean;
  attendance_zkteco: boolean;
  leave: boolean;
  payroll: boolean;
  payroll_payslips: boolean;
  payroll_payment_register: boolean;
  payroll_employee_advances: boolean;
  payroll_bank_loans: boolean;
  payroll_pension: boolean;
  payroll_custom_deductions: boolean;
  documents: boolean;
  contracts: boolean;
  approvals: boolean;
  onboarding: boolean;
  offboarding: boolean;
  assets: boolean;
  uniforms: boolean;
}

dashboardRoutes.get("/command-center-summary", requirePermission("dashboard.view"), async (c) => ok(c, await buildCommandCenterSummary(c)));
dashboardRoutes.get("/", requirePermission("dashboard.view"), async (c) => ok(c, await buildCommandCenterSummary(c)));

function hasPermission(c: Context<AppBindings>, permission: string) {
  const user = c.get("currentUser");
  return user.is_owner || user.permissions.includes(permission);
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  return permissions.some((permission) => hasPermission(c, permission));
}

async function count(db: D1Database, sql: string, ...bindings: unknown[]) {
  const row = await db.prepare(sql).bind(...bindings).first<{ value: number }>();
  return Number(row?.value ?? 0);
}

function scopedEmployeeIds(scope: EmployeeScopeFilter) {
  return `SELECT e.id FROM employees e WHERE ${scope.sql}`;
}

function bool(value: unknown, fallback = true) {
  if (value === null || value === undefined) return fallback;
  return Number(value) === 1 || value === true || value === "1";
}

function monthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10)
  };
}

async function settingEnabled(db: D1Database, table: string, id: string, column: string, fallback = true) {
  try {
    const row = await db.prepare(`SELECT ${column} AS value FROM ${table} WHERE id = ?`).bind(id).first<{ value: unknown }>();
    return bool(row?.value, fallback);
  } catch {
    return fallback;
  }
}

async function moduleControlEnabled(db: D1Database, moduleKey: string, fallback = true) {
  try {
    const row = await db.prepare("SELECT is_enabled, status FROM module_control_settings WHERE module_key = ?").bind(moduleKey).first<{ is_enabled: unknown; status: string | null }>();
    if (!row) return fallback;
    return bool(row.is_enabled, fallback) && String(row.status ?? "ACTIVE") !== "DISABLED";
  } catch {
    return fallback;
  }
}

async function getEnabledModules(db: D1Database): Promise<ModuleEnablement> {
  const [
    attendanceControl,
    leaveControl,
    payrollControl,
    documentsControl,
    contractsControl,
    approvalsControl,
    onboardingControl,
    offboardingControl,
    assetsControl,
    attendanceSettings,
    zktecoSettings,
    rosterIgnored,
    payrollSettings,
    contractSettings,
    approvalSettings,
    onboardingSettings,
    offboardingSettings,
    assetSettings,
    uniformSettings
  ] = await Promise.all([
    moduleControlEnabled(db, "attendance"),
    moduleControlEnabled(db, "leave"),
    moduleControlEnabled(db, "payroll"),
    moduleControlEnabled(db, "documents"),
    moduleControlEnabled(db, "contracts"),
    moduleControlEnabled(db, "approvals"),
    moduleControlEnabled(db, "onboarding"),
    moduleControlEnabled(db, "offboarding"),
    moduleControlEnabled(db, "assets"),
    settingEnabled(db, "attendance_settings", "attendance_settings_default", "module_enabled", true),
    settingEnabled(db, "attendance_device_settings", "attendance_device_settings_default", "zkteco_csv_import_enabled", true),
    settingEnabled(db, "roster_settings", "roster_settings_default", "module_enabled", true),
    getPayrollEnablement(db),
    settingEnabled(db, "contract_settings", "contract_settings_default", "contracts_enabled", true),
    settingEnabled(db, "approval_workflow_settings", "approval_workflow_settings_default", "approval_workflows_enabled", true),
    settingEnabled(db, "onboarding_settings", "onboarding_settings_default", "onboarding_enabled", true),
    settingEnabled(db, "offboarding_settings", "offboarding_settings_default", "offboarding_enabled", true),
    settingEnabled(db, "asset_uniform_settings", "asset_uniform_settings_default", "asset_module_enabled", true),
    settingEnabled(db, "asset_uniform_settings", "asset_uniform_settings_default", "uniform_module_enabled", true)
  ]);
  void rosterIgnored;

  return {
    attendance: attendanceControl && attendanceSettings,
    attendance_zkteco: attendanceControl && attendanceSettings && zktecoSettings,
    leave: leaveControl,
    payroll: payrollControl && payrollSettings.module_enabled,
    payroll_payslips: payrollControl && payrollSettings.module_enabled && payrollSettings.payslips_enabled,
    payroll_payment_register: payrollControl && payrollSettings.module_enabled && payrollSettings.payment_register_enabled,
    payroll_employee_advances: payrollControl && payrollSettings.module_enabled && payrollSettings.employee_advances_enabled,
    payroll_bank_loans: payrollControl && payrollSettings.module_enabled && payrollSettings.bank_loan_deductions_enabled,
    payroll_pension: payrollControl && payrollSettings.module_enabled && payrollSettings.pension_enabled,
    payroll_custom_deductions: payrollControl && payrollSettings.module_enabled && payrollSettings.custom_deductions_enabled,
    documents: documentsControl,
    contracts: contractsControl && contractSettings,
    approvals: approvalsControl && approvalSettings,
    onboarding: onboardingControl && onboardingSettings,
    offboarding: offboardingControl && offboardingSettings,
    assets: assetsControl && assetSettings,
    uniforms: assetsControl && uniformSettings
  };
}

async function getPayrollEnablement(db: D1Database) {
  try {
    const row = await db.prepare(
      `SELECT module_enabled, payslips_enabled, payment_register_enabled, employee_advances_enabled,
              bank_loan_deductions_enabled, pension_enabled, custom_deductions_enabled
       FROM payroll_settings WHERE id = 'payroll_settings_default'`
    ).first<Record<string, unknown>>();
    return {
      module_enabled: bool(row?.module_enabled, true),
      payslips_enabled: bool(row?.payslips_enabled, true),
      payment_register_enabled: bool(row?.payment_register_enabled, true),
      employee_advances_enabled: bool(row?.employee_advances_enabled, true),
      bank_loan_deductions_enabled: bool(row?.bank_loan_deductions_enabled, true),
      pension_enabled: bool(row?.pension_enabled, true),
      custom_deductions_enabled: bool(row?.custom_deductions_enabled, true)
    };
  } catch {
    return {
      module_enabled: true,
      payslips_enabled: true,
      payment_register_enabled: true,
      employee_advances_enabled: true,
      bank_loan_deductions_enabled: true,
      pension_enabled: true,
      custom_deductions_enabled: true
    };
  }
}

async function safeDashboardSummaryGroup(key: string, title: string, enabled: boolean, load: () => Promise<DashboardKpi[]>): Promise<DashboardGroup> {
  if (!enabled) return { key, title, enabled: false, available: false, kpis: [] };
  try {
    return { key, title, enabled: true, available: true, kpis: await load() };
  } catch (error) {
    console.warn("Command center dashboard group failed", { key, message: error instanceof Error ? error.message : String(error) });
    return {
      key,
      title,
      enabled: true,
      available: false,
      warning: "This summary is temporarily unavailable.",
      kpis: []
    };
  }
}

function kpi(id: string, title: string, value: number | string, description: string, tone: DashboardTone, icon_key: string, route: string, secondaryValue?: string | number | null): DashboardKpi {
  return { id, title, value, description, tone, icon_key, route, secondary_value: secondaryValue ?? null };
}

function priority(id: string, title: string, description: string, countValue: number, tone: DashboardTone, icon_key: string, route: string): PriorityAction {
  return { id, title, description, count: Math.max(0, Number(countValue) || 0), tone, icon_key, route };
}

async function countPayrollRuns(db: D1Database, scope: EmployeeScopeFilter, status: string) {
  if (scope.unrestricted) {
    return count(db, "SELECT COUNT(*) AS value FROM payroll_runs WHERE status = ?", status);
  }
  return count(
    db,
    `SELECT COUNT(DISTINCT pr.id) AS value
     FROM payroll_runs pr
     JOIN payroll_employee_results per ON per.payroll_run_id = pr.id
     WHERE pr.status = ? AND per.employee_id IN (${scopedEmployeeIds(scope)})`,
    status,
    ...scope.params
  );
}

async function buildCommandCenterSummary(c: Context<AppBindings>) {
  const db = c.env.DB;
  const currentUser = c.get("currentUser");
  const today = new Date().toISOString().slice(0, 10);
  const { start: monthStart, next: nextMonthStart } = monthWindow();
  const enabledModules = await getEnabledModules(db);
  const priorityActions: PriorityAction[] = [];

  const [employeeScope, documentScope, leaveScope, attendanceScope, payrollScope, assetScope] = await Promise.all([
    buildEmployeeScopeWhereClause(db, currentUser, "employees", "view", "e"),
    buildEmployeeScopeWhereClause(db, currentUser, "documents", "view", "e"),
    buildEmployeeScopeWhereClause(db, currentUser, "leave", "view", "e"),
    buildEmployeeScopeWhereClause(db, currentUser, "attendance", "view", "e"),
    buildEmployeeScopeWhereClause(db, currentUser, "payroll", "view", "e"),
    buildEmployeeScopeWhereClause(db, currentUser, "assets", "view", "e")
  ]);

  const groups = {
    workforce: await safeDashboardSummaryGroup("workforce", "Workforce", hasAny(c, ["employees.view"]), async () => {
      const canViewOnboardingPriority = enabledModules.onboarding && hasAny(c, ["onboarding.cases.view", "onboarding.dashboard.view", "employees.lifecycle.view"]);
      const canViewOffboardingPriority = enabledModules.offboarding && hasAny(c, ["offboarding.cases.view", "offboarding.dashboard.view", "employees.lifecycle.view"]);
      const onboardingCount = canViewOnboardingPriority
        ? await count(db, `SELECT COUNT(*) AS value FROM employee_onboarding_cases oc JOIN employees e ON e.id = oc.employee_id WHERE ${employeeScope.sql} AND oc.activation_status != 'ACTIVATED' AND oc.onboarding_status != 'CANCELLED'`, ...employeeScope.params)
        : 0;
      const offboardingCount = canViewOffboardingPriority
        ? await count(db, `SELECT COUNT(*) AS value FROM employee_offboarding_cases oc JOIN employees e ON e.id = oc.employee_id WHERE ${employeeScope.sql} AND oc.finalization_status != 'FINALIZED' AND oc.offboarding_status != 'CANCELLED'`, ...employeeScope.params)
        : 0;
      const exitingThisMonth = await count(db, `SELECT COUNT(*) AS value FROM employees e WHERE ${employeeScope.sql} AND e.exit_date >= ? AND e.exit_date < ?`, ...employeeScope.params, monthStart, nextMonthStart);
      if (canViewOnboardingPriority) priorityActions.push(priority("complete-onboarding", "Complete onboarding cases", "Open employees waiting for activation readiness.", onboardingCount, "warning", "check-circle", "/onboarding/cases?status=active"));
      if (canViewOffboardingPriority) priorityActions.push(priority("complete-offboarding", "Complete offboarding cases", "Open exit cases that still need clearance or finalization.", offboardingCount, "warning", "archive", "/offboarding/cases?status=active"));
      const cards = [
        kpi("total-employees", "Total Employees", await count(db, `SELECT COUNT(*) AS value FROM employees e WHERE ${employeeScope.sql} AND e.archived_at IS NULL`, ...employeeScope.params), "Employees visible inside your access scope.", "info", "users", "/employees"),
        kpi("active-employees", "Active Employees", await count(db, `SELECT COUNT(*) AS value FROM employees e JOIN employee_statuses s ON s.id = e.status_id WHERE ${employeeScope.sql} AND s.key = 'ACTIVE' AND e.archived_at IS NULL`, ...employeeScope.params), "Currently active employee records.", "success", "user-check", "/employees?status=ACTIVE")
      ];
      if (enabledModules.onboarding) cards.push(kpi("onboarding-employees", "Onboarding Employees", onboardingCount, "Active onboarding setup cases.", onboardingCount > 0 ? "warning" : "neutral", "check-circle", "/onboarding/cases?status=active"));
      if (enabledModules.offboarding) cards.push(kpi("offboarding-employees", "Offboarding Employees", offboardingCount, "Active exit and clearance cases.", offboardingCount > 0 ? "warning" : "neutral", "archive", "/offboarding/cases?status=active"));
      cards.push(kpi("new-joiners-month", "New Joiners This Month", await count(db, `SELECT COUNT(*) AS value FROM employees e WHERE ${employeeScope.sql} AND e.joining_date >= ? AND e.joining_date < ?`, ...employeeScope.params, monthStart, nextMonthStart), "Employees with joining dates this month.", "info", "user-plus", `/employees?joined_from=${monthStart}&joined_to=${nextMonthStart}`));
      cards.push(kpi("exiting-month", "Employees Exiting This Month", exitingThisMonth, "Employees with exit dates this month.", exitingThisMonth > 0 ? "warning" : "neutral", "log-out", `/employees?exit_from=${monthStart}&exit_to=${nextMonthStart}`));
      return cards;
    }),
    attendance: await safeDashboardSummaryGroup("attendance", "Attendance", enabledModules.attendance && hasAny(c, ["attendance.view"]), async () => {
      const pendingCorrections = await count(db, `SELECT COUNT(*) AS value FROM attendance_correction_requests WHERE employee_id IN (${scopedEmployeeIds(attendanceScope)}) AND status IN ('PENDING','SUBMITTED')`, ...attendanceScope.params);
      priorityActions.push(priority("resolve-attendance-corrections", "Resolve attendance corrections", "Review pending correction requests before payroll lock.", pendingCorrections, "warning", "calendar-check", "/attendance/corrections?status=PENDING"));
      return [
        kpi("present-today", "Present Today", await count(db, `SELECT COUNT(*) AS value FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeIds(attendanceScope)}) AND attendance_date = ? AND status IN ('PRESENT','LATE','HALF_DAY','EARLY_LEAVE')`, ...attendanceScope.params, today), "Present, late, half-day, and early-leave records today.", "success", "calendar-check", `/attendance/records?date=${today}`),
        kpi("absent-today", "Absent Today", await count(db, `SELECT COUNT(*) AS value FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeIds(attendanceScope)}) AND attendance_date = ? AND status = 'ABSENT'`, ...attendanceScope.params, today), "Absent records for today.", "danger", "calendar-x", `/attendance/records?date=${today}&status=ABSENT`),
        kpi("late-today", "Late Today", await count(db, `SELECT COUNT(*) AS value FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeIds(attendanceScope)}) AND attendance_date = ? AND COALESCE(late_minutes, 0) > 0`, ...attendanceScope.params, today), "Employees with late minutes today.", "warning", "clock", `/attendance/records?date=${today}&status=LATE`),
        kpi("missed-punches", "Missed Punches", await count(db, `SELECT COUNT(*) AS value FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeIds(attendanceScope)}) AND attendance_date = ? AND missed_punch = 1`, ...attendanceScope.params, today), "Missing clock-in or clock-out records today.", "warning", "scan-line", `/attendance/records?date=${today}&status=MISSING_PUNCH`),
        kpi("pending-corrections", "Pending Attendance Corrections", pendingCorrections, "Corrections waiting for review.", pendingCorrections > 0 ? "warning" : "neutral", "edit", "/attendance/corrections?status=PENDING"),
        kpi("manual-entries", "Manual Attendance Entries Today", await count(db, `SELECT COUNT(*) AS value FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeIds(attendanceScope)}) AND attendance_date = ? AND source IN ('MANUAL','CORRECTION')`, ...attendanceScope.params, today), "Manual or correction-created records today.", "info", "clipboard-edit", `/attendance/records?date=${today}&source=MANUAL`)
      ];
    }),
    leave: await safeDashboardSummaryGroup("leave", "Leave", enabledModules.leave && hasAny(c, ["leave.view"]), async () => {
      const pendingLeave = await count(db, `SELECT COUNT(*) AS value FROM leave_requests WHERE employee_id IN (${scopedEmployeeIds(leaveScope)}) AND status IN ('SUBMITTED','PENDING_APPROVAL')`, ...leaveScope.params);
      const missingDocs = await count(db, `SELECT COUNT(*) AS value FROM leave_requests WHERE employee_id IN (${scopedEmployeeIds(leaveScope)}) AND document_status = 'REQUIRED_PENDING'`, ...leaveScope.params);
      priorityActions.push(
        priority("review-pending-leave", "Review pending leave", "Open submitted leave requests and approval queues.", pendingLeave, "warning", "clipboard-list", "/leave/approvals?status=PENDING_APPROVAL"),
        priority("leave-documents", "Review leave document gaps", "Open leave requests that still need supporting documents.", missingDocs, "warning", "file-warning", "/leave/requests?document_status=REQUIRED_PENDING")
      );
      return [
        kpi("on-leave-today", "Employees On Leave Today", await count(db, `SELECT COUNT(DISTINCT employee_id) AS value FROM leave_requests WHERE employee_id IN (${scopedEmployeeIds(leaveScope)}) AND status = 'APPROVED' AND start_date <= ? AND end_date >= ?`, ...leaveScope.params, today, today), "Approved leave covering today.", "info", "calendar-days", `/leave/calendar?date=${today}`),
        kpi("pending-leave", "Pending Leave Requests", pendingLeave, "Submitted or approval-pending requests.", pendingLeave > 0 ? "warning" : "neutral", "clipboard-list", "/leave/approvals?status=PENDING_APPROVAL"),
        kpi("approved-month", "Approved Leave This Month", await count(db, `SELECT COUNT(*) AS value FROM leave_requests WHERE employee_id IN (${scopedEmployeeIds(leaveScope)}) AND status = 'APPROVED' AND start_date >= ? AND start_date < ?`, ...leaveScope.params, monthStart, nextMonthStart), "Approved leave starting this month.", "success", "check-circle", `/leave/requests?status=APPROVED&from=${monthStart}&to=${nextMonthStart}`),
        kpi("long-leave", "Long Leave Cases", await count(db, `SELECT COUNT(*) AS value FROM leave_requests lr LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.employee_id IN (${scopedEmployeeIds(leaveScope)}) AND lr.status IN ('SUBMITTED','PENDING_APPROVAL','APPROVED') AND (lt.code = 'LONG_LEAVE' OR lt.name LIKE '%Long%')`, ...leaveScope.params), "Active long leave workflows.", "info", "calendar-range", "/leave/requests?type=LONG_LEAVE"),
        kpi("leave-docs", "Leave Requests Needing Documents", missingDocs, "Leave requests blocked by required documents.", missingDocs > 0 ? "warning" : "neutral", "file-warning", "/leave/requests?document_status=REQUIRED_PENDING")
      ];
    }),
    payroll: await safeDashboardSummaryGroup("payroll", "Payroll", enabledModules.payroll && hasAny(c, ["payroll.view", "payroll.periods.view", "payroll.runs.view"]), async () => {
      const currentPeriod = await db.prepare("SELECT period_month, period_year, status FROM payroll_periods ORDER BY period_year DESC, period_month DESC LIMIT 1").first<Record<string, unknown>>();
      const holds = await count(db, `SELECT COUNT(*) AS value FROM payroll_employee_results WHERE employee_id IN (${scopedEmployeeIds(payrollScope)}) AND status = 'HELD'`, ...payrollScope.params);
      const draftRuns = await countPayrollRuns(db, payrollScope, "DRAFT");
      priorityActions.push(priority("payroll-holds", "Process payroll holds", "Open held payroll employee results and warnings.", holds, "warning", "pause-circle", "/payroll/runs?status=HELD"));
      const cards = [
        kpi("current-period", "Current Payroll Period", currentPeriod ? `${currentPeriod.period_month}/${currentPeriod.period_year}` : "Not set", "Latest configured payroll period.", currentPeriod ? "info" : "neutral", "banknote", "/payroll/periods", String(currentPeriod?.status ?? "No period")),
        kpi("draft-runs", "Draft Payroll Runs", draftRuns, "Payroll runs still in draft.", draftRuns > 0 ? "warning" : "neutral", "clock", "/payroll/runs?status=DRAFT"),
        kpi("payroll-holds", "Payroll Holds / Warnings", holds, "Employee result rows currently on hold.", holds > 0 ? "warning" : "neutral", "pause-circle", "/payroll/runs?status=HELD")
      ];
      if (enabledModules.payroll_payslips) cards.push(kpi("pending-payslips", "Pending Payslips", await count(db, `SELECT COUNT(*) AS value FROM payroll_employee_results per WHERE per.employee_id IN (${scopedEmployeeIds(payrollScope)}) AND per.status IN ('FINALIZED_PLACEHOLDER','FINALIZED') AND NOT EXISTS (SELECT 1 FROM payroll_payslips ps WHERE ps.payroll_employee_result_id = per.id)`, ...payrollScope.params), "Finalized results without generated payslips.", "info", "receipt", "/payroll/payslips"));
      if (enabledModules.payroll_payment_register) cards.push(kpi("payment-register-pending", "Payment Register Pending", await count(db, `SELECT COUNT(*) AS value FROM payroll_payment_register WHERE employee_id IN (${scopedEmployeeIds(payrollScope)}) AND payment_status = 'PENDING'`, ...payrollScope.params), "Payroll payments awaiting preparation.", "warning", "wallet", "/payroll/payment-register?status=PENDING"));
      if (enabledModules.payroll_employee_advances) cards.push(kpi("advances-outstanding", "Employee Advances Outstanding", await count(db, `SELECT COUNT(*) AS value FROM payroll_advance_payments WHERE employee_id IN (${scopedEmployeeIds(payrollScope)}) AND status IN ('REQUESTED','APPROVED')`, ...payrollScope.params), "Requested or approved advances not yet deducted.", "warning", "hand-coins", "/payroll/advances?status=outstanding"));
      return cards;
    }),
    documents: await safeDashboardSummaryGroup("documents", "Documents & Compliance", enabledModules.documents && hasAny(c, ["documents.view"]), async () => {
      const missing = await count(
        db,
        `SELECT COUNT(*) AS value
         FROM document_required_rules r
         JOIN employees e ON e.archived_at IS NULL
         WHERE ${documentScope.sql}
           AND r.is_active = 1
           AND (r.employee_type IS NULL OR r.employee_type = e.employee_type)
           AND (r.employment_type IS NULL OR r.employment_type = e.employment_type)
           AND (r.department_id IS NULL OR r.department_id = e.primary_department_id)
           AND (r.position_id IS NULL OR r.position_id = e.primary_position_id)
           AND (r.location_id IS NULL OR r.location_id = e.primary_location_id)
           AND NOT EXISTS (
             SELECT 1 FROM employee_documents ed
             WHERE ed.employee_id = e.id AND ed.document_type_id = r.document_type_id AND ed.status = 'ACTIVE'
           )`,
        ...documentScope.params
      );
      const expiring = await count(db, `SELECT COUNT(*) AS value FROM employee_documents WHERE employee_id IN (${scopedEmployeeIds(documentScope)}) AND status = 'ACTIVE' AND expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= date(?, '+30 day')`, ...documentScope.params, today, today);
      priorityActions.push(priority("missing-documents", "Review missing documents", "Open employee document compliance gaps.", missing, "warning", "file-warning", "/documents/compliance/missing"));
      return [
        kpi("missing-required", "Missing Required Documents", missing, "Required documents missing in your scope.", missing > 0 ? "warning" : "success", "file-warning", "/documents/compliance/missing"),
        kpi("expiring-soon", "Documents Expiring Soon", expiring, "Active documents expiring in the next 30 days.", expiring > 0 ? "warning" : "neutral", "calendar-clock", "/documents/compliance/expiring"),
        kpi("expired-documents", "Expired Documents", await count(db, `SELECT COUNT(*) AS value FROM employee_documents WHERE employee_id IN (${scopedEmployeeIds(documentScope)}) AND status = 'ACTIVE' AND expiry_date IS NOT NULL AND expiry_date < ?`, ...documentScope.params, today), "Active employee documents past expiry.", "danger", "file-x", "/documents/compliance/expired"),
        kpi("pending-renewal", "Pending Renewal Cases", await count(db, `SELECT COUNT(*) AS value FROM document_renewal_cases WHERE employee_id IN (${scopedEmployeeIds(documentScope)}) AND status NOT IN ('COMPLETED','CANCELLED','WAIVED')`, ...documentScope.params), "Open document renewal workflows.", "warning", "refresh-cw", "/documents/compliance/renewal-cases"),
        kpi("visa-work-permit", "Work Permit / Visa Expiry Alerts", await count(db, `SELECT COUNT(*) AS value FROM document_expiry_alerts dea JOIN document_types dt ON dt.id = dea.document_type_id WHERE dea.employee_id IN (${scopedEmployeeIds(documentScope)}) AND dea.status IN ('OPEN','ACKNOWLEDGED') AND dt.code IN ('WORK_PERMIT','VISA')`, ...documentScope.params), "Open work permit or visa expiry alerts.", "warning", "shield-alert", "/documents/compliance/alerts?type=visa_work_permit")
      ];
    }),
    contracts: await safeDashboardSummaryGroup("contracts", "Contracts", enabledModules.contracts && hasAny(c, ["contracts.view", "employees.contracts.view"]), async () => {
      const renewals = await count(db, `SELECT COUNT(*) AS value FROM employee_contracts ec WHERE ec.employee_id IN (${scopedEmployeeIds(employeeScope)}) AND ec.renewal_status IN ('DUE_SOON','PENDING_RENEWAL')`, ...employeeScope.params);
      priorityActions.push(priority("contract-renewals", "Review contract renewals", "Open contracts that are due for renewal.", renewals, "warning", "file-signature", "/contracts/renewals"));
      return [
        kpi("active-contracts", "Active Contracts", await count(db, `SELECT COUNT(*) AS value FROM employee_contracts ec WHERE ec.employee_id IN (${scopedEmployeeIds(employeeScope)}) AND ec.status IN ('ACTIVE','EXPIRING_SOON')`, ...employeeScope.params), "Active and expiring-soon contracts.", "success", "file-signature", "/contracts?status=ACTIVE"),
        kpi("expiring-contracts", "Contracts Expiring Soon", await count(db, `SELECT COUNT(*) AS value FROM employee_contracts ec WHERE ec.employee_id IN (${scopedEmployeeIds(employeeScope)}) AND ec.contract_end_date IS NOT NULL AND ec.contract_end_date >= ? AND ec.contract_end_date <= date(?, '+30 day') AND ec.status IN ('ACTIVE','EXPIRING_SOON')`, ...employeeScope.params, today, today), "Contracts ending within 30 days.", "warning", "calendar-clock", "/contracts/alerts?type=EXPIRING"),
        kpi("probation-due", "Probation Due", await count(db, `SELECT COUNT(*) AS value FROM employee_contracts ec WHERE ec.employee_id IN (${scopedEmployeeIds(employeeScope)}) AND ec.probation_status IN ('IN_PROBATION','EXTENDED') AND ec.probation_end_date IS NOT NULL AND ec.probation_end_date <= date(?, '+14 day')`, ...employeeScope.params, today), "Probation reviews due within 14 days.", "warning", "user-check", "/contracts/probation"),
        kpi("renewals-due", "Renewals Due", renewals, "Contracts flagged for renewal.", renewals > 0 ? "warning" : "neutral", "refresh-cw", "/contracts/renewals"),
        kpi("contracts-missing-documents", "Contracts Missing Documents", await count(db, `SELECT COUNT(*) AS value FROM employee_contracts ec WHERE ec.employee_id IN (${scopedEmployeeIds(employeeScope)}) AND ec.document_id IS NULL AND ec.status IN ('ACTIVE','PENDING_APPROVAL')`, ...employeeScope.params), "Contracts without linked official documents.", "warning", "file-warning", "/contracts?missing_document=1")
      ];
    }),
    approvals: await safeDashboardSummaryGroup("approvals", "Approvals", enabledModules.approvals && hasAny(c, ["approvals.view", "approvals.inbox.view", "dashboard.view"]), async () => {
      const myPending = await count(db, "SELECT COUNT(DISTINCT aisa.approval_instance_id) AS value FROM approval_step_assignees aisa WHERE aisa.assigned_user_id = ? AND aisa.status = 'PENDING'", currentUser.id);
      priorityActions.push(priority("pending-approvals", "Review pending approvals", "Open your approval inbox.", myPending, "warning", "git-branch", "/approvals?status=PENDING"));
      return [
        kpi("my-pending", "My Pending Approvals", myPending, "Approval steps assigned to you.", myPending > 0 ? "warning" : "neutral", "git-branch", "/approvals?status=PENDING"),
        kpi("overdue-approvals", "Overdue Approvals", await count(db, "SELECT COUNT(*) AS value FROM approval_instance_steps WHERE status IN ('PENDING','WAITING') AND due_at IS NOT NULL AND due_at < ?", today), "Approval steps past due.", "danger", "alarm-clock", "/approvals/overdue"),
        kpi("escalated-approvals", "Escalated Approvals", await count(db, "SELECT COUNT(*) AS value FROM approval_instance_steps WHERE status = 'ESCALATED'"), "Approval steps currently escalated.", "warning", "trending-up", "/approvals/escalated"),
        kpi("sent-back", "Sent Back Requests", await count(db, "SELECT COUNT(*) AS value FROM approval_instances WHERE status = 'SENT_BACK'"), "Requests returned for changes.", "info", "undo-2", "/approvals/submitted?status=SENT_BACK")
      ];
    }),
    assets: await safeDashboardSummaryGroup("assets", "Assets & Uniforms", (enabledModules.assets || enabledModules.uniforms) && hasAny(c, ["assets.view"]), async () => {
      const returns = await count(db, `SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeIds(assetScope)}) AND status = 'ISSUED' AND expected_return_date IS NOT NULL AND expected_return_date < ?`, ...assetScope.params, today);
      priorityActions.push(priority("asset-returns", "Check asset/uniform returns", "Open overdue issue and return queues.", returns, "warning", "shirt", "/assets/assignments?status=pending_return"));
      return [
        kpi("assets-issued", "Assets Issued", enabledModules.assets ? await count(db, `SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeIds(assetScope)}) AND status = 'ISSUED'`, ...assetScope.params) : 0, "Currently issued asset assignments.", "info", "briefcase", "/assets/assignments?status=ISSUED"),
        kpi("pending-returns", "Pending Returns", returns, "Issued assets past expected return date.", returns > 0 ? "warning" : "neutral", "rotate-ccw", "/assets/assignments?status=pending_return"),
        kpi("damaged-lost", "Damaged / Lost Assets", enabledModules.assets ? await count(db, `SELECT COUNT(*) AS value FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeIds(assetScope)}) AND status IN ('DAMAGED','LOST')`, ...assetScope.params) : 0, "Asset assignments marked damaged or lost.", "danger", "triangle-alert", "/assets/assignments?status=DAMAGED"),
        kpi("uniforms-issued", "Uniforms Issued", enabledModules.uniforms ? await count(db, `SELECT COUNT(*) AS value FROM employee_uniform_assignments WHERE employee_id IN (${scopedEmployeeIds(assetScope)}) AND assignment_status = 'ISSUED'`, ...assetScope.params) : 0, "Currently issued uniform assignments.", "info", "shirt", "/assets/uniform-assignments?status=ISSUED"),
        kpi("pending-clearance", "Pending Clearance", await count(db, `SELECT COUNT(*) AS value FROM final_settlement_clearance_items WHERE employee_id IN (${scopedEmployeeIds(assetScope)}) AND status IN ('PENDING','BLOCKED') AND clearance_type IN ('ASSET','UNIFORM')`, ...assetScope.params), "Asset or uniform clearance items pending.", "warning", "clipboard-check", "/payroll/exit-payroll?clearance=assets")
      ];
    }),
    alerts: await safeDashboardSummaryGroup("alerts", "System & Alerts", true, async () => {
      const canAudit = currentUser.is_owner || hasAny(c, ["audit.view", "admin.audit_logs.view"]);
      const canSettings = currentUser.is_owner || hasAny(c, ["settings.view", "admin.modules.view"]);
      const unread = hasAny(c, ["notifications.view", "notifications.admin.view", "self_service.notifications.view"]) ? await count(db, "SELECT COUNT(*) AS value FROM notifications WHERE recipient_user_id = ? AND is_read = 0", currentUser.id) : 0;
      const sensitiveAudit = canAudit && employeeScope.summary.scope_type === "WHOLE_COMPANY" ? await count(db, "SELECT COUNT(*) AS value FROM audit_logs WHERE action LIKE '%sensitive%' OR module IN ('documents','employee_notes','payroll')") : 0;
      const disabledModules = canSettings ? Object.values(enabledModules).filter((enabled) => !enabled).length : 0;
      const failedImports = hasAny(c, ["migration.view", "migration.manage", "admin.imports.view"]) ? await count(db, "SELECT COUNT(*) AS value FROM data_import_batches WHERE status IN ('VALIDATION_FAILED','FAILED')") : 0;
      return [
        kpi("unread-notifications", "Unread Notifications", unread, "Notifications waiting in your inbox.", unread > 0 ? "info" : "neutral", "bell", "/notifications"),
        kpi("sensitive-audit", "Sensitive Audit Actions", sensitiveAudit, "Whole-company sensitive audit count when permitted.", sensitiveAudit > 0 ? "warning" : "neutral", "shield-alert", "/audit"),
        kpi("disabled-modules", "Disabled Modules", disabledModules, "Operational modules currently hidden from the Command Center.", disabledModules > 0 ? "warning" : "success", "settings", "/settings"),
        kpi("failed-imports", "Failed Imports / Sync Warnings", failedImports, "Failed validation or import batches needing review.", failedImports > 0 ? "danger" : "neutral", "database-zap", "/settings/admin/imports"),
        kpi("slow-routes", "Slow Route Warnings", await count(db, "SELECT COUNT(*) AS value FROM system_consistency_checks WHERE status IN ('WARNING','FAIL') AND (check_key LIKE '%performance%' OR category LIKE '%performance%')"), "Performance readiness checks with warnings.", "info", "activity", "/settings/admin/deployment-readiness")
      ];
    })
  };

  const warnings = Object.values(groups).filter((group) => group.warning).map((group) => ({ group: group.key, message: group.warning }));

  return {
    generated_at: new Date().toISOString(),
    enabled_modules: enabledModules,
    groups,
    priority_actions: priorityActions,
    warnings
  };
}
