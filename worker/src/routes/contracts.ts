import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings, Env } from "../types";
import { hasValidationErrors, validateContractRules, validationResponse } from "../lib/moduleValidation";
import { fail, getClientIp, nowIso, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type ContractStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "RENEWED" | "TERMINATED" | "CANCELLED" | "ARCHIVED";
type ApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "SENT_BACK";
type ProbationStatus = "NOT_APPLICABLE" | "IN_PROBATION" | "EXTENDED" | "CONFIRMED" | "FAILED" | "TERMINATED_DURING_PROBATION";
type RenewalStatus = "NOT_APPLICABLE" | "NOT_DUE" | "DUE_SOON" | "PENDING_RENEWAL" | "RENEWED" | "NOT_RENEWED";

const contractRoutes = new Hono<AppBindings>();
const employeeContractRoutes = new Hono<AppBindings>();
const selfServiceContractRoutes = new Hono<AppBindings>();

contractRoutes.use("*", requireAuth);
employeeContractRoutes.use("*", requireAuth);
selfServiceContractRoutes.use("*", requireAuth);

const CONTRACT_READ = ["contracts.view", "contracts.manage", "employees.contracts.view"];
const CONTRACT_CREATE = ["contracts.create", "contracts.manage", "employees.contracts.manage"];
const CONTRACT_UPDATE = ["contracts.update", "contracts.manage", "employees.contracts.manage"];
const CONTRACT_APPROVE = ["contracts.approve", "contracts.manage"];
const CONTRACT_REJECT = ["contracts.reject", "contracts.manage"];
const CONTRACT_CANCEL = ["contracts.cancel", "contracts.manage"];
const CONTRACT_ARCHIVE = ["contracts.archive", "contracts.manage"];
const CONTRACT_RENEW = ["contracts.renew", "contracts.renewals.create", "contracts.renewals.manage", "contracts.manage"];
const CONTRACT_SALARY_VIEW = ["contracts.salary_terms.view", "contracts.salary_terms.manage", "contracts.manage"];
const CONTRACT_SALARY_MANAGE = ["contracts.salary_terms.manage", "contracts.manage"];
const SETTINGS_VIEW = ["contracts.settings.view", "contracts.settings.manage", "settings.view"];
const SETTINGS_UPDATE = ["contracts.settings.update", "contracts.settings.manage", "settings.manage"];
const TYPES_VIEW = ["contracts.types.view", "contracts.types.manage", "contracts.view", "contracts.manage"];
const TYPES_CREATE = ["contracts.types.create", "contracts.types.manage", "contracts.manage"];
const TYPES_UPDATE = ["contracts.types.update", "contracts.types.manage", "contracts.manage"];
const TYPES_ARCHIVE = ["contracts.types.archive", "contracts.types.manage", "contracts.manage"];
const PROBATION_VIEW = ["contracts.probation.view", "contracts.probation.manage", "contracts.view", "contracts.manage"];
const PROBATION_UPDATE = ["contracts.probation.update", "contracts.probation.manage", "contracts.manage"];
const PROBATION_CONFIRM = ["contracts.probation.confirm", "contracts.probation.manage", "contracts.manage"];
const PROBATION_EXTEND = ["contracts.probation.extend", "contracts.probation.manage", "contracts.manage"];
const RENEWALS_VIEW = ["contracts.renewals.view", "contracts.renewals.manage", "contracts.view", "contracts.manage"];
const RENEWALS_APPROVE = ["contracts.renewals.approve", "contracts.renewals.manage", "contracts.manage"];
const RENEWALS_ACTIVATE = ["contracts.renewals.activate", "contracts.renewals.manage", "contracts.manage"];
const RENEWALS_CANCEL = ["contracts.renewals.cancel", "contracts.renewals.manage", "contracts.manage"];
const ALERTS_VIEW = ["contracts.alerts.view", "contracts.alerts.manage", "contracts.view", "contracts.manage"];
const ALERTS_ACK = ["contracts.alerts.acknowledge", "contracts.alerts.manage", "contracts.manage"];
const ALERTS_RESOLVE = ["contracts.alerts.resolve", "contracts.alerts.manage", "contracts.manage"];

const CONTRACT_CATEGORIES = new Set(["EMPLOYMENT", "RENEWAL", "PROBATION", "TEMPORARY", "CONSULTANCY_PLACEHOLDER", "OTHER"]);
const CONTRACT_TYPE_STATUSES = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const CONTRACT_STATUSES = new Set<ContractStatus>(["DRAFT", "PENDING_APPROVAL", "ACTIVE", "EXPIRING_SOON", "EXPIRED", "RENEWED", "TERMINATED", "CANCELLED", "ARCHIVED"]);
const APPROVAL_STATUSES = new Set<ApprovalStatus>(["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "SENT_BACK"]);
const PROBATION_STATUSES = new Set<ProbationStatus>(["NOT_APPLICABLE", "IN_PROBATION", "EXTENDED", "CONFIRMED", "FAILED", "TERMINATED_DURING_PROBATION"]);
const RENEWAL_STATUSES = new Set<RenewalStatus>(["NOT_APPLICABLE", "NOT_DUE", "DUE_SOON", "PENDING_RENEWAL", "RENEWED", "NOT_RENEWED"]);

interface ContractSettingsRow {
  id: string;
  company_id: string | null;
  contracts_enabled: number;
  require_contract_for_active_employee: number;
  auto_create_contract_task_on_onboarding: number;
  require_contract_approval_before_activation: number;
  allow_employee_without_contract_warning: number;
  contract_expiry_alerts_enabled: number;
  default_expiry_warning_days: number;
  default_probation_warning_days: number;
  default_renewal_warning_days: number;
  auto_mark_expired_contracts: number;
  auto_create_end_of_contract_settlement_case: number;
  require_reason_for_contract_change: number;
  allow_contract_salary_snapshot: number;
  allow_contract_salary_update_to_payroll_profile: number;
  require_approval_for_contract_salary_update: number;
  contract_document_required: number;
  contract_sensitive_salary_terms: number;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

interface EmployeeSnapshotRow {
  id: string;
  employee_no: string;
  full_name: string;
  display_name: string | null;
  employee_type: string;
  employment_type: string;
  primary_department_id: string | null;
  primary_location_id: string | null;
  primary_position_id: string | null;
  job_level_id: string | null;
  department_name: string | null;
  location_name: string | null;
  position_title: string | null;
  job_level_name: string | null;
  basic_salary: number | null;
  currency: string | null;
}

interface ContractTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  default_duration_months: number | null;
  default_probation_months: number | null;
  requires_end_date: number;
  requires_probation: number;
  allows_renewal: number;
  allows_salary_terms: number;
  is_active: number;
  status: string;
  display_order: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  archived_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  metadata_json: string | null;
}

interface ContractRow {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  full_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  position_title?: string | null;
  contract_number: string;
  contract_type_id: string | null;
  contract_type_code_snapshot: string | null;
  contract_type_name_snapshot: string | null;
  contract_title: string;
  contract_version_number: number;
  parent_contract_id: string | null;
  renewal_of_contract_id: string | null;
  previous_contract_id: string | null;
  document_id: string | null;
  contract_document_version_id: string | null;
  contract_start_date: string;
  contract_end_date: string | null;
  probation_start_date: string | null;
  probation_end_date: string | null;
  confirmation_due_date: string | null;
  confirmed_date: string | null;
  signed_date: string | null;
  effective_date: string;
  expiry_warning_date: string | null;
  renewal_due_date: string | null;
  status: ContractStatus;
  approval_status: ApprovalStatus;
  probation_status: ProbationStatus;
  renewal_status: RenewalStatus;
  employee_number_snapshot: string | null;
  employee_name_snapshot: string | null;
  department_snapshot: string | null;
  worksite_snapshot: string | null;
  location_snapshot: string | null;
  position_snapshot: string | null;
  employment_type_snapshot: string | null;
  job_level_snapshot: string | null;
  basic_salary_snapshot: number | null;
  salary_currency_snapshot: string | null;
  salary_terms_json: string | null;
  benefits_terms_json: string | null;
  working_terms_json: string | null;
  termination_notice_days: number | null;
  renewal_notice_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : value === 1 ? true : value === 0 ? false : fallback;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value: unknown) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function stringOrNull(value: unknown) {
  const text = readString(value);
  return text || null;
}

function requireAny(c: Context<AppBindings>, permissions: string[]) {
  const user = c.get("currentUser");
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAnyPermission(permissions: string[]) {
  return async (c: Context<AppBindings>, next: () => Promise<void>) => {
    if (!requireAny(c, permissions)) return fail(c, 403, "CONTRACT_PERMISSION_DENIED", "You do not have permission to perform this contract action.");
    await next();
  };
}

function toApiSettings(row: ContractSettingsRow) {
  return {
    ...row,
    contracts_enabled: row.contracts_enabled === 1,
    require_contract_for_active_employee: row.require_contract_for_active_employee === 1,
    auto_create_contract_task_on_onboarding: row.auto_create_contract_task_on_onboarding === 1,
    require_contract_approval_before_activation: row.require_contract_approval_before_activation === 1,
    allow_employee_without_contract_warning: row.allow_employee_without_contract_warning === 1,
    contract_expiry_alerts_enabled: row.contract_expiry_alerts_enabled === 1,
    auto_mark_expired_contracts: row.auto_mark_expired_contracts === 1,
    auto_create_end_of_contract_settlement_case: row.auto_create_end_of_contract_settlement_case === 1,
    require_reason_for_contract_change: row.require_reason_for_contract_change === 1,
    allow_contract_salary_snapshot: row.allow_contract_salary_snapshot === 1,
    allow_contract_salary_update_to_payroll_profile: row.allow_contract_salary_update_to_payroll_profile === 1,
    require_approval_for_contract_salary_update: row.require_approval_for_contract_salary_update === 1,
    contract_document_required: row.contract_document_required === 1,
    contract_sensitive_salary_terms: row.contract_sensitive_salary_terms === 1
  };
}

function toApiContractType(row: ContractTypeRow) {
  return {
    ...row,
    requires_end_date: row.requires_end_date === 1,
    requires_probation: row.requires_probation === 1,
    allows_renewal: row.allows_renewal === 1,
    allows_salary_terms: row.allows_salary_terms === 1,
    is_active: row.is_active === 1
  };
}

function safeJson(value: string | null, fallback: unknown = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toApiContract(c: Context<AppBindings>, row: ContractRow) {
  const canViewSalary = requireAny(c, CONTRACT_SALARY_VIEW);
  return {
    ...row,
    contract_type_display_name: row.contract_type_name_snapshot ?? "Not selected",
    salary_terms: canViewSalary ? safeJson(row.salary_terms_json) : null,
    benefits_terms: safeJson(row.benefits_terms_json),
    working_terms: safeJson(row.working_terms_json),
    metadata: safeJson(row.metadata_json),
    basic_salary_snapshot: canViewSalary ? row.basic_salary_snapshot : null,
    salary_currency_snapshot: canViewSalary ? row.salary_currency_snapshot : null,
    salary_terms_restricted: !canViewSalary
  };
}

async function getContractSettings(db: Env["DB"]) {
  let row = await db.prepare("SELECT * FROM contract_settings ORDER BY created_at LIMIT 1").first<ContractSettingsRow>();
  if (!row) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO contract_settings
         (id, contracts_enabled, require_contract_for_active_employee, auto_create_contract_task_on_onboarding,
          require_contract_approval_before_activation, allow_employee_without_contract_warning, contract_expiry_alerts_enabled,
          default_expiry_warning_days, default_probation_warning_days, default_renewal_warning_days, auto_mark_expired_contracts,
          auto_create_end_of_contract_settlement_case, require_reason_for_contract_change, allow_contract_salary_snapshot,
          allow_contract_salary_update_to_payroll_profile, require_approval_for_contract_salary_update, contract_document_required,
          contract_sensitive_salary_terms, metadata_json)
         VALUES ('contract_settings_default', 1, 0, 1, 0, 1, 1, 30, 14, 30, 1, 0, 1, 1, 0, 1, 0, 1, '{"source":"runtime_default"}')`
      )
      .run();
    row = await db.prepare("SELECT * FROM contract_settings ORDER BY created_at LIMIT 1").first<ContractSettingsRow>();
  }
  return row!;
}

async function requireContractsEnabled(c: Context<AppBindings>) {
  const settings = await getContractSettings(c.env.DB);
  if (settings.contracts_enabled !== 1) return fail(c, 403, "CONTRACTS_DISABLED", "Contract management is currently disabled.");
  return null;
}

async function auditContract(c: Context<AppBindings>, input: { action: string; entityType: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "contracts",
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishContract(c: Context<AppBindings>, event: "contracts.changed" | "contract.created" | "contract.updated" | "contract.lifecycle_changed" | "contract.alert.changed", entityType: "contract" | "contract_alert" | "employee", entityId: string, action: string) {
  await publishAccessEvent(c.env, event, { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  if (event !== "contracts.changed") {
    await publishAccessEvent(c.env, "contracts.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  }
}

function isValidDate(value: string | null) {
  return !value || !Number.isNaN(Date.parse(value));
}

function addMonths(dateText: string, months: number | null) {
  if (!months) return null;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dateMinusDays(dateText: string | null, days: number | null) {
  if (!dateText || days === null || days === undefined) return null;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function getEmployeeSnapshot(db: Env["DB"], employeeId: string) {
  return db
    .prepare(
      `SELECT e.id, e.employee_no, e.full_name, e.display_name, e.employee_type, e.employment_type,
        e.primary_department_id, e.primary_location_id, e.primary_position_id, e.job_level_id,
        d.name AS department_name, l.name AS location_name, p.title AS position_title, jl.name AS job_level_name,
        pp.basic_salary, pp.currency
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       LEFT JOIN employee_payroll_profiles pp ON pp.employee_id = e.id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<EmployeeSnapshotRow>();
}

async function getContractType(db: Env["DB"], typeId: string | null | undefined) {
  if (!typeId) return null;
  return db.prepare("SELECT * FROM contract_types WHERE id = ?").bind(typeId).first<ContractTypeRow>();
}

async function requireActiveContractTypeForNewContract(c: Context<AppBindings>, contractTypeId: string | null | undefined) {
  if (!contractTypeId) return { response: fail(c, 400, "CONTRACT_TYPE_REQUIRED", "Please select a contract type.") };
  const type = await getContractType(c.env.DB, contractTypeId);
  if (!type) return { response: fail(c, 400, "CONTRACT_TYPE_NOT_FOUND", "Selected contract type was not found.") };
  if (type.is_active !== 1 || type.status !== "ACTIVE" || type.archived_at) {
    return { response: fail(c, 400, "CONTRACT_TYPE_INACTIVE", "Selected contract type is inactive or archived and cannot be used for a new contract.") };
  }
  return { type };
}

async function requireExistingContractTypeForAction(c: Context<AppBindings>, contract: ContractRow) {
  if (!contract.contract_type_id) return { response: fail(c, 400, "CONTRACT_TYPE_REQUIRED", "Please select a contract type.") };
  const type = await getContractType(c.env.DB, contract.contract_type_id);
  if (!type) return { response: fail(c, 400, "CONTRACT_TYPE_NOT_FOUND", "Selected contract type was not found.") };
  return { type };
}

async function getContractById(db: Env["DB"], contractId: string) {
  return db
    .prepare(
      `SELECT ec.*, e.employee_no, e.full_name, d.name AS department_name, l.name AS location_name, p.title AS position_title
       FROM employee_contracts ec
       INNER JOIN employees e ON e.id = ec.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       WHERE ec.id = ?`
    )
    .bind(contractId)
    .first<ContractRow>();
}

async function assertContractAccess(c: Context<AppBindings>, contractId: string | null | undefined, action: "view" | "manage" = "view") {
  if (!contractId) return null;
  const contract = await getContractById(c.env.DB, contractId);
  if (!contract) return null;
  const allowed = await canAccessEmployee(c.env.DB, c.get("currentUser"), contract.employee_id, "contracts", action);
  return allowed ? contract : null;
}

async function createContractEvent(c: Context<AppBindings>, contract: ContractRow | { id: string; employee_id: string; status?: string }, action: string, previousStatus?: string | null, newStatus?: string | null, reason?: string | null, note?: string | null, metadata?: unknown) {
  const user = c.get("currentUser");
  await c.env.DB
    .prepare(
      `INSERT INTO employee_contract_events (id, contract_id, employee_id, action, previous_status, new_status, actor_user_id, actor_name_snapshot, note, reason, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), contract.id, contract.employee_id, action, previousStatus ?? null, newStatus ?? null, user.id, user.name, note ?? null, reason ?? null, metadata === undefined ? null : JSON.stringify(metadata))
    .run();
}

function buildContractNumber(employee: EmployeeSnapshotRow) {
  return `CTR-${employee.employee_no}-${Date.now().toString(36).toUpperCase()}`;
}

function readContractBody(body: Record<string, unknown>) {
  return {
    contract_type_id: readString(body.contract_type_id),
    contract_number: stringOrNull(body.contract_number),
    contract_title: stringOrNull(body.contract_title),
    contract_start_date: readString(body.contract_start_date),
    contract_end_date: stringOrNull(body.contract_end_date),
    probation_start_date: stringOrNull(body.probation_start_date),
    probation_end_date: stringOrNull(body.probation_end_date),
    confirmation_due_date: stringOrNull(body.confirmation_due_date),
    signed_date: stringOrNull(body.signed_date),
    effective_date: stringOrNull(body.effective_date),
    document_id: stringOrNull(body.document_id),
    contract_document_version_id: stringOrNull(body.contract_document_version_id),
    basic_salary_snapshot: numberOrNull(body.basic_salary_snapshot),
    salary_currency_snapshot: stringOrNull(body.salary_currency_snapshot),
    salary_terms_json: body.salary_terms === undefined ? null : JSON.stringify(body.salary_terms),
    benefits_terms_json: body.benefits_terms === undefined ? null : JSON.stringify(body.benefits_terms),
    working_terms_json: body.working_terms === undefined ? null : JSON.stringify(body.working_terms),
    termination_notice_days: integerOrNull(body.termination_notice_days),
    renewal_notice_days: integerOrNull(body.renewal_notice_days),
    notes: stringOrNull(body.notes)
  };
}

async function validateDocumentLink(db: Env["DB"], employeeId: string, documentId: string | null) {
  if (!documentId) return true;
  const row = await db.prepare("SELECT id FROM employee_documents WHERE id = ? AND employee_id = ? AND status = 'ACTIVE'").bind(documentId, employeeId).first<{ id: string }>();
  return Boolean(row);
}

function validateContractDates(input: ReturnType<typeof readContractBody>) {
  const dates = [input.contract_start_date, input.contract_end_date, input.probation_start_date, input.probation_end_date, input.confirmation_due_date, input.signed_date, input.effective_date].filter(Boolean) as string[];
  if (!dates.every((date) => isValidDate(date))) return "CONTRACT_DATE_INVALID";
  if (input.contract_end_date && input.contract_start_date && input.contract_end_date < input.contract_start_date) return "CONTRACT_DATE_INVALID";
  if (input.probation_start_date && input.probation_end_date && input.probation_end_date < input.probation_start_date) return "CONTRACT_DATE_INVALID";
  return null;
}

function validateContractTypeDrivenFields(c: Context<AppBindings>, input: ReturnType<typeof readContractBody>, type: ContractTypeRow) {
  if (!input.contract_start_date) return fail(c, 400, "CONTRACT_START_DATE_REQUIRED", "Contract start date is required.");
  if (input.contract_end_date && input.contract_end_date < input.contract_start_date) return fail(c, 400, "CONTRACT_DATE_INVALID", "Contract end date cannot be before contract start date.");
  if (type.requires_end_date === 1 && !input.contract_end_date) return fail(c, 400, "CONTRACT_END_DATE_REQUIRED", "Contract end date is required for this contract type.");
  if (type.requires_probation === 1 && (!input.probation_start_date || !input.probation_end_date)) {
    return fail(c, 400, "CONTRACT_PROBATION_DATES_REQUIRED", "Probation dates are required for this contract type.");
  }
  if (input.probation_start_date && input.probation_end_date && input.probation_end_date < input.probation_start_date) {
    return fail(c, 400, "CONTRACT_DATE_INVALID", "Contract end date cannot be before contract start date.");
  }
  const dateError = validateContractDates(input);
  if (dateError) return fail(c, 400, dateError, "Contract dates are invalid.");
  return null;
}

function validateContractInput(input: ReturnType<typeof readContractBody>) {
  return [
    ...validateContractRules({
      startDate: input.contract_start_date,
      endDate: input.contract_end_date
    }),
    ...validateContractRules({
      startDate: input.probation_start_date,
      endDate: input.probation_end_date
    })
  ];
}

async function activeContractConflict(db: Env["DB"], employeeId: string, excludeContractId?: string) {
  const params: BindValue[] = [employeeId];
  let sql = "SELECT id FROM employee_contracts WHERE employee_id = ? AND status IN ('ACTIVE', 'EXPIRING_SOON')";
  if (excludeContractId) {
    sql += " AND id <> ?";
    params.push(excludeContractId);
  }
  return db.prepare(`${sql} LIMIT 1`).bind(...params).first<{ id: string }>();
}

export async function getEmployeeActiveContract(db: Env["DB"], employeeId: string) {
  return db.prepare("SELECT * FROM employee_contracts WHERE employee_id = ? AND status IN ('ACTIVE', 'EXPIRING_SOON') ORDER BY effective_date DESC LIMIT 1").bind(employeeId).first<ContractRow>();
}

export async function getEmployeeContractRequirementStatus(db: Env["DB"], employeeId: string) {
  const settings = await getContractSettings(db);
  const activeContract = await getEmployeeActiveContract(db, employeeId);
  return {
    required: settings.require_contract_for_active_employee === 1,
    active_contract_exists: Boolean(activeContract),
    warning: settings.require_contract_for_active_employee === 1 && !activeContract ? "Active contract is required by contract settings." : null
  };
}

export async function syncEmployeeContractStatusSnapshot(db: Env["DB"], employeeId: string) {
  const activeContract = await getEmployeeActiveContract(db, employeeId);
  if (!activeContract) return { synced: false };
  await db
    .prepare("UPDATE employees SET contract_start_date = ?, contract_end_date = ?, probation_end_date = ?, confirmation_date = COALESCE(confirmation_date, ?) WHERE id = ?")
    .bind(activeContract.contract_start_date, activeContract.contract_end_date, activeContract.probation_end_date, activeContract.confirmed_date, employeeId)
    .run();
  return { synced: true, contract_id: activeContract.id };
}

export async function maybeCreateContractTaskForOnboarding(db: Env["DB"], employeeId: string) {
  const settings = await getContractSettings(db);
  if (settings.auto_create_contract_task_on_onboarding !== 1) return { created: false };
  await db
    .prepare(
      `INSERT OR IGNORE INTO employee_onboarding_tasks (id, employee_id, task_key, title, description, module, status, required)
       VALUES (?, ?, 'contract_setup', 'Contract setup', 'Prepare employee contract, probation, confirmation, and renewal tracking.', 'contracts', 'PENDING', ?)`
    )
    .bind(crypto.randomUUID(), employeeId, settings.require_contract_for_active_employee)
    .run();
  return { created: true };
}

export async function getContractSalaryTermsForPayroll(db: Env["DB"], employeeId: string) {
  const contract = await getEmployeeActiveContract(db, employeeId);
  if (!contract) return { active_contract: null, warning: "No active contract found." };
  return {
    active_contract: contract.id,
    contract_number: contract.contract_number,
    salary_snapshot: contract.basic_salary_snapshot,
    currency: contract.salary_currency_snapshot,
    salary_terms: safeJson(contract.salary_terms_json),
    warning: null
  };
}

export async function getContractPayrollImpact(db: Env["DB"], employeeId: string, periodStart?: string | null) {
  const settings = await getContractSettings(db);
  const contract = await getEmployeeActiveContract(db, employeeId);
  const warnings: string[] = [];
  if (settings.require_contract_for_active_employee === 1 && !contract) warnings.push("Missing active contract.");
  if (contract?.contract_end_date && periodStart && contract.contract_end_date < periodStart) warnings.push("Active contract ended before this payroll period.");
  return { employee_id: employeeId, contract_id: contract?.id ?? null, contract_number: contract?.contract_number ?? null, warnings };
}

export async function getContractFinalSettlementImpact(db: Env["DB"], employeeId: string) {
  const contract = await getEmployeeActiveContract(db, employeeId);
  return {
    employee_id: employeeId,
    contract_id: contract?.id ?? null,
    suggested_last_working_day: contract?.contract_end_date ?? null,
    contract_end_placeholder_warning: contract ? null : "No active contract is available for end-of-contract settlement context."
  };
}

export async function getEndOfContractSettlementContext(db: Env["DB"], employeeId: string) {
  return getContractFinalSettlementImpact(db, employeeId);
}

export async function linkContractToEmployeeDocument(db: Env["DB"], contractId: string, employeeId: string, documentId: string, versionId?: string | null) {
  if (!(await validateDocumentLink(db, employeeId, documentId))) return { linked: false, reason: "CONTRACT_DOCUMENT_INVALID" };
  await db.prepare("UPDATE employee_contracts SET document_id = ?, contract_document_version_id = ?, updated_at = ? WHERE id = ? AND employee_id = ?").bind(documentId, versionId ?? null, nowIso(), contractId, employeeId).run();
  return { linked: true };
}

export async function getContractDocumentStatus(db: Env["DB"], contractId: string) {
  const row = await db
    .prepare(
      `SELECT ec.document_id, ed.status AS document_status, dt.name AS document_type_name, ed.expiry_date
       FROM employee_contracts ec
       LEFT JOIN employee_documents ed ON ed.id = ec.document_id
       LEFT JOIN document_types dt ON dt.id = ed.document_type_id
       WHERE ec.id = ?`
    )
    .bind(contractId)
    .first<{ document_id: string | null; document_status: string | null; document_type_name: string | null; expiry_date: string | null }>();
  return {
    linked: Boolean(row?.document_id),
    document_id: row?.document_id ?? null,
    status: row?.document_status ?? "MISSING",
    document_type_name: row?.document_type_name ?? null,
    expiry_date: row?.expiry_date ?? null
  };
}

export async function getExpiringContracts(db: Env["DB"], days = 30) {
  return db
    .prepare("SELECT * FROM employee_contracts WHERE status IN ('ACTIVE', 'EXPIRING_SOON') AND contract_end_date IS NOT NULL AND contract_end_date BETWEEN date('now') AND date('now', ?)")
    .bind(`+${days} days`)
    .all<ContractRow>();
}

export async function getExpiredContracts(db: Env["DB"]) {
  return db.prepare("SELECT * FROM employee_contracts WHERE status IN ('ACTIVE', 'EXPIRING_SOON') AND contract_end_date IS NOT NULL AND contract_end_date < date('now')").all<ContractRow>();
}

export async function getProbationDueEmployees(db: Env["DB"], days = 14) {
  return db
    .prepare("SELECT * FROM employee_contracts WHERE probation_status IN ('IN_PROBATION', 'EXTENDED') AND confirmation_due_date IS NOT NULL AND confirmation_due_date BETWEEN date('now') AND date('now', ?)")
    .bind(`+${days} days`)
    .all<ContractRow>();
}

export async function createContractAlertIfMissing(db: Env["DB"], input: { contractId?: string | null; employeeId: string; alertType: string; alertDate: string; dueDate?: string | null; severity?: string; notes?: string | null; metadata?: unknown }) {
  const existing = await db
    .prepare("SELECT id FROM contract_alerts WHERE employee_id = ? AND COALESCE(contract_id, '') = COALESCE(?, '') AND alert_type = ? AND COALESCE(due_date, '') = COALESCE(?, '') AND status IN ('OPEN', 'ACKNOWLEDGED')")
    .bind(input.employeeId, input.contractId ?? null, input.alertType, input.dueDate ?? null)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO contract_alerts (id, contract_id, employee_id, alert_type, alert_date, due_date, severity, notes, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.contractId ?? null, input.employeeId, input.alertType, input.alertDate, input.dueDate ?? null, input.severity ?? "WARNING", input.notes ?? null, input.metadata === undefined ? null : JSON.stringify(input.metadata))
    .run();
  return id;
}

export async function refreshContractAlerts(db: Env["DB"]) {
  const settings = await getContractSettings(db);
  if (settings.contract_expiry_alerts_enabled !== 1) return { created: 0, disabled: true };
  let created = 0;
  const expiring = await getExpiringContracts(db, settings.default_expiry_warning_days);
  for (const contract of expiring.results) {
    await createContractAlertIfMissing(db, { contractId: contract.id, employeeId: contract.employee_id, alertType: "CONTRACT_EXPIRING", alertDate: nowIso().slice(0, 10), dueDate: contract.contract_end_date, severity: "WARNING", notes: "Contract is approaching expiry." });
    created += 1;
  }
  const expired = await getExpiredContracts(db);
  for (const contract of expired.results) {
    await createContractAlertIfMissing(db, { contractId: contract.id, employeeId: contract.employee_id, alertType: "CONTRACT_EXPIRED", alertDate: nowIso().slice(0, 10), dueDate: contract.contract_end_date, severity: "CRITICAL", notes: "Contract has expired." });
    if (settings.auto_mark_expired_contracts === 1) {
      await db.prepare("UPDATE employee_contracts SET status = 'EXPIRED', updated_at = ? WHERE id = ? AND status IN ('ACTIVE', 'EXPIRING_SOON')").bind(nowIso(), contract.id).run();
    }
    created += 1;
  }
  const probationDue = await getProbationDueEmployees(db, settings.default_probation_warning_days);
  for (const contract of probationDue.results) {
    await createContractAlertIfMissing(db, { contractId: contract.id, employeeId: contract.employee_id, alertType: "PROBATION_DUE", alertDate: nowIso().slice(0, 10), dueDate: contract.confirmation_due_date, severity: "INFO", notes: "Probation confirmation is due soon." });
    created += 1;
  }
  if (settings.require_contract_for_active_employee === 1) {
    const missing = await db
      .prepare(
        `SELECT e.id FROM employees e
         JOIN employee_statuses es ON es.id = e.status_id
         WHERE e.archived_at IS NULL AND es.key = 'ACTIVE'
           AND NOT EXISTS (SELECT 1 FROM employee_contracts ec WHERE ec.employee_id = e.id AND ec.status IN ('ACTIVE', 'EXPIRING_SOON'))`
      )
      .all<{ id: string }>();
    for (const employee of missing.results) {
      await createContractAlertIfMissing(db, { employeeId: employee.id, alertType: "CONTRACT_MISSING", alertDate: nowIso().slice(0, 10), severity: "WARNING", notes: "Active employee has no active contract." });
      created += 1;
    }
  }
  return { created, disabled: false };
}

contractRoutes.get("/settings", requireAnyPermission(SETTINGS_VIEW), async (c) => ok(c, { settings: toApiSettings(await getContractSettings(c.env.DB)) }));

contractRoutes.patch("/settings", requireAnyPermission(SETTINGS_UPDATE), async (c) => {
  const oldSettings = await getContractSettings(c.env.DB);
  const body = await readJsonBody(c.req.raw);
  const fields = [
    "contracts_enabled",
    "require_contract_for_active_employee",
    "auto_create_contract_task_on_onboarding",
    "require_contract_approval_before_activation",
    "allow_employee_without_contract_warning",
    "contract_expiry_alerts_enabled",
    "auto_mark_expired_contracts",
    "auto_create_end_of_contract_settlement_case",
    "require_reason_for_contract_change",
    "allow_contract_salary_snapshot",
    "allow_contract_salary_update_to_payroll_profile",
    "require_approval_for_contract_salary_update",
    "contract_document_required",
    "contract_sensitive_salary_terms"
  ];
  const numericFields = ["default_expiry_warning_days", "default_probation_warning_days", "default_renewal_warning_days"];
  const updates: string[] = [];
  const bindings: BindValue[] = [];
  for (const field of fields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      bindings.push(bool(body[field], Boolean(oldSettings[field as keyof ContractSettingsRow])) ? 1 : 0);
    }
  }
  for (const field of numericFields) {
    if (field in body) {
      const value = integerOrNull(body[field]);
      updates.push(`${field} = ?`);
      bindings.push(Math.max(0, value ?? Number(oldSettings[field as keyof ContractSettingsRow])));
    }
  }
  if ("metadata" in body) {
    updates.push("metadata_json = ?");
    bindings.push(JSON.stringify(body.metadata ?? null));
  }
  if (!updates.length) return ok(c, { settings: toApiSettings(oldSettings) });
  updates.push("updated_at = ?");
  bindings.push(nowIso(), oldSettings.id);
  await c.env.DB.prepare(`UPDATE contract_settings SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings).run();
  const settings = await getContractSettings(c.env.DB);
  await auditContract(c, { action: "contract.settings.updated", entityType: "contract_settings", entityId: settings.id, oldValue: oldSettings, newValue: settings });
  return ok(c, { settings: toApiSettings(settings) });
});

contractRoutes.get("/types", requireAnyPermission(TYPES_VIEW), async (c) => {
  const includeArchived = c.req.query("include_archived") === "true";
  const rows = await c.env.DB.prepare(`SELECT * FROM contract_types ${includeArchived ? "" : "WHERE status <> 'ARCHIVED'"} ORDER BY display_order, name`).all<ContractTypeRow>();
  return ok(c, { types: rows.results.map(toApiContractType) });
});

contractRoutes.post("/types", requireAnyPermission(TYPES_CREATE), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = readString(body.code).toUpperCase();
  const name = readString(body.name);
  const category = readString(body.category) || "EMPLOYMENT";
  if (!code || !name || !CONTRACT_CATEGORIES.has(category)) return fail(c, 400, "CONTRACT_TYPE_NOT_FOUND", "Contract type code, name, and category are required.");
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO contract_types
       (id, code, name, description, category, default_duration_months, default_probation_months, requires_end_date,
        requires_probation, allows_renewal, allows_salary_terms, is_active, status, display_order, created_by_user_id, updated_by_user_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, code, name, stringOrNull(body.description), category, integerOrNull(body.default_duration_months), integerOrNull(body.default_probation_months), bool(body.requires_end_date, true) ? 1 : 0, bool(body.requires_probation, false) ? 1 : 0, bool(body.allows_renewal, true) ? 1 : 0, bool(body.allows_salary_terms, true) ? 1 : 0, bool(body.is_active, true) ? 1 : 0, bool(body.is_active, true) ? "ACTIVE" : "INACTIVE", integerOrNull(body.display_order) ?? 100, c.get("currentUser").id, c.get("currentUser").id, body.metadata === undefined ? null : JSON.stringify(body.metadata))
    .run();
  const type = await getContractType(c.env.DB, id);
  await auditContract(c, { action: "contract_type.created", entityType: "contract_type", entityId: id, newValue: type });
  return ok(c, { type: toApiContractType(type!) }, 201);
});

contractRoutes.patch("/types/:typeId", requireAnyPermission(TYPES_UPDATE), async (c) => {
  const type = await getContractType(c.env.DB, c.req.param("typeId"));
  if (!type) return fail(c, 404, "CONTRACT_TYPE_NOT_FOUND", "Contract type was not found.");
  const body = await readJsonBody(c.req.raw);
  const updates: string[] = [];
  const bindings: BindValue[] = [];
  const textFields = ["name", "description", "category", "status"] as const;
  for (const field of textFields) {
    if (field in body) {
      const value = field === "description" ? stringOrNull(body[field]) : readString(body[field]);
      if (field === "category" && value && !CONTRACT_CATEGORIES.has(value)) return fail(c, 400, "CONTRACT_STATUS_INVALID", "Contract type category is invalid.");
      if (field === "status" && value && !CONTRACT_TYPE_STATUSES.has(value)) return fail(c, 400, "CONTRACT_STATUS_INVALID", "Contract type status is invalid.");
      updates.push(`${field} = ?`);
      bindings.push(value);
      if (field === "status") {
        updates.push("is_active = ?");
        bindings.push(value === "ACTIVE" ? 1 : 0);
      }
    }
  }
  for (const field of ["default_duration_months", "default_probation_months", "display_order"] as const) {
    if (field in body) {
      updates.push(`${field} = ?`);
      bindings.push(integerOrNull(body[field]));
    }
  }
  for (const field of ["requires_end_date", "requires_probation", "allows_renewal", "allows_salary_terms", "is_active"] as const) {
    if (field in body) {
      updates.push(`${field} = ?`);
      bindings.push(bool(body[field], Boolean(type[field])) ? 1 : 0);
    }
  }
  if ("metadata" in body) {
    updates.push("metadata_json = ?");
    bindings.push(JSON.stringify(body.metadata ?? null));
  }
  if (!updates.length) return ok(c, { type: toApiContractType(type) });
  updates.push("updated_by_user_id = ?", "updated_at = ?");
  bindings.push(c.get("currentUser").id, nowIso(), type.id);
  await c.env.DB.prepare(`UPDATE contract_types SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings).run();
  const updated = await getContractType(c.env.DB, type.id);
  await auditContract(c, { action: "contract_type.updated", entityType: "contract_type", entityId: type.id, oldValue: type, newValue: updated });
  return ok(c, { type: toApiContractType(updated!) });
});

contractRoutes.post("/types/:typeId/archive", requireAnyPermission(TYPES_ARCHIVE), async (c) => {
  const type = await getContractType(c.env.DB, c.req.param("typeId"));
  if (!type) return fail(c, 404, "CONTRACT_TYPE_NOT_FOUND", "Contract type was not found.");
  await c.env.DB.prepare("UPDATE contract_types SET status = 'ARCHIVED', is_active = 0, archived_by_user_id = ?, archived_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), nowIso(), type.id).run();
  await auditContract(c, { action: "contract_type.archived", entityType: "contract_type", entityId: type.id, oldValue: type, reason: stringOrNull((await readJsonBody(c.req.raw)).reason) });
  return ok(c, { archived: true });
});

contractRoutes.get("/probation/due", requireAnyPermission(PROBATION_VIEW), async (c) => {
  const disabled = await requireContractsEnabled(c);
  if (disabled) return disabled;
  const settings = await getContractSettings(c.env.DB);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "contracts", "view", "e");
  const rows = await c.env.DB
    .prepare(
      `SELECT ec.*, e.employee_no, e.full_name, d.name AS department_name, l.name AS location_name, p.title AS position_title
       FROM employee_contracts ec
       JOIN employees e ON e.id = ec.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       WHERE ${scope.sql}
         AND ec.probation_status IN ('IN_PROBATION', 'EXTENDED')
         AND ec.confirmation_due_date IS NOT NULL
         AND ec.confirmation_due_date <= date('now', ?)
       ORDER BY ec.confirmation_due_date`
    )
    .bind(...scope.params, `+${settings.default_probation_warning_days} days`)
    .all<ContractRow>();
  return ok(c, { contracts: rows.results.map((row) => toApiContract(c, row)) });
});

contractRoutes.get("/renewals", requireAnyPermission(RENEWALS_VIEW), async (c) => {
  const disabled = await requireContractsEnabled(c);
  if (disabled) return disabled;
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "contracts", "view", "e");
  const rows = await c.env.DB
    .prepare(
      `SELECT r.*, e.employee_no, e.full_name, oc.contract_number AS original_contract_number, rc.contract_number AS renewal_contract_number
       FROM employee_contract_renewals r
       JOIN employees e ON e.id = r.employee_id
       JOIN employee_contracts oc ON oc.id = r.original_contract_id
       LEFT JOIN employee_contracts rc ON rc.id = r.renewal_contract_id
       WHERE ${scope.sql}
       ORDER BY r.created_at DESC`
    )
    .bind(...scope.params)
    .all<Record<string, unknown>>();
  return ok(c, { renewals: rows.results });
});

contractRoutes.get("/alerts", requireAnyPermission(ALERTS_VIEW), async (c) => {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "contracts", "view", "e");
  const status = readString(c.req.query("status"));
  const conditions = [scope.sql];
  const params: BindValue[] = [...scope.params];
  if (status) {
    conditions.push("ca.status = ?");
    params.push(status);
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT ca.*, e.employee_no, e.full_name, ec.contract_number
       FROM contract_alerts ca
       JOIN employees e ON e.id = ca.employee_id
       LEFT JOIN employee_contracts ec ON ec.id = ca.contract_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY CASE ca.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END, ca.due_date, ca.created_at DESC`
    )
    .bind(...params)
    .all<Record<string, unknown>>();
  return ok(c, { alerts: rows.results });
});

contractRoutes.post("/alerts/refresh", requireAnyPermission(["contracts.alerts.manage", "contracts.manage"]), async (c) => {
  const result = await refreshContractAlerts(c.env.DB);
  await auditContract(c, { action: "contract.alerts.refreshed", entityType: "contract_alert", newValue: result });
  await publishContract(c, "contract.alert.changed", "contract_alert", "refresh", "refreshed");
  return ok(c, result);
});

async function alertAction(c: Context<AppBindings>, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") {
  const alert = await c.env.DB.prepare("SELECT * FROM contract_alerts WHERE id = ?").bind(c.req.param("alertId")).first<Record<string, unknown>>();
  if (!alert) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract alert was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(alert.employee_id), "contracts", status === "ACKNOWLEDGED" ? "view" : "manage"))) return fail(c, 404, "CONTRACT_SCOPE_DENIED", "Contract alert was not found.");
  const body = await readJsonBody(c.req.raw);
  const now = nowIso();
  const userId = c.get("currentUser").id;
  const updates = status === "ACKNOWLEDGED"
    ? "status = 'ACKNOWLEDGED', acknowledged_by_user_id = ?, acknowledged_at = ?, notes = COALESCE(?, notes), updated_at = ?"
    : "status = ?, resolved_by_user_id = ?, resolved_at = ?, notes = COALESCE(?, notes), updated_at = ?";
  const params = status === "ACKNOWLEDGED" ? [userId, now, stringOrNull(body.notes), now, String(alert.id)] : [status, userId, now, stringOrNull(body.notes), now, String(alert.id)];
  await c.env.DB.prepare(`UPDATE contract_alerts SET ${updates} WHERE id = ?`).bind(...params).run();
  await auditContract(c, { action: `contract_alert.${status.toLowerCase()}`, entityType: "contract_alert", entityId: String(alert.id), oldValue: alert, reason: stringOrNull(body.reason) ?? stringOrNull(body.notes) });
  await publishContract(c, "contract.alert.changed", "contract_alert", String(alert.id), status.toLowerCase());
  return ok(c, { updated: true });
}

contractRoutes.post("/alerts/:alertId/acknowledge", requireAnyPermission(ALERTS_ACK), (c) => alertAction(c, "ACKNOWLEDGED"));
contractRoutes.post("/alerts/:alertId/resolve", requireAnyPermission(ALERTS_RESOLVE), (c) => alertAction(c, "RESOLVED"));
contractRoutes.post("/alerts/:alertId/dismiss", requireAnyPermission(ALERTS_RESOLVE), (c) => alertAction(c, "DISMISSED"));

contractRoutes.get("/", requireAnyPermission(CONTRACT_READ), async (c) => {
  const disabled = await requireContractsEnabled(c);
  if (disabled) return disabled;
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "contracts", "view", "e");
  const conditions = [scope.sql];
  const params: BindValue[] = [...scope.params];
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR ec.contract_number LIKE ? OR ec.contract_title LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  for (const [key, column] of [["status", "ec.status"], ["approval_status", "ec.approval_status"], ["probation_status", "ec.probation_status"], ["renewal_status", "ec.renewal_status"], ["contract_type_id", "ec.contract_type_id"], ["department_id", "e.primary_department_id"], ["location_id", "e.primary_location_id"]] as const) {
    const value = readString(c.req.query(key));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT ec.*, e.employee_no, e.full_name, d.name AS department_name, l.name AS location_name, p.title AS position_title
       FROM employee_contracts ec
       JOIN employees e ON e.id = ec.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ec.updated_at DESC`
    )
    .bind(...params)
    .all<ContractRow>();
  return ok(c, { contracts: rows.results.map((row) => toApiContract(c, row)) });
});

contractRoutes.get("/:contractId", requireAnyPermission(CONTRACT_READ), async (c) => {
  const contract = await assertContractAccess(c, c.req.param("contractId"));
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  const [events, documentStatus] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM employee_contract_events WHERE contract_id = ? ORDER BY created_at DESC").bind(contract.id).all<Record<string, unknown>>(),
    getContractDocumentStatus(c.env.DB, contract.id)
  ]);
  return ok(c, { contract: toApiContract(c, contract), events: events.results, document_status: documentStatus });
});

contractRoutes.patch("/:contractId", requireAnyPermission(CONTRACT_UPDATE), async (c) => {
  const disabled = await requireContractsEnabled(c);
  if (disabled) return disabled;
  const contract = await assertContractAccess(c, c.req.param("contractId"), "manage");
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  if (["EXPIRED", "RENEWED", "CANCELLED", "ARCHIVED"].includes(contract.status) && !requireAny(c, ["contracts.manage"])) return fail(c, 400, "CONTRACT_STATUS_INVALID", "This contract status cannot be edited casually.");
  const body = await readJsonBody(c.req.raw);
  if ((body.salary_terms !== undefined || body.basic_salary_snapshot !== undefined) && !requireAny(c, CONTRACT_SALARY_MANAGE)) return fail(c, 403, "CONTRACT_SALARY_PERMISSION_REQUIRED", "Contract salary terms require salary terms permission.");
  const input = readContractBody({ ...contract, ...body });
  const typeResult = "contract_type_id" in body ? await requireActiveContractTypeForNewContract(c, input.contract_type_id) : await requireExistingContractTypeForAction(c, contract);
  if ("response" in typeResult) return typeResult.response;
  const type = typeResult.type!;
  const typeValidation = validateContractTypeDrivenFields(c, input, type);
  if (typeValidation) return typeValidation;
  const ruleIssues = validateContractInput(input);
  if (hasValidationErrors(ruleIssues)) return validationResponse(c, ruleIssues);
  if (!(await validateDocumentLink(c.env.DB, contract.employee_id, input.document_id))) return fail(c, 400, "CONTRACT_DOCUMENT_INVALID", "Linked contract document must belong to this employee and be active.");
  const updates = [
    "contract_type_id = ?",
    "contract_type_code_snapshot = ?",
    "contract_type_name_snapshot = ?",
    "contract_title = ?",
    "contract_start_date = ?",
    "contract_end_date = ?",
    "probation_start_date = ?",
    "probation_end_date = ?",
    "confirmation_due_date = ?",
    "signed_date = ?",
    "effective_date = ?",
    "expiry_warning_date = ?",
    "renewal_due_date = ?",
    "document_id = ?",
    "contract_document_version_id = ?",
    "basic_salary_snapshot = ?",
    "salary_currency_snapshot = ?",
    "salary_terms_json = ?",
    "benefits_terms_json = ?",
    "working_terms_json = ?",
    "termination_notice_days = ?",
    "renewal_notice_days = ?",
    "notes = ?",
    "updated_by_user_id = ?",
    "updated_at = ?"
  ];
  const settings = await getContractSettings(c.env.DB);
  const bindings: BindValue[] = [
    type.id,
    type.code,
    type.name,
    input.contract_title ?? contract.contract_title,
    input.contract_start_date,
    input.contract_end_date,
    input.probation_start_date,
    input.probation_end_date,
    input.confirmation_due_date,
    input.signed_date,
    input.effective_date ?? input.contract_start_date,
    dateMinusDays(input.contract_end_date, settings.default_expiry_warning_days),
    dateMinusDays(input.contract_end_date, settings.default_renewal_warning_days),
    input.document_id,
    input.contract_document_version_id,
    input.basic_salary_snapshot,
    input.salary_currency_snapshot,
    input.salary_terms_json,
    input.benefits_terms_json,
    input.working_terms_json,
    input.termination_notice_days,
    input.renewal_notice_days,
    input.notes,
    c.get("currentUser").id,
    nowIso(),
    contract.id
  ];
  await c.env.DB.prepare(`UPDATE employee_contracts SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings).run();
  const updated = await getContractById(c.env.DB, contract.id);
  await createContractEvent(c, contract, "UPDATED", contract.status, updated?.status ?? contract.status, stringOrNull(body.reason), null);
  await auditContract(c, { action: "contract.updated", entityType: "contract", entityId: contract.id, oldValue: contract, newValue: updated, reason: stringOrNull(body.reason) });
  await publishContract(c, "contract.updated", "contract", contract.id, "updated");
  return ok(c, { contract: toApiContract(c, updated!) });
});

async function transitionContract(c: Context<AppBindings>, contractId: string | null | undefined, nextStatus: ContractStatus, nextApproval?: ApprovalStatus, action = "contract.status_changed", reasonRequired = false) {
  const contract = await assertContractAccess(c, contractId, "manage");
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = stringOrNull(body.reason) ?? stringOrNull(body.note);
  if (reasonRequired && !reason) return fail(c, 400, "CONTRACT_REASON_REQUIRED", "A reason is required for this contract action.");
  if (nextStatus === "PENDING_APPROVAL" || nextStatus === "ACTIVE") {
    const typeResult = await requireExistingContractTypeForAction(c, contract);
    if ("response" in typeResult) return typeResult.response;
    const typeValidation = validateContractTypeDrivenFields(c, readContractBody(contract as unknown as Record<string, unknown>), typeResult.type!);
    if (typeValidation) return typeValidation;
  }
  if (nextStatus === "ACTIVE") {
    const settings = await getContractSettings(c.env.DB);
    if (settings.require_contract_approval_before_activation === 1 && contract.approval_status !== "APPROVED") return fail(c, 400, "CONTRACT_APPROVAL_REQUIRED", "Contract approval is required before activation.");
    const conflict = await activeContractConflict(c.env.DB, contract.employee_id, contract.id);
    if (conflict) return fail(c, 400, "CONTRACT_ACTIVE_CONFLICT", "This employee already has an active contract.");
  }
  const previousStatus = contract.status;
  const approvalStatus = nextApproval ?? contract.approval_status;
  await c.env.DB
    .prepare(
      `UPDATE employee_contracts
       SET status = ?, approval_status = ?, updated_by_user_id = ?, updated_at = ?,
           approved_by_user_id = CASE WHEN ? = 'APPROVED' THEN ? ELSE approved_by_user_id END,
           approved_at = CASE WHEN ? = 'APPROVED' THEN ? ELSE approved_at END,
           rejected_by_user_id = CASE WHEN ? IN ('REJECTED', 'SENT_BACK') THEN ? ELSE rejected_by_user_id END,
           rejected_at = CASE WHEN ? IN ('REJECTED', 'SENT_BACK') THEN ? ELSE rejected_at END,
           rejection_reason = CASE WHEN ? IN ('REJECTED', 'SENT_BACK') THEN ? ELSE rejection_reason END,
           cancelled_by_user_id = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancelled_by_user_id END,
           cancelled_at = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancelled_at END,
           cancellation_reason = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancellation_reason END,
           archived_by_user_id = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_by_user_id END,
           archived_at = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_at END
       WHERE id = ?`
    )
    .bind(nextStatus, approvalStatus, c.get("currentUser").id, nowIso(), approvalStatus, c.get("currentUser").id, approvalStatus, nowIso(), approvalStatus, c.get("currentUser").id, approvalStatus, nowIso(), approvalStatus, reason, nextStatus, c.get("currentUser").id, nextStatus, nowIso(), nextStatus, reason, nextStatus, c.get("currentUser").id, nextStatus, nowIso(), contract.id)
    .run();
  if (nextStatus === "ACTIVE") await syncEmployeeContractStatusSnapshot(c.env.DB, contract.employee_id);
  const updated = await getContractById(c.env.DB, contract.id);
  await createContractEvent(c, contract, action, previousStatus, nextStatus, reason, stringOrNull(body.note));
  await auditContract(c, { action, entityType: "contract", entityId: contract.id, oldValue: contract, newValue: updated, reason });
  await publishContract(c, "contract.lifecycle_changed", "contract", contract.id, action);
  return ok(c, { contract: toApiContract(c, updated!) });
}

contractRoutes.post("/:contractId/submit-for-approval", requireAnyPermission(CONTRACT_UPDATE), (c) => transitionContract(c, c.req.param("contractId"), "PENDING_APPROVAL", "PENDING", "contract.submitted"));
contractRoutes.post("/:contractId/approve", requireAnyPermission(CONTRACT_APPROVE), (c) => transitionContract(c, c.req.param("contractId"), "PENDING_APPROVAL", "APPROVED", "contract.approved"));
contractRoutes.post("/:contractId/reject", requireAnyPermission(CONTRACT_REJECT), (c) => transitionContract(c, c.req.param("contractId"), "DRAFT", "REJECTED", "contract.rejected", true));
contractRoutes.post("/:contractId/send-back", requireAnyPermission(CONTRACT_REJECT), (c) => transitionContract(c, c.req.param("contractId"), "DRAFT", "SENT_BACK", "contract.sent_back", true));
contractRoutes.post("/:contractId/activate", requireAnyPermission(CONTRACT_APPROVE), (c) => transitionContract(c, c.req.param("contractId"), "ACTIVE", undefined, "contract.activated"));
contractRoutes.post("/:contractId/cancel", requireAnyPermission(CONTRACT_CANCEL), (c) => transitionContract(c, c.req.param("contractId"), "CANCELLED", undefined, "contract.cancelled", true));
contractRoutes.post("/:contractId/archive", requireAnyPermission(CONTRACT_ARCHIVE), (c) => transitionContract(c, c.req.param("contractId"), "ARCHIVED", undefined, "contract.archived", true));

contractRoutes.get("/:contractId/events", requireAnyPermission(CONTRACT_READ), async (c) => {
  const contract = await assertContractAccess(c, c.req.param("contractId"));
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM employee_contract_events WHERE contract_id = ? ORDER BY created_at DESC").bind(contract.id).all<Record<string, unknown>>();
  return ok(c, { events: rows.results });
});

contractRoutes.post("/:contractId/probation/extend", requireAnyPermission(PROBATION_EXTEND), async (c) => {
  const contract = await assertContractAccess(c, c.req.param("contractId"), "manage");
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = stringOrNull(body.reason);
  const newEndDate = readString(body.new_probation_end_date);
  if (!reason) return fail(c, 400, "CONTRACT_REASON_REQUIRED", "Probation extension requires a reason.");
  if (!isValidDate(newEndDate)) return fail(c, 400, "CONTRACT_DATE_INVALID", "New probation end date is invalid.");
  await c.env.DB.prepare("UPDATE employee_contracts SET probation_status = 'EXTENDED', probation_end_date = ?, confirmation_due_date = COALESCE(?, confirmation_due_date), updated_at = ? WHERE id = ?").bind(newEndDate, stringOrNull(body.confirmation_due_date), nowIso(), contract.id).run();
  await c.env.DB.prepare("INSERT INTO employee_probation_events (id, contract_id, employee_id, action, previous_probation_end_date, new_probation_end_date, confirmation_due_date, reason, actor_user_id) VALUES (?, ?, ?, 'EXTENDED', ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), contract.id, contract.employee_id, contract.probation_end_date, newEndDate, stringOrNull(body.confirmation_due_date), reason, c.get("currentUser").id).run();
  await auditContract(c, { action: "contract.probation.extended", entityType: "contract", entityId: contract.id, oldValue: contract, reason });
  return ok(c, { updated: true });
});

async function probationAction(c: Context<AppBindings>, action: "CONFIRMED" | "FAILED" | "TERMINATED_DURING_PROBATION" | "NOT_APPLICABLE", status: ProbationStatus) {
  const contract = await assertContractAccess(c, c.req.param("contractId"), "manage");
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = stringOrNull(body.reason);
  if ((action === "FAILED" || action === "TERMINATED_DURING_PROBATION") && !reason) return fail(c, 400, "CONTRACT_REASON_REQUIRED", "A reason is required for this probation action.");
  const confirmedDate = action === "CONFIRMED" ? (stringOrNull(body.confirmed_date) ?? nowIso().slice(0, 10)) : null;
  await c.env.DB.prepare("UPDATE employee_contracts SET probation_status = ?, confirmed_date = COALESCE(?, confirmed_date), updated_at = ? WHERE id = ?").bind(status, confirmedDate, nowIso(), contract.id).run();
  if (confirmedDate) await c.env.DB.prepare("UPDATE employees SET confirmation_date = COALESCE(confirmation_date, ?) WHERE id = ?").bind(confirmedDate, contract.employee_id).run();
  await c.env.DB.prepare("INSERT INTO employee_probation_events (id, contract_id, employee_id, action, previous_probation_end_date, new_probation_end_date, confirmation_due_date, confirmed_date, reason, actor_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), contract.id, contract.employee_id, action, contract.probation_end_date, contract.probation_end_date, contract.confirmation_due_date, confirmedDate, reason, c.get("currentUser").id).run();
  await auditContract(c, { action: `contract.probation.${action.toLowerCase()}`, entityType: "contract", entityId: contract.id, oldValue: contract, reason });
  return ok(c, { updated: true });
}

contractRoutes.post("/:contractId/probation/confirm", requireAnyPermission(PROBATION_CONFIRM), (c) => probationAction(c, "CONFIRMED", "CONFIRMED"));
contractRoutes.post("/:contractId/probation/fail", requireAnyPermission(PROBATION_UPDATE), (c) => probationAction(c, "FAILED", "FAILED"));
contractRoutes.post("/:contractId/probation/not-applicable", requireAnyPermission(PROBATION_UPDATE), (c) => probationAction(c, "NOT_APPLICABLE", "NOT_APPLICABLE"));

contractRoutes.get("/:contractId/renewal-preview", requireAnyPermission(RENEWALS_VIEW), async (c) => {
  const contract = await assertContractAccess(c, c.req.param("contractId"));
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  const proposedStart = contract.contract_end_date ? new Date(new Date(`${contract.contract_end_date}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10) : nowIso().slice(0, 10);
  return ok(c, { preview: { original_contract: toApiContract(c, contract), proposed_start_date: proposedStart, proposed_end_date: addMonths(proposedStart, 12), changes_summary: { source: "renewal-preview", note: "Renewal creates a new contract record and preserves the original contract history." } } });
});

contractRoutes.post("/:contractId/renew", requireAnyPermission(CONTRACT_RENEW), async (c) => {
  const contract = await assertContractAccess(c, c.req.param("contractId"), "manage");
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  const body = await readJsonBody(c.req.raw);
  const employee = await getEmployeeSnapshot(c.env.DB, contract.employee_id);
  if (!employee) return fail(c, 404, "CONTRACT_NOT_FOUND", "Employee was not found.");
  const typeResult = await requireExistingContractTypeForAction(c, contract);
  if ("response" in typeResult) return typeResult.response;
  const type = typeResult.type!;
  if (type.allows_renewal !== 1) return fail(c, 400, "CONTRACT_RENEWAL_INVALID", "This contract type does not allow renewal.");
  const proposedStart = readString(body.proposed_start_date) || (contract.contract_end_date ? new Date(new Date(`${contract.contract_end_date}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10) : nowIso().slice(0, 10));
  const proposedEnd = stringOrNull(body.proposed_end_date);
  if (!contract.id) return fail(c, 400, "CONTRACT_RENEWAL_REFERENCE_REQUIRED", "Renewal contract must be linked to a previous contract.");
  if (type.requires_end_date === 1 && !proposedEnd) return fail(c, 400, "CONTRACT_END_DATE_REQUIRED", "Contract end date is required for this contract type.");
  if (!isValidDate(proposedStart) || !isValidDate(proposedEnd)) return fail(c, 400, "CONTRACT_RENEWAL_INVALID", "Renewal dates are invalid.");
  if (proposedEnd && proposedEnd < proposedStart) return fail(c, 400, "CONTRACT_DATE_INVALID", "Contract end date cannot be before contract start date.");
  const newContractId = crypto.randomUUID();
  const renewalId = crypto.randomUUID();
  const number = stringOrNull(body.contract_number) ?? `${contract.contract_number}-R${contract.contract_version_number + 1}`;
  await c.env.DB
    .prepare(
      `INSERT INTO employee_contracts
       (id, employee_id, contract_number, contract_type_id, contract_type_code_snapshot, contract_type_name_snapshot, contract_title,
        contract_version_number, parent_contract_id, renewal_of_contract_id, previous_contract_id, contract_start_date, contract_end_date,
        effective_date, status, approval_status, probation_status, renewal_status, employee_number_snapshot, employee_name_snapshot,
        department_snapshot, worksite_snapshot, location_snapshot, position_snapshot, employment_type_snapshot, job_level_snapshot,
        basic_salary_snapshot, salary_currency_snapshot, salary_terms_json, benefits_terms_json, working_terms_json, termination_notice_days,
        renewal_notice_days, notes, created_by_user_id, updated_by_user_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'NOT_REQUIRED', ?, 'NOT_DUE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(newContractId, employee.id, number, type.id, type.code, type.name, stringOrNull(body.contract_title) ?? `${contract.contract_title} Renewal`, contract.contract_version_number + 1, contract.parent_contract_id ?? contract.id, contract.id, contract.id, proposedStart, proposedEnd, proposedStart, contract.probation_status === "CONFIRMED" ? "NOT_APPLICABLE" : contract.probation_status, employee.employee_no, employee.full_name, employee.department_name, employee.location_name, employee.location_name, employee.position_title, employee.employment_type, employee.job_level_name, contract.basic_salary_snapshot, contract.salary_currency_snapshot, contract.salary_terms_json, contract.benefits_terms_json, contract.working_terms_json, contract.termination_notice_days, contract.renewal_notice_days, stringOrNull(body.notes), c.get("currentUser").id, c.get("currentUser").id, JSON.stringify({ renewal_of_contract_id: contract.id }))
    .run();
  await c.env.DB
    .prepare("INSERT INTO employee_contract_renewals (id, original_contract_id, renewal_contract_id, employee_id, renewal_status, previous_end_date, proposed_start_date, proposed_end_date, changes_summary_json, reason, created_by_user_id) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)")
    .bind(renewalId, contract.id, newContractId, contract.employee_id, contract.contract_end_date, proposedStart, proposedEnd, JSON.stringify({ created_contract_id: newContractId, salary_snapshot_copied: true }), stringOrNull(body.reason), c.get("currentUser").id)
    .run();
  await c.env.DB.prepare("UPDATE employee_contracts SET renewal_status = 'PENDING_RENEWAL', updated_at = ? WHERE id = ?").bind(nowIso(), contract.id).run();
  await createContractEvent(c, { id: newContractId, employee_id: contract.employee_id }, "RENEWAL_CREATED", null, "DRAFT", stringOrNull(body.reason), null, { original_contract_id: contract.id, renewal_id: renewalId });
  await auditContract(c, { action: "contract.renewal.created", entityType: "contract_renewal", entityId: renewalId, newValue: { renewal_contract_id: newContractId }, reason: stringOrNull(body.reason) });
  return ok(c, { renewal_id: renewalId, renewal_contract_id: newContractId }, 201);
});

contractRoutes.post("/renewals/:renewalId/approve", requireAnyPermission(RENEWALS_APPROVE), async (c) => {
  const renewal = await c.env.DB.prepare("SELECT * FROM employee_contract_renewals WHERE id = ?").bind(c.req.param("renewalId")).first<Record<string, unknown>>();
  if (!renewal) return fail(c, 404, "CONTRACT_RENEWAL_INVALID", "Renewal was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(renewal.employee_id), "contracts", "manage"))) return fail(c, 404, "CONTRACT_SCOPE_DENIED", "Renewal was not found.");
  await c.env.DB.prepare("UPDATE employee_contract_renewals SET renewal_status = 'APPROVED', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), nowIso(), String(renewal.id)).run();
  await auditContract(c, { action: "contract.renewal.approved", entityType: "contract_renewal", entityId: String(renewal.id), oldValue: renewal });
  return ok(c, { approved: true });
});

contractRoutes.post("/renewals/:renewalId/activate", requireAnyPermission(RENEWALS_ACTIVATE), async (c) => {
  const renewal = await c.env.DB.prepare("SELECT * FROM employee_contract_renewals WHERE id = ?").bind(c.req.param("renewalId")).first<Record<string, unknown>>();
  if (!renewal) return fail(c, 404, "CONTRACT_RENEWAL_INVALID", "Renewal was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(renewal.employee_id), "contracts", "manage"))) return fail(c, 404, "CONTRACT_SCOPE_DENIED", "Renewal was not found.");
  await c.env.DB.prepare("UPDATE employee_contracts SET status = 'RENEWED', renewal_status = 'RENEWED', updated_at = ? WHERE id = ?").bind(nowIso(), String(renewal.original_contract_id)).run();
  await c.env.DB.prepare("UPDATE employee_contracts SET status = 'ACTIVE', updated_at = ? WHERE id = ?").bind(nowIso(), String(renewal.renewal_contract_id)).run();
  await c.env.DB.prepare("UPDATE employee_contract_renewals SET renewal_status = 'ACTIVATED', activated_by_user_id = ?, activated_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), nowIso(), String(renewal.id)).run();
  await syncEmployeeContractStatusSnapshot(c.env.DB, String(renewal.employee_id));
  await auditContract(c, { action: "contract.renewal.activated", entityType: "contract_renewal", entityId: String(renewal.id), oldValue: renewal });
  return ok(c, { activated: true });
});

contractRoutes.post("/renewals/:renewalId/cancel", requireAnyPermission(RENEWALS_CANCEL), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = stringOrNull(body.reason);
  if (!reason) return fail(c, 400, "CONTRACT_REASON_REQUIRED", "A cancellation reason is required.");
  const renewal = await c.env.DB.prepare("SELECT * FROM employee_contract_renewals WHERE id = ?").bind(c.req.param("renewalId")).first<Record<string, unknown>>();
  if (!renewal) return fail(c, 404, "CONTRACT_RENEWAL_INVALID", "Renewal was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(renewal.employee_id), "contracts", "manage"))) return fail(c, 404, "CONTRACT_SCOPE_DENIED", "Renewal was not found.");
  await c.env.DB.prepare("UPDATE employee_contract_renewals SET renewal_status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), nowIso(), String(renewal.id)).run();
  await auditContract(c, { action: "contract.renewal.cancelled", entityType: "contract_renewal", entityId: String(renewal.id), oldValue: renewal, reason });
  return ok(c, { cancelled: true });
});

contractRoutes.post("/:contractId/mark-not-renewed", requireAnyPermission(CONTRACT_RENEW), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = stringOrNull(body.reason);
  if (!reason) return fail(c, 400, "CONTRACT_REASON_REQUIRED", "A reason is required to mark a contract as not renewed.");
  const contract = await assertContractAccess(c, c.req.param("contractId"), "manage");
  if (!contract) return fail(c, 404, "CONTRACT_NOT_FOUND", "Contract was not found.");
  await c.env.DB.prepare("UPDATE employee_contracts SET renewal_status = 'NOT_RENEWED', updated_at = ? WHERE id = ?").bind(nowIso(), contract.id).run();
  await auditContract(c, { action: "contract.marked_not_renewed", entityType: "contract", entityId: contract.id, oldValue: contract, reason });
  return ok(c, { updated: true });
});

employeeContractRoutes.get("/:employeeId/contracts", requireAnyPermission(CONTRACT_READ), async (c) => {
  const employeeId = c.req.param("employeeId") ?? "";
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "contracts", "view"))) return fail(c, 404, "CONTRACT_SCOPE_DENIED", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM employee_contracts WHERE employee_id = ? ORDER BY contract_start_date DESC, created_at DESC").bind(employeeId).all<ContractRow>();
  return ok(c, { contracts: rows.results.map((row) => toApiContract(c, row)) });
});

employeeContractRoutes.get("/:employeeId/contracts/summary", requireAnyPermission(["employees.contracts.view", "contracts.view", "contracts.manage"]), async (c) => {
  const employeeId = c.req.param("employeeId") ?? "";
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "contracts", "view"))) return fail(c, 404, "CONTRACT_SCOPE_DENIED", "Employee was not found.");
  const [active, history, alerts] = await Promise.all([
    getEmployeeActiveContract(c.env.DB, employeeId),
    c.env.DB.prepare("SELECT * FROM employee_contracts WHERE employee_id = ? ORDER BY contract_start_date DESC, created_at DESC").bind(employeeId).all<ContractRow>(),
    c.env.DB.prepare("SELECT * FROM contract_alerts WHERE employee_id = ? AND status IN ('OPEN', 'ACKNOWLEDGED') ORDER BY due_date, created_at DESC").bind(employeeId).all<Record<string, unknown>>()
  ]);
  const events = active ? await c.env.DB.prepare("SELECT * FROM employee_contract_events WHERE contract_id = ? ORDER BY created_at DESC LIMIT 20").bind(active.id).all<Record<string, unknown>>() : { results: [] as Record<string, unknown>[] };
  return ok(c, {
    active_contract: active ? toApiContract(c, active) : null,
    contract_history: history.results.map((row) => toApiContract(c, row)),
    events: events.results,
    alerts: alerts.results,
    requirement_status: await getEmployeeContractRequirementStatus(c.env.DB, employeeId),
    payroll_impact: await getContractPayrollImpact(c.env.DB, employeeId),
    final_settlement_context: await getContractFinalSettlementImpact(c.env.DB, employeeId)
  });
});

employeeContractRoutes.post("/:employeeId/contracts", requireAnyPermission(CONTRACT_CREATE), async (c) => {
  const disabled = await requireContractsEnabled(c);
  if (disabled) return disabled;
  const employeeId = c.req.param("employeeId") ?? "";
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "contracts", "manage"))) return fail(c, 404, "CONTRACT_SCOPE_DENIED", "Employee was not found.");
  const body = await readJsonBody(c.req.raw);
  const employee = await getEmployeeSnapshot(c.env.DB, employeeId);
  if (!employee) return fail(c, 404, "CONTRACT_NOT_FOUND", "Employee was not found.");
  const typeResult = await requireActiveContractTypeForNewContract(c, readString(body.contract_type_id));
  if ("response" in typeResult) return typeResult.response;
  const type = typeResult.type!;
  if ((body.salary_terms !== undefined || body.basic_salary_snapshot !== undefined) && !requireAny(c, CONTRACT_SALARY_MANAGE)) return fail(c, 403, "CONTRACT_SALARY_PERMISSION_REQUIRED", "Contract salary terms require salary terms permission.");
  const settings = await getContractSettings(c.env.DB);
  const providedStartDate = readString(body.contract_start_date);
  const merged = {
    ...body,
    contract_start_date: providedStartDate,
    contract_end_date: stringOrNull(body.contract_end_date),
    probation_start_date: stringOrNull(body.probation_start_date),
    probation_end_date: stringOrNull(body.probation_end_date),
    confirmation_due_date: stringOrNull(body.confirmation_due_date),
    effective_date: stringOrNull(body.effective_date) ?? providedStartDate,
    basic_salary_snapshot: numberOrNull(body.basic_salary_snapshot) ?? employee.basic_salary,
    salary_currency_snapshot: stringOrNull(body.salary_currency_snapshot) ?? employee.currency ?? "MVR"
  };
  const input = readContractBody(merged);
  const typeValidation = validateContractTypeDrivenFields(c, input, type);
  if (typeValidation) return typeValidation;
  const ruleIssues = validateContractInput(input);
  if (hasValidationErrors(ruleIssues)) return validationResponse(c, ruleIssues);
  if (!(await validateDocumentLink(c.env.DB, employeeId, input.document_id))) return fail(c, 400, "CONTRACT_DOCUMENT_INVALID", "Linked contract document must belong to this employee and be active.");
  const id = crypto.randomUUID();
  const contractNumber = input.contract_number ?? buildContractNumber(employee);
  const probationStatus: ProbationStatus = input.probation_start_date || input.probation_end_date || type.requires_probation === 1 ? "IN_PROBATION" : "NOT_APPLICABLE";
  const renewalStatus: RenewalStatus = type.allows_renewal === 1 ? "NOT_DUE" : "NOT_APPLICABLE";
  await c.env.DB
    .prepare(
      `INSERT INTO employee_contracts
       (id, employee_id, contract_number, contract_type_id, contract_type_code_snapshot, contract_type_name_snapshot, contract_title,
        contract_version_number, document_id, contract_document_version_id, contract_start_date, contract_end_date, probation_start_date,
        probation_end_date, confirmation_due_date, signed_date, effective_date, expiry_warning_date, renewal_due_date, status,
        approval_status, probation_status, renewal_status, employee_number_snapshot, employee_name_snapshot, department_snapshot,
        worksite_snapshot, location_snapshot, position_snapshot, employment_type_snapshot, job_level_snapshot, basic_salary_snapshot,
        salary_currency_snapshot, salary_terms_json, benefits_terms_json, working_terms_json, termination_notice_days, renewal_notice_days,
        notes, created_by_user_id, updated_by_user_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employee.id, contractNumber, type.id, type.code, type.name, input.contract_title ?? `${type.name} Contract`, input.document_id, input.contract_document_version_id, input.contract_start_date, input.contract_end_date, input.probation_start_date, input.probation_end_date, input.confirmation_due_date, input.signed_date, input.effective_date ?? input.contract_start_date, dateMinusDays(input.contract_end_date, settings.default_expiry_warning_days), dateMinusDays(input.contract_end_date, settings.default_renewal_warning_days), settings.require_contract_approval_before_activation === 1 ? "PENDING" : "NOT_REQUIRED", probationStatus, renewalStatus, employee.employee_no, employee.full_name, employee.department_name, employee.location_name, employee.location_name, employee.position_title, employee.employment_type, employee.job_level_name, settings.allow_contract_salary_snapshot === 1 ? input.basic_salary_snapshot : null, settings.allow_contract_salary_snapshot === 1 ? input.salary_currency_snapshot : null, settings.allow_contract_salary_snapshot === 1 ? input.salary_terms_json : null, input.benefits_terms_json, input.working_terms_json, input.termination_notice_days, input.renewal_notice_days, input.notes, c.get("currentUser").id, c.get("currentUser").id, JSON.stringify({ created_from: "contracts_api" }))
    .run();
  const contract = await getContractById(c.env.DB, id);
  await maybeCreateContractTaskForOnboarding(c.env.DB, employee.id);
  await createContractEvent(c, { id, employee_id: employee.id }, "CREATED", null, "DRAFT", stringOrNull(body.reason), null);
  await auditContract(c, { action: "contract.created", entityType: "contract", entityId: id, newValue: contract, reason: stringOrNull(body.reason) });
  await publishContract(c, "contract.created", "contract", id, "created");
  return ok(c, { contract: toApiContract(c, contract!) }, 201);
});

selfServiceContractRoutes.get("/contracts", async (c) => {
  if (!requireAny(c, ["self_service.contracts.view", "self_service.view"])) return fail(c, 403, "CONTRACT_PERMISSION_DENIED", "You do not have permission to view self-service contracts.");
  const employeeId = c.get("currentUser").employee_id;
  if (!employeeId) return ok(c, { active_contract: null, contract_history: [], message: "This account is not linked to an employee profile." });
  const settings = await getContractSettings(c.env.DB);
  const rows = await c.env.DB.prepare("SELECT * FROM employee_contracts WHERE employee_id = ? ORDER BY contract_start_date DESC, created_at DESC").bind(employeeId).all<ContractRow>();
  const active = rows.results.find((row) => row.status === "ACTIVE" || row.status === "EXPIRING_SOON") ?? null;
  const allowSalary = settings.contract_sensitive_salary_terms !== 1 || requireAny(c, CONTRACT_SALARY_VIEW);
  const mapSelf = (row: ContractRow) => ({
    id: row.id,
    contract_number: row.contract_number,
    contract_title: row.contract_title,
    contract_type_name_snapshot: row.contract_type_name_snapshot,
    contract_type_display_name: row.contract_type_name_snapshot ?? "Not selected",
    contract_start_date: row.contract_start_date,
    contract_end_date: row.contract_end_date,
    status: row.status,
    probation_status: row.probation_status,
    confirmation_due_date: row.confirmation_due_date,
    renewal_status: row.renewal_status,
    document_id: row.document_id,
    basic_salary_snapshot: allowSalary ? row.basic_salary_snapshot : null,
    salary_currency_snapshot: allowSalary ? row.salary_currency_snapshot : null,
    salary_terms_restricted: !allowSalary
  });
  return ok(c, { active_contract: active ? mapSelf(active) : null, contract_history: rows.results.map(mapSelf), salary_terms_visible: allowSalary });
});

export { contractRoutes, employeeContractRoutes, selfServiceContractRoutes };
