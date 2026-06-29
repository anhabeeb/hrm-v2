import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { requireOperationalModuleMiddleware } from "../utils/module-enforcement";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;

const CATEGORY_TYPES = new Set(["ASSET", "UNIFORM", "OTHER"]);
const ITEM_CONDITIONS = new Set(["NEW", "GOOD", "FAIR", "DAMAGED", "LOST", "WRITTEN_OFF"]);
const ITEM_STATUSES = new Set(["AVAILABLE", "ISSUED", "DAMAGED", "LOST", "WRITTEN_OFF", "ARCHIVED"]);
const ASSIGNMENT_STATUSES = new Set(["ISSUED", "RETURNED", "DAMAGED", "LOST", "REPLACED", "WRITTEN_OFF"]);
const DEDUCTION_MODES = new Set(["NONE", "FIXED_AMOUNT", "REPLACEMENT_COST", "PERCENTAGE_OF_COST", "CUSTOM"]);
const NOTE_VISIBILITIES = new Set(["GENERAL", "HR_ONLY", "RESTRICTED"]);
const NOTE_MODULES = new Set(["payroll", "leave", "attendance", "documents", "assets", "roster", "employee", "other"]);

export const assetRoutes = new Hono<AppBindings>();
export const employeeAssetRoutes = new Hono<AppBindings>();
export const employeeNoteCategoryRoutes = new Hono<AppBindings>();
export const employeeNoteRoutes = new Hono<AppBindings>();
export const auditRoutes = new Hono<AppBindings>();

assetRoutes.use("*", requireAuth);
employeeAssetRoutes.use("*", requireAuth);
employeeNoteCategoryRoutes.use("*", requireAuth);
employeeNoteRoutes.use("*", requireAuth);
auditRoutes.use("*", requireAuth);
assetRoutes.use("*", requireOperationalModuleMiddleware("assets_uniforms", "Assets and uniforms"));
employeeAssetRoutes.use("*", requireOperationalModuleMiddleware("assets_uniforms", "Assets and uniforms"));

function has(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  return permissions.some((permission) => has(c, permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    await next();
  });
}

function optionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function num(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return fallback;
}

function now() {
  return new Date().toISOString();
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function audit(c: Context<AppBindings>, input: { module: string; action: string; entityType: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publish(c: Context<AppBindings>, event: Parameters<typeof publishAccessEvent>[1], entityType: Parameters<typeof publishAccessEvent>[2]["entity_type"], entityId: string, action: string) {
  await publishAccessEvent(c.env, event, { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  if (event.startsWith("asset") || event === "employee.assets.changed") {
    await publishAccessEvent(c.env, "assets.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
    await publishAccessEvent(c.env, "dashboard.assets.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  }
}

async function employeeExists(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB.prepare("SELECT id, archived_at FROM employees WHERE id = ?").bind(employeeId).first<{ id: string; archived_at: string | null }>();
}

async function getAssignment(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT * FROM employee_asset_assignments WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

async function getItem(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT * FROM asset_items WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

async function getActiveEmployeeDocument(c: Context<AppBindings>, documentId: string, employeeId: string) {
  return c.env.DB.prepare(
    `SELECT ed.*, dt.is_sensitive
     FROM employee_documents ed
     LEFT JOIN document_types dt ON dt.id = ed.document_type_id
     WHERE ed.id = ?
       AND ed.employee_id = ?
       AND ed.status = 'ACTIVE'
       AND ed.archived_at IS NULL
       AND ed.soft_deleted_at IS NULL`
  ).bind(documentId, employeeId).first<Record<string, unknown>>();
}

async function validateActiveEmployeeDocument(c: Context<AppBindings>, documentId: string | null, employeeId: string) {
  if (!documentId) return null;
  const doc = await getActiveEmployeeDocument(c, documentId, employeeId);
  if (!doc) return fail(c, 400, "INVALID_DOCUMENT", "Attachment document must be active and belong to the same employee.");
  if (bool(doc.is_sensitive, false) && !hasAny(c, ["documents.sensitive.view", "documents.sensitive.download"])) {
    return fail(c, 403, "FORBIDDEN", "Sensitive documents require sensitive document permission.");
  }
  return null;
}

async function getNoteForAccess(c: Context<AppBindings>) {
  return c.env.DB.prepare("SELECT * FROM employee_notes WHERE id = ? AND employee_id = ?").bind(c.req.param("noteId"), c.req.param("employeeId")).first<Record<string, unknown>>();
}

function canAccessNote(c: Context<AppBindings>, note: Record<string, unknown>) {
  const visibility = String(note.visibility);
  return visibility === "GENERAL" || has(c, "employee_notes.restricted.view");
}

function canManageRestrictedNote(c: Context<AppBindings>, note: Record<string, unknown>) {
  return String(note.visibility) !== "RESTRICTED" || has(c, "employee_notes.restricted.manage");
}

function sanitizeDocumentAttachmentRows(c: Context<AppBindings>, rows: Record<string, unknown>[]) {
  const canViewSensitive = has(c, "documents.sensitive.view");
  return rows.map((row) => {
    const sensitive = bool(row.document_is_sensitive ?? row.document_type_is_sensitive, false);
    const active = row.document_id ? row.document_status === "ACTIVE" && !row.archived_at && !row.soft_deleted_at : false;
    const restricted = sensitive && !canViewSensitive;
    if (restricted) {
      return {
        ...row,
        document_number: null,
        original_filename: null,
        document_type_name: "Restricted document",
        is_sensitive: true,
        restricted: true,
        unavailable: !active
      };
    }
    if (!active && sensitive && !canViewSensitive) {
      return {
        ...row,
        document_number: null,
        original_filename: null,
        document_type_name: "Restricted document",
        is_sensitive: true,
        restricted: true,
        unavailable: true
      };
    }
    if (!active) {
      return {
        ...row,
        document_number: null,
        original_filename: null,
        document_type_name: row.document_id ? "Unavailable document" : null,
        is_sensitive: sensitive,
        restricted: false,
        unavailable: true
      };
    }
    return {
      ...row,
      is_sensitive: sensitive,
      restricted: false,
      unavailable: false
    };
  });
}

async function requireNoteAccess(c: Context<AppBindings>, options: { restrictedManage?: boolean } = {}) {
  const note = await getNoteForAccess(c);
  if (!note) return { response: fail(c, 404, "NOT_FOUND", "Employee note was not found.") };
  if (!canAccessNote(c, note)) return { response: fail(c, 404, "NOT_FOUND", "Employee note was not found.") };
  if (options.restrictedManage && !canManageRestrictedNote(c, note)) return { response: fail(c, 403, "FORBIDDEN", "Restricted note changes require restricted manage permission.") };
  if (["HR_ONLY", "RESTRICTED"].includes(String(note.visibility))) {
    await audit(c, { module: "employee_notes", action: "employee_note.restricted_viewed", entityType: "employee_note", entityId: String(note.id) });
  }
  return { note };
}

async function insertAssetEvent(c: Context<AppBindings>, input: { assignment: Record<string, unknown>; eventType: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await c.env.DB.prepare(
    `INSERT INTO employee_asset_assignment_events
     (id, assignment_id, employee_id, asset_item_id, event_type, old_value_json, new_value_json, reason, event_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    String(input.assignment.id),
    String(input.assignment.employee_id),
    String(input.assignment.asset_item_id),
    input.eventType,
    input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
    input.newValue === undefined ? null : JSON.stringify(input.newValue),
    input.reason ?? null,
    c.get("currentUser").id
  ).run();
}

function assetAssignmentFilters(c: Context<AppBindings>) {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR ai.code LIKE ? OR ai.name LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  const employeeId = readString(c.req.query("employee_id"));
  if (employeeId) { conditions.push("a.employee_id = ?"); params.push(employeeId); }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("e.primary_department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
  const categoryId = readString(c.req.query("category_id"));
  if (categoryId) { conditions.push("ai.category_id = ?"); params.push(categoryId); }
  const status = readString(c.req.query("status")).toUpperCase();
  if (status && ASSIGNMENT_STATUSES.has(status)) { conditions.push("a.status = ?"); params.push(status); }
  for (const [queryName, column, operator] of [
    ["issued_date_from", "a.issued_date", ">="],
    ["issued_date_to", "a.issued_date", "<="],
    ["expected_return_date_from", "a.expected_return_date", ">="],
    ["expected_return_date_to", "a.expected_return_date", "<="],
    ["returned_date_from", "a.returned_date", ">="],
    ["returned_date_to", "a.returned_date", "<="]
  ] as const) {
    const value = readString(c.req.query(queryName));
    if (value) { conditions.push(`${column} ${operator} ?`); params.push(value); }
  }
  return { conditions, params };
}

function auditFilters(c: Context<AppBindings>, employeeId?: string) {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  if (employeeId) {
    conditions.push(`(
      (module = 'employees' AND (entity_id = ? OR new_value_json LIKE ? OR old_value_json LIKE ?))
      OR (module = 'documents' AND entity_id IN (SELECT id FROM employee_documents WHERE employee_id = ?))
      OR (module = 'leave' AND entity_id IN (SELECT id FROM leave_requests WHERE employee_id = ?))
      OR (module = 'attendance' AND (
        entity_id IN (SELECT id FROM attendance_daily_records WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM attendance_correction_requests WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM attendance_raw_logs WHERE employee_id = ?)
      ))
      OR (module = 'roster' AND (
        entity_id IN (SELECT id FROM roster_assignments WHERE employee_id = ?)
        OR entity_id IN (SELECT roster_assignment_id FROM roster_assignment_history WHERE employee_id = ?)
      ))
      OR (module = 'payroll' AND (
        entity_id IN (SELECT id FROM employee_payroll_profiles WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM employee_salary_history WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM employee_increments WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM payroll_advance_payments WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM payroll_deductions WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM payroll_adjustments WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM final_settlements WHERE employee_id = ?)
      ))
      OR (module = 'assets' AND (
        entity_id IN (SELECT id FROM employee_asset_assignments WHERE employee_id = ?)
        OR entity_id IN (SELECT id FROM employee_asset_assignment_events WHERE employee_id = ?)
      ))
      OR (module = 'employee_notes' AND entity_id IN (SELECT id FROM employee_notes WHERE employee_id = ?))
    )`);
    params.push(employeeId, `%${employeeId}%`, `%${employeeId}%`, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId);
  } else {
    conditions.push("1 = 1");
  }
  const module = readString(c.req.query("module"));
  if (module) { conditions.push("module = ?"); params.push(module); }
  const action = readString(c.req.query("action"));
  if (action) { conditions.push("action LIKE ?"); params.push(`%${action}%`); }
  const entityType = readString(c.req.query("entity_type"));
  if (entityType) { conditions.push("entity_type = ?"); params.push(entityType); }
  const actorUserId = readString(c.req.query("actor_user_id"));
  if (actorUserId) { conditions.push("actor_user_id = ?"); params.push(actorUserId); }
  const dateFrom = readString(c.req.query("date_from"));
  if (dateFrom) { conditions.push("created_at >= ?"); params.push(`${dateFrom}T00:00:00.000Z`); }
  const dateTo = readString(c.req.query("date_to"));
  if (dateTo) { conditions.push("created_at <= ?"); params.push(`${dateTo}T23:59:59.999Z`); }
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(action LIKE ? OR entity_type LIKE ? OR entity_id LIKE ? OR reason LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  return { conditions, params };
}

async function auditRows(c: Context<AppBindings>, employeeId?: string, limit = 500) {
  const { conditions, params } = auditFilters(c, employeeId);
  return c.env.DB.prepare(
    `SELECT al.*, u.name AS actor_name, u.email AS actor_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY al.created_at DESC
     LIMIT ${limit}`
  ).bind(...params).all<Record<string, unknown>>();
}

// Asset categories
assetRoutes.get("/categories", requirePermission("assets.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM asset_categories ORDER BY sort_order, name").all();
  return ok(c, { categories: rows.results });
});

assetRoutes.get("/categories/:id", requirePermission("assets.view"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(c.req.param("id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Asset category was not found.");
  return ok(c, { category: row });
});

assetRoutes.post("/categories", requirePermission("assets.settings.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = readString(body.code).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const name = readString(body.name);
  const type = readString(body.type).toUpperCase();
  if (!code || !name || !CATEGORY_TYPES.has(type)) return fail(c, 400, "VALIDATION_ERROR", "Code, name, and valid type are required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO asset_categories (id, code, name, type, description, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, code, name, type, optionalString(body.description), bool(body.is_active, true) ? 1 : 0, num(body.sort_order, 100)).run();
  const saved = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(id).first();
  await audit(c, { module: "assets", action: "asset.category.created", entityType: "asset_category", entityId: id, newValue: saved });
  return ok(c, { category: saved }, 201);
});

assetRoutes.patch("/categories/:id", requirePermission("assets.settings.manage"), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Asset category was not found.");
  const body = await readJsonBody(c.req.raw);
  const type = readString(body.type ?? old.type).toUpperCase();
  await c.env.DB.prepare("UPDATE asset_categories SET code = ?, name = ?, type = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(readString(body.code ?? old.code).toUpperCase().replace(/[^A-Z0-9_]/g, "_"), readString(body.name ?? old.name), CATEGORY_TYPES.has(type) ? type : old.type, optionalString(body.description ?? old.description), num(body.sort_order, Number(old.sort_order)), now(), old.id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(old.id).first();
  await audit(c, { module: "assets", action: "asset.category.updated", entityType: "asset_category", entityId: String(old.id), oldValue: old, newValue: saved });
  return ok(c, { category: saved });
});

async function categoryAction(c: Context<AppBindings>, active: 0 | 1) {
  const old = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(c.req.param("id")).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Asset category was not found.");
  await c.env.DB.prepare("UPDATE asset_categories SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, now(), c.req.param("id")).run();
  const saved = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(c.req.param("id")).first();
  await audit(c, { module: "assets", action: active ? "asset.category.enabled" : "asset.category.disabled", entityType: "asset_category", entityId: c.req.param("id"), oldValue: old, newValue: saved });
  return ok(c, { category: saved });
}

assetRoutes.post("/categories/:id/enable", requirePermission("assets.settings.manage"), (c) => categoryAction(c, 1));
assetRoutes.post("/categories/:id/disable", requirePermission("assets.settings.manage"), (c) => categoryAction(c, 0));

// Asset items
assetRoutes.get("/items", requirePermission("assets.view"), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(ai.code LIKE ? OR ai.name LIKE ? OR ai.serial_no LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  for (const [queryName, column] of [["category_id", "ai.category_id"], ["size", "ai.size"], ["variant", "ai.variant"]] as const) {
    const value = readString(c.req.query(queryName));
    if (value) { conditions.push(`${column} = ?`); params.push(value); }
  }
  const type = readString(c.req.query("type")).toUpperCase();
  if (type && CATEGORY_TYPES.has(type)) { conditions.push("ac.type = ?"); params.push(type); }
  const status = readString(c.req.query("status")).toUpperCase();
  if (status && ITEM_STATUSES.has(status)) { conditions.push("ai.status = ?"); params.push(status); }
  const condition = readString(c.req.query("condition_status")).toUpperCase();
  if (condition && ITEM_CONDITIONS.has(condition)) { conditions.push("ai.condition_status = ?"); params.push(condition); }
  const rows = await c.env.DB.prepare(
    `SELECT ai.*, ac.code AS category_code, ac.name AS category_name, ac.type AS category_type,
      e.id AS current_employee_id, e.employee_no AS current_employee_no, e.full_name AS current_employee_name
     FROM asset_items ai
     INNER JOIN asset_categories ac ON ac.id = ai.category_id
     LEFT JOIN employee_asset_assignments a ON a.asset_item_id = ai.id AND a.status IN ('ISSUED', 'DAMAGED', 'LOST')
     LEFT JOIN employees e ON e.id = a.employee_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ac.sort_order, ai.code LIMIT 1000`
  ).bind(...params).all();
  return ok(c, { items: rows.results });
});

assetRoutes.get("/items/:id", requirePermission("assets.view"), async (c) => {
  const row = await getItem(c, c.req.param("id"));
  if (!row) return fail(c, 404, "NOT_FOUND", "Asset item was not found.");
  return ok(c, { item: row });
});

async function saveItem(c: Context<AppBindings>, itemId?: string) {
  const body = await readJsonBody(c.req.raw);
  const categoryId = readString(body.category_id);
  const category = await c.env.DB.prepare("SELECT * FROM asset_categories WHERE id = ?").bind(categoryId || body.category_id).first<Record<string, unknown>>();
  if (!itemId && (!category || !bool(category.is_active, false))) return fail(c, 400, "INVALID_CATEGORY", "Active category is required.");
  const old = itemId ? await getItem(c, itemId) : null;
  if (itemId && !old) return fail(c, 404, "NOT_FOUND", "Asset item was not found.");
  const code = readString(body.code ?? old?.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  const name = readString(body.name ?? old?.name);
  const condition = readString(body.condition_status ?? old?.condition_status ?? "GOOD").toUpperCase();
  const status = readString(body.status ?? old?.status ?? "AVAILABLE").toUpperCase();
  const replacementCost = num(body.replacement_cost ?? old?.replacement_cost, null);
  if (!code || !name || !ITEM_CONDITIONS.has(condition) || !ITEM_STATUSES.has(status) || (replacementCost != null && replacementCost < 0)) return fail(c, 400, "VALIDATION_ERROR", "Valid code, name, condition, status, and cost are required.");
  const id = itemId ?? crypto.randomUUID();
  if (old) {
    await c.env.DB.prepare("UPDATE asset_items SET category_id = ?, code = ?, name = ?, variant = ?, size = ?, serial_no = ?, condition_status = ?, status = ?, replacement_cost = ?, notes = ?, updated_at = ? WHERE id = ?").bind(readString(body.category_id ?? old.category_id), code, name, optionalString(body.variant ?? old.variant), optionalString(body.size ?? old.size), optionalString(body.serial_no ?? old.serial_no), condition, status, replacementCost, optionalString(body.notes ?? old.notes), now(), id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO asset_items (id, category_id, code, name, variant, size, serial_no, condition_status, status, replacement_cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, categoryId, code, name, optionalString(body.variant), optionalString(body.size), optionalString(body.serial_no), condition, status, replacementCost, optionalString(body.notes)).run();
  }
  const saved = await getItem(c, id);
  await audit(c, { module: "assets", action: old ? "asset.item.updated" : "asset.item.created", entityType: "asset_item", entityId: id, oldValue: old, newValue: saved });
  await publish(c, old ? "asset.item.updated" : "asset.item.created", "asset_item", id, old ? "updated" : "created");
  return ok(c, { item: saved }, old ? 200 : 201);
}

assetRoutes.post("/items", requirePermission("assets.manage"), (c) => saveItem(c));
assetRoutes.patch("/items/:id", requirePermission("assets.manage"), (c) => saveItem(c, c.req.param("id")));
assetRoutes.post("/items/:id/archive", requirePermission("assets.manage"), async (c) => {
  const item = await getItem(c, c.req.param("id"));
  if (!item) return fail(c, 404, "NOT_FOUND", "Asset item was not found.");
  if (String(item.status) === "ISSUED") return fail(c, 409, "ITEM_ISSUED", "Issued items cannot be archived.");
  await c.env.DB.prepare("UPDATE asset_items SET status = 'ARCHIVED', updated_at = ? WHERE id = ?").bind(now(), c.req.param("id")).run();
  await audit(c, { module: "assets", action: "asset.item.archived", entityType: "asset_item", entityId: c.req.param("id"), oldValue: item, reason: optionalString((await readJsonBody(c.req.raw).catch(() => ({} as Record<string, unknown>))).reason) });
  return ok(c, { archived: true });
});

// Assignments
assetRoutes.get("/assignments", requirePermission("assets.view"), async (c) => {
  const { conditions, params } = assetAssignmentFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "assets", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const rows = await c.env.DB.prepare(
    `SELECT a.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
      ai.code AS asset_code, ai.name AS asset_name, ai.size, ai.variant, ac.name AS category_name, ac.type AS category_type
     FROM employee_asset_assignments a
     INNER JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     INNER JOIN asset_items ai ON ai.id = a.asset_item_id
     INNER JOIN asset_categories ac ON ac.id = ai.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.issued_date DESC, a.created_at DESC LIMIT 1000`
  ).bind(...params).all();
  return ok(c, { assignments: rows.results });
});

assetRoutes.get("/assignments/:id", requirePermission("assets.view"), async (c) => {
  const row = await getAssignment(c, c.req.param("id"));
  if (!row) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(row.employee_id), "assets", "view"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  return ok(c, { assignment: row });
});

assetRoutes.post("/assignments/issue", requirePermission("assets.issue"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const assetItemId = readString(body.asset_item_id);
  const employee = await employeeExists(c, employeeId);
  if (!employee || employee.archived_at) return fail(c, 400, "INVALID_EMPLOYEE", "Active employee is required.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "assets", "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have asset access to this employee.");
  const item = await getItem(c, assetItemId);
  if (!item) return fail(c, 404, "NOT_FOUND", "Asset item was not found.");
  if (String(item.status) !== "AVAILABLE") return fail(c, 409, "ITEM_NOT_AVAILABLE", "Only available items can be issued.");
  const issuedDate = readString(body.issued_date) || new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO employee_asset_assignments (id, employee_id, asset_item_id, issued_date, issued_by_user_id, expected_return_date, condition_on_issue, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, employeeId, assetItemId, issuedDate, c.get("currentUser").id, optionalString(body.expected_return_date), optionalString(body.condition_on_issue), optionalString(body.notes)).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = 'ISSUED', updated_at = ? WHERE id = ?").bind(now(), assetItemId).run();
  const assignment = (await getAssignment(c, id))!;
  await insertAssetEvent(c, { assignment, eventType: "ISSUED", newValue: assignment, reason: optionalString(body.reason) });
  await audit(c, { module: "assets", action: "asset.assignment.issued", entityType: "asset_assignment", entityId: id, newValue: assignment, reason: optionalString(body.reason) });
  await publish(c, "asset.assignment.issued", "asset_assignment", id, "issued");
  await publish(c, "employee.assets.changed", "asset_assignment", employeeId, "issued");
  return ok(c, { assignment }, 201);
});

async function assignmentLifecycle(c: Context<AppBindings>, action: "RETURNED" | "DAMAGED" | "LOST" | "WRITTEN_OFF") {
  const assignmentId = readString(c.req.param("id"));
  const assignment = await getAssignment(c, assignmentId);
  if (!assignment) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "assets", "manage"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  if (String(assignment.status) !== "ISSUED") return fail(c, 409, "INVALID_STATUS_TRANSITION", "Only issued assignments can be changed.");
  const body = await readJsonBody(c.req.raw).catch(() => ({} as Record<string, unknown>));
  const reason = optionalString(body.reason);
  if (["DAMAGED", "LOST", "WRITTEN_OFF"].includes(action) && !reason) return fail(c, 400, "REASON_REQUIRED", "A reason is required.");
  const itemStatus = action === "RETURNED" ? "AVAILABLE" : action;
  const returnedDate = action === "RETURNED" ? readString(body.returned_date) : null;
  const conditionOnReturn = optionalString(body.condition_on_return);
  if (action === "RETURNED" && !returnedDate) return fail(c, 400, "VALIDATION_ERROR", "Returned date is required.");
  if (action === "RETURNED" && !conditionOnReturn) return fail(c, 400, "VALIDATION_ERROR", "Condition on return is required.");
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET status = ?, returned_date = COALESCE(?, returned_date), returned_to_user_id = COALESCE(?, returned_to_user_id), condition_on_return = COALESCE(?, condition_on_return), deduction_amount = COALESCE(?, deduction_amount), updated_at = ? WHERE id = ?").bind(action, returnedDate, action === "RETURNED" ? c.get("currentUser").id : null, optionalString(body.condition_on_return), num(body.deduction_amount, null), now(), assignment.id).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = ?, condition_status = CASE WHEN ? IN ('DAMAGED','LOST','WRITTEN_OFF') THEN ? ELSE condition_status END, updated_at = ? WHERE id = ?").bind(itemStatus, action, action, now(), assignment.asset_item_id).run();
  const saved = (await getAssignment(c, String(assignment.id)))!;
  await insertAssetEvent(c, { assignment: saved, eventType: action, oldValue: assignment, newValue: saved, reason });
  const actionKey = action === "RETURNED" ? "returned" : action === "DAMAGED" ? "damaged" : action === "LOST" ? "lost" : "written_off";
  await audit(c, { module: "assets", action: `asset.assignment.${actionKey}`, entityType: "asset_assignment", entityId: String(assignment.id), oldValue: assignment, newValue: saved, reason });
  await publish(c, action === "RETURNED" ? "asset.assignment.returned" : action === "DAMAGED" ? "asset.assignment.damaged" : action === "LOST" ? "asset.assignment.lost" : "asset.assignment.written_off", "asset_assignment", String(assignment.id), actionKey);
  await publish(c, "employee.assets.changed", "asset_assignment", String(assignment.employee_id), actionKey);
  return ok(c, { assignment: saved });
}

assetRoutes.post("/assignments/:id/return", requirePermission("assets.return"), (c) => assignmentLifecycle(c, "RETURNED"));
assetRoutes.post("/assignments/:id/mark-damaged", requirePermission("assets.damage"), (c) => assignmentLifecycle(c, "DAMAGED"));
assetRoutes.post("/assignments/:id/mark-lost", requirePermission("assets.lost"), (c) => assignmentLifecycle(c, "LOST"));
assetRoutes.post("/assignments/:id/write-off", requirePermission("assets.write_off"), (c) => assignmentLifecycle(c, "WRITTEN_OFF"));

assetRoutes.post("/assignments/:id/replace", requireAnyPermission(["assets.issue", "assets.manage"]), async (c) => {
  const assignment = await getAssignment(c, c.req.param("id"));
  if (!assignment) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "assets", "manage"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  if (String(assignment.status) !== "ISSUED") return fail(c, 409, "INVALID_STATUS_TRANSITION", "Only issued assignments can be replaced.");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Replacement reason is required.");
  const replacementAssetItemId = readString(body.replacement_asset_item_id);
  const replacementItem = replacementAssetItemId ? await getItem(c, replacementAssetItemId) : null;
  if (replacementAssetItemId && !replacementItem) return fail(c, 404, "NOT_FOUND", "Replacement asset item was not found.");
  if (replacementItem && String(replacementItem.status) !== "AVAILABLE") return fail(c, 409, "ITEM_NOT_AVAILABLE", "Replacement item must be available before replacing an assignment.");
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET status = 'REPLACED', updated_at = ? WHERE id = ?").bind(now(), assignment.id).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = 'AVAILABLE', updated_at = ? WHERE id = ?").bind(now(), assignment.asset_item_id).run();
  const saved = (await getAssignment(c, String(assignment.id)))!;
  await insertAssetEvent(c, { assignment: saved, eventType: "REPLACED", oldValue: assignment, newValue: saved, reason });
  await audit(c, { module: "assets", action: "asset.assignment.replaced", entityType: "asset_assignment", entityId: String(assignment.id), oldValue: assignment, newValue: saved, reason });
  let replacementAssignment: Record<string, unknown> | null = null;
  if (replacementItem) {
    const replacementAssignmentId = crypto.randomUUID();
    const issuedDate = readString(body.issued_date) || new Date().toISOString().slice(0, 10);
    await c.env.DB.prepare("UPDATE asset_items SET status = 'ISSUED', updated_at = ? WHERE id = ?").bind(now(), replacementAssetItemId).run();
    await c.env.DB.prepare("INSERT INTO employee_asset_assignments (id, employee_id, asset_item_id, issued_date, issued_by_user_id, notes) VALUES (?, ?, ?, ?, ?, ?)").bind(replacementAssignmentId, assignment.employee_id, replacementAssetItemId, issuedDate, c.get("currentUser").id, `Replacement for ${assignment.id}: ${reason}`).run();
    replacementAssignment = await getAssignment(c, replacementAssignmentId);
    await insertAssetEvent(c, { assignment: replacementAssignment!, eventType: "ISSUED", newValue: replacementAssignment, reason });
    await audit(c, { module: "assets", action: "asset.assignment.replacement_issued", entityType: "asset_assignment", entityId: replacementAssignmentId, newValue: replacementAssignment, reason });
  }
  await publish(c, "employee.assets.changed", "asset_assignment", String(assignment.employee_id), "replaced");
  return ok(c, { assignment: saved, replacement_assignment: replacementAssignment });
});

assetRoutes.post("/assignments/:id/link-deduction", requirePermission("assets.deductions.manage"), async (c) => {
  const assignment = await getAssignment(c, c.req.param("id"));
  if (!assignment) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "assets", "manage"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  const body = await readJsonBody(c.req.raw);
  const deductionId = optionalString(body.payroll_deduction_id);
  const adjustmentId = optionalString(body.payroll_adjustment_id);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Deduction link reason is required.");
  if (deductionId) {
    const deduction = await c.env.DB.prepare("SELECT id FROM payroll_deductions WHERE id = ? AND employee_id = ?").bind(deductionId, assignment.employee_id).first();
    if (!deduction) return fail(c, 400, "INVALID_DEDUCTION", "Payroll deduction must belong to the assignment employee.");
  }
  if (adjustmentId) {
    const adjustment = await c.env.DB.prepare("SELECT id FROM payroll_adjustments WHERE id = ? AND employee_id = ?").bind(adjustmentId, assignment.employee_id).first();
    if (!adjustment) return fail(c, 400, "INVALID_ADJUSTMENT", "Payroll adjustment must belong to the assignment employee.");
  }
  const amount = num(body.deduction_amount, num(assignment.deduction_amount, null));
  if (amount != null && amount < 0) return fail(c, 400, "VALIDATION_ERROR", "Deduction amount cannot be negative.");
  await c.env.DB.prepare("UPDATE employee_asset_assignments SET payroll_deduction_id = ?, payroll_adjustment_id = ?, deduction_amount = ?, updated_at = ? WHERE id = ?").bind(deductionId, adjustmentId, amount, now(), assignment.id).run();
  const saved = (await getAssignment(c, String(assignment.id)))!;
  await insertAssetEvent(c, { assignment: saved, eventType: "DEDUCTION_LINKED", oldValue: assignment, newValue: saved, reason });
  await audit(c, { module: "assets", action: "asset.assignment.deduction_linked", entityType: "asset_assignment", entityId: String(assignment.id), oldValue: assignment, newValue: saved, reason });
  return ok(c, { assignment: saved });
});

assetRoutes.get("/assignments/:id/events", requirePermission("assets.view"), async (c) => {
  const assignment = await getAssignment(c, c.req.param("id"));
  if (!assignment || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "assets", "view"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  const rows = await c.env.DB.prepare("SELECT ev.*, u.name AS event_by_name FROM employee_asset_assignment_events ev LEFT JOIN users u ON u.id = ev.event_by_user_id WHERE ev.assignment_id = ? ORDER BY ev.created_at DESC").bind(c.req.param("id")).all();
  return ok(c, { events: rows.results });
});

assetRoutes.get("/assignments/:id/attachments", requirePermission("assets.view"), async (c) => {
  const assignment = await getAssignment(c, c.req.param("id"));
  if (!assignment || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "assets", "view"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  const rows = await c.env.DB.prepare(
    `SELECT aa.*, ed.id AS document_id, ed.document_number, ed.status AS document_status,
        ed.archived_at, ed.soft_deleted_at, ed.is_sensitive AS document_is_sensitive,
        dt.name AS document_type_name, dt.is_sensitive AS document_type_is_sensitive,
        ev.original_filename, u.name AS attached_by_name
     FROM asset_assignment_attachments aa
     LEFT JOIN employee_documents ed ON ed.id = aa.employee_document_id
     LEFT JOIN document_types dt ON dt.id = ed.document_type_id
     LEFT JOIN employee_document_versions ev ON ev.id = ed.current_version_id
     LEFT JOIN users u ON u.id = aa.attached_by_user_id
     WHERE aa.assignment_id = ?
     ORDER BY aa.attached_at DESC`
  ).bind(c.req.param("id")).all<Record<string, unknown>>();
  return ok(c, { attachments: sanitizeDocumentAttachmentRows(c, rows.results) });
});

assetRoutes.post("/assignments/:id/attachments", requirePermission("assets.manage"), async (c) => {
  const assignment = await getAssignment(c, c.req.param("id"));
  if (!assignment) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "assets", "manage"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  const body = await readJsonBody(c.req.raw);
  const employeeDocumentId = optionalString(body.employee_document_id);
  const invalidDocument = await validateActiveEmployeeDocument(c, employeeDocumentId, String(assignment.employee_id));
  if (invalidDocument) return invalidDocument;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO asset_assignment_attachments (id, assignment_id, employee_document_id, document_type_id, description, attached_by_user_id) VALUES (?, ?, ?, ?, ?, ?)").bind(id, assignment.id, employeeDocumentId, optionalString(body.document_type_id), optionalString(body.description), c.get("currentUser").id).run();
  await insertAssetEvent(c, { assignment, eventType: "ATTACHMENT_ADDED", newValue: { id, employee_document_id: employeeDocumentId }, reason: optionalString(body.description) });
  await audit(c, { module: "assets", action: "asset.assignment.attachment_added", entityType: "asset_attachment", entityId: id, newValue: body });
  return ok(c, { attachment: await c.env.DB.prepare("SELECT * FROM asset_assignment_attachments WHERE id = ?").bind(id).first() }, 201);
});

assetRoutes.delete("/assignments/:id/attachments/:attachmentId", requirePermission("assets.manage"), async (c) => {
  const assignment = await getAssignment(c, c.req.param("id"));
  if (!assignment || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "assets", "manage"))) return fail(c, 404, "NOT_FOUND", "Asset assignment was not found.");
  const attachment = await c.env.DB.prepare("SELECT * FROM asset_assignment_attachments WHERE id = ? AND assignment_id = ?").bind(c.req.param("attachmentId"), c.req.param("id")).first();
  if (!attachment) return fail(c, 404, "NOT_FOUND", "Attachment was not found.");
  await c.env.DB.prepare("DELETE FROM asset_assignment_attachments WHERE id = ?").bind(c.req.param("attachmentId")).run();
  await audit(c, { module: "assets", action: "asset.assignment.attachment_removed", entityType: "asset_attachment", entityId: c.req.param("attachmentId"), oldValue: attachment });
  return ok(c, { detached: true });
});

assetRoutes.get("/deduction-rules", requirePermission("assets.view"), async (c) => ok(c, { rules: (await c.env.DB.prepare("SELECT adr.*, ac.name AS category_name, pc.code AS payroll_component_code FROM asset_deduction_rules adr LEFT JOIN asset_categories ac ON ac.id = adr.category_id LEFT JOIN payroll_components pc ON pc.id = adr.payroll_component_id ORDER BY adr.created_at DESC").all()).results }));

async function saveDeductionRule(c: Context<AppBindings>, id?: string) {
  const old = id ? await c.env.DB.prepare("SELECT * FROM asset_deduction_rules WHERE id = ?").bind(id).first<Record<string, unknown>>() : null;
  if (id && !old) return fail(c, 404, "NOT_FOUND", "Deduction rule was not found.");
  const body = await readJsonBody(c.req.raw);
  const mode = readString(body.deduction_mode ?? old?.deduction_mode ?? "NONE").toUpperCase();
  const ruleId = id ?? crypto.randomUUID();
  if (!DEDUCTION_MODES.has(mode)) return fail(c, 400, "VALIDATION_ERROR", "Valid deduction mode is required.");
  if (old) {
    await c.env.DB.prepare("UPDATE asset_deduction_rules SET category_id = ?, condition_status = ?, event_type = ?, deduction_mode = ?, deduction_amount = ?, deduction_percent = ?, payroll_component_id = ?, is_active = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.category_id ?? old.category_id), optionalString(body.condition_status ?? old.condition_status), optionalString(body.event_type ?? old.event_type), mode, num(body.deduction_amount ?? old.deduction_amount, null), num(body.deduction_percent ?? old.deduction_percent, null), optionalString(body.payroll_component_id ?? old.payroll_component_id), bool(body.is_active ?? old.is_active, true) ? 1 : 0, now(), ruleId).run();
  } else {
    await c.env.DB.prepare("INSERT INTO asset_deduction_rules (id, category_id, condition_status, event_type, deduction_mode, deduction_amount, deduction_percent, payroll_component_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(ruleId, optionalString(body.category_id), optionalString(body.condition_status), optionalString(body.event_type), mode, num(body.deduction_amount), num(body.deduction_percent), optionalString(body.payroll_component_id), bool(body.is_active, true) ? 1 : 0).run();
  }
  const saved = await c.env.DB.prepare("SELECT * FROM asset_deduction_rules WHERE id = ?").bind(ruleId).first();
  await audit(c, { module: "assets", action: old ? "asset.deduction_rule.updated" : "asset.deduction_rule.created", entityType: "asset_deduction_rule", entityId: ruleId, oldValue: old, newValue: saved });
  return ok(c, { rule: saved }, old ? 200 : 201);
}

assetRoutes.post("/deduction-rules", requirePermission("assets.deductions.manage"), (c) => saveDeductionRule(c));
assetRoutes.patch("/deduction-rules/:id", requirePermission("assets.deductions.manage"), (c) => saveDeductionRule(c, c.req.param("id")));
assetRoutes.post("/deduction-rules/:id/enable", requirePermission("assets.deductions.manage"), async (c) => {
  await c.env.DB.prepare("UPDATE asset_deduction_rules SET is_active = 1, updated_at = ? WHERE id = ?").bind(now(), c.req.param("id")).run();
  await audit(c, { module: "assets", action: "asset.deduction_rule.enabled", entityType: "asset_deduction_rule", entityId: c.req.param("id") });
  return ok(c, { enabled: true });
});
assetRoutes.post("/deduction-rules/:id/disable", requirePermission("assets.deductions.manage"), async (c) => {
  await c.env.DB.prepare("UPDATE asset_deduction_rules SET is_active = 0, updated_at = ? WHERE id = ?").bind(now(), c.req.param("id")).run();
  await audit(c, { module: "assets", action: "asset.deduction_rule.disabled", entityType: "asset_deduction_rule", entityId: c.req.param("id") });
  return ok(c, { enabled: false });
});

employeeAssetRoutes.get("/:employeeId/assets/summary", requireAnyPermission(["employees.assets.view", "assets.view"]), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "assets", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const [assignments, history] = await Promise.all([
    c.env.DB.prepare("SELECT a.*, ai.code AS asset_code, ai.name AS asset_name, ai.size, ai.variant, ac.name AS category_name, ac.type AS category_type FROM employee_asset_assignments a INNER JOIN asset_items ai ON ai.id = a.asset_item_id INNER JOIN asset_categories ac ON ac.id = ai.category_id WHERE a.employee_id = ? ORDER BY a.issued_date DESC").bind(employeeId).all(),
    c.env.DB.prepare("SELECT ev.* FROM employee_asset_assignment_events ev WHERE ev.employee_id = ? ORDER BY ev.created_at DESC LIMIT 100").bind(employeeId).all()
  ]);
  const rows = assignments.results as Record<string, unknown>[];
  return ok(c, { summary: { issued: rows.filter((row) => row.status === "ISSUED").length, damaged: rows.filter((row) => row.status === "DAMAGED").length, lost: rows.filter((row) => row.status === "LOST").length, pending_return: rows.filter((row) => row.status === "ISSUED" && row.expected_return_date).length }, assignments: rows, history: history.results });
});

employeeAssetRoutes.get("/:employeeId/assets/assignments", requireAnyPermission(["employees.assets.view", "assets.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "assets", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT a.*, ai.code AS asset_code, ai.name AS asset_name, ai.size, ai.variant, ac.name AS category_name, ac.type AS category_type FROM employee_asset_assignments a INNER JOIN asset_items ai ON ai.id = a.asset_item_id INNER JOIN asset_categories ac ON ac.id = ai.category_id WHERE a.employee_id = ? ORDER BY a.issued_date DESC").bind(c.req.param("employeeId")).all();
  return ok(c, { assignments: rows.results });
});

employeeAssetRoutes.get("/:employeeId/assets/history", requireAnyPermission(["employees.assets.view", "assets.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "assets", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT ev.*, ai.code AS asset_code, ai.name AS asset_name FROM employee_asset_assignment_events ev LEFT JOIN asset_items ai ON ai.id = ev.asset_item_id WHERE ev.employee_id = ? ORDER BY ev.created_at DESC").bind(c.req.param("employeeId")).all();
  return ok(c, { history: rows.results });
});

assetRoutes.get("/dashboard", requirePermission("assets.view"), async (c) => {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "assets", "view", "e");
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  const row = await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND status = 'ISSUED') AS issued_items,
    (SELECT COUNT(*) FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND status = 'ISSUED' AND expected_return_date IS NOT NULL) AS pending_return,
    (SELECT COUNT(*) FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND status = 'DAMAGED') AS damaged_items,
    (SELECT COUNT(*) FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND status = 'LOST') AS lost_items,
    (SELECT COUNT(*) FROM employee_asset_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND deduction_amount IS NOT NULL AND payroll_deduction_id IS NULL AND payroll_adjustment_id IS NULL) AS deductions_pending,
    (SELECT COUNT(*) FROM employee_notes WHERE employee_id IN (${scopedEmployeeSql}) AND is_archived = 0) AS recent_notes,
    (SELECT COUNT(*) FROM employee_notes WHERE employee_id IN (${scopedEmployeeSql}) AND visibility = 'RESTRICTED' AND is_archived = 0) AS restricted_notes,
    (SELECT COUNT(*) FROM audit_logs WHERE created_at >= datetime('now', '-7 days')) AS recent_audit_activity`).bind(...scope.params, ...scope.params, ...scope.params, ...scope.params, ...scope.params, ...scope.params, ...scope.params).first();
  return ok(c, row ?? {});
});

assetRoutes.get("/reports", requirePermission("assets.reports.view"), async (c) => {
  const { conditions, params } = assetAssignmentFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "assets", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const rows = await c.env.DB.prepare(
    `SELECT a.status, a.issued_date, a.expected_return_date, a.returned_date, a.deduction_amount,
      e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
      ai.code AS asset_code, ai.name AS asset_name, ai.size, ai.variant, ac.name AS category_name
     FROM employee_asset_assignments a
     INNER JOIN employees e ON e.id = a.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     INNER JOIN asset_items ai ON ai.id = a.asset_item_id
     INNER JOIN asset_categories ac ON ac.id = ai.category_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.issued_date DESC LIMIT 1000`
  ).bind(...params).all();
  return ok(c, { reports: rows.results });
});

assetRoutes.get("/reports/export.csv", requirePermission("assets.reports.export"), async (c) => {
  const reports = await (async () => {
    const { conditions, params } = assetAssignmentFilters(c);
    const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "assets", "view", "e");
    conditions.push(scope.sql);
    params.push(...scope.params);
    return c.env.DB.prepare(
      `SELECT a.status, a.issued_date, a.expected_return_date, a.returned_date, a.deduction_amount,
        e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
        ai.code AS asset_code, ai.name AS asset_name, ai.size, ai.variant, ac.name AS category_name
       FROM employee_asset_assignments a
       INNER JOIN employees e ON e.id = a.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       INNER JOIN asset_items ai ON ai.id = a.asset_item_id
       INNER JOIN asset_categories ac ON ac.id = ai.category_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.issued_date DESC LIMIT 5000`
    ).bind(...params).all<Record<string, unknown>>();
  })();
  await audit(c, { module: "assets", action: "asset.report_exported", entityType: "asset_report", entityId: "assets_report", newValue: { rows: reports.results.length } });
  const header = ["status", "issued_date", "expected_return_date", "returned_date", "deduction_amount", "employee_no", "employee_name", "department_name", "location_name", "asset_code", "asset_name", "size", "variant", "category_name"];
  const csv = [header.join(","), ...reports.results.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=asset-report.csv" } });
});

// Note categories and employee notes
employeeNoteCategoryRoutes.get("/categories", requirePermission("employee_notes.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_note_categories ORDER BY sort_order, name").all();
  return ok(c, { categories: rows.results });
});

employeeNoteCategoryRoutes.post("/categories", requirePermission("employee_notes.restricted.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = readString(body.code).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const name = readString(body.name);
  const visibility = readString(body.default_visibility || "GENERAL").toUpperCase();
  if (!code || !name || !NOTE_VISIBILITIES.has(visibility)) return fail(c, 400, "VALIDATION_ERROR", "Code, name, and default visibility are required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO employee_note_categories (id, code, name, description, default_visibility, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, code, name, optionalString(body.description), visibility, bool(body.is_active, true) ? 1 : 0, num(body.sort_order, 100)).run();
  const saved = await c.env.DB.prepare("SELECT * FROM employee_note_categories WHERE id = ?").bind(id).first();
  await audit(c, { module: "employee_notes", action: "employee_note.category.created", entityType: "employee_note_category", entityId: id, newValue: saved });
  return ok(c, { category: saved }, 201);
});

employeeNoteCategoryRoutes.patch("/categories/:id", requirePermission("employee_notes.restricted.manage"), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM employee_note_categories WHERE id = ?").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Note category was not found.");
  const body = await readJsonBody(c.req.raw);
  const visibility = readString(body.default_visibility ?? old.default_visibility).toUpperCase();
  await c.env.DB.prepare("UPDATE employee_note_categories SET code = ?, name = ?, description = ?, default_visibility = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(readString(body.code ?? old.code).toUpperCase().replace(/[^A-Z0-9_]/g, "_"), readString(body.name ?? old.name), optionalString(body.description ?? old.description), NOTE_VISIBILITIES.has(visibility) ? visibility : old.default_visibility, num(body.sort_order, Number(old.sort_order)), now(), old.id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM employee_note_categories WHERE id = ?").bind(old.id).first();
  await audit(c, { module: "employee_notes", action: "employee_note.category.updated", entityType: "employee_note_category", entityId: String(old.id), oldValue: old, newValue: saved });
  return ok(c, { category: saved });
});

async function noteCategoryAction(c: Context<AppBindings>, active: 0 | 1) {
  await c.env.DB.prepare("UPDATE employee_note_categories SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, now(), c.req.param("id")).run();
  await audit(c, { module: "employee_notes", action: active ? "employee_note.category.enabled" : "employee_note.category.disabled", entityType: "employee_note_category", entityId: c.req.param("id") });
  return ok(c, { enabled: Boolean(active) });
}

employeeNoteCategoryRoutes.post("/categories/:id/enable", requirePermission("employee_notes.restricted.manage"), (c) => noteCategoryAction(c, 1));
employeeNoteCategoryRoutes.post("/categories/:id/disable", requirePermission("employee_notes.restricted.manage"), (c) => noteCategoryAction(c, 0));

function noteVisibilityCondition(c: Context<AppBindings>) {
  return has(c, "employee_notes.restricted.view") ? "1 = 1" : "n.visibility = 'GENERAL'";
}

employeeNoteRoutes.get("/:employeeId/notes", requirePermission("employee_notes.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const conditions = ["n.employee_id = ?", noteVisibilityCondition(c)];
  const params: BindValue[] = [c.req.param("employeeId")];
  const includeArchived = readString(c.req.query("include_archived")) === "true";
  if (!includeArchived) conditions.push("n.is_archived = 0");
  for (const [queryName, column] of [["category_id", "n.category_id"], ["visibility", "n.visibility"], ["linked_module", "n.linked_module"]] as const) {
    const value = readString(c.req.query(queryName));
    if (value) { conditions.push(`${column} = ?`); params.push(queryName === "visibility" ? value.toUpperCase() : value); }
  }
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(n.title LIKE ? OR n.note_body LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  const dateFrom = readString(c.req.query("date_from"));
  if (dateFrom) { conditions.push("n.created_at >= ?"); params.push(`${dateFrom}T00:00:00.000Z`); }
  const dateTo = readString(c.req.query("date_to"));
  if (dateTo) { conditions.push("n.created_at <= ?"); params.push(`${dateTo}T23:59:59.999Z`); }
  const rows = await c.env.DB.prepare("SELECT n.*, nc.name AS category_name, u.name AS created_by_name FROM employee_notes n INNER JOIN employee_note_categories nc ON nc.id = n.category_id LEFT JOIN users u ON u.id = n.created_by_user_id WHERE " + conditions.join(" AND ") + " ORDER BY n.created_at DESC LIMIT 500").bind(...params).all();
  return ok(c, { notes: rows.results });
});

employeeNoteRoutes.get("/:employeeId/notes/:noteId", requirePermission("employee_notes.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "view"))) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  const row = await c.env.DB.prepare("SELECT * FROM employee_notes n WHERE n.employee_id = ? AND n.id = ? AND " + noteVisibilityCondition(c)).bind(c.req.param("employeeId"), c.req.param("noteId")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  if (["HR_ONLY", "RESTRICTED"].includes(String((row as Record<string, unknown>).visibility))) await audit(c, { module: "employee_notes", action: "employee_note.restricted_viewed", entityType: "employee_note", entityId: c.req.param("noteId") });
  return ok(c, { note: row });
});

async function saveNote(c: Context<AppBindings>, noteId?: string) {
  const employeeId = readString(c.req.param("employeeId"));
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "employees", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const old = noteId ? await c.env.DB.prepare("SELECT * FROM employee_notes WHERE id = ? AND employee_id = ?").bind(noteId, employeeId).first<Record<string, unknown>>() : null;
  if (noteId && !old) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  const body = await readJsonBody(c.req.raw);
  const visibility = readString(body.visibility ?? old?.visibility ?? "GENERAL").toUpperCase();
  if (!NOTE_VISIBILITIES.has(visibility)) return fail(c, 400, "VALIDATION_ERROR", "Valid visibility is required.");
  if (visibility !== "GENERAL" && !has(c, "employee_notes.restricted.view")) return fail(c, 403, "FORBIDDEN", "HR-only and restricted notes require restricted note access.");
  if ((visibility === "RESTRICTED" || old?.visibility === "RESTRICTED") && !has(c, "employee_notes.restricted.manage")) return fail(c, 403, "FORBIDDEN", "Restricted notes require restricted manage permission.");
  const categoryId = readString(body.category_id ?? old?.category_id);
  const title = readString(body.title ?? old?.title);
  const noteBody = readString(body.note_body ?? old?.note_body);
  const linkedModule = optionalString(body.linked_module ?? old?.linked_module);
  if (!categoryId || !title || !noteBody) return fail(c, 400, "VALIDATION_ERROR", "Category, title, and note body are required.");
  if (linkedModule && !NOTE_MODULES.has(linkedModule)) return fail(c, 400, "VALIDATION_ERROR", "Linked module is invalid.");
  const id = noteId ?? crypto.randomUUID();
  if (old) {
    await c.env.DB.prepare("UPDATE employee_notes SET category_id = ?, title = ?, note_body = ?, visibility = ?, linked_module = ?, linked_entity_id = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(categoryId, title, noteBody, visibility, linkedModule, optionalString(body.linked_entity_id ?? old.linked_entity_id), c.get("currentUser").id, now(), id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO employee_notes (id, employee_id, category_id, title, note_body, visibility, linked_module, linked_entity_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, employeeId, categoryId, title, noteBody, visibility, linkedModule, optionalString(body.linked_entity_id), c.get("currentUser").id).run();
  }
  const versionNo = (await c.env.DB.prepare("SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM employee_note_versions WHERE employee_note_id = ?").bind(id).first<{ version_no: number }>())?.version_no ?? 1;
  await c.env.DB.prepare("INSERT INTO employee_note_versions (id, employee_note_id, version_no, title, note_body, visibility, linked_module, linked_entity_id, edited_by_user_id, edit_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, versionNo, title, noteBody, visibility, linkedModule, optionalString(body.linked_entity_id ?? old?.linked_entity_id), c.get("currentUser").id, optionalString(body.edit_reason ?? body.reason)).run();
  const saved = await c.env.DB.prepare("SELECT * FROM employee_notes WHERE id = ?").bind(id).first();
  await audit(c, { module: "employee_notes", action: old ? "employee_note.updated" : "employee_note.created", entityType: "employee_note", entityId: id, oldValue: old, newValue: saved, reason: optionalString(body.reason ?? body.edit_reason) });
  await publish(c, old ? "employee_note.updated" : "employee_note.created", "employee_note", id, old ? "updated" : "created");
  await publish(c, "employee_notes.changed", "employee_note", employeeId, old ? "note_updated" : "note_created");
  return ok(c, { note: saved }, old ? 200 : 201);
}

employeeNoteRoutes.post("/:employeeId/notes", requirePermission("employee_notes.create"), (c) => saveNote(c));
employeeNoteRoutes.patch("/:employeeId/notes/:noteId", requirePermission("employee_notes.update"), (c) => saveNote(c, c.req.param("noteId")));

employeeNoteRoutes.post("/:employeeId/notes/:noteId/archive", requirePermission("employee_notes.archive"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  const note = await c.env.DB.prepare("SELECT * FROM employee_notes WHERE id = ? AND employee_id = ?").bind(c.req.param("noteId"), c.req.param("employeeId")).first<Record<string, unknown>>();
  if (!note) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  if (!canAccessNote(c, note)) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  if (!canManageRestrictedNote(c, note)) return fail(c, 403, "FORBIDDEN", "Restricted note changes require restricted manage permission.");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Archive reason is required.");
  await c.env.DB.prepare("UPDATE employee_notes SET is_archived = 1, archived_by_user_id = ?, archived_at = ?, archive_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now(), reason, now(), note.id).run();
  await audit(c, { module: "employee_notes", action: "employee_note.archived", entityType: "employee_note", entityId: String(note.id), oldValue: note, reason });
  await publish(c, "employee_note.archived", "employee_note", String(note.id), "archived");
  return ok(c, { archived: true });
});

employeeNoteRoutes.get("/:employeeId/notes/:noteId/versions", requirePermission("employee_notes.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "view"))) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  const access = await requireNoteAccess(c);
  if (access.response) return access.response;
  const rows = await c.env.DB.prepare("SELECT v.*, u.name AS edited_by_name FROM employee_note_versions v LEFT JOIN users u ON u.id = v.edited_by_user_id WHERE v.employee_note_id = ? ORDER BY v.version_no DESC").bind(c.req.param("noteId")).all();
  return ok(c, { versions: rows.results });
});

employeeNoteRoutes.get("/:employeeId/notes/:noteId/attachments", requirePermission("employee_notes.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "view"))) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  const access = await requireNoteAccess(c);
  if (access.response) return access.response;
  const rows = await c.env.DB.prepare(
    `SELECT na.*, ed.id AS document_id, ed.document_number, ed.status AS document_status,
        ed.archived_at, ed.soft_deleted_at, ed.is_sensitive AS document_is_sensitive,
        dt.name AS document_type_name, dt.is_sensitive AS document_type_is_sensitive,
        ev.original_filename, u.name AS attached_by_name
     FROM employee_note_attachments na
     LEFT JOIN employee_documents ed ON ed.id = na.employee_document_id
     LEFT JOIN document_types dt ON dt.id = ed.document_type_id
     LEFT JOIN employee_document_versions ev ON ev.id = ed.current_version_id
     LEFT JOIN users u ON u.id = na.attached_by_user_id
     WHERE na.employee_note_id = ?
     ORDER BY na.attached_at DESC`
  ).bind(c.req.param("noteId")).all<Record<string, unknown>>();
  return ok(c, { attachments: sanitizeDocumentAttachmentRows(c, rows.results) });
});

employeeNoteRoutes.post("/:employeeId/notes/:noteId/attachments", requirePermission("employee_notes.attachments.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  const access = await requireNoteAccess(c, { restrictedManage: true });
  if (access.response) return access.response;
  const body = await readJsonBody(c.req.raw);
  const employeeDocumentId = optionalString(body.employee_document_id);
  const invalidDocument = await validateActiveEmployeeDocument(c, employeeDocumentId, c.req.param("employeeId"));
  if (invalidDocument) return invalidDocument;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO employee_note_attachments (id, employee_note_id, employee_document_id, description, attached_by_user_id) VALUES (?, ?, ?, ?, ?)").bind(id, c.req.param("noteId"), employeeDocumentId, optionalString(body.description), c.get("currentUser").id).run();
  await audit(c, { module: "employee_notes", action: "employee_note.attachment_added", entityType: "employee_note_attachment", entityId: id, newValue: body });
  return ok(c, { attachment: await c.env.DB.prepare("SELECT * FROM employee_note_attachments WHERE id = ?").bind(id).first() }, 201);
});

employeeNoteRoutes.delete("/:employeeId/notes/:noteId/attachments/:attachmentId", requirePermission("employee_notes.attachments.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee note was not found.");
  const access = await requireNoteAccess(c, { restrictedManage: true });
  if (access.response) return access.response;
  const attachment = await c.env.DB.prepare("SELECT * FROM employee_note_attachments WHERE id = ? AND employee_note_id = ?").bind(c.req.param("attachmentId"), c.req.param("noteId")).first();
  if (!attachment) return fail(c, 404, "NOT_FOUND", "Attachment was not found.");
  await c.env.DB.prepare("DELETE FROM employee_note_attachments WHERE id = ?").bind(c.req.param("attachmentId")).run();
  await audit(c, { module: "employee_notes", action: "employee_note.attachment_removed", entityType: "employee_note_attachment", entityId: c.req.param("attachmentId"), oldValue: attachment });
  return ok(c, { detached: true });
});

// Audit
auditRoutes.get("/", requirePermission("audit.view"), async (c) => ok(c, { audit: (await auditRows(c)).results }));

auditRoutes.get("/export.csv", requirePermission("audit.export"), async (c) => {
  const rows = (await auditRows(c, undefined, 5000)).results;
  await audit(c, { module: "audit", action: "audit.exported", entityType: "audit_export", entityId: crypto.randomUUID(), newValue: { rows: rows.length } });
  const header = ["created_at", "module", "action", "entity_type", "entity_id", "actor_name", "actor_email", "reason", "ip_address", "user_agent"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=audit-log.csv" } });
});

employeeAssetRoutes.get("/:employeeId/audit", requireAnyPermission(["employees.audit.view", "audit.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("employeeId"), "employees", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { audit: (await auditRows(c, c.req.param("employeeId"))).results });
});

employeeAssetRoutes.get("/:employeeId/audit/export.csv", requirePermission("audit.export"), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "employees", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = (await auditRows(c, employeeId, 5000)).results;
  const exportId = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO employee_audit_export_logs (id, employee_id, filters_json, exported_by_user_id) VALUES (?, ?, ?, ?)").bind(exportId, employeeId, JSON.stringify(c.req.query()), c.get("currentUser").id).run();
  await audit(c, { module: "audit", action: "employee.audit.exported", entityType: "audit_export", entityId: exportId, newValue: { employee_id: employeeId, rows: rows.length } });
  const header = ["created_at", "module", "action", "entity_type", "entity_id", "actor_name", "actor_email", "reason"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=employee-audit.csv" } });
});
