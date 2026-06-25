import { Hono } from "hono";
import type { Context } from "hono";
import { canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser, Env } from "../types";
import { fail, getClientIp, nowIso, ok } from "../utils/http";

type Db = Env["DB"];

const approvalRoutes = new Hono<AppBindings>();
const selfServiceApprovalRoutes = new Hono<AppBindings>();
const approvalReportRoutes = new Hono<AppBindings>();
type ApprovalContextBinding = Context<AppBindings>;

const WORKFLOW_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;
const FALLBACK_BEHAVIORS = ["MODULE_DEFAULT", "AUTO_APPROVE", "BLOCK_IF_NO_MATCH", "REQUIRE_MANUAL_APPROVER"] as const;
const CONDITION_OPERATORS = ["EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL", "BETWEEN", "EXISTS", "NOT_EXISTS", "CONTAINS"] as const;
const STEP_MODES = ["SEQUENTIAL", "PARALLEL"] as const;
const APPROVAL_MODES = ["ANY_ONE", "ALL_REQUIRED"] as const;
const APPROVER_TYPES = [
  "SPECIFIC_USER",
  "ROLE",
  "PERMISSION",
  "REPORTING_MANAGER",
  "DEPARTMENT_MANAGER",
  "DEPARTMENT_HEAD",
  "WORKSITE_MANAGER",
  "LOCATION_MANAGER",
  "JOB_LEVEL_APPROVER",
  "EMPLOYEE_ASSIGNED_APPROVER",
  "PREVIOUS_STEP_APPROVER",
  "SUPER_ADMIN_FALLBACK",
  "REQUEST_CREATOR_MANAGER",
  "CUSTOM_RESOLVER_PLACEHOLDER"
] as const;
const INSTANCE_TERMINAL = ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED", "OVERRIDDEN"];

type WorkflowRow = {
  id: string;
  workflow_code: string;
  workflow_name: string;
  description: string | null;
  module_key: string;
  action_key: string;
  applies_to_entity_type: string;
  priority_number: number;
  is_default: number;
  is_enabled: number;
  fallback_behavior: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  archived_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  metadata_json: string | null;
};

type ConditionRow = {
  id: string;
  workflow_id: string;
  condition_group: string;
  condition_order: number;
  field_key: string;
  operator: string;
  value_json: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};

type StepRow = {
  id: string;
  workflow_id: string;
  step_number: number;
  step_name: string;
  step_description: string | null;
  step_mode: string;
  approval_mode: string;
  approver_type: string;
  approver_user_id: string | null;
  approver_role_id: string | null;
  approver_permission_key: string | null;
  approver_scope_rule: string | null;
  minimum_job_level: string | null;
  allow_self_approval: number | null;
  skip_if_no_approver: number;
  fallback_approver_type: string | null;
  fallback_user_id: string | null;
  fallback_role_id: string | null;
  reminder_after_hours: number | null;
  escalation_after_hours: number | null;
  escalation_target_type: string | null;
  escalation_user_id: string | null;
  escalation_role_id: string | null;
  is_required: number;
  is_enabled: number;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};

type InstanceRow = {
  id: string;
  workflow_id: string | null;
  workflow_code_snapshot: string | null;
  workflow_name_snapshot: string | null;
  module_key: string;
  action_key: string;
  entity_type: string;
  entity_id: string;
  employee_id: string | null;
  request_title: string;
  request_summary_json: string | null;
  request_amount: number | null;
  request_days: number | null;
  status: string;
  current_step_number: number | null;
  submitted_by_user_id: string;
  submitted_at: string;
  completed_at: string | null;
  cancelled_by_user_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  final_decision_by_user_id: string | null;
  final_decision_at: string | null;
  final_decision_reason: string | null;
  fallback_used: number;
  auto_approved: number;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};

type InstanceStepRow = {
  id: string;
  approval_instance_id: string;
  workflow_step_id: string | null;
  step_number: number;
  step_name: string;
  step_mode: string;
  approval_mode: string;
  status: string;
  required_approver_count: number;
  approved_count: number;
  rejected_count: number;
  sent_back_count: number;
  due_at: string | null;
  reminder_due_at: string | null;
  escalation_due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};

type AssigneeRow = {
  id: string;
  approval_instance_step_id: string;
  approval_instance_id: string;
  assigned_user_id: string;
  assigned_user_name_snapshot: string;
  assigned_role_snapshot: string | null;
  assignment_type: string;
  status: string;
  delegated_from_user_id: string | null;
  escalated_from_user_id: string | null;
  decision_at: string | null;
  decision_note: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};

type ApprovalContext = Record<string, unknown> & {
  module_key?: string;
  action_key?: string;
  employee_id?: string | null;
  created_by_user_id?: string | null;
};

function json(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === "1";
}

function str(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function nullableStr(value: unknown) {
  const text = str(value);
  return text ? text : null;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasAnyPermission(user: AuthUser, permissions: string[]) {
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAny(user: AuthUser, permissions: string[]) {
  return hasAnyPermission(user, permissions);
}

function listPlaceholders(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

async function recordApprovalAudit(c: ApprovalContextBinding, input: { action: string; entityType: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  const user = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: user.id,
    action: input.action,
    module: "approvals",
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason ?? null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
}

async function getSettings(db: Db) {
  const existing = await db.prepare("SELECT * FROM approval_workflow_settings WHERE id = ?").bind("approval_workflow_settings_default").first<Record<string, unknown>>();
  if (existing) return existing;
  await db
    .prepare(
      `INSERT INTO approval_workflow_settings (id, metadata_json)
       VALUES ('approval_workflow_settings_default', ?)`
    )
    .bind(json({ created_by: "runtime_default", seeded_prompt: "16" }))
    .run();
  return db.prepare("SELECT * FROM approval_workflow_settings WHERE id = ?").bind("approval_workflow_settings_default").first<Record<string, unknown>>();
}

function settingsToApi(row: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "number" && !["default_expiring_soon_days", "default_urgent_expiring_days", "default_overdue_grace_days"].includes(key)) {
      result[key] = value === 1;
    } else {
      result[key] = value;
    }
  }
  result.metadata = parseJson(String(row.metadata_json ?? "") || null, {});
  return result;
}

function workflowToApi(row: WorkflowRow) {
  return {
    ...row,
    is_default: row.is_default === 1,
    is_enabled: row.is_enabled === 1,
    metadata: parseJson(row.metadata_json, {})
  };
}

function conditionToApi(row: ConditionRow) {
  return {
    ...row,
    value: parseJson(row.value_json, null),
    metadata: parseJson(row.metadata_json, {})
  };
}

function stepToApi(row: StepRow) {
  return {
    ...row,
    allow_self_approval: row.allow_self_approval === null ? null : row.allow_self_approval === 1,
    skip_if_no_approver: row.skip_if_no_approver === 1,
    is_required: row.is_required === 1,
    is_enabled: row.is_enabled === 1,
    metadata: parseJson(row.metadata_json, {})
  };
}

function instanceToApi(row: InstanceRow) {
  return {
    ...row,
    request_summary: parseJson(row.request_summary_json, {}),
    fallback_used: row.fallback_used === 1,
    auto_approved: row.auto_approved === 1,
    metadata: parseJson(row.metadata_json, {})
  };
}

function validateIn<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  return allowed.includes(String(value) as T[number]) ? (String(value) as T[number]) : fallback;
}

export async function validateApprovalWorkflowCondition(input: Record<string, unknown>) {
  const fieldKey = str(input.field_key);
  const operator = validateIn(input.operator, CONDITION_OPERATORS, "EQUALS");
  if (!fieldKey) return { ok: false, code: "APPROVAL_CONDITION_INVALID", message: "Condition field is required." };
  if (input.value_json !== undefined && typeof input.value_json === "string") {
    try {
      JSON.parse(input.value_json);
    } catch {
      return { ok: false, code: "APPROVAL_CONDITION_INVALID", message: "Condition value must be valid JSON." };
    }
  }
  return { ok: true, operator };
}

export async function getApprovalConditionContext(db: Db, input: ApprovalContext) {
  const context: ApprovalContext = { ...input };
  const employeeId = nullableStr(input.employee_id);
  if (employeeId) {
    const employee = await db
      .prepare(
        `SELECT e.id, e.employee_no, e.name, e.employee_type, e.employment_type, e.status,
          e.primary_department_id, e.primary_location_id, e.position_id, e.job_level_id,
          e.reporting_manager_employee_id
         FROM employees e
         WHERE e.id = ?`
      )
      .bind(employeeId)
      .first<Record<string, unknown>>();
    if (employee) {
      context.employee_department_id = employee.primary_department_id;
      context.employee_worksite_id = employee.primary_location_id;
      context.employee_location_id = employee.primary_location_id;
      context.employee_position_id = employee.position_id;
      context.employee_job_level_id = employee.job_level_id;
      context.employee_type = employee.employee_type;
      context.employment_type = employee.employment_type;
      context.employee_reporting_manager_id = employee.reporting_manager_employee_id;
      context.employee_status = employee.status;
      context.employee_name = employee.name;
      context.employee_no = employee.employee_no;
    }
  }
  return context;
}

function compareCondition(actual: unknown, operator: string, expected: unknown) {
  if (operator === "EXISTS") return actual !== undefined && actual !== null && actual !== "";
  if (operator === "NOT_EXISTS") return actual === undefined || actual === null || actual === "";
  if (operator === "EQUALS") return String(actual ?? "") === String(expected ?? "");
  if (operator === "NOT_EQUALS") return String(actual ?? "") !== String(expected ?? "");
  if (operator === "IN") return Array.isArray(expected) && expected.map(String).includes(String(actual ?? ""));
  if (operator === "NOT_IN") return Array.isArray(expected) && !expected.map(String).includes(String(actual ?? ""));
  if (operator === "CONTAINS") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  const actualNumber = Number(actual);
  if (!Number.isFinite(actualNumber)) return false;
  if (operator === "BETWEEN" && Array.isArray(expected) && expected.length >= 2) {
    const min = Number(expected[0]);
    const max = Number(expected[1]);
    return Number.isFinite(min) && Number.isFinite(max) && actualNumber >= min && actualNumber <= max;
  }
  const expectedNumber = Number(expected);
  if (!Number.isFinite(expectedNumber)) return false;
  if (operator === "GREATER_THAN") return actualNumber > expectedNumber;
  if (operator === "GREATER_THAN_OR_EQUAL") return actualNumber >= expectedNumber;
  if (operator === "LESS_THAN") return actualNumber < expectedNumber;
  if (operator === "LESS_THAN_OR_EQUAL") return actualNumber <= expectedNumber;
  return false;
}

export async function evaluateApprovalWorkflowConditions(db: Db, workflowId: string, context: ApprovalContext) {
  const rows = await db
    .prepare("SELECT * FROM approval_workflow_conditions WHERE workflow_id = ? ORDER BY condition_group, condition_order")
    .bind(workflowId)
    .all<ConditionRow>();
  const conditions = rows.results;
  if (!conditions.length) return { matched: true, conditions: [], matched_groups: ["default"] };
  const groups = new Map<string, ConditionRow[]>();
  for (const condition of conditions) {
    groups.set(condition.condition_group, [...(groups.get(condition.condition_group) ?? []), condition]);
  }
  const matchedGroups: string[] = [];
  const details = conditions.map((condition) => {
    const expected = parseJson(condition.value_json, null);
    const matched = compareCondition(context[condition.field_key], condition.operator, expected);
    return { ...conditionToApi(condition), actual_value: context[condition.field_key] ?? null, matched };
  });
  for (const [group, groupConditions] of groups) {
    if (groupConditions.every((condition) => details.find((item) => item.id === condition.id)?.matched)) {
      matchedGroups.push(group);
    }
  }
  return { matched: matchedGroups.length > 0, conditions: details, matched_groups: matchedGroups };
}

export async function findMatchingApprovalWorkflow(db: Db, moduleKey: string, actionKey: string, context: ApprovalContext) {
  const workflows = await db
    .prepare(
      `SELECT * FROM approval_workflows
       WHERE module_key = ?
         AND action_key = ?
         AND is_enabled = 1
         AND status = 'ACTIVE'
         AND (effective_from IS NULL OR effective_from <= date('now'))
         AND (effective_to IS NULL OR effective_to >= date('now'))
       ORDER BY priority_number ASC, is_default DESC, created_at DESC`
    )
    .bind(moduleKey, actionKey)
    .all<WorkflowRow>();
  for (const workflow of workflows.results) {
    const evaluated = await evaluateApprovalWorkflowConditions(db, workflow.id, context);
    if (evaluated.matched) return { workflow, evaluated };
  }
  return { workflow: null, evaluated: null };
}

async function usersWithRole(db: Db, roleId: string) {
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.email, r.name AS role_name
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.role_id = ? AND u.status = 'ACTIVE'`
    )
    .bind(roleId)
    .all<{ id: string; name: string; email: string; role_name: string }>();
  return rows.results;
}

async function usersWithPermission(db: Db, permissionKey: string) {
  const rows = await db
    .prepare(
      `SELECT DISTINCT u.id, u.name, u.email, p.key AS permission_key
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
       INNER JOIN permissions p ON p.id = rp.permission_id
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE p.key = ? AND u.status = 'ACTIVE' AND r.is_active = 1`
    )
    .bind(permissionKey)
    .all<{ id: string; name: string; email: string; permission_key: string }>();
  return rows.results;
}

async function linkedUserForEmployee(db: Db, employeeId: string | null | undefined) {
  if (!employeeId) return null;
  return db.prepare("SELECT id, name, email FROM users WHERE employee_id = ? AND status = 'ACTIVE' LIMIT 1").bind(employeeId).first<{ id: string; name: string; email: string }>();
}

async function ownerUsers(db: Db) {
  const rows = await db.prepare("SELECT id, name, email FROM users WHERE is_owner = 1 AND status = 'ACTIVE'").all<{ id: string; name: string; email: string }>();
  return rows.results;
}

async function managerUserForEmployee(db: Db, employeeId: string | null | undefined) {
  if (!employeeId) return null;
  const manager = await db
    .prepare(
      `SELECT manager.id AS manager_employee_id
       FROM employees e
       LEFT JOIN employees manager ON manager.id = e.reporting_manager_employee_id
       WHERE e.id = ? AND manager.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<{ manager_employee_id: string | null }>();
  return linkedUserForEmployee(db, manager?.manager_employee_id ?? null);
}

async function departmentHeadUser(db: Db, employeeId: string | null | undefined) {
  if (!employeeId) return null;
  const row = await db
    .prepare(
      `SELECT d.head_employee_id AS head_id, d.manager_employee_id AS manager_id
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       WHERE e.id = ?`
    )
    .bind(employeeId)
    .first<{ head_id: string | null; manager_id: string | null }>();
  return linkedUserForEmployee(db, row?.head_id ?? row?.manager_id ?? null);
}

async function locationManagerUser(db: Db, employeeId: string | null | undefined) {
  if (!employeeId) return null;
  const row = await db
    .prepare(
      `SELECT l.manager_employee_id AS manager_id
       FROM employees e
       LEFT JOIN locations l ON l.id = e.primary_location_id
       WHERE e.id = ?`
    )
    .bind(employeeId)
    .first<{ manager_id: string | null }>();
  return linkedUserForEmployee(db, row?.manager_id ?? null);
}

export async function isSelfApprovalBlocked(db: Db, step: StepRow, approverUserId: string, context: ApprovalContext) {
  const settings = await getSettings(db);
  if (step.allow_self_approval === 1) return false;
  if (settings?.block_self_approval_by_default === 0) return false;
  return Boolean(context.created_by_user_id && context.created_by_user_id === approverUserId);
}

export async function resolveApproverByType(db: Db, step: StepRow, context: ApprovalContext) {
  const users: Array<{ id: string; name: string; email?: string | null; reason: string; role?: string | null }> = [];
  if (step.approver_type === "SPECIFIC_USER" && step.approver_user_id) {
    const user = await db.prepare("SELECT id, name, email FROM users WHERE id = ? AND status = 'ACTIVE'").bind(step.approver_user_id).first<{ id: string; name: string; email: string }>();
    if (user) users.push({ ...user, reason: "specific user" });
  } else if (step.approver_type === "ROLE" && step.approver_role_id) {
    const rows = await usersWithRole(db, step.approver_role_id);
    users.push(...rows.map((user) => ({ ...user, reason: "role", role: user.role_name })));
  } else if (step.approver_type === "PERMISSION" && step.approver_permission_key) {
    const rows = await usersWithPermission(db, step.approver_permission_key);
    users.push(...rows.map((user) => ({ ...user, reason: "permission", role: user.permission_key })));
  } else if (["REPORTING_MANAGER", "REQUEST_CREATOR_MANAGER"].includes(step.approver_type)) {
    const user = await managerUserForEmployee(db, nullableStr(context.employee_id));
    if (user) users.push({ ...user, reason: "reporting manager" });
  } else if (["DEPARTMENT_MANAGER", "DEPARTMENT_HEAD"].includes(step.approver_type)) {
    const user = await departmentHeadUser(db, nullableStr(context.employee_id));
    if (user) users.push({ ...user, reason: "department head" });
  } else if (["WORKSITE_MANAGER", "LOCATION_MANAGER"].includes(step.approver_type)) {
    const user = await locationManagerUser(db, nullableStr(context.employee_id));
    if (user) users.push({ ...user, reason: "location manager" });
  } else if (step.approver_type === "SUPER_ADMIN_FALLBACK") {
    users.push(...(await ownerUsers(db)).map((user) => ({ ...user, reason: "owner fallback" })));
  } else if (step.approver_type === "JOB_LEVEL_APPROVER" || step.approver_type === "EMPLOYEE_ASSIGNED_APPROVER" || step.approver_type === "PREVIOUS_STEP_APPROVER") {
    const user = await managerUserForEmployee(db, nullableStr(context.employee_id));
    if (user) users.push({ ...user, reason: `${step.approver_type.toLowerCase()} placeholder` });
  }
  const unique = new Map(users.map((user) => [user.id, user]));
  return Array.from(unique.values());
}

export async function getApprovalStepFallbackApprover(db: Db, step: StepRow, context: ApprovalContext) {
  if (step.fallback_user_id) {
    const user = await db.prepare("SELECT id, name, email FROM users WHERE id = ? AND status = 'ACTIVE'").bind(step.fallback_user_id).first<{ id: string; name: string; email: string }>();
    if (user) return [{ ...user, reason: "fallback user" }];
  }
  if (step.fallback_role_id) {
    const rows = await usersWithRole(db, step.fallback_role_id);
    return rows.map((user) => ({ ...user, reason: "fallback role", role: user.role_name }));
  }
  if (step.fallback_approver_type === "SUPER_ADMIN_FALLBACK") {
    return (await ownerUsers(db)).map((user) => ({ ...user, reason: "fallback owner" }));
  }
  return [];
}

export async function resolveApprovalStepApprovers(db: Db, step: StepRow, context: ApprovalContext) {
  const direct = await resolveApproverByType(db, step, context);
  const fallback = direct.length ? [] : await getApprovalStepFallbackApprover(db, step, context);
  const raw = direct.length ? direct : fallback;
  const approvers = [];
  const warnings: string[] = [];
  for (const user of raw) {
    if (await isSelfApprovalBlocked(db, step, user.id, context)) {
      warnings.push(`Self-approval blocked for ${user.name}.`);
      continue;
    }
    approvers.push(user);
  }
  if (!approvers.length) {
    warnings.push(step.skip_if_no_approver === 1 ? "No approver resolved; step can be skipped." : "No approver resolved; manual action required.");
  }
  return { approvers, warnings, used_fallback: direct.length === 0 && fallback.length > 0 };
}

export async function canUserApproveStep(db: Db, user: AuthUser, instanceId: string) {
  if (user.is_owner && user.permissions.includes("approvals.instances.override")) return true;
  const row = await db
    .prepare(
      `SELECT asa.id
       FROM approval_step_assignees asa
       INNER JOIN approval_instance_steps ais ON ais.id = asa.approval_instance_step_id
       WHERE asa.approval_instance_id = ?
         AND asa.assigned_user_id = ?
         AND asa.status = 'PENDING'
         AND ais.status IN ('PENDING', 'ESCALATED', 'DELEGATED')
       LIMIT 1`
    )
    .bind(instanceId, user.id)
    .first<{ id: string }>();
  return Boolean(row);
}

export function calculateApprovalDueAt(hours?: number | null, basis = "CALENDAR_DAYS") {
  if (!hours || hours <= 0) return null;
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

export function calculateApprovalEscalationDueAt(hours?: number | null, basis = "CALENDAR_DAYS") {
  return calculateApprovalDueAt(hours, basis);
}

async function createApprovalAction(db: Db, input: {
  instance: InstanceRow;
  stepId?: string | null;
  assigneeId?: string | null;
  action: string;
  actor?: AuthUser | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  note?: string | null;
  reason?: string | null;
  metadata?: unknown;
}) {
  await db
    .prepare(
      `INSERT INTO approval_actions (
        id, approval_instance_id, approval_instance_step_id, assignee_id, module_key, action_key,
        entity_type, entity_id, employee_id, action, actor_user_id, actor_name_snapshot,
        previous_status, new_status, note, reason, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.instance.id,
      input.stepId ?? null,
      input.assigneeId ?? null,
      input.instance.module_key,
      input.instance.action_key,
      input.instance.entity_type,
      input.instance.entity_id,
      input.instance.employee_id,
      input.action,
      input.actor?.id ?? null,
      input.actor?.name ?? null,
      input.previousStatus ?? null,
      input.newStatus ?? null,
      input.note ?? null,
      input.reason ?? null,
      json(input.metadata)
    )
    .run();
}

export async function createApprovalInstance(db: Db, input: {
  workflow: WorkflowRow | null;
  module_key: string;
  action_key: string;
  entity_type: string;
  entity_id: string;
  employee_id?: string | null;
  request_title: string;
  request_summary?: unknown;
  request_amount?: number | null;
  request_days?: number | null;
  submitted_by_user_id: string;
  fallback_used?: boolean;
  auto_approved?: boolean;
}) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO approval_instances (
        id, workflow_id, workflow_code_snapshot, workflow_name_snapshot, module_key, action_key,
        entity_type, entity_id, employee_id, request_title, request_summary_json, request_amount,
        request_days, status, current_step_number, submitted_by_user_id, fallback_used, auto_approved, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.workflow?.id ?? null,
      input.workflow?.workflow_code ?? null,
      input.workflow?.workflow_name ?? null,
      input.module_key,
      input.action_key,
      input.entity_type,
      input.entity_id,
      input.employee_id ?? null,
      input.request_title,
      json(input.request_summary ?? {}),
      input.request_amount ?? null,
      input.request_days ?? null,
      input.submitted_by_user_id,
      input.fallback_used ? 1 : 0,
      input.auto_approved ? 1 : 0,
      json({ central_workflow_adapter: true, prompt: 16 })
    )
    .run();
  return db.prepare("SELECT * FROM approval_instances WHERE id = ?").bind(id).first<InstanceRow>();
}

async function activateInitialSteps(db: Db, instance: InstanceRow, workflow: WorkflowRow, context: ApprovalContext) {
  const steps = await db
    .prepare("SELECT * FROM approval_workflow_steps WHERE workflow_id = ? AND is_enabled = 1 ORDER BY step_number ASC")
    .bind(workflow.id)
    .all<StepRow>();
  let firstPending: number | null = null;
  for (const step of steps.results) {
    const shouldStart = firstPending === null && step.step_mode === "SEQUENTIAL" || (firstPending === null && step.step_number === steps.results[0]?.step_number);
    const status = shouldStart ? "PENDING" : "WAITING";
    const resolved = await resolveApprovalStepApprovers(db, step, context);
    if (!resolved.approvers.length && step.skip_if_no_approver === 1) {
      const stepId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO approval_instance_steps (
            id, approval_instance_id, workflow_step_id, step_number, step_name, step_mode, approval_mode,
            status, required_approver_count, approved_count, due_at, reminder_due_at, escalation_due_at,
            started_at, completed_at, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SKIPPED', 0, 0, ?, ?, ?, ?, ?, ?)`
        )
        .bind(stepId, instance.id, step.id, step.step_number, step.step_name, step.step_mode, step.approval_mode, null, null, null, nowIso(), nowIso(), json({ warnings: resolved.warnings }))
        .run();
      await createApprovalAction(db, { instance, stepId, action: "SKIPPED", newStatus: "SKIPPED", metadata: { warnings: resolved.warnings } });
      continue;
    }
    const stepId = crypto.randomUUID();
    if (status === "PENDING" && firstPending === null) firstPending = step.step_number;
    await db
      .prepare(
        `INSERT INTO approval_instance_steps (
          id, approval_instance_id, workflow_step_id, step_number, step_name, step_mode, approval_mode,
          status, required_approver_count, due_at, reminder_due_at, escalation_due_at, started_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        stepId,
        instance.id,
        step.id,
        step.step_number,
        step.step_name,
        step.step_mode,
        step.approval_mode,
        status,
        resolved.approvers.length,
        calculateApprovalDueAt(step.reminder_after_hours ?? step.escalation_after_hours ?? 24),
        calculateApprovalDueAt(step.reminder_after_hours),
        calculateApprovalEscalationDueAt(step.escalation_after_hours),
        status === "PENDING" ? nowIso() : null,
        json({ warnings: resolved.warnings, approver_type: step.approver_type, used_fallback: resolved.used_fallback })
      )
      .run();
    for (const approver of resolved.approvers) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO approval_step_assignees (
            id, approval_instance_step_id, approval_instance_id, assigned_user_id, assigned_user_name_snapshot,
            assigned_role_snapshot, assignment_type, status, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), stepId, instance.id, approver.id, approver.name, "role" in approver ? approver.role ?? null : null, resolved.used_fallback ? "FALLBACK" : approver.reason.includes("role") ? "ROLE_RESOLVED" : approver.reason.includes("manager") ? "MANAGER_RESOLVED" : "DIRECT", status === "PENDING" ? "PENDING" : "PENDING", json({ reason: approver.reason }))
        .run();
    }
  }
  await db.prepare("UPDATE approval_instances SET current_step_number = ?, status = ?, updated_at = ? WHERE id = ?").bind(firstPending, firstPending === null ? "APPROVED" : "PENDING", nowIso(), instance.id).run();
  return db.prepare("SELECT * FROM approval_instances WHERE id = ?").bind(instance.id).first<InstanceRow>();
}

export async function submitApprovalInstance(db: Db, instanceId: string, actor: AuthUser) {
  const instance = await db.prepare("SELECT * FROM approval_instances WHERE id = ?").bind(instanceId).first<InstanceRow>();
  if (!instance) return null;
  await createApprovalAction(db, { instance, action: "SUBMITTED", actor, previousStatus: "DRAFT", newStatus: instance.status });
  return instance;
}

async function getPendingAssignee(db: Db, instanceId: string, userId: string) {
  return db
    .prepare(
      `SELECT asa.*
       FROM approval_step_assignees asa
       INNER JOIN approval_instance_steps ais ON ais.id = asa.approval_instance_step_id
       WHERE asa.approval_instance_id = ?
         AND asa.assigned_user_id = ?
         AND asa.status = 'PENDING'
         AND ais.status IN ('PENDING', 'ESCALATED', 'DELEGATED')
       ORDER BY ais.step_number ASC
       LIMIT 1`
    )
    .bind(instanceId, userId)
    .first<AssigneeRow>();
}

async function getInstance(db: Db, instanceId: string) {
  return db.prepare("SELECT * FROM approval_instances WHERE id = ?").bind(instanceId).first<InstanceRow>();
}

export async function completeApprovalInstanceIfReady(db: Db, instanceId: string, actor?: AuthUser | null) {
  const instance = await getInstance(db, instanceId);
  if (!instance) return null;
  const pendingStep = await db.prepare("SELECT * FROM approval_instance_steps WHERE approval_instance_id = ? AND status = 'PENDING' ORDER BY step_number ASC LIMIT 1").bind(instanceId).first<InstanceStepRow>();
  if (pendingStep) return instance;
  const waitingStep = await db.prepare("SELECT * FROM approval_instance_steps WHERE approval_instance_id = ? AND status = 'WAITING' ORDER BY step_number ASC LIMIT 1").bind(instanceId).first<InstanceStepRow>();
  if (waitingStep) {
    await db.prepare("UPDATE approval_instance_steps SET status = 'PENDING', started_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), waitingStep.id).run();
    await db.prepare("UPDATE approval_instances SET status = 'PENDING', current_step_number = ?, updated_at = ? WHERE id = ?").bind(waitingStep.step_number, nowIso(), instanceId).run();
    return getInstance(db, instanceId);
  }
  await db.prepare("UPDATE approval_instances SET status = 'APPROVED', completed_at = ?, final_decision_by_user_id = ?, final_decision_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), actor?.id ?? null, nowIso(), nowIso(), instanceId).run();
  const updated = await getInstance(db, instanceId);
  if (updated) {
    await createApprovalAction(db, { instance: updated, action: "COMPLETED", actor: actor ?? null, previousStatus: instance.status, newStatus: "APPROVED" });
    await syncModuleApprovalStatusFromInstance(db, updated);
  }
  return updated;
}

export async function approveApprovalStep(db: Db, instanceId: string, actor: AuthUser, note?: string | null) {
  const instance = await getInstance(db, instanceId);
  if (!instance) return { error: "APPROVAL_INSTANCE_NOT_FOUND" };
  const assignee = await getPendingAssignee(db, instanceId, actor.id);
  if (!assignee && !actor.is_owner) return { error: "APPROVAL_STEP_NOT_ASSIGNED" };
  const targetAssignee = assignee ?? (await db.prepare("SELECT * FROM approval_step_assignees WHERE approval_instance_id = ? AND status = 'PENDING' LIMIT 1").bind(instanceId).first<AssigneeRow>());
  if (!targetAssignee) return { error: "APPROVAL_STEP_NOT_ASSIGNED" };
  const step = await db.prepare("SELECT * FROM approval_instance_steps WHERE id = ?").bind(targetAssignee.approval_instance_step_id).first<InstanceStepRow>();
  if (!step) return { error: "APPROVAL_STEP_INVALID" };
  await db.prepare("UPDATE approval_step_assignees SET status = 'APPROVED', decision_at = ?, decision_note = ?, updated_at = ? WHERE id = ?").bind(nowIso(), note ?? null, nowIso(), targetAssignee.id).run();
  const approvedCount = await db.prepare("SELECT COUNT(*) AS count FROM approval_step_assignees WHERE approval_instance_step_id = ? AND status = 'APPROVED'").bind(step.id).first<{ count: number }>();
  const requiredCount = step.required_approver_count;
  const stepApproved = step.approval_mode === "ANY_ONE" ? true : (approvedCount?.count ?? 0) >= requiredCount;
  await db.prepare("UPDATE approval_instance_steps SET approved_count = ?, status = ?, completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END, updated_at = ? WHERE id = ?").bind(approvedCount?.count ?? 0, stepApproved ? "APPROVED" : "PENDING", stepApproved ? 1 : 0, nowIso(), nowIso(), step.id).run();
  await createApprovalAction(db, { instance, stepId: step.id, assigneeId: targetAssignee.id, action: "APPROVED", actor, previousStatus: step.status, newStatus: stepApproved ? "APPROVED" : "PENDING", note });
  if (stepApproved) return { instance: await completeApprovalInstanceIfReady(db, instanceId, actor) };
  return { instance: await getInstance(db, instanceId) };
}

export async function rejectApprovalStep(db: Db, instanceId: string, actor: AuthUser, reason: string) {
  const instance = await getInstance(db, instanceId);
  if (!instance) return { error: "APPROVAL_INSTANCE_NOT_FOUND" };
  const assignee = await getPendingAssignee(db, instanceId, actor.id);
  if (!assignee && !actor.is_owner) return { error: "APPROVAL_STEP_NOT_ASSIGNED" };
  await db.prepare("UPDATE approval_instances SET status = 'REJECTED', final_decision_by_user_id = ?, final_decision_at = ?, final_decision_reason = ?, completed_at = ?, updated_at = ? WHERE id = ?").bind(actor.id, nowIso(), reason, nowIso(), nowIso(), instanceId).run();
  if (assignee) await db.prepare("UPDATE approval_step_assignees SET status = 'REJECTED', decision_at = ?, decision_reason = ?, updated_at = ? WHERE id = ?").bind(nowIso(), reason, nowIso(), assignee.id).run();
  await db.prepare("UPDATE approval_instance_steps SET status = 'REJECTED', rejected_count = rejected_count + 1, completed_at = ?, updated_at = ? WHERE approval_instance_id = ? AND status = 'PENDING'").bind(nowIso(), nowIso(), instanceId).run();
  await createApprovalAction(db, { instance, stepId: assignee?.approval_instance_step_id ?? null, assigneeId: assignee?.id ?? null, action: "REJECTED", actor, previousStatus: instance.status, newStatus: "REJECTED", reason });
  const updated = await getInstance(db, instanceId);
  if (updated) await syncModuleApprovalStatusFromInstance(db, updated);
  return { instance: updated };
}

export async function sendBackApprovalStep(db: Db, instanceId: string, actor: AuthUser, reason: string) {
  const instance = await getInstance(db, instanceId);
  if (!instance) return { error: "APPROVAL_INSTANCE_NOT_FOUND" };
  const assignee = await getPendingAssignee(db, instanceId, actor.id);
  if (!assignee && !actor.is_owner) return { error: "APPROVAL_STEP_NOT_ASSIGNED" };
  await db.prepare("UPDATE approval_instances SET status = 'SENT_BACK', final_decision_by_user_id = ?, final_decision_at = ?, final_decision_reason = ?, updated_at = ? WHERE id = ?").bind(actor.id, nowIso(), reason, nowIso(), instanceId).run();
  if (assignee) await db.prepare("UPDATE approval_step_assignees SET status = 'SENT_BACK', decision_at = ?, decision_reason = ?, updated_at = ? WHERE id = ?").bind(nowIso(), reason, nowIso(), assignee.id).run();
  await db.prepare("UPDATE approval_instance_steps SET status = 'SENT_BACK', sent_back_count = sent_back_count + 1, completed_at = ?, updated_at = ? WHERE approval_instance_id = ? AND status = 'PENDING'").bind(nowIso(), nowIso(), instanceId).run();
  await createApprovalAction(db, { instance, stepId: assignee?.approval_instance_step_id ?? null, assigneeId: assignee?.id ?? null, action: "SENT_BACK", actor, previousStatus: instance.status, newStatus: "SENT_BACK", reason });
  const updated = await getInstance(db, instanceId);
  if (updated) await syncModuleApprovalStatusFromInstance(db, updated);
  return { instance: updated };
}

export async function cancelApprovalInstance(db: Db, instanceId: string, actor: AuthUser, reason: string) {
  const instance = await getInstance(db, instanceId);
  if (!instance) return { error: "APPROVAL_INSTANCE_NOT_FOUND" };
  await db.prepare("UPDATE approval_instances SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(actor.id, nowIso(), reason, nowIso(), instanceId).run();
  await db.prepare("UPDATE approval_instance_steps SET status = 'CANCELLED', updated_at = ? WHERE approval_instance_id = ? AND status IN ('WAITING', 'PENDING', 'ESCALATED', 'DELEGATED')").bind(nowIso(), instanceId).run();
  await db.prepare("UPDATE approval_step_assignees SET status = 'CANCELLED', updated_at = ? WHERE approval_instance_id = ? AND status = 'PENDING'").bind(nowIso(), instanceId).run();
  await createApprovalAction(db, { instance, action: "CANCELLED", actor, previousStatus: instance.status, newStatus: "CANCELLED", reason });
  return { instance: await getInstance(db, instanceId) };
}

export async function getApprovalInstanceForEntity(db: Db, entityType: string, entityId: string, moduleKey?: string | null, actionKey?: string | null) {
  const clauses = ["entity_type = ?", "entity_id = ?"];
  const params: unknown[] = [entityType, entityId];
  if (moduleKey) {
    clauses.push("module_key = ?");
    params.push(moduleKey);
  }
  if (actionKey) {
    clauses.push("action_key = ?");
    params.push(actionKey);
  }
  return db.prepare(`SELECT * FROM approval_instances WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 1`).bind(...params).first<InstanceRow>();
}

export async function ensureApprovalInstanceForEntity(db: Db, input: Parameters<typeof createApprovalInstance>[1]) {
  const existing = await getApprovalInstanceForEntity(db, input.entity_type, input.entity_id, input.module_key, input.action_key);
  if (existing && !INSTANCE_TERMINAL.includes(existing.status)) return existing;
  return createApprovalInstance(db, input);
}

export function getApprovalAdapterForModuleAction(moduleKey: string, actionKey: string) {
  const supported = new Set([
    "leave.request",
    "attendance.correction",
    "payroll.run.submit",
    "payroll.run.finalize",
    "final_settlement.submit",
    "final_settlement.finalize",
    "contracts.approve",
    "contracts.renewal.approve",
    "documents.renewal_case",
    "documents.waiver",
    "payroll.bank_loan.approve",
    "payroll.custom_deduction.approve",
    "employee.profile_update",
    "employee.onboarding_activation",
    "employee.status_change",
    "asset.clearance",
    "uniform.clearance",
    "generic.approval"
  ]);
  return {
    supported: supported.has(`${moduleKey}.${actionKey}`) || supported.has(moduleKey),
    module_key: moduleKey,
    action_key: actionKey,
    fallback_to_module_approval_if_no_workflow: true,
    note: "Existing module-specific approval remains fallback until a central workflow is active and matched."
  };
}

export async function createApprovalForModuleEntity(db: Db, actor: AuthUser, input: ApprovalContext & { entity_type: string; entity_id: string; request_title?: string }) {
  const context = await getApprovalConditionContext(db, input);
  const match = await findMatchingApprovalWorkflow(db, str(input.module_key), str(input.action_key), context);
  const instance = await ensureApprovalInstanceForEntity(db, {
    workflow: match.workflow,
    module_key: str(input.module_key),
    action_key: str(input.action_key),
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    employee_id: nullableStr(input.employee_id),
    request_title: input.request_title ?? `${input.module_key} ${input.action_key}`,
    request_summary: context,
    submitted_by_user_id: actor.id,
    fallback_used: !match.workflow
  });
  if (instance && match.workflow) await activateInitialSteps(db, instance, match.workflow, context);
  return instance;
}

export async function getModuleEntityApprovalSummary(db: Db, entityType: string, entityId: string) {
  const instance = await getApprovalInstanceForEntity(db, entityType, entityId);
  if (!instance) return { approval_required: false, fallback_used: true, status: "MODULE_DEFAULT" };
  const steps = await db.prepare("SELECT * FROM approval_instance_steps WHERE approval_instance_id = ? ORDER BY step_number").bind(instance.id).all<InstanceStepRow>();
  return { approval_required: true, instance: instanceToApi(instance), steps: steps.results };
}

export async function getModuleEntityApprovalPreview(db: Db, input: ApprovalContext) {
  return previewApprovalWorkflowForEntity(db, input);
}

export async function applyApprovalDecisionToModuleEntity(db: Db, instance: InstanceRow) {
  return { synced: false, note: `Central approval ${instance.status} recorded. Module-specific status sync remains adapter-safe and non-destructive.` };
}

export async function syncModuleApprovalStatusFromInstance(db: Db, instance: InstanceRow) {
  // FALLBACK_SAFE_NO_STATUS_SYNC: central approvals are additive until module adapters opt in.
  return applyApprovalDecisionToModuleEntity(db, instance);
}

export async function previewApprovalWorkflowForEntity(db: Db, input: ApprovalContext) {
  const context = await getApprovalConditionContext(db, input);
  const match = await findMatchingApprovalWorkflow(db, str(input.module_key), str(input.action_key), context);
  const settings = await getSettings(db);
  if (!match.workflow) {
    return {
      matched_workflow: null,
      conditions_matched: [],
      steps: [],
      fallback_behavior: settings?.fallback_to_module_approval_if_no_workflow ? "MODULE_DEFAULT" : "BLOCK_IF_NO_MATCH",
      warnings: ["No central workflow matched; module fallback approval remains active."]
    };
  }
  const steps = await db.prepare("SELECT * FROM approval_workflow_steps WHERE workflow_id = ? AND is_enabled = 1 ORDER BY step_number").bind(match.workflow.id).all<StepRow>();
  const stepPreview = [];
  for (const step of steps.results) {
    const resolved = await resolveApprovalStepApprovers(db, step, context);
    stepPreview.push({
      ...stepToApi(step),
      approvers: resolved.approvers.map((user) => ({ user_id: user.id, name: settings?.default_employee_visibility_mode === "FULL_APPROVER_NAMES" ? user.name : null, role: "role" in user ? user.role ?? user.reason : user.reason })),
      warnings: resolved.warnings,
      self_approval_blocked_by_default: settings?.block_self_approval_by_default === 1
    });
  }
  return {
    matched_workflow: workflowToApi(match.workflow),
    conditions_matched: match.evaluated,
    steps: stepPreview,
    fallback_behavior: match.workflow.fallback_behavior,
    warnings: stepPreview.flatMap((step) => step.warnings)
  };
}

export async function getActiveApprovalDelegation(db: Db, userId: string, moduleKey?: string | null, actionKey?: string | null) {
  return db
    .prepare(
      `SELECT d.*, u.name AS delegate_name, u.email AS delegate_email
       FROM approval_delegation_rules d
       INNER JOIN users u ON u.id = d.delegate_user_id
       WHERE d.delegator_user_id = ?
         AND d.status = 'ACTIVE'
         AND d.start_at <= datetime('now')
         AND d.end_at >= datetime('now')
         AND (d.module_key IS NULL OR d.module_key = ?)
         AND (d.action_key IS NULL OR d.action_key = ?)
       ORDER BY d.created_at DESC
       LIMIT 1`
    )
    .bind(userId, moduleKey ?? "", actionKey ?? "")
    .first<Record<string, unknown>>();
}

export async function canDelegateApprovalToUser(db: Db, delegatorUserId: string, delegateUserId: string) {
  if (delegatorUserId === delegateUserId) return false;
  const user = await db.prepare("SELECT id FROM users WHERE id = ? AND status = 'ACTIVE'").bind(delegateUserId).first<{ id: string }>();
  return Boolean(user);
}

export async function applyApprovalDelegation(db: Db, stepAssignee: AssigneeRow, delegation: Record<string, unknown>) {
  const delegateId = String(delegation.delegate_user_id ?? "");
  const delegateName = String(delegation.delegate_name ?? "Delegate");
  await db
    .prepare(
      `INSERT OR IGNORE INTO approval_step_assignees (
        id, approval_instance_step_id, approval_instance_id, assigned_user_id, assigned_user_name_snapshot,
        assignment_type, status, delegated_from_user_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, 'DELEGATED', 'PENDING', ?, ?)`
    )
    .bind(crypto.randomUUID(), stepAssignee.approval_instance_step_id, stepAssignee.approval_instance_id, delegateId, delegateName, stepAssignee.assigned_user_id, json({ source_delegation_id: delegation.id }))
    .run();
  await db.prepare("UPDATE approval_step_assignees SET status = 'DELEGATED', updated_at = ? WHERE id = ?").bind(nowIso(), stepAssignee.id).run();
}

export async function createApprovalEscalationAction(db: Db, instance: InstanceRow, step: InstanceStepRow, actor?: AuthUser | null) {
  await createApprovalAction(db, { instance, stepId: step.id, action: "ESCALATED", actor: actor ?? null, previousStatus: step.status, newStatus: "ESCALATED" });
}

export async function refreshApprovalReminders(db: Db, actor?: AuthUser | null) {
  const rows = await db
    .prepare(
      `SELECT i.*, s.id AS step_id
       FROM approval_instances i
       INNER JOIN approval_instance_steps s ON s.approval_instance_id = i.id
       WHERE i.status IN ('PENDING', 'PARTIALLY_APPROVED')
         AND s.status = 'PENDING'
         AND s.reminder_due_at IS NOT NULL
         AND s.reminder_due_at <= datetime('now')`
    )
    .all<InstanceRow & { step_id: string }>();
  for (const row of rows.results) {
    await createApprovalAction(db, { instance: row, stepId: row.step_id, action: "REMINDER_SENT", actor: actor ?? null, newStatus: row.status });
  }
  return { reminders_created: rows.results.length };
}

export async function refreshApprovalEscalations(db: Db, actor?: AuthUser | null) {
  const rows = await db
    .prepare(
      `SELECT i.*, s.id AS step_id, s.status AS step_status
       FROM approval_instances i
       INNER JOIN approval_instance_steps s ON s.approval_instance_id = i.id
       WHERE i.status IN ('PENDING', 'PARTIALLY_APPROVED')
         AND s.status = 'PENDING'
         AND s.escalation_due_at IS NOT NULL
         AND s.escalation_due_at <= datetime('now')`
    )
    .all<InstanceRow & { step_id: string; step_status: string }>();
  for (const row of rows.results) {
    await db.prepare("UPDATE approval_instance_steps SET status = 'ESCALATED', updated_at = ? WHERE id = ?").bind(nowIso(), row.step_id).run();
    await createApprovalAction(db, { instance: row, stepId: row.step_id, action: "ESCALATED", actor: actor ?? null, previousStatus: row.step_status, newStatus: "ESCALATED" });
  }
  return { escalations_created: rows.results.length };
}

export function renderApprovalNotificationTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(values[key] ?? ""));
}

export async function queueApprovalNotification(db: Db, input: { event_type: string; module_key?: string | null; action_key?: string | null; values: Record<string, unknown> }) {
  const template = await db
    .prepare(
      `SELECT * FROM approval_notification_templates
       WHERE is_enabled = 1
         AND event_type = ?
         AND (module_key IS NULL OR module_key = ?)
         AND (action_key IS NULL OR action_key = ?)
       ORDER BY module_key DESC, action_key DESC
       LIMIT 1`
    )
    .bind(input.event_type, input.module_key ?? "", input.action_key ?? "")
    .first<Record<string, unknown>>();
  if (!template) return { queued: false, channel: "IN_APP", placeholder: true };
  return {
    queued: true,
    channel: template.channel,
    subject: renderApprovalNotificationTemplate(String(template.subject_template ?? ""), input.values),
    body: renderApprovalNotificationTemplate(String(template.body_template ?? ""), input.values),
    email_placeholder: template.channel === "EMAIL_PLACEHOLDER"
  };
}

export async function notifyApprovalSubmitted(db: Db, instance: InstanceRow) {
  return queueApprovalNotification(db, { event_type: "SUBMITTED", module_key: instance.module_key, action_key: instance.action_key, values: { request_title: instance.request_title, status: instance.status } });
}

export async function notifyApprovalDecision(db: Db, instance: InstanceRow, eventType: string) {
  return queueApprovalNotification(db, { event_type: eventType, module_key: instance.module_key, action_key: instance.action_key, values: { request_title: instance.request_title, status: instance.status } });
}

export async function notifyApprovalEscalated(db: Db, instance: InstanceRow) {
  return queueApprovalNotification(db, { event_type: "ESCALATED", module_key: instance.module_key, action_key: instance.action_key, values: { request_title: instance.request_title, status: instance.status } });
}

export async function notifyApprovalOverdue(db: Db, instance: InstanceRow) {
  return queueApprovalNotification(db, { event_type: "OVERDUE", module_key: instance.module_key, action_key: instance.action_key, values: { request_title: instance.request_title, status: instance.status } });
}

function actionError(c: ApprovalContextBinding, code: string) {
  const messages: Record<string, string> = {
    APPROVAL_INSTANCE_NOT_FOUND: "Approval instance was not found.",
    APPROVAL_STEP_NOT_ASSIGNED: "This approval step is not assigned to you.",
    APPROVAL_SELF_APPROVAL_BLOCKED: "Self-approval is blocked by approval settings.",
    APPROVAL_REASON_REQUIRED: "A reason is required for this decision.",
    APPROVAL_PERMISSION_DENIED: "You do not have approval permission."
  };
  return fail(c, code === "APPROVAL_INSTANCE_NOT_FOUND" ? 404 : 403, code, messages[code] ?? "Approval action failed.");
}

approvalRoutes.use("*", requireAuth);
selfServiceApprovalRoutes.use("*", requireAuth);
approvalReportRoutes.use("*", requireAuth);

approvalRoutes.get("/settings", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.settings.view", "approvals.settings.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval settings permission is required.");
  const settings = await getSettings(c.env.DB);
  return ok(c, { settings: settingsToApi(settings ?? {}) });
});

approvalRoutes.patch("/settings", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.settings.update", "approvals.settings.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval settings update permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const oldSettings = await getSettings(c.env.DB);
  const allowed = [
    "approval_workflows_enabled",
    "use_central_workflow_for_supported_modules",
    "fallback_to_module_approval_if_no_workflow",
    "allow_auto_approval",
    "block_self_approval_by_default",
    "allow_super_admin_self_approval_override",
    "allow_delegation",
    "allow_parallel_approvals",
    "allow_any_one_approval_mode",
    "allow_all_required_approval_mode",
    "escalation_enabled",
    "reminders_enabled",
    "default_escalation_time_basis",
    "default_employee_visibility_mode",
    "notify_on_submission",
    "notify_on_approval",
    "notify_on_rejection",
    "notify_on_send_back",
    "notify_on_escalation",
    "notify_on_overdue",
    "require_reason_for_reject",
    "require_reason_for_send_back",
    "require_reason_for_override"
  ];
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(typeof body[key] === "boolean" ? (body[key] ? 1 : 0) : body[key]);
    }
  }
  if (updates.length) {
    updates.push("updated_at = ?");
    params.push(nowIso(), "approval_workflow_settings_default");
    await c.env.DB.prepare(`UPDATE approval_workflow_settings SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run();
  }
  const settings = await getSettings(c.env.DB);
  await recordApprovalAudit(c, { action: "approval.settings.updated", entityType: "approval_workflow_settings", entityId: "approval_workflow_settings_default", oldValue: oldSettings, newValue: settings });
  return ok(c, { settings: settingsToApi(settings ?? {}) });
});

approvalRoutes.get("/workflows", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.workflows.view", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval workflow permission is required.");
  const { module_key, action_key, status } = c.req.query();
  const clauses: string[] = [];
  const params: string[] = [];
  if (module_key) {
    clauses.push("module_key = ?");
    params.push(module_key);
  }
  if (action_key) {
    clauses.push("action_key = ?");
    params.push(action_key);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await c.env.DB.prepare(`SELECT * FROM approval_workflows ${where} ORDER BY priority_number ASC, updated_at DESC`).bind(...params).all<WorkflowRow>();
  return ok(c, { workflows: rows.results.map(workflowToApi) });
});

approvalRoutes.post("/workflows", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.workflows.create", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Workflow create permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const code = str(body.workflow_code);
  const name = str(body.workflow_name);
  const moduleKey = str(body.module_key);
  const actionKey = str(body.action_key);
  const entityType = str(body.applies_to_entity_type, "generic");
  if (!code || !name || !moduleKey || !actionKey) return fail(c, 400, "APPROVAL_STEP_INVALID", "Workflow code, name, module, and action are required.");
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO approval_workflows (
        id, workflow_code, workflow_name, description, module_key, action_key, applies_to_entity_type,
        priority_number, is_default, is_enabled, fallback_behavior, status, effective_from, effective_to,
        created_by_user_id, updated_by_user_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      code,
      name,
      nullableStr(body.description),
      moduleKey,
      actionKey,
      entityType,
      num(body.priority_number, 100),
      bool(body.is_default) ? 1 : 0,
      bool(body.is_enabled, true) ? 1 : 0,
      validateIn(body.fallback_behavior, FALLBACK_BEHAVIORS, "MODULE_DEFAULT"),
      validateIn(body.status, WORKFLOW_STATUSES, "DRAFT"),
      nullableStr(body.effective_from),
      nullableStr(body.effective_to),
      user.id,
      user.id,
      json(body.metadata ?? { prompt: 16 })
    )
    .run();
  const workflow = await c.env.DB.prepare("SELECT * FROM approval_workflows WHERE id = ?").bind(id).first<WorkflowRow>();
  await recordApprovalAudit(c, { action: "approval.workflow.created", entityType: "approval_workflow", entityId: id, newValue: workflow });
  return ok(c, { workflow: workflow ? workflowToApi(workflow) : null }, 201);
});

approvalRoutes.get("/workflows/:workflowId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.workflows.view", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval workflow permission is required.");
  const workflow = await c.env.DB.prepare("SELECT * FROM approval_workflows WHERE id = ?").bind(c.req.param("workflowId")).first<WorkflowRow>();
  if (!workflow) return fail(c, 404, "APPROVAL_WORKFLOW_NOT_FOUND", "Approval workflow was not found.");
  const conditions = await c.env.DB.prepare("SELECT * FROM approval_workflow_conditions WHERE workflow_id = ? ORDER BY condition_group, condition_order").bind(workflow.id).all<ConditionRow>();
  const steps = await c.env.DB.prepare("SELECT * FROM approval_workflow_steps WHERE workflow_id = ? ORDER BY step_number").bind(workflow.id).all<StepRow>();
  return ok(c, { workflow: workflowToApi(workflow), conditions: conditions.results.map(conditionToApi), steps: steps.results.map(stepToApi) });
});

approvalRoutes.patch("/workflows/:workflowId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.workflows.update", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Workflow update permission is required.");
  const id = c.req.param("workflowId");
  const oldWorkflow = await c.env.DB.prepare("SELECT * FROM approval_workflows WHERE id = ?").bind(id).first<WorkflowRow>();
  if (!oldWorkflow) return fail(c, 404, "APPROVAL_WORKFLOW_NOT_FOUND", "Approval workflow was not found.");
  const body = await c.req.json<Record<string, unknown>>();
  await c.env.DB
    .prepare(
      `UPDATE approval_workflows
       SET workflow_name = ?, description = ?, module_key = ?, action_key = ?, applies_to_entity_type = ?,
           priority_number = ?, is_default = ?, is_enabled = ?, fallback_behavior = ?, status = ?,
           effective_from = ?, effective_to = ?, updated_by_user_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      str(body.workflow_name, oldWorkflow.workflow_name),
      body.description === undefined ? oldWorkflow.description : nullableStr(body.description),
      str(body.module_key, oldWorkflow.module_key),
      str(body.action_key, oldWorkflow.action_key),
      str(body.applies_to_entity_type, oldWorkflow.applies_to_entity_type),
      num(body.priority_number, oldWorkflow.priority_number),
      body.is_default === undefined ? oldWorkflow.is_default : bool(body.is_default) ? 1 : 0,
      body.is_enabled === undefined ? oldWorkflow.is_enabled : bool(body.is_enabled) ? 1 : 0,
      validateIn(body.fallback_behavior ?? oldWorkflow.fallback_behavior, FALLBACK_BEHAVIORS, "MODULE_DEFAULT"),
      validateIn(body.status ?? oldWorkflow.status, WORKFLOW_STATUSES, "DRAFT"),
      body.effective_from === undefined ? oldWorkflow.effective_from : nullableStr(body.effective_from),
      body.effective_to === undefined ? oldWorkflow.effective_to : nullableStr(body.effective_to),
      user.id,
      nowIso(),
      id
    )
    .run();
  const workflow = await c.env.DB.prepare("SELECT * FROM approval_workflows WHERE id = ?").bind(id).first<WorkflowRow>();
  await recordApprovalAudit(c, { action: "approval.workflow.updated", entityType: "approval_workflow", entityId: id, oldValue: oldWorkflow, newValue: workflow });
  return ok(c, { workflow: workflow ? workflowToApi(workflow) : null });
});

async function workflowStatusAction(c: ApprovalContextBinding, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  const user = c.get("currentUser");
  const required = status === "ARCHIVED" ? ["approvals.workflows.archive", "approvals.workflows.manage", "approvals.manage"] : ["approvals.workflows.update", "approvals.workflows.manage", "approvals.manage"];
  if (!requireAny(user, required)) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Workflow status permission is required.");
  const id = c.req.param("workflowId");
  const oldWorkflow = await c.env.DB.prepare("SELECT * FROM approval_workflows WHERE id = ?").bind(id).first<WorkflowRow>();
  if (!oldWorkflow) return fail(c, 404, "APPROVAL_WORKFLOW_NOT_FOUND", "Approval workflow was not found.");
  await c.env.DB.prepare("UPDATE approval_workflows SET status = ?, is_enabled = ?, archived_by_user_id = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_by_user_id END, archived_at = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_at END, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(status, status === "ACTIVE" ? 1 : 0, status, user.id, status, nowIso(), user.id, nowIso(), id).run();
  const workflow = await c.env.DB.prepare("SELECT * FROM approval_workflows WHERE id = ?").bind(id).first<WorkflowRow>();
  await recordApprovalAudit(c, { action: `approval.workflow.${status.toLowerCase()}`, entityType: "approval_workflow", entityId: id, oldValue: oldWorkflow, newValue: workflow });
  return ok(c, { workflow: workflow ? workflowToApi(workflow) : null });
}

approvalRoutes.post("/workflows/:workflowId/archive", (c) => workflowStatusAction(c, "ARCHIVED"));
approvalRoutes.post("/workflows/:workflowId/activate", (c) => workflowStatusAction(c, "ACTIVE"));
approvalRoutes.post("/workflows/:workflowId/deactivate", (c) => workflowStatusAction(c, "INACTIVE"));

approvalRoutes.post("/workflows/:workflowId/conditions", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.conditions.manage", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Condition manage permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const validated = await validateApprovalWorkflowCondition(body);
  if (!validated.ok) return fail(c, 400, "APPROVAL_CONDITION_INVALID", validated.message ?? "Invalid condition.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO approval_workflow_conditions (id, workflow_id, condition_group, condition_order, field_key, operator, value_json, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, c.req.param("workflowId"), str(body.condition_group, "default"), num(body.condition_order, 1), str(body.field_key), validated.operator, json(body.value ?? parseJson(String(body.value_json ?? "null"), null)), json(body.metadata ?? null)).run();
  await recordApprovalAudit(c, { action: "approval.condition.created", entityType: "approval_workflow_condition", entityId: id, newValue: body });
  return ok(c, { condition_id: id }, 201);
});

approvalRoutes.patch("/workflows/:workflowId/conditions/:conditionId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.conditions.manage", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Condition manage permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const oldCondition = await c.env.DB.prepare("SELECT * FROM approval_workflow_conditions WHERE id = ? AND workflow_id = ?").bind(c.req.param("conditionId"), c.req.param("workflowId")).first<ConditionRow>();
  if (!oldCondition) return fail(c, 404, "APPROVAL_CONDITION_INVALID", "Condition was not found.");
  const validated = await validateApprovalWorkflowCondition({ ...oldCondition, ...body });
  if (!validated.ok) return fail(c, 400, "APPROVAL_CONDITION_INVALID", validated.message ?? "Invalid condition.");
  await c.env.DB.prepare("UPDATE approval_workflow_conditions SET condition_group = ?, condition_order = ?, field_key = ?, operator = ?, value_json = ?, updated_at = ? WHERE id = ?").bind(str(body.condition_group, oldCondition.condition_group), num(body.condition_order, oldCondition.condition_order), str(body.field_key, oldCondition.field_key), validated.operator, body.value === undefined ? oldCondition.value_json : json(body.value), nowIso(), oldCondition.id).run();
  await recordApprovalAudit(c, { action: "approval.condition.updated", entityType: "approval_workflow_condition", entityId: oldCondition.id, oldValue: oldCondition, newValue: body });
  return ok(c, { updated: true });
});

approvalRoutes.delete("/workflows/:workflowId/conditions/:conditionId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.conditions.manage", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Condition manage permission is required.");
  await c.env.DB.prepare("DELETE FROM approval_workflow_conditions WHERE id = ? AND workflow_id = ?").bind(c.req.param("conditionId"), c.req.param("workflowId")).run();
  await recordApprovalAudit(c, { action: "approval.condition.deleted", entityType: "approval_workflow_condition", entityId: c.req.param("conditionId") });
  return ok(c, { deleted: true });
});

approvalRoutes.post("/workflows/:workflowId/steps", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.steps.manage", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Step manage permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const stepName = str(body.step_name);
  if (!stepName) return fail(c, 400, "APPROVAL_STEP_INVALID", "Step name is required.");
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO approval_workflow_steps (
        id, workflow_id, step_number, step_name, step_description, step_mode, approval_mode, approver_type,
        approver_user_id, approver_role_id, approver_permission_key, approver_scope_rule, minimum_job_level,
        allow_self_approval, skip_if_no_approver, fallback_approver_type, fallback_user_id, fallback_role_id,
        reminder_after_hours, escalation_after_hours, escalation_target_type, escalation_user_id, escalation_role_id,
        is_required, is_enabled, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, c.req.param("workflowId"), num(body.step_number, 1), stepName, nullableStr(body.step_description), validateIn(body.step_mode, STEP_MODES, "SEQUENTIAL"), validateIn(body.approval_mode, APPROVAL_MODES, "ANY_ONE"), validateIn(body.approver_type, APPROVER_TYPES, "ROLE"), nullableStr(body.approver_user_id), nullableStr(body.approver_role_id), nullableStr(body.approver_permission_key), nullableStr(body.approver_scope_rule), nullableStr(body.minimum_job_level), body.allow_self_approval === undefined ? null : bool(body.allow_self_approval) ? 1 : 0, bool(body.skip_if_no_approver) ? 1 : 0, nullableStr(body.fallback_approver_type), nullableStr(body.fallback_user_id), nullableStr(body.fallback_role_id), body.reminder_after_hours === undefined ? null : num(body.reminder_after_hours), body.escalation_after_hours === undefined ? null : num(body.escalation_after_hours), nullableStr(body.escalation_target_type), nullableStr(body.escalation_user_id), nullableStr(body.escalation_role_id), bool(body.is_required, true) ? 1 : 0, bool(body.is_enabled, true) ? 1 : 0, json(body.metadata ?? null))
    .run();
  await recordApprovalAudit(c, { action: "approval.step.created", entityType: "approval_workflow_step", entityId: id, newValue: body });
  return ok(c, { step_id: id }, 201);
});

approvalRoutes.patch("/workflows/:workflowId/steps/:stepId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.steps.manage", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Step manage permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const oldStep = await c.env.DB.prepare("SELECT * FROM approval_workflow_steps WHERE id = ? AND workflow_id = ?").bind(c.req.param("stepId"), c.req.param("workflowId")).first<StepRow>();
  if (!oldStep) return fail(c, 404, "APPROVAL_STEP_INVALID", "Workflow step was not found.");
  await c.env.DB
    .prepare(
      `UPDATE approval_workflow_steps
       SET step_number = ?, step_name = ?, step_description = ?, step_mode = ?, approval_mode = ?,
           approver_type = ?, approver_user_id = ?, approver_role_id = ?, approver_permission_key = ?,
           allow_self_approval = ?, skip_if_no_approver = ?, reminder_after_hours = ?, escalation_after_hours = ?,
           is_required = ?, is_enabled = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(num(body.step_number, oldStep.step_number), str(body.step_name, oldStep.step_name), body.step_description === undefined ? oldStep.step_description : nullableStr(body.step_description), validateIn(body.step_mode ?? oldStep.step_mode, STEP_MODES, "SEQUENTIAL"), validateIn(body.approval_mode ?? oldStep.approval_mode, APPROVAL_MODES, "ANY_ONE"), validateIn(body.approver_type ?? oldStep.approver_type, APPROVER_TYPES, "ROLE"), body.approver_user_id === undefined ? oldStep.approver_user_id : nullableStr(body.approver_user_id), body.approver_role_id === undefined ? oldStep.approver_role_id : nullableStr(body.approver_role_id), body.approver_permission_key === undefined ? oldStep.approver_permission_key : nullableStr(body.approver_permission_key), body.allow_self_approval === undefined ? oldStep.allow_self_approval : bool(body.allow_self_approval) ? 1 : 0, body.skip_if_no_approver === undefined ? oldStep.skip_if_no_approver : bool(body.skip_if_no_approver) ? 1 : 0, body.reminder_after_hours === undefined ? oldStep.reminder_after_hours : num(body.reminder_after_hours), body.escalation_after_hours === undefined ? oldStep.escalation_after_hours : num(body.escalation_after_hours), body.is_required === undefined ? oldStep.is_required : bool(body.is_required) ? 1 : 0, body.is_enabled === undefined ? oldStep.is_enabled : bool(body.is_enabled) ? 1 : 0, nowIso(), oldStep.id)
    .run();
  await recordApprovalAudit(c, { action: "approval.step.updated", entityType: "approval_workflow_step", entityId: oldStep.id, oldValue: oldStep, newValue: body });
  return ok(c, { updated: true });
});

approvalRoutes.delete("/workflows/:workflowId/steps/:stepId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.steps.manage", "approvals.workflows.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Step manage permission is required.");
  await c.env.DB.prepare("DELETE FROM approval_workflow_steps WHERE id = ? AND workflow_id = ?").bind(c.req.param("stepId"), c.req.param("workflowId")).run();
  await recordApprovalAudit(c, { action: "approval.step.deleted", entityType: "approval_workflow_step", entityId: c.req.param("stepId") });
  return ok(c, { deleted: true });
});

async function listInstances(c: ApprovalContextBinding, mode: string) {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.inbox.view", "approvals.instances.view", "approvals.view", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval inbox permission is required.");
  let sql = "SELECT DISTINCT i.* FROM approval_instances i";
  const params: unknown[] = [];
  if (mode === "inbox" || mode === "delegated" || mode === "history") {
    sql += " INNER JOIN approval_step_assignees asa ON asa.approval_instance_id = i.id";
  }
  const clauses: string[] = [];
  if (mode === "inbox") {
    clauses.push("asa.assigned_user_id = ?", "asa.status = 'PENDING'");
    params.push(user.id);
  } else if (mode === "submitted") {
    clauses.push("i.submitted_by_user_id = ?");
    params.push(user.id);
  } else if (mode === "history") {
    clauses.push("asa.assigned_user_id = ?", "asa.status IN ('APPROVED', 'REJECTED', 'SENT_BACK')");
    params.push(user.id);
  } else if (mode === "overdue") {
    sql += " INNER JOIN approval_instance_steps ais ON ais.approval_instance_id = i.id";
    clauses.push("ais.status IN ('PENDING', 'ESCALATED')", "ais.due_at IS NOT NULL", "ais.due_at <= datetime('now')");
  } else if (mode === "escalated") {
    sql += " INNER JOIN approval_instance_steps ais ON ais.approval_instance_id = i.id";
    clauses.push("ais.status = 'ESCALATED'");
  } else if (mode === "delegated") {
    clauses.push("asa.assigned_user_id = ?", "asa.assignment_type = 'DELEGATED'");
    params.push(user.id);
  }
  const { module_key, action_key, status } = c.req.query();
  if (module_key) {
    clauses.push("i.module_key = ?");
    params.push(module_key);
  }
  if (action_key) {
    clauses.push("i.action_key = ?");
    params.push(action_key);
  }
  if (status) {
    clauses.push("i.status = ?");
    params.push(status);
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += " ORDER BY i.updated_at DESC LIMIT 200";
  const rows = await c.env.DB.prepare(sql).bind(...params).all<InstanceRow>();
  return ok(c, { approvals: rows.results.map(instanceToApi) });
}

approvalRoutes.get("/inbox", (c) => listInstances(c, "inbox"));
approvalRoutes.get("/submitted", (c) => listInstances(c, "submitted"));
approvalRoutes.get("/history", (c) => listInstances(c, "history"));
approvalRoutes.get("/overdue", (c) => listInstances(c, "overdue"));
approvalRoutes.get("/escalated", (c) => listInstances(c, "escalated"));
approvalRoutes.get("/delegated-to-me", (c) => listInstances(c, "delegated"));

approvalRoutes.get("/instances/:instanceId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.instances.view", "approvals.view", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval view permission is required.");
  const instance = await getInstance(c.env.DB, c.req.param("instanceId"));
  if (!instance) return fail(c, 404, "APPROVAL_INSTANCE_NOT_FOUND", "Approval instance was not found.");
  if (instance.employee_id && !(await canAccessEmployee(c.env.DB, user, instance.employee_id, "approvals", "view"))) return fail(c, 404, "APPROVAL_INSTANCE_NOT_FOUND", "Approval instance was not found.");
  const steps = await c.env.DB.prepare("SELECT * FROM approval_instance_steps WHERE approval_instance_id = ? ORDER BY step_number").bind(instance.id).all<InstanceStepRow>();
  const assignees = await c.env.DB.prepare("SELECT * FROM approval_step_assignees WHERE approval_instance_id = ? ORDER BY created_at").bind(instance.id).all<AssigneeRow>();
  const timeline = await c.env.DB.prepare("SELECT * FROM approval_actions WHERE approval_instance_id = ? ORDER BY created_at").bind(instance.id).all<Record<string, unknown>>();
  return ok(c, { instance: instanceToApi(instance), steps: steps.results, assignees: assignees.results, timeline: timeline.results });
});

approvalRoutes.get("/instances/:instanceId/timeline", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.timeline.view", "approvals.instances.view", "approvals.view", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval timeline permission is required.");
  const instance = await getInstance(c.env.DB, c.req.param("instanceId"));
  if (!instance) return fail(c, 404, "APPROVAL_INSTANCE_NOT_FOUND", "Approval instance was not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM approval_actions WHERE approval_instance_id = ? ORDER BY created_at").bind(instance.id).all<Record<string, unknown>>();
  return ok(c, { timeline: rows.results });
});

approvalRoutes.get("/entity/:entityType/:entityId/timeline", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.timeline.view", "approvals.instances.view", "approvals.view", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval timeline permission is required.");
  const rows = await c.env.DB.prepare("SELECT * FROM approval_actions WHERE entity_type = ? AND entity_id = ? ORDER BY created_at").bind(c.req.param("entityType"), c.req.param("entityId")).all<Record<string, unknown>>();
  return ok(c, { timeline: rows.results });
});

approvalRoutes.post("/instances/:instanceId/approve", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.instances.approve", "approvals.manage"])) return actionError(c, "APPROVAL_PERMISSION_DENIED");
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const result = await approveApprovalStep(c.env.DB, c.req.param("instanceId"), user, nullableStr(body.note));
  if ("error" in result) return actionError(c, result.error ?? "APPROVAL_ACTION_FAILED");
  if (result.instance) await notifyApprovalDecision(c.env.DB, result.instance, "APPROVED");
  await recordApprovalAudit(c, { action: "approval.instance.approved", entityType: "approval_instance", entityId: c.req.param("instanceId"), reason: nullableStr(body.note) });
  return ok(c, { instance: result.instance ? instanceToApi(result.instance) : null });
});

approvalRoutes.post("/instances/:instanceId/reject", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.instances.reject", "approvals.manage"])) return actionError(c, "APPROVAL_PERMISSION_DENIED");
  const settings = await getSettings(c.env.DB);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const reason = str(body.reason);
  if (settings?.require_reason_for_reject === 1 && !reason) return actionError(c, "APPROVAL_REASON_REQUIRED");
  const result = await rejectApprovalStep(c.env.DB, c.req.param("instanceId"), user, reason);
  if ("error" in result) return actionError(c, result.error ?? "APPROVAL_ACTION_FAILED");
  if (result.instance) await notifyApprovalDecision(c.env.DB, result.instance, "REJECTED");
  await recordApprovalAudit(c, { action: "approval.instance.rejected", entityType: "approval_instance", entityId: c.req.param("instanceId"), reason });
  return ok(c, { instance: result.instance ? instanceToApi(result.instance) : null });
});

approvalRoutes.post("/instances/:instanceId/send-back", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.instances.send_back", "approvals.manage"])) return actionError(c, "APPROVAL_PERMISSION_DENIED");
  const settings = await getSettings(c.env.DB);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const reason = str(body.reason);
  if (settings?.require_reason_for_send_back === 1 && !reason) return actionError(c, "APPROVAL_REASON_REQUIRED");
  const result = await sendBackApprovalStep(c.env.DB, c.req.param("instanceId"), user, reason);
  if ("error" in result) return actionError(c, result.error ?? "APPROVAL_ACTION_FAILED");
  if (result.instance) await notifyApprovalDecision(c.env.DB, result.instance, "SENT_BACK");
  await recordApprovalAudit(c, { action: "approval.instance.sent_back", entityType: "approval_instance", entityId: c.req.param("instanceId"), reason });
  return ok(c, { instance: result.instance ? instanceToApi(result.instance) : null });
});

approvalRoutes.post("/instances/:instanceId/cancel", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.instances.cancel", "approvals.manage"])) return actionError(c, "APPROVAL_PERMISSION_DENIED");
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const reason = str(body.reason);
  if (!reason) return actionError(c, "APPROVAL_REASON_REQUIRED");
  const result = await cancelApprovalInstance(c.env.DB, c.req.param("instanceId"), user, reason);
  if ("error" in result) return actionError(c, result.error ?? "APPROVAL_ACTION_FAILED");
  await recordApprovalAudit(c, { action: "approval.instance.cancelled", entityType: "approval_instance", entityId: c.req.param("instanceId"), reason });
  return ok(c, { instance: result.instance ? instanceToApi(result.instance) : null });
});

approvalRoutes.post("/preview", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.preview.view", "approvals.view", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval preview permission is required.");
  const body = await c.req.json<ApprovalContext>();
  if (body.employee_id && !(await canAccessEmployee(c.env.DB, user, String(body.employee_id), "approvals", "view"))) return fail(c, 404, "APPROVAL_SCOPE_DENIED", "Employee is outside your approval scope.");
  const preview = await previewApprovalWorkflowForEntity(c.env.DB, { ...body, created_by_user_id: body.created_by_user_id ?? user.id });
  return ok(c, { preview });
});

approvalRoutes.get("/entity/:entityType/:entityId/preview", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.preview.view", "approvals.view", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval preview permission is required.");
  const preview = await previewApprovalWorkflowForEntity(c.env.DB, { module_key: c.req.query("module_key") ?? "generic", action_key: c.req.query("action_key") ?? "approval", entity_type: c.req.param("entityType"), entity_id: c.req.param("entityId"), created_by_user_id: user.id });
  return ok(c, { preview });
});

approvalRoutes.get("/delegations", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.delegations.view", "approvals.delegations.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Delegation view permission is required.");
  const rows = await c.env.DB.prepare("SELECT d.*, du.name AS delegator_name, de.name AS delegate_name FROM approval_delegation_rules d LEFT JOIN users du ON du.id = d.delegator_user_id LEFT JOIN users de ON de.id = d.delegate_user_id ORDER BY d.created_at DESC").all<Record<string, unknown>>();
  return ok(c, { delegations: rows.results });
});

approvalRoutes.post("/delegations", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.delegations.create", "approvals.delegations.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Delegation create permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const delegator = str(body.delegator_user_id, user.id);
  const delegate = str(body.delegate_user_id);
  if (!delegate || !(await canDelegateApprovalToUser(c.env.DB, delegator, delegate))) return fail(c, 400, "APPROVAL_DELEGATION_INVALID", "Delegate must be an active different user.");
  if (!str(body.start_at) || !str(body.end_at) || !str(body.reason)) return fail(c, 400, "APPROVAL_DELEGATION_INVALID", "Start, end, and reason are required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO approval_delegation_rules (id, delegator_user_id, delegate_user_id, module_key, action_key, start_at, end_at, reason, created_by_user_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, delegator, delegate, nullableStr(body.module_key), nullableStr(body.action_key), str(body.start_at), str(body.end_at), str(body.reason), user.id, json(body.metadata ?? null)).run();
  await recordApprovalAudit(c, { action: "approval.delegation.created", entityType: "approval_delegation_rule", entityId: id, newValue: body, reason: str(body.reason) });
  return ok(c, { delegation_id: id }, 201);
});

approvalRoutes.post("/delegations/:delegationId/cancel", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.delegations.cancel", "approvals.delegations.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Delegation cancel permission is required.");
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const reason = str(body.reason);
  if (!reason) return fail(c, 400, "APPROVAL_REASON_REQUIRED", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE approval_delegation_rules SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(user.id, nowIso(), reason, nowIso(), c.req.param("delegationId")).run();
  await recordApprovalAudit(c, { action: "approval.delegation.cancelled", entityType: "approval_delegation_rule", entityId: c.req.param("delegationId"), reason });
  return ok(c, { cancelled: true });
});

approvalRoutes.post("/reminders/refresh", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.escalations.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Reminder refresh permission is required.");
  const result = await refreshApprovalReminders(c.env.DB, user);
  await recordApprovalAudit(c, { action: "approval.reminders.refreshed", entityType: "approval_reminder", newValue: result });
  return ok(c, result);
});

approvalRoutes.post("/escalations/refresh", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.escalations.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Escalation refresh permission is required.");
  const result = await refreshApprovalEscalations(c.env.DB, user);
  await recordApprovalAudit(c, { action: "approval.escalations.refreshed", entityType: "approval_escalation", newValue: result });
  return ok(c, result);
});

approvalRoutes.get("/notification-templates", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.notification_templates.view", "approvals.notification_templates.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Notification template permission is required.");
  const rows = await c.env.DB.prepare("SELECT * FROM approval_notification_templates ORDER BY event_type, template_name").all<Record<string, unknown>>();
  return ok(c, { templates: rows.results });
});

approvalRoutes.patch("/notification-templates/:templateId", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["approvals.notification_templates.update", "approvals.notification_templates.manage", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Notification template update permission is required.");
  const body = await c.req.json<Record<string, unknown>>();
  const oldTemplate = await c.env.DB.prepare("SELECT * FROM approval_notification_templates WHERE id = ?").bind(c.req.param("templateId")).first<Record<string, unknown>>();
  if (!oldTemplate) return fail(c, 404, "APPROVAL_WORKFLOW_NOT_FOUND", "Notification template was not found.");
  await c.env.DB.prepare("UPDATE approval_notification_templates SET template_name = ?, subject_template = ?, body_template = ?, is_enabled = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(str(body.template_name, String(oldTemplate.template_name)), body.subject_template === undefined ? oldTemplate.subject_template : nullableStr(body.subject_template), str(body.body_template, String(oldTemplate.body_template)), body.is_enabled === undefined ? oldTemplate.is_enabled : bool(body.is_enabled) ? 1 : 0, user.id, nowIso(), c.req.param("templateId")).run();
  await recordApprovalAudit(c, { action: "approval.notification_template.updated", entityType: "approval_notification_template", entityId: c.req.param("templateId"), oldValue: oldTemplate, newValue: body });
  return ok(c, { updated: true });
});

selfServiceApprovalRoutes.get("/approvals", async (c) => {
  const user = c.get("currentUser");
  if (!requireAny(user, ["self_service.approvals.view", "self_service.view"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Self-service approval permission is required.");
  if (!user.employee_id) return ok(c, { approvals: [], timeline: [], message: "No linked employee account is available." });
  const rows = await c.env.DB.prepare("SELECT * FROM approval_instances WHERE employee_id = ? OR submitted_by_user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.employee_id, user.id).all<InstanceRow>();
  return ok(c, { approvals: rows.results.map(instanceToApi), visibility_mode: (await getSettings(c.env.DB))?.default_employee_visibility_mode ?? "STEP_NAMES_ONLY" });
});

async function reportRows(c: ApprovalContextBinding, kind: string) {
  const user = c.get("currentUser");
  if (!requireAny(user, ["reports.approvals.view", "approvals.reports.view", "approvals.manage"])) return fail(c, 403, "APPROVAL_PERMISSION_DENIED", "Approval report permission is required.");
  let rows;
  if (kind === "pending") rows = await c.env.DB.prepare("SELECT * FROM approval_instances WHERE status IN ('PENDING', 'PARTIALLY_APPROVED') ORDER BY updated_at DESC").all<Record<string, unknown>>();
  else if (kind === "overdue") rows = await c.env.DB.prepare("SELECT i.*, s.due_at FROM approval_instances i INNER JOIN approval_instance_steps s ON s.approval_instance_id = i.id WHERE s.status IN ('PENDING', 'ESCALATED') AND s.due_at <= datetime('now') ORDER BY s.due_at").all<Record<string, unknown>>();
  else if (kind === "history") rows = await c.env.DB.prepare("SELECT * FROM approval_actions ORDER BY created_at DESC LIMIT 500").all<Record<string, unknown>>();
  else if (kind === "by-module") rows = await c.env.DB.prepare("SELECT module_key, action_key, status, COUNT(*) AS count FROM approval_instances GROUP BY module_key, action_key, status ORDER BY module_key").all<Record<string, unknown>>();
  else if (kind === "workflow-usage") rows = await c.env.DB.prepare("SELECT workflow_code_snapshot, workflow_name_snapshot, status, COUNT(*) AS count FROM approval_instances GROUP BY workflow_code_snapshot, workflow_name_snapshot, status").all<Record<string, unknown>>();
  else if (kind === "turnaround-time") rows = await c.env.DB.prepare("SELECT module_key, action_key, AVG((julianday(COALESCE(completed_at, updated_at)) - julianday(submitted_at)) * 24.0) AS average_hours FROM approval_instances GROUP BY module_key, action_key").all<Record<string, unknown>>();
  else if (kind === "delegations") rows = await c.env.DB.prepare("SELECT * FROM approval_delegation_rules ORDER BY created_at DESC").all<Record<string, unknown>>();
  else if (kind === "escalations") rows = await c.env.DB.prepare("SELECT * FROM approval_actions WHERE action = 'ESCALATED' ORDER BY created_at DESC").all<Record<string, unknown>>();
  else rows = await c.env.DB.prepare("SELECT i.*, e.primary_department_id, e.primary_location_id FROM approval_instances i LEFT JOIN employees e ON e.id = i.employee_id ORDER BY i.created_at DESC").all<Record<string, unknown>>();
  return ok(c, { report: { key: `approvals/${kind}`, label: `Approval ${kind.replace(/-/g, " ")}`, rows: rows.results, columns: Object.keys(rows.results[0] ?? {}) } });
}

for (const kind of ["pending", "overdue", "history", "by-module", "by-department", "by-worksite", "escalations", "delegations", "workflow-usage", "turnaround-time"]) {
  approvalReportRoutes.get(`/approvals/${kind}`, (c) => reportRows(c, kind));
}

export { approvalRoutes, selfServiceApprovalRoutes, approvalReportRoutes };
