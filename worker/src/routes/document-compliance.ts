import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDateRange, validateDocumentRules, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings, AuthUser, Env } from "../types";
import { fail, getClientIp, nowIso, ok } from "../utils/http";
import { requireOperationalModuleMiddleware } from "../utils/module-enforcement";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type ComplianceStatus = "COMPLIANT" | "MISSING_REQUIRED" | "EXPIRING_SOON" | "URGENT_EXPIRING" | "EXPIRED_DOCUMENTS" | "WAIVER_ACTIVE" | "NOT_APPLICABLE";
type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
type RenewalCaseStatus = "DRAFT" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_EMPLOYEE" | "WAITING_FOR_HR" | "WAITING_FOR_EXTERNAL_AUTHORITY" | "DOCUMENT_RECEIVED" | "COMPLETED" | "CANCELLED" | "WAIVED";

type EmployeeRow = {
  id: string;
  employee_no: string;
  full_name: string;
  employee_type: string;
  employment_type: string;
  primary_department_id: string | null;
  primary_position_id: string | null;
  primary_location_id: string | null;
  department_name?: string | null;
  position_title?: string | null;
  location_name?: string | null;
};

type DocumentTypeComplianceRow = {
  id: string;
  category_id: string | null;
  category_name?: string | null;
  code: string;
  name: string;
  description: string | null;
  is_sensitive: number;
  is_active: number;
  expiring_soon_days: number;
  allowed_file_types_json: string;
  max_file_size_mb: number;
  allow_multiple_files: number;
  requires_expiry_date: number;
  requires_issue_date: number;
  requires_document_number: number;
  expiry_required: number;
  issue_date_required: number;
  document_number_required: number;
  urgent_expiring_days: number | null;
  renewal_case_auto_create: number;
  employee_summary_visible: number;
  employee_download_allowed: number;
  blocks_employee_activation: number;
  creates_payroll_warning: number;
  creates_final_settlement_warning: number;
  compliance_weight: number | null;
  sensitivity_level: "NORMAL" | "SENSITIVE" | "HIGHLY_SENSITIVE";
  renewal_instructions: string | null;
  retention_rule_json: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type EmployeeDocumentComplianceRow = {
  id: string;
  employee_id: string;
  document_type_id: string;
  category_id: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: "ACTIVE" | "ARCHIVED" | "SOFT_DELETED";
  current_version_id: string | null;
  is_sensitive: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  document_type_name: string;
  document_type_code: string;
  category_name: string | null;
  expiring_soon_days: number;
  urgent_expiring_days: number | null;
  original_filename?: string | null;
  version_no?: number | null;
  uploaded_at?: string | null;
};

type RequiredDocumentRow = {
  matched_rule_id: string | null;
  document_type_id: string;
  document_type_name: string;
  document_type_code: string;
  category_name: string | null;
  is_required: number;
  rule_priority: number;
  is_sensitive: number;
  expiry_required: number;
  issue_date_required: number;
  document_number_required: number;
  blocks_employee_activation: number;
  creates_payroll_warning: number;
  creates_final_settlement_warning: number;
  expiring_soon_days: number;
  urgent_expiring_days: number | null;
};

type WaiverRow = {
  id: string;
  employee_id: string;
  document_type_id: string;
  required_rule_id: string | null;
  waiver_reason: string;
  waiver_start_date: string;
  waiver_end_date: string | null;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  approved_by_user_id: string | null;
  approved_at: string | null;
  cancelled_by_user_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  document_type_name?: string | null;
  document_type_code?: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
};

type AlertRow = {
  id: string;
  employee_id: string;
  document_id: string | null;
  document_type_id: string;
  document_version_id: string | null;
  alert_type: "MISSING_REQUIRED" | "EXPIRING_SOON" | "URGENT_EXPIRING" | "EXPIRED" | "RENEWAL_DUE" | "WAIVER_EXPIRING" | "DOCUMENT_REPLACED";
  alert_date: string;
  due_date: string | null;
  expiry_date: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: AlertStatus;
  assigned_to_user_id: string | null;
  acknowledged_by_user_id: string | null;
  acknowledged_at: string | null;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  dismissed_by_user_id: string | null;
  dismissed_at: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  document_type_name?: string | null;
  document_type_code?: string | null;
  document_number?: string | null;
  original_filename?: string | null;
  is_sensitive?: number | null;
};

type RenewalCaseRow = {
  id: string;
  employee_id: string;
  document_id: string | null;
  document_type_id: string;
  current_document_version_id: string | null;
  renewal_case_number: string;
  case_type: "NEW_REQUIRED_DOCUMENT" | "RENEWAL" | "REPLACEMENT" | "CORRECTION";
  status: RenewalCaseStatus;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  current_expiry_date: string | null;
  target_renewal_date: string | null;
  due_date: string | null;
  completed_document_id: string | null;
  completed_document_version_id: string | null;
  assigned_to_user_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  completed_by_user_id: string | null;
  completed_at: string | null;
  cancelled_by_user_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  waiver_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  document_type_name?: string | null;
  document_type_code?: string | null;
  assigned_to_name?: string | null;
};

type ComplianceSettingsRow = {
  id: string;
  company_id: string | null;
  document_compliance_enabled: number;
  expiry_alerts_enabled: number;
  missing_required_document_alerts_enabled: number;
  renewal_workflow_enabled: number;
  auto_create_renewal_case_for_expiring_document: number;
  auto_create_missing_document_case: number;
  default_expiring_soon_days: number;
  default_urgent_expiring_days: number;
  default_overdue_grace_days: number;
  require_reason_for_renewal_case_cancel: number;
  require_reason_for_document_waiver: number;
  allow_document_requirement_waiver: number;
  allow_employee_view_document_compliance: number;
  allow_employee_download_documents: number;
  employee_document_upload_request_placeholder_enabled: number;
  sensitive_document_view_audit_enabled: number;
  compliance_dashboard_enabled: number;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};

export const documentComplianceRoutes = new Hono<AppBindings>();
export const employeeDocumentComplianceRoutes = new Hono<AppBindings>();
export const selfServiceDocumentComplianceRoutes = new Hono<AppBindings>();

documentComplianceRoutes.use("*", requireAuth);
employeeDocumentComplianceRoutes.use("*", requireAuth);
selfServiceDocumentComplianceRoutes.use("*", requireAuth);
documentComplianceRoutes.use("*", requireOperationalModuleMiddleware("documents", "Documents"));
employeeDocumentComplianceRoutes.use("*", requireOperationalModuleMiddleware("documents", "Documents"));
selfServiceDocumentComplianceRoutes.use("*", requireOperationalModuleMiddleware("documents", "Documents"));

const COMPLIANCE_VIEW = ["documents.compliance.view", "documents.compliance.manage", "documents.view"];
const COMPLIANCE_MANAGE = ["documents.compliance.manage"];
const COMPLIANCE_REFRESH = ["documents.compliance.refresh", "documents.compliance.manage"];
const SETTINGS_VIEW = ["documents.compliance_settings.view", "documents.compliance_settings.manage", "documents.compliance.view", "documents.view"];
const SETTINGS_UPDATE = ["documents.compliance_settings.update", "documents.compliance_settings.manage", "documents.compliance.manage"];
const TYPE_COMPLIANCE_VIEW = ["documents.types.compliance.view", "documents.types.compliance.manage", "documents.compliance.view", "documents.view"];
const TYPE_COMPLIANCE_UPDATE = ["documents.types.compliance.update", "documents.types.compliance.manage", "documents.compliance.manage"];
const ALERTS_VIEW = ["documents.alerts.view", "documents.alerts.manage", "documents.compliance.view"];
const ALERTS_MANAGE = ["documents.alerts.manage"];
const RENEWAL_VIEW = ["documents.renewal_cases.view", "documents.renewal_cases.manage", "documents.compliance.view"];
const RENEWAL_CREATE = ["documents.renewal_cases.create", "documents.renewal_cases.manage", "documents.compliance.manage"];
const RENEWAL_UPDATE = ["documents.renewal_cases.update", "documents.renewal_cases.manage"];
const RENEWAL_ASSIGN = ["documents.renewal_cases.assign", "documents.renewal_cases.manage"];
const RENEWAL_COMPLETE = ["documents.renewal_cases.complete", "documents.renewal_cases.manage"];
const RENEWAL_CANCEL = ["documents.renewal_cases.cancel", "documents.renewal_cases.manage"];
const WAIVER_VIEW = ["documents.waivers.view", "documents.waivers.manage", "documents.compliance.view"];
const WAIVER_CREATE = ["documents.waivers.create", "documents.waivers.manage", "documents.checklist.waive", "documents.checklist.override"];
const WAIVER_CANCEL = ["documents.waivers.cancel", "documents.waivers.manage"];
const EMPLOYEE_COMPLIANCE_VIEW = ["employees.documents.compliance.view", "employees.documents.compliance.manage", "documents.compliance.view", "documents.view"];
const EMPLOYEE_COMPLIANCE_MANAGE = ["employees.documents.compliance.manage", "documents.compliance.manage"];
const SENSITIVE_VIEW = ["documents.sensitive.view", "documents.registry.sensitive.view"];

function bool(value: number | null | undefined) {
  return value === 1;
}

function asBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function routeParam(c: Context<AppBindings>, name: string) {
  return c.req.param(name) ?? "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const current = new Date(`${date}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const start = Date.parse(`${today()}T00:00:00Z`);
  const end = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.ceil((end - start) / 86400000);
}

function hasAny(user: AuthUser, permissions: string[]) {
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAny(c: Context<AppBindings>, permissions: string[]) {
  if (!hasAny(c.get("currentUser"), permissions)) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return null;
}

function isSensitive(row: { is_sensitive?: number | null; sensitivity_level?: string | null }) {
  return row.is_sensitive === 1 || row.sensitivity_level === "SENSITIVE" || row.sensitivity_level === "HIGHLY_SENSITIVE";
}

function safeJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function maskSensitive<T extends Record<string, unknown>>(row: T, canSensitive: boolean): T {
  if (!row.is_sensitive || canSensitive) return { ...row, restricted: false } as T;
  return {
    ...row,
    restricted: true,
    document_number: null,
    original_filename: null,
    document_type_name: "Restricted document",
    notes: null
  } as T;
}

function toDocumentType(row: DocumentTypeComplianceRow) {
  return {
    ...row,
    is_sensitive: bool(row.is_sensitive),
    is_active: bool(row.is_active),
    allow_multiple_files: bool(row.allow_multiple_files),
    requires_expiry_date: bool(row.requires_expiry_date),
    requires_issue_date: bool(row.requires_issue_date),
    requires_document_number: bool(row.requires_document_number),
    expiry_required: bool(row.expiry_required),
    issue_date_required: bool(row.issue_date_required),
    document_number_required: bool(row.document_number_required),
    renewal_case_auto_create: bool(row.renewal_case_auto_create),
    employee_summary_visible: bool(row.employee_summary_visible),
    employee_download_allowed: bool(row.employee_download_allowed),
    blocks_employee_activation: bool(row.blocks_employee_activation),
    creates_payroll_warning: bool(row.creates_payroll_warning),
    creates_final_settlement_warning: bool(row.creates_final_settlement_warning),
    allowed_file_types: safeJsonArray(row.allowed_file_types_json)
  };
}

function toSettings(row: ComplianceSettingsRow) {
  return {
    ...row,
    document_compliance_enabled: bool(row.document_compliance_enabled),
    expiry_alerts_enabled: bool(row.expiry_alerts_enabled),
    missing_required_document_alerts_enabled: bool(row.missing_required_document_alerts_enabled),
    renewal_workflow_enabled: bool(row.renewal_workflow_enabled),
    auto_create_renewal_case_for_expiring_document: bool(row.auto_create_renewal_case_for_expiring_document),
    auto_create_missing_document_case: bool(row.auto_create_missing_document_case),
    require_reason_for_renewal_case_cancel: bool(row.require_reason_for_renewal_case_cancel),
    require_reason_for_document_waiver: bool(row.require_reason_for_document_waiver),
    allow_document_requirement_waiver: bool(row.allow_document_requirement_waiver),
    allow_employee_view_document_compliance: bool(row.allow_employee_view_document_compliance),
    allow_employee_download_documents: bool(row.allow_employee_download_documents),
    employee_document_upload_request_placeholder_enabled: bool(row.employee_document_upload_request_placeholder_enabled),
    sensitive_document_view_audit_enabled: bool(row.sensitive_document_view_audit_enabled),
    compliance_dashboard_enabled: bool(row.compliance_dashboard_enabled)
  };
}

async function audit(c: Context<AppBindings>, action: string, entityType: string, entityId: string | null, input: { oldValue?: unknown; newValue?: unknown; reason?: string | null } = {}) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action,
    module: "documents",
    entityType,
    entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason ?? null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function addRenewalEvent(db: Env["DB"], input: { caseId: string; employeeId: string; action: string; previousStatus?: string | null; newStatus?: string | null; actor: AuthUser; note?: string | null; reason?: string | null; metadata?: unknown }) {
  await db.prepare(
    `INSERT INTO document_renewal_case_events
      (id, renewal_case_id, employee_id, action, previous_status, new_status, actor_user_id, actor_name_snapshot, note, reason, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    input.caseId,
    input.employeeId,
    input.action,
    input.previousStatus ?? null,
    input.newStatus ?? null,
    input.actor.id,
    input.actor.name,
    input.note ?? null,
    input.reason ?? null,
    input.metadata === undefined ? null : JSON.stringify(input.metadata)
  ).run();
}

async function getDocumentComplianceSettings(db: Env["DB"]) {
  const existing = await db.prepare("SELECT * FROM document_compliance_settings ORDER BY created_at LIMIT 1").first<ComplianceSettingsRow>();
  if (existing) return existing;
  const id = "document_compliance_settings_default";
  await db.prepare("INSERT OR IGNORE INTO document_compliance_settings (id) VALUES (?)").bind(id).run();
  return (await db.prepare("SELECT * FROM document_compliance_settings WHERE id = ?").bind(id).first<ComplianceSettingsRow>())!;
}

async function getEmployee(db: Env["DB"], employeeId: string) {
  return db.prepare(
    `SELECT e.*, d.name AS department_name, p.title AS position_title, l.name AS location_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     WHERE e.id = ? AND e.archived_at IS NULL`
  ).bind(employeeId).first<EmployeeRow>();
}

async function employeeListForScope(c: Context<AppBindings>, moduleKey = "documents", action: "view" | "manage" = "view") {
  const conditions: string[] = ["e.archived_at IS NULL"];
  const binds: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), moduleKey, action, "e");
  conditions.push(scope.sql);
  binds.push(...scope.params);
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR e.display_name LIKE ?)");
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const filters = [
    ["department_id", "e.primary_department_id"],
    ["location_id", "e.primary_location_id"],
    ["position_id", "e.primary_position_id"],
    ["employee_type", "e.employee_type"],
    ["employment_type", "e.employment_type"]
  ] as const;
  for (const [key, column] of filters) {
    const value = readString(c.req.query(key));
    if (value) {
      conditions.push(`${column} = ?`);
      binds.push(value);
    }
  }
  const rows = await c.env.DB.prepare(
    `SELECT e.id, e.employee_no, e.full_name, e.employee_type, e.employment_type,
      e.primary_department_id, e.primary_position_id, e.primary_location_id,
      d.name AS department_name, p.title AS position_title, l.name AS location_name
     FROM employees e
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY e.employee_no`
  ).bind(...binds).all<EmployeeRow>();
  return rows.results;
}

export async function getRequiredDocumentsForEmployee(db: Env["DB"], employeeId: string) {
  const employee = await getEmployee(db, employeeId);
  if (!employee) return [];
  const rows = await db.prepare(
    `SELECT rr.id AS matched_rule_id, dt.id AS document_type_id, dt.name AS document_type_name,
      dt.code AS document_type_code, dc.name AS category_name, rr.is_required, rr.rule_priority,
      dt.is_sensitive, dt.expiry_required, dt.issue_date_required, dt.document_number_required,
      dt.blocks_employee_activation, dt.creates_payroll_warning, dt.creates_final_settlement_warning,
      dt.expiring_soon_days, dt.urgent_expiring_days
     FROM document_required_rules rr
     JOIN document_types dt ON dt.id = rr.document_type_id AND dt.is_active = 1
     LEFT JOIN document_categories dc ON dc.id = dt.category_id
     WHERE rr.is_active = 1
       AND (rr.employee_type IS NULL OR rr.employee_type = ?)
       AND (rr.employment_type IS NULL OR rr.employment_type = ?)
       AND (rr.department_id IS NULL OR rr.department_id = ?)
       AND (rr.position_id IS NULL OR rr.position_id = ?)
       AND (rr.location_id IS NULL OR rr.location_id = ?)
     ORDER BY rr.rule_priority, dt.sort_order, dt.name`
  ).bind(employee.employee_type, employee.employment_type, employee.primary_department_id, employee.primary_position_id, employee.primary_location_id).all<RequiredDocumentRow>();
  const byType = new Map<string, RequiredDocumentRow>();
  for (const row of rows.results) {
    const existing = byType.get(row.document_type_id);
    if (!existing || row.rule_priority < existing.rule_priority || row.is_required > existing.is_required) {
      byType.set(row.document_type_id, row);
    }
  }
  return Array.from(byType.values()).filter((row) => row.is_required === 1);
}

export async function getEmployeeActiveDocumentByType(db: Env["DB"], employeeId: string, documentTypeId: string) {
  return db.prepare(
    `SELECT ed.*, dt.name AS document_type_name, dt.code AS document_type_code,
      dc.name AS category_name, dt.expiring_soon_days, dt.urgent_expiring_days,
      v.original_filename, v.version_no, v.uploaded_at
     FROM employee_documents ed
     JOIN document_types dt ON dt.id = ed.document_type_id
     LEFT JOIN document_categories dc ON dc.id = ed.category_id
     LEFT JOIN employee_document_versions v ON v.id = ed.current_version_id
     WHERE ed.employee_id = ? AND ed.document_type_id = ? AND ed.status = 'ACTIVE'
     ORDER BY ed.updated_at DESC
     LIMIT 1`
  ).bind(employeeId, documentTypeId).first<EmployeeDocumentComplianceRow>();
}

async function getEmployeeActiveDocuments(db: Env["DB"], employeeId: string) {
  const rows = await db.prepare(
    `SELECT ed.*, dt.name AS document_type_name, dt.code AS document_type_code,
      dc.name AS category_name, dt.expiring_soon_days, dt.urgent_expiring_days,
      v.original_filename, v.version_no, v.uploaded_at
     FROM employee_documents ed
     JOIN document_types dt ON dt.id = ed.document_type_id
     LEFT JOIN document_categories dc ON dc.id = ed.category_id
     LEFT JOIN employee_document_versions v ON v.id = ed.current_version_id
     WHERE ed.employee_id = ? AND ed.status = 'ACTIVE'
     ORDER BY dt.sort_order, dt.name`
  ).bind(employeeId).all<EmployeeDocumentComplianceRow>();
  return rows.results;
}

async function getActiveWaivers(db: Env["DB"], employeeId: string) {
  const date = today();
  const rows = await db.prepare(
    `SELECT w.*, dt.name AS document_type_name, dt.code AS document_type_code
     FROM document_requirement_waivers w
     JOIN document_types dt ON dt.id = w.document_type_id
     WHERE w.employee_id = ? AND w.status = 'ACTIVE'
       AND date(w.waiver_start_date) <= date(?)
       AND (w.waiver_end_date IS NULL OR date(w.waiver_end_date) >= date(?))
     ORDER BY dt.name`
  ).bind(employeeId, date, date).all<WaiverRow>();
  return rows.results;
}

function documentDisplayStatus(document: EmployeeDocumentComplianceRow, settings: ComplianceSettingsRow) {
  const until = daysUntil(document.expiry_date);
  if (until === null) return { status: "VALID", days_until_expiry: null, urgent: false };
  if (until < 0) return { status: "EXPIRED", days_until_expiry: until, urgent: true };
  const expiringDays = document.expiring_soon_days ?? settings.default_expiring_soon_days;
  const urgentDays = document.urgent_expiring_days ?? settings.default_urgent_expiring_days;
  if (until <= urgentDays) return { status: "URGENT_EXPIRING", days_until_expiry: until, urgent: true };
  if (until <= expiringDays) return { status: "EXPIRING_SOON", days_until_expiry: until, urgent: false };
  return { status: "VALID", days_until_expiry: until, urgent: false };
}

export async function getEmployeeExpiringDocuments(db: Env["DB"], employeeId: string) {
  const settings = await getDocumentComplianceSettings(db);
  const docs = await getEmployeeActiveDocuments(db, employeeId);
  return docs.filter((doc) => {
    const status = documentDisplayStatus(doc, settings).status;
    return status === "EXPIRING_SOON" || status === "URGENT_EXPIRING";
  });
}

export async function getEmployeeExpiredDocuments(db: Env["DB"], employeeId: string) {
  const settings = await getDocumentComplianceSettings(db);
  const docs = await getEmployeeActiveDocuments(db, employeeId);
  return docs.filter((doc) => documentDisplayStatus(doc, settings).status === "EXPIRED");
}

export async function getEmployeeMissingRequiredDocuments(db: Env["DB"], employeeId: string) {
  const required = await getRequiredDocumentsForEmployee(db, employeeId);
  const waivers = await getActiveWaivers(db, employeeId);
  const missing: RequiredDocumentRow[] = [];
  for (const item of required) {
    const active = await getEmployeeActiveDocumentByType(db, employeeId, item.document_type_id);
    const waiver = waivers.find((row) => row.document_type_id === item.document_type_id);
    if (!active && !waiver) missing.push(item);
  }
  return missing;
}

export async function calculateEmployeeDocumentCompliance(db: Env["DB"], employeeId: string) {
  const settings = await getDocumentComplianceSettings(db);
  const employee = await getEmployee(db, employeeId);
  if (!employee) return null;
  const required = await getRequiredDocumentsForEmployee(db, employeeId);
  const documents = await getEmployeeActiveDocuments(db, employeeId);
  const waivers = await getActiveWaivers(db, employeeId);
  const requiredDetails = [];
  const missing = [];
  const waived = [];

  for (const item of required) {
    const document = documents.find((row) => row.document_type_id === item.document_type_id) ?? null;
    const waiver = waivers.find((row) => row.document_type_id === item.document_type_id) ?? null;
    const display = document ? documentDisplayStatus(document, settings) : null;
    const status = document ? display?.status ?? "VALID" : waiver ? "WAIVED" : "MISSING_REQUIRED";
    const detail = {
      ...item,
      document,
      waiver,
      status,
      display_status: status,
      missing: !document && !waiver,
      waived: Boolean(waiver),
      days_until_expiry: display?.days_until_expiry ?? null
    };
    requiredDetails.push(detail);
    if (!document && !waiver) missing.push(detail);
    if (waiver) waived.push(detail);
  }

  const expiring = documents
    .map((document) => ({ ...document, ...documentDisplayStatus(document, settings) }))
    .filter((document) => document.status === "EXPIRING_SOON" || document.status === "URGENT_EXPIRING");
  const urgent = expiring.filter((document) => document.status === "URGENT_EXPIRING");
  const expired = documents
    .map((document) => ({ ...document, ...documentDisplayStatus(document, settings) }))
    .filter((document) => document.status === "EXPIRED");

  const submitted = requiredDetails.filter((item) => item.document).length;
  const compliancePercent = required.length ? Math.round(((submitted + waived.length) / required.length) * 10000) / 100 : 100;
  let complianceStatus: ComplianceStatus = "COMPLIANT";
  if (!required.length) complianceStatus = "NOT_APPLICABLE";
  else if (expired.length) complianceStatus = "EXPIRED_DOCUMENTS";
  else if (missing.length) complianceStatus = "MISSING_REQUIRED";
  else if (urgent.length) complianceStatus = "URGENT_EXPIRING";
  else if (expiring.length) complianceStatus = "EXPIRING_SOON";
  else if (waived.length) complianceStatus = "WAIVER_ACTIVE";

  const warningSummary = {
    missing_required: missing.length,
    expired: expired.length,
    expiring_soon: expiring.length,
    urgent_expiring: urgent.length,
    waived_required: waived.length
  };

  return {
    employee,
    settings: toSettings(settings),
    compliance_status: complianceStatus,
    compliance_percent: compliancePercent,
    total_required_documents: required.length,
    submitted_required_documents: submitted,
    missing_required_documents: missing.length,
    expiring_documents: expiring.length,
    urgent_expiring_documents: urgent.length,
    expired_documents: expired.length,
    waived_required_documents: waived.length,
    required_documents: requiredDetails,
    missing_documents: missing,
    expiring_documents_list: expiring,
    expired_documents_list: expired,
    waivers,
    warning_summary: warningSummary
  };
}

export async function refreshEmployeeDocumentComplianceSnapshot(db: Env["DB"], employeeId: string) {
  const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
  if (!compliance) return null;
  const snapshotDate = today();
  const existing = await db.prepare("SELECT id FROM employee_document_compliance_snapshots WHERE employee_id = ? AND snapshot_date = ?").bind(employeeId, snapshotDate).first<{ id: string }>();
  const values = [
    compliance.total_required_documents,
    compliance.submitted_required_documents,
    compliance.missing_required_documents,
    compliance.expiring_documents,
    compliance.urgent_expiring_documents,
    compliance.expired_documents,
    compliance.waived_required_documents,
    compliance.compliance_status,
    compliance.compliance_percent,
    JSON.stringify(compliance.warning_summary),
    JSON.stringify(compliance.required_documents),
    JSON.stringify(compliance.expiring_documents_list),
    JSON.stringify({ refreshed_at: nowIso() })
  ] as const;
  if (existing) {
    await db.prepare(
      `UPDATE employee_document_compliance_snapshots SET
        total_required_documents = ?, submitted_required_documents = ?, missing_required_documents = ?,
        expiring_documents = ?, urgent_expiring_documents = ?, expired_documents = ?, waived_required_documents = ?,
        compliance_status = ?, compliance_percent = ?, warning_summary_json = ?, required_documents_json = ?,
        expiring_documents_json = ?, metadata_json = ?
       WHERE id = ?`
    ).bind(...values, existing.id).run();
    return { ...compliance, snapshot_id: existing.id, snapshot_date: snapshotDate };
  }
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO employee_document_compliance_snapshots
      (id, employee_id, snapshot_date, total_required_documents, submitted_required_documents, missing_required_documents,
       expiring_documents, urgent_expiring_documents, expired_documents, waived_required_documents,
       compliance_status, compliance_percent, warning_summary_json, required_documents_json, expiring_documents_json, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, employeeId, snapshotDate, ...values).run();
  return { ...compliance, snapshot_id: id, snapshot_date: snapshotDate };
}

export async function refreshAllDocumentComplianceSnapshots(db: Env["DB"], employeeIds?: string[]) {
  const ids = employeeIds?.length ? employeeIds : (await db.prepare("SELECT id FROM employees WHERE archived_at IS NULL").all<{ id: string }>()).results.map((row) => row.id);
  const refreshed = [];
  for (const employeeId of ids) {
    const snapshot = await refreshEmployeeDocumentComplianceSnapshot(db, employeeId);
    if (snapshot) refreshed.push(snapshot.employee.id);
  }
  return { refreshed_count: refreshed.length, employee_ids: refreshed };
}

export async function createDocumentExpiryAlertIfMissing(db: Env["DB"], input: { employeeId: string; documentTypeId: string; alertType: AlertRow["alert_type"]; documentId?: string | null; documentVersionId?: string | null; dueDate?: string | null; expiryDate?: string | null; severity?: AlertRow["severity"]; notes?: string | null; metadata?: unknown }) {
  const existing = await db.prepare(
    `SELECT id FROM document_expiry_alerts
     WHERE employee_id = ? AND document_type_id = ? AND alert_type = ?
       AND COALESCE(document_id, '') = COALESCE(?, '')
       AND status IN ('OPEN', 'ACKNOWLEDGED')
     LIMIT 1`
  ).bind(input.employeeId, input.documentTypeId, input.alertType, input.documentId ?? null).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO document_expiry_alerts
      (id, employee_id, document_id, document_type_id, document_version_id, alert_type, due_date, expiry_date, severity, notes, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.employeeId,
    input.documentId ?? null,
    input.documentTypeId,
    input.documentVersionId ?? null,
    input.alertType,
    input.dueDate ?? input.expiryDate ?? null,
    input.expiryDate ?? null,
    input.severity ?? "WARNING",
    input.notes ?? null,
    input.metadata === undefined ? null : JSON.stringify(input.metadata)
  ).run();
  return id;
}

export async function refreshDocumentExpiryAlerts(db: Env["DB"], employeeIds?: string[]) {
  const settings = await getDocumentComplianceSettings(db);
  const targets = employeeIds?.length ? employeeIds : (await db.prepare("SELECT id FROM employees WHERE archived_at IS NULL").all<{ id: string }>()).results.map((row) => row.id);
  let created = 0;
  for (const employeeId of targets) {
    const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
    if (!compliance) continue;
    if (settings.missing_required_document_alerts_enabled === 1) {
      for (const missing of compliance.missing_documents) {
        await createDocumentExpiryAlertIfMissing(db, {
          employeeId,
          documentTypeId: missing.document_type_id,
          alertType: "MISSING_REQUIRED",
          severity: missing.blocks_employee_activation ? "CRITICAL" : "WARNING",
          notes: "Required document is missing."
        });
        created += 1;
      }
    }
    if (settings.expiry_alerts_enabled === 1) {
      for (const document of compliance.expiring_documents_list) {
        await createDocumentExpiryAlertIfMissing(db, {
          employeeId,
          documentTypeId: document.document_type_id,
          documentId: document.id,
          documentVersionId: document.current_version_id,
          alertType: document.status === "URGENT_EXPIRING" ? "URGENT_EXPIRING" : "EXPIRING_SOON",
          expiryDate: document.expiry_date,
          severity: document.status === "URGENT_EXPIRING" ? "CRITICAL" : "WARNING",
          notes: "Document is approaching expiry."
        });
        created += 1;
      }
      for (const document of compliance.expired_documents_list) {
        await createDocumentExpiryAlertIfMissing(db, {
          employeeId,
          documentTypeId: document.document_type_id,
          documentId: document.id,
          documentVersionId: document.current_version_id,
          alertType: "EXPIRED",
          expiryDate: document.expiry_date,
          severity: "CRITICAL",
          notes: "Document is expired."
        });
        created += 1;
      }
    }
  }
  return { scanned_count: targets.length, created_or_existing_count: created };
}

export async function resolveDocumentAlertForRenewedDocument(db: Env["DB"], employeeId: string, documentId: string) {
  const now = nowIso();
  await db.prepare(
    `UPDATE document_expiry_alerts
     SET status = 'RESOLVED', resolved_at = ?, reason = COALESCE(reason, 'Resolved by document renewal'), updated_at = ?
     WHERE employee_id = ? AND document_id = ? AND status IN ('OPEN', 'ACKNOWLEDGED')`
  ).bind(now, now, employeeId, documentId).run();
  return { resolved: true };
}

export async function refreshComplianceAfterDocumentChange(db: Env["DB"], employeeId: string, documentId?: string | null) {
  const snapshot = await refreshEmployeeDocumentComplianceSnapshot(db, employeeId);
  if (documentId) await resolveDocumentAlertForRenewedDocument(db, employeeId, documentId);
  await refreshDocumentExpiryAlerts(db, [employeeId]);
  return snapshot;
}

export async function getDocumentComplianceAlerts(db: Env["DB"], options: { user?: AuthUser; scopeSql?: string; scopeParams?: BindValue[]; status?: string | null; employeeId?: string | null; limit?: number } = {}) {
  const conditions = ["1 = 1"];
  const binds: BindValue[] = [];
  if (options.scopeSql) {
    conditions.push(`dea.employee_id IN (SELECT e.id FROM employees e WHERE ${options.scopeSql})`);
    binds.push(...(options.scopeParams ?? []));
  }
  if (options.status) {
    conditions.push("dea.status = ?");
    binds.push(options.status);
  }
  if (options.employeeId) {
    conditions.push("dea.employee_id = ?");
    binds.push(options.employeeId);
  }
  const rows = await db.prepare(
    `SELECT dea.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
      dt.name AS document_type_name, dt.code AS document_type_code, dt.is_sensitive, ed.document_number, v.original_filename
     FROM document_expiry_alerts dea
     JOIN employees e ON e.id = dea.employee_id
     JOIN document_types dt ON dt.id = dea.document_type_id
     LEFT JOIN employee_documents ed ON ed.id = dea.document_id
     LEFT JOIN employee_document_versions v ON v.id = dea.document_version_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY CASE dea.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, COALESCE(dea.due_date, dea.alert_date) ASC
     LIMIT ?`
  ).bind(...binds, options.limit ?? 300).all<AlertRow>();
  return rows.results;
}

async function listRenewalCases(db: Env["DB"], conditions: string[], binds: BindValue[]) {
  const rows = await db.prepare(
    `SELECT rc.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
      dt.name AS document_type_name, dt.code AS document_type_code, u.name AS assigned_to_name
     FROM document_renewal_cases rc
     JOIN employees e ON e.id = rc.employee_id
     JOIN document_types dt ON dt.id = rc.document_type_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN users u ON u.id = rc.assigned_to_user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY CASE rc.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END, COALESCE(rc.due_date, rc.created_at) ASC`
  ).bind(...binds).all<RenewalCaseRow>();
  return rows.results;
}

async function getRenewalCase(db: Env["DB"], caseId: string) {
  const rows = await listRenewalCases(db, ["rc.id = ?"], [caseId]);
  return rows[0] ?? null;
}

function renewalCaseNumber() {
  return `DRC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function createRenewalCase(db: Env["DB"], input: { employeeId: string; documentTypeId: string; documentId?: string | null; currentVersionId?: string | null; caseType?: RenewalCaseRow["case_type"]; priority?: RenewalCaseRow["priority"]; currentExpiryDate?: string | null; targetRenewalDate?: string | null; dueDate?: string | null; assignedToUserId?: string | null; notes?: string | null; actor: AuthUser; metadata?: unknown }) {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO document_renewal_cases
      (id, employee_id, document_id, document_type_id, current_document_version_id, renewal_case_number, case_type,
       priority, current_expiry_date, target_renewal_date, due_date, assigned_to_user_id, created_by_user_id, notes, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.employeeId,
    input.documentId ?? null,
    input.documentTypeId,
    input.currentVersionId ?? null,
    renewalCaseNumber(),
    input.caseType ?? "RENEWAL",
    input.priority ?? "NORMAL",
    input.currentExpiryDate ?? null,
    input.targetRenewalDate ?? null,
    input.dueDate ?? input.targetRenewalDate ?? null,
    input.assignedToUserId ?? null,
    input.actor.id,
    input.notes ?? null,
    input.metadata === undefined ? null : JSON.stringify(input.metadata)
  ).run();
  await addRenewalEvent(db, { caseId: id, employeeId: input.employeeId, action: "document.renewal_case.created", newStatus: "OPEN", actor: input.actor, note: input.notes, metadata: input.metadata });
  return getRenewalCase(db, id);
}

export async function linkRenewalCaseToDocumentVersion(db: Env["DB"], caseId: string, documentId: string, versionId: string | null, actor?: AuthUser) {
  const current = await getRenewalCase(db, caseId);
  if (!current) return null;
  const now = nowIso();
  await db.prepare(
    `UPDATE document_renewal_cases
     SET completed_document_id = ?, completed_document_version_id = ?, updated_at = ?, updated_by_user_id = COALESCE(?, updated_by_user_id)
     WHERE id = ?`
  ).bind(documentId, versionId, now, actor?.id ?? null, caseId).run();
  return getRenewalCase(db, caseId);
}

export async function completeDocumentRenewalCase(db: Env["DB"], caseId: string, input: { completedDocumentId?: string | null; completedDocumentVersionId?: string | null; note?: string | null; actor: AuthUser }) {
  const current = await getRenewalCase(db, caseId);
  if (!current) return null;
  if (input.completedDocumentId) {
    await linkRenewalCaseToDocumentVersion(db, caseId, input.completedDocumentId, input.completedDocumentVersionId ?? null, input.actor);
  }
  const now = nowIso();
  await db.prepare(
    `UPDATE document_renewal_cases
     SET status = 'COMPLETED', completed_by_user_id = ?, completed_at = ?, updated_at = ?, updated_by_user_id = ?,
      completed_document_id = COALESCE(?, completed_document_id),
      completed_document_version_id = COALESCE(?, completed_document_version_id),
      notes = COALESCE(?, notes)
     WHERE id = ?`
  ).bind(input.actor.id, now, now, input.actor.id, input.completedDocumentId ?? null, input.completedDocumentVersionId ?? null, input.note ?? null, caseId).run();
  await addRenewalEvent(db, { caseId, employeeId: current.employee_id, action: "document.renewal_case.completed", previousStatus: current.status, newStatus: "COMPLETED", actor: input.actor, note: input.note });
  if (input.completedDocumentId) await resolveDocumentAlertForRenewedDocument(db, current.employee_id, input.completedDocumentId);
  await refreshComplianceAfterDocumentChange(db, current.employee_id, input.completedDocumentId ?? current.document_id);
  return getRenewalCase(db, caseId);
}

export async function replaceEmployeeDocumentForRenewal(db: Env["DB"], input: { employeeId: string; renewalCaseId: string; documentId: string }) {
  const document = await db.prepare("SELECT id, current_version_id FROM employee_documents WHERE id = ? AND employee_id = ? AND status = 'ACTIVE'").bind(input.documentId, input.employeeId).first<{ id: string; current_version_id: string | null }>();
  if (!document) return { ok: false, reason: "Document must be uploaded or replaced through the existing R2-backed document upload flow first." };
  await linkRenewalCaseToDocumentVersion(db, input.renewalCaseId, document.id, document.current_version_id);
  return { ok: true, document_id: document.id, document_version_id: document.current_version_id };
}

export async function validateDocumentAgainstTypeRules(db: Env["DB"], input: { documentTypeId: string; documentNumber?: string | null; issueDate?: string | null; expiryDate?: string | null }) {
  const type = await db.prepare("SELECT * FROM document_types WHERE id = ?").bind(input.documentTypeId).first<DocumentTypeComplianceRow>();
  if (!type) return { ok: false, code: "INVALID_DOCUMENT_TYPE", message: "Document type was not found." };
  if ((type.requires_document_number === 1 || type.document_number_required === 1) && !input.documentNumber) return { ok: false, code: "DOCUMENT_NUMBER_REQUIRED", message: "Document number is required." };
  if ((type.requires_issue_date === 1 || type.issue_date_required === 1) && !input.issueDate) return { ok: false, code: "ISSUE_DATE_REQUIRED", message: "Issue date is required." };
  if ((type.requires_expiry_date === 1 || type.expiry_required === 1) && !input.expiryDate) return { ok: false, code: "EXPIRY_DATE_REQUIRED", message: "Expiry date is required." };
  if (input.issueDate && input.expiryDate && input.expiryDate < input.issueDate) return { ok: false, code: "INVALID_DATES", message: "Expiry date cannot be before issue date." };
  return { ok: true, document_type: toDocumentType(type) };
}

export async function getContractDocumentCompliance(db: Env["DB"], contractId: string) {
  const contract = await db.prepare("SELECT id, employee_id, document_id, contract_end_date FROM employee_contracts WHERE id = ?").bind(contractId).first<{ id: string; employee_id: string; document_id: string | null; contract_end_date: string | null }>();
  if (!contract) return null;
  const compliance = await calculateEmployeeDocumentCompliance(db, contract.employee_id);
  return { contract, compliance };
}

export async function linkContractDocumentComplianceWarning(db: Env["DB"], contractId: string) {
  const status = await getContractDocumentCompliance(db, contractId);
  return {
    contract_id: contractId,
    warning: Boolean(status?.compliance && ["MISSING_REQUIRED", "URGENT_EXPIRING", "EXPIRED_DOCUMENTS"].includes(status.compliance.compliance_status)),
    compliance_status: status?.compliance?.compliance_status ?? "NOT_APPLICABLE"
  };
}

export async function getEmployeeContractDocumentStatus(db: Env["DB"], employeeId: string) {
  const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
  const contractTypeCodes = new Set(["EMPLOYMENT_CONTRACT"]);
  return compliance?.required_documents.filter((item) => contractTypeCodes.has(item.document_type_code)) ?? [];
}

export async function getOnboardingDocumentChecklist(db: Env["DB"], employeeId: string) {
  const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
  return compliance?.required_documents ?? [];
}

export async function getEmployeeActivationDocumentWarnings(db: Env["DB"], employeeId: string) {
  const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
  const blocking = compliance?.required_documents.filter((item) => item.missing && item.blocks_employee_activation === 1) ?? [];
  return { blocking, warnings: compliance?.warning_summary ?? null };
}

export async function getEmployeeStatusDocumentWarnings(db: Env["DB"], employeeId: string) {
  const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
  return { employee_id: employeeId, compliance_status: compliance?.compliance_status ?? "NOT_APPLICABLE", warnings: compliance?.warning_summary ?? null };
}

export async function getDocumentPayrollWarnings(db: Env["DB"], employeeId: string) {
  const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
  return (compliance?.required_documents ?? []).filter((item) => item.creates_payroll_warning === 1 && (item.missing || item.status === "EXPIRED"));
}

export async function getDocumentFinalSettlementWarnings(db: Env["DB"], employeeId: string) {
  const compliance = await calculateEmployeeDocumentCompliance(db, employeeId);
  return (compliance?.required_documents ?? []).filter((item) => item.creates_final_settlement_warning === 1 && (item.missing || item.status === "EXPIRED"));
}

export async function getDocumentClearanceWarningsForSettlement(db: Env["DB"], employeeId: string) {
  return getDocumentFinalSettlementWarnings(db, employeeId);
}

async function alertAction(c: Context<AppBindings>, status: AlertStatus, action: string) {
  const permissions = status === "ACKNOWLEDGED" ? ["documents.alerts.acknowledge", "documents.alerts.manage"] : status === "RESOLVED" ? ["documents.alerts.resolve", "documents.alerts.manage"] : ["documents.alerts.dismiss", "documents.alerts.manage"];
  const denied = requireAny(c, permissions);
  if (denied) return denied;
  const id = routeParam(c, "alertId");
  const alert = await getScopedAlert(c, id, "manage");
  if (!alert) return fail(c, 404, "NOT_FOUND", "Document alert was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = nullableString(body.reason);
  const now = nowIso();
  const actor = c.get("currentUser").id;
  const setColumn = status === "ACKNOWLEDGED" ? "acknowledged" : status === "RESOLVED" ? "resolved" : "dismissed";
  await c.env.DB.prepare(
    `UPDATE document_expiry_alerts
     SET status = ?, ${setColumn}_by_user_id = ?, ${setColumn}_at = ?, reason = COALESCE(?, reason), updated_at = ?
     WHERE id = ?`
  ).bind(status, actor, now, reason, now, id).run();
  await audit(c, `document.alert.${action}`, "document_expiry_alert", id, { oldValue: alert, newValue: { status }, reason });
  await publishAccessEvent(c.env, "document.expiry_alert_changed", { actor_user_id: actor, entity_type: "document", entity_id: alert.document_id ?? alert.document_type_id, action });
  return ok(c, { alert: await getScopedAlert(c, id, "view") });
}

async function getScopedAlert(c: Context<AppBindings>, alertId: string, action: "view" | "manage") {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", action, "e");
  const rows = await getDocumentComplianceAlerts(c.env.DB, { scopeSql: scope.sql, scopeParams: scope.params, limit: 1000 });
  return rows.find((row) => row.id === alertId) ?? null;
}

async function getScopedRenewalCase(c: Context<AppBindings>, caseId: string, action: "view" | "manage") {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", action, "e");
  const rows = await listRenewalCases(c.env.DB, [`rc.id = ?`, `rc.employee_id IN (SELECT e.id FROM employees e WHERE ${scope.sql})`], [caseId, ...scope.params]);
  return rows[0] ?? null;
}

documentComplianceRoutes.get("/compliance/settings", async (c) => {
  const denied = requireAny(c, SETTINGS_VIEW);
  if (denied) return denied;
  return ok(c, { settings: toSettings(await getDocumentComplianceSettings(c.env.DB)) });
});

documentComplianceRoutes.patch("/compliance/settings", async (c) => {
  const denied = requireAny(c, SETTINGS_UPDATE);
  if (denied) return denied;
  const old = await getDocumentComplianceSettings(c.env.DB);
  const body = await readJsonBody(c.req.raw);
  const input = {
    document_compliance_enabled: asBool(body.document_compliance_enabled, bool(old.document_compliance_enabled)) ? 1 : 0,
    expiry_alerts_enabled: asBool(body.expiry_alerts_enabled, bool(old.expiry_alerts_enabled)) ? 1 : 0,
    missing_required_document_alerts_enabled: asBool(body.missing_required_document_alerts_enabled, bool(old.missing_required_document_alerts_enabled)) ? 1 : 0,
    renewal_workflow_enabled: asBool(body.renewal_workflow_enabled, bool(old.renewal_workflow_enabled)) ? 1 : 0,
    auto_create_renewal_case_for_expiring_document: asBool(body.auto_create_renewal_case_for_expiring_document, bool(old.auto_create_renewal_case_for_expiring_document)) ? 1 : 0,
    auto_create_missing_document_case: asBool(body.auto_create_missing_document_case, bool(old.auto_create_missing_document_case)) ? 1 : 0,
    default_expiring_soon_days: Math.max(0, num(body.default_expiring_soon_days, old.default_expiring_soon_days)),
    default_urgent_expiring_days: Math.max(0, num(body.default_urgent_expiring_days, old.default_urgent_expiring_days)),
    default_overdue_grace_days: Math.max(0, num(body.default_overdue_grace_days, old.default_overdue_grace_days)),
    require_reason_for_renewal_case_cancel: asBool(body.require_reason_for_renewal_case_cancel, bool(old.require_reason_for_renewal_case_cancel)) ? 1 : 0,
    require_reason_for_document_waiver: asBool(body.require_reason_for_document_waiver, bool(old.require_reason_for_document_waiver)) ? 1 : 0,
    allow_document_requirement_waiver: asBool(body.allow_document_requirement_waiver, bool(old.allow_document_requirement_waiver)) ? 1 : 0,
    allow_employee_view_document_compliance: asBool(body.allow_employee_view_document_compliance, bool(old.allow_employee_view_document_compliance)) ? 1 : 0,
    allow_employee_download_documents: asBool(body.allow_employee_download_documents, bool(old.allow_employee_download_documents)) ? 1 : 0,
    employee_document_upload_request_placeholder_enabled: asBool(body.employee_document_upload_request_placeholder_enabled, bool(old.employee_document_upload_request_placeholder_enabled)) ? 1 : 0,
    sensitive_document_view_audit_enabled: asBool(body.sensitive_document_view_audit_enabled, bool(old.sensitive_document_view_audit_enabled)) ? 1 : 0,
    compliance_dashboard_enabled: asBool(body.compliance_dashboard_enabled, bool(old.compliance_dashboard_enabled)) ? 1 : 0
  };
  await c.env.DB.prepare(
    `UPDATE document_compliance_settings SET
      document_compliance_enabled = ?, expiry_alerts_enabled = ?, missing_required_document_alerts_enabled = ?,
      renewal_workflow_enabled = ?, auto_create_renewal_case_for_expiring_document = ?, auto_create_missing_document_case = ?,
      default_expiring_soon_days = ?, default_urgent_expiring_days = ?, default_overdue_grace_days = ?,
      require_reason_for_renewal_case_cancel = ?, require_reason_for_document_waiver = ?, allow_document_requirement_waiver = ?,
      allow_employee_view_document_compliance = ?, allow_employee_download_documents = ?, employee_document_upload_request_placeholder_enabled = ?,
      sensitive_document_view_audit_enabled = ?, compliance_dashboard_enabled = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    input.document_compliance_enabled,
    input.expiry_alerts_enabled,
    input.missing_required_document_alerts_enabled,
    input.renewal_workflow_enabled,
    input.auto_create_renewal_case_for_expiring_document,
    input.auto_create_missing_document_case,
    input.default_expiring_soon_days,
    input.default_urgent_expiring_days,
    input.default_overdue_grace_days,
    input.require_reason_for_renewal_case_cancel,
    input.require_reason_for_document_waiver,
    input.allow_document_requirement_waiver,
    input.allow_employee_view_document_compliance,
    input.allow_employee_download_documents,
    input.employee_document_upload_request_placeholder_enabled,
    input.sensitive_document_view_audit_enabled,
    input.compliance_dashboard_enabled,
    nowIso(),
    old.id
  ).run();
  const updated = await getDocumentComplianceSettings(c.env.DB);
  await audit(c, "document.compliance_settings.updated", "document_compliance_settings", old.id, { oldValue: old, newValue: updated });
  return ok(c, { settings: toSettings(updated) });
});

documentComplianceRoutes.get("/types/compliance", async (c) => {
  const denied = requireAny(c, TYPE_COMPLIANCE_VIEW);
  if (denied) return denied;
  const rows = await c.env.DB.prepare("SELECT dt.*, dc.name AS category_name FROM document_types dt LEFT JOIN document_categories dc ON dc.id = dt.category_id ORDER BY dt.is_active DESC, dt.sort_order, dt.name").all<DocumentTypeComplianceRow>();
  return ok(c, { document_types: rows.results.map(toDocumentType) });
});

documentComplianceRoutes.patch("/types/:typeId/compliance", async (c) => {
  const denied = requireAny(c, TYPE_COMPLIANCE_UPDATE);
  if (denied) return denied;
  const id = routeParam(c, "typeId");
  const old = await c.env.DB.prepare("SELECT * FROM document_types WHERE id = ?").bind(id).first<DocumentTypeComplianceRow>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Document type was not found.");
  const body = await readJsonBody(c.req.raw);
  const input = {
    expiry_required: asBool(body.expiry_required, bool(old.expiry_required)) ? 1 : 0,
    issue_date_required: asBool(body.issue_date_required, bool(old.issue_date_required)) ? 1 : 0,
    document_number_required: asBool(body.document_number_required, bool(old.document_number_required)) ? 1 : 0,
    urgent_expiring_days: body.urgent_expiring_days === null ? null : Math.max(0, num(body.urgent_expiring_days, old.urgent_expiring_days ?? 7)),
    renewal_case_auto_create: asBool(body.renewal_case_auto_create, bool(old.renewal_case_auto_create)) ? 1 : 0,
    employee_summary_visible: asBool(body.employee_summary_visible, bool(old.employee_summary_visible)) ? 1 : 0,
    employee_download_allowed: asBool(body.employee_download_allowed, bool(old.employee_download_allowed)) ? 1 : 0,
    blocks_employee_activation: asBool(body.blocks_employee_activation, bool(old.blocks_employee_activation)) ? 1 : 0,
    creates_payroll_warning: asBool(body.creates_payroll_warning, bool(old.creates_payroll_warning)) ? 1 : 0,
    creates_final_settlement_warning: asBool(body.creates_final_settlement_warning, bool(old.creates_final_settlement_warning)) ? 1 : 0,
    compliance_weight: body.compliance_weight === null ? null : Math.max(0, num(body.compliance_weight, old.compliance_weight ?? 50)),
    sensitivity_level: ["NORMAL", "SENSITIVE", "HIGHLY_SENSITIVE"].includes(readString(body.sensitivity_level)) ? readString(body.sensitivity_level) : old.sensitivity_level,
    renewal_instructions: nullableString(body.renewal_instructions)
  };
  await c.env.DB.prepare(
    `UPDATE document_types SET
      expiry_required = ?, issue_date_required = ?, document_number_required = ?, urgent_expiring_days = ?,
      renewal_case_auto_create = ?, employee_summary_visible = ?, employee_download_allowed = ?,
      blocks_employee_activation = ?, creates_payroll_warning = ?, creates_final_settlement_warning = ?,
      compliance_weight = ?, sensitivity_level = ?, renewal_instructions = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    input.expiry_required,
    input.issue_date_required,
    input.document_number_required,
    input.urgent_expiring_days,
    input.renewal_case_auto_create,
    input.employee_summary_visible,
    input.employee_download_allowed,
    input.blocks_employee_activation,
    input.creates_payroll_warning,
    input.creates_final_settlement_warning,
    input.compliance_weight,
    input.sensitivity_level,
    input.renewal_instructions,
    nowIso(),
    id
  ).run();
  const updated = await c.env.DB.prepare("SELECT dt.*, dc.name AS category_name FROM document_types dt LEFT JOIN document_categories dc ON dc.id = dt.category_id WHERE dt.id = ?").bind(id).first<DocumentTypeComplianceRow>();
  await audit(c, "document.type_compliance.updated", "document_type", id, { oldValue: old, newValue: updated });
  return ok(c, { document_type: updated ? toDocumentType(updated) : null });
});

documentComplianceRoutes.post("/required-rules/:ruleId/archive", async (c) => {
  const denied = requireAny(c, ["documents.required_rules.archive", "documents.required_rules.manage", "documents.compliance.manage"]);
  if (denied) return denied;
  const id = routeParam(c, "ruleId");
  const old = await c.env.DB.prepare("SELECT * FROM document_required_rules WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Required rule was not found.");
  await c.env.DB.prepare("UPDATE document_required_rules SET is_active = 0, updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
  await audit(c, "document.required_rule.archived", "document_required_rule", id, { oldValue: old, newValue: { is_active: false } });
  return ok(c, { archived: true });
});

documentComplianceRoutes.post("/compliance/refresh", async (c) => {
  const denied = requireAny(c, COMPLIANCE_REFRESH);
  if (denied) return denied;
  const employees = await employeeListForScope(c, "documents", "view");
  const result = await refreshAllDocumentComplianceSnapshots(c.env.DB, employees.map((employee) => employee.id));
  const alerts = await refreshDocumentExpiryAlerts(c.env.DB, employees.map((employee) => employee.id));
  await audit(c, "document.compliance.refreshed", "document_compliance", "bulk", { newValue: { result, alerts } });
  await publishAccessEvent(c.env, "dashboard.documents.changed", { actor_user_id: c.get("currentUser").id, entity_type: "dashboard", action: "document_compliance_refreshed" });
  return ok(c, { ...result, alerts });
});

documentComplianceRoutes.get("/compliance/dashboard", async (c) => {
  const denied = requireAny(c, COMPLIANCE_VIEW);
  if (denied) return denied;
  const employees = await employeeListForScope(c, "documents", "view");
  const rows = [];
  for (const employee of employees) {
    const snapshot = await refreshEmployeeDocumentComplianceSnapshot(c.env.DB, employee.id);
    if (snapshot) rows.push(snapshot);
  }
  const alerts = await getDocumentComplianceAlerts(c.env.DB, { status: "OPEN", limit: 10, scopeSql: (await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", "view", "e")).sql, scopeParams: (await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", "view", "e")).params });
  const summary = {
    employee_count: rows.length,
    compliant: rows.filter((row) => row.compliance_status === "COMPLIANT").length,
    missing_required: rows.reduce((sum, row) => sum + row.missing_required_documents, 0),
    expiring_soon: rows.reduce((sum, row) => sum + row.expiring_documents, 0),
    urgent_expiring: rows.reduce((sum, row) => sum + row.urgent_expiring_documents, 0),
    expired: rows.reduce((sum, row) => sum + row.expired_documents, 0),
    waivers: rows.reduce((sum, row) => sum + row.waived_required_documents, 0),
    open_alerts: alerts.length
  };
  return ok(c, { summary, employees: rows.slice(0, 50), alerts: alerts.map((row) => maskSensitive(row as unknown as Record<string, unknown>, hasAny(c.get("currentUser"), SENSITIVE_VIEW))) });
});

async function complianceList(c: Context<AppBindings>, kind: "missing" | "expiring" | "expired") {
  const denied = requireAny(c, COMPLIANCE_VIEW);
  if (denied) return denied;
  const canSensitive = hasAny(c.get("currentUser"), SENSITIVE_VIEW);
  const employees = await employeeListForScope(c, "documents", "view");
  const rows: Record<string, unknown>[] = [];
  for (const employee of employees) {
    const compliance = await calculateEmployeeDocumentCompliance(c.env.DB, employee.id);
    if (!compliance) continue;
    if (kind === "missing") {
      for (const item of compliance.missing_documents) rows.push(maskSensitive({ ...employee, ...item, reason: "Required document is missing.", is_sensitive: item.is_sensitive }, canSensitive));
    } else if (kind === "expiring") {
      for (const item of compliance.expiring_documents_list) rows.push(maskSensitive({ ...employee, ...item, document_type_name: item.document_type_name, is_sensitive: item.is_sensitive }, canSensitive));
    } else {
      for (const item of compliance.expired_documents_list) rows.push(maskSensitive({ ...employee, ...item, document_type_name: item.document_type_name, is_sensitive: item.is_sensitive }, canSensitive));
    }
  }
  return ok(c, { [kind]: rows, rows });
}

documentComplianceRoutes.get("/compliance/missing", (c) => complianceList(c, "missing"));
documentComplianceRoutes.get("/compliance/expiring", (c) => complianceList(c, "expiring"));
documentComplianceRoutes.get("/compliance/expired", (c) => complianceList(c, "expired"));

documentComplianceRoutes.get("/alerts", async (c) => {
  const denied = requireAny(c, ALERTS_VIEW);
  if (denied) return denied;
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", "view", "e");
  const alerts = await getDocumentComplianceAlerts(c.env.DB, {
    scopeSql: scope.sql,
    scopeParams: scope.params,
    status: readString(c.req.query("status")) || null,
    employeeId: readString(c.req.query("employee_id")) || null
  });
  const canSensitive = hasAny(c.get("currentUser"), SENSITIVE_VIEW);
  return ok(c, { alerts: alerts.map((row) => maskSensitive(row as unknown as Record<string, unknown>, canSensitive)) });
});

documentComplianceRoutes.post("/alerts/refresh", async (c) => {
  const denied = requireAny(c, COMPLIANCE_REFRESH);
  if (denied) return denied;
  const employees = await employeeListForScope(c, "documents", "view");
  const result = await refreshDocumentExpiryAlerts(c.env.DB, employees.map((employee) => employee.id));
  await audit(c, "document.alerts.refreshed", "document_expiry_alert", "bulk", { newValue: result });
  return ok(c, result);
});

documentComplianceRoutes.post("/alerts/:alertId/acknowledge", (c) => alertAction(c, "ACKNOWLEDGED", "acknowledged"));
documentComplianceRoutes.post("/alerts/:alertId/resolve", (c) => alertAction(c, "RESOLVED", "resolved"));
documentComplianceRoutes.post("/alerts/:alertId/dismiss", (c) => alertAction(c, "DISMISSED", "dismissed"));

documentComplianceRoutes.get("/renewal-cases", async (c) => {
  const denied = requireAny(c, RENEWAL_VIEW);
  if (denied) return denied;
  const conditions = ["1 = 1"];
  const binds: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", "view", "e");
  conditions.push(`rc.employee_id IN (SELECT e.id FROM employees e WHERE ${scope.sql})`);
  binds.push(...scope.params);
  const status = readString(c.req.query("status"));
  if (status) {
    conditions.push("rc.status = ?");
    binds.push(status);
  }
  const cases = await listRenewalCases(c.env.DB, conditions, binds);
  return ok(c, { renewal_cases: cases });
});

documentComplianceRoutes.get("/renewal-cases/:caseId", async (c) => {
  const denied = requireAny(c, RENEWAL_VIEW);
  if (denied) return denied;
  const row = await getScopedRenewalCase(c, routeParam(c, "caseId"), "view");
  if (!row) return fail(c, 404, "NOT_FOUND", "Renewal case was not found.");
  const events = await c.env.DB.prepare("SELECT * FROM document_renewal_case_events WHERE renewal_case_id = ? ORDER BY created_at DESC").bind(row.id).all();
  return ok(c, { renewal_case: row, events: events.results });
});

documentComplianceRoutes.patch("/renewal-cases/:caseId", async (c) => {
  const denied = requireAny(c, RENEWAL_UPDATE);
  if (denied) return denied;
  const current = await getScopedRenewalCase(c, routeParam(c, "caseId"), "manage");
  if (!current) return fail(c, 404, "NOT_FOUND", "Renewal case was not found.");
  const body = await readJsonBody(c.req.raw);
  const status = readString(body.status) as RenewalCaseStatus;
  const priority = readString(body.priority) as RenewalCaseRow["priority"];
  const targetRenewalDate = nullableString(body.target_renewal_date) ?? current.target_renewal_date;
  const dueDate = nullableString(body.due_date) ?? current.due_date;
  const dateIssues = validateDateRange({ start: targetRenewalDate, end: dueDate, startField: "target_renewal_date", endField: "due_date", label: "Renewal due date" });
  if (hasValidationErrors(dateIssues)) return validationResponse(c, dateIssues);
  await c.env.DB.prepare(
    `UPDATE document_renewal_cases SET status = ?, priority = ?, target_renewal_date = ?, due_date = ?,
      assigned_to_user_id = ?, notes = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?`
  ).bind(
    status || current.status,
    ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority) ? priority : current.priority,
    targetRenewalDate,
    dueDate,
    nullableString(body.assigned_to_user_id) ?? current.assigned_to_user_id,
    nullableString(body.notes) ?? current.notes,
    nowIso(),
    c.get("currentUser").id,
    current.id
  ).run();
  const updated = await getRenewalCase(c.env.DB, current.id);
  await addRenewalEvent(c.env.DB, { caseId: current.id, employeeId: current.employee_id, action: "document.renewal_case.updated", previousStatus: current.status, newStatus: updated?.status ?? current.status, actor: c.get("currentUser"), note: nullableString(body.notes) });
  await audit(c, "document.renewal_case.updated", "document_renewal_case", current.id, { oldValue: current, newValue: updated });
  return ok(c, { renewal_case: updated });
});

async function renewalStatusAction(c: Context<AppBindings>, status: RenewalCaseStatus, permissionSet: string[], action: string, requireReason = false) {
  const denied = requireAny(c, permissionSet);
  if (denied) return denied;
  const current = await getScopedRenewalCase(c, routeParam(c, "caseId"), "manage");
  if (!current) return fail(c, 404, "NOT_FOUND", "Renewal case was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = nullableString(body.reason);
  if (requireReason && !reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  if (status === "COMPLETED") {
    const updated = await completeDocumentRenewalCase(c.env.DB, current.id, { completedDocumentId: nullableString(body.completed_document_id), completedDocumentVersionId: nullableString(body.completed_document_version_id), note: nullableString(body.note), actor: c.get("currentUser") });
    await audit(c, "document.renewal_case.completed", "document_renewal_case", current.id, { oldValue: current, newValue: updated, reason });
    return ok(c, { renewal_case: updated });
  }
  const now = nowIso();
  const updates = status === "CANCELLED"
    ? "status = ?, cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ?, updated_by_user_id = ?"
    : "status = ?, updated_at = ?, updated_by_user_id = ?";
  const binds = status === "CANCELLED" ? [status, c.get("currentUser").id, now, reason, now, c.get("currentUser").id, current.id] : [status, now, c.get("currentUser").id, current.id];
  await c.env.DB.prepare(`UPDATE document_renewal_cases SET ${updates} WHERE id = ?`).bind(...binds).run();
  const updated = await getRenewalCase(c.env.DB, current.id);
  await addRenewalEvent(c.env.DB, { caseId: current.id, employeeId: current.employee_id, action: `document.renewal_case.${action}`, previousStatus: current.status, newStatus: status, actor: c.get("currentUser"), reason });
  await audit(c, `document.renewal_case.${action}`, "document_renewal_case", current.id, { oldValue: current, newValue: updated, reason });
  return ok(c, { renewal_case: updated });
}

documentComplianceRoutes.post("/renewal-cases/:caseId/assign", async (c) => {
  const denied = requireAny(c, RENEWAL_ASSIGN);
  if (denied) return denied;
  const current = await getScopedRenewalCase(c, routeParam(c, "caseId"), "manage");
  if (!current) return fail(c, 404, "NOT_FOUND", "Renewal case was not found.");
  const body = await readJsonBody(c.req.raw);
  const assignedTo = nullableString(body.assigned_to_user_id);
  if (!assignedTo) return fail(c, 400, "ASSIGNEE_REQUIRED", "Assigned user is required.");
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND status = 'ACTIVE'").bind(assignedTo).first<{ id: string }>();
  if (!user) return fail(c, 400, "INVALID_ASSIGNEE", "Assigned user was not found or is not active.");
  await c.env.DB.prepare("UPDATE document_renewal_cases SET assigned_to_user_id = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?").bind(assignedTo, nowIso(), c.get("currentUser").id, current.id).run();
  const updated = await getRenewalCase(c.env.DB, current.id);
  await addRenewalEvent(c.env.DB, { caseId: current.id, employeeId: current.employee_id, action: "document.renewal_case.assigned", previousStatus: current.status, newStatus: updated?.status ?? current.status, actor: c.get("currentUser"), note: nullableString(body.note), metadata: { assigned_to_user_id: assignedTo } });
  await audit(c, "document.renewal_case.assigned", "document_renewal_case", current.id, { oldValue: current, newValue: updated });
  return ok(c, { renewal_case: updated });
});
documentComplianceRoutes.post("/renewal-cases/:caseId/mark-in-progress", (c) => renewalStatusAction(c, "IN_PROGRESS", RENEWAL_UPDATE, "marked_in_progress"));
documentComplianceRoutes.post("/renewal-cases/:caseId/mark-waiting", (c) => renewalStatusAction(c, "WAITING_FOR_EMPLOYEE", RENEWAL_UPDATE, "marked_waiting"));
documentComplianceRoutes.post("/renewal-cases/:caseId/complete", (c) => renewalStatusAction(c, "COMPLETED", RENEWAL_COMPLETE, "completed"));
documentComplianceRoutes.post("/renewal-cases/:caseId/cancel", (c) => renewalStatusAction(c, "CANCELLED", RENEWAL_CANCEL, "cancelled", true));

documentComplianceRoutes.get("/renewal-cases/:caseId/events", async (c) => {
  const denied = requireAny(c, RENEWAL_VIEW);
  if (denied) return denied;
  const current = await getScopedRenewalCase(c, routeParam(c, "caseId"), "view");
  if (!current) return fail(c, 404, "NOT_FOUND", "Renewal case was not found.");
  const events = await c.env.DB.prepare("SELECT * FROM document_renewal_case_events WHERE renewal_case_id = ? ORDER BY created_at DESC").bind(current.id).all();
  return ok(c, { events: events.results });
});

documentComplianceRoutes.get("/waivers", async (c) => {
  const denied = requireAny(c, WAIVER_VIEW);
  if (denied) return denied;
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", "view", "e");
  const rows = await c.env.DB.prepare(
    `SELECT w.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
      dt.name AS document_type_name, dt.code AS document_type_code
     FROM document_requirement_waivers w
     JOIN employees e ON e.id = w.employee_id
     JOIN document_types dt ON dt.id = w.document_type_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     WHERE w.employee_id IN (SELECT e.id FROM employees e WHERE ${scope.sql})
     ORDER BY w.created_at DESC`
  ).bind(...scope.params).all<WaiverRow>();
  return ok(c, { waivers: rows.results });
});

documentComplianceRoutes.post("/waivers/:waiverId/cancel", async (c) => {
  const denied = requireAny(c, WAIVER_CANCEL);
  if (denied) return denied;
  const id = routeParam(c, "waiverId");
  const old = await c.env.DB.prepare("SELECT * FROM document_requirement_waivers WHERE id = ?").bind(id).first<WaiverRow>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Waiver was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), old.employee_id, "documents", "manage"))) return fail(c, 404, "NOT_FOUND", "Waiver was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = nullableString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE document_requirement_waivers SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), reason, nowIso(), id).run();
  const updated = await c.env.DB.prepare("SELECT * FROM document_requirement_waivers WHERE id = ?").bind(id).first<WaiverRow>();
  await refreshComplianceAfterDocumentChange(c.env.DB, old.employee_id);
  await audit(c, "document.requirement_waiver.cancelled", "document_requirement_waiver", id, { oldValue: old, newValue: updated, reason });
  return ok(c, { waiver: updated });
});

employeeDocumentComplianceRoutes.get("/:employeeId/documents/compliance", async (c) => {
  const denied = requireAny(c, EMPLOYEE_COMPLIANCE_VIEW);
  if (denied) return denied;
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const compliance = await calculateEmployeeDocumentCompliance(c.env.DB, employeeId);
  if (!compliance) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const canSensitive = hasAny(c.get("currentUser"), SENSITIVE_VIEW);
  return ok(c, {
    compliance: {
      ...compliance,
      required_documents: compliance.required_documents.map((row) => maskSensitive(row as unknown as Record<string, unknown>, canSensitive)),
      expiring_documents_list: compliance.expiring_documents_list.map((row) => maskSensitive(row as unknown as Record<string, unknown>, canSensitive)),
      expired_documents_list: compliance.expired_documents_list.map((row) => maskSensitive(row as unknown as Record<string, unknown>, canSensitive))
    }
  });
});

employeeDocumentComplianceRoutes.get("/:employeeId/documents/compliance-summary", async (c) => {
  const denied = requireAny(c, EMPLOYEE_COMPLIANCE_VIEW);
  if (denied) return denied;
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const snapshot = await refreshEmployeeDocumentComplianceSnapshot(c.env.DB, employeeId);
  return ok(c, { summary: snapshot });
});

employeeDocumentComplianceRoutes.post("/:employeeId/documents/compliance/refresh", async (c) => {
  const denied = requireAny(c, [...COMPLIANCE_REFRESH, ...EMPLOYEE_COMPLIANCE_MANAGE]);
  if (denied) return denied;
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const snapshot = await refreshComplianceAfterDocumentChange(c.env.DB, employeeId);
  await audit(c, "employee.document_compliance.refreshed", "employee", employeeId, { newValue: snapshot });
  return ok(c, { compliance: snapshot });
});

employeeDocumentComplianceRoutes.post("/:employeeId/documents/waivers", async (c) => {
  const denied = requireAny(c, WAIVER_CREATE);
  if (denied) return denied;
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const settings = await getDocumentComplianceSettings(c.env.DB);
  if (settings.allow_document_requirement_waiver !== 1) return fail(c, 409, "WAIVERS_DISABLED", "Document requirement waivers are disabled.");
  const body = await readJsonBody(c.req.raw);
  const documentTypeId = readString(body.document_type_id);
  const reason = nullableString(body.waiver_reason ?? body.reason);
  const waiverIssues = [
    ...validateDocumentRules({ documentTypeId }),
    ...validateDateRange({
      start: nullableString(body.waiver_start_date) ?? today(),
      end: nullableString(body.waiver_end_date),
      startField: "waiver_start_date",
      endField: "waiver_end_date",
      label: "Waiver end date"
    })
  ];
  if (hasValidationErrors(waiverIssues)) return validationResponse(c, waiverIssues);
  if (settings.require_reason_for_document_waiver === 1 && !reason) return fail(c, 400, "REASON_REQUIRED", "Waiver reason is required.");
  const type = await c.env.DB.prepare("SELECT id FROM document_types WHERE id = ? AND is_active = 1").bind(documentTypeId).first<{ id: string }>();
  if (!type) return fail(c, 400, "INVALID_DOCUMENT_TYPE", "Document type was not found.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO document_requirement_waivers
      (id, employee_id, document_type_id, required_rule_id, waiver_reason, waiver_start_date, waiver_end_date, approved_by_user_id, approved_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, employeeId, documentTypeId, nullableString(body.required_rule_id), reason ?? "Waived", nullableString(body.waiver_start_date) ?? today(), nullableString(body.waiver_end_date), c.get("currentUser").id, nowIso(), c.get("currentUser").id).run();
  const waiver = await c.env.DB.prepare("SELECT * FROM document_requirement_waivers WHERE id = ?").bind(id).first<WaiverRow>();
  await refreshComplianceAfterDocumentChange(c.env.DB, employeeId);
  await audit(c, "document.requirement_waiver.created", "document_requirement_waiver", id, { newValue: waiver, reason });
  return ok(c, { waiver }, 201);
});

employeeDocumentComplianceRoutes.post("/:employeeId/documents/renewal-cases", async (c) => {
  const denied = requireAny(c, RENEWAL_CREATE);
  if (denied) return denied;
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const body = await readJsonBody(c.req.raw);
  const documentTypeId = readString(body.document_type_id);
  const caseIssues = [
    ...validateDocumentRules({ documentTypeId }),
    ...validateDateRange({
      start: nullableString(body.target_renewal_date),
      end: nullableString(body.due_date),
      startField: "target_renewal_date",
      endField: "due_date",
      label: "Renewal due date"
    })
  ];
  if (hasValidationErrors(caseIssues)) return validationResponse(c, caseIssues);
  const documentId = nullableString(body.document_id);
  const document = documentId ? await c.env.DB.prepare("SELECT id, current_version_id, expiry_date FROM employee_documents WHERE id = ? AND employee_id = ?").bind(documentId, employeeId).first<{ id: string; current_version_id: string | null; expiry_date: string | null }>() : null;
  const row = await createRenewalCase(c.env.DB, {
    employeeId,
    documentTypeId,
    documentId,
    currentVersionId: document?.current_version_id ?? null,
    caseType: (readString(body.case_type) as RenewalCaseRow["case_type"]) || "RENEWAL",
    priority: (readString(body.priority) as RenewalCaseRow["priority"]) || "NORMAL",
    currentExpiryDate: nullableString(body.current_expiry_date) ?? document?.expiry_date ?? null,
    targetRenewalDate: nullableString(body.target_renewal_date),
    dueDate: nullableString(body.due_date),
    assignedToUserId: nullableString(body.assigned_to_user_id),
    notes: nullableString(body.notes),
    actor: c.get("currentUser")
  });
  await audit(c, "document.renewal_case.created", "document_renewal_case", row?.id ?? null, { newValue: row });
  return ok(c, { renewal_case: row }, 201);
});

selfServiceDocumentComplianceRoutes.get("/documents/compliance", async (c) => {
  const denied = requireAny(c, ["self_service.documents.compliance.view", "self_service.view"]);
  if (denied) return denied;
  const settings = await getDocumentComplianceSettings(c.env.DB);
  if (settings.allow_employee_view_document_compliance !== 1) return fail(c, 403, "SELF_SERVICE_DOCUMENT_COMPLIANCE_DISABLED", "Employee document compliance view is disabled.");
  const employeeId = c.get("currentUser").employee_id;
  if (!employeeId) return fail(c, 404, "NOT_FOUND", "No linked employee profile was found.");
  const compliance = await calculateEmployeeDocumentCompliance(c.env.DB, employeeId);
  if (!compliance) return fail(c, 404, "NOT_FOUND", "No linked employee profile was found.");
  const visibleRequired = compliance.required_documents.filter((item) => item.document?.document_type_code !== "PAYROLL_DOCUMENT").map((item) => ({
    document_type_name: item.document_type_name,
    document_type_code: item.document_type_code,
    status: item.status,
    missing: item.missing,
    waived: item.waived,
    expiry_date: item.document?.expiry_date ?? null,
    days_until_expiry: item.days_until_expiry,
    employee_download_allowed: item.document ? Boolean((item.document as Record<string, unknown>).employee_download_allowed) : false
  }));
  const cases = await listRenewalCases(c.env.DB, ["rc.employee_id = ?"], [employeeId]);
  return ok(c, {
    compliance: {
      compliance_status: compliance.compliance_status,
      compliance_percent: compliance.compliance_percent,
      warning_summary: compliance.warning_summary,
      required_documents: visibleRequired,
      renewal_cases: cases.map((row) => ({
        renewal_case_number: row.renewal_case_number,
        document_type_name: row.document_type_name,
        status: row.status,
        priority: row.priority,
        due_date: row.due_date,
        current_expiry_date: row.current_expiry_date
      })),
      upload_request_enabled: bool(settings.employee_document_upload_request_placeholder_enabled),
      upload_note: bool(settings.employee_document_upload_request_placeholder_enabled)
        ? "Document upload requests are prepared for a later self-service submission flow."
        : "Contact HR/Admin if a required document needs renewal or replacement."
    }
  });
});
