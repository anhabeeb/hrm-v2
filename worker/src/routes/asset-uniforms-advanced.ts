import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { createApprovalForModuleEntity, getModuleEntityApprovalSummary } from "./approvals";
import { publishAccessEvent } from "../realtime/publisher";
import type { AccessRealtimePayload } from "../realtime/publisher";
import type { AppBindings, Env } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type Row = Record<string, unknown>;
type BindValue = string | number | null;
type AssignmentGate = { response: Response; assignment?: undefined } | { response?: undefined; assignment: Row };
type ActionResult = {
  response: Response;
  assignment?: undefined;
  approval?: undefined;
  deduction?: undefined;
  new_assignment?: undefined;
} | {
  response?: undefined;
  assignment: Row;
  approval?: unknown;
  deduction?: Row;
  new_assignment?: Row;
};
type DeductionResult = { response: Response; deduction?: undefined } | { response?: undefined; deduction: Row };

const UNIFORM_ASSIGNMENT_ACTIONS = new Set(["ISSUED", "RETURNED", "PARTIALLY_RETURNED", "DAMAGED", "LOST", "DEDUCTION_PENDING", "DEDUCTION_APPLIED", "WAIVED", "CANCELLED"]);
const UNIFORM_TYPE_CATEGORIES = new Set(["SHIRT", "TROUSER", "APRON", "CAP", "SHOES", "NAME_BADGE", "OTHER"]);

export const assetUniformAdvancedRoutes = new Hono<AppBindings>();
export const uniformRoutes = new Hono<AppBindings>();
export const employeeAssetUniformRoutes = new Hono<AppBindings>();
export const selfServiceAssetUniformRoutes = new Hono<AppBindings>();

assetUniformAdvancedRoutes.use("*", requireAuth);
uniformRoutes.use("*", requireAuth);
employeeAssetUniformRoutes.use("*", requireAuth);
selfServiceAssetUniformRoutes.use("*", requireAuth);

function text(value: unknown) {
  return readString(value);
}

function optionalText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function upper(value: unknown) {
  return text(value).toUpperCase();
}

function numberValue(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerValue(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return nowIso().slice(0, 10);
}

function json(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

function has(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  return permissions.some((permission) => has(c, permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) {
      return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    }
    await next();
  });
}

async function audit(c: Context<AppBindings>, action: string, entityType: string, entityId: string | null, details: { oldValue?: unknown; newValue?: unknown; reason?: string | null } = {}) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action,
    module: "assets",
    entityType,
    entityId,
    oldValue: details.oldValue,
    newValue: details.newValue,
    reason: details.reason ?? null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publish(c: Context<AppBindings>, event: string, entityType: string, entityId: string, action: string) {
  const realtimeEntityType = entityType as AccessRealtimePayload["entity_type"];
  await publishAccessEvent(c.env, event as Parameters<typeof publishAccessEvent>[1], {
    actor_user_id: c.get("currentUser").id,
    entity_type: realtimeEntityType,
    entity_id: entityId,
    action
  });
  await publishAccessEvent(c.env, "assets.changed", {
    actor_user_id: c.get("currentUser").id,
    entity_type: realtimeEntityType,
    entity_id: entityId,
    action
  });
}

async function getAssetUniformSettings(db: Env["DB"]) {
  const existing = await db.prepare("SELECT * FROM asset_uniform_settings WHERE id = 'asset_uniform_settings_default'").first<Row>();
  if (existing) return existing;
  await db.prepare("INSERT OR IGNORE INTO asset_uniform_settings (id) VALUES ('asset_uniform_settings_default')").run();
  return (await db.prepare("SELECT * FROM asset_uniform_settings WHERE id = 'asset_uniform_settings_default'").first<Row>()) ?? {};
}

async function updateAssetUniformSettings(c: Context<AppBindings>) {
  const old = await getAssetUniformSettings(c.env.DB);
  const body = await readJsonBody(c.req.raw);
  const boolField = (name: string) => boolValue(body[name], old[name] === 1) ? 1 : 0;
  await c.env.DB
    .prepare(
      `UPDATE asset_uniform_settings SET
        asset_module_enabled = ?, uniform_module_enabled = ?, require_approval_before_asset_issue = ?,
        require_approval_before_asset_return = ?, require_approval_before_asset_transfer = ?,
        require_approval_before_damage_loss_deduction = ?, require_approval_before_waiver = ?,
        require_document_for_damage_loss = ?, require_photo_proof_placeholder = ?,
        allow_payroll_deduction_for_lost_damaged_items = ?, allow_final_settlement_deduction = ?,
        default_asset_clearance_required_before_final_settlement = ?, default_uniform_clearance_required_before_final_settlement = ?,
        default_damage_deduction_mode = ?, default_uniform_replacement_cycle_months = ?,
        allow_employee_self_service_asset_view = ?, allow_employee_self_service_uniform_view = ?,
        require_reason_for_waiver = ?, require_reason_for_deduction = ?, require_reason_for_cancel = ?,
        use_central_approval_workflow = ?, updated_at = ?, metadata_json = ?
       WHERE id = 'asset_uniform_settings_default'`
    )
    .bind(
      boolField("asset_module_enabled"),
      boolField("uniform_module_enabled"),
      boolField("require_approval_before_asset_issue"),
      boolField("require_approval_before_asset_return"),
      boolField("require_approval_before_asset_transfer"),
      boolField("require_approval_before_damage_loss_deduction"),
      boolField("require_approval_before_waiver"),
      boolField("require_document_for_damage_loss"),
      boolField("require_photo_proof_placeholder"),
      boolField("allow_payroll_deduction_for_lost_damaged_items"),
      boolField("allow_final_settlement_deduction"),
      boolField("default_asset_clearance_required_before_final_settlement"),
      boolField("default_uniform_clearance_required_before_final_settlement"),
      upper(body.default_damage_deduction_mode || old.default_damage_deduction_mode || "FULL_REPLACEMENT_VALUE"),
      numberValue(body.default_uniform_replacement_cycle_months, numberValue(old.default_uniform_replacement_cycle_months, null)),
      boolField("allow_employee_self_service_asset_view"),
      boolField("allow_employee_self_service_uniform_view"),
      boolField("require_reason_for_waiver"),
      boolField("require_reason_for_deduction"),
      boolField("require_reason_for_cancel"),
      boolField("use_central_approval_workflow"),
      nowIso(),
      json(body.metadata ?? null)
    )
    .run();
  const settings = await getAssetUniformSettings(c.env.DB);
  await audit(c, "asset_uniform.settings.updated", "asset_uniform_settings", "asset_uniform_settings_default", { oldValue: old, newValue: settings });
  await publish(c, "asset.uniform.settings.changed", "asset_uniform_settings", "asset_uniform_settings_default", "updated");
  return ok(c, { settings });
}

async function requireAssetModuleEnabled(c: Context<AppBindings>) {
  const settings = await getAssetUniformSettings(c.env.DB);
  if (settings.asset_module_enabled === 0) return fail(c, 403, "ASSET_MODULE_DISABLED", "Asset lifecycle management is disabled.");
  return null;
}

async function requireUniformModuleEnabled(c: Context<AppBindings>) {
  const settings = await getAssetUniformSettings(c.env.DB);
  if (settings.uniform_module_enabled === 0) return fail(c, 403, "UNIFORM_MODULE_DISABLED", "Uniform lifecycle management is disabled.");
  return null;
}

async function getEmployee(db: Env["DB"], employeeId: string) {
  return db.prepare("SELECT * FROM employees WHERE id = ? AND archived_at IS NULL").bind(employeeId).first<Row>();
}

async function canUseEmployee(c: Context<AppBindings>, employeeId: string, action: "view" | "manage") {
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "assets", action);
}

async function getAssetAssignment(c: Context<AppBindings>, assignmentId: string) {
  return c.env.DB
    .prepare(
      `SELECT aa.*, ai.code AS asset_code, COALESCE(ai.asset_code, ai.code) AS display_asset_code,
        ai.name AS asset_name, ai.replacement_cost, ai.current_value, ai.lifecycle_status,
        ai.status AS asset_item_status, ai.condition_status AS asset_condition_status,
        ac.type AS asset_category_type, ac.category_type, ac.name AS category_name,
        e.employee_no, e.full_name AS employee_name
       FROM employee_asset_assignments aa
       INNER JOIN asset_items ai ON ai.id = aa.asset_item_id
       INNER JOIN asset_categories ac ON ac.id = ai.category_id
       INNER JOIN employees e ON e.id = aa.employee_id
       WHERE aa.id = ?`
    )
    .bind(assignmentId)
    .first<Row>();
}

async function requireAssetAssignment(c: Context<AppBindings>, assignmentId: string, action: "view" | "manage"): Promise<AssignmentGate> {
  const assignment = await getAssetAssignment(c, assignmentId);
  if (!assignment || !(await canUseEmployee(c, String(assignment.employee_id), action))) {
    return { response: fail(c, 404, "ASSET_ASSIGNMENT_NOT_FOUND", "Asset assignment was not found.") };
  }
  return { assignment };
}

async function getUniformAssignment(c: Context<AppBindings>, assignmentId: string) {
  return c.env.DB
    .prepare(
      `SELECT ua.*, ut.code AS uniform_type_code, ut.name AS uniform_type_name, ut.category AS uniform_category,
        us.size_label AS stock_size_label, us.available_quantity, us.issued_quantity,
        e.employee_no, e.full_name AS employee_name
       FROM employee_uniform_assignments ua
       INNER JOIN uniform_types ut ON ut.id = ua.uniform_type_id
       INNER JOIN uniform_stock_items us ON us.id = ua.uniform_stock_item_id
       INNER JOIN employees e ON e.id = ua.employee_id
       WHERE ua.id = ?`
    )
    .bind(assignmentId)
    .first<Row>();
}

async function requireUniformAssignment(c: Context<AppBindings>, assignmentId: string, action: "view" | "manage"): Promise<AssignmentGate> {
  const assignment = await getUniformAssignment(c, assignmentId);
  if (!assignment || !(await canUseEmployee(c, String(assignment.employee_id), action))) {
    return { response: fail(c, 404, "UNIFORM_ASSIGNMENT_NOT_FOUND", "Uniform assignment was not found.") };
  }
  return { assignment };
}

async function validateEmployeeDocument(c: Context<AppBindings>, documentId: string | null, employeeId: string) {
  if (!documentId) return null;
  const row = await c.env.DB
    .prepare(
      `SELECT ed.*, dt.is_sensitive AS type_sensitive
       FROM employee_documents ed
       LEFT JOIN document_types dt ON dt.id = ed.document_type_id
       WHERE ed.id = ? AND ed.employee_id = ? AND ed.status = 'ACTIVE'
         AND ed.archived_at IS NULL AND ed.soft_deleted_at IS NULL`
    )
    .bind(documentId, employeeId)
    .first<Row>();
  if (!row) return fail(c, 400, "INVALID_DOCUMENT", "The linked document must be active and belong to the same employee.");
  if ((row.is_sensitive === 1 || row.type_sensitive === 1) && !hasAny(c, ["documents.sensitive.view", "documents.sensitive.download"])) {
    return fail(c, 403, "FORBIDDEN", "Sensitive documents require sensitive document permission.");
  }
  return null;
}

async function insertAssetUniformEvent(c: Context<AppBindings>, input: {
  entityType: "ASSET_ASSIGNMENT" | "UNIFORM_ASSIGNMENT";
  assignmentId: string;
  employeeId: string;
  action: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  amount?: number | null;
  metadata?: unknown;
}) {
  const user = c.get("currentUser");
  await c.env.DB
    .prepare(
      `INSERT INTO asset_uniform_assignment_events
       (id, entity_type, assignment_id, employee_id, action, previous_status, new_status, actor_user_id, actor_name_snapshot, reason, note, amount, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.entityType,
      input.assignmentId,
      input.employeeId,
      input.action,
      input.previousStatus ?? null,
      input.newStatus ?? null,
      user.id,
      user.name,
      input.reason ?? null,
      input.note ?? null,
      input.amount ?? null,
      json(input.metadata)
    )
    .run();
}

async function insertLegacyAssetEvent(c: Context<AppBindings>, assignment: Row, eventType: string, oldValue?: unknown, newValue?: unknown, reason?: string | null) {
  const allowedLegacyEvents = new Set(["ISSUED", "RETURNED", "DAMAGED", "LOST", "REPLACED", "WRITTEN_OFF", "DEDUCTION_LINKED", "NOTE_ADDED", "ATTACHMENT_ADDED", "ATTACHMENT_REMOVED"]);
  if (!allowedLegacyEvents.has(eventType)) return;
  await c.env.DB
    .prepare(
      `INSERT INTO employee_asset_assignment_events
       (id, assignment_id, employee_id, asset_item_id, event_type, old_value_json, new_value_json, reason, event_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      assignment.id,
      assignment.employee_id,
      assignment.asset_item_id,
      eventType,
      json(oldValue),
      json(newValue),
      reason ?? null,
      c.get("currentUser").id
    )
    .run();
}

async function createAssignmentApproval(c: Context<AppBindings>, entityType: "asset_assignment" | "uniform_assignment", assignmentId: string, employeeId: string, actionKey: string, title: string) {
  const settings = await getAssetUniformSettings(c.env.DB);
  if (settings.use_central_approval_workflow !== 1) return null;
  try {
    return await createApprovalForModuleEntity(c.env.DB, c.get("currentUser"), {
      module_key: "assets",
      action_key: actionKey,
      entity_type: entityType,
      entity_id: assignmentId,
      employee_id: employeeId,
      request_title: title
    });
  } catch {
    return null;
  }
}

export async function createAssetApprovalInstance(c: Context<AppBindings>, assignmentId: string, actionKey = "asset.clearance") {
  const gate = await requireAssetAssignment(c, assignmentId, "view");
  if (gate.response) return { response: gate.response };
  const instance = await createAssignmentApproval(c, "asset_assignment", assignmentId, String(gate.assignment.employee_id), actionKey, `Asset ${actionKey}`);
  return { instance };
}

export async function createUniformApprovalInstance(c: Context<AppBindings>, assignmentId: string, actionKey = "uniform.clearance") {
  const gate = await requireUniformAssignment(c, assignmentId, "view");
  if (gate.response) return { response: gate.response };
  const instance = await createAssignmentApproval(c, "uniform_assignment", assignmentId, String(gate.assignment.employee_id), actionKey, `Uniform ${actionKey}`);
  return { instance };
}

export async function getAssetAssignmentApprovalSummary(c: Context<AppBindings>, assignmentId: string) {
  return getModuleEntityApprovalSummary(c.env.DB, "asset_assignment", assignmentId);
}

export async function getUniformAssignmentApprovalSummary(c: Context<AppBindings>, assignmentId: string) {
  return getModuleEntityApprovalSummary(c.env.DB, "uniform_assignment", assignmentId);
}

export async function syncAssetAssignmentApprovalStatus(c: Context<AppBindings>, assignmentId: string) {
  const summary = await getAssetAssignmentApprovalSummary(c, assignmentId);
  return { synced: false, assignment_id: assignmentId, approval_summary: summary, note: "Asset assignment approval status is recorded through the central approval foundation." };
}

export async function syncUniformAssignmentApprovalStatus(c: Context<AppBindings>, assignmentId: string) {
  const summary = await getUniformAssignmentApprovalSummary(c, assignmentId);
  return { synced: false, assignment_id: assignmentId, approval_summary: summary, note: "Uniform assignment approval status is recorded through the central approval foundation." };
}

async function readTemplateByCodes(db: Env["DB"], codes: string[]) {
  for (const code of codes) {
    const row = await db.prepare("SELECT * FROM custom_deduction_templates WHERE code = ? AND status = 'ACTIVE'").bind(code).first<Row>();
    if (row) return row;
  }
  return null;
}

async function createCustomDeductionFromTemplate(c: Context<AppBindings>, input: {
  employeeId: string;
  templateCodes: string[];
  amount: number;
  currency?: string | null;
  source: "ASSET_DAMAGE" | "UNIFORM";
  sourceReferenceType: string;
  sourceReferenceId: string;
  reason: string;
  notes?: string | null;
}): Promise<DeductionResult> {
  const template = await readTemplateByCodes(c.env.DB, input.templateCodes);
  if (!template) {
    return { response: fail(c, 400, "CUSTOM_DEDUCTION_TEMPLATE_NOT_FOUND", "Active asset or uniform custom deduction template was not found.") };
  }
  const requiresApproval = template.require_approval === 1;
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_custom_deductions
       (id, employee_id, template_id, template_code_snapshot, template_name_snapshot, category_snapshot,
        deduction_type, amount_type, assigned_amount, assigned_percentage, currency, total_amount, remaining_balance,
        installment_count, installment_amount, recurrence_interval, effective_from, priority_number, show_on_payslip,
        show_in_self_service, include_in_final_settlement, approval_status, status, source, source_reference_type,
        source_reference_id, reason, notes, created_by_user_id, updated_by_user_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.employeeId,
      template.id,
      template.code,
      template.name,
      template.category,
      template.deduction_type,
      "FIXED_AMOUNT",
      input.amount,
      null,
      input.currency ?? template.default_currency ?? "MVR",
      input.amount,
      input.amount,
      numberValue(template.default_installment_count, null),
      numberValue(template.default_installment_count, null) ? Number((input.amount / Number(template.default_installment_count)).toFixed(2)) : input.amount,
      template.default_recurrence_interval ?? "PAYROLL_PERIOD",
      today(),
      numberValue(template.default_priority_number, 3),
      template.show_on_payslip === 0 ? 0 : 1,
      template.show_in_self_service === 0 ? 0 : 1,
      template.include_in_final_settlement === 0 ? 0 : 1,
      requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
      requiresApproval ? "DRAFT" : "ACTIVE",
      input.source,
      input.sourceReferenceType,
      input.sourceReferenceId,
      input.reason,
      input.notes ?? null,
      c.get("currentUser").id,
      c.get("currentUser").id,
      json({ created_from: "asset_uniform_lifecycle", source_reference_id: input.sourceReferenceId })
    )
    .run();
  const deduction = await c.env.DB.prepare("SELECT * FROM employee_custom_deductions WHERE id = ?").bind(id).first<Row>();
  if (!deduction) return { response: fail(c, 500, "CUSTOM_DEDUCTION_CREATE_FAILED", "The custom deduction could not be created.") };
  await audit(c, "asset_uniform.custom_deduction.created", "employee_custom_deduction", id, { newValue: deduction, reason: input.reason });
  return { deduction };
}

export async function createAssetDamageCustomDeduction(c: Context<AppBindings>, assignment: Row, amount: number, reason: string) {
  return createCustomDeductionFromTemplate(c, {
    employeeId: String(assignment.employee_id),
    templateCodes: ["ASSET_DAMAGE", "PROPERTY_DAMAGE"],
    amount,
    currency: optionalText(assignment.deduction_currency) ?? "MVR",
    source: "ASSET_DAMAGE",
    sourceReferenceType: "ASSET_ASSIGNMENT",
    sourceReferenceId: String(assignment.id),
    reason
  });
}

export async function createUniformDamageCustomDeduction(c: Context<AppBindings>, assignment: Row, amount: number, reason: string) {
  return createCustomDeductionFromTemplate(c, {
    employeeId: String(assignment.employee_id),
    templateCodes: ["UNIFORM_DEDUCTION", "ASSET_DAMAGE"],
    amount,
    currency: optionalText(assignment.deduction_currency) ?? "MVR",
    source: "UNIFORM",
    sourceReferenceType: "UNIFORM_ASSIGNMENT",
    sourceReferenceId: String(assignment.id),
    reason
  });
}

export async function linkAssetAssignmentToCustomDeduction(c: Context<AppBindings>, assignmentId: string, deductionId: string) {
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET custom_deduction_id = ?, deduction_status = 'APPLIED', updated_at = ? WHERE id = ?").bind(deductionId, nowIso(), assignmentId).run();
  return getAssetAssignment(c, assignmentId);
}

export async function linkUniformAssignmentToCustomDeduction(c: Context<AppBindings>, assignmentId: string, deductionId: string) {
  await c.env.DB.prepare("UPDATE employee_uniform_assignments SET custom_deduction_id = ?, deduction_status = 'APPLIED', updated_at = ? WHERE id = ?").bind(deductionId, nowIso(), assignmentId).run();
  return getUniformAssignment(c, assignmentId);
}

export async function issueAssetToEmployee(c: Context<AppBindings>, input: Row): Promise<ActionResult> {
  const disabled = await requireAssetModuleEnabled(c);
  if (disabled) return { response: disabled };
  const employeeId = text(input.employee_id ?? c.req.param("employeeId"));
  const assetItemId = text(input.asset_item_id);
  if (!employeeId || !assetItemId) return { response: fail(c, 400, "VALIDATION_ERROR", "Employee and asset item are required.") };
  const employee = await getEmployee(c.env.DB, employeeId);
  if (!employee || !(await canUseEmployee(c, employeeId, "manage"))) return { response: fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee was not found.") };
  const item = await c.env.DB.prepare("SELECT * FROM asset_items WHERE id = ? AND archived_at IS NULL").bind(assetItemId).first<Row>();
  if (!item) return { response: fail(c, 404, "ASSET_ITEM_NOT_FOUND", "Asset item was not found.") };
  if (String(item.status) !== "AVAILABLE" || ["ASSIGNED", "DAMAGED", "LOST", "ARCHIVED", "RETIRED"].includes(String(item.lifecycle_status ?? ""))) {
    return { response: fail(c, 400, "ASSET_NOT_AVAILABLE", "Only available asset items can be issued.") };
  }
  const invalidDocument = await validateEmployeeDocument(c, optionalText(input.document_id), employeeId);
  if (invalidDocument) return { response: invalidDocument };
  const id = crypto.randomUUID();
  const issuedDate = optionalText(input.issued_date ?? input.assigned_date) ?? today();
  const expectedReturnDate = optionalText(input.expected_return_date);
  const assignmentStatus = boolValue(input.require_approval, false) ? "PENDING_APPROVAL" : "ASSIGNED";
  await c.env.DB
    .prepare(
      `INSERT INTO employee_asset_assignments
       (id, employee_id, asset_item_id, assignment_number, assigned_date, issued_date, issued_by_user_id,
        expected_return_date, status, assignment_status, clearance_status, issued_condition_status,
        condition_on_issue, document_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?, 'PENDING', ?, ?, ?, ?)`
    )
    .bind(
      id,
      employeeId,
      assetItemId,
      optionalText(input.assignment_number),
      issuedDate,
      issuedDate,
      c.get("currentUser").id,
      expectedReturnDate,
      assignmentStatus,
      optionalText(input.issued_condition_status ?? input.condition_on_issue) ?? "GOOD",
      optionalText(input.condition_on_issue ?? input.issued_condition_status) ?? "GOOD",
      optionalText(input.document_id),
      optionalText(input.notes)
    )
    .run();
  await c.env.DB.prepare("UPDATE asset_items SET status = 'ISSUED', lifecycle_status = 'ASSIGNED', assigned_employee_id = ?, assigned_worksite_id = ?, assigned_location_id = ?, expected_return_date = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(employeeId, employee.primary_location_id ?? null, employee.primary_location_id ?? null, expectedReturnDate, c.get("currentUser").id, nowIso(), assetItemId).run();
  const saved = (await getAssetAssignment(c, id))!;
  await insertLegacyAssetEvent(c, saved, "ISSUED", null, saved, optionalText(input.notes));
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId: id, employeeId, action: "ISSUED", newStatus: assignmentStatus, reason: optionalText(input.notes), metadata: { asset_item_id: assetItemId } });
  await audit(c, "asset.assignment.issued", "asset_assignment", id, { newValue: saved, reason: optionalText(input.notes) });
  const approval = await createAssignmentApproval(c, "asset_assignment", id, employeeId, "asset.issue", `Asset issue: ${String(item.name)}`);
  await publish(c, "asset.assignment.changed", "asset_assignment", id, "issued");
  return { assignment: saved, approval };
}

export async function returnEmployeeAsset(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  const disabled = await requireAssetModuleEnabled(c);
  if (disabled) return { response: disabled };
  const gate = await requireAssetAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const returnDate = optionalText(input.returned_date) ?? today();
  const condition = optionalText(input.returned_condition_status ?? input.condition_on_return) ?? "GOOD";
  const itemStatus = condition === "DAMAGED" ? "DAMAGED" : "AVAILABLE";
  const lifecycle = condition === "DAMAGED" ? "DAMAGED" : "RETURNED";
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET status = 'RETURNED', assignment_status = 'RETURNED', clearance_status = 'RETURNED', returned_date = ?, returned_to_user_id = ?, returned_condition_status = ?, condition_on_return = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").bind(returnDate, c.get("currentUser").id, condition, condition, optionalText(input.notes ?? input.reason), nowIso(), assignment.id).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = ?, lifecycle_status = ?, condition_status = ?, assigned_employee_id = NULL, assigned_worksite_id = NULL, assigned_location_id = NULL, expected_return_date = NULL, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(itemStatus, lifecycle, condition, c.get("currentUser").id, nowIso(), assignment.asset_item_id).run();
  const saved = (await getAssetAssignment(c, assignmentId))!;
  await insertLegacyAssetEvent(c, saved, "RETURNED", assignment, saved, optionalText(input.reason ?? input.notes));
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: "RETURNED", previousStatus: String(assignment.assignment_status ?? assignment.status), newStatus: "RETURNED", reason: optionalText(input.reason ?? input.notes) });
  await audit(c, "asset.assignment.returned", "asset_assignment", assignmentId, { oldValue: assignment, newValue: saved, reason: optionalText(input.reason ?? input.notes) });
  await publish(c, "asset.assignment.changed", "asset_assignment", assignmentId, "returned");
  return { assignment: saved };
}

export async function transferEmployeeAsset(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  const disabled = await requireAssetModuleEnabled(c);
  if (disabled) return { response: disabled };
  const gate = await requireAssetAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const newEmployeeId = text(input.employee_id ?? input.new_employee_id);
  const reason = optionalText(input.reason);
  if (!newEmployeeId || !reason) return { response: fail(c, 400, "VALIDATION_ERROR", "New employee and transfer reason are required.") };
  const employee = await getEmployee(c.env.DB, newEmployeeId);
  if (!employee || !(await canUseEmployee(c, newEmployeeId, "manage"))) return { response: fail(c, 404, "EMPLOYEE_NOT_FOUND", "Target employee was not found.") };
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET status = 'RETURNED', assignment_status = 'TRANSFERRED', clearance_status = 'CLEARED', returned_date = ?, returned_to_user_id = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").bind(today(), c.get("currentUser").id, reason, nowIso(), assignment.id).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = 'AVAILABLE', lifecycle_status = 'RETURNED', assigned_employee_id = NULL, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), assignment.asset_item_id).run();
  const issued = await issueAssetToEmployee(c, { employee_id: newEmployeeId, asset_item_id: assignment.asset_item_id, issued_date: optionalText(input.issued_date) ?? today(), expected_return_date: optionalText(input.expected_return_date), notes: `Transfer from ${String(assignment.employee_name ?? assignment.employee_id)}: ${reason}` });
  if (issued.response) return { response: issued.response };
  const saved = (await getAssetAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: "TRANSFERRED", previousStatus: String(assignment.assignment_status ?? assignment.status), newStatus: "TRANSFERRED", reason, metadata: { new_employee_id: newEmployeeId, new_assignment_id: issued.assignment.id } });
  await audit(c, "asset.assignment.transferred", "asset_assignment", assignmentId, { oldValue: assignment, newValue: { original_assignment: saved, new_assignment: issued.assignment }, reason });
  await publish(c, "asset.assignment.changed", "asset_assignment", assignmentId, "transferred");
  return { assignment: saved, new_assignment: issued.assignment };
}

export async function markEmployeeAssetDamaged(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  return markAssetException(c, assignmentId, input, "DAMAGED");
}

export async function markEmployeeAssetLost(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  return markAssetException(c, assignmentId, input, "LOST");
}

async function markAssetException(c: Context<AppBindings>, assignmentId: string, input: Row, status: "DAMAGED" | "LOST"): Promise<ActionResult> {
  const disabled = await requireAssetModuleEnabled(c);
  if (disabled) return { response: disabled };
  const gate = await requireAssetAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const reason = optionalText(input.reason);
  if (!reason) return { response: fail(c, 400, "REASON_REQUIRED", "Reason is required.") };
  const deductionAmount = numberValue(input.deduction_amount, numberValue(assignment.current_value, numberValue(assignment.replacement_cost, null)));
  const assignmentStatus = status === "DAMAGED" ? "DAMAGED" : "LOST";
  await c.env.DB.prepare(`UPDATE employee_asset_assignments SET status = ?, assignment_status = ?, clearance_status = ?, deduction_amount = COALESCE(?, deduction_amount), deduction_currency = COALESCE(?, deduction_currency), ${status === "DAMAGED" ? "damage_reported_by_user_id = ?, damage_reported_at = ?" : "lost_reported_by_user_id = ?, lost_reported_at = ?"}, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`).bind(status, assignmentStatus, status, deductionAmount, optionalText(input.deduction_currency) ?? "MVR", c.get("currentUser").id, nowIso(), reason, nowIso(), assignment.id).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = ?, lifecycle_status = ?, condition_status = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(status, status, status, c.get("currentUser").id, nowIso(), assignment.asset_item_id).run();
  const saved = (await getAssetAssignment(c, assignmentId))!;
  await insertLegacyAssetEvent(c, saved, status, assignment, saved, reason);
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: status === "DAMAGED" ? "MARKED_DAMAGED" : "MARKED_LOST", previousStatus: String(assignment.assignment_status ?? assignment.status), newStatus: assignmentStatus, reason, amount: deductionAmount });
  await audit(c, status === "DAMAGED" ? "asset.assignment.marked_damaged" : "asset.assignment.marked_lost", "asset_assignment", assignmentId, { oldValue: assignment, newValue: saved, reason });
  await createAssignmentApproval(c, "asset_assignment", assignmentId, String(assignment.employee_id), status === "DAMAGED" ? "asset.damage" : "asset.lost", `${status === "DAMAGED" ? "Asset damage" : "Asset lost"}: ${String(assignment.asset_name)}`);
  await publish(c, "asset.assignment.changed", "asset_assignment", assignmentId, status.toLowerCase());
  return { assignment: saved };
}

export async function applyAssetDeduction(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  const gate = await requireAssetAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const reason = optionalText(input.reason);
  if (!reason) return { response: fail(c, 400, "REASON_REQUIRED", "Deduction reason is required.") };
  const amount = numberValue(input.deduction_amount, numberValue(assignment.deduction_amount, null));
  if (amount === null || amount < 0) return { response: fail(c, 400, "VALIDATION_ERROR", "A valid deduction amount is required.") };
  const created = await createAssetDamageCustomDeduction(c, assignment, amount, reason);
  if (created.response) return { response: created.response };
  const saved = await linkAssetAssignmentToCustomDeduction(c, assignmentId, String(created.deduction.id));
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET assignment_status = 'DEDUCTION_APPLIED', clearance_status = 'DEDUCTION_APPLIED', deduction_amount = ?, deduction_status = 'APPLIED', updated_at = ? WHERE id = ?").bind(amount, nowIso(), assignmentId).run();
  const updated = (await getAssetAssignment(c, assignmentId))!;
  await insertLegacyAssetEvent(c, updated, "DEDUCTION_LINKED", assignment, updated, reason);
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: "DEDUCTION_APPLIED", previousStatus: String(assignment.assignment_status ?? assignment.status), newStatus: "DEDUCTION_APPLIED", reason, amount, metadata: { custom_deduction_id: created.deduction.id } });
  await audit(c, "asset.assignment.deduction_applied", "asset_assignment", assignmentId, { oldValue: assignment, newValue: updated, reason });
  await publish(c, "asset.assignment.changed", "asset_assignment", assignmentId, "deduction_applied");
  return { assignment: saved ?? updated, deduction: created.deduction };
}

export async function waiveAssetDeduction(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  const gate = await requireAssetAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const settings = await getAssetUniformSettings(c.env.DB);
  const reason = optionalText(input.reason);
  if (settings.require_reason_for_waiver === 1 && !reason) return { response: fail(c, 400, "REASON_REQUIRED", "Waiver reason is required.") };
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET assignment_status = 'WAIVED', clearance_status = 'WAIVED', deduction_status = 'WAIVED', waiver_by_user_id = ?, waiver_at = ?, waiver_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), reason, nowIso(), assignmentId).run();
  const saved = (await getAssetAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: "DEDUCTION_WAIVED", previousStatus: String(assignment.assignment_status ?? assignment.status), newStatus: "WAIVED", reason });
  await audit(c, "asset.assignment.deduction_waived", "asset_assignment", assignmentId, { oldValue: assignment, newValue: saved, reason });
  await publish(c, "asset.assignment.changed", "asset_assignment", assignmentId, "waived");
  return { assignment: saved };
}

export async function getEmployeeAssetClearanceStatus(db: Env["DB"], employeeId: string) {
  const rows = await db
    .prepare(
      `SELECT eaa.*, ai.code AS asset_code, ai.name AS asset_name, ai.replacement_cost, ai.current_value
       FROM employee_asset_assignments eaa
       INNER JOIN asset_items ai ON ai.id = eaa.asset_item_id
       INNER JOIN asset_categories ac ON ac.id = ai.category_id
       WHERE eaa.employee_id = ?
         AND ac.type = 'ASSET'
         AND COALESCE(eaa.assignment_status, eaa.status) IN ('ASSIGNED', 'ISSUED', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING')`
    )
    .bind(employeeId)
    .all<Row>();
  const deductions = rows.results.reduce((sum, row) => sum + Math.max(0, numberValue(row.deduction_amount, numberValue(row.current_value, numberValue(row.replacement_cost, 0))) ?? 0), 0);
  return {
    pending_count: rows.results.length,
    pending_items: rows.results,
    estimated_deduction_amount: Number(deductions.toFixed(2)),
    clearance_required: rows.results.length > 0
  };
}

export async function issueUniformToEmployee(c: Context<AppBindings>, input: Row): Promise<ActionResult> {
  const disabled = await requireUniformModuleEnabled(c);
  if (disabled) return { response: disabled };
  const employeeId = text(input.employee_id ?? c.req.param("employeeId"));
  const stockId = text(input.uniform_stock_item_id);
  const quantity = Math.max(1, integerValue(input.quantity_issued, 1));
  if (!employeeId || !stockId) return { response: fail(c, 400, "VALIDATION_ERROR", "Employee and uniform stock item are required.") };
  const employee = await getEmployee(c.env.DB, employeeId);
  if (!employee || !(await canUseEmployee(c, employeeId, "manage"))) return { response: fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee was not found.") };
  const stock = await c.env.DB.prepare("SELECT us.*, ut.name AS uniform_type_name FROM uniform_stock_items us INNER JOIN uniform_types ut ON ut.id = us.uniform_type_id WHERE us.id = ? AND us.status = 'ACTIVE' AND ut.status = 'ACTIVE'").bind(stockId).first<Row>();
  if (!stock) return { response: fail(c, 404, "UNIFORM_STOCK_NOT_FOUND", "Uniform stock item was not found.") };
  if (numberValue(stock.available_quantity, 0)! < quantity) return { response: fail(c, 400, "UNIFORM_STOCK_INSUFFICIENT", "Not enough uniform stock is available.") };
  const invalidDocument = await validateEmployeeDocument(c, optionalText(input.document_id), employeeId);
  if (invalidDocument) return { response: invalidDocument };
  const id = crypto.randomUUID();
  const issuedDate = optionalText(input.issued_date) ?? today();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_uniform_assignments
       (id, employee_id, uniform_stock_item_id, uniform_type_id, assignment_number, size_label, quantity_issued,
        issued_date, expected_return_date, issued_condition_status, assignment_status, clearance_status,
        issued_by_user_id, document_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', 'PENDING', ?, ?, ?)`
    )
    .bind(
      id,
      employeeId,
      stockId,
      stock.uniform_type_id,
      optionalText(input.assignment_number),
      optionalText(input.size_label) ?? optionalText(stock.size_label),
      quantity,
      issuedDate,
      optionalText(input.expected_return_date),
      optionalText(input.issued_condition_status) ?? "GOOD",
      c.get("currentUser").id,
      optionalText(input.document_id),
      optionalText(input.notes)
    )
    .run();
  await c.env.DB.prepare("UPDATE uniform_stock_items SET available_quantity = available_quantity - ?, issued_quantity = issued_quantity + ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(quantity, quantity, c.get("currentUser").id, nowIso(), stockId).run();
  const saved = (await getUniformAssignment(c, id))!;
  await insertAssetUniformEvent(c, { entityType: "UNIFORM_ASSIGNMENT", assignmentId: id, employeeId, action: "ISSUED", newStatus: "ISSUED", reason: optionalText(input.notes), amount: quantity, metadata: { uniform_stock_item_id: stockId } });
  await audit(c, "uniform.assignment.issued", "uniform_assignment", id, { newValue: saved, reason: optionalText(input.notes) });
  const approval = await createAssignmentApproval(c, "uniform_assignment", id, employeeId, "uniform.issue", `Uniform issue: ${String(stock.uniform_type_name)}`);
  await publish(c, "uniform.assignment.changed", "uniform_assignment", id, "issued");
  return { assignment: saved, approval };
}

export async function returnEmployeeUniform(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  const gate = await requireUniformAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const outstanding = Math.max(0, integerValue(assignment.quantity_issued) - integerValue(assignment.quantity_returned) - integerValue(assignment.quantity_damaged) - integerValue(assignment.quantity_lost));
  const quantity = Math.min(outstanding, Math.max(1, integerValue(input.quantity_returned, outstanding || 1)));
  if (quantity <= 0) return { response: fail(c, 400, "UNIFORM_ALREADY_CLEARED", "No outstanding uniform quantity is available to return.") };
  const totalReturned = integerValue(assignment.quantity_returned) + quantity;
  const fullyReturned = totalReturned + integerValue(assignment.quantity_damaged) + integerValue(assignment.quantity_lost) >= integerValue(assignment.quantity_issued);
  const status = fullyReturned ? "RETURNED" : "PARTIALLY_RETURNED";
  await c.env.DB.prepare("UPDATE employee_uniform_assignments SET quantity_returned = ?, returned_date = ?, returned_to_user_id = ?, returned_condition_status = ?, assignment_status = ?, clearance_status = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").bind(totalReturned, optionalText(input.returned_date) ?? today(), c.get("currentUser").id, optionalText(input.returned_condition_status) ?? "GOOD", status, fullyReturned ? "RETURNED" : "PENDING", optionalText(input.reason ?? input.notes), nowIso(), assignmentId).run();
  await c.env.DB.prepare("UPDATE uniform_stock_items SET available_quantity = available_quantity + ?, issued_quantity = MAX(0, issued_quantity - ?), updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(quantity, quantity, c.get("currentUser").id, nowIso(), assignment.uniform_stock_item_id).run();
  const saved = (await getUniformAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "UNIFORM_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: "RETURNED", previousStatus: String(assignment.assignment_status), newStatus: status, reason: optionalText(input.reason ?? input.notes), amount: quantity });
  await audit(c, "uniform.assignment.returned", "uniform_assignment", assignmentId, { oldValue: assignment, newValue: saved, reason: optionalText(input.reason ?? input.notes) });
  await publish(c, "uniform.assignment.changed", "uniform_assignment", assignmentId, "returned");
  return { assignment: saved };
}

export async function markEmployeeUniformDamaged(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  return markUniformException(c, assignmentId, input, "DAMAGED");
}

export async function markEmployeeUniformLost(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  return markUniformException(c, assignmentId, input, "LOST");
}

async function markUniformException(c: Context<AppBindings>, assignmentId: string, input: Row, status: "DAMAGED" | "LOST"): Promise<ActionResult> {
  const gate = await requireUniformAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const reason = optionalText(input.reason);
  if (!reason) return { response: fail(c, 400, "REASON_REQUIRED", "Reason is required.") };
  const outstanding = Math.max(0, integerValue(assignment.quantity_issued) - integerValue(assignment.quantity_returned) - integerValue(assignment.quantity_damaged) - integerValue(assignment.quantity_lost));
  const quantity = Math.min(outstanding || integerValue(assignment.quantity_issued), Math.max(1, integerValue(input.quantity, outstanding || 1)));
  const amount = numberValue(input.deduction_amount, null);
  const quantityColumn = status === "DAMAGED" ? "quantity_damaged" : "quantity_lost";
  const reportedUserColumn = status === "DAMAGED" ? "damage_reported_by_user_id" : "lost_reported_by_user_id";
  const reportedAtColumn = status === "DAMAGED" ? "damage_reported_at" : "lost_reported_at";
  const stockColumn = status === "DAMAGED" ? "damaged_quantity" : "lost_quantity";
  await c.env.DB.prepare(`UPDATE employee_uniform_assignments SET ${quantityColumn} = ${quantityColumn} + ?, assignment_status = ?, clearance_status = ?, deduction_amount = COALESCE(?, deduction_amount), deduction_currency = COALESCE(?, deduction_currency), ${reportedUserColumn} = ?, ${reportedAtColumn} = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`).bind(quantity, status, status, amount, optionalText(input.deduction_currency) ?? "MVR", c.get("currentUser").id, nowIso(), reason, nowIso(), assignmentId).run();
  await c.env.DB.prepare(`UPDATE uniform_stock_items SET ${stockColumn} = ${stockColumn} + ?, issued_quantity = MAX(0, issued_quantity - ?), updated_by_user_id = ?, updated_at = ? WHERE id = ?`).bind(quantity, quantity, c.get("currentUser").id, nowIso(), assignment.uniform_stock_item_id).run();
  const saved = (await getUniformAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "UNIFORM_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: status === "DAMAGED" ? "MARKED_DAMAGED" : "MARKED_LOST", previousStatus: String(assignment.assignment_status), newStatus: status, reason, amount });
  await audit(c, status === "DAMAGED" ? "uniform.assignment.marked_damaged" : "uniform.assignment.marked_lost", "uniform_assignment", assignmentId, { oldValue: assignment, newValue: saved, reason });
  await createAssignmentApproval(c, "uniform_assignment", assignmentId, String(assignment.employee_id), status === "DAMAGED" ? "uniform.damage" : "uniform.lost", `${status === "DAMAGED" ? "Uniform damage" : "Uniform lost"}: ${String(assignment.uniform_type_name)}`);
  await publish(c, "uniform.assignment.changed", "uniform_assignment", assignmentId, status.toLowerCase());
  return { assignment: saved };
}

export async function applyUniformDeduction(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  const gate = await requireUniformAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const reason = optionalText(input.reason);
  if (!reason) return { response: fail(c, 400, "REASON_REQUIRED", "Deduction reason is required.") };
  const amount = numberValue(input.deduction_amount, numberValue(assignment.deduction_amount, null));
  if (amount === null || amount < 0) return { response: fail(c, 400, "VALIDATION_ERROR", "A valid deduction amount is required.") };
  const created = await createUniformDamageCustomDeduction(c, assignment, amount, reason);
  if (created.response) return { response: created.response };
  const saved = await linkUniformAssignmentToCustomDeduction(c, assignmentId, String(created.deduction.id));
  await c.env.DB.prepare("UPDATE employee_uniform_assignments SET assignment_status = 'DEDUCTION_APPLIED', clearance_status = 'DEDUCTION_APPLIED', deduction_amount = ?, deduction_status = 'APPLIED', updated_at = ? WHERE id = ?").bind(amount, nowIso(), assignmentId).run();
  const updated = (await getUniformAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "UNIFORM_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: "DEDUCTION_APPLIED", previousStatus: String(assignment.assignment_status), newStatus: "DEDUCTION_APPLIED", reason, amount, metadata: { custom_deduction_id: created.deduction.id } });
  await audit(c, "uniform.assignment.deduction_applied", "uniform_assignment", assignmentId, { oldValue: assignment, newValue: updated, reason });
  await publish(c, "uniform.assignment.changed", "uniform_assignment", assignmentId, "deduction_applied");
  return { assignment: saved ?? updated, deduction: created.deduction };
}

export async function waiveUniformDeduction(c: Context<AppBindings>, assignmentId: string, input: Row): Promise<ActionResult> {
  const gate = await requireUniformAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const assignment = gate.assignment;
  const settings = await getAssetUniformSettings(c.env.DB);
  const reason = optionalText(input.reason);
  if (settings.require_reason_for_waiver === 1 && !reason) return { response: fail(c, 400, "REASON_REQUIRED", "Waiver reason is required.") };
  await c.env.DB.prepare("UPDATE employee_uniform_assignments SET assignment_status = 'WAIVED', clearance_status = 'WAIVED', deduction_status = 'WAIVED', waiver_by_user_id = ?, waiver_at = ?, waiver_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), reason, nowIso(), assignmentId).run();
  const saved = (await getUniformAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "UNIFORM_ASSIGNMENT", assignmentId, employeeId: String(assignment.employee_id), action: "DEDUCTION_WAIVED", previousStatus: String(assignment.assignment_status), newStatus: "WAIVED", reason });
  await audit(c, "uniform.assignment.deduction_waived", "uniform_assignment", assignmentId, { oldValue: assignment, newValue: saved, reason });
  await publish(c, "uniform.assignment.changed", "uniform_assignment", assignmentId, "waived");
  return { assignment: saved };
}

export async function getEmployeeUniformClearanceStatus(db: Env["DB"], employeeId: string) {
  const rows = await db
    .prepare(
      `SELECT ua.*, ut.code AS uniform_type_code, ut.name AS uniform_type_name, ut.default_deduction_amount
       FROM employee_uniform_assignments ua
       INNER JOIN uniform_types ut ON ut.id = ua.uniform_type_id
       WHERE ua.employee_id = ? AND ua.assignment_status IN ('ISSUED', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING')`
    )
    .bind(employeeId)
    .all<Row>();
  const deductions = rows.results.reduce((sum, row) => sum + Math.max(0, numberValue(row.deduction_amount, numberValue(row.default_deduction_amount, 0)) ?? 0), 0);
  return {
    pending_count: rows.results.length,
    pending_items: rows.results,
    estimated_deduction_amount: Number(deductions.toFixed(2)),
    clearance_required: rows.results.length > 0
  };
}

export async function getAssetClearanceForSettlement(db: Env["DB"], employeeId: string) {
  return getEmployeeAssetClearanceStatus(db, employeeId);
}

export async function getUniformClearanceForSettlement(db: Env["DB"], employeeId: string) {
  return getEmployeeUniformClearanceStatus(db, employeeId);
}

export async function calculateAssetDeductionsForSettlement(db: Env["DB"], employeeId: string) {
  return getEmployeeAssetClearanceStatus(db, employeeId);
}

export async function calculateUniformDeductionsForSettlement(db: Env["DB"], employeeId: string) {
  return getEmployeeUniformClearanceStatus(db, employeeId);
}

export async function getEmployeeAssetUniformClearanceSummary(db: Env["DB"], employeeId: string) {
  const [asset_clearance, uniform_clearance] = await Promise.all([
    getEmployeeAssetClearanceStatus(db, employeeId),
    getEmployeeUniformClearanceStatus(db, employeeId)
  ]);
  return {
    asset_clearance,
    uniform_clearance,
    pending_count: asset_clearance.pending_count + uniform_clearance.pending_count,
    estimated_deduction_amount: Number((asset_clearance.estimated_deduction_amount + uniform_clearance.estimated_deduction_amount).toFixed(2)),
    clearance_required: asset_clearance.clearance_required || uniform_clearance.clearance_required
  };
}

export async function linkAssetAssignmentDocument(c: Context<AppBindings>, assignmentId: string, documentId: string) {
  const gate = await requireAssetAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const invalid = await validateEmployeeDocument(c, documentId, String(gate.assignment.employee_id));
  if (invalid) return { response: invalid };
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET document_id = ?, updated_at = ? WHERE id = ?").bind(documentId, nowIso(), assignmentId).run();
  const saved = (await getAssetAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId, employeeId: String(saved.employee_id), action: "DOCUMENT_LINKED", newStatus: String(saved.assignment_status ?? saved.status), metadata: { document_id: documentId } });
  return { assignment: saved };
}

export async function linkUniformAssignmentDocument(c: Context<AppBindings>, assignmentId: string, documentId: string) {
  const gate = await requireUniformAssignment(c, assignmentId, "manage");
  if (gate.response) return { response: gate.response };
  const invalid = await validateEmployeeDocument(c, documentId, String(gate.assignment.employee_id));
  if (invalid) return { response: invalid };
  await c.env.DB.prepare("UPDATE employee_uniform_assignments SET document_id = ?, updated_at = ? WHERE id = ?").bind(documentId, nowIso(), assignmentId).run();
  const saved = (await getUniformAssignment(c, assignmentId))!;
  await insertAssetUniformEvent(c, { entityType: "UNIFORM_ASSIGNMENT", assignmentId, employeeId: String(saved.employee_id), action: "DOCUMENT_LINKED", newStatus: String(saved.assignment_status), metadata: { document_id: documentId } });
  return { assignment: saved };
}

export async function getAssetAssignmentDocumentStatus(c: Context<AppBindings>, assignmentId: string) {
  const gate = await requireAssetAssignment(c, assignmentId, "view");
  if (gate.response) return { response: gate.response };
  return { document_id: gate.assignment.document_id ?? null, document_linked: Boolean(gate.assignment.document_id) };
}

export async function getUniformAssignmentDocumentStatus(c: Context<AppBindings>, assignmentId: string) {
  const gate = await requireUniformAssignment(c, assignmentId, "view");
  if (gate.response) return { response: gate.response };
  return { document_id: gate.assignment.document_id ?? null, document_linked: Boolean(gate.assignment.document_id) };
}

assetUniformAdvancedRoutes.get("/settings", requireAnyPermission(["assets.settings.manage", "assets.view"]), async (c) => ok(c, { settings: await getAssetUniformSettings(c.env.DB) }));

assetUniformAdvancedRoutes.patch("/settings", requireAnyPermission(["assets.settings.manage"]), async (c) => {
  const old = await getAssetUniformSettings(c.env.DB);
  const body = await readJsonBody(c.req.raw);
  const boolField = (name: string) => boolValue(body[name], old[name] === 1) ? 1 : 0;
  await c.env.DB
    .prepare(
      `UPDATE asset_uniform_settings SET
        asset_module_enabled = ?, uniform_module_enabled = ?, require_approval_before_asset_issue = ?,
        require_approval_before_asset_return = ?, require_approval_before_asset_transfer = ?,
        require_approval_before_damage_loss_deduction = ?, require_approval_before_waiver = ?,
        require_document_for_damage_loss = ?, require_photo_proof_placeholder = ?,
        allow_payroll_deduction_for_lost_damaged_items = ?, allow_final_settlement_deduction = ?,
        default_asset_clearance_required_before_final_settlement = ?, default_uniform_clearance_required_before_final_settlement = ?,
        default_damage_deduction_mode = ?, default_uniform_replacement_cycle_months = ?,
        allow_employee_self_service_asset_view = ?, allow_employee_self_service_uniform_view = ?,
        require_reason_for_waiver = ?, require_reason_for_deduction = ?, require_reason_for_cancel = ?,
        use_central_approval_workflow = ?, updated_at = ?, metadata_json = ?
       WHERE id = 'asset_uniform_settings_default'`
    )
    .bind(
      boolField("asset_module_enabled"),
      boolField("uniform_module_enabled"),
      boolField("require_approval_before_asset_issue"),
      boolField("require_approval_before_asset_return"),
      boolField("require_approval_before_asset_transfer"),
      boolField("require_approval_before_damage_loss_deduction"),
      boolField("require_approval_before_waiver"),
      boolField("require_document_for_damage_loss"),
      boolField("require_photo_proof_placeholder"),
      boolField("allow_payroll_deduction_for_lost_damaged_items"),
      boolField("allow_final_settlement_deduction"),
      boolField("default_asset_clearance_required_before_final_settlement"),
      boolField("default_uniform_clearance_required_before_final_settlement"),
      upper(body.default_damage_deduction_mode || old.default_damage_deduction_mode || "FULL_REPLACEMENT_VALUE"),
      numberValue(body.default_uniform_replacement_cycle_months, numberValue(old.default_uniform_replacement_cycle_months, null)),
      boolField("allow_employee_self_service_asset_view"),
      boolField("allow_employee_self_service_uniform_view"),
      boolField("require_reason_for_waiver"),
      boolField("require_reason_for_deduction"),
      boolField("require_reason_for_cancel"),
      boolField("use_central_approval_workflow"),
      nowIso(),
      json(body.metadata ?? null)
    )
    .run();
  const settings = await getAssetUniformSettings(c.env.DB);
  await audit(c, "asset_uniform.settings.updated", "asset_uniform_settings", "asset_uniform_settings_default", { oldValue: old, newValue: settings });
  await publish(c, "asset.uniform.settings.changed", "asset_uniform_settings", "asset_uniform_settings_default", "updated");
  return ok(c, { settings });
});

assetUniformAdvancedRoutes.post("/categories/:categoryId/archive", requireAnyPermission(["assets.settings.manage", "assets.categories.manage"]), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(c.req.param("categoryId")).first<Row>();
  if (!row) return fail(c, 404, "ASSET_CATEGORY_NOT_FOUND", "Asset category was not found.");
  await c.env.DB.prepare("UPDATE asset_categories SET is_active = 0, status = 'ARCHIVED', archived_by_user_id = ?, archived_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), c.get("currentUser").id, nowIso(), row.id).run();
  const body = await readJsonBody(c.req.raw).catch(() => ({} as Row));
  await audit(c, "asset.category.archived", "asset_category", String(row.id), { oldValue: row, reason: optionalText(body.reason) });
  return ok(c, { archived: true });
});

assetUniformAdvancedRoutes.post("/items/:assetId/archive", requireAnyPermission(["assets.manage", "assets.items.archive"]), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM asset_items WHERE id = ?").bind(c.req.param("assetId")).first<Row>();
  if (!row) return fail(c, 404, "ASSET_ITEM_NOT_FOUND", "Asset item was not found.");
  await c.env.DB.prepare("UPDATE asset_items SET status = 'ARCHIVED', lifecycle_status = 'ARCHIVED', archived_by_user_id = ?, archived_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), c.get("currentUser").id, nowIso(), row.id).run();
  await audit(c, "asset.item.archived", "asset_item", String(row.id), { oldValue: row });
  return ok(c, { item: await c.env.DB.prepare("SELECT * FROM asset_items WHERE id = ?").bind(row.id).first<Row>() });
});

assetUniformAdvancedRoutes.post("/assignments/issue", requireAnyPermission(["assets.issue", "assets.assignments.issue"]), async (c) => {
  const result = await issueAssetToEmployee(c, await readJsonBody(c.req.raw));
  return result.response ?? ok(c, { assignment: result.assignment, approval: result.approval }, 201);
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/approve", requireAnyPermission(["assets.manage", "assets.assignments.approve"]), async (c) => {
  const gate = await requireAssetAssignment(c, c.req.param("assignmentId"), "manage");
  if (gate.response) return gate.response;
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET assignment_status = 'ASSIGNED', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), nowIso(), gate.assignment.id).run();
  const saved = await getAssetAssignment(c, String(gate.assignment.id));
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId: String(gate.assignment.id), employeeId: String(gate.assignment.employee_id), action: "APPROVED", previousStatus: String(gate.assignment.assignment_status ?? gate.assignment.status), newStatus: "ASSIGNED" });
  await audit(c, "asset.assignment.approved", "asset_assignment", String(gate.assignment.id), { oldValue: gate.assignment, newValue: saved });
  return ok(c, { assignment: saved });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/return", requireAnyPermission(["assets.return", "assets.assignments.return"]), async (c) => {
  const result = await returnEmployeeAsset(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/transfer", requireAnyPermission(["assets.issue", "assets.assignments.transfer"]), async (c) => {
  const result = await transferEmployeeAsset(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw));
  return result.response ?? ok(c, { assignment: result.assignment, new_assignment: result.new_assignment });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/mark-damaged", requireAnyPermission(["assets.damage", "assets.assignments.damage", "assets.assignments.mark_damaged"]), async (c) => {
  const result = await markEmployeeAssetDamaged(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/mark-lost", requireAnyPermission(["assets.lost", "assets.assignments.lost", "assets.assignments.mark_lost"]), async (c) => {
  const result = await markEmployeeAssetLost(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/apply-deduction", requireAnyPermission(["assets.deductions.manage", "assets.deductions.apply", "assets.assignments.apply_deduction"]), async (c) => {
  const result = await applyAssetDeduction(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw));
  return result.response ?? ok(c, { assignment: result.assignment, deduction: result.deduction });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/waive", requireAnyPermission(["assets.deductions.manage", "assets.deductions.waive", "assets.assignments.waive"]), async (c) => {
  const result = await waiveAssetDeduction(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/cancel", requireAnyPermission(["assets.manage", "assets.assignments.cancel"]), async (c) => {
  const gate = await requireAssetAssignment(c, c.req.param("assignmentId"), "manage");
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw).catch(() => ({} as Row));
  const reason = optionalText(body.reason);
  const settings = await getAssetUniformSettings(c.env.DB);
  if (settings.require_reason_for_cancel === 1 && !reason) return fail(c, 400, "REASON_REQUIRED", "Cancel reason is required.");
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET assignment_status = 'CANCELLED', clearance_status = 'NOT_REQUIRED', notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").bind(reason, nowIso(), gate.assignment.id).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = 'AVAILABLE', lifecycle_status = 'AVAILABLE', assigned_employee_id = NULL, updated_by_user_id = ?, updated_at = ? WHERE id = ? AND status = 'ISSUED'").bind(c.get("currentUser").id, nowIso(), gate.assignment.asset_item_id).run();
  const saved = await getAssetAssignment(c, String(gate.assignment.id));
  await insertAssetUniformEvent(c, { entityType: "ASSET_ASSIGNMENT", assignmentId: String(gate.assignment.id), employeeId: String(gate.assignment.employee_id), action: "CANCELLED", previousStatus: String(gate.assignment.assignment_status ?? gate.assignment.status), newStatus: "CANCELLED", reason });
  await audit(c, "asset.assignment.cancelled", "asset_assignment", String(gate.assignment.id), { oldValue: gate.assignment, newValue: saved, reason });
  return ok(c, { assignment: saved });
});

assetUniformAdvancedRoutes.post("/assignments/:assignmentId/link-document", requireAnyPermission(["assets.manage", "assets.documents.link"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await linkAssetAssignmentDocument(c, c.req.param("assignmentId"), text(body.document_id));
  return result.response ?? ok(c, { assignment: result.assignment });
});

assetUniformAdvancedRoutes.get("/assignments/:assignmentId/approval-summary", requireAnyPermission(["assets.view", "assets.assignments.view"]), async (c) => {
  const gate = await requireAssetAssignment(c, c.req.param("assignmentId"), "view");
  if (gate.response) return gate.response;
  return ok(c, { approval: await getAssetAssignmentApprovalSummary(c, String(gate.assignment.id)) });
});

assetUniformAdvancedRoutes.get("/assignments/:assignmentId/events", requireAnyPermission(["assets.view", "assets.assignments.view"]), async (c) => {
  const gate = await requireAssetAssignment(c, c.req.param("assignmentId"), "view");
  if (gate.response) return gate.response;
  const [advanced, legacy] = await Promise.all([
    c.env.DB.prepare("SELECT ev.*, u.name AS actor_name FROM asset_uniform_assignment_events ev LEFT JOIN users u ON u.id = ev.actor_user_id WHERE ev.entity_type = 'ASSET_ASSIGNMENT' AND ev.assignment_id = ? ORDER BY ev.created_at DESC").bind(gate.assignment.id).all<Row>(),
    c.env.DB.prepare("SELECT ev.*, u.name AS event_by_name FROM employee_asset_assignment_events ev LEFT JOIN users u ON u.id = ev.event_by_user_id WHERE ev.assignment_id = ? ORDER BY ev.created_at DESC").bind(gate.assignment.id).all<Row>()
  ]);
  return ok(c, { events: [...advanced.results, ...legacy.results] });
});

employeeAssetUniformRoutes.post("/:employeeId/assets/assign", requireAnyPermission(["assets.issue", "assets.assignments.issue"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await issueAssetToEmployee(c, { ...body, employee_id: c.req.param("employeeId") });
  return result.response ?? ok(c, { assignment: result.assignment, approval: result.approval }, 201);
});

employeeAssetUniformRoutes.get("/:employeeId/assets-uniforms/summary", requireAnyPermission(["employees.assets.view", "assets.view", "uniforms.view"]), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canUseEmployee(c, employeeId, "view"))) return fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee was not found.");
  const [assets, uniforms, events, clearance] = await Promise.all([
    c.env.DB.prepare("SELECT aa.*, ai.code AS asset_code, ai.name AS asset_name, ac.name AS category_name FROM employee_asset_assignments aa INNER JOIN asset_items ai ON ai.id = aa.asset_item_id INNER JOIN asset_categories ac ON ac.id = ai.category_id WHERE aa.employee_id = ? ORDER BY aa.issued_date DESC").bind(employeeId).all<Row>(),
    c.env.DB.prepare("SELECT ua.*, ut.code AS uniform_type_code, ut.name AS uniform_type_name, us.size_label FROM employee_uniform_assignments ua INNER JOIN uniform_types ut ON ut.id = ua.uniform_type_id INNER JOIN uniform_stock_items us ON us.id = ua.uniform_stock_item_id WHERE ua.employee_id = ? ORDER BY ua.issued_date DESC").bind(employeeId).all<Row>(),
    c.env.DB.prepare("SELECT * FROM asset_uniform_assignment_events WHERE employee_id = ? ORDER BY created_at DESC LIMIT 150").bind(employeeId).all<Row>(),
    getEmployeeAssetUniformClearanceSummary(c.env.DB, employeeId)
  ]);
  return ok(c, {
    assets: assets.results,
    uniforms: uniforms.results,
    history: events.results,
    clearance,
    summary: {
      issued_assets: assets.results.filter((row) => ["ISSUED", "ASSIGNED"].includes(String(row.status)) || String(row.assignment_status) === "ASSIGNED").length,
      issued_uniforms: uniforms.results.filter((row) => String(row.assignment_status) === "ISSUED").length,
      pending_clearance: clearance.pending_count,
      estimated_deduction_amount: clearance.estimated_deduction_amount
    }
  });
});

employeeAssetUniformRoutes.get("/:employeeId/uniforms", requireAnyPermission(["employees.assets.view", "assets.view", "uniforms.view"]), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canUseEmployee(c, employeeId, "view"))) return fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT ua.*, ut.code AS uniform_type_code, ut.name AS uniform_type_name, us.size_label FROM employee_uniform_assignments ua INNER JOIN uniform_types ut ON ut.id = ua.uniform_type_id INNER JOIN uniform_stock_items us ON us.id = ua.uniform_stock_item_id WHERE ua.employee_id = ? ORDER BY ua.issued_date DESC").bind(employeeId).all<Row>();
  return ok(c, { assignments: rows.results });
});

employeeAssetUniformRoutes.post("/:employeeId/uniforms/issue", requireAnyPermission(["assets.issue", "uniforms.issue", "uniforms.assignments.issue"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await issueUniformToEmployee(c, { ...body, employee_id: c.req.param("employeeId") });
  return result.response ?? ok(c, { assignment: result.assignment, approval: result.approval }, 201);
});

uniformRoutes.get("/settings", requireAnyPermission(["assets.settings.manage", "uniforms.settings.manage", "uniforms.view"]), async (c) => ok(c, { settings: await getAssetUniformSettings(c.env.DB) }));
uniformRoutes.patch("/settings", requireAnyPermission(["assets.settings.manage", "uniforms.settings.manage"]), (c) => updateAssetUniformSettings(c));

uniformRoutes.get("/types", requireAnyPermission(["uniforms.view", "assets.view", "uniforms.types.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM uniform_types WHERE status != 'ARCHIVED' ORDER BY display_order, name").all<Row>();
  return ok(c, { types: rows.results });
});

uniformRoutes.post("/types", requireAnyPermission(["uniforms.manage", "uniforms.types.manage", "assets.settings.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = upper(body.code).replace(/[^A-Z0-9_]/g, "_");
  const name = text(body.name);
  const category = upper(body.category || "OTHER");
  if (!code || !name || !UNIFORM_TYPE_CATEGORIES.has(category)) return fail(c, 400, "VALIDATION_ERROR", "Code, name, and valid category are required.");
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare("INSERT INTO uniform_types (id, code, name, description, category, default_replacement_cycle_months, default_clearance_required, default_deductible_if_lost, default_deductible_if_damaged, default_deduction_amount, is_active, status, display_order, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, code, name, optionalText(body.description), category, numberValue(body.default_replacement_cycle_months, null), boolValue(body.default_clearance_required, true) ? 1 : 0, boolValue(body.default_deductible_if_lost, true) ? 1 : 0, boolValue(body.default_deductible_if_damaged, true) ? 1 : 0, numberValue(body.default_deduction_amount, null), boolValue(body.is_active, true) ? 1 : 0, boolValue(body.is_active, true) ? "ACTIVE" : "INACTIVE", numberValue(body.display_order, 100), c.get("currentUser").id, c.get("currentUser").id).run();
  } catch {
    return fail(c, 409, "UNIFORM_TYPE_DUPLICATE", "Uniform type code must be unique.");
  }
  const saved = await c.env.DB.prepare("SELECT * FROM uniform_types WHERE id = ?").bind(id).first<Row>();
  await audit(c, "uniform.type.created", "uniform_type", id, { newValue: saved });
  return ok(c, { type: saved }, 201);
});

uniformRoutes.patch("/types/:typeId", requireAnyPermission(["uniforms.manage", "uniforms.types.manage", "assets.settings.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM uniform_types WHERE id = ?").bind(c.req.param("typeId")).first<Row>();
  if (!old) return fail(c, 404, "UNIFORM_TYPE_NOT_FOUND", "Uniform type was not found.");
  const body = await readJsonBody(c.req.raw);
  const category = upper(body.category ?? old.category);
  await c.env.DB.prepare("UPDATE uniform_types SET code = ?, name = ?, description = ?, category = ?, default_replacement_cycle_months = ?, default_clearance_required = ?, default_deductible_if_lost = ?, default_deductible_if_damaged = ?, default_deduction_amount = ?, is_active = ?, status = ?, display_order = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(upper(body.code ?? old.code).replace(/[^A-Z0-9_]/g, "_"), text(body.name ?? old.name), optionalText(body.description ?? old.description), UNIFORM_TYPE_CATEGORIES.has(category) ? category : old.category, numberValue(body.default_replacement_cycle_months ?? old.default_replacement_cycle_months, null), boolValue(body.default_clearance_required ?? old.default_clearance_required, true) ? 1 : 0, boolValue(body.default_deductible_if_lost ?? old.default_deductible_if_lost, true) ? 1 : 0, boolValue(body.default_deductible_if_damaged ?? old.default_deductible_if_damaged, true) ? 1 : 0, numberValue(body.default_deduction_amount ?? old.default_deduction_amount, null), boolValue(body.is_active ?? old.is_active, true) ? 1 : 0, boolValue(body.is_active ?? old.is_active, true) ? "ACTIVE" : "INACTIVE", numberValue(body.display_order ?? old.display_order, 100), c.get("currentUser").id, nowIso(), old.id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM uniform_types WHERE id = ?").bind(old.id).first<Row>();
  await audit(c, "uniform.type.updated", "uniform_type", String(old.id), { oldValue: old, newValue: saved });
  return ok(c, { type: saved });
});

uniformRoutes.post("/types/:typeId/archive", requireAnyPermission(["uniforms.manage", "uniforms.types.manage", "assets.settings.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM uniform_types WHERE id = ?").bind(c.req.param("typeId")).first<Row>();
  if (!old) return fail(c, 404, "UNIFORM_TYPE_NOT_FOUND", "Uniform type was not found.");
  await c.env.DB.prepare("UPDATE uniform_types SET status = 'ARCHIVED', is_active = 0, archived_by_user_id = ?, archived_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), c.get("currentUser").id, nowIso(), old.id).run();
  await audit(c, "uniform.type.archived", "uniform_type", String(old.id), { oldValue: old });
  return ok(c, { archived: true });
});

uniformRoutes.get("/stock", requireAnyPermission(["uniforms.view", "assets.view", "uniforms.stock.view"]), async (c) => {
  const conditions = ["us.status != 'ARCHIVED'"];
  const params: BindValue[] = [];
  const search = text(c.req.query("search"));
  if (search) { conditions.push("(ut.code LIKE ? OR ut.name LIKE ? OR us.size_label LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const typeId = text(c.req.query("uniform_type_id"));
  if (typeId) { conditions.push("us.uniform_type_id = ?"); params.push(typeId); }
  const locationId = text(c.req.query("location_id"));
  if (locationId) { conditions.push("(us.location_id = ? OR us.worksite_id = ?)"); params.push(locationId, locationId); }
  const status = upper(c.req.query("status"));
  if (status) { conditions.push("us.status = ?"); params.push(status); }
  const rows = await c.env.DB.prepare(`SELECT us.*, ut.code AS uniform_type_code, ut.name AS uniform_type_name, ut.category, l.name AS location_name FROM uniform_stock_items us INNER JOIN uniform_types ut ON ut.id = us.uniform_type_id LEFT JOIN locations l ON l.id = COALESCE(us.location_id, us.worksite_id) WHERE ${conditions.join(" AND ")} ORDER BY ut.name, us.size_label`).bind(...params).all<Row>();
  return ok(c, { stock: rows.results });
});

uniformRoutes.post("/stock", requireAnyPermission(["uniforms.manage", "uniforms.stock.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const typeId = text(body.uniform_type_id);
  const typeRow = await c.env.DB.prepare("SELECT id FROM uniform_types WHERE id = ? AND status = 'ACTIVE'").bind(typeId).first<Row>();
  if (!typeRow) return fail(c, 400, "UNIFORM_TYPE_NOT_FOUND", "Active uniform type is required.");
  const total = Math.max(0, integerValue(body.total_quantity, 0));
  const issued = Math.max(0, integerValue(body.issued_quantity, 0));
  const available = Math.max(0, integerValue(body.available_quantity, total - issued));
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO uniform_stock_items (id, uniform_type_id, size_label, worksite_id, location_id, total_quantity, available_quantity, issued_quantity, damaged_quantity, lost_quantity, retired_quantity, reorder_level, status, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, typeId, optionalText(body.size_label), optionalText(body.worksite_id), optionalText(body.location_id), total, available, issued, integerValue(body.damaged_quantity, 0), integerValue(body.lost_quantity, 0), integerValue(body.retired_quantity, 0), numberValue(body.reorder_level, null), upper(body.status || "ACTIVE") || "ACTIVE", c.get("currentUser").id, c.get("currentUser").id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM uniform_stock_items WHERE id = ?").bind(id).first<Row>();
  await audit(c, "uniform.stock.created", "uniform_stock_item", id, { newValue: saved });
  return ok(c, { stock_item: saved }, 201);
});

uniformRoutes.patch("/stock/:stockId", requireAnyPermission(["uniforms.manage", "uniforms.stock.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM uniform_stock_items WHERE id = ?").bind(c.req.param("stockId")).first<Row>();
  if (!old) return fail(c, 404, "UNIFORM_STOCK_NOT_FOUND", "Uniform stock item was not found.");
  const body = await readJsonBody(c.req.raw);
  await c.env.DB.prepare("UPDATE uniform_stock_items SET size_label = ?, worksite_id = ?, location_id = ?, total_quantity = ?, available_quantity = ?, issued_quantity = ?, damaged_quantity = ?, lost_quantity = ?, retired_quantity = ?, reorder_level = ?, status = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(optionalText(body.size_label ?? old.size_label), optionalText(body.worksite_id ?? old.worksite_id), optionalText(body.location_id ?? old.location_id), integerValue(body.total_quantity ?? old.total_quantity), integerValue(body.available_quantity ?? old.available_quantity), integerValue(body.issued_quantity ?? old.issued_quantity), integerValue(body.damaged_quantity ?? old.damaged_quantity), integerValue(body.lost_quantity ?? old.lost_quantity), integerValue(body.retired_quantity ?? old.retired_quantity), numberValue(body.reorder_level ?? old.reorder_level, null), upper(body.status ?? old.status) || "ACTIVE", c.get("currentUser").id, nowIso(), old.id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM uniform_stock_items WHERE id = ?").bind(old.id).first<Row>();
  await audit(c, "uniform.stock.updated", "uniform_stock_item", String(old.id), { oldValue: old, newValue: saved });
  return ok(c, { stock_item: saved });
});

uniformRoutes.get("/assignments", requireAnyPermission(["uniforms.view", "assets.view"]), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "assets", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const search = text(c.req.query("search"));
  if (search) { conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR ut.code LIKE ? OR ut.name LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  const status = upper(c.req.query("status"));
  if (status && UNIFORM_ASSIGNMENT_ACTIONS.has(status)) { conditions.push("ua.assignment_status = ?"); params.push(status); }
  const locationId = text(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
  const rows = await c.env.DB.prepare(`SELECT ua.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name, ut.code AS uniform_type_code, ut.name AS uniform_type_name, us.size_label FROM employee_uniform_assignments ua INNER JOIN employees e ON e.id = ua.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN locations l ON l.id = e.primary_location_id INNER JOIN uniform_types ut ON ut.id = ua.uniform_type_id INNER JOIN uniform_stock_items us ON us.id = ua.uniform_stock_item_id WHERE ${conditions.join(" AND ")} ORDER BY ua.issued_date DESC LIMIT 1000`).bind(...params).all<Row>();
  return ok(c, { assignments: rows.results });
});

uniformRoutes.post("/assignments", requireAnyPermission(["uniforms.issue", "uniforms.assignments.issue", "assets.issue"]), async (c) => {
  const result = await issueUniformToEmployee(c, await readJsonBody(c.req.raw));
  return result.response ?? ok(c, { assignment: result.assignment, approval: result.approval }, 201);
});

uniformRoutes.post("/assignments/:assignmentId/return", requireAnyPermission(["uniforms.return", "uniforms.assignments.return", "assets.return"]), async (c) => {
  const result = await returnEmployeeUniform(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

uniformRoutes.post("/assignments/:assignmentId/mark-damaged", requireAnyPermission(["uniforms.damage", "uniforms.assignments.mark_damaged", "assets.damage"]), async (c) => {
  const result = await markEmployeeUniformDamaged(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

uniformRoutes.post("/assignments/:assignmentId/mark-lost", requireAnyPermission(["uniforms.lost", "uniforms.assignments.mark_lost", "assets.lost"]), async (c) => {
  const result = await markEmployeeUniformLost(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

uniformRoutes.post("/assignments/:assignmentId/apply-deduction", requireAnyPermission(["uniforms.deductions.apply", "uniforms.assignments.apply_deduction", "assets.deductions.manage"]), async (c) => {
  const result = await applyUniformDeduction(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw));
  return result.response ?? ok(c, { assignment: result.assignment, deduction: result.deduction });
});

uniformRoutes.post("/assignments/:assignmentId/waive", requireAnyPermission(["uniforms.deductions.waive", "uniforms.assignments.waive", "assets.deductions.manage"]), async (c) => {
  const result = await waiveUniformDeduction(c, c.req.param("assignmentId"), await readJsonBody(c.req.raw).catch(() => ({})));
  return result.response ?? ok(c, { assignment: result.assignment });
});

uniformRoutes.post("/assignments/:assignmentId/cancel", requireAnyPermission(["uniforms.manage", "uniforms.assignments.cancel", "uniforms.assignments.manage"]), async (c) => {
  const gate = await requireUniformAssignment(c, c.req.param("assignmentId"), "manage");
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw).catch(() => ({} as Row));
  const reason = optionalText(body.reason);
  const settings = await getAssetUniformSettings(c.env.DB);
  if (settings.require_reason_for_cancel === 1 && !reason) return fail(c, 400, "REASON_REQUIRED", "Cancel reason is required.");
  const quantityIssued = numberValue(gate.assignment.quantity_issued, 0) ?? 0;
  const quantityReturned = numberValue(gate.assignment.quantity_returned, 0) ?? 0;
  const quantityDamaged = numberValue(gate.assignment.quantity_damaged, 0) ?? 0;
  const quantityLost = numberValue(gate.assignment.quantity_lost, 0) ?? 0;
  const remainingQuantity = Math.max(0, quantityIssued - quantityReturned - quantityDamaged - quantityLost);
  await c.env.DB.prepare(
    `UPDATE employee_uniform_assignments
     SET assignment_status = 'CANCELLED', clearance_status = 'NOT_REQUIRED', notes = COALESCE(?, notes), updated_at = ?
     WHERE id = ?`
  ).bind(reason, nowIso(), gate.assignment.id).run();
  if (remainingQuantity > 0) {
    await c.env.DB.prepare(
      `UPDATE uniform_stock_items
       SET available_quantity = available_quantity + ?,
           issued_quantity = CASE WHEN issued_quantity >= ? THEN issued_quantity - ? ELSE 0 END,
           updated_by_user_id = ?, updated_at = ?
       WHERE id = ?`
    ).bind(remainingQuantity, remainingQuantity, remainingQuantity, c.get("currentUser").id, nowIso(), gate.assignment.uniform_stock_item_id).run();
  }
  const saved = await getUniformAssignment(c, String(gate.assignment.id));
  await insertAssetUniformEvent(c, {
    entityType: "UNIFORM_ASSIGNMENT",
    assignmentId: String(gate.assignment.id),
    employeeId: String(gate.assignment.employee_id),
    action: "CANCELLED",
    previousStatus: String(gate.assignment.assignment_status ?? "ISSUED"),
    newStatus: "CANCELLED",
    reason,
    amount: remainingQuantity
  });
  await audit(c, "uniform.assignment.cancelled", "uniform_assignment", String(gate.assignment.id), { oldValue: gate.assignment, newValue: saved, reason });
  return ok(c, { assignment: saved });
});

uniformRoutes.post("/assignments/:assignmentId/link-document", requireAnyPermission(["uniforms.manage", "assets.documents.link"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await linkUniformAssignmentDocument(c, c.req.param("assignmentId"), text(body.document_id));
  return result.response ?? ok(c, { assignment: result.assignment });
});

uniformRoutes.get("/assignments/:assignmentId/events", requireAnyPermission(["uniforms.view", "assets.view"]), async (c) => {
  const gate = await requireUniformAssignment(c, c.req.param("assignmentId"), "view");
  if (gate.response) return gate.response;
  const events = await c.env.DB.prepare("SELECT ev.*, u.name AS actor_name FROM asset_uniform_assignment_events ev LEFT JOIN users u ON u.id = ev.actor_user_id WHERE ev.entity_type = 'UNIFORM_ASSIGNMENT' AND ev.assignment_id = ? ORDER BY ev.created_at DESC").bind(gate.assignment.id).all<Row>();
  return ok(c, { events: events.results });
});

uniformRoutes.get("/assignments/:assignmentId/approval-summary", requireAnyPermission(["uniforms.view", "assets.view"]), async (c) => {
  const gate = await requireUniformAssignment(c, c.req.param("assignmentId"), "view");
  if (gate.response) return gate.response;
  return ok(c, { approval: await getUniformAssignmentApprovalSummary(c, String(gate.assignment.id)) });
});

selfServiceAssetUniformRoutes.get("/assets", async (c) => {
  if (!hasAny(c, ["self_service.assets.view", "self_service.view", "assets.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your assets.");
  const user = c.get("currentUser");
  if (!user.employee_id) return fail(c, 404, "SELF_SERVICE_NOT_LINKED", "This account is not linked to an employee profile.");
  const settings = await getAssetUniformSettings(c.env.DB);
  if (settings.allow_employee_self_service_asset_view === 0 && !has(c, "assets.view")) return fail(c, 403, "SELF_SERVICE_ASSETS_DISABLED", "Self-service asset view is disabled.");
  const assignments = await c.env.DB.prepare("SELECT aa.*, ai.code AS asset_code, ai.name AS asset_name, ac.name AS category_name FROM employee_asset_assignments aa INNER JOIN asset_items ai ON ai.id = aa.asset_item_id INNER JOIN asset_categories ac ON ac.id = ai.category_id WHERE aa.employee_id = ? ORDER BY aa.issued_date DESC").bind(user.employee_id).all<Row>();
  return ok(c, { assignments: assignments.results });
});

selfServiceAssetUniformRoutes.get("/uniforms", async (c) => {
  if (!hasAny(c, ["self_service.uniforms.view", "self_service.view", "uniforms.view", "assets.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your uniforms.");
  const user = c.get("currentUser");
  if (!user.employee_id) return fail(c, 404, "SELF_SERVICE_NOT_LINKED", "This account is not linked to an employee profile.");
  const settings = await getAssetUniformSettings(c.env.DB);
  if (settings.allow_employee_self_service_uniform_view === 0 && !has(c, "uniforms.view")) return fail(c, 403, "SELF_SERVICE_UNIFORMS_DISABLED", "Self-service uniform view is disabled.");
  const assignments = await c.env.DB.prepare("SELECT ua.*, ut.code AS uniform_type_code, ut.name AS uniform_type_name, us.size_label FROM employee_uniform_assignments ua INNER JOIN uniform_types ut ON ut.id = ua.uniform_type_id INNER JOIN uniform_stock_items us ON us.id = ua.uniform_stock_item_id WHERE ua.employee_id = ? ORDER BY ua.issued_date DESC").bind(user.employee_id).all<Row>();
  return ok(c, { assignments: assignments.results });
});
