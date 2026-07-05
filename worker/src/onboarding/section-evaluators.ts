import { isOperationalModuleEnabled } from "../utils/module-enforcement";
import { nowIso } from "../utils/http";
import {
  getOnboardingSectionRegistry,
  isOnboardingSectionModuleEnabled,
  type OnboardingSectionDefinition,
  type OnboardingSectionStatusValue
} from "./section-status-registry";
import type { OnboardingSectionStatusInput } from "./section-status";

type EvaluationContext = {
  db: D1Database;
  caseId: string;
  actorUserId?: string | null;
  caseEmployee: Record<string, unknown>;
  settings: Record<string, unknown> | null;
  moduleStatuses: Record<string, boolean>;
  definitions: OnboardingSectionDefinition[];
};

type SectionEvaluation = {
  section_key: string;
  section_label: string;
  status: OnboardingSectionStatusValue;
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

function bool(value: unknown, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function sanitizeEvaluatorError(error: unknown, definition: OnboardingSectionDefinition) {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const safeLogMessage = raw
    .replace(/SQLITE_[A-Z_]+:[^.]*/gi, "The database check could not be completed")
    .replace(/\bSELECT\b[\s\S]*/gi, "The section check could not be completed")
    .replace(/password|token|secret|document number|account number/gi, "sensitive value")
    .slice(0, 220);
  return {
    error_code: "SECTION_STATUS_EVALUATOR_FAILED",
    error_message: `${definition.section_label} could not be checked safely.`,
    next_action: `Review the ${definition.section_label} setup and rebuild the section status preview.`,
    safe_log_message: safeLogMessage || "The section check could not be completed."
  };
}

function enabledStatus(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  return isOnboardingSectionModuleEnabled(definition, context.moduleStatuses);
}

function notRequired(definition: OnboardingSectionDefinition, message: string): SectionEvaluation {
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

function complete(definition: OnboardingSectionDefinition, message: string, fieldStatus: Record<string, unknown> = {}): SectionEvaluation {
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

function blocked(definition: OnboardingSectionDefinition, missingFields: string[], message: string, fieldStatus: Record<string, unknown> = {}): SectionEvaluation {
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

function toStatusInput(context: EvaluationContext, evaluation: SectionEvaluation): OnboardingSectionStatusInput {
  return {
    case_id: context.caseId,
    employee_id: text(context.caseEmployee.employee_id),
    company_id: null,
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
    source_version: "section-status-phase1",
    last_evaluated_at: nowIso(),
    updated_by_user_id: context.actorUserId ?? null
  };
}

async function getOnboardingSettings(db: D1Database) {
  return db.prepare("SELECT * FROM onboarding_settings WHERE id = 'onboarding_settings_default'").first<Record<string, unknown>>();
}

async function getModuleStatuses(db: D1Database) {
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

async function getCaseEmployee(db: D1Database, caseId: string) {
  return db.prepare(`
    SELECT
      oc.id AS case_id,
      oc.employee_id,
      oc.onboarding_status,
      oc.activation_status,
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
      e.roster_eligible
    FROM employee_onboarding_cases oc
    INNER JOIN employees e ON e.id = oc.employee_id
    WHERE oc.id = ? AND e.archived_at IS NULL
    LIMIT 1
  `).bind(caseId).first<Record<string, unknown>>();
}

function missingEmployeeFields(employee: Record<string, unknown>, fields: string[]) {
  return fields.filter((field) => !text(employee[field]));
}

async function evaluateEmployeeInfo(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  const missing = missingEmployeeFields(context.caseEmployee, ["employee_no", "full_name", "employee_type", "employment_type", "joining_date"]);
  if (missing.length) return blocked(definition, missing, "Required employee identity fields are missing.", Object.fromEntries(missing.map((field) => [field, "missing"])));
  return complete(definition, "Employee information is complete.", { full_name: "complete", joining_date: "complete" });
}

async function evaluateContactEmergency(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!definition.default_required) return notRequired(definition, "Contact and emergency details are optional for onboarding activation.");
  const count = await context.db.prepare("SELECT COUNT(*) AS total FROM employee_contacts WHERE employee_id = ? AND archived_at IS NULL").bind(text(context.caseEmployee.employee_id)).first<{ total: number }>();
  if (Number(count?.total ?? 0) > 0) return complete(definition, "Contact information is available.");
  return blocked(definition, ["employee_contacts"], "Required contact or emergency contact details are missing.");
}

async function evaluateJobAssignment(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  const settings = context.settings ?? {};
  const fields = [
    bool(settings.require_department_before_activation, true) ? "primary_department_id" : null,
    bool(settings.require_worksite_location_before_activation, true) ? "primary_location_id" : null,
    "primary_position_id",
    "job_level_id",
    bool(settings.require_reporting_manager_before_activation, false) ? "reporting_manager_employee_id" : null,
    "joining_date"
  ].filter(Boolean) as string[];
  const missing = missingEmployeeFields(context.caseEmployee, fields);
  if (missing.length) return blocked(definition, missing, "Required job assignment fields are missing.", Object.fromEntries(missing.map((field) => [field, "missing"])));
  return complete(definition, "Job assignment is complete.");
}

async function evaluateDocuments(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Documents or Document Compliance is disabled.");
  if (!definition.default_required) return notRequired(definition, "Required document checks are optional for this onboarding case.");
  const employee = context.caseEmployee;
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
    ? await context.db.prepare(`SELECT document_type_id FROM employee_documents WHERE employee_id = ? AND status = 'ACTIVE' AND document_type_id IN (${placeholders})`).bind(text(employee.employee_id), ...typeIds).all<{ document_type_id: string }>()
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

async function evaluateContract(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Contracts are disabled.");
  if (!definition.default_required) return notRequired(definition, "Contract setup is optional for this onboarding case.");
  const contract = await context.db.prepare(`
    SELECT id, contract_type_id, contract_start_date, contract_end_date, status
      FROM employee_contracts
     WHERE employee_id = ? AND status IN ('ACTIVE', 'EXPIRING_SOON')
     ORDER BY effective_date DESC, created_at DESC
     LIMIT 1
  `).bind(text(context.caseEmployee.employee_id)).first<Record<string, unknown>>();
  if (!contract) return blocked(definition, ["employee_contract"], "A required active employment contract is missing.");
  return complete(definition, "Required contract setup is complete.", { contract_status: contract.status });
}

async function evaluatePayrollProfile(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Payroll is disabled.");
  if (!definition.default_required) return notRequired(definition, "Payroll profile is optional for this onboarding case.");
  const profile = await context.db.prepare("SELECT id, payroll_included, basic_salary, payment_method FROM employee_payroll_profiles WHERE employee_id = ? LIMIT 1").bind(text(context.caseEmployee.employee_id)).first<Record<string, unknown>>();
  if (!profile) return blocked(definition, ["employee_payroll_profile"], "Payroll profile is required.");
  return complete(definition, "Payroll profile is complete.", { payroll_profile_id: profile.id });
}

async function evaluatePaymentMethod(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Payment methods are disabled or Payroll is disabled.");
  if (!definition.default_required) return notRequired(definition, "Payment method setup is optional for this onboarding case.");
  const method = await context.db.prepare(`
    SELECT epm.id, epm.payment_method_type, epm.payment_institution_id, epm.bank_account_name,
           epm.bank_account_number_encrypted_or_plain_placeholder, pi.id AS active_bank_id
      FROM employee_payment_methods epm
      LEFT JOIN payment_institutions pi ON pi.id = epm.payment_institution_id AND pi.is_active = 1 AND pi.status = 'ACTIVE' AND pi.type = 'BANK'
     WHERE epm.employee_id = ? AND epm.status = 'ACTIVE'
     ORDER BY epm.is_primary DESC, epm.created_at DESC
     LIMIT 1
  `).bind(text(context.caseEmployee.employee_id)).first<Record<string, unknown>>();
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

async function evaluatePension(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Pension is disabled or Payroll is disabled.");
  if (!definition.default_required) return notRequired(definition, "Pension setup is optional for this onboarding case.");
  const profile = await context.db.prepare("SELECT id, enrollment_status, status FROM employee_pension_profiles WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY effective_date DESC LIMIT 1").bind(text(context.caseEmployee.employee_id)).first<Record<string, unknown>>();
  if (!profile) return blocked(definition, ["employee_pension_profile"], "Pension profile is required.");
  return complete(definition, "Pension profile is complete.", { enrollment_status: profile.enrollment_status });
}

async function evaluateUserAccess(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Self-service/user access is disabled.");
  if (!definition.default_required) return notRequired(definition, "User access setup is optional for this onboarding case.");
  if (text(context.caseEmployee.user_id)) return complete(definition, "Linked user account is available.");
  return blocked(definition, ["user_id"], "User account linkage is required.");
}

async function evaluateAttendanceRoster(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context) || (context.moduleStatuses.attendance === false && context.moduleStatuses.roster === false)) {
    return notRequired(definition, "Attendance and Roster setup is disabled or not required.");
  }
  if (!definition.default_required) return notRequired(definition, "Attendance/Roster setup is optional for this onboarding case.");
  const missing = [
    !text(context.caseEmployee.joining_date) ? "joining_date" : null,
    bool(context.settings?.require_roster_eligibility_before_activation, false) && !bool(context.caseEmployee.roster_eligible, true) ? "roster_eligible" : null
  ].filter(Boolean) as string[];
  if (bool(context.settings?.require_biometric_mapping_before_activation, false)) {
    const mapping = await context.db.prepare("SELECT COUNT(*) AS total FROM employee_biometric_mappings WHERE employee_id = ? AND status = 'ACTIVE'").bind(text(context.caseEmployee.employee_id)).first<{ total: number }>();
    if (Number(mapping?.total ?? 0) === 0) missing.push("biometric_mapping");
  }
  if (missing.length) return blocked(definition, missing, "Required attendance or roster setup is missing.");
  return complete(definition, "Attendance/Roster setup is complete or not required.");
}

async function evaluateAssetsUniforms(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Assets & Uniforms are disabled.");
  if (!definition.default_required) return notRequired(definition, "Asset and uniform issue is optional for this onboarding case.");
  const issued = await context.db.prepare("SELECT COUNT(*) AS total FROM employee_asset_assignments WHERE employee_id = ? AND status = 'ISSUED'").bind(text(context.caseEmployee.employee_id)).first<{ total: number }>();
  if (Number(issued?.total ?? 0) === 0) return blocked(definition, ["asset_uniform_assignment"], "Required asset or uniform issue is missing.");
  return complete(definition, "Asset or uniform issue is complete.", { issued_items: Number(issued?.total ?? 0) });
}

async function evaluateApprovalTasks(definition: OnboardingSectionDefinition, context: EvaluationContext) {
  if (!enabledStatus(definition, context)) return notRequired(definition, "Approvals are disabled.");
  if (!definition.default_required) return notRequired(definition, "Approval tasks are optional for this onboarding case.");
  const tasks = await context.db.prepare(`
    SELECT task_key, task_status, status, is_required
      FROM employee_onboarding_tasks
     WHERE onboarding_case_id = ? AND is_required = 1
     LIMIT 100
  `).bind(context.caseId).all<Record<string, unknown>>();
  const blocking = tasks.results.filter((task) => !["COMPLETED", "WAIVED", "NOT_REQUIRED"].includes(text(task.task_status || task.status).toUpperCase()));
  if (blocking.length) {
    return blocked(definition, blocking.map((task) => text(task.task_key) || "task"), "Required onboarding tasks or approvals are still pending.", { pending_task_count: blocking.length });
  }
  return complete(definition, "Required onboarding tasks and approvals are complete.", { required_task_count: tasks.results.length });
}

const evaluators: Record<string, (definition: OnboardingSectionDefinition, context: EvaluationContext) => Promise<SectionEvaluation>> = {
  employee_info: evaluateEmployeeInfo,
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
  approval_tasks: evaluateApprovalTasks
};

async function safeEvaluate(definition: OnboardingSectionDefinition, context: EvaluationContext): Promise<OnboardingSectionStatusInput> {
  try {
    if (!enabledStatus(definition, context)) {
      return toStatusInput(context, notRequired(definition, `${definition.section_label} is not required because its module or submodule is disabled.`));
    }
    const evaluator = evaluators[definition.section_key];
    const result = evaluator ? await evaluator(definition, context) : notRequired(definition, "No evaluator is configured for this optional section.");
    return toStatusInput(context, result);
  } catch (error) {
    const safe = sanitizeEvaluatorError(error, definition);
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

export async function evaluateOnboardingSectionStatuses(db: D1Database, caseId: string, actorUserId?: string | null) {
  const [caseEmployee, settings, moduleStatuses] = await Promise.all([
    getCaseEmployee(db, caseId),
    getOnboardingSettings(db),
    getModuleStatuses(db)
  ]);
  if (!caseEmployee) {
    throw new Error("Onboarding case or employee was not found.");
  }
  const definitions = getOnboardingSectionRegistry({ settings, moduleStatuses, employee: caseEmployee });
  const context: EvaluationContext = { db, caseId, actorUserId, caseEmployee, settings, moduleStatuses, definitions };
  const statuses = [];
  for (const definition of definitions) {
    statuses.push(await safeEvaluate(definition, context));
  }
  return { definitions, statuses };
}
