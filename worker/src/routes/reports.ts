import { Hono } from "hono";
import type { Context } from "hono";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";

type ReportKey = "employees" | "documents" | "attendance" | "leave" | "payroll" | "roster" | "assets" | "audit";
type ReportRow = Record<string, unknown>;

interface ReportConfig {
  label: string;
  module: string;
  moduleViewPermissions: string[];
  moduleExportPermissions: string[];
  columns: string[];
}

const reportConfigs: Record<ReportKey, ReportConfig> = {
  employees: {
    label: "Employee reports",
    module: "employees",
    moduleViewPermissions: ["employees.view"],
    moduleExportPermissions: ["employees.view"],
    columns: ["employee_no", "employee_name", "status", "department", "position", "location", "employee_type", "employment_type", "joining_date", "created_at"]
  },
  documents: {
    label: "Document reports",
    module: "documents",
    moduleViewPermissions: ["documents.reports.view", "documents.view"],
    moduleExportPermissions: ["documents.reports.export"],
    columns: ["employee_no", "employee_name", "document_type", "category", "document_number", "issue_date", "expiry_date", "display_status", "stored_status", "is_sensitive", "restricted"]
  },
  attendance: {
    label: "Attendance reports",
    module: "attendance",
    moduleViewPermissions: ["attendance.reports.view", "attendance.view"],
    moduleExportPermissions: ["attendance.reports.export"],
    columns: ["attendance_date", "employee_no", "employee_name", "department", "location", "status", "first_clock_in", "last_clock_out", "late_minutes", "missed_punch", "source"]
  },
  leave: {
    label: "Leave reports",
    module: "leave",
    moduleViewPermissions: ["leave.reports.view", "leave.view"],
    moduleExportPermissions: ["leave.reports.export"],
    columns: ["employee_no", "employee_name", "leave_type", "start_date", "end_date", "total_days", "status", "document_status", "submitted_at", "approved_at"]
  },
  payroll: {
    label: "Payroll reports",
    module: "payroll",
    moduleViewPermissions: ["payroll.reports.view", "payroll.view"],
    moduleExportPermissions: ["payroll.reports.export"],
    columns: ["period", "run_no", "employee_no", "employee_name", "department", "location", "status", "basic_salary", "total_earnings", "total_deductions", "net_salary"]
  },
  roster: {
    label: "Roster reports",
    module: "roster",
    moduleViewPermissions: ["roster.reports.view", "roster.view"],
    moduleExportPermissions: ["roster.reports.export"],
    columns: ["roster_date", "employee_no", "employee_name", "department", "location", "shift", "status", "week_start_date", "period_status"]
  },
  assets: {
    label: "Assets and uniforms reports",
    module: "assets",
    moduleViewPermissions: ["assets.reports.view", "assets.view"],
    moduleExportPermissions: ["assets.reports.export"],
    columns: ["employee_no", "employee_name", "category", "asset_code", "asset_name", "issued_date", "expected_return_date", "returned_date", "status", "condition_status", "deduction_amount"]
  },
  audit: {
    label: "Audit reports",
    module: "audit",
    moduleViewPermissions: ["audit.view"],
    moduleExportPermissions: ["audit.export"],
    columns: ["created_at", "actor_name", "module", "action", "entity_type", "entity_id", "reason"]
  }
};

export const reportRoutes = new Hono<AppBindings>();

reportRoutes.use("*", requireAuth);

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const userPermissions = c.get("currentUser").permissions;
  return permissions.some((permission) => userPermissions.includes(permission));
}

function canViewReport(c: Context<AppBindings>, config: ReportConfig) {
  return hasAny(c, ["reports.view"]) && hasAny(c, config.moduleViewPermissions);
}

function canExportReport(c: Context<AppBindings>, config: ReportConfig) {
  return hasAny(c, ["reports.export"]) && hasAny(c, config.moduleExportPermissions);
}

function requireViewReport(c: Context<AppBindings>, config: ReportConfig) {
  if (!canViewReport(c, config)) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to view this report.");
  }
  return null;
}

function filters(c: Context<AppBindings>) {
  return c.req.query() as Record<string, string | undefined>;
}

function addFilter(conditions: string[], bindings: unknown[], value: string | undefined, sql: string) {
  if (value) {
    conditions.push(sql);
    bindings.push(value);
  }
}

function addLikeFilter(conditions: string[], bindings: unknown[], value: string | undefined, columns: string[]) {
  if (!value) return;
  conditions.push(`(${columns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
  columns.forEach(() => bindings.push(`%${value}%`));
}

function whereClause(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvResponse(filename: string, columns: string[], rows: ReportRow[]) {
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

function maskDocumentRows(c: Context<AppBindings>, rows: ReportRow[]) {
  if (c.get("currentUser").permissions.includes("documents.sensitive.view")) {
    return rows.map((row) => ({ ...row, restricted: false }));
  }
  return rows.map((row) => {
    const sensitive = Number(row.is_sensitive ?? 0) === 1;
    if (!sensitive) return { ...row, restricted: false };
    return {
      ...row,
      document_type: "Restricted document",
      category: "Restricted",
      document_number: null,
      is_sensitive: true,
      restricted: true
    };
  });
}

async function employeeReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "e.display_name"]);
  addFilter(conditions, bindings, f.department_id, "e.primary_department_id = ?");
  addFilter(conditions, bindings, f.position_id, "e.primary_position_id = ?");
  addFilter(conditions, bindings, f.location_id, "e.primary_location_id = ?");
  addFilter(conditions, bindings, f.employee_type, "e.employee_type = ?");
  addFilter(conditions, bindings, f.employment_type, "e.employment_type = ?");
  addFilter(conditions, bindings, f.status, "s.key = ?");
  if (f.date_from) {
    conditions.push("date(e.created_at) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(e.created_at) <= date(?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name, s.name AS status,
      d.name AS department, p.title AS position, l.name AS location,
      e.employee_type, e.employment_type, e.joining_date, e.created_at
    FROM employees e
    LEFT JOIN employee_statuses s ON s.id = e.status_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN positions p ON p.id = e.primary_position_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY e.created_at DESC LIMIT 500`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results;
}

async function documentReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "dt.name", "ed.document_number"]);
  addFilter(conditions, bindings, f.department_id, "e.primary_department_id = ?");
  addFilter(conditions, bindings, f.position_id, "e.primary_position_id = ?");
  addFilter(conditions, bindings, f.location_id, "e.primary_location_id = ?");
  addFilter(conditions, bindings, f.document_type_id, "ed.document_type_id = ?");
  addFilter(conditions, bindings, f.category_id, "ed.category_id = ?");
  addFilter(conditions, bindings, f.status, "ed.status = ?");
  if (f.sensitive === "true" || f.sensitive === "false") {
    conditions.push("COALESCE(ed.is_sensitive, dt.is_sensitive, 0) = ?");
    bindings.push(f.sensitive === "true" ? 1 : 0);
  }
  if (f.date_from) {
    conditions.push("date(ed.expiry_date) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(ed.expiry_date) <= date(?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name,
      dt.name AS document_type, dc.name AS category, ed.document_number,
      ed.issue_date, ed.expiry_date,
      CASE
        WHEN ed.status <> 'ACTIVE' THEN ed.status
        WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) < date('now') THEN 'EXPIRED'
        WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) <= date('now', '+30 day') THEN 'EXPIRING_SOON'
        ELSE 'VALID'
      END AS display_status,
      ed.status AS stored_status,
      COALESCE(ed.is_sensitive, dt.is_sensitive, 0) AS is_sensitive
    FROM employee_documents ed
    JOIN employees e ON e.id = ed.employee_id
    JOIN document_types dt ON dt.id = ed.document_type_id
    LEFT JOIN document_categories dc ON dc.id = ed.category_id
    ${whereClause(conditions)}
    ORDER BY COALESCE(ed.expiry_date, ed.created_at) ASC LIMIT 500`;
  return maskDocumentRows(c, (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results);
}

async function attendanceReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name"]);
  addFilter(conditions, bindings, f.department_id, "e.primary_department_id = ?");
  addFilter(conditions, bindings, f.position_id, "e.primary_position_id = ?");
  addFilter(conditions, bindings, f.location_id, "e.primary_location_id = ?");
  addFilter(conditions, bindings, f.status, "a.status = ?");
  addFilter(conditions, bindings, f.source, "a.source = ?");
  if (f.missed_punch === "true") conditions.push("a.missed_punch = 1");
  if (f.late_only === "true") conditions.push("COALESCE(a.late_minutes, 0) > 0");
  if (f.early_checkout_only === "true") conditions.push("COALESCE(a.early_checkout_minutes, 0) > 0");
  if (f.payroll_impact === "true") conditions.push("a.payroll_impact_json IS NOT NULL");
  if (f.date_from) {
    conditions.push("a.attendance_date >= ?");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("a.attendance_date <= ?");
    bindings.push(f.date_to);
  }
  const sql = `SELECT a.attendance_date, e.employee_no, e.full_name AS employee_name,
      d.name AS department, l.name AS location, a.status, a.first_clock_in,
      a.last_clock_out, a.late_minutes, a.missed_punch, a.source
    FROM attendance_daily_records a
    JOIN employees e ON e.id = a.employee_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY a.attendance_date DESC LIMIT 500`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results;
}

async function leaveReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name"]);
  addFilter(conditions, bindings, f.department_id, "e.primary_department_id = ?");
  addFilter(conditions, bindings, f.position_id, "e.primary_position_id = ?");
  addFilter(conditions, bindings, f.location_id, "e.primary_location_id = ?");
  addFilter(conditions, bindings, f.leave_type_id, "lr.leave_type_id = ?");
  addFilter(conditions, bindings, f.status, "lr.status = ?");
  if (f.pending_my_approval === "true") {
    conditions.push("pending.approver_user_id = ?");
    bindings.push(c.get("currentUser").id);
  }
  if (f.date_from) {
    conditions.push("lr.start_date >= ?");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("lr.end_date <= ?");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name, lt.name AS leave_type,
      lr.start_date, lr.end_date, lr.total_days, lr.status, lr.document_status,
      lr.submitted_at, lr.approved_at
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    JOIN leave_types lt ON lt.id = lr.leave_type_id
    LEFT JOIN leave_request_approvals pending ON pending.id = (
      SELECT id FROM leave_request_approvals
      WHERE leave_request_id = lr.id AND status = 'PENDING'
      ORDER BY step_order LIMIT 1
    )
    ${whereClause(conditions)}
    ORDER BY lr.created_at DESC LIMIT 500`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results;
}

async function payrollReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["pre.employee_no_snapshot", "pre.employee_name_snapshot"]);
  addFilter(conditions, bindings, f.payroll_period_id, "pr.payroll_period_id = ?");
  addFilter(conditions, bindings, f.payroll_run_id, "pre.payroll_run_id = ?");
  addFilter(conditions, bindings, f.status, "pre.status = ?");
  addFilter(conditions, bindings, f.department_id, "pre.department_id = ?");
  addFilter(conditions, bindings, f.position_id, "pre.position_id = ?");
  addFilter(conditions, bindings, f.location_id, "pre.location_id = ?");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      pr.run_no, pre.employee_no_snapshot AS employee_no, pre.employee_name_snapshot AS employee_name,
      d.name AS department, l.name AS location, pre.status, pre.basic_salary,
      pre.total_earnings, pre.total_deductions, pre.net_salary
    FROM payroll_run_employees pre
    JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
    JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
    LEFT JOIN departments d ON d.id = pre.department_id
    LEFT JOIN locations l ON l.id = pre.location_id
    ${whereClause(conditions)}
    ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC LIMIT 500`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results;
}

async function rosterReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name"]);
  addFilter(conditions, bindings, f.department_id, "rp.department_id = ?");
  addFilter(conditions, bindings, f.position_id, "e.primary_position_id = ?");
  addFilter(conditions, bindings, f.location_id, "rp.location_id = ?");
  addFilter(conditions, bindings, f.status, "ra.status = ?");
  addFilter(conditions, bindings, f.shift_template_id, "ra.shift_template_id = ?");
  addFilter(conditions, bindings, f.week_start_date, "rp.week_start_date = ?");
  const sql = `SELECT ra.roster_date, e.employee_no, e.full_name AS employee_name,
      d.name AS department, l.name AS location, st.name AS shift, ra.status,
      rp.week_start_date, rp.status AS period_status
    FROM roster_assignments ra
    JOIN roster_periods rp ON rp.id = ra.roster_period_id
    JOIN employees e ON e.id = ra.employee_id
    LEFT JOIN departments d ON d.id = rp.department_id
    LEFT JOIN locations l ON l.id = rp.location_id
    LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
    ${whereClause(conditions)}
    ORDER BY ra.roster_date DESC LIMIT 500`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results;
}

async function assetReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "ai.code", "ai.name"]);
  addFilter(conditions, bindings, f.department_id, "e.primary_department_id = ?");
  addFilter(conditions, bindings, f.position_id, "e.primary_position_id = ?");
  addFilter(conditions, bindings, f.location_id, "e.primary_location_id = ?");
  addFilter(conditions, bindings, f.category_id, "ai.category_id = ?");
  addFilter(conditions, bindings, f.status, "aa.status = ?");
  addFilter(conditions, bindings, f.item_status, "ai.status = ?");
  addFilter(conditions, bindings, f.condition_status, "ai.condition_status = ?");
  if (f.date_from) {
    conditions.push("aa.issued_date >= ?");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("aa.issued_date <= ?");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name, ac.name AS category,
      ai.code AS asset_code, ai.name AS asset_name, aa.issued_date, aa.expected_return_date,
      aa.returned_date, aa.status, ai.condition_status, aa.deduction_amount
    FROM employee_asset_assignments aa
    JOIN employees e ON e.id = aa.employee_id
    JOIN asset_items ai ON ai.id = aa.asset_item_id
    JOIN asset_categories ac ON ac.id = ai.category_id
    ${whereClause(conditions)}
    ORDER BY aa.issued_date DESC LIMIT 500`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results;
}

async function auditReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["a.action", "a.module", "a.entity_type", "a.entity_id", "u.name", "u.email"]);
  addFilter(conditions, bindings, f.module, "a.module = ?");
  addFilter(conditions, bindings, f.action, "a.action = ?");
  addFilter(conditions, bindings, f.entity_type, "a.entity_type = ?");
  addFilter(conditions, bindings, f.actor_user_id, "a.actor_user_id = ?");
  if (f.date_from) {
    conditions.push("date(a.created_at) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(a.created_at) <= date(?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT a.created_at, u.name AS actor_name, a.module, a.action, a.entity_type, a.entity_id, a.reason
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
    ${whereClause(conditions)}
    ORDER BY a.created_at DESC LIMIT 500`;
  return (await c.env.DB.prepare(sql).bind(...bindings).all<ReportRow>()).results;
}

async function runReport(c: Context<AppBindings>, key: ReportKey) {
  switch (key) {
    case "employees":
      return employeeReport(c);
    case "documents":
      return documentReport(c);
    case "attendance":
      return attendanceReport(c);
    case "leave":
      return leaveReport(c);
    case "payroll":
      return payrollReport(c);
    case "roster":
      return rosterReport(c);
    case "assets":
      return assetReport(c);
    case "audit":
      return auditReport(c);
  }
}

reportRoutes.get("/dashboard", async (c) => {
  if (!hasAny(c, ["reports.view"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to view reports.");
  }
  return ok(c, {
    reports: Object.entries(reportConfigs).map(([key, config]) => ({
      key,
      label: config.label,
      module: config.module,
      can_view: canViewReport(c, config),
      can_export: canExportReport(c, config)
    }))
  });
});

Object.keys(reportConfigs).forEach((key) => {
  const reportKey = key as ReportKey;
  const config = reportConfigs[reportKey];

  reportRoutes.get(`/${reportKey}`, async (c) => {
    const denied = requireViewReport(c, config);
    if (denied) return denied;
    const rows = await runReport(c, reportKey);
    return ok(c, { report: { key: reportKey, label: config.label, columns: config.columns, rows } });
  });

  reportRoutes.get(`/${reportKey}/export.csv`, async (c) => {
    if (!canViewReport(c, config) || !canExportReport(c, config)) {
      return fail(c, 403, "FORBIDDEN", "You do not have permission to export this report.");
    }
    const rows = await runReport(c, reportKey);
    const user = c.get("currentUser");
    await recordAudit(c.env.DB, {
      actorUserId: user.id,
      action: "report.exported",
      module: "reports",
      entityType: "report",
      entityId: reportKey,
      newValue: { report: reportKey, filters: filters(c), rows: rows.length },
      ipAddress: getClientIp(c.req.raw),
      userAgent: c.req.header("User-Agent")
    });
    await publishAccessEvent(c.env, "report.exported", { actor_user_id: user.id, entity_type: "report", entity_id: reportKey, action: "report.exported" });
    return csvResponse(`hrm-v2-${reportKey}-report.csv`, config.columns, rows);
  });
});
