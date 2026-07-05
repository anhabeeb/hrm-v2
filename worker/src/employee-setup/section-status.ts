import { isOperationalModuleEnabled } from "../utils/module-enforcement";
import { nowIso } from "../utils/http";
import {
  EMPLOYEE_SETUP_SECTION_DEFINITIONS,
  employeeSetupSectionDefinitionByKey,
  getEmployeeSetupSectionRegistry,
  isEmployeeSetupSectionModuleEnabled,
  type EmployeeSetupSectionDefinition,
  type EmployeeSetupSectionStatusValue
} from "./section-registry";

export type EmployeeSetupSectionStatusInput = {
  employee_id: string;
  company_id?: string | null;
  source_case_id?: string | null;
  section_key: string;
  section_label: string;
  status: EmployeeSetupSectionStatusValue;
  is_required?: boolean;
  is_complete?: boolean;
  is_verified?: boolean;
  is_stale?: boolean;
  status_reason_code?: string | null;
  status_message?: string | null;
  next_action?: string | null;
  missing_fields?: unknown;
  blockers?: unknown;
  field_status?: unknown;
  source_version?: string | null;
  source_hash?: string | null;
  last_saved_at?: string | null;
  last_evaluated_at?: string | null;
  last_verified_at?: string | null;
  updated_by_user_id?: string | null;
};

export type EmployeeSetupSectionStatusRow = {
  id: string;
  employee_id: string;
  company_id: string | null;
  source_case_id: string | null;
  section_key: string;
  section_label: string;
  status: EmployeeSetupSectionStatusValue;
  is_required: number;
  is_complete: number;
  is_verified: number;
  is_stale: number;
  status_reason_code: string | null;
  status_message: string | null;
  next_action: string | null;
  missing_fields_json: string | null;
  blockers_json: string | null;
  field_status_json: string | null;
  source_version: string | null;
  source_hash: string | null;
  last_saved_at: string | null;
  last_evaluated_at: string | null;
  last_verified_at: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type EvaluationContext = {
  db: D1Database;
  employeeId: string;
  actorUserId?: string | null;
  employee: Record<string, unknown>;
  settings: Record<string, unknown> | null;
  moduleStatuses: Record<string, boolean>;
  definitions: EmployeeSetupSectionDefinition[];
  sourceCaseId?: string | null;
};

export type EmployeeSetupSectionEvaluation = {
  section_key: string;
  section_label: string;
  status: EmployeeSetupSectionStatusValue;
  is_required: boolean;
  is_complete: boolean;
  is_verified?: boolean;
  missing_fields?: string[];
  blockers?: Array<Record<string, unknown>>;
  field_status?: Record<string, unknown>;
  status_reason_code?: string | null;
  status_message?: string | null;
  next_action?: string | null;
};

const EMPLOYEE_SETUP_SECTION_STATUS_COLUMNS = `
  id, employee_id, company_id, source_case_id, section_key, section_label, status,
  is_required, is_complete, is_verified, is_stale, status_reason_code,
  status_message, next_action, missing_fields_json, blockers_json,
  field_status_json, source_version, source_hash, last_saved_at,
  last_evaluated_at, last_verified_at, updated_by_user_id, created_at, updated_at
`;

function bool(value: unknown, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

function boolInt(value: unknown) {
  return value === true || value === 1 ? 1 : 0;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function safeJson(value: unknown) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify(null);
  }
}

function parseStatusJsonArray(value: string | null | undefined) {
  if (!value) return [] as unknown[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStatusJsonObject(value: string | null | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stableStatusId(employeeId: string, sectionKey: string) {
  return `employee_setup_section_${employeeId}_${sectionKey}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

export async function ensureEmployeeSetupSectionStatusesSchema(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS employee_setup_section_statuses (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      company_id TEXT,
      source_case_id TEXT,
      section_key TEXT NOT NULL,
      section_label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('not_started', 'incomplete', 'complete', 'blocked', 'not_required', 'failed', 'stale', 'verified')),
      is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
      is_complete INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0, 1)),
      is_verified INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
      is_stale INTEGER NOT NULL DEFAULT 0 CHECK (is_stale IN (0, 1)),
      status_reason_code TEXT,
      status_message TEXT,
      next_action TEXT,
      missing_fields_json TEXT,
      blockers_json TEXT,
      field_status_json TEXT,
      source_version TEXT,
      source_hash TEXT,
      last_saved_at TEXT,
      last_evaluated_at TEXT,
      last_verified_at TEXT,
      updated_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (employee_id, section_key)
    )
  `).run();
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employee_setup_section_statuses_employee ON employee_setup_section_statuses(employee_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employee_setup_section_statuses_company ON employee_setup_section_statuses(company_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employee_setup_section_statuses_status ON employee_setup_section_statuses(status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employee_setup_section_statuses_employee_status ON employee_setup_section_statuses(employee_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employee_setup_section_statuses_employee_required_complete ON employee_setup_section_statuses(employee_id, is_required, is_complete)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employee_setup_section_statuses_employee_stale ON employee_setup_section_statuses(employee_id, is_stale)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_employee_setup_section_statuses_source_case ON employee_setup_section_statuses(source_case_id)")
  ]);
}

async function getOnboardingSettings(db: D1Database) {
  return db.prepare("SELECT * FROM onboarding_settings WHERE id = 'onboarding_settings_default'").first<Record<string, unknown>>();
}

async function getEmployeeSetupModuleStatuses(db: D1Database) {
  const keys = [
    "employees",
    "contracts",
    "documents",
    "document_compliance",
    "payroll",
    "payment_methods",
    "payment_institutions",
    "pension",
    "attendance",
    "roster",
    "assets_uniforms",
    "self_service",
    "approvals"
  ];
  const entries = await Promise.all(keys.map(async (key) => [key, await isOperationalModuleEnabled(db, key)] as const));
  return Object.fromEntries(entries) as Record<string, boolean>;
}

async function getEmployeeSetupContextEmployee(db: D1Database, employeeId: string) {
  return db.prepare(`
    SELECT
      e.id AS employee_id,
      e.id,
      e.employee_no,
      e.full_name,
      e.employee_type,
      e.employment_type,
      e.primary_department_id,
      e.primary_location_id,
      e.primary_position_id,
      e.job_level_id,
      e.reporting_manager_employee_id,
      e.joining_date,
      e.user_id,
      e.payroll_included,
      e.roster_eligible,
      es.key AS status_key,
      oc.id AS source_case_id
    FROM employees e
    LEFT JOIN employee_statuses es ON es.id = e.status_id
    LEFT JOIN employee_onboarding_cases oc
      ON oc.employee_id = e.id
     AND oc.onboarding_status != 'CANCELLED'
     AND oc.activation_status != 'ACTIVATED'
    WHERE e.id = ? AND e.archived_at IS NULL
    ORDER BY oc.created_at DESC
    LIMIT 1
  `).bind(employeeId).first<Record<string, unknown>>();
}

export async function getEmployeeSetupSectionDefinitions(db: D1Database, employeeId?: string) {
  const [settings, moduleStatuses, employee] = await Promise.all([
    getOnboardingSettings(db),
    getEmployeeSetupModuleStatuses(db),
    employeeId ? getEmployeeSetupContextEmployee(db, employeeId) : Promise.resolve(null)
  ]);
  return getEmployeeSetupSectionRegistry({ settings, moduleStatuses, employee });
}

function missingEmployeeFields(employee: Record<string, unknown>, fields: string[]) {
  return fields.filter((field) => !text(employee[field]));
}

function enabledStatus(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  return isEmployeeSetupSectionModuleEnabled(definition, context.moduleStatuses);
}

function notRequired(definition: EmployeeSetupSectionDefinition, message: string): EmployeeSetupSectionEvaluation {
  return {
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: "not_required",
    is_required: false,
    is_complete: true,
    status_reason_code: "SECTION_NOT_REQUIRED",
    status_message: message,
    next_action: null,
    missing_fields: [],
    blockers: [],
    field_status: {}
  };
}

function complete(definition: EmployeeSetupSectionDefinition, message: string, fieldStatus: Record<string, unknown> = {}): EmployeeSetupSectionEvaluation {
  return {
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: "complete",
    is_required: definition.default_required,
    is_complete: true,
    status_reason_code: "SECTION_COMPLETE",
    status_message: message,
    missing_fields: [],
    blockers: [],
    field_status: fieldStatus
  };
}

function blocked(definition: EmployeeSetupSectionDefinition, missingFields: string[], message: string, fieldStatus: Record<string, unknown> = {}): EmployeeSetupSectionEvaluation {
  return {
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: missingFields.length ? "blocked" : "incomplete",
    is_required: true,
    is_complete: false,
    status_reason_code: missingFields.length ? "REQUIRED_SETUP_MISSING" : "SECTION_INCOMPLETE",
    status_message: message,
    next_action: `Complete ${definition.section_label}.`,
    missing_fields: missingFields,
    blockers: [{ type: "SECTION_BLOCKED", message, missing_fields: missingFields }],
    field_status: fieldStatus
  };
}

function toStatusInput(context: EvaluationContext, evaluation: EmployeeSetupSectionEvaluation): EmployeeSetupSectionStatusInput {
  return {
    employee_id: context.employeeId,
    company_id: null,
    source_case_id: context.sourceCaseId ?? (text(context.employee.source_case_id) || null),
    section_key: evaluation.section_key,
    section_label: evaluation.section_label,
    status: evaluation.status,
    is_required: evaluation.is_required,
    is_complete: evaluation.is_complete,
    is_verified: Boolean(evaluation.is_verified),
    is_stale: false,
    status_reason_code: evaluation.status_reason_code ?? null,
    status_message: evaluation.status_message ?? null,
    next_action: evaluation.next_action ?? null,
    missing_fields: evaluation.missing_fields ?? [],
    blockers: evaluation.blockers ?? [],
    field_status: evaluation.field_status ?? {},
    source_version: "employee360-setup-phase1",
    last_evaluated_at: nowIso(),
    updated_by_user_id: context.actorUserId ?? null
  };
}

async function evaluateProfileInformation(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  const missing = missingEmployeeFields(context.employee, ["employee_no", "full_name", "employee_type", "employment_type", "joining_date"]);
  if (missing.length) return blocked(definition, missing, "Required employee identity fields are missing.", Object.fromEntries(missing.map((field) => [field, "missing"])));
  return complete(definition, "Profile information is complete.", { full_name: "complete", joining_date: "complete" });
}

async function evaluateContactEmergency(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!definition.default_required) return notRequired(definition, "Contact and emergency details are optional for employee setup.");
  const count = await context.db.prepare("SELECT COUNT(*) AS total FROM employee_contacts WHERE employee_id = ? AND archived_at IS NULL").bind(context.employeeId).first<{ total: number }>();
  if (Number(count?.total ?? 0) > 0) return complete(definition, "Contact information is available.");
  return blocked(definition, ["employee_contacts"], "Required contact or emergency contact details are missing.");
}

async function evaluateJobAssignment(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  const settings = context.settings ?? {};
  const fields = [
    bool(settings.require_department_before_activation, true) ? "primary_department_id" : null,
    bool(settings.require_worksite_location_before_activation, true) ? "primary_location_id" : null,
    "primary_position_id",
    "job_level_id",
    bool(settings.require_reporting_manager_before_activation, false) ? "reporting_manager_employee_id" : null,
    "joining_date"
  ].filter(Boolean) as string[];
  const missing = missingEmployeeFields(context.employee, fields);
  if (missing.length) return blocked(definition, missing, "Required job assignment fields are missing.", Object.fromEntries(missing.map((field) => [field, "missing"])));

  const departmentId = text(context.employee.primary_department_id);
  const locationId = text(context.employee.primary_location_id);
  const positionId = text(context.employee.primary_position_id);
  const jobLevelId = text(context.employee.job_level_id);
  const invalid: string[] = [];
  if (departmentId && !(await context.db.prepare("SELECT id FROM departments WHERE id = ? AND is_active = 1").bind(departmentId).first())) invalid.push("primary_department_id");
  if (locationId && !(await context.db.prepare("SELECT id FROM locations WHERE id = ? AND is_active = 1").bind(locationId).first())) invalid.push("primary_location_id");
  if (jobLevelId && !(await context.db.prepare("SELECT id FROM job_levels WHERE id = ? AND is_active = 1").bind(jobLevelId).first())) invalid.push("job_level_id");
  if (positionId) {
    const position = await context.db.prepare("SELECT id, department_id, level_id FROM positions WHERE id = ? AND is_active = 1").bind(positionId).first<{ id: string; department_id: string | null; level_id: string | null }>();
    if (!position) {
      invalid.push("primary_position_id");
    } else {
      if (departmentId && position.department_id && position.department_id !== departmentId) invalid.push("position_department_mismatch");
      if (jobLevelId && position.level_id && position.level_id !== jobLevelId) invalid.push("position_job_level_mismatch");
    }
  }
  if (invalid.length) return blocked(definition, invalid, "Selected job assignment values are inactive, missing, or mismatched.", Object.fromEntries(invalid.map((field) => [field, "invalid"])));
  return complete(definition, "Job assignment is complete.");
}

async function evaluateDocuments(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Documents or Document Compliance is disabled.");
  if (!definition.default_required) return notRequired(definition, "Required document checks are optional for this employee setup.");
  const employee = context.employee;
  const rules = await context.db.prepare(`
    SELECT rr.id, rr.document_type_id, dt.name AS document_type_name, dt.code AS document_type_code
      FROM document_required_rules rr
      INNER JOIN document_types dt ON dt.id = rr.document_type_id
     WHERE rr.is_active = 1
       AND rr.is_required = 1
       AND dt.is_active = 1
       AND (rr.employee_type IS NULL OR rr.employee_type = ?)
       AND (rr.employment_type IS NULL OR rr.employment_type = ?)
       AND (rr.department_id IS NULL OR rr.department_id = ?)
       AND (rr.position_id IS NULL OR rr.position_id = ?)
       AND (rr.location_id IS NULL OR rr.location_id = ?)
     ORDER BY rr.rule_priority, dt.name
     LIMIT 100
  `).bind(
    text(employee.employee_type) || null,
    text(employee.employment_type) || null,
    text(employee.primary_department_id) || null,
    text(employee.primary_position_id) || null,
    text(employee.primary_location_id) || null
  ).all<Record<string, unknown>>();
  if (!rules.results.length) return notRequired(definition, "No active required document rules match this employee.");
  const typeIds = Array.from(new Set(rules.results.map((row) => text(row.document_type_id)).filter(Boolean)));
  const placeholders = typeIds.map(() => "?").join(", ");
  const docs = placeholders
    ? await context.db.prepare(`SELECT document_type_id FROM employee_documents WHERE employee_id = ? AND status = 'ACTIVE' AND document_type_id IN (${placeholders})`).bind(context.employeeId, ...typeIds).all<{ document_type_id: string }>()
    : { results: [] };
  const uploaded = new Set(docs.results.map((row) => row.document_type_id));
  const missingRules = rules.results.filter((row) => !uploaded.has(text(row.document_type_id)));
  if (missingRules.length) {
    return blocked(
      definition,
      missingRules.map((row) => `document:${text(row.document_type_code) || text(row.document_type_id)}`),
      "Required employee documents are missing.",
      { missing_document_count: missingRules.length, required_document_count: rules.results.length }
    );
  }
  return complete(definition, "All matching required document rules are satisfied.", { required_document_count: rules.results.length });
}

async function evaluateContract(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Contracts are disabled.");
  if (!definition.default_required) return notRequired(definition, "Contract setup is optional for this employee setup.");
  const contract = await context.db.prepare(`
    SELECT id, contract_type_id, contract_start_date, contract_end_date, status
      FROM employee_contracts
     WHERE employee_id = ? AND status IN ('ACTIVE', 'EXPIRING_SOON')
     ORDER BY effective_date DESC, created_at DESC
     LIMIT 1
  `).bind(context.employeeId).first<Record<string, unknown>>();
  if (!contract) return blocked(definition, ["employee_contract"], "A required active employment contract is missing.");
  return complete(definition, "Required contract setup is complete.", { contract_status: contract.status });
}

async function evaluatePayrollProfile(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Payroll is disabled.");
  if (!bool(context.employee.payroll_included, true) && !definition.default_required) return notRequired(definition, "Employee is not currently included in payroll.");
  if (!definition.default_required) return notRequired(definition, "Payroll profile is optional for this employee setup.");
  const profile = await context.db.prepare("SELECT id, payroll_included, basic_salary, payment_method FROM employee_payroll_profiles WHERE employee_id = ? LIMIT 1").bind(context.employeeId).first<Record<string, unknown>>();
  if (!profile) return blocked(definition, ["employee_payroll_profile"], "Payroll profile is required.");
  return complete(definition, "Payroll profile is complete.", { payroll_profile_id: profile.id });
}

async function evaluatePaymentMethod(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Payment methods are disabled or Payroll is disabled.");
  if (!definition.default_required) return notRequired(definition, "Payment method setup is optional for this employee setup.");
  const method = await context.db.prepare(`
    SELECT epm.id, epm.payment_method_type, epm.payment_institution_id, epm.bank_account_name,
           epm.bank_account_number_encrypted_or_plain_placeholder, pi.id AS active_bank_id
      FROM employee_payment_methods epm
      LEFT JOIN payment_institutions pi ON pi.id = epm.payment_institution_id AND pi.is_active = 1 AND pi.status = 'ACTIVE' AND pi.type = 'BANK'
     WHERE epm.employee_id = ? AND epm.status = 'ACTIVE'
     ORDER BY epm.is_primary DESC, epm.created_at DESC
     LIMIT 1
  `).bind(context.employeeId).first<Record<string, unknown>>();
  if (!method) return blocked(definition, ["payment_method"], "Payment method is required.");
  const methodType = text(method.payment_method_type).toUpperCase();
  if (methodType === "CASH") return complete(definition, "Cash payment method is complete.", { payment_method_type: "CASH", payment_institution: "not_required" });
  if (methodType === "BANK_TRANSFER") {
    const missing = [
      context.moduleStatuses.payment_institutions === false || !text(method.active_bank_id) ? "payment_institution_id" : null,
      !text(method.bank_account_name) ? "bank_account_name" : null,
      !text(method.bank_account_number_encrypted_or_plain_placeholder) ? "bank_account_number" : null
    ].filter(Boolean) as string[];
    if (missing.length) return blocked(definition, missing, "Bank Transfer requires an active bank/payment institution, account name, and account number.", Object.fromEntries(missing.map((field) => [field, "missing"])));
  }
  return complete(definition, "Payment method is complete.", { payment_method_type: methodType });
}

async function evaluatePension(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Pension is disabled or Payroll is disabled.");
  if (!definition.default_required) return notRequired(definition, "Pension setup is optional for this employee setup.");
  const profile = await context.db.prepare("SELECT id, enrollment_status, status FROM employee_pension_profiles WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY effective_date DESC LIMIT 1").bind(context.employeeId).first<Record<string, unknown>>();
  if (!profile) return blocked(definition, ["employee_pension_profile"], "Pension profile is required.");
  return complete(definition, "Pension profile is complete.", { enrollment_status: profile.enrollment_status });
}

async function evaluateUserAccess(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Self-service/user access is disabled.");
  if (!definition.default_required) return notRequired(definition, "User access setup is optional for this employee setup.");
  const userId = text(context.employee.user_id);
  if (userId) {
    const user = await context.db.prepare("SELECT id, status FROM users WHERE id = ? LIMIT 1").bind(userId).first<{ id: string; status: string }>();
    if (!user || user.status !== "ACTIVE") return blocked(definition, ["user_id"], "Linked user account must be active.");
    const roles = await context.db.prepare("SELECT COUNT(*) AS total FROM user_roles WHERE user_id = ?").bind(userId).first<{ total: number }>();
    if (Number(roles?.total ?? 0) === 0) return blocked(definition, ["user_roles"], "Linked user account must have at least one role.");
    return complete(definition, "Linked user account is available.");
  }
  return blocked(definition, ["user_id"], "User account linkage is required.");
}

async function evaluateAttendanceRoster(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context) || (context.moduleStatuses.attendance === false && context.moduleStatuses.roster === false)) {
    return notRequired(definition, "Attendance and Roster setup is disabled or not required.");
  }
  if (!definition.default_required) return notRequired(definition, "Attendance/Roster setup is optional for this employee setup.");
  const missing = [
    !text(context.employee.joining_date) ? "joining_date" : null,
    bool(context.settings?.require_roster_eligibility_before_activation, false) && !bool(context.employee.roster_eligible, true) ? "roster_eligible" : null
  ].filter(Boolean) as string[];
  if (bool(context.settings?.require_biometric_mapping_before_activation, false)) {
    const mapping = await context.db.prepare("SELECT COUNT(*) AS total FROM employee_biometric_mappings WHERE employee_id = ? AND status = 'ACTIVE'").bind(context.employeeId).first<{ total: number }>();
    if (Number(mapping?.total ?? 0) === 0) missing.push("biometric_mapping");
  }
  if (missing.length) return blocked(definition, missing, "Required attendance or roster setup is missing.");
  return complete(definition, "Attendance/Roster setup is complete or not required.");
}

async function evaluateAssetsUniforms(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Assets & Uniforms are disabled.");
  if (!definition.default_required) return notRequired(definition, "Asset and uniform issue is optional for this employee setup.");
  const issued = await context.db.prepare("SELECT COUNT(*) AS total FROM employee_asset_assignments WHERE employee_id = ? AND status = 'ISSUED'").bind(context.employeeId).first<{ total: number }>();
  if (Number(issued?.total ?? 0) === 0) return blocked(definition, ["asset_uniform_assignment"], "Required asset or uniform issue is missing.");
  return complete(definition, "Asset or uniform issue is complete.", { issued_items: Number(issued?.total ?? 0) });
}

async function evaluateApprovalTasks(definition: EmployeeSetupSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Approvals are disabled.");
  if (!definition.default_required) return notRequired(definition, "Approval tasks are optional for this employee setup.");
  const tasks = await context.db.prepare(`
    SELECT task_key, task_status, status, is_required
      FROM employee_onboarding_tasks
     WHERE employee_id = ? AND is_required = 1
     LIMIT 100
  `).bind(context.employeeId).all<Record<string, unknown>>();
  const blocking = tasks.results.filter((task) => !["COMPLETED", "WAIVED", "NOT_REQUIRED"].includes(text(task.task_status || task.status).toUpperCase()));
  if (blocking.length) return blocked(definition, blocking.map((task) => text(task.task_key) || "task"), "Required setup tasks or approvals are still pending.", { pending_task_count: blocking.length });
  return complete(definition, "Required setup tasks and approvals are complete.", { required_task_count: tasks.results.length });
}

async function evaluateFinalVerification(definition: EmployeeSetupSectionDefinition) {
  return blocked(
    definition,
    ["final_server_verification"],
    "Final server verification has not run in the Employee 360 setup foundation yet.",
    { final_verification_required: true, shadow_only: true }
  );
}

const evaluators: Record<string, (definition: EmployeeSetupSectionDefinition, context: EvaluationContext) => Promise<EmployeeSetupSectionEvaluation>> = {
  profile_information: evaluateProfileInformation,
  contact_emergency: evaluateContactEmergency,
  job_assignment: evaluateJobAssignment,
  documents: evaluateDocuments,
  contract: evaluateContract,
  payroll_profile: evaluatePayrollProfile,
  payment_method: evaluatePaymentMethod,
  pension: evaluatePension,
  user_access: evaluateUserAccess,
  attendance_roster: evaluateAttendanceRoster,
  assets_uniforms: evaluateAssetsUniforms,
  approval_tasks: evaluateApprovalTasks,
  final_verification: evaluateFinalVerification
};

export function sanitizeEmployeeSetupStatusError(error: unknown, sectionKey = "readiness") {
  const definition = employeeSetupSectionDefinitionByKey(sectionKey);
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const safe = raw
    .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "The database check could not be completed")
    .replace(/\bSELECT\b[\s\S]*/gi, "The section check could not be completed")
    .replace(/stack trace[\s\S]*/gi, "The section check could not be completed")
    .replace(/password|token|secret|document number|account number|bank account|payroll amount/gi, "sensitive value")
    .slice(0, 220);
  const label = definition?.section_label ?? sectionKey.replace(/_/g, " ");
  return {
    error_code: "EMPLOYEE_SETUP_SECTION_FAILED",
    error_message: `${label} could not be checked safely.`,
    failed_section_key: sectionKey,
    failed_section_label: label,
    next_action: `Review the ${label} setup and rebuild the Employee 360 setup readiness preview.`,
    safe_log_message: safe || "The section check could not be completed."
  };
}

export async function safeEvaluateEmployeeSetupSection(definition: EmployeeSetupSectionDefinition, context: EvaluationContext): Promise<EmployeeSetupSectionStatusInput> {
  try {
    if (!enabledStatus(definition, context)) {
      return toStatusInput(context, notRequired(definition, `${definition.section_label} is not required because its module or submodule is disabled.`));
    }
    const evaluator = evaluators[definition.section_key];
    const result = evaluator ? await evaluator(definition, context) : notRequired(definition, "No evaluator is configured for this optional section.");
    return toStatusInput(context, result);
  } catch (error) {
    const safe = sanitizeEmployeeSetupStatusError(error, definition.section_key);
    return toStatusInput(context, {
      section_key: definition.section_key,
      section_label: definition.section_label,
      status: "failed",
      is_required: definition.default_required,
      is_complete: false,
      missing_fields: [],
      blockers: [{
        type: safe.error_code,
        message: safe.error_message,
        next_action: safe.next_action
      }],
      field_status: {},
      status_reason_code: safe.error_code,
      status_message: safe.error_message,
      next_action: safe.next_action
    });
  }
}

export async function createEmployeeSetupEvaluationContext(db: D1Database, employeeId: string, actorUserId?: string | null) {
  const [employee, settings, moduleStatuses] = await Promise.all([
    getEmployeeSetupContextEmployee(db, employeeId),
    getOnboardingSettings(db),
    getEmployeeSetupModuleStatuses(db)
  ]);
  if (!employee) throw new Error("Employee was not found.");
  const definitions = getEmployeeSetupSectionRegistry({ settings, moduleStatuses, employee });
  return {
    definitions,
    context: {
      db,
      employeeId,
      actorUserId,
      employee,
      settings,
      moduleStatuses,
      definitions,
      sourceCaseId: text(employee.source_case_id) || null
    } satisfies EvaluationContext
  };
}

export async function upsertEmployeeSetupSectionStatus(db: D1Database, input: EmployeeSetupSectionStatusInput) {
  await ensureEmployeeSetupSectionStatusesSchema(db);
  const now = nowIso();
  const isComplete = input.is_complete ?? (input.status === "complete" || input.status === "verified" || input.status === "not_required");
  const isVerified = input.is_verified ?? input.status === "verified";
  const isStale = input.is_stale ?? input.status === "stale";
  const isRequired = input.is_required ?? input.status !== "not_required";
  await db.prepare(`
    INSERT INTO employee_setup_section_statuses
      (id, employee_id, company_id, source_case_id, section_key, section_label, status,
       is_required, is_complete, is_verified, is_stale, status_reason_code,
       status_message, next_action, missing_fields_json, blockers_json,
       field_status_json, source_version, source_hash, last_saved_at,
       last_evaluated_at, last_verified_at, updated_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, section_key) DO UPDATE SET
      company_id = excluded.company_id,
      source_case_id = excluded.source_case_id,
      section_label = excluded.section_label,
      status = excluded.status,
      is_required = excluded.is_required,
      is_complete = excluded.is_complete,
      is_verified = excluded.is_verified,
      is_stale = excluded.is_stale,
      status_reason_code = excluded.status_reason_code,
      status_message = excluded.status_message,
      next_action = excluded.next_action,
      missing_fields_json = excluded.missing_fields_json,
      blockers_json = excluded.blockers_json,
      field_status_json = excluded.field_status_json,
      source_version = excluded.source_version,
      source_hash = excluded.source_hash,
      last_saved_at = COALESCE(excluded.last_saved_at, employee_setup_section_statuses.last_saved_at),
      last_evaluated_at = excluded.last_evaluated_at,
      last_verified_at = COALESCE(excluded.last_verified_at, employee_setup_section_statuses.last_verified_at),
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = excluded.updated_at
  `).bind(
    stableStatusId(input.employee_id, input.section_key),
    input.employee_id,
    input.company_id ?? null,
    input.source_case_id ?? null,
    input.section_key,
    input.section_label,
    input.status,
    boolInt(isRequired),
    boolInt(isComplete),
    boolInt(isVerified),
    boolInt(isStale),
    input.status_reason_code ?? null,
    input.status_message ?? null,
    input.next_action ?? null,
    safeJson(input.missing_fields ?? []),
    safeJson(input.blockers ?? []),
    safeJson(input.field_status ?? {}),
    input.source_version ?? "employee360-setup-phase1",
    input.source_hash ?? null,
    input.last_saved_at ?? null,
    input.last_evaluated_at ?? now,
    input.last_verified_at ?? null,
    input.updated_by_user_id ?? null,
    now,
    now
  ).run();
}

export async function getEmployeeSetupSectionStatuses(db: D1Database, employeeId: string) {
  await ensureEmployeeSetupSectionStatusesSchema(db);
  const rows = await db.prepare(`
    SELECT ${EMPLOYEE_SETUP_SECTION_STATUS_COLUMNS}
      FROM employee_setup_section_statuses
     WHERE employee_id = ?
     ORDER BY section_key
     LIMIT 50
  `).bind(employeeId).all<EmployeeSetupSectionStatusRow>();
  const order = new Map(EMPLOYEE_SETUP_SECTION_DEFINITIONS.map((definition) => [definition.section_key, definition.display_order]));
  return rows.results.sort((a, b) => (order.get(a.section_key) ?? 999) - (order.get(b.section_key) ?? 999));
}

function statusForMissingDefinition(definition: EmployeeSetupSectionDefinition, employeeId: string): EmployeeSetupSectionStatusRow {
  const now = nowIso();
  const required = definition.default_required ? 1 : 0;
  return {
    id: stableStatusId(employeeId, definition.section_key),
    employee_id: employeeId,
    company_id: null,
    source_case_id: null,
    section_key: definition.section_key,
    section_label: definition.section_label,
    status: required ? "not_started" : "not_required",
    is_required: required,
    is_complete: required ? 0 : 1,
    is_verified: 0,
    is_stale: 0,
    status_reason_code: required ? "SECTION_NOT_EVALUATED" : "SECTION_NOT_REQUIRED",
    status_message: required ? "This section has not been checked in Employee 360 setup readiness yet." : "This section is not required for employee setup.",
    next_action: required ? "Rebuild Employee 360 setup readiness." : null,
    missing_fields_json: "[]",
    blockers_json: required ? JSON.stringify([{ type: "SECTION_NOT_EVALUATED", message: "This section has not been evaluated yet." }]) : "[]",
    field_status_json: "{}",
    source_version: "employee360-setup-phase1",
    source_hash: null,
    last_saved_at: null,
    last_evaluated_at: null,
    last_verified_at: null,
    updated_by_user_id: null,
    created_at: now,
    updated_at: now
  };
}

export function composeEmployeeSetupSectionStatusRows(definitions: EmployeeSetupSectionDefinition[], rows: EmployeeSetupSectionStatusRow[], employeeId: string) {
  const byKey = new Map(rows.map((row) => [row.section_key, row]));
  return definitions.map((definition) => byKey.get(definition.section_key) ?? statusForMissingDefinition(definition, employeeId));
}

export function serializeEmployeeSetupSectionStatus(row: EmployeeSetupSectionStatusRow) {
  return {
    section_key: row.section_key,
    section_label: row.section_label,
    status: row.status,
    is_required: row.is_required === 1,
    is_complete: row.is_complete === 1,
    is_verified: row.is_verified === 1,
    is_stale: row.is_stale === 1,
    status_reason_code: row.status_reason_code,
    status_message: row.status_message,
    next_action: row.next_action,
    missing_fields: parseStatusJsonArray(row.missing_fields_json),
    blockers: parseStatusJsonArray(row.blockers_json),
    field_status: parseStatusJsonObject(row.field_status_json),
    source_version: row.source_version,
    last_saved_at: row.last_saved_at,
    last_evaluated_at: row.last_evaluated_at,
    last_verified_at: row.last_verified_at,
    updated_at: row.updated_at
  };
}

export function aggregateEmployeeSetupReadiness(definitions: EmployeeSetupSectionDefinition[], rows: EmployeeSetupSectionStatusRow[], employeeId = rows[0]?.employee_id ?? "") {
  const completeStatuses = new Set<EmployeeSetupSectionStatusValue>(["complete", "verified", "not_required"]);
  const failedSections: EmployeeSetupSectionStatusRow[] = [];
  const staleSections: EmployeeSetupSectionStatusRow[] = [];
  const blockingSections: EmployeeSetupSectionStatusRow[] = [];
  const passingSections: EmployeeSetupSectionStatusRow[] = [];
  const allRows = composeEmployeeSetupSectionStatusRows(definitions, rows, employeeId);

  for (const row of allRows) {
    if (row.status === "failed") failedSections.push(row);
    else if (row.status === "stale" || row.is_stale === 1) staleSections.push(row);
    else if (completeStatuses.has(row.status) && row.is_complete === 1) passingSections.push(row);
    else if (row.is_required === 1) blockingSections.push(row);
  }

  const status = failedSections.length ? "failed" : staleSections.length ? "stale" : blockingSections.length ? "blocked" : "ready";
  const blockerRows = [...blockingSections, ...failedSections, ...staleSections].flatMap((row) => {
    const blockers = parseStatusJsonArray(row.blockers_json);
    return blockers.length ? blockers.map((item) => ({ section_key: row.section_key, section_label: row.section_label, ...(item as Record<string, unknown>) })) : [{
      section_key: row.section_key,
      section_label: row.section_label,
      status: row.status,
      message: row.status_message ?? "This section is not ready."
    }];
  });

  return {
    status,
    can_activate_candidate: false,
    activation_requires_final_verification: true,
    shadow_only: true,
    passing_sections: passingSections.map(serializeEmployeeSetupSectionStatus),
    blocking_sections: blockingSections.map(serializeEmployeeSetupSectionStatus),
    failed_sections: failedSections.map(serializeEmployeeSetupSectionStatus),
    stale_sections: staleSections.map(serializeEmployeeSetupSectionStatus),
    blockers: blockerRows,
    completion: {
      complete: passingSections.length,
      total: allRows.length,
      required_blocking: blockingSections.length,
      failed: failedSections.length,
      stale: staleSections.length
    },
    last_evaluated_at: allRows.map((row) => row.last_evaluated_at ?? row.updated_at).filter(Boolean).sort().at(-1) ?? nowIso()
  };
}

export async function rebuildEmployeeSetupSectionStatuses(db: D1Database, employeeId: string, actorUserId?: string | null) {
  await ensureEmployeeSetupSectionStatusesSchema(db);
  const { definitions, context } = await createEmployeeSetupEvaluationContext(db, employeeId, actorUserId ?? null);
  const statuses: EmployeeSetupSectionStatusInput[] = [];
  for (const definition of definitions) {
    statuses.push(await safeEvaluateEmployeeSetupSection(definition, context));
  }
  for (const status of statuses) {
    await upsertEmployeeSetupSectionStatus(db, status);
  }
  const rows = await getEmployeeSetupSectionStatuses(db, employeeId);
  const previewRows = composeEmployeeSetupSectionStatusRows(definitions, rows, employeeId);
  const readiness = aggregateEmployeeSetupReadiness(definitions, previewRows, employeeId);
  return {
    request_id: `employee_setup_rebuild_${crypto.randomUUID()}`,
    rebuilt_count: statuses.length,
    failed_count: statuses.filter((status) => status.status === "failed").length,
    readiness,
    sections: previewRows.map(serializeEmployeeSetupSectionStatus)
  };
}

export async function markEmployeeSetupSectionStale(db: D1Database, input: {
  employeeId: string;
  sectionKeys: string[];
  updatedByUserId?: string | null;
  message?: string | null;
}) {
  await ensureEmployeeSetupSectionStatusesSchema(db);
  const definitions = await getEmployeeSetupSectionDefinitions(db, input.employeeId);
  for (const sectionKey of Array.from(new Set(input.sectionKeys))) {
    const definition = definitions.find((item) => item.section_key === sectionKey) ?? employeeSetupSectionDefinitionByKey(sectionKey);
    if (!definition) continue;
    if (!definition.default_required && definition.can_be_not_required) {
      await upsertEmployeeSetupSectionStatus(db, {
        employee_id: input.employeeId,
        section_key: definition.section_key,
        section_label: definition.section_label,
        status: "not_required",
        is_required: false,
        is_complete: true,
        is_verified: false,
        is_stale: false,
        status_reason_code: "SECTION_NOT_REQUIRED",
        status_message: `${definition.section_label} is not required for this employee setup.`,
        next_action: null,
        missing_fields: [],
        blockers: [],
        field_status: {},
        source_version: "employee360-setup-phase1",
        updated_by_user_id: input.updatedByUserId ?? null
      });
      continue;
    }
    await upsertEmployeeSetupSectionStatus(db, {
      employee_id: input.employeeId,
      section_key: definition.section_key,
      section_label: definition.section_label,
      status: "stale",
      is_required: definition.default_required,
      is_complete: false,
      is_verified: false,
      is_stale: true,
      status_reason_code: "SECTION_STALE",
      status_message: input.message ?? "This section needs to be rechecked because related setup changed.",
      next_action: "Rebuild Employee 360 setup readiness.",
      blockers: [{ type: "SECTION_STALE", message: "This section needs to be rechecked because related setup changed." }],
      field_status: {},
      source_version: "employee360-setup-phase1",
      updated_by_user_id: input.updatedByUserId ?? null
    });
  }
}

export async function getEmployeeSetupSectionPreviewPayload(db: D1Database, employeeId: string) {
  await ensureEmployeeSetupSectionStatusesSchema(db);
  const definitions = await getEmployeeSetupSectionDefinitions(db, employeeId);
  const storedRows = await getEmployeeSetupSectionStatuses(db, employeeId);
  const previewRows = composeEmployeeSetupSectionStatusRows(definitions, storedRows, employeeId);
  const readiness = aggregateEmployeeSetupReadiness(definitions, previewRows, employeeId);
  return {
    readiness,
    sections: previewRows.map(serializeEmployeeSetupSectionStatus)
  };
}
