import { Hono } from "hono";
import type { Context } from "hono";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { isEmail, readJsonBody, readString } from "../utils/validation";

type CompanyStatus = "ACTIVE" | "INACTIVE";
type LocationType = "OUTLET" | "OFFICE" | "WAREHOUSE" | "OTHER";
type BindValue = string | number | null;

interface CompanyRow {
  id: string;
  name: string;
  legal_name: string | null;
  registration_no: string | null;
  tax_no: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_document_id: string | null;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

interface LocationRow {
  id: string;
  company_id: string | null;
  code: string;
  name: string;
  type: LocationType;
  island_city: string | null;
  address: string | null;
  phone: string | null;
  manager_employee_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  parent_department_name?: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface JobLevelRow {
  id: string;
  code: string;
  name: string;
  rank_order: number;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface PositionRow {
  id: string;
  code: string;
  title: string;
  department_id: string | null;
  department_name?: string | null;
  level_id: string | null;
  level_name?: string | null;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

const COMPANY_STATUSES = new Set<CompanyStatus>(["ACTIVE", "INACTIVE"]);
const LOCATION_TYPES = new Set<LocationType>(["OUTLET", "OFFICE", "WAREHOUSE", "OTHER"]);

export const organizationRoutes = new Hono<AppBindings>();

organizationRoutes.use("*", requireAuth);

function optionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function normalizeCode(value: unknown) {
  return readString(value).toUpperCase();
}

function normalizeBooleanQuery(value: string | undefined) {
  if (value === undefined || value === "") {
    return null;
  }
  if (["true", "1", "active"].includes(value.toLowerCase())) {
    return 1;
  }
  if (["false", "0", "inactive"].includes(value.toLowerCase())) {
    return 0;
  }
  return null;
}

function safeActive(value: number) {
  return value === 1;
}

function toCompany(row: CompanyRow | null) {
  return row;
}

function toLocation(row: LocationRow) {
  return { ...row, is_active: safeActive(row.is_active) };
}

function toDepartment(row: DepartmentRow) {
  return { ...row, is_active: safeActive(row.is_active) };
}

function toJobLevel(row: JobLevelRow) {
  return { ...row, is_active: safeActive(row.is_active) };
}

function toPosition(row: PositionRow) {
  return { ...row, is_active: safeActive(row.is_active) };
}

async function auditOrganization(
  c: Context<AppBindings>,
  input: {
    action: string;
    entityType: "company" | "location" | "department" | "job_level" | "position";
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
  }
) {
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: input.action,
    module: "organization",
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishOrganization(c: Context<AppBindings>, event: "organization.changed" | "locations.changed" | "departments.changed" | "positions.changed" | "job_levels.changed", entityType: "company" | "location" | "department" | "position" | "job_level", entityId: string, action: string) {
  const actor = c.get("currentUser");
  await publishAccessEvent(c.env, event, {
    actor_user_id: actor.id,
    entity_type: entityType,
    entity_id: entityId,
    action
  });
  if (event !== "organization.changed") {
    await publishAccessEvent(c.env, "organization.changed", {
      actor_user_id: actor.id,
      entity_type: entityType,
      entity_id: entityId,
      action
    });
  }
}

async function getCompany(db: AppBindings["Bindings"]["DB"]) {
  return db
    .prepare(
      `SELECT id, name, legal_name, registration_no, tax_no, address, phone, email, logo_document_id, status, created_at, updated_at
       FROM companies
       ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`
    )
    .first<CompanyRow>();
}

function companyInput(body: Record<string, unknown>) {
  const name = readString(body.name);
  const email = optionalString(body.email);
  const status = typeof body.status === "string" && COMPANY_STATUSES.has(body.status as CompanyStatus) ? (body.status as CompanyStatus) : null;
  return {
    name,
    legal_name: optionalString(body.legal_name),
    registration_no: optionalString(body.registration_no),
    tax_no: optionalString(body.tax_no),
    address: optionalString(body.address),
    phone: optionalString(body.phone),
    email,
    status
  };
}

function validateCompany(c: Context<AppBindings>, input: ReturnType<typeof companyInput>) {
  if (!input.name) {
    return fail(c, 400, "VALIDATION_ERROR", "Company name is required.");
  }
  if (input.email && !isEmail(input.email)) {
    return fail(c, 400, "VALIDATION_ERROR", "Company email must be valid.");
  }
  if (!input.status) {
    return fail(c, 400, "VALIDATION_ERROR", "Company status must be ACTIVE or INACTIVE.");
  }
  return null;
}

organizationRoutes.get("/company", requirePermission("organization.view"), async (c) => {
  return ok(c, { company: toCompany(await getCompany(c.env.DB)) });
});

organizationRoutes.post("/company", requirePermission("organization.manage"), async (c) => {
  const existing = await getCompany(c.env.DB);
  if (existing) {
    return fail(c, 409, "COMPANY_EXISTS", "Company profile already exists. Use update instead.");
  }
  const input = companyInput(await readJsonBody(c.req.raw));
  const validation = validateCompany(c, input);
  if (validation) {
    return validation;
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO companies (id, name, legal_name, registration_no, tax_no, address, phone, email, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.name, input.legal_name, input.registration_no, input.tax_no, input.address, input.phone, input.email, input.status)
    .run();
  const company = await getCompany(c.env.DB);
  await auditOrganization(c, { action: "organization.company.created", entityType: "company", entityId: id, newValue: company });
  await publishOrganization(c, "organization.changed", "company", id, "created");
  return ok(c, { company: toCompany(company) }, 201);
});

organizationRoutes.patch("/company", requirePermission("organization.manage"), async (c) => {
  const existing = await getCompany(c.env.DB);
  const input = companyInput(await readJsonBody(c.req.raw));
  const validation = validateCompany(c, input);
  if (validation) {
    return validation;
  }
  const id = existing?.id ?? crypto.randomUUID();
  if (!existing) {
    await c.env.DB
      .prepare(
        `INSERT INTO companies (id, name, legal_name, registration_no, tax_no, address, phone, email, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.name, input.legal_name, input.registration_no, input.tax_no, input.address, input.phone, input.email, input.status)
      .run();
    const company = await getCompany(c.env.DB);
    await auditOrganization(c, { action: "organization.company.created", entityType: "company", entityId: id, newValue: company });
    await publishOrganization(c, "organization.changed", "company", id, "created");
    return ok(c, { company: toCompany(company) }, 201);
  }
  await c.env.DB
    .prepare(
      `UPDATE companies
       SET name = ?, legal_name = ?, registration_no = ?, tax_no = ?, address = ?, phone = ?, email = ?, status = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(input.name, input.legal_name, input.registration_no, input.tax_no, input.address, input.phone, input.email, input.status, new Date().toISOString(), existing.id)
    .run();
  const company = await getCompany(c.env.DB);
  await auditOrganization(c, { action: "organization.company.updated", entityType: "company", entityId: existing.id, oldValue: existing, newValue: company });
  await publishOrganization(c, "organization.changed", "company", existing.id, "updated");
  return ok(c, { company: toCompany(company) });
});

function appendSearch(sql: string, conditions: string[], params: BindValue[], fields: string[], search: string | undefined) {
  const text = readString(search);
  if (!text) {
    return sql;
  }
  conditions.push(`(${fields.map((field) => `${field} LIKE ?`).join(" OR ")})`);
  fields.forEach(() => params.push(`%${text}%`));
  return sql;
}

async function activeCodeExists(db: AppBindings["Bindings"]["DB"], table: "locations" | "departments" | "job_levels" | "positions", code: string, excludeId?: string) {
  let sql = `SELECT id FROM ${table} WHERE code = ? COLLATE NOCASE AND is_active = 1`;
  const params: BindValue[] = [code];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  return db.prepare(sql).bind(...params).first<{ id: string }>();
}

async function rowExists(db: AppBindings["Bindings"]["DB"], table: "departments" | "job_levels", id: string) {
  return db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first<{ id: string }>();
}

organizationRoutes.get("/locations", requirePermission("organization.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  appendSearch("", conditions, params, ["code", "name", "island_city", "address", "phone"], c.req.query("search"));
  const isActive = normalizeBooleanQuery(c.req.query("is_active"));
  if (isActive !== null) {
    conditions.push("is_active = ?");
    params.push(isActive);
  }
  const type = c.req.query("type");
  if (type && LOCATION_TYPES.has(type as LocationType)) {
    conditions.push("type = ?");
    params.push(type);
  }
  const sql = `SELECT * FROM locations ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY is_active DESC, name`;
  const rows = await c.env.DB.prepare(sql).bind(...params).all<LocationRow>();
  return ok(c, { locations: rows.results.map(toLocation) });
});

organizationRoutes.get("/locations/:id", requirePermission("organization.view"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM locations WHERE id = ?").bind(c.req.param("id")).first<LocationRow>();
  if (!row) {
    return fail(c, 404, "NOT_FOUND", "Location was not found.");
  }
  return ok(c, { location: toLocation(row) });
});

organizationRoutes.post("/locations", requirePermission("organization.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const name = readString(body.name);
  const type = typeof body.type === "string" && LOCATION_TYPES.has(body.type as LocationType) ? (body.type as LocationType) : null;
  if (!code || !name) {
    return fail(c, 400, "VALIDATION_ERROR", "Location code and name are required.");
  }
  if (!type) {
    return fail(c, 400, "VALIDATION_ERROR", "Location type must be OUTLET, OFFICE, WAREHOUSE, or OTHER.");
  }
  if (await activeCodeExists(c.env.DB, "locations", code)) {
    return fail(c, 409, "DUPLICATE_CODE", "An active location with this code already exists.");
  }
  const company = await getCompany(c.env.DB);
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO locations (id, company_id, code, name, type, island_city, address, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, company?.id ?? null, code, name, type, optionalString(body.island_city), optionalString(body.address), optionalString(body.phone))
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM locations WHERE id = ?").bind(id).first<LocationRow>();
  await auditOrganization(c, { action: "organization.location.created", entityType: "location", entityId: id, newValue: row });
  await publishOrganization(c, "locations.changed", "location", id, "created");
  return ok(c, { location: row ? toLocation(row) : null }, 201);
});

organizationRoutes.patch("/locations/:id", requirePermission("organization.manage"), async (c) => {
  const existing = await c.env.DB.prepare("SELECT * FROM locations WHERE id = ?").bind(c.req.param("id")).first<LocationRow>();
  if (!existing) {
    return fail(c, 404, "NOT_FOUND", "Location was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const name = readString(body.name);
  const type = typeof body.type === "string" && LOCATION_TYPES.has(body.type as LocationType) ? (body.type as LocationType) : null;
  if (!code || !name) {
    return fail(c, 400, "VALIDATION_ERROR", "Location code and name are required.");
  }
  if (!type) {
    return fail(c, 400, "VALIDATION_ERROR", "Location type must be OUTLET, OFFICE, WAREHOUSE, or OTHER.");
  }
  if (existing.is_active === 1 && (await activeCodeExists(c.env.DB, "locations", code, existing.id))) {
    return fail(c, 409, "DUPLICATE_CODE", "An active location with this code already exists.");
  }
  await c.env.DB
    .prepare("UPDATE locations SET code = ?, name = ?, type = ?, island_city = ?, address = ?, phone = ?, updated_at = ? WHERE id = ?")
    .bind(code, name, type, optionalString(body.island_city), optionalString(body.address), optionalString(body.phone), new Date().toISOString(), existing.id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM locations WHERE id = ?").bind(existing.id).first<LocationRow>();
  await auditOrganization(c, { action: "organization.location.updated", entityType: "location", entityId: existing.id, oldValue: existing, newValue: row });
  await publishOrganization(c, "locations.changed", "location", existing.id, "updated");
  return ok(c, { location: row ? toLocation(row) : null });
});

async function setActive(c: Context<AppBindings>, table: "locations" | "departments" | "job_levels" | "positions", entityType: "location" | "department" | "job_level" | "position", event: "locations.changed" | "departments.changed" | "job_levels.changed" | "positions.changed", active: 0 | 1) {
  const id = c.req.param("id");
  if (!id) {
    return fail(c, 400, "VALIDATION_ERROR", "Record id is required.");
  }
  const existing = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  if (!existing) {
    return fail(c, 404, "NOT_FOUND", `${entityType.replace("_", " ")} was not found.`);
  }
  if (active === 1) {
    const code = typeof existing.code === "string" ? existing.code : "";
    if (code && (await activeCodeExists(c.env.DB, table, code, id))) {
      return fail(c, 409, "DUPLICATE_CODE", `Another active ${entityType.replace("_", " ")} already uses this code.`);
    }
    if (table === "job_levels" && typeof existing.rank_order === "number" && (await activeRankExists(c.env.DB, existing.rank_order, id))) {
      return fail(c, 409, "DUPLICATE_RANK", "Another active job level already uses this rank order.");
    }
  }
  await c.env.DB.prepare(`UPDATE ${table} SET is_active = ?, updated_at = ? WHERE id = ?`).bind(active, new Date().toISOString(), id).run();
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  const action = active === 1 ? "enabled" : "disabled";
  await auditOrganization(c, {
    action: `organization.${entityType}.${action}`,
    entityType,
    entityId: id,
    oldValue: existing,
    newValue: row
  });
  await publishOrganization(c, event, entityType, id, action);
  return ok(c, { record: row });
}

organizationRoutes.post("/locations/:id/enable", requirePermission("organization.manage"), (c) => setActive(c, "locations", "location", "locations.changed", 1));
organizationRoutes.post("/locations/:id/disable", requirePermission("organization.manage"), (c) => setActive(c, "locations", "location", "locations.changed", 0));

organizationRoutes.get("/departments", requirePermission("organization.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  appendSearch("", conditions, params, ["d.code", "d.name", "d.description"], c.req.query("search"));
  const isActive = normalizeBooleanQuery(c.req.query("is_active"));
  if (isActive !== null) {
    conditions.push("d.is_active = ?");
    params.push(isActive);
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT d.*, p.name AS parent_department_name
       FROM departments d
       LEFT JOIN departments p ON p.id = d.parent_department_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY d.is_active DESC, d.name`
    )
    .bind(...params)
    .all<DepartmentRow>();
  return ok(c, { departments: rows.results.map(toDepartment) });
});

organizationRoutes.get("/departments/:id", requirePermission("organization.view"), async (c) => {
  const row = await c.env.DB
    .prepare("SELECT d.*, p.name AS parent_department_name FROM departments d LEFT JOIN departments p ON p.id = d.parent_department_id WHERE d.id = ?")
    .bind(c.req.param("id"))
    .first<DepartmentRow>();
  if (!row) {
    return fail(c, 404, "NOT_FOUND", "Department was not found.");
  }
  return ok(c, { department: toDepartment(row) });
});

organizationRoutes.post("/departments", requirePermission("organization.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const name = readString(body.name);
  const parentId = optionalString(body.parent_department_id);
  if (!code || !name) {
    return fail(c, 400, "VALIDATION_ERROR", "Department code and name are required.");
  }
  if (await activeCodeExists(c.env.DB, "departments", code)) {
    return fail(c, 409, "DUPLICATE_CODE", "An active department with this code already exists.");
  }
  if (parentId && !(await rowExists(c.env.DB, "departments", parentId))) {
    return fail(c, 400, "INVALID_PARENT", "Parent department was not found.");
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO departments (id, code, name, description, parent_department_id) VALUES (?, ?, ?, ?, ?)")
    .bind(id, code, name, optionalString(body.description), parentId)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM departments WHERE id = ?").bind(id).first<DepartmentRow>();
  await auditOrganization(c, { action: "organization.department.created", entityType: "department", entityId: id, newValue: row });
  await publishOrganization(c, "departments.changed", "department", id, "created");
  return ok(c, { department: row ? toDepartment(row) : null }, 201);
});

organizationRoutes.patch("/departments/:id", requirePermission("organization.manage"), async (c) => {
  const existing = await c.env.DB.prepare("SELECT * FROM departments WHERE id = ?").bind(c.req.param("id")).first<DepartmentRow>();
  if (!existing) {
    return fail(c, 404, "NOT_FOUND", "Department was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const name = readString(body.name);
  const parentId = optionalString(body.parent_department_id);
  if (!code || !name) {
    return fail(c, 400, "VALIDATION_ERROR", "Department code and name are required.");
  }
  if (parentId === existing.id) {
    return fail(c, 400, "INVALID_PARENT", "A department cannot be its own parent.");
  }
  if (parentId && !(await rowExists(c.env.DB, "departments", parentId))) {
    return fail(c, 400, "INVALID_PARENT", "Parent department was not found.");
  }
  if (existing.is_active === 1 && (await activeCodeExists(c.env.DB, "departments", code, existing.id))) {
    return fail(c, 409, "DUPLICATE_CODE", "An active department with this code already exists.");
  }
  await c.env.DB
    .prepare("UPDATE departments SET code = ?, name = ?, description = ?, parent_department_id = ?, updated_at = ? WHERE id = ?")
    .bind(code, name, optionalString(body.description), parentId, new Date().toISOString(), existing.id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM departments WHERE id = ?").bind(existing.id).first<DepartmentRow>();
  await auditOrganization(c, { action: "organization.department.updated", entityType: "department", entityId: existing.id, oldValue: existing, newValue: row });
  await publishOrganization(c, "departments.changed", "department", existing.id, "updated");
  return ok(c, { department: row ? toDepartment(row) : null });
});

organizationRoutes.post("/departments/:id/enable", requirePermission("organization.manage"), (c) => setActive(c, "departments", "department", "departments.changed", 1));
organizationRoutes.post("/departments/:id/disable", requirePermission("organization.manage"), (c) => setActive(c, "departments", "department", "departments.changed", 0));

organizationRoutes.get("/job-levels", requirePermission("organization.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  appendSearch("", conditions, params, ["code", "name", "description"], c.req.query("search"));
  const isActive = normalizeBooleanQuery(c.req.query("is_active"));
  if (isActive !== null) {
    conditions.push("is_active = ?");
    params.push(isActive);
  }
  const rows = await c.env.DB.prepare(`SELECT * FROM job_levels ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY rank_order, name`).bind(...params).all<JobLevelRow>();
  return ok(c, { job_levels: rows.results.map(toJobLevel) });
});

organizationRoutes.get("/job-levels/:id", requirePermission("organization.view"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM job_levels WHERE id = ?").bind(c.req.param("id")).first<JobLevelRow>();
  if (!row) {
    return fail(c, 404, "NOT_FOUND", "Job level was not found.");
  }
  return ok(c, { job_level: toJobLevel(row) });
});

async function activeRankExists(db: AppBindings["Bindings"]["DB"], rankOrder: number, excludeId?: string) {
  let sql = "SELECT id FROM job_levels WHERE rank_order = ? AND is_active = 1";
  const params: BindValue[] = [rankOrder];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  return db.prepare(sql).bind(...params).first<{ id: string }>();
}

organizationRoutes.post("/job-levels", requirePermission("organization.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const name = readString(body.name);
  const rankOrder = Number(body.rank_order);
  if (!code || !name || !Number.isInteger(rankOrder)) {
    return fail(c, 400, "VALIDATION_ERROR", "Job level code, name, and numeric rank order are required.");
  }
  if (await activeCodeExists(c.env.DB, "job_levels", code)) {
    return fail(c, 409, "DUPLICATE_CODE", "An active job level with this code already exists.");
  }
  if (await activeRankExists(c.env.DB, rankOrder)) {
    return fail(c, 409, "DUPLICATE_RANK", "An active job level with this rank order already exists.");
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO job_levels (id, code, name, rank_order, description) VALUES (?, ?, ?, ?, ?)")
    .bind(id, code, name, rankOrder, optionalString(body.description))
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM job_levels WHERE id = ?").bind(id).first<JobLevelRow>();
  await auditOrganization(c, { action: "organization.job_level.created", entityType: "job_level", entityId: id, newValue: row });
  await publishOrganization(c, "job_levels.changed", "job_level", id, "created");
  return ok(c, { job_level: row ? toJobLevel(row) : null }, 201);
});

organizationRoutes.patch("/job-levels/:id", requirePermission("organization.manage"), async (c) => {
  const existing = await c.env.DB.prepare("SELECT * FROM job_levels WHERE id = ?").bind(c.req.param("id")).first<JobLevelRow>();
  if (!existing) {
    return fail(c, 404, "NOT_FOUND", "Job level was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const name = readString(body.name);
  const rankOrder = Number(body.rank_order);
  if (!code || !name || !Number.isInteger(rankOrder)) {
    return fail(c, 400, "VALIDATION_ERROR", "Job level code, name, and numeric rank order are required.");
  }
  if (existing.is_active === 1 && (await activeCodeExists(c.env.DB, "job_levels", code, existing.id))) {
    return fail(c, 409, "DUPLICATE_CODE", "An active job level with this code already exists.");
  }
  if (existing.is_active === 1 && (await activeRankExists(c.env.DB, rankOrder, existing.id))) {
    return fail(c, 409, "DUPLICATE_RANK", "An active job level with this rank order already exists.");
  }
  await c.env.DB
    .prepare("UPDATE job_levels SET code = ?, name = ?, rank_order = ?, description = ?, updated_at = ? WHERE id = ?")
    .bind(code, name, rankOrder, optionalString(body.description), new Date().toISOString(), existing.id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM job_levels WHERE id = ?").bind(existing.id).first<JobLevelRow>();
  await auditOrganization(c, { action: "organization.job_level.updated", entityType: "job_level", entityId: existing.id, oldValue: existing, newValue: row });
  await publishOrganization(c, "job_levels.changed", "job_level", existing.id, "updated");
  return ok(c, { job_level: row ? toJobLevel(row) : null });
});

organizationRoutes.post("/job-levels/:id/enable", requirePermission("organization.manage"), (c) => setActive(c, "job_levels", "job_level", "job_levels.changed", 1));
organizationRoutes.post("/job-levels/:id/disable", requirePermission("organization.manage"), (c) => setActive(c, "job_levels", "job_level", "job_levels.changed", 0));

organizationRoutes.get("/positions", requirePermission("organization.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  appendSearch("", conditions, params, ["p.code", "p.title", "p.description"], c.req.query("search"));
  const isActive = normalizeBooleanQuery(c.req.query("is_active"));
  if (isActive !== null) {
    conditions.push("p.is_active = ?");
    params.push(isActive);
  }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) {
    conditions.push("p.department_id = ?");
    params.push(departmentId);
  }
  const levelId = readString(c.req.query("level_id"));
  if (levelId) {
    conditions.push("p.level_id = ?");
    params.push(levelId);
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT p.*, d.name AS department_name, jl.name AS level_name
       FROM positions p
       LEFT JOIN departments d ON d.id = p.department_id
       LEFT JOIN job_levels jl ON jl.id = p.level_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY p.is_active DESC, p.title`
    )
    .bind(...params)
    .all<PositionRow>();
  return ok(c, { positions: rows.results.map(toPosition) });
});

organizationRoutes.get("/positions/:id", requirePermission("organization.view"), async (c) => {
  const row = await c.env.DB
    .prepare(
      `SELECT p.*, d.name AS department_name, jl.name AS level_name
       FROM positions p
       LEFT JOIN departments d ON d.id = p.department_id
       LEFT JOIN job_levels jl ON jl.id = p.level_id
       WHERE p.id = ?`
    )
    .bind(c.req.param("id"))
    .first<PositionRow>();
  if (!row) {
    return fail(c, 404, "NOT_FOUND", "Position was not found.");
  }
  return ok(c, { position: toPosition(row) });
});

organizationRoutes.post("/positions", requirePermission("organization.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const title = readString(body.title);
  const departmentId = optionalString(body.department_id);
  const levelId = optionalString(body.level_id);
  if (!code || !title) {
    return fail(c, 400, "VALIDATION_ERROR", "Position code and title are required.");
  }
  if (await activeCodeExists(c.env.DB, "positions", code)) {
    return fail(c, 409, "DUPLICATE_CODE", "An active position with this code already exists.");
  }
  if (departmentId && !(await rowExists(c.env.DB, "departments", departmentId))) {
    return fail(c, 400, "INVALID_DEPARTMENT", "Selected department was not found.");
  }
  if (levelId && !(await rowExists(c.env.DB, "job_levels", levelId))) {
    return fail(c, 400, "INVALID_JOB_LEVEL", "Selected job level was not found.");
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO positions (id, code, title, department_id, level_id, description) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, code, title, departmentId, levelId, optionalString(body.description))
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM positions WHERE id = ?").bind(id).first<PositionRow>();
  await auditOrganization(c, { action: "organization.position.created", entityType: "position", entityId: id, newValue: row });
  await publishOrganization(c, "positions.changed", "position", id, "created");
  return ok(c, { position: row ? toPosition(row) : null }, 201);
});

organizationRoutes.patch("/positions/:id", requirePermission("organization.manage"), async (c) => {
  const existing = await c.env.DB.prepare("SELECT * FROM positions WHERE id = ?").bind(c.req.param("id")).first<PositionRow>();
  if (!existing) {
    return fail(c, 404, "NOT_FOUND", "Position was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const code = normalizeCode(body.code);
  const title = readString(body.title);
  const departmentId = optionalString(body.department_id);
  const levelId = optionalString(body.level_id);
  if (!code || !title) {
    return fail(c, 400, "VALIDATION_ERROR", "Position code and title are required.");
  }
  if (existing.is_active === 1 && (await activeCodeExists(c.env.DB, "positions", code, existing.id))) {
    return fail(c, 409, "DUPLICATE_CODE", "An active position with this code already exists.");
  }
  if (departmentId && !(await rowExists(c.env.DB, "departments", departmentId))) {
    return fail(c, 400, "INVALID_DEPARTMENT", "Selected department was not found.");
  }
  if (levelId && !(await rowExists(c.env.DB, "job_levels", levelId))) {
    return fail(c, 400, "INVALID_JOB_LEVEL", "Selected job level was not found.");
  }
  await c.env.DB
    .prepare("UPDATE positions SET code = ?, title = ?, department_id = ?, level_id = ?, description = ?, updated_at = ? WHERE id = ?")
    .bind(code, title, departmentId, levelId, optionalString(body.description), new Date().toISOString(), existing.id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM positions WHERE id = ?").bind(existing.id).first<PositionRow>();
  await auditOrganization(c, { action: "organization.position.updated", entityType: "position", entityId: existing.id, oldValue: existing, newValue: row });
  await publishOrganization(c, "positions.changed", "position", existing.id, "updated");
  return ok(c, { position: row ? toPosition(row) : null });
});

organizationRoutes.post("/positions/:id/enable", requirePermission("organization.manage"), (c) => setActive(c, "positions", "position", "positions.changed", 1));
organizationRoutes.post("/positions/:id/disable", requirePermission("organization.manage"), (c) => setActive(c, "positions", "position", "positions.changed", 0));
