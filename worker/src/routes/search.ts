import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause } from "../auth/access-scopes";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser, Env } from "../types";
import { fail, ok } from "../utils/http";

type Row = Record<string, unknown>;

export interface GlobalSearchItem {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  module: string;
  status?: string | null;
  route: string;
  icon_key?: string | null;
}

export interface GlobalSearchGroup {
  module: string;
  items: GlobalSearchItem[];
}

type SearchRegistryEntry = {
  module: string;
  moduleKey: string;
  permissions: string[];
  route: string;
  type: string;
};

export const searchRoutes = new Hono<AppBindings>();
searchRoutes.use("*", requireAuth);

const QUERY_MIN_LENGTH = 2;
const QUERY_MAX_LENGTH = 80;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

function hasAny(user: AuthUser, permissions: string[]) {
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function cleanQuery(value: unknown) {
  return String(value ?? "").trim().slice(0, QUERY_MAX_LENGTH);
}

function boundedLimit(value: unknown) {
  const parsed = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)));
}

function likeQuery(query: string) {
  return `%${query.replace(/[%_]/g, "").toLowerCase()}%`;
}

function safeInternalRoute(route: unknown, fallback = "/") {
  const text = String(route ?? "").trim();
  if (!text.startsWith("/") || text.startsWith("//") || /^\/?https?:/i.test(text)) return fallback;
  return text;
}

async function isModuleEnabled(db: Env["DB"], moduleKey: string) {
  const row = await db.prepare("SELECT is_enabled, status FROM module_control_settings WHERE module_key = ?").bind(moduleKey).first<{ is_enabled: number; status: string }>();
  if (!row) return true;
  return Number(row.is_enabled ?? 1) === 1 && String(row.status ?? "ACTIVE") !== "DISABLED";
}

async function isSearchableModuleEnabled(db: Env["DB"], moduleKey: string, user: AuthUser) {
  if (await isModuleEnabled(db, moduleKey)) return true;
  return hasAny(user, ["settings.view", "settings.manage", "admin.modules.view", "admin.settings_hub.view"]);
}

export function getSearchableModuleRegistry(): SearchRegistryEntry[] {
  return [
    { module: "Employees", moduleKey: "employees", permissions: ["employees.view"], route: "/employees", type: "employee" },
    { module: "Users", moduleKey: "users", permissions: ["users.view"], route: "/users-access", type: "user" },
    { module: "Organization", moduleKey: "organization", permissions: ["organization.view"], route: "/settings/organization", type: "organization" },
    { module: "Leave", moduleKey: "leave", permissions: ["leave.view", "leave.manage"], route: "/leave/requests", type: "leave_request" },
    { module: "Attendance", moduleKey: "attendance", permissions: ["attendance.view", "attendance.manage"], route: "/attendance/records", type: "attendance" },
    { module: "Roster", moduleKey: "roster", permissions: ["roster.view", "roster.manage"], route: "/roster/weekly", type: "roster" },
    { module: "Payroll", moduleKey: "payroll", permissions: ["payroll.view", "payroll.runs.view", "payroll.results.view"], route: "/payroll", type: "payroll" },
    { module: "Documents", moduleKey: "documents", permissions: ["documents.view", "documents.registry.view"], route: "/documents/registry", type: "document" },
    { module: "Contracts", moduleKey: "contracts", permissions: ["contracts.view", "employees.contracts.view"], route: "/contracts", type: "contract" },
    { module: "Assets", moduleKey: "assets", permissions: ["assets.view"], route: "/assets", type: "asset" },
    { module: "Approvals", moduleKey: "approvals", permissions: ["approvals.view", "approvals.inbox.view"], route: "/approvals", type: "approval" },
    { module: "Lifecycle", moduleKey: "onboarding", permissions: ["onboarding.cases.view", "employees.lifecycle.view"], route: "/onboarding/cases", type: "onboarding" },
    { module: "Lifecycle", moduleKey: "offboarding", permissions: ["offboarding.cases.view", "employees.lifecycle.view"], route: "/offboarding/cases", type: "offboarding" },
    { module: "Reports", moduleKey: "reports", permissions: ["reports.view"], route: "/reports", type: "report" },
    { module: "Settings", moduleKey: "settings", permissions: ["settings.view", "admin.settings_hub.view"], route: "/settings", type: "settings" },
    { module: "Admin Help", moduleKey: "admin", permissions: ["admin.help.view", "admin.help.manage"], route: "/admin/help", type: "admin_help" }
  ];
}

export function filterSearchResultsByPermission(user: AuthUser, groups: GlobalSearchGroup[]) {
  const registry = getSearchableModuleRegistry();
  return groups
    .map((group) => {
      const allowedTypes = new Set(registry.filter((entry) => entry.module === group.module && hasAny(user, entry.permissions)).map((entry) => entry.type));
      return { ...group, items: group.items.filter((item) => allowedTypes.has(item.type) || user.is_owner) };
    })
    .filter((group) => group.items.length > 0);
}

export function filterSearchResultsByScope(groups: GlobalSearchGroup[]) {
  return groups.filter((group) => group.items.length > 0);
}

function pushGroup(groups: GlobalSearchGroup[], module: string, items: GlobalSearchItem[]) {
  if (items.length) groups.push({ module, items: items.map((item) => ({ ...item, route: safeInternalRoute(item.route) })) });
}

async function moduleAllowed(db: Env["DB"], user: AuthUser, entry: SearchRegistryEntry) {
  return hasAny(user, entry.permissions) && (await isSearchableModuleEnabled(db, entry.moduleKey, user));
}

export async function searchEmployeesForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  if (!(await moduleAllowed(db, user, getSearchableModuleRegistry()[0]))) return [];
  const scope = await buildEmployeeScopeWhereClause(db, user, "employees", "view", "e");
  const like = likeQuery(q);
  const rows = await db
    .prepare(
      `SELECT e.id, e.employee_no, e.full_name, e.display_name, es.label AS status_label,
        d.name AS department_name, l.name AS location_name
       FROM employees e
       LEFT JOIN employee_statuses es ON es.id = e.status_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       WHERE e.archived_at IS NULL AND ${scope.sql}
         AND (lower(e.employee_no) LIKE ? OR lower(e.full_name) LIKE ? OR lower(COALESCE(e.display_name, '')) LIKE ?)
       ORDER BY e.full_name ASC LIMIT ?`
    )
    .bind(...scope.params, like, like, like, limit)
    .all<Row>();
  return rows.results.map((row) => ({
    id: String(row.id),
    type: "employee",
    module: "Employees",
    title: String(row.display_name || row.full_name || "Employee"),
    subtitle: [row.employee_no, row.department_name, row.location_name].filter(Boolean).join(" - "),
    status: row.status_label ? String(row.status_label) : null,
    route: `/employees/${row.id}`,
    icon_key: "users"
  }));
}

async function searchUsersForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "user")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const rows = await db
    .prepare("SELECT id, name, email, username, status FROM users WHERE lower(name) LIKE ? OR lower(email) LIKE ? OR lower(COALESCE(username, '')) LIKE ? ORDER BY name LIMIT ?")
    .bind(like, like, like, limit)
    .all<Row>();
  return rows.results.map((row) => ({
    id: String(row.id),
    type: "user",
    module: "Users",
    title: String(row.name ?? "User"),
    subtitle: String(row.email ?? row.username ?? ""),
    status: row.status ? String(row.status) : null,
    route: "/users-access",
    icon_key: "shield"
  }));
}

async function searchOrganizationForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "organization")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const [departments, locations, positions] = await Promise.all([
    db.prepare("SELECT id, code, name, is_active FROM departments WHERE lower(code) LIKE ? OR lower(name) LIKE ? ORDER BY name LIMIT ?").bind(like, like, limit).all<Row>(),
    db.prepare("SELECT id, code, name, island_city, is_active FROM locations WHERE lower(code) LIKE ? OR lower(name) LIKE ? OR lower(COALESCE(island_city, '')) LIKE ? ORDER BY name LIMIT ?").bind(like, like, like, limit).all<Row>(),
    db.prepare("SELECT id, code, title, is_active FROM positions WHERE lower(code) LIKE ? OR lower(title) LIKE ? ORDER BY title LIMIT ?").bind(like, like, limit).all<Row>()
  ]);
  return [
    ...departments.results.map((row) => ({ id: String(row.id), type: "organization", module: "Organization", title: String(row.name), subtitle: `Department - ${row.code ?? ""}`, status: Number(row.is_active ?? 1) === 1 ? "Active" : "Inactive", route: "/settings/organization", icon_key: "building" })),
    ...locations.results.map((row) => ({ id: String(row.id), type: "organization", module: "Organization", title: String(row.name), subtitle: `Location - ${[row.code, row.island_city].filter(Boolean).join(" - ")}`, status: Number(row.is_active ?? 1) === 1 ? "Active" : "Inactive", route: "/settings/organization", icon_key: "building" })),
    ...positions.results.map((row) => ({ id: String(row.id), type: "organization", module: "Organization", title: String(row.title), subtitle: `Position - ${row.code ?? ""}`, status: Number(row.is_active ?? 1) === 1 ? "Active" : "Inactive", route: "/settings/organization", icon_key: "briefcase" }))
  ].slice(0, limit);
}

async function employeeScopedSearch(
  db: Env["DB"],
  user: AuthUser,
  moduleKey: string,
  action: "view" | "manage",
  sql: string,
  scopeAlias: string,
  params: unknown[]
) {
  const scope = await buildEmployeeScopeWhereClause(db, user, moduleKey, action, scopeAlias);
  return db.prepare(sql.replace("/*SCOPE*/", scope.sql)).bind(...scope.params, ...params).all<Row>();
}

async function searchLeaveForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "leave_request")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const rows = await employeeScopedSearch(
    db,
    user,
    "leave",
    "view",
    `SELECT lr.id, lr.status, lr.start_date, lr.end_date, lt.name AS leave_type_name, e.employee_no, e.full_name
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(COALESCE(lt.name, '')) LIKE ? OR lower(lr.status) LIKE ?)
     ORDER BY lr.created_at DESC LIMIT ?`,
    "e",
    [like, like, like, like, limit]
  );
  return rows.results.map((row) => ({ id: String(row.id), type: "leave_request", module: "Leave", title: `${row.leave_type_name ?? "Leave request"} - ${row.full_name}`, subtitle: `${row.employee_no ?? ""} - ${row.start_date ?? ""} to ${row.end_date ?? ""}`, status: row.status ? String(row.status) : null, route: "/leave/requests", icon_key: "calendar" }));
}

async function searchAttendanceForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "attendance")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const rows = await employeeScopedSearch(
    db,
    user,
    "attendance",
    "view",
    `SELECT adr.id, adr.attendance_date, adr.status, e.employee_no, e.full_name
     FROM attendance_daily_records adr
     JOIN employees e ON e.id = adr.employee_id
     WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(adr.status) LIKE ?)
     ORDER BY adr.attendance_date DESC LIMIT ?`,
    "e",
    [like, like, like, limit]
  );
  return rows.results.map((row) => ({ id: String(row.id), type: "attendance", module: "Attendance", title: `${row.full_name} attendance`, subtitle: `${row.employee_no ?? ""} - ${row.attendance_date ?? ""}`, status: row.status ? String(row.status) : null, route: "/attendance/records", icon_key: "clock" }));
}

async function searchRosterForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "roster")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const rows = await employeeScopedSearch(
    db,
    user,
    "roster",
    "view",
    `SELECT ra.id, ra.roster_date, ra.status, e.employee_no, e.full_name, st.name AS shift_name
     FROM roster_assignments ra
     JOIN employees e ON e.id = ra.employee_id
     LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
     WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(COALESCE(st.name, '')) LIKE ? OR lower(ra.status) LIKE ?)
     ORDER BY ra.roster_date DESC LIMIT ?`,
    "e",
    [like, like, like, like, limit]
  );
  return rows.results.map((row) => ({ id: String(row.id), type: "roster", module: "Roster", title: `${row.full_name} roster`, subtitle: `${row.employee_no ?? ""} - ${row.roster_date ?? ""} - ${row.shift_name ?? "Shift"}`, status: row.status ? String(row.status) : null, route: "/roster/weekly", icon_key: "calendar-days" }));
}

export async function searchPayrollForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "payroll")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const runRows = await employeeScopedSearch(
    db,
    user,
    "payroll",
    "view",
    `SELECT DISTINCT pr.id, pr.run_no, pr.status, pp.period_month, pp.period_year
     FROM payroll_runs pr
     JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
     JOIN payroll_employee_results per ON per.payroll_run_id = pr.id
     JOIN employees e ON e.id = per.employee_id
     WHERE /*SCOPE*/ AND (CAST(pr.run_no AS TEXT) LIKE ? OR lower(pr.status) LIKE ? OR CAST(pp.period_month AS TEXT) LIKE ? OR CAST(pp.period_year AS TEXT) LIKE ?)
     ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC LIMIT ?`,
    "e",
    [like, like, like, like, limit]
  );
  const items: GlobalSearchItem[] = runRows.results.map((row) => ({ id: String(row.id), type: "payroll", module: "Payroll", title: `Payroll run #${row.run_no}`, subtitle: `${row.period_month}/${row.period_year}`, status: row.status ? String(row.status) : null, route: `/payroll/runs/${row.id}`, icon_key: "payroll" }));

  if (hasAny(user, ["payroll.payslips.view", "payroll.results.view", "payroll.view"])) {
    const payslips = await employeeScopedSearch(
      db,
      user,
      "payroll",
      "view",
      `SELECT ps.id, ps.payslip_number, ps.status, pp.period_month, pp.period_year, e.employee_no, e.full_name
       FROM payroll_payslips ps
       JOIN payroll_periods pp ON pp.id = ps.payroll_period_id
       JOIN employees e ON e.id = ps.employee_id
       WHERE /*SCOPE*/ AND (lower(ps.payslip_number) LIKE ? OR lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ?)
       ORDER BY ps.generated_at DESC LIMIT ?`,
      "e",
      [like, like, like, limit]
    );
    items.push(...payslips.results.map((row) => ({ id: String(row.id), type: "payroll", module: "Payroll", title: `Payslip ${row.payslip_number}`, subtitle: `${row.full_name} - ${row.period_month}/${row.period_year}`, status: row.status ? String(row.status) : null, route: "/payroll/payslips", icon_key: "file-text" })));
  }

  return items.slice(0, limit);
}

export async function searchDocumentsForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "document")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const canViewSensitive = hasAny(user, ["documents.sensitive.view", "documents.sensitive.download"]);
  const rows = await employeeScopedSearch(
    db,
    user,
    "documents",
    "view",
    `SELECT ed.id, ed.employee_id, ed.document_number, ed.status, ed.expiry_date, COALESCE(ed.is_sensitive, dt.is_sensitive, 0) AS is_sensitive,
       dt.name AS document_type_name, e.employee_no, e.full_name
     FROM employee_documents ed
     JOIN employees e ON e.id = ed.employee_id
     LEFT JOIN document_types dt ON dt.id = ed.document_type_id
     WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(COALESCE(dt.name, '')) LIKE ? OR lower(COALESCE(ed.document_number, '')) LIKE ?)
     ORDER BY ed.created_at DESC LIMIT ?`,
    "e",
    [like, like, like, like, limit]
  );
  return rows.results.map((row) => {
    const restricted = Number(row.is_sensitive ?? 0) === 1 && !canViewSensitive;
    return {
      id: String(row.id),
      type: "document",
      module: "Documents",
      title: restricted ? "Restricted document" : String(row.document_type_name ?? "Employee document"),
      subtitle: restricted ? `${row.full_name} - Sensitive metadata hidden` : `${row.full_name} - ${row.document_number ?? "No reference"}`,
      status: row.status ? String(row.status) : null,
      route: `/employees/${row.employee_id}`,
      icon_key: "file-text"
    };
  });
}

async function searchContractsForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "contract")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const rows = await employeeScopedSearch(
    db,
    user,
    "contracts",
    "view",
    `SELECT ec.id, ec.contract_number, ec.status, ec.contract_start_date, ec.contract_end_date, ct.name AS contract_type_name, e.employee_no, e.full_name
     FROM employee_contracts ec
     JOIN employees e ON e.id = ec.employee_id
     LEFT JOIN contract_types ct ON ct.id = ec.contract_type_id
     WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(COALESCE(ec.contract_number, '')) LIKE ? OR lower(COALESCE(ct.name, '')) LIKE ?)
     ORDER BY ec.created_at DESC LIMIT ?`,
    "e",
    [like, like, like, like, limit]
  );
  return rows.results.map((row) => ({ id: String(row.id), type: "contract", module: "Contracts", title: row.contract_number ? `Contract ${row.contract_number}` : String(row.contract_type_name ?? "Employee contract"), subtitle: `${row.full_name} - ${row.contract_start_date ?? "Not set"} to ${row.contract_end_date ?? "Open-ended"}`, status: row.status ? String(row.status) : null, route: "/contracts", icon_key: "file-signature" }));
}

async function searchAssetsForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "asset")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const rows = await employeeScopedSearch(
    db,
    user,
    "assets",
    "view",
    `SELECT aa.id, aa.status, aa.issued_date, ai.code AS asset_code, ai.name AS asset_name, e.employee_no, e.full_name
     FROM employee_asset_assignments aa
     JOIN asset_items ai ON ai.id = aa.asset_item_id
     JOIN employees e ON e.id = aa.employee_id
     WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(ai.code) LIKE ? OR lower(ai.name) LIKE ?)
     ORDER BY aa.issued_date DESC LIMIT ?`,
    "e",
    [like, like, like, like, limit]
  );
  return rows.results.map((row) => ({ id: String(row.id), type: "asset", module: "Assets", title: String(row.asset_name ?? "Asset assignment"), subtitle: `${row.asset_code ?? ""} - ${row.full_name}`, status: row.status ? String(row.status) : null, route: "/assets/assignments", icon_key: "shirt" }));
}

export async function searchApprovalsForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const entry = getSearchableModuleRegistry().find((item) => item.type === "approval")!;
  if (!(await moduleAllowed(db, user, entry))) return [];
  const like = likeQuery(q);
  const scope = await buildEmployeeScopeWhereClause(db, user, "approvals", "view", "e");
  const scopedSql = scope.unrestricted ? "1 = 1" : `(ai.employee_id IS NULL OR ${scope.sql})`;
  const rows = await db
    .prepare(
      `SELECT ai.id, ai.request_title, ai.module_key, ai.action_key, ai.status, e.employee_no, e.full_name
       FROM approval_instances ai
       LEFT JOIN employees e ON e.id = ai.employee_id
       WHERE ${scopedSql}
         AND (lower(ai.request_title) LIKE ? OR lower(ai.module_key) LIKE ? OR lower(ai.action_key) LIKE ? OR lower(ai.status) LIKE ? OR lower(COALESCE(e.full_name, '')) LIKE ?)
       ORDER BY ai.created_at DESC LIMIT ?`
    )
    .bind(...scope.params, like, like, like, like, like, limit)
    .all<Row>();
  return rows.results.map((row) => ({ id: String(row.id), type: "approval", module: "Approvals", title: String(row.request_title ?? "Approval request"), subtitle: `${row.module_key ?? "approval"} - ${row.full_name ?? "No employee"}`, status: row.status ? String(row.status) : null, route: "/approvals", icon_key: "git-branch" }));
}

async function searchLifecycleForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const registry = getSearchableModuleRegistry();
  const like = likeQuery(q);
  const items: GlobalSearchItem[] = [];
  const onboardingEntry = registry.find((item) => item.type === "onboarding")!;
  if (await moduleAllowed(db, user, onboardingEntry)) {
    const rows = await employeeScopedSearch(
      db,
      user,
      "onboarding",
      "view",
      `SELECT oc.id, oc.case_number, oc.onboarding_status, e.employee_no, e.full_name
       FROM employee_onboarding_cases oc
       JOIN employees e ON e.id = oc.employee_id
       WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(oc.case_number) LIKE ? OR lower(oc.onboarding_status) LIKE ?)
       ORDER BY oc.created_at DESC LIMIT ?`,
      "e",
      [like, like, like, like, limit]
    );
    items.push(...rows.results.map((row) => ({ id: String(row.id), type: "onboarding", module: "Lifecycle", title: `Onboarding ${row.case_number}`, subtitle: `${row.full_name} - ${row.employee_no ?? ""}`, status: String(row.onboarding_status ?? ""), route: "/onboarding/cases", icon_key: "check-circle" })));
  }
  const offboardingEntry = registry.find((item) => item.type === "offboarding")!;
  if (await moduleAllowed(db, user, offboardingEntry)) {
    const rows = await employeeScopedSearch(
      db,
      user,
      "offboarding",
      "view",
      `SELECT oc.id, oc.case_number, oc.offboarding_status, e.employee_no, e.full_name
       FROM employee_offboarding_cases oc
       JOIN employees e ON e.id = oc.employee_id
       WHERE /*SCOPE*/ AND (lower(e.full_name) LIKE ? OR lower(e.employee_no) LIKE ? OR lower(oc.case_number) LIKE ? OR lower(oc.offboarding_status) LIKE ?)
       ORDER BY oc.created_at DESC LIMIT ?`,
      "e",
      [like, like, like, like, limit]
    );
    items.push(...rows.results.map((row) => ({ id: String(row.id), type: "offboarding", module: "Lifecycle", title: `Offboarding ${row.case_number}`, subtitle: `${row.full_name} - ${row.employee_no ?? ""}`, status: String(row.offboarding_status ?? ""), route: "/offboarding/cases", icon_key: "archive" })));
  }
  return items.slice(0, limit);
}

export async function searchSettingsForUser(db: Env["DB"], user: AuthUser, q: string, limit: number): Promise<GlobalSearchItem[]> {
  const registry = getSearchableModuleRegistry();
  const query = q.toLowerCase();
  const staticItems = registry
    .filter((entry) => ["report", "settings", "admin_help"].includes(entry.type))
    .filter((entry) => hasAny(user, entry.permissions))
    .filter((entry) => entry.module.toLowerCase().includes(query) || entry.route.toLowerCase().includes(query) || entry.type.replace("_", " ").includes(query))
    .map((entry) => ({
      id: entry.type,
      type: entry.type,
      module: entry.module,
      title: entry.module,
      subtitle: entry.route,
      status: "Available",
      route: entry.route,
      icon_key: entry.type
    }));
  return staticItems.slice(0, limit);
}

function quickLinksForUser(user: AuthUser): GlobalSearchGroup[] {
  const groups: GlobalSearchGroup[] = [];
  const items = getSearchableModuleRegistry()
    .filter((entry) => hasAny(user, entry.permissions))
    .slice(0, 8)
    .map((entry) => ({
      id: entry.type,
      type: entry.type,
      module: "Quick links",
      title: entry.module,
      subtitle: entry.route,
      status: "Shortcut",
      route: entry.route,
      icon_key: entry.type
    }));
  pushGroup(groups, "Quick links", items);
  return groups;
}

export async function performGlobalSearch(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  if (!hasAny(user, ["search.global.use", "search.global.admin"])) {
    return fail(c, 403, "SEARCH_PERMISSION_DENIED", "You do not have permission to use global search.");
  }

  const q = cleanQuery(c.req.query("q"));
  const limit = boundedLimit(c.req.query("limit"));
  const typeFilter = new Set(String(c.req.query("types") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  if (!q) return ok(c, { query: "", groups: quickLinksForUser(user), min_query_length: QUERY_MIN_LENGTH });
  if (q.length < QUERY_MIN_LENGTH) return ok(c, { query: q, groups: [], min_query_length: QUERY_MIN_LENGTH, message: "Type at least two characters to search." });

  const include = (type: string) => !typeFilter.size || typeFilter.has(type);
  const groups: GlobalSearchGroup[] = [];
  const [
    employees,
    users,
    organization,
    leave,
    attendance,
    roster,
    payroll,
    documents,
    contracts,
    assets,
    approvals,
    lifecycle,
    settings
  ] = await Promise.all([
    include("employee") ? searchEmployeesForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("user") ? searchUsersForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("organization") ? searchOrganizationForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("leave_request") ? searchLeaveForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("attendance") ? searchAttendanceForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("roster") ? searchRosterForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("payroll") ? searchPayrollForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("document") ? searchDocumentsForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("contract") ? searchContractsForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("asset") ? searchAssetsForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("approval") ? searchApprovalsForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("onboarding") || include("offboarding") ? searchLifecycleForUser(c.env.DB, user, q, limit) : Promise.resolve([]),
    include("settings") || include("report") || include("admin_help") ? searchSettingsForUser(c.env.DB, user, q, limit) : Promise.resolve([])
  ]);

  pushGroup(groups, "Employees", employees);
  pushGroup(groups, "Users", users);
  pushGroup(groups, "Organization", organization);
  pushGroup(groups, "Leave", leave);
  pushGroup(groups, "Attendance", attendance);
  pushGroup(groups, "Roster", roster);
  pushGroup(groups, "Payroll", payroll);
  pushGroup(groups, "Documents", documents);
  pushGroup(groups, "Contracts", contracts);
  pushGroup(groups, "Assets", assets);
  pushGroup(groups, "Approvals", approvals);
  pushGroup(groups, "Lifecycle", lifecycle);
  pushGroup(groups, "Reports and Settings", settings);

  return ok(c, { query: q, groups: filterSearchResultsByScope(filterSearchResultsByPermission(user, groups)), min_query_length: QUERY_MIN_LENGTH });
}

searchRoutes.get("/global", performGlobalSearch);
