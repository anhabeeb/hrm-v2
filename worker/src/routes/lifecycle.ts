import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDateRange, validateDuplicateConflict, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings, AuthUser } from "../types";
import { fail, getClientIp, nowIso, ok } from "../utils/http";
import { readString } from "../utils/validation";

type BindValue = string | number | null;
type LifecycleCaseType = "ONBOARDING" | "OFFBOARDING";
type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED" | "BLOCKED" | "NOT_REQUIRED" | "CANCELLED";

export const onboardingRoutes = new Hono<AppBindings>();
export const offboardingRoutes = new Hono<AppBindings>();
export const employeeLifecycleRoutes = new Hono<AppBindings>();
export const selfServiceLifecycleRoutes = new Hono<AppBindings>();
export const lifecycleRoutes = new Hono<AppBindings>();

onboardingRoutes.use("*", requireAuth);
offboardingRoutes.use("*", requireAuth);
employeeLifecycleRoutes.use("*", requireAuth);
selfServiceLifecycleRoutes.use("*", requireAuth);
lifecycleRoutes.use("*", requireAuth);

const onboardingSettingsFields = [
  "onboarding_enabled",
  "require_onboarding_before_activation",
  "allow_draft_employee_records",
  "auto_create_onboarding_case_on_employee_create",
  "allow_partial_onboarding",
  "require_personal_info_before_activation",
  "require_contact_info_before_activation",
  "require_emergency_contact_before_activation",
  "require_job_assignment_before_activation",
  "require_department_before_activation",
  "require_worksite_location_before_activation",
  "require_reporting_manager_before_activation",
  "require_documents_before_activation",
  "require_contract_before_activation",
  "require_payroll_profile_before_activation",
  "require_payment_method_before_activation",
  "require_pension_profile_if_eligible_before_activation",
  "require_roster_eligibility_before_activation",
  "require_biometric_mapping_before_activation",
  "require_asset_uniform_issue_before_activation",
  "require_user_account_before_activation",
  "require_approval_before_activation",
  "allow_activation_override_with_reason",
  "use_central_approval_workflow",
  "default_onboarding_due_days",
  "default_task_due_days",
  "overdue_alerts_enabled",
  "employee_self_service_onboarding_view_enabled",
  "invite_email_placeholder_enabled",
  "metadata_json"
] as const;

const offboardingSettingsFields = [
  "offboarding_enabled",
  "require_offboarding_case_before_exit",
  "auto_create_offboarding_case_on_exit_status",
  "require_final_settlement_before_archive",
  "require_asset_uniform_clearance",
  "require_document_checklist",
  "require_payroll_final_check",
  "require_attendance_final_check",
  "require_roster_future_assignment_check",
  "require_user_account_deactivation",
  "require_access_revocation",
  "require_approval_before_exit_finalization",
  "allow_offboarding_override_with_reason",
  "use_central_approval_workflow",
  "default_offboarding_due_days",
  "default_task_due_days",
  "overdue_alerts_enabled",
  "employee_self_service_offboarding_view_enabled",
  "scheduled_access_deactivation_placeholder_enabled",
  "metadata_json"
] as const;

const onboardingTemplates = [
  ["personal_info", "Personal information complete", "PERSONAL_INFO", "employees", "Core profile fields are complete.", 1],
  ["contact_info", "Contact information reviewed", "CONTACT_INFO", "employees", "Contact and emergency contact data has been reviewed.", 0],
  ["job_assignment", "Job and organization assigned", "JOB_ASSIGNMENT", "employees", "Department, position, location, and reporting structure are ready.", 1],
  ["documents", "Required documents complete", "DOCUMENTS", "documents", "Required document compliance is complete or waived.", 1],
  ["contract", "Contract ready", "CONTRACT", "contracts", "Employment contract is active or marked not required.", 0],
  ["payroll_profile", "Payroll profile ready", "PAYROLL_PROFILE", "payroll", "Payroll profile and salary foundation are ready.", 1],
  ["payment_method", "Payment method reviewed", "PAYMENT_METHOD", "payroll", "Payment method is available if required.", 0],
  ["user_access", "User access setup reviewed", "USER_ACCESS", "users", "Login/access setup is created, linked, or deferred.", 0],
  ["attendance_biometric", "Attendance and biometric readiness", "ATTENDANCE_BIOMETRIC", "attendance", "Roster eligibility, attendance start, and biometric mapping are ready if required.", 0],
  ["assets_uniforms", "Assets and uniforms reviewed", "ASSETS_UNIFORMS", "assets", "Required assets/uniform issue is complete or waived.", 0],
  ["activation_approval", "Final activation approval", "ACTIVATION_APPROVAL", "approvals", "Activation approval is complete or not required.", 1]
] as const;

const offboardingTemplates = [
  ["final_settlement", "Final settlement readiness", "FINAL_SETTLEMENT", "final_settlement", "Final settlement is complete or not required.", 1],
  ["leave", "Leave balances and pending requests reviewed", "LEAVE", "leave", "Leave requests and balance impact are reviewed.", 0],
  ["payroll", "Payroll final check", "PAYROLL", "payroll", "Payroll, advances, bank loans, deductions, and pension are checked.", 1],
  ["attendance_biometric", "Attendance and biometric warnings reviewed", "ATTENDANCE_BIOMETRIC", "attendance", "Attendance corrections and biometric import warnings are reviewed.", 1],
  ["roster", "Future roster assignments reviewed", "ROSTER", "roster", "Future roster assignments after exit date are reviewed.", 1],
  ["assets_uniforms", "Asset and uniform clearance", "ASSETS_UNIFORMS", "assets", "Issued assets/uniforms are cleared, waived, or charged.", 1],
  ["documents", "Document return/compliance reviewed", "DOCUMENTS", "documents", "Document checklist and compliance is reviewed.", 0],
  ["user_access", "User access deactivated/revoked", "USER_ACCESS", "users", "Login and access revocation is complete or scheduled.", 1],
  ["final_approval", "Exit final approval", "APPROVAL", "approvals", "Exit finalization approval is complete or not required.", 1]
] as const;

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const user = c.get("currentUser");
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "LIFECYCLE_PERMISSION_DENIED", "You do not have permission for this lifecycle action.");
    await next();
  });
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function caseNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function readBody(c: Context<AppBindings>) {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
}

function asBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

function asSqlBool(value: unknown) {
  return asBool(value) ? 1 : 0;
}

function optionalText(value: unknown) {
  return readString(value) || null;
}

function oldTaskStatus(status: TaskStatus) {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "BLOCKED") return "BLOCKED";
  if (status === "WAIVED" || status === "NOT_REQUIRED" || status === "CANCELLED") return "SKIPPED";
  return "PENDING";
}

function where(conditions: string[]) {
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

async function auditLifecycle(c: Context<AppBindings>, action: string, entityType: string, entityId: string | null, oldValue?: unknown, newValue?: unknown, reason?: string | null) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action,
    module: "lifecycle",
    entityType,
    entityId,
    oldValue,
    newValue,
    reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishLifecycle(c: Context<AppBindings>, employeeId: string, action: string) {
  await publishAccessEvent(c.env, "employees.changed", { actor_user_id: c.get("currentUser").id, entity_type: "employee", entity_id: employeeId, action });
}

async function ensureOnboardingSettings(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO onboarding_settings (id, metadata_json) VALUES ('onboarding_settings_default', ?)").bind(JSON.stringify({ seeded_prompt: "19" })).run();
  return db.prepare("SELECT * FROM onboarding_settings WHERE id = 'onboarding_settings_default'").first<Record<string, unknown>>();
}

async function ensureOffboardingSettings(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO offboarding_settings (id, metadata_json) VALUES ('offboarding_settings_default', ?)").bind(JSON.stringify({ seeded_prompt: "19" })).run();
  return db.prepare("SELECT * FROM offboarding_settings WHERE id = 'offboarding_settings_default'").first<Record<string, unknown>>();
}

async function getScopedEmployee(c: Context<AppBindings>, employeeId: string, action: "view" | "manage" = "view") {
  const user = c.get("currentUser");
  const allowed = await canAccessEmployee(c.env.DB, user, employeeId, "employees", action);
  if (!allowed) return null;
  return c.env.DB
    .prepare(
      `SELECT e.*, d.name AS department_name, l.name AS location_name, p.title AS position_name, es.key AS status_key, es.name AS status_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN employee_statuses es ON es.id = e.status_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Record<string, unknown>>();
}

async function getCaseEmployee(c: Context<AppBindings>, caseType: LifecycleCaseType, caseId: string, action: "view" | "manage" = "view") {
  const table = caseType === "ONBOARDING" ? "employee_onboarding_cases" : "employee_offboarding_cases";
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(caseId).first<Record<string, unknown>>();
  if (!row) return null;
  const employee = await getScopedEmployee(c, String(row.employee_id), action);
  return employee ? { row, employee } : null;
}

export async function createLifecycleEvent(c: Context<AppBindings>, input: { employeeId: string; caseType: LifecycleCaseType; caseId: string; action: string; previousStatus?: string | null; newStatus?: string | null; reason?: string | null; note?: string | null; metadata?: unknown }) {
  const eventId = id("lifecycle_event");
  const user = c.get("currentUser");
  await c.env.DB
    .prepare(
      `INSERT INTO employee_lifecycle_events
       (id, employee_id, case_type, case_id, action, previous_status, new_status, actor_user_id, actor_name_snapshot, reason, note, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(eventId, input.employeeId, input.caseType, input.caseId, input.action, input.previousStatus ?? null, input.newStatus ?? null, user.id, user.name, input.reason ?? null, input.note ?? null, input.metadata ? JSON.stringify(input.metadata) : null)
    .run();
  await auditLifecycle(c, input.action, "employee_lifecycle_event", eventId, { previous_status: input.previousStatus }, { new_status: input.newStatus, metadata: input.metadata }, input.reason);
  return eventId;
}

export async function createOnboardingTaskIfMissing(c: Context<AppBindings>, caseId: string, employeeId: string, template: (typeof onboardingTemplates)[number], requiredOverride?: boolean) {
  const [taskKey, taskName, taskGroup, sourceModule, description, defaultRequired] = template;
  const taskId = id("onboarding_task");
  const required = requiredOverride ?? defaultRequired === 1;
  await c.env.DB
    .prepare(
      `INSERT OR IGNORE INTO employee_onboarding_tasks
       (id, onboarding_case_id, employee_id, task_key, title, task_name, description, module, task_group, source_module, status, task_status, required, is_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'NOT_STARTED', ?, ?)`
    )
    .bind(taskId, caseId, employeeId, taskKey, taskName, taskName, description, sourceModule, taskGroup, sourceModule, required ? 1 : 0, required ? 1 : 0)
    .run();
}

async function createOffboardingTaskIfMissing(c: Context<AppBindings>, caseId: string, employeeId: string, template: (typeof offboardingTemplates)[number]) {
  const [taskKey, taskName, taskGroup, sourceModule, notes, required] = template;
  await c.env.DB
    .prepare(
      `INSERT OR IGNORE INTO employee_offboarding_tasks
       (id, offboarding_case_id, employee_id, task_key, task_name, task_group, source_module, is_required, task_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NOT_STARTED', ?)`
    )
    .bind(id("offboarding_task"), caseId, employeeId, taskKey, taskName, taskGroup, sourceModule, required, notes)
    .run();
}

export async function refreshOnboardingChecklist(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return null;
  const settings = await ensureOnboardingSettings(c.env.DB);
  await seedOnboardingChecklistForEmployee(c, caseId, String(gate.row.employee_id), settings);
  return getOnboardingChecklistStatus(c, caseId);
}

function isOnboardingTemplateRequired(template: (typeof onboardingTemplates)[number], settings: Record<string, unknown> | null | undefined) {
  return template[0] === "documents" ? Number(settings?.require_documents_before_activation ?? 1) === 1
    : template[0] === "contract" ? Number(settings?.require_contract_before_activation ?? 0) === 1
    : template[0] === "payroll_profile" ? Number(settings?.require_payroll_profile_before_activation ?? 1) === 1
    : template[0] === "payment_method" ? Number(settings?.require_payment_method_before_activation ?? 0) === 1
    : template[0] === "user_access" ? Number(settings?.require_user_account_before_activation ?? 0) === 1
    : template[0] === "attendance_biometric" ? Number(settings?.require_biometric_mapping_before_activation ?? 0) === 1
    : template[0] === "assets_uniforms" ? Number(settings?.require_asset_uniform_issue_before_activation ?? 0) === 1
    : template[5] === 1;
}

async function seedOnboardingChecklistForEmployee(c: Context<AppBindings>, caseId: string, employeeId: string, settings: Record<string, unknown> | null | undefined) {
  for (const template of onboardingTemplates) {
    await createOnboardingTaskIfMissing(c, caseId, employeeId, template, isOnboardingTemplateRequired(template, settings));
  }
}

async function refreshOffboardingChecklist(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  if (!gate) return null;
  const settings = await ensureOffboardingSettings(c.env.DB);
  for (const template of offboardingTemplates) {
    if (template[0] === "final_settlement" && Number(settings?.require_final_settlement_before_archive ?? 1) !== 1) continue;
    if (template[0] === "assets_uniforms" && Number(settings?.require_asset_uniform_clearance ?? 1) !== 1) continue;
    if (template[0] === "documents" && Number(settings?.require_document_checklist ?? 0) !== 1) continue;
    if (template[0] === "user_access" && Number(settings?.require_user_account_deactivation ?? 1) !== 1) continue;
    await createOffboardingTaskIfMissing(c, caseId, String(gate.row.employee_id), template);
  }
  return getOffboardingChecklistStatus(c, caseId);
}

export async function getOnboardingChecklistStatus(c: Context<AppBindings>, caseId: string) {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE onboarding_case_id = ? ORDER BY is_required DESC, task_group, created_at").bind(caseId).all<Record<string, unknown>>();
  const tasks = rows.results;
  const blockers = tasks.filter((task) => Number(task.is_required ?? task.required ?? 1) === 1 && !["COMPLETED", "WAIVED", "NOT_REQUIRED"].includes(String(task.task_status ?? "")));
  return { tasks, total: tasks.length, completed: tasks.filter((task) => task.task_status === "COMPLETED").length, blockers };
}

async function getOffboardingChecklistStatus(c: Context<AppBindings>, caseId: string) {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_offboarding_tasks WHERE offboarding_case_id = ? ORDER BY is_required DESC, task_group, created_at").bind(caseId).all<Record<string, unknown>>();
  const tasks = rows.results;
  const blockers = tasks.filter((task) => Number(task.is_required ?? 1) === 1 && !["COMPLETED", "WAIVED", "NOT_REQUIRED"].includes(String(task.task_status ?? "")));
  return { tasks, total: tasks.length, completed: tasks.filter((task) => task.task_status === "COMPLETED").length, blockers };
}

export async function getOnboardingBlockers(c: Context<AppBindings>, caseId: string) {
  const checklist = await getOnboardingChecklistStatus(c, caseId);
  const moduleBlockers = [
    ...(await getOnboardingDocumentBlockers(c, caseId)),
    ...(await getOnboardingContractBlockers(c, caseId)),
    ...(await getOnboardingAssetUniformBlockers(c, caseId))
  ];
  return [...checklist.blockers.map((task) => ({ type: "TASK", task_key: task.task_key, message: `${String(task.task_name ?? task.title)} is not complete.` })), ...moduleBlockers];
}

async function getOffboardingBlockers(c: Context<AppBindings>, caseId: string) {
  const checklist = await getOffboardingChecklistStatus(c, caseId);
  const moduleBlockers = [
    ...(await getOffboardingFinalSettlementBlockers(c, caseId)),
    ...(await getOffboardingLeaveBlockers(c, caseId))
  ];
  return [...checklist.blockers.map((task) => ({ type: "TASK", task_key: task.task_key, message: `${String(task.task_name)} is not complete.` })), ...moduleBlockers];
}

export async function completeOnboardingTask(c: Context<AppBindings>, taskId: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET status = 'COMPLETED', task_status = 'COMPLETED', completed_by_user_id = ?, completed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, taskId).run();
}

export async function waiveOnboardingTask(c: Context<AppBindings>, taskId: string, reason: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET status = 'SKIPPED', task_status = 'WAIVED', waived_by_user_id = ?, waived_at = ?, waiver_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, reason, now, taskId).run();
}

async function completeOffboardingTask(c: Context<AppBindings>, taskId: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = 'COMPLETED', completed_by_user_id = ?, completed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, taskId).run();
}

async function waiveOffboardingTask(c: Context<AppBindings>, taskId: string, reason: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = 'WAIVED', waived_by_user_id = ?, waived_at = ?, waiver_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, reason, now, taskId).run();
}

export async function getOnboardingDocumentChecklist(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return { rows: [] };
  const rows = await c.env.DB.prepare("SELECT document_type_id, requirement_status, current_employee_document_id FROM employee_document_checklist_items WHERE employee_id = ? AND is_active = 1").bind(String(gate.row.employee_id)).all<Record<string, unknown>>();
  return { rows: rows.results };
}

export async function getOnboardingDocumentBlockers(c: Context<AppBindings>, caseId: string) {
  const checklist = await getOnboardingDocumentChecklist(c, caseId);
  return checklist.rows.filter((row) => row.requirement_status === "REQUIRED" && !row.current_employee_document_id).map((row) => ({ type: "DOCUMENT", message: "A required employee document is missing.", document_type_id: row.document_type_id }));
}

export async function getOnboardingContractStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const onboardingSettings = await ensureOnboardingSettings(c.env.DB);
  const contractSettings = await c.env.DB.prepare("SELECT * FROM contract_settings ORDER BY created_at LIMIT 1").first<Record<string, unknown>>();
  const requiredByOnboarding = Number(onboardingSettings?.require_contract_before_activation ?? 0) === 1;
  const requiredByContractSettings = Number(contractSettings?.require_contract_for_active_employee ?? 0) === 1;
  const required = requiredByOnboarding || requiredByContractSettings;

  if (!gate) {
    return {
      ready: !required,
      required,
      status: required ? "MISSING" : "NOT_REQUIRED",
      status_label: required ? "Contract missing" : "Not required",
      active_contracts: 0,
      contract: null,
      display: {
        contract: required ? "Contract missing" : "Not required",
        contract_type: "Not selected",
        contract_start_date: "Not set",
        contract_end_date: "Not required",
        probation: "Not applicable",
        confirmation_due: "Not set"
      },
      blockers: required ? [{ type: "CONTRACT", message: "Required employment contract is missing." }] : [],
      warnings: []
    };
  }

  const contract = await c.env.DB
    .prepare(
      `SELECT ec.*,
        ct.name AS current_contract_type_name,
        ct.code AS current_contract_type_code,
        ct.requires_end_date AS current_contract_type_requires_end_date,
        ct.requires_probation AS current_contract_type_requires_probation,
        ct.status AS current_contract_type_status,
        ct.archived_at AS current_contract_type_archived_at
       FROM employee_contracts ec
       LEFT JOIN contract_types ct ON ct.id = ec.contract_type_id
       WHERE ec.employee_id = ? AND ec.status IN ('ACTIVE', 'EXPIRING_SOON', 'PENDING_APPROVAL', 'DRAFT')
       ORDER BY CASE ec.status WHEN 'ACTIVE' THEN 0 WHEN 'EXPIRING_SOON' THEN 1 WHEN 'PENDING_APPROVAL' THEN 2 ELSE 3 END, ec.effective_date DESC, ec.created_at DESC
       LIMIT 1`
    )
    .bind(String(gate.row.employee_id))
    .first<Record<string, unknown>>();

  const activeCount = await c.env.DB
    .prepare("SELECT COUNT(*) AS total FROM employee_contracts WHERE employee_id = ? AND status IN ('ACTIVE', 'EXPIRING_SOON')")
    .bind(String(gate.row.employee_id))
    .first<{ total: number }>();

  if (!contract) {
    return {
      ready: !required,
      required,
      status: required ? "MISSING" : "NOT_REQUIRED",
      status_label: required ? "Contract missing" : "Not required",
      active_contracts: Number(activeCount?.total ?? 0),
      contract: null,
      display: {
        contract: required ? "Contract missing" : "Not required",
        contract_type: "Not selected",
        contract_start_date: "Not set",
        contract_end_date: "Not required",
        probation: "Not applicable",
        confirmation_due: "Not set"
      },
      blockers: required ? [{ type: "CONTRACT", message: "Required employment contract is missing or not active." }] : [],
      warnings: []
    };
  }

  const contractTypeRequiresEndDate = Number(contract.current_contract_type_requires_end_date ?? 0) === 1;
  const contractTypeRequiresProbation = Number(contract.current_contract_type_requires_probation ?? 0) === 1;
  const contractTypeMissingOrArchived = !contract.current_contract_type_name || contract.current_contract_type_status === "ARCHIVED" || Boolean(contract.current_contract_type_archived_at);
  const blockers = [
    required && (!contract.contract_type_id || !contract.current_contract_type_name) ? { type: "CONTRACT", field: "contract_type_id", message: "Please select a contract type." } : null,
    !contract.contract_start_date ? { type: "CONTRACT", field: "contract_start_date", message: "Contract start date is missing." } : null,
    contractTypeRequiresEndDate && !contract.contract_end_date ? { type: "CONTRACT", field: "contract_end_date", message: "This contract type requires a contract end date." } : null,
    contractTypeRequiresProbation && !contract.probation_end_date ? { type: "CONTRACT", field: "probation_end_date", message: "This contract type requires probation details." } : null
  ].filter(Boolean);
  const warnings = contractTypeMissingOrArchived ? [{ type: "CONTRACT", message: "Contract type is not selected or is archived." }] : [];
  const ready = blockers.length === 0 && (!required || ["ACTIVE", "EXPIRING_SOON"].includes(String(contract.status)));

  return {
    ready,
    required,
    status: ready ? "READY" : "INCOMPLETE",
    status_label: ready ? "Contract ready" : "Contract incomplete",
    active_contracts: Number(activeCount?.total ?? 0),
    contract,
    display: {
      contract: contract.contract_number ? String(contract.contract_number) : "Contract missing",
      contract_type: contract.current_contract_type_name ?? contract.contract_type_name_snapshot ?? "Not selected",
      contract_start_date: contract.contract_start_date ?? "Not set",
      contract_end_date: contract.contract_end_date ?? (contractTypeRequiresEndDate ? "Not set" : "Not required"),
      probation: contractTypeRequiresProbation ? (contract.probation_end_date ?? "Not set") : "Not applicable",
      confirmation_due: contract.confirmation_due_date ?? "Not set"
    },
    blockers,
    warnings
  };
}

export async function getOnboardingContractBlockers(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return [];
  const status = await getOnboardingContractStatus(c, caseId);
  return status.ready ? [] : status.blockers;
}

export async function getOnboardingPayrollReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_payroll_profiles WHERE employee_id = ?").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, payroll_profiles: Number(count?.total ?? 0) };
}

export async function getOnboardingPaymentMethodStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_payment_methods WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, active_payment_methods: Number(count?.total ?? 0) };
}

export async function getOnboardingPensionStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_pension_profiles WHERE employee_id = ?").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, pension_profiles: Number(count?.total ?? 0) };
}

export async function getOnboardingRosterReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  return { ready: Boolean(gate?.employee.primary_location_id), roster_eligible: Boolean(gate?.employee.roster_eligible) };
}

export async function getOnboardingAttendanceReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  return { ready: Boolean(gate?.employee.joining_date), attendance_start_date: gate?.employee.joining_date ?? null };
}

export async function getOnboardingBiometricMappingStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_biometric_mappings WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, active_mappings: Number(count?.total ?? 0) };
}

export async function getOnboardingUserAccessStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  return { ready: Boolean(gate?.employee.user_id), user_id: gate?.employee.user_id ?? null, invite_placeholder_available: true };
}

export async function provisionEmployeeUserAccessPlaceholder(_c: Context<AppBindings>, employeeId: string) {
  return { employee_id: employeeId, status: "PLACEHOLDER", message: "Login invitation sending will be connected when an email service is configured." };
}

export async function applyOnboardingAccessTemplate(_c: Context<AppBindings>, employeeId: string) {
  return { employee_id: employeeId, status: "PLACEHOLDER", message: "Role mapping and access scope templates remain the source of truth." };
}

export async function getOnboardingAssetUniformStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_asset_assignments WHERE employee_id = ? AND status = 'ISSUED'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: true, issued_items: Number(count?.total ?? 0) };
}

export async function getOnboardingAssetUniformBlockers(_c: Context<AppBindings>, _caseId: string) {
  return [];
}

export async function getEmployeeOnboardingReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return null;
  await refreshOnboardingChecklist(c, caseId);
  const blockers = await getOnboardingBlockers(c, caseId);
  const checklist = await getOnboardingChecklistStatus(c, caseId);
  const readiness = {
    can_activate: blockers.length === 0,
    blockers,
    blocking_items: blockers,
    warning_items: [],
    checklist,
    documents: await getOnboardingDocumentChecklist(c, caseId),
    contract: await getOnboardingContractStatus(c, caseId),
    payroll: await getOnboardingPayrollReadiness(c, caseId),
    payment_method: await getOnboardingPaymentMethodStatus(c, caseId),
    pension: await getOnboardingPensionStatus(c, caseId),
    roster: await getOnboardingRosterReadiness(c, caseId),
    attendance: await getOnboardingAttendanceReadiness(c, caseId),
    biometric: await getOnboardingBiometricMappingStatus(c, caseId),
    user_access: await getOnboardingUserAccessStatus(c, caseId),
    assets_uniforms: await getOnboardingAssetUniformStatus(c, caseId)
  };
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET checklist_summary_json = ?, blockers_json = ?, onboarding_status = ?, activation_status = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(readiness.checklist), JSON.stringify(blockers), readiness.can_activate ? "READY_FOR_APPROVAL" : "BLOCKED", readiness.can_activate ? "READY" : "NOT_READY", nowIso(), caseId)
    .run();
  return readiness;
}

export async function submitEmployeeActivationForApproval(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  const previous = String(gate.row.activation_status);
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'PENDING_APPROVAL', activation_status = 'SUBMITTED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activation.submitted", previousStatus: previous, newStatus: "SUBMITTED" });
  await publishLifecycle(c, String(gate.row.employee_id), "onboarding.activation.submitted");
  return true;
}

export async function approveEmployeeActivation(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  const previous = String(gate.row.activation_status);
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'APPROVED', activation_status = 'APPROVED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activation.approved", previousStatus: previous, newStatus: "APPROVED" });
  await publishLifecycle(c, String(gate.row.employee_id), "onboarding.activation.approved");
  return true;
}

export async function syncEmployeeStatusAfterOnboarding(c: Context<AppBindings>, employeeId: string) {
  const active = await c.env.DB.prepare("SELECT id FROM employee_statuses WHERE key = 'ACTIVE' AND is_active = 1").first<{ id: string }>();
  if (!active) return false;
  await c.env.DB.prepare("UPDATE employees SET status_id = ?, updated_at = ? WHERE id = ?").bind(active.id, nowIso(), employeeId).run();
  return true;
}

export async function activateEmployeeFromOnboarding(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  const readiness = await getEmployeeOnboardingReadiness(c, caseId);
  if (!readiness?.can_activate) return { blocked: true, readiness };
  await syncEmployeeStatusAfterOnboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'ACTIVATED', activation_status = 'ACTIVATED', completed_at = ?, activated_by_user_id = ?, activated_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activated", previousStatus: String(gate.row.activation_status), newStatus: "ACTIVATED" });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.activated");
  return { activated: true, readiness };
}

export async function activateEmployeeWithOnboardingOverride(c: Context<AppBindings>, caseId: string, reason: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  await syncEmployeeStatusAfterOnboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'ACTIVATED', activation_status = 'OVERRIDDEN', completed_at = ?, activated_by_user_id = ?, activated_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activated_with_onboarding_override", previousStatus: String(gate.row.activation_status), newStatus: "OVERRIDDEN", reason });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.activated_with_onboarding_override");
  return { activated: true, override: true };
}

export async function createOnboardingApprovalInstance(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "PLACEHOLDER", message: "Central approval workflow integration is prepared; approval instances are created when matching workflows are configured." };
}

export async function getOnboardingApprovalSummary(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "NOT_CONFIGURED", timeline: [] };
}

export async function syncOnboardingApprovalStatus(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, synced: true };
}

export async function getOffboardingFinalSettlementStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM final_settlement_cases WHERE employee_id = ? AND status IN ('COMPLETED', 'FINALIZED', 'APPROVED')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, completed_settlements: Number(count?.total ?? 0) };
}

export async function getOffboardingFinalSettlementBlockers(c: Context<AppBindings>, caseId: string) {
  const settings = await ensureOffboardingSettings(c.env.DB);
  if (Number(settings?.require_final_settlement_before_archive ?? 1) !== 1) return [];
  const status = await getOffboardingFinalSettlementStatus(c, caseId);
  return status.ready ? [] : [{ type: "FINAL_SETTLEMENT", message: "Final settlement is required before exit finalization." }];
}

export async function getOffboardingLeaveStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const pending = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM leave_requests WHERE employee_id = ? AND status IN ('DRAFT', 'PENDING_APPROVAL')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(pending?.total ?? 0) === 0, pending_leave_requests: Number(pending?.total ?? 0) };
}

export async function getOffboardingLeaveBlockers(c: Context<AppBindings>, caseId: string) {
  const status = await getOffboardingLeaveStatus(c, caseId);
  return status.ready ? [] : [{ type: "LEAVE", message: "Pending leave requests should be resolved before exit." }];
}

export async function getOffboardingPayrollStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const pending = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM payroll_employee_results WHERE employee_id = ? AND status IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED_PLACEHOLDER', 'HELD')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(pending?.total ?? 0) === 0, pending_payroll_results: Number(pending?.total ?? 0) };
}

export async function getOffboardingBankLoanStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const active = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_bank_loans WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(active?.total ?? 0) === 0, active_loans: Number(active?.total ?? 0) };
}

export async function getOffboardingPensionStatus(c: Context<AppBindings>, _caseId: string) {
  return { ready: true, note: "Pension final check remains in payroll foundation." };
}

export async function getOffboardingCustomDeductionStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const active = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_custom_deductions WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(active?.total ?? 0) === 0, active_deductions: Number(active?.total ?? 0) };
}

export async function getOffboardingAttendanceStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const pending = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM attendance_correction_requests WHERE employee_id = ? AND status IN ('PENDING', 'PENDING_APPROVAL')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(pending?.total ?? 0) === 0, pending_corrections: Number(pending?.total ?? 0) };
}

export async function getOffboardingBiometricImportWarnings(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM attendance_locked_day_import_warnings WHERE employee_id = ? AND status = 'OPEN'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { open_warnings: Number(count?.total ?? 0) };
}

export async function getOffboardingRosterFutureAssignmentWarnings(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM roster_assignments WHERE employee_id = ? AND assignment_date > ? AND status IN ('PUBLISHED', 'CHANGED_AFTER_PUBLISH', 'SCHEDULED')").bind(String(gate.row.employee_id), String(gate.row.last_working_day)).first<{ total: number }>() : { total: 0 };
  return { future_assignments: Number(count?.total ?? 0), warning: Number(count?.total ?? 0) > 0 };
}

export async function getOffboardingAssetUniformClearanceStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const issued = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_asset_assignments WHERE employee_id = ? AND status = 'ISSUED'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(issued?.total ?? 0) === 0, issued_items: Number(issued?.total ?? 0) };
}

export async function getOffboardingDocumentChecklistStatus(_c: Context<AppBindings>, _caseId: string) {
  return { ready: true, note: "Document return checklist is optional and uses document compliance records." };
}

export async function getOffboardingUserAccessStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  if (!gate?.employee.user_id) return { ready: true, user_id: null };
  const user = await c.env.DB.prepare("SELECT id, status, is_owner FROM users WHERE id = ?").bind(String(gate.employee.user_id)).first<Record<string, unknown>>();
  return { ready: user?.status !== "ACTIVE", user_id: user?.id ?? null, status: user?.status ?? null, protected_owner: user?.is_owner === 1 };
}

export async function deactivateEmployeeUserAccessForOffboarding(c: Context<AppBindings>, employeeId: string) {
  const employee = await getScopedEmployee(c, employeeId, "manage");
  if (!employee?.user_id) return { status: "NO_LINKED_USER" };
  const user = await c.env.DB.prepare("SELECT id, is_owner, status FROM users WHERE id = ?").bind(String(employee.user_id)).first<Record<string, unknown>>();
  if (!user) return { status: "NO_LINKED_USER" };
  if (user.is_owner === 1) return { status: "PROTECTED_USER_DEACTIVATION_BLOCKED" };
  await c.env.DB.prepare("UPDATE users SET status = 'DISABLED', updated_at = ? WHERE id = ?").bind(nowIso(), String(user.id)).run();
  return { status: "DISABLED", user_id: user.id };
}

export async function revokeEmployeeAccessForOffboarding(c: Context<AppBindings>, employeeId: string) {
  const result = await deactivateEmployeeUserAccessForOffboarding(c, employeeId);
  return { ...result, roles_revocation: "PLACEHOLDER" };
}

export async function getEmployeeOffboardingReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  if (!gate) return null;
  await refreshOffboardingChecklist(c, caseId);
  const blockers = await getOffboardingBlockers(c, caseId);
  const readiness = {
    can_finalize: blockers.length === 0,
    blockers,
    warning_items: [],
    checklist: await getOffboardingChecklistStatus(c, caseId),
    final_settlement: await getOffboardingFinalSettlementStatus(c, caseId),
    leave: await getOffboardingLeaveStatus(c, caseId),
    payroll: await getOffboardingPayrollStatus(c, caseId),
    bank_loan: await getOffboardingBankLoanStatus(c, caseId),
    pension: await getOffboardingPensionStatus(c, caseId),
    custom_deductions: await getOffboardingCustomDeductionStatus(c, caseId),
    attendance: await getOffboardingAttendanceStatus(c, caseId),
    biometric_warnings: await getOffboardingBiometricImportWarnings(c, caseId),
    roster: await getOffboardingRosterFutureAssignmentWarnings(c, caseId),
    assets_uniforms: await getOffboardingAssetUniformClearanceStatus(c, caseId),
    documents: await getOffboardingDocumentChecklistStatus(c, caseId),
    user_access: await getOffboardingUserAccessStatus(c, caseId)
  };
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET checklist_summary_json = ?, blockers_json = ?, offboarding_status = ?, finalization_status = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(readiness.checklist), JSON.stringify(blockers), readiness.can_finalize ? "READY_FOR_FINAL_APPROVAL" : "WAITING_FOR_CLEARANCE", readiness.can_finalize ? "READY" : "NOT_READY", nowIso(), caseId)
    .run();
  return readiness;
}

export async function submitEmployeeExitForApproval(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'PENDING_APPROVAL', finalization_status = 'SUBMITTED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.submitted", previousStatus: String(gate.row.finalization_status), newStatus: "SUBMITTED" });
  return true;
}

export async function approveEmployeeExitFinalization(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'APPROVED', finalization_status = 'APPROVED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.approved", previousStatus: String(gate.row.finalization_status), newStatus: "APPROVED" });
  return true;
}

export async function syncEmployeeStatusAfterOffboarding(c: Context<AppBindings>, employeeId: string, exitType: string, lastWorkingDay: string, reason: string | null) {
  const key = exitType === "END_OF_CONTRACT" ? "END_OF_CONTRACT" : exitType === "ABSCONDED" ? "ABSCONDED" : exitType === "DECEASED" ? "DECEASED" : exitType === "TERMINATED" ? "TERMINATED" : exitType === "RETIRED" ? "RESIGNED" : "RESIGNED";
  const status = await c.env.DB.prepare("SELECT id FROM employee_statuses WHERE key = ? AND is_active = 1").bind(key).first<{ id: string }>();
  if (!status) return false;
  await c.env.DB.prepare("UPDATE employees SET status_id = ?, exit_date = ?, exit_reason = ?, updated_at = ? WHERE id = ?").bind(status.id, lastWorkingDay, reason, nowIso(), employeeId).run();
  return true;
}

export async function finalizeEmployeeExitFromOffboarding(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  const readiness = await getEmployeeOffboardingReadiness(c, caseId);
  if (!readiness?.can_finalize) return { blocked: true, readiness };
  await syncEmployeeStatusAfterOffboarding(c, String(gate.row.employee_id), String(gate.row.exit_type), String(gate.row.last_working_day), optionalText(gate.row.exit_reason));
  await deactivateEmployeeUserAccessForOffboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'COMPLETED', finalization_status = 'FINALIZED', completed_at = ?, finalized_by_user_id = ?, finalized_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.finalized", previousStatus: String(gate.row.finalization_status), newStatus: "FINALIZED" });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.exit.finalized");
  return { finalized: true, readiness };
}

export async function finalizeEmployeeExitWithOverride(c: Context<AppBindings>, caseId: string, reason: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  await syncEmployeeStatusAfterOffboarding(c, String(gate.row.employee_id), String(gate.row.exit_type), String(gate.row.last_working_day), reason);
  await deactivateEmployeeUserAccessForOffboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'COMPLETED', finalization_status = 'OVERRIDDEN', completed_at = ?, finalized_by_user_id = ?, finalized_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.finalized_with_override", previousStatus: String(gate.row.finalization_status), newStatus: "OVERRIDDEN", reason });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.exit.finalized_with_override");
  return { finalized: true, override: true };
}

export async function createOffboardingApprovalInstance(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "PLACEHOLDER", message: "Central approval workflow integration is prepared for exit finalization." };
}

export async function getOffboardingApprovalSummary(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "NOT_CONFIGURED", timeline: [] };
}

export async function syncOffboardingApprovalStatus(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, synced: true };
}

async function updateSettings(c: Context<AppBindings>, table: "onboarding_settings" | "offboarding_settings", fields: readonly string[]) {
  const body = await readBody(c);
  const updates: string[] = [];
  const binds: BindValue[] = [];
  for (const field of fields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      binds.push(field === "metadata_json" ? (typeof body[field] === "string" ? String(body[field]) : JSON.stringify(body[field] ?? null)) : Number.isFinite(Number(body[field])) || typeof body[field] === "boolean" ? asSqlBool(body[field]) : optionalText(body[field]));
    }
  }
  if (!updates.length) return table === "onboarding_settings" ? ensureOnboardingSettings(c.env.DB) : ensureOffboardingSettings(c.env.DB);
  updates.push("updated_at = ?");
  binds.push(nowIso());
  binds.push(table === "onboarding_settings" ? "onboarding_settings_default" : "offboarding_settings_default");
  await c.env.DB.prepare(`UPDATE ${table} SET ${updates.join(", ")} WHERE id = ?`).bind(...binds).run();
  const row = table === "onboarding_settings" ? await ensureOnboardingSettings(c.env.DB) : await ensureOffboardingSettings(c.env.DB);
  await auditLifecycle(c, `${table}.updated`, table, String(row?.id ?? ""), null, row);
  return row;
}

async function listOnboardingCases(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, user, "employees", "view", "e");
  const conditions = [scope.sql];
  const binds: BindValue[] = [...scope.params];
  const status = c.req.query("status");
  if (status) {
    conditions.push("oc.onboarding_status = ?");
    binds.push(status);
  }
  if (c.req.query("overdue") === "1") conditions.push("oc.due_date IS NOT NULL AND date(oc.due_date) < date('now') AND oc.onboarding_status NOT IN ('ACTIVATED', 'CANCELLED')");
  const rows = await c.env.DB.prepare(
    `SELECT oc.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name, p.title AS position_name
     FROM employee_onboarding_cases oc
     INNER JOIN employees e ON e.id = oc.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     ${where(conditions)}
     ORDER BY oc.created_at DESC`
  ).bind(...binds).all<Record<string, unknown>>();
  return rows.results;
}

async function listOffboardingCases(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, user, "employees", "view", "e");
  const conditions = [scope.sql];
  const binds: BindValue[] = [...scope.params];
  const status = c.req.query("status");
  if (status) {
    conditions.push("oc.offboarding_status = ?");
    binds.push(status);
  }
  if (c.req.query("overdue") === "1") conditions.push("oc.due_date IS NOT NULL AND date(oc.due_date) < date('now') AND oc.offboarding_status NOT IN ('COMPLETED', 'CANCELLED')");
  const rows = await c.env.DB.prepare(
    `SELECT oc.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name, p.title AS position_name
     FROM employee_offboarding_cases oc
     INNER JOIN employees e ON e.id = oc.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     ${where(conditions)}
     ORDER BY oc.created_at DESC`
  ).bind(...binds).all<Record<string, unknown>>();
  return rows.results;
}

async function loadOnboardingCaseEmployeeSnapshot(db: D1Database, employeeId: string) {
  return db
    .prepare(
      `SELECT e.*, d.name AS department_name, l.name AS location_name, p.title AS position_name, es.key AS status_key, es.name AS status_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN employee_statuses es ON es.id = e.status_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Record<string, unknown>>();
}

async function insertOnboardingCaseForEmployee(c: Context<AppBindings>, employee: Record<string, unknown>, settings: Record<string, unknown> | null | undefined, metadata: Record<string, unknown> = {}) {
  const employeeId = String(employee.id);
  const existing = await c.env.DB.prepare("SELECT id FROM employee_onboarding_cases WHERE employee_id = ? AND onboarding_status != 'CANCELLED' AND activation_status != 'ACTIVATED'").bind(employeeId).first<{ id: string }>();
  if (existing) return { duplicate: true, id: existing.id };
  if (settings?.onboarding_enabled === 0) return { disabled: true };
  const now = nowIso();
  const dueDate = new Date(Date.now() + Number(settings?.default_onboarding_due_days ?? 7) * 86400000).toISOString().slice(0, 10);
  const caseId = id("onboarding_case");
  await c.env.DB.prepare(
    `INSERT INTO employee_onboarding_cases
     (id, case_number, employee_id, employee_number_snapshot, employee_name_snapshot, department_snapshot, location_snapshot, position_snapshot, employment_type_snapshot, employee_type_snapshot, onboarding_status, activation_status, due_date, created_by_user_id, updated_by_user_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', 'NOT_READY', ?, ?, ?, ?)`
  ).bind(
    caseId,
    caseNumber("ONB"),
    employeeId,
    employee.employee_no ?? null,
    employee.full_name ?? null,
    employee.department_name ?? null,
    employee.location_name ?? null,
    employee.position_name ?? null,
    employee.employment_type ?? null,
    employee.employee_type ?? null,
    dueDate,
    c.get("currentUser").id,
    c.get("currentUser").id,
    JSON.stringify(metadata)
  ).run();
  await seedOnboardingChecklistForEmployee(c, caseId, employeeId, settings);
  await createLifecycleEvent(c, { employeeId, caseType: "ONBOARDING", caseId, action: "onboarding.case.created", newStatus: "IN_PROGRESS", metadata: { created_at: now, ...metadata } });
  return { id: caseId };
}

export async function autoCreateOnboardingCaseAfterEmployeeCreate(c: Context<AppBindings>, employeeId: string) {
  const settings = await ensureOnboardingSettings(c.env.DB);
  if (settings?.onboarding_enabled === 0 || Number(settings?.auto_create_onboarding_case_on_employee_create ?? 1) !== 1) return { skipped: true };
  const employee = await loadOnboardingCaseEmployeeSnapshot(c.env.DB, employeeId);
  if (!employee) return null;
  return insertOnboardingCaseForEmployee(c, employee, settings, { auto_created: true, source: "employee_create" });
}

export async function createOnboardingCase(c: Context<AppBindings>, employeeId: string) {
  const employee = await getScopedEmployee(c, employeeId, "manage");
  if (!employee) return null;
  const settings = await ensureOnboardingSettings(c.env.DB);
  return insertOnboardingCaseForEmployee(c, employee, settings);
}

async function createOffboardingCase(c: Context<AppBindings>, employeeId: string, body: Record<string, unknown>) {
  const employee = await getScopedEmployee(c, employeeId, "manage");
  if (!employee) return null;
  const existing = await c.env.DB.prepare("SELECT id FROM employee_offboarding_cases WHERE employee_id = ? AND offboarding_status != 'CANCELLED' AND finalization_status != 'FINALIZED'").bind(employeeId).first<{ id: string }>();
  if (existing) return { duplicate: true, id: existing.id };
  const settings = await ensureOffboardingSettings(c.env.DB);
  if (settings?.offboarding_enabled === 0) return { disabled: true };
  const exitType = String(body.exit_type ?? "RESIGNED").toUpperCase();
  if (!["RESIGNED", "TERMINATED", "END_OF_CONTRACT", "ABSCONDED", "RETIRED", "DECEASED", "OTHER"].includes(exitType)) return { invalid: true };
  const lastWorkingDay = optionalText(body.last_working_day) ?? new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + Number(settings?.default_offboarding_due_days ?? 7) * 86400000).toISOString().slice(0, 10);
  const caseId = id("offboarding_case");
  await c.env.DB.prepare(
    `INSERT INTO employee_offboarding_cases
     (id, case_number, employee_id, employee_number_snapshot, employee_name_snapshot, department_snapshot, location_snapshot, position_snapshot, employment_type_snapshot, employee_type_snapshot, exit_type, exit_reason, exit_notice_date, last_working_day, offboarding_status, finalization_status, due_date, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', 'NOT_READY', ?, ?, ?)`
  ).bind(caseId, caseNumber("OFF"), employeeId, employee.employee_no ?? null, employee.full_name ?? null, employee.department_name ?? null, employee.location_name ?? null, employee.position_name ?? null, employee.employment_type ?? null, employee.employee_type ?? null, exitType, optionalText(body.exit_reason), optionalText(body.exit_notice_date), lastWorkingDay, dueDate, c.get("currentUser").id, c.get("currentUser").id).run();
  await refreshOffboardingChecklist(c, caseId);
  await createLifecycleEvent(c, { employeeId, caseType: "OFFBOARDING", caseId, action: "offboarding.case.created", newStatus: "IN_PROGRESS" });
  return { id: caseId };
}

async function lifecycleSummary(c: Context<AppBindings>, employeeId: string) {
  const employee = await getScopedEmployee(c, employeeId, "view");
  if (!employee) return null;
  const [onboarding, offboarding, events] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM employee_onboarding_cases WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_offboarding_cases WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE employee_id = ? ORDER BY created_at DESC LIMIT 25").bind(employeeId).all<Record<string, unknown>>()
  ]);
  const onboardingTasks = onboarding ? (await c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE onboarding_case_id = ? ORDER BY is_required DESC, task_group").bind(String(onboarding.id)).all()).results : [];
  const offboardingTasks = offboarding ? (await c.env.DB.prepare("SELECT * FROM employee_offboarding_tasks WHERE offboarding_case_id = ? ORDER BY is_required DESC, task_group").bind(String(offboarding.id)).all()).results : [];
  return { employee, onboarding, onboarding_tasks: onboardingTasks, offboarding, offboarding_tasks: offboardingTasks, events: events.results };
}

onboardingRoutes.get("/settings", requireAnyPermission(["onboarding.settings.view", "onboarding.settings.manage", "settings.view"]), async (c) => ok(c, { settings: await ensureOnboardingSettings(c.env.DB) }));
onboardingRoutes.patch("/settings", requireAnyPermission(["onboarding.settings.update", "onboarding.settings.manage", "settings.manage"]), async (c) => ok(c, { settings: await updateSettings(c, "onboarding_settings", onboardingSettingsFields) }));
onboardingRoutes.get("/cases", requireAnyPermission(["onboarding.cases.view", "onboarding.cases.manage", "employees.view"]), async (c) => ok(c, { cases: await listOnboardingCases(c) }));
onboardingRoutes.get("/dashboard", requireAnyPermission(["onboarding.dashboard.view", "onboarding.cases.view", "dashboard.view"]), async (c) => {
  const cases = await listOnboardingCases(c);
  return ok(c, {
    dashboard: {
      total_cases: cases.length,
      blocked_onboarding: cases.filter((row) => row.onboarding_status === "BLOCKED").length,
      ready_for_approval: cases.filter((row) => row.onboarding_status === "READY_FOR_APPROVAL").length,
      pending_documents: cases.filter((row) => row.onboarding_status === "WAITING_FOR_DOCUMENTS").length,
      activated_this_month: cases.filter((row) => row.activated_at && String(row.activated_at).slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
      overdue_tasks: cases.filter((row) => row.due_date && String(row.due_date) < new Date().toISOString().slice(0, 10)).length,
      rows: cases.slice(0, 20)
    }
  });
});
onboardingRoutes.get("/alerts", requireAnyPermission(["onboarding.alerts.view", "onboarding.alerts.manage"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT oa.*, e.employee_no, e.full_name AS employee_name FROM onboarding_alerts oa LEFT JOIN employees e ON e.id = oa.employee_id ORDER BY oa.created_at DESC").all();
  return ok(c, { alerts: rows.results });
});
onboardingRoutes.post("/alerts/refresh", requireAnyPermission(["onboarding.alerts.manage"]), async (c) => {
  const cases = await listOnboardingCases(c);
  for (const row of cases.filter((item) => item.onboarding_status === "BLOCKED")) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO onboarding_alerts (id, onboarding_case_id, employee_id, alert_type, severity, metadata_json) VALUES (?, ?, ?, 'ONBOARDING_BLOCKED', 'WARNING', ?)").bind(id("onboarding_alert"), row.id, row.employee_id, JSON.stringify({ refreshed: true })).run();
  }
  return ok(c, { refreshed: true });
});
onboardingRoutes.get("/cases/:caseId", requireAnyPermission(["onboarding.cases.view", "onboarding.cases.manage", "employees.lifecycle.view", "employees.view"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  return ok(c, { case: gate.row, employee: gate.employee, checklist: await getOnboardingChecklistStatus(c, c.req.param("caseId")), approval: await getOnboardingApprovalSummary(c, c.req.param("caseId")) });
});
onboardingRoutes.patch("/cases/:caseId", requireAnyPermission(["onboarding.cases.update", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET assigned_owner_user_id = COALESCE(?, assigned_owner_user_id), due_date = COALESCE(?, due_date), notes = COALESCE(?, notes), updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(optionalText(body.assigned_owner_user_id), optionalText(body.due_date), optionalText(body.notes), c.get("currentUser").id, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId: c.req.param("caseId"), action: "onboarding.case.updated", previousStatus: String(gate.row.onboarding_status), newStatus: String(gate.row.onboarding_status) });
  return ok(c, { case: (await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view"))?.row });
});
onboardingRoutes.post("/cases/:caseId/cancel", requireAnyPermission(["onboarding.cases.cancel", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "ONBOARDING_OVERRIDE_REASON_REQUIRED", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), reason, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId: c.req.param("caseId"), action: "onboarding.case.cancelled", previousStatus: String(gate.row.onboarding_status), newStatus: "CANCELLED", reason });
  return ok(c, { cancelled: true });
});
onboardingRoutes.get("/cases/:caseId/tasks", requireAnyPermission(["onboarding.tasks.view", "onboarding.tasks.manage", "employees.lifecycle.view", "employees.view"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  return ok(c, { checklist: await getOnboardingChecklistStatus(c, c.req.param("caseId")) });
});
onboardingRoutes.post("/cases/:caseId/tasks/refresh", requireAnyPermission(["onboarding.tasks.manage"]), async (c) => ok(c, { checklist: await refreshOnboardingChecklist(c, c.req.param("caseId")) }));
onboardingRoutes.get("/cases/:caseId/readiness", requireAnyPermission(["onboarding.activation.view", "onboarding.cases.view", "employees.lifecycle.view", "employees.view"]), async (c) => ok(c, { readiness: await getEmployeeOnboardingReadiness(c, c.req.param("caseId")) }));
onboardingRoutes.post("/cases/:caseId/submit-activation", requireAnyPermission(["onboarding.activation.submit", "onboarding.activation.manage"]), async (c) => ok(c, { submitted: await submitEmployeeActivationForApproval(c, c.req.param("caseId")), approval: await createOnboardingApprovalInstance(c, c.req.param("caseId")) }));
onboardingRoutes.post("/cases/:caseId/approve-activation", requireAnyPermission(["onboarding.activation.approve", "onboarding.activation.manage"]), async (c) => ok(c, { approved: await approveEmployeeActivation(c, c.req.param("caseId")), approval: await syncOnboardingApprovalStatus(c, c.req.param("caseId")) }));
onboardingRoutes.post("/cases/:caseId/activate", requireAnyPermission(["onboarding.activation.activate", "onboarding.activation.manage"]), async (c) => {
  const result = await activateEmployeeFromOnboarding(c, c.req.param("caseId"));
  if (!result) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if ("blocked" in result) return fail(c, 409, "EMPLOYEE_ACTIVATION_NOT_READY", "Employee activation is blocked by onboarding requirements.");
  return ok(c, result);
});
onboardingRoutes.post("/cases/:caseId/activate-with-override", requireAnyPermission(["onboarding.activation.override", "onboarding.activation.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "ONBOARDING_OVERRIDE_REASON_REQUIRED", "Override reason is required.");
  return ok(c, await activateEmployeeWithOnboardingOverride(c, c.req.param("caseId"), reason));
});
onboardingRoutes.get("/cases/:caseId/events", requireAnyPermission(["lifecycle.events.view", "onboarding.cases.view", "employees.lifecycle.view"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE case_type = 'ONBOARDING' AND case_id = ? ORDER BY created_at DESC").bind(c.req.param("caseId")).all();
  return ok(c, { events: rows.results });
});
onboardingRoutes.patch("/tasks/:taskId", requireAnyPermission(["onboarding.tasks.manage", "onboarding.tasks.assign"]), async (c) => {
  const body = await readBody(c);
  const status = optionalText(body.task_status) as TaskStatus | null;
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET task_status = COALESCE(?, task_status), status = COALESCE(?, status), assigned_to_user_id = COALESCE(?, assigned_to_user_id), due_date = COALESCE(?, due_date), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?")
    .bind(status, status ? oldTaskStatus(status) : null, optionalText(body.assigned_to_user_id), optionalText(body.due_date), optionalText(body.notes), nowIso(), c.req.param("taskId")).run();
  return ok(c, { updated: true });
});
onboardingRoutes.post("/tasks/:taskId/complete", requireAnyPermission(["onboarding.tasks.complete", "onboarding.tasks.manage"]), async (c) => { await completeOnboardingTask(c, c.req.param("taskId")); return ok(c, { completed: true }); });
onboardingRoutes.post("/tasks/:taskId/waive", requireAnyPermission(["onboarding.tasks.waive", "onboarding.tasks.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "ONBOARDING_OVERRIDE_REASON_REQUIRED", "Waiver reason is required.");
  await waiveOnboardingTask(c, c.req.param("taskId"), reason);
  return ok(c, { waived: true });
});
onboardingRoutes.post("/tasks/:taskId/reopen", requireAnyPermission(["onboarding.tasks.reopen", "onboarding.tasks.manage"]), async (c) => {
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET status = 'PENDING', task_status = 'NOT_STARTED', completed_at = NULL, waived_at = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), c.req.param("taskId")).run();
  return ok(c, { reopened: true });
});
onboardingRoutes.post("/tasks/:taskId/assign", requireAnyPermission(["onboarding.tasks.assign", "onboarding.tasks.manage"]), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET assigned_to_user_id = ?, assigned_role_id = ?, updated_at = ? WHERE id = ?").bind(optionalText(body.assigned_to_user_id), optionalText(body.assigned_role_id), nowIso(), c.req.param("taskId")).run();
  return ok(c, { assigned: true });
});

offboardingRoutes.get("/settings", requireAnyPermission(["offboarding.settings.view", "offboarding.settings.manage", "settings.view"]), async (c) => ok(c, { settings: await ensureOffboardingSettings(c.env.DB) }));
offboardingRoutes.patch("/settings", requireAnyPermission(["offboarding.settings.update", "offboarding.settings.manage", "settings.manage"]), async (c) => ok(c, { settings: await updateSettings(c, "offboarding_settings", offboardingSettingsFields) }));
offboardingRoutes.get("/cases", requireAnyPermission(["offboarding.cases.view", "offboarding.cases.manage", "employees.view"]), async (c) => ok(c, { cases: await listOffboardingCases(c) }));
offboardingRoutes.get("/dashboard", requireAnyPermission(["offboarding.dashboard.view", "offboarding.cases.view", "dashboard.view"]), async (c) => {
  const cases = await listOffboardingCases(c);
  return ok(c, { dashboard: { total_cases: cases.length, pending_clearance: cases.filter((row) => row.offboarding_status === "WAITING_FOR_CLEARANCE").length, pending_final_settlement: cases.filter((row) => row.offboarding_status === "WAITING_FOR_FINAL_SETTLEMENT").length, pending_access_revocation: cases.filter((row) => row.offboarding_status === "WAITING_FOR_ACCESS_REVOCATION").length, completed_exits: cases.filter((row) => row.offboarding_status === "COMPLETED").length, overdue_cases: cases.filter((row) => row.due_date && String(row.due_date) < new Date().toISOString().slice(0, 10)).length, rows: cases.slice(0, 20) } });
});
offboardingRoutes.get("/cases/:caseId", requireAnyPermission(["offboarding.cases.view", "offboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  return ok(c, { case: gate.row, employee: gate.employee, checklist: await getOffboardingChecklistStatus(c, c.req.param("caseId")), approval: await getOffboardingApprovalSummary(c, c.req.param("caseId")) });
});
offboardingRoutes.patch("/cases/:caseId", requireAnyPermission(["offboarding.cases.update", "offboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET assigned_owner_user_id = COALESCE(?, assigned_owner_user_id), due_date = COALESCE(?, due_date), exit_reason = COALESCE(?, exit_reason), notes = COALESCE(?, notes), updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(optionalText(body.assigned_owner_user_id), optionalText(body.due_date), optionalText(body.exit_reason), optionalText(body.notes), c.get("currentUser").id, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId: c.req.param("caseId"), action: "offboarding.case.updated", previousStatus: String(gate.row.offboarding_status), newStatus: String(gate.row.offboarding_status) });
  return ok(c, { case: (await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "view"))?.row });
});
offboardingRoutes.post("/cases/:caseId/cancel", requireAnyPermission(["offboarding.cases.cancel", "offboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "OFFBOARDING_OVERRIDE_REASON_REQUIRED", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), reason, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId: c.req.param("caseId"), action: "offboarding.case.cancelled", previousStatus: String(gate.row.offboarding_status), newStatus: "CANCELLED", reason });
  return ok(c, { cancelled: true });
});
offboardingRoutes.get("/cases/:caseId/tasks", requireAnyPermission(["offboarding.tasks.view", "offboarding.tasks.manage"]), async (c) => ok(c, { checklist: await getOffboardingChecklistStatus(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/tasks/refresh", requireAnyPermission(["offboarding.tasks.manage"]), async (c) => ok(c, { checklist: await refreshOffboardingChecklist(c, c.req.param("caseId")) }));
offboardingRoutes.get("/cases/:caseId/readiness", requireAnyPermission(["offboarding.finalization.view", "offboarding.cases.view"]), async (c) => ok(c, { readiness: await getEmployeeOffboardingReadiness(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/submit-finalization", requireAnyPermission(["offboarding.finalization.submit", "offboarding.finalization.manage"]), async (c) => ok(c, { submitted: await submitEmployeeExitForApproval(c, c.req.param("caseId")), approval: await createOffboardingApprovalInstance(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/approve-finalization", requireAnyPermission(["offboarding.finalization.approve", "offboarding.finalization.manage"]), async (c) => ok(c, { approved: await approveEmployeeExitFinalization(c, c.req.param("caseId")), approval: await syncOffboardingApprovalStatus(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/finalize-exit", requireAnyPermission(["offboarding.finalization.finalize", "offboarding.finalization.manage"]), async (c) => {
  const result = await finalizeEmployeeExitFromOffboarding(c, c.req.param("caseId"));
  if (!result) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  if ("blocked" in result) return fail(c, 409, "EMPLOYEE_EXIT_NOT_READY", "Employee exit is blocked by offboarding requirements.");
  return ok(c, result);
});
offboardingRoutes.post("/cases/:caseId/finalize-with-override", requireAnyPermission(["offboarding.finalization.override", "offboarding.finalization.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "OFFBOARDING_OVERRIDE_REASON_REQUIRED", "Override reason is required.");
  return ok(c, await finalizeEmployeeExitWithOverride(c, c.req.param("caseId"), reason));
});
offboardingRoutes.get("/cases/:caseId/events", requireAnyPermission(["lifecycle.events.view", "offboarding.cases.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE case_type = 'OFFBOARDING' AND case_id = ? ORDER BY created_at DESC").bind(c.req.param("caseId")).all();
  return ok(c, { events: rows.results });
});
offboardingRoutes.patch("/tasks/:taskId", requireAnyPermission(["offboarding.tasks.manage", "offboarding.tasks.assign"]), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = COALESCE(?, task_status), assigned_to_user_id = COALESCE(?, assigned_to_user_id), due_date = COALESCE(?, due_date), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?")
    .bind(optionalText(body.task_status), optionalText(body.assigned_to_user_id), optionalText(body.due_date), optionalText(body.notes), nowIso(), c.req.param("taskId")).run();
  return ok(c, { updated: true });
});
offboardingRoutes.post("/tasks/:taskId/complete", requireAnyPermission(["offboarding.tasks.complete", "offboarding.tasks.manage"]), async (c) => { await completeOffboardingTask(c, c.req.param("taskId")); return ok(c, { completed: true }); });
offboardingRoutes.post("/tasks/:taskId/waive", requireAnyPermission(["offboarding.tasks.waive", "offboarding.tasks.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "OFFBOARDING_OVERRIDE_REASON_REQUIRED", "Waiver reason is required.");
  await waiveOffboardingTask(c, c.req.param("taskId"), reason);
  return ok(c, { waived: true });
});
offboardingRoutes.post("/tasks/:taskId/reopen", requireAnyPermission(["offboarding.tasks.reopen", "offboarding.tasks.manage"]), async (c) => {
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = 'NOT_STARTED', completed_at = NULL, waived_at = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), c.req.param("taskId")).run();
  return ok(c, { reopened: true });
});
offboardingRoutes.post("/tasks/:taskId/assign", requireAnyPermission(["offboarding.tasks.assign", "offboarding.tasks.manage"]), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET assigned_to_user_id = ?, assigned_role_id = ?, updated_at = ? WHERE id = ?").bind(optionalText(body.assigned_to_user_id), optionalText(body.assigned_role_id), nowIso(), c.req.param("taskId")).run();
  return ok(c, { assigned: true });
});

employeeLifecycleRoutes.post("/:employeeId/onboarding/cases", requireAnyPermission(["onboarding.cases.create", "onboarding.cases.manage", "employees.lifecycle.manage"]), async (c) => {
  const result = await createOnboardingCase(c, c.req.param("employeeId"));
  if (!result) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  if ("disabled" in result) return fail(c, 403, "ONBOARDING_DISABLED", "Onboarding workflow is disabled.");
  if ("duplicate" in result) {
    const duplicateIssues = validateDuplicateConflict(result, "employee_id", "This employee already has an active onboarding case.");
    if (hasValidationErrors(duplicateIssues)) return validationResponse(c, duplicateIssues, 409);
  }
  return ok(c, { case_id: result.id }, 201);
});
employeeLifecycleRoutes.get("/:employeeId/onboarding", requireAnyPermission(["onboarding.cases.view", "employees.lifecycle.view", "employees.view"]), async (c) => {
  const summary = await lifecycleSummary(c, c.req.param("employeeId"));
  if (!summary) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  return ok(c, { onboarding: summary.onboarding, tasks: summary.onboarding_tasks });
});
employeeLifecycleRoutes.post("/:employeeId/offboarding/cases", requireAnyPermission(["offboarding.cases.create", "offboarding.cases.manage", "employees.lifecycle.manage"]), async (c) => {
  const body = await readBody(c);
  const dateIssues = validateDateRange({
    start: optionalText(body.exit_notice_date),
    end: optionalText(body.last_working_day) ?? new Date().toISOString().slice(0, 10),
    startField: "exit_notice_date",
    endField: "last_working_day",
    label: "Last working day"
  });
  if (hasValidationErrors(dateIssues)) return validationResponse(c, dateIssues);
  const result = await createOffboardingCase(c, c.req.param("employeeId"), body);
  if (!result) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  if ("disabled" in result) return fail(c, 403, "OFFBOARDING_DISABLED", "Offboarding workflow is disabled.");
  if ("duplicate" in result) {
    const duplicateIssues = validateDuplicateConflict(result, "employee_id", "This employee already has an active offboarding case.");
    if (hasValidationErrors(duplicateIssues)) return validationResponse(c, duplicateIssues, 409);
  }
  if ("invalid" in result) return fail(c, 400, "EMPLOYEE_EXIT_NOT_READY", "Exit type is invalid.");
  return ok(c, { case_id: result.id }, 201);
});
employeeLifecycleRoutes.get("/:employeeId/lifecycle-events", requireAnyPermission(["lifecycle.events.view", "employees.lifecycle.view"]), async (c) => {
  const summary = await lifecycleSummary(c, c.req.param("employeeId"));
  if (!summary) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  return ok(c, { events: summary.events });
});
employeeLifecycleRoutes.get("/:employeeId/lifecycle-summary", requireAnyPermission(["employees.lifecycle.view", "employees.view"]), async (c) => {
  const summary = await lifecycleSummary(c, c.req.param("employeeId"));
  if (!summary) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  return ok(c, { summary });
});

selfServiceLifecycleRoutes.get("/onboarding", requireAnyPermission(["self_service.onboarding.view", "self_service.view"]), async (c) => {
  const user: AuthUser = c.get("currentUser");
  if (!user.employee_id) return ok(c, { onboarding: null, tasks: [], events: [] });
  const settings = await ensureOnboardingSettings(c.env.DB);
  if (settings?.employee_self_service_onboarding_view_enabled === 0) return fail(c, 403, "LIFECYCLE_PERMISSION_DENIED", "Self-service onboarding view is disabled.");
  const summary = await lifecycleSummary(c, user.employee_id);
  return ok(c, { onboarding: summary?.onboarding ?? null, tasks: summary?.onboarding_tasks ?? [], events: summary?.events ?? [] });
});
selfServiceLifecycleRoutes.get("/offboarding", requireAnyPermission(["self_service.offboarding.view", "self_service.view"]), async (c) => {
  const user: AuthUser = c.get("currentUser");
  if (!user.employee_id) return ok(c, { offboarding: null, tasks: [], events: [] });
  const settings = await ensureOffboardingSettings(c.env.DB);
  if (settings?.employee_self_service_offboarding_view_enabled === 0) return fail(c, 403, "LIFECYCLE_PERMISSION_DENIED", "Self-service offboarding view is disabled.");
  const summary = await lifecycleSummary(c, user.employee_id);
  return ok(c, { offboarding: summary?.offboarding ?? null, tasks: summary?.offboarding_tasks ?? [], events: summary?.events ?? [] });
});

lifecycleRoutes.get("/dashboard", requireAnyPermission(["onboarding.dashboard.view", "offboarding.dashboard.view", "employees.lifecycle.view", "dashboard.view"]), async (c) => {
  const [onboardingCases, offboardingCases] = await Promise.all([listOnboardingCases(c), listOffboardingCases(c)]);
  return ok(c, {
    dashboard: {
      onboarding_total: onboardingCases.length,
      onboarding_blocked: onboardingCases.filter((row) => row.onboarding_status === "BLOCKED").length,
      onboarding_ready_for_activation: onboardingCases.filter((row) => row.activation_status === "READY" || row.activation_status === "APPROVED").length,
      offboarding_total: offboardingCases.length,
      offboarding_pending_clearance: offboardingCases.filter((row) => row.offboarding_status === "WAITING_FOR_CLEARANCE").length,
      offboarding_pending_finalization: offboardingCases.filter((row) => row.finalization_status === "READY" || row.finalization_status === "APPROVED").length,
      recent_onboarding: onboardingCases.slice(0, 10),
      recent_offboarding: offboardingCases.slice(0, 10)
    }
  });
});

lifecycleRoutes.get("/events", requireAnyPermission(["lifecycle.events.view", "employees.lifecycle.view"]), async (c) => {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "employees", "view", "e");
  const rows = await c.env.DB.prepare(
    `SELECT ev.*, e.employee_no, e.full_name AS employee_name
     FROM employee_lifecycle_events ev
     JOIN employees e ON e.id = ev.employee_id
     ${where([scope.sql])}
     ORDER BY ev.created_at DESC
     LIMIT 100`
  ).bind(...scope.params).all();
  return ok(c, { events: rows.results });
});
