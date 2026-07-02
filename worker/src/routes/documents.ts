import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDocumentRules, validateOrganizationCascade, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import { refreshComplianceAfterDocumentChange, resolveDocumentAlertForRenewedDocument } from "./document-compliance";
import type { AppBindings } from "../types";
import { fail, getClientIp, nowIso, ok } from "../utils/http";
import { requireOperationalModuleMiddleware } from "../utils/module-enforcement";
import { paginationMeta, parsePaginationParams } from "../utils/pagination";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type StoredStatus = "ACTIVE" | "ARCHIVED" | "SOFT_DELETED";
type DisplayStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "ARCHIVED" | "SOFT_DELETED";

const DOCUMENT_CATEGORY_COLUMNS = "id, name, description, sort_order, is_active, created_at, updated_at";
const DOCUMENT_TYPE_LIST_COLUMNS = `
  dt.id, dt.category_id, dc.name AS category_name, dt.code, dt.name, dt.description,
  dt.is_sensitive, dt.is_active, dt.expiring_soon_days, dt.allowed_file_types_json,
  dt.allowed_mime_types, dt.max_file_size_mb, dt.allow_multiple_files, dt.requires_expiry_date,
  dt.requires_issue_date, dt.requires_document_number, dt.retention_rule_json,
  dt.sort_order, dt.created_at, dt.updated_at
`;

interface DocumentCategoryRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface DocumentTypeRow {
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
  allowed_mime_types?: string | null;
  max_file_size_mb: number;
  allow_multiple_files: number;
  requires_expiry_date: number;
  requires_issue_date: number;
  requires_document_number: number;
  retention_rule_json: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface EmployeeDocumentRow {
  id: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  employee_type?: string;
  employment_type?: string;
  document_type_id: string;
  document_type_name?: string;
  document_type_code?: string;
  category_id: string | null;
  category_name?: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: StoredStatus;
  current_version_id: string | null;
  is_sensitive: number;
  notes: string | null;
  created_by_user_id: string;
  updated_by_user_id: string | null;
  archived_at: string | null;
  archived_by_user_id: string | null;
  archive_reason: string | null;
  restored_at: string | null;
  restored_by_user_id: string | null;
  restore_reason: string | null;
  soft_deleted_at: string | null;
  soft_deleted_by_user_id: string | null;
  soft_delete_reason: string | null;
  created_at: string;
  updated_at: string;
  version_no?: number | null;
  original_filename?: string | null;
  file_mime_type?: string | null;
  file_size_bytes?: number | null;
  uploaded_by_name?: string | null;
  uploaded_at?: string | null;
  expiring_soon_days?: number;
}

interface VersionRow {
  id: string;
  employee_document_id: string;
  version_no: number;
  r2_key: string;
  original_filename: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_hash: string | null;
  uploaded_by_user_id: string;
  uploaded_by_name?: string | null;
  uploaded_at: string;
  reason_for_replacement: string | null;
  is_current: number;
  created_at: string;
}

export type EmployeeDocumentUploadParts = {
  employeeId: string;
  documentTypeId: string;
  file: File;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  replaceDocumentId?: string | null;
  reason_for_replacement?: string | null;
  defaultReplacementReason?: string | null;
  skipAccessCheck?: boolean;
};

export type PreparedEmployeeDocumentUpload = {
  employeeId: string;
  type: DocumentTypeRow;
  file: File;
  meta: {
    document_number: string | null;
    issue_date: string | null;
    expiry_date: string | null;
  };
  notes: string | null;
  replaceDocumentId?: string | null;
  documentId: string | null;
  oldDocument: EmployeeDocumentRow | null;
  versionNo: number;
  reason: string | null;
};

export type EmployeeDocumentUploadResult = {
  document: ReturnType<typeof maskDocument> | null;
  documentId: string;
  versionId: string;
  r2Key: string;
  createdNewDocument: boolean;
};

type PreparedDocumentUploadSessionRow = {
  id: string;
  batch_id: string | null;
  client_row_id: string | null;
  upload_mode: "worker_proxy" | "direct_r2";
  status: "PREPARED" | "UPLOADING" | "UPLOADED" | "COMPLETING" | "COMPLETED" | "FAILED" | "EXPIRED" | "CLEANED_UP";
  context_type: "employee_document" | "onboarding_document";
  onboarding_case_id: string | null;
  employee_id: string;
  document_type_id: string;
  document_id: string;
  version_no: number;
  r2_key: string;
  original_filename: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_hash: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  replace_document_id: string | null;
  reason_for_replacement: string | null;
  validation_snapshot_json: string | null;
  error_code: string | null;
  error_message: string | null;
  created_by_user_id: string | null;
  completed_document_id: string | null;
  completed_version_id: string | null;
  expires_at: string;
  uploaded_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  cleaned_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentUploadPrepareRow = {
  client_row_id?: string | null;
  document_type_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  document_number?: string | null;
  reference?: string | null;
  notes?: string | null;
  checksum?: string | null;
};

export type DocumentUploadPrepareContext = {
  employeeId: string;
  onboardingCaseId?: string | null;
  contextType?: "employee_document" | "onboarding_document";
  skipAccessCheck?: boolean;
};

type DocumentUploadCompleteResult = EmployeeDocumentUploadResult & {
  uploadId: string;
  clientRowId: string | null;
};

type DocumentUploadValidationIssue = {
  code: string;
  message: string;
};

const EMPLOYEE_TYPES = new Set(["LOCAL", "FOREIGN", "OTHER"]);
const EMPLOYMENT_TYPES = new Set(["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]);
const RETENTION_MODES = new Set(["FOREVER", "YEARS_AFTER_UPLOAD", "YEARS_AFTER_EXPIRY", "YEARS_AFTER_EXIT", "CUSTOM"]);

export const documentRoutes = new Hono<AppBindings>();
export const employeeDocumentRoutes = new Hono<AppBindings>();

documentRoutes.use("*", requireAuth);
employeeDocumentRoutes.use("*", requireAuth);
documentRoutes.use("*", requireOperationalModuleMiddleware("documents", "Documents"));
employeeDocumentRoutes.use("*", requireOperationalModuleMiddleware("documents", "Documents"));

function boolRow(value: number) {
  return value === 1;
}

function optionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function routeParam(c: Context<AppBindings>, name: string) {
  return c.req.param(name) ?? "";
}

function numeric(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasPermission(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function requireAnyPermission(c: Context<AppBindings>, permissions: string[]) {
  return permissions.some((permission) => hasPermission(c, permission));
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function uploadSessionExpiry(minutes = 20) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function isExpiredIso(value: string | null | undefined) {
  return Boolean(value && value < new Date().toISOString());
}

function uploadEndpoint(c: Context<AppBindings>, uploadId: string) {
  const url = new URL(c.req.url);
  return `${url.origin}/api/v1/documents/uploads/${uploadId}/file`;
}

function safeDocumentUploadLog(event: string, input: Record<string, unknown>) {
  console.warn(JSON.stringify({
    level: "warn",
    event,
    upload_id: input.upload_id ?? null,
    batch_id: input.batch_id ?? null,
    request_id: cSafeRequestId(input),
    message: input.message ?? null,
    timestamp: new Date().toISOString()
  }));
}

function cSafeRequestId(input: Record<string, unknown>) {
  const value = input.request_id;
  return typeof value === "string" ? value : null;
}

function requestIdFromContext(c: Context<AppBindings>) {
  return c.req.header("X-Request-ID") ?? c.req.header("x-request-id") ?? null;
}

function toCategory(row: DocumentCategoryRow) {
  return { ...row, is_active: boolRow(row.is_active) };
}

function toType(row: DocumentTypeRow) {
  return {
    ...row,
    is_sensitive: boolRow(row.is_sensitive),
    is_active: boolRow(row.is_active),
    allow_multiple_files: boolRow(row.allow_multiple_files),
    requires_expiry_date: boolRow(row.requires_expiry_date),
    requires_issue_date: boolRow(row.requires_issue_date),
    requires_document_number: boolRow(row.requires_document_number),
    allowed_file_types: safeJsonArray(row.allowed_file_types_json)
  };
}

function displayStatus(row: Pick<EmployeeDocumentRow, "status" | "expiry_date" | "expiring_soon_days">): DisplayStatus {
  if (row.status === "ARCHIVED") return "ARCHIVED";
  if (row.status === "SOFT_DELETED") return "SOFT_DELETED";
  if (!row.expiry_date) return "VALID";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${row.expiry_date}T00:00:00Z`);
  if (expiry.getTime() < today.getTime()) return "EXPIRED";
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + (row.expiring_soon_days ?? 0));
  return expiry.getTime() <= threshold.getTime() ? "EXPIRING_SOON" : "VALID";
}

function maskDocument(row: EmployeeDocumentRow, canSensitive: boolean) {
  const sensitive = boolRow(row.is_sensitive);
  return {
    ...row,
    is_sensitive: sensitive,
    document_number: sensitive && !canSensitive ? "Restricted" : row.document_number,
    notes: sensitive && !canSensitive ? null : row.notes,
    display_status: displayStatus(row)
  };
}

function sanitizeFileName(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
  return cleaned || "document";
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function auditDocument(c: Context<AppBindings>, input: { action: string; entityType: string; entityId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: input.action,
    module: "documents",
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishDocument(c: Context<AppBindings>, event: "documents.changed" | "document.uploaded" | "document.replaced" | "document.archived" | "document.restored" | "document.soft_deleted" | "document.permanently_deleted" | "employee.profile_photo_changed", entityId: string, action: string) {
  const actor = c.get("currentUser");
  await publishAccessEvent(c.env, event, { actor_user_id: actor.id, entity_type: "document", entity_id: entityId, action });
  if (event !== "documents.changed") {
    await publishAccessEvent(c.env, "documents.changed", { actor_user_id: actor.id, entity_type: "document", entity_id: entityId, action });
  }
}

async function refreshDocumentComplianceQuietly(c: Context<AppBindings>, employeeId: string, documentId?: string | null) {
  try {
    await refreshComplianceAfterDocumentChange(c.env.DB, employeeId, documentId ?? null);
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      message: error instanceof Error ? error.message : "Document compliance refresh failed",
      employee_id: employeeId,
      document_id: documentId ?? null
    }));
  }
}

async function auditEmployeeProfilePhoto(c: Context<AppBindings>, input: { employeeId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "employee.profile_photo_changed",
    module: "employees",
    entityType: "employee",
    entityId: input.employeeId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishEmployeeProfilePhoto(c: Context<AppBindings>, employeeId: string, documentId: string | null, action: string) {
  const actor = c.get("currentUser");
  await publishAccessEvent(c.env, "employee.profile_photo_changed", { actor_user_id: actor.id, entity_type: "employee", entity_id: employeeId, action });
  await publishAccessEvent(c.env, "employees.changed", { actor_user_id: actor.id, entity_type: "employee", entity_id: employeeId, action });
  await publishAccessEvent(c.env, "documents.changed", { actor_user_id: actor.id, entity_type: "document", entity_id: documentId ?? undefined, action });
}

async function getType(db: AppBindings["Bindings"]["DB"], id: string) {
  return db.prepare("SELECT dt.*, dc.name AS category_name FROM document_types dt LEFT JOIN document_categories dc ON dc.id = dt.category_id WHERE dt.id = ?").bind(id).first<DocumentTypeRow>();
}

async function getDocument(db: AppBindings["Bindings"]["DB"], id: string, employeeId?: string) {
  return db
    .prepare(
      `SELECT ed.*, e.employee_no, e.full_name AS employee_name, e.employee_type, e.employment_type,
        d.name AS department_name, p.title AS position_title, l.name AS location_name,
        dt.name AS document_type_name, dt.code AS document_type_code, dt.expiring_soon_days,
        dc.name AS category_name, v.version_no, v.original_filename, v.file_mime_type,
        v.file_size_bytes, u.name AS uploaded_by_name, v.uploaded_at
       FROM employee_documents ed
       INNER JOIN employees e ON e.id = ed.employee_id
       INNER JOIN document_types dt ON dt.id = ed.document_type_id
       LEFT JOIN document_categories dc ON dc.id = ed.category_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN employee_document_versions v ON v.id = ed.current_version_id
       LEFT JOIN users u ON u.id = v.uploaded_by_user_id
       WHERE ed.id = ? ${employeeId ? "AND ed.employee_id = ?" : ""}`
    )
    .bind(...(employeeId ? [id, employeeId] : [id]))
    .first<EmployeeDocumentRow>();
}

async function ensureEmployee(db: AppBindings["Bindings"]["DB"], employeeId: string) {
  return db.prepare("SELECT id, full_name, employee_no, employee_type, employment_type FROM employees WHERE id = ?").bind(employeeId).first<{ id: string; full_name: string; employee_no: string; employee_type?: string | null; employment_type?: string | null }>();
}

async function ensureReason(c: Context<AppBindings>, body: Record<string, unknown>) {
  const reason = optionalString(body.reason);
  if (!reason) {
    return { response: fail(c, 400, "REASON_REQUIRED", "Reason is required."), reason: null };
  }
  return { reason };
}

async function parseMultipart(c: Context<AppBindings>) {
  try {
    return await c.req.parseBody();
  } catch {
    return null;
  }
}

function fileFromBody(body: Record<string, unknown>) {
  const file = body.file;
  return file instanceof File ? file : null;
}

function validateMetadataIssue(type: DocumentTypeRow, input: { document_number?: string | null; issue_date?: string | null; expiry_date?: string | null }): DocumentUploadValidationIssue | null {
  if (type.requires_document_number === 1 && !input.document_number) return { code: "DOCUMENT_NUMBER_REQUIRED", message: "Document number is required for this document type." };
  if (type.requires_issue_date === 1 && !input.issue_date) return { code: "ISSUE_DATE_REQUIRED", message: "Issue date is required for this document type." };
  if (type.requires_expiry_date === 1 && !input.expiry_date) return { code: "EXPIRY_DATE_REQUIRED", message: "Expiry date is required for this document type." };
  if (input.issue_date && input.expiry_date && input.expiry_date < input.issue_date) return { code: "INVALID_DATES", message: "Expiry date cannot be before issue date." };
  return null;
}

function validateMetadata(c: Context<AppBindings>, type: DocumentTypeRow, input: { document_number?: string | null; issue_date?: string | null; expiry_date?: string | null }) {
  const issue = validateMetadataIssue(type, input);
  return issue ? fail(c, 400, issue.code, issue.message) : null;
}

function documentTypeUploadRules(type: DocumentTypeRow) {
  const legacy = safeJsonArray(type.allowed_file_types_json || "[]");
  const mime = type.allowed_mime_types ? safeJsonArray(type.allowed_mime_types) : [];
  return Array.from(new Set([...mime, ...legacy]));
}

function validateFileMetadataIssue(type: DocumentTypeRow, file: { name: string; type: string; size: number }): DocumentUploadValidationIssue | null {
  const allowed = documentTypeUploadRules(type);
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const mime = file.type || "application/octet-stream";
  const matchesMime = allowed.some((rule) => rule === mime || rule === "*/*" || (rule.endsWith("/*") && mime.startsWith(rule.slice(0, -1))));
  if (allowed.length && !matchesMime && !allowed.includes(extension)) {
    return { code: "INVALID_FILE_TYPE", message: "File type is not allowed for this document type." };
  }
  const maxBytes = type.max_file_size_mb * 1024 * 1024;
  if (file.size > maxBytes) {
    return { code: "FILE_TOO_LARGE", message: `File exceeds ${type.max_file_size_mb} MB.` };
  }
  return null;
}

function validateFileIssue(type: DocumentTypeRow, file: File): DocumentUploadValidationIssue | null {
  return validateFileMetadataIssue(type, { name: file.name, type: file.type, size: file.size });
}

function validateFile(c: Context<AppBindings>, type: DocumentTypeRow, file: File) {
  const issue = validateFileIssue(type, file);
  return issue ? fail(c, 400, issue.code, issue.message) : null;
}

function addDateRange(c: Context<AppBindings>, conditions: string[], params: BindValue[], queryPrefix: string, column: string) {
  const from = readString(c.req.query(`${queryPrefix}_from`));
  const to = readString(c.req.query(`${queryPrefix}_to`));
  if (from) {
    conditions.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(`${column} <= ?`);
    params.push(to);
  }
}

async function listRegistry(c: Context<AppBindings>) {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR ed.document_number LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const filterMap = [
    ["employee_id", "ed.employee_id"],
    ["department_id", "e.primary_department_id"],
    ["location_id", "e.primary_location_id"],
    ["position_id", "e.primary_position_id"],
    ["document_type_id", "ed.document_type_id"],
    ["category_id", "ed.category_id"],
    ["status", "ed.status"]
  ] as const;
  for (const [queryKey, column] of filterMap) {
    const value = readString(c.req.query(queryKey));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  const sensitive = readString(c.req.query("sensitive"));
  if (sensitive === "true" || sensitive === "false") {
    conditions.push("ed.is_sensitive = ?");
    params.push(sensitive === "true" ? 1 : 0);
  }
  addDateRange(c, conditions, params, "issue", "ed.issue_date");
  addDateRange(c, conditions, params, "expiry", "ed.expiry_date");
  addDateRange(c, conditions, params, "uploaded", "v.uploaded_at");
  const rows = await c.env.DB
    .prepare(
      `SELECT ed.*, e.employee_no, e.full_name AS employee_name, e.employee_type, e.employment_type,
        e.primary_department_id AS department_id, d.name AS department_name,
        e.primary_position_id AS position_id, p.title AS position_title,
        e.primary_location_id AS location_id, l.name AS location_name,
        dt.name AS document_type_name, dt.code AS document_type_code, dt.expiring_soon_days,
        dc.name AS category_name, v.version_no, v.original_filename, v.file_mime_type,
        v.file_size_bytes, u.name AS uploaded_by_name, v.uploaded_at
       FROM employee_documents ed
       INNER JOIN employees e ON e.id = ed.employee_id
       INNER JOIN document_types dt ON dt.id = ed.document_type_id
       LEFT JOIN document_categories dc ON dc.id = ed.category_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN employee_document_versions v ON v.id = ed.current_version_id
       LEFT JOIN users u ON u.id = v.uploaded_by_user_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ed.updated_at DESC`
    )
    .bind(...params)
    .all<EmployeeDocumentRow>();
  const canSensitive = hasPermission(c, "documents.sensitive.view");
  let registry = rows.results.map((row) => maskDocument(row, canSensitive));
  const display = readString(c.req.query("display_status"));
  if (display) registry = registry.filter((row) => row.display_status === display);
  return registry;
}

documentRoutes.get("/categories", requirePermission("documents.view"), async (c) => {
  const rows = await c.env.DB.prepare(`SELECT ${DOCUMENT_CATEGORY_COLUMNS} FROM document_categories ORDER BY is_active DESC, sort_order, name LIMIT 200`).all<DocumentCategoryRow>();
  return ok(c, { categories: rows.results.map(toCategory), limit: 200 });
});

documentRoutes.post("/categories", requirePermission("documents.settings.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  if (!name) return fail(c, 400, "VALIDATION_ERROR", "Category name is required.");
  const duplicate = await c.env.DB.prepare("SELECT id FROM document_categories WHERE name = ? COLLATE NOCASE AND is_active = 1").bind(name).first<{ id: string }>();
  if (duplicate) return fail(c, 409, "CATEGORY_EXISTS", "An active category with this name already exists.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO document_categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)").bind(id, name, optionalString(body.description), numeric(body.sort_order, 100)).run();
  const category = await c.env.DB.prepare("SELECT * FROM document_categories WHERE id = ?").bind(id).first<DocumentCategoryRow>();
  await auditDocument(c, { action: "document.category.created", entityType: "document_category", entityId: id, newValue: category });
  return ok(c, { category: category ? toCategory(category) : null }, 201);
});

documentRoutes.patch("/categories/:id", requirePermission("documents.settings.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM document_categories WHERE id = ?").bind(id).first<DocumentCategoryRow>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Category was not found.");
  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  if (!name) return fail(c, 400, "VALIDATION_ERROR", "Category name is required.");
  await c.env.DB.prepare("UPDATE document_categories SET name = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(name, optionalString(body.description), numeric(body.sort_order, old.sort_order), new Date().toISOString(), old.id).run();
  const category = await c.env.DB.prepare("SELECT * FROM document_categories WHERE id = ?").bind(old.id).first<DocumentCategoryRow>();
  await auditDocument(c, { action: "document.category.updated", entityType: "document_category", entityId: old.id, oldValue: old, newValue: category });
  return ok(c, { category: category ? toCategory(category) : null });
});

async function categoryActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM document_categories WHERE id = ?").bind(id).first<DocumentCategoryRow>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Category was not found.");
  await c.env.DB.prepare("UPDATE document_categories SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, new Date().toISOString(), old.id).run();
  const category = await c.env.DB.prepare("SELECT * FROM document_categories WHERE id = ?").bind(old.id).first<DocumentCategoryRow>();
  await auditDocument(c, { action: active ? "document.category.enabled" : "document.category.disabled", entityType: "document_category", entityId: old.id, oldValue: old, newValue: category });
  return ok(c, { category: category ? toCategory(category) : null });
}

documentRoutes.post("/categories/:id/enable", requirePermission("documents.settings.manage"), (c) => categoryActive(c, 1));
documentRoutes.post("/categories/:id/disable", requirePermission("documents.settings.manage"), (c) => categoryActive(c, 0));

documentRoutes.get("/types", requirePermission("documents.view"), async (c) => {
  const rows = await c.env.DB.prepare(`SELECT ${DOCUMENT_TYPE_LIST_COLUMNS} FROM document_types dt LEFT JOIN document_categories dc ON dc.id = dt.category_id ORDER BY dt.is_active DESC, dt.sort_order, dt.name LIMIT 500`).all<DocumentTypeRow>();
  return ok(c, { document_types: rows.results.map(toType), limit: 500 });
});

documentRoutes.get("/types/:id", requirePermission("documents.view"), async (c) => {
  const type = await getType(c.env.DB, routeParam(c, "id"));
  if (!type) return fail(c, 404, "NOT_FOUND", "Document type was not found.");
  return ok(c, { document_type: toType(type) });
});

function readTypeBody(body: Record<string, unknown>, old?: DocumentTypeRow) {
  const allowed = Array.isArray(body.allowed_file_types) ? body.allowed_file_types.filter((item): item is string => typeof item === "string") : safeJsonArray(old?.allowed_file_types_json ?? "[]");
  return {
    category_id: optionalString(body.category_id),
    code: readString(body.code).toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    name: readString(body.name),
    description: optionalString(body.description),
    is_sensitive: typeof body.is_sensitive === "boolean" ? body.is_sensitive : old?.is_sensitive === 1,
    expiring_soon_days: Math.max(0, numeric(body.expiring_soon_days, old?.expiring_soon_days ?? 30)),
    allowed_file_types_json: JSON.stringify(allowed.length ? allowed : ["application/pdf", "image/jpeg", "image/png"]),
    max_file_size_mb: Math.max(0.1, numeric(body.max_file_size_mb, old?.max_file_size_mb ?? 10)),
    allow_multiple_files: typeof body.allow_multiple_files === "boolean" ? body.allow_multiple_files : old?.allow_multiple_files === 1,
    requires_expiry_date: typeof body.requires_expiry_date === "boolean" ? body.requires_expiry_date : old?.requires_expiry_date === 1,
    requires_issue_date: typeof body.requires_issue_date === "boolean" ? body.requires_issue_date : old?.requires_issue_date === 1,
    requires_document_number: typeof body.requires_document_number === "boolean" ? body.requires_document_number : old?.requires_document_number === 1,
    retention_rule_json: optionalString(body.retention_rule_json),
    sort_order: numeric(body.sort_order, old?.sort_order ?? 100)
  };
}

documentRoutes.post("/types", requirePermission("documents.settings.manage"), async (c) => {
  const input = readTypeBody(await readJsonBody(c.req.raw));
  if (!input.code || !input.name) return fail(c, 400, "VALIDATION_ERROR", "Document type code and name are required.");
  if (input.category_id) {
    const category = await c.env.DB.prepare("SELECT id FROM document_categories WHERE id = ?").bind(input.category_id).first();
    if (!category) return fail(c, 400, "INVALID_CATEGORY", "Selected category was not found.");
  }
  const duplicate = await c.env.DB.prepare("SELECT id FROM document_types WHERE code = ?").bind(input.code).first();
  if (duplicate) return fail(c, 409, "TYPE_CODE_EXISTS", "A document type with this code already exists.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO document_types
     (id, category_id, code, name, description, is_sensitive, expiring_soon_days, allowed_file_types_json, max_file_size_mb,
      allow_multiple_files, requires_expiry_date, requires_issue_date, requires_document_number, retention_rule_json, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.category_id, input.code, input.name, input.description, input.is_sensitive ? 1 : 0, input.expiring_soon_days, input.allowed_file_types_json, input.max_file_size_mb, input.allow_multiple_files ? 1 : 0, input.requires_expiry_date ? 1 : 0, input.requires_issue_date ? 1 : 0, input.requires_document_number ? 1 : 0, input.retention_rule_json, input.sort_order).run();
  const type = await getType(c.env.DB, id);
  await auditDocument(c, { action: "document.type.created", entityType: "document_type", entityId: id, newValue: type });
  return ok(c, { document_type: type ? toType(type) : null }, 201);
});

documentRoutes.patch("/types/:id", requirePermission("documents.settings.manage"), async (c) => {
  const old = await getType(c.env.DB, routeParam(c, "id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Document type was not found.");
  const input = readTypeBody(await readJsonBody(c.req.raw), old);
  if (!input.code || !input.name) return fail(c, 400, "VALIDATION_ERROR", "Document type code and name are required.");
  await c.env.DB.prepare(
    `UPDATE document_types SET category_id = ?, code = ?, name = ?, description = ?, is_sensitive = ?, expiring_soon_days = ?,
      allowed_file_types_json = ?, max_file_size_mb = ?, allow_multiple_files = ?, requires_expiry_date = ?, requires_issue_date = ?,
      requires_document_number = ?, retention_rule_json = ?, sort_order = ?, updated_at = ? WHERE id = ?`
  ).bind(input.category_id, input.code, input.name, input.description, input.is_sensitive ? 1 : 0, input.expiring_soon_days, input.allowed_file_types_json, input.max_file_size_mb, input.allow_multiple_files ? 1 : 0, input.requires_expiry_date ? 1 : 0, input.requires_issue_date ? 1 : 0, input.requires_document_number ? 1 : 0, input.retention_rule_json, input.sort_order, new Date().toISOString(), old.id).run();
  const type = await getType(c.env.DB, old.id);
  await auditDocument(c, { action: "document.type.updated", entityType: "document_type", entityId: old.id, oldValue: old, newValue: type });
  return ok(c, { document_type: type ? toType(type) : null });
});

async function typeActive(c: Context<AppBindings>, active: 0 | 1) {
  const old = await getType(c.env.DB, routeParam(c, "id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Document type was not found.");
  await c.env.DB.prepare("UPDATE document_types SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, new Date().toISOString(), old.id).run();
  const type = await getType(c.env.DB, old.id);
  await auditDocument(c, { action: active ? "document.type.enabled" : "document.type.disabled", entityType: "document_type", entityId: old.id, oldValue: old, newValue: type });
  return ok(c, { document_type: type ? toType(type) : null });
}

documentRoutes.post("/types/:id/enable", requirePermission("documents.settings.manage"), (c) => typeActive(c, 1));
documentRoutes.post("/types/:id/disable", requirePermission("documents.settings.manage"), (c) => typeActive(c, 0));

documentRoutes.get("/required-rules", requirePermission("documents.view"), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT rr.*, dt.name AS document_type_name, dc.name AS category_name,
      d.name AS department_name, p.title AS position_title, l.name AS location_name
     FROM document_required_rules rr
     INNER JOIN document_types dt ON dt.id = rr.document_type_id
     LEFT JOIN document_categories dc ON dc.id = dt.category_id
     LEFT JOIN departments d ON d.id = rr.department_id
     LEFT JOIN positions p ON p.id = rr.position_id
     LEFT JOIN locations l ON l.id = rr.location_id
     ORDER BY rr.is_active DESC, rr.rule_priority, dt.name`
  ).all();
  return ok(c, { rules: rows.results, required_rules: rows.results });
});

function readRuleBody(body: Record<string, unknown>) {
  const employeeType = optionalString(body.employee_type);
  const employmentType = optionalString(body.employment_type);
  return {
    document_type_id: readString(body.document_type_id),
    employee_type: employeeType && EMPLOYEE_TYPES.has(employeeType) ? employeeType : null,
    employment_type: employmentType && EMPLOYMENT_TYPES.has(employmentType) ? employmentType : null,
    department_id: optionalString(body.department_id),
    position_id: optionalString(body.position_id),
    location_id: optionalString(body.location_id),
    custom_condition_json: optionalString(body.custom_condition_json),
    is_required: typeof body.is_required === "boolean" ? body.is_required : true,
    rule_priority: numeric(body.rule_priority, 100)
  };
}

async function validateRuleRefs(c: Context<AppBindings>, rule: ReturnType<typeof readRuleBody>) {
  const type = await getType(c.env.DB, rule.document_type_id);
  if (!type) return fail(c, 400, "INVALID_DOCUMENT_TYPE", "Document type was not found.");
  const refs = [
    ["departments", rule.department_id, "Department was not found."],
    ["positions", rule.position_id, "Position was not found."],
    ["locations", rule.location_id, "Location was not found."]
  ] as const;
  for (const [table, id, message] of refs) {
    if (id) {
      const exists = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first();
      if (!exists) return fail(c, 400, "INVALID_REFERENCE", message);
    }
  }
  const issues = [
    ...validateDocumentRules({ documentTypeId: rule.document_type_id }),
    ...(await validateOrganizationCascade(c.env.DB, rule))
  ];
  if (hasValidationErrors(issues)) return validationResponse(c, issues);
  return null;
}

documentRoutes.post("/required-rules", requirePermission("documents.required_rules.manage"), async (c) => {
  const rule = readRuleBody(await readJsonBody(c.req.raw));
  const invalid = await validateRuleRefs(c, rule);
  if (invalid) return invalid;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO document_required_rules
     (id, document_type_id, employee_type, employment_type, department_id, position_id, location_id, custom_condition_json, is_required, rule_priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, rule.document_type_id, rule.employee_type, rule.employment_type, rule.department_id, rule.position_id, rule.location_id, rule.custom_condition_json, rule.is_required ? 1 : 0, rule.rule_priority).run();
  await auditDocument(c, { action: "document.required_rule.created", entityType: "document_required_rule", entityId: id, newValue: rule });
  await publishAccessEvent(c.env, "document.required_missing_changed", { actor_user_id: c.get("currentUser").id, entity_type: "document_required_rule", entity_id: id, action: "created" });
  const created = { id, ...rule, is_active: true };
  return ok(c, { rule: created, required_rule: created }, 201);
});

documentRoutes.patch("/required-rules/:id", requirePermission("documents.required_rules.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM document_required_rules WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Required rule was not found.");
  const rule = readRuleBody(await readJsonBody(c.req.raw));
  const invalid = await validateRuleRefs(c, rule);
  if (invalid) return invalid;
  await c.env.DB.prepare(
    `UPDATE document_required_rules SET document_type_id = ?, employee_type = ?, employment_type = ?, department_id = ?,
      position_id = ?, location_id = ?, custom_condition_json = ?, is_required = ?, rule_priority = ?, updated_at = ? WHERE id = ?`
  ).bind(rule.document_type_id, rule.employee_type, rule.employment_type, rule.department_id, rule.position_id, rule.location_id, rule.custom_condition_json, rule.is_required ? 1 : 0, rule.rule_priority, new Date().toISOString(), id).run();
  await auditDocument(c, { action: "document.required_rule.updated", entityType: "document_required_rule", entityId: id, oldValue: old, newValue: rule });
  const updated = { id, ...rule };
  return ok(c, { rule: updated, required_rule: updated });
});

async function ruleActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM document_required_rules WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Required rule was not found.");
  await c.env.DB.prepare("UPDATE document_required_rules SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, new Date().toISOString(), id).run();
  await auditDocument(c, { action: active ? "document.required_rule.enabled" : "document.required_rule.disabled", entityType: "document_required_rule", entityId: id, oldValue: old, newValue: { is_active: active === 1 } });
  return ok(c, { enabled: active === 1, rule: { id, is_active: active === 1 } });
}

documentRoutes.post("/required-rules/:id/enable", requirePermission("documents.required_rules.manage"), (c) => ruleActive(c, 1));
documentRoutes.post("/required-rules/:id/disable", requirePermission("documents.required_rules.manage"), (c) => ruleActive(c, 0));

documentRoutes.get("/registry", async (c) => {
  if (!requireAnyPermission(c, ["documents.registry.view", "documents.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view document registry.");
  return ok(c, { documents: await listRegistry(c) });
});

async function missingRows(c: Context<AppBindings>, pagination?: ReturnType<typeof parsePaginationParams>) {
  const conditions: string[] = ["rr.is_active = 1", "rr.is_required = 1"];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "documents", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR dt.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const filterMap = [
    ["department_id", "e.primary_department_id"],
    ["location_id", "e.primary_location_id"],
    ["position_id", "e.primary_position_id"],
    ["document_type_id", "dt.id"],
    ["employee_type", "e.employee_type"],
    ["employment_type", "e.employment_type"]
  ] as const;
  for (const [queryKey, column] of filterMap) {
    const value = readString(c.req.query(queryKey));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  const pagedParams = pagination ? [...params, pagination.limit, pagination.offset] : params;
  const rows = await c.env.DB.prepare(
    `SELECT e.id AS employee_id, e.employee_no, e.full_name AS employee_name,
      e.primary_department_id AS department_id, d.name AS department_name,
      e.primary_position_id AS position_id, p.title AS position_title,
      e.primary_location_id AS location_id, l.name AS location_name,
      e.employee_type, e.employment_type, dt.name AS document_type_name,
      dt.id AS document_type_id, dc.name AS category_name, rr.id AS matched_rule_id,
      'Required by document rule' AS reason
     FROM document_required_rules rr
     INNER JOIN document_types dt ON dt.id = rr.document_type_id AND dt.is_active = 1
     LEFT JOIN document_categories dc ON dc.id = dt.category_id
     INNER JOIN employees e ON e.archived_at IS NULL
      AND (rr.employee_type IS NULL OR rr.employee_type = e.employee_type)
      AND (rr.employment_type IS NULL OR rr.employment_type = e.employment_type)
      AND (rr.department_id IS NULL OR rr.department_id = e.primary_department_id)
      AND (rr.position_id IS NULL OR rr.position_id = e.primary_position_id)
      AND (rr.location_id IS NULL OR rr.location_id = e.primary_location_id)
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     WHERE ${conditions.join(" AND ")}
       AND NOT EXISTS (
         SELECT 1 FROM employee_documents ed
         WHERE ed.employee_id = e.id AND ed.document_type_id = rr.document_type_id AND ed.status = 'ACTIVE'
       )
     ORDER BY e.employee_no, dt.name${pagination ? " LIMIT ? OFFSET ?" : ""}`
  ).bind(...pagedParams).all();
  return rows.results;
}

documentRoutes.get("/missing", requirePermission("documents.view"), async (c) => {
  const pagination = parsePaginationParams(c, { defaultLimit: 25, maxLimit: 100 });
  const rows = await missingRows(c, pagination);
  return ok(c, { missing: rows, pagination: paginationMeta(pagination, rows.length) });
});

documentRoutes.get("/expiring", requirePermission("documents.view"), async (c) => {
  const docs = (await listRegistry(c)).filter((doc) => doc.display_status === "EXPIRING_SOON" || doc.display_status === "EXPIRED");
  return ok(c, { documents: docs });
});

documentRoutes.get("/reports", requirePermission("documents.reports.view"), async (c) => {
  const registry = await listRegistry(c);
  const missing = await missingRows(c);
  return ok(c, {
    reports: {
      total_documents: registry.length,
      missing_documents: missing.length,
      expiring_soon: registry.filter((doc) => doc.display_status === "EXPIRING_SOON").length,
      expired: registry.filter((doc) => doc.display_status === "EXPIRED").length
    }
  });
});

documentRoutes.get("/reports/export.csv", requirePermission("documents.reports.export"), async (c) => {
  const registry = await listRegistry(c);
  const csv = [
    ["Employee No", "Employee Name", "Department", "Position", "Location", "Category", "Document Type", "Document Number", "Issue Date", "Expiry Date", "Display Status", "Stored Status", "Sensitive", "Current Version", "Uploaded By", "Uploaded Date"].join(","),
    ...registry.map((row) =>
      [row.employee_no, row.employee_name, row.department_name, row.position_title, row.location_name, row.category_name, row.document_type_name, row.document_number, row.issue_date, row.expiry_date, row.display_status, row.status, row.is_sensitive ? "Yes" : "No", row.version_no, row.uploaded_by_name, row.uploaded_at]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
  ].join("\n");
  const filters: Record<string, string> = {};
  new URL(c.req.url).searchParams.forEach((value, key) => {
    filters[key] = value;
  });
  await c.env.DB.prepare("INSERT INTO document_report_exports (id, actor_user_id, report_key, filters_json) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), c.get("currentUser").id, "registry", JSON.stringify(filters)).run();
  await auditDocument(c, { action: "document.report_exported", entityType: "document_report", entityId: "registry", newValue: { rows: registry.length } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="document-registry.csv"' } });
});

documentRoutes.get("/dashboard", requirePermission("documents.view"), async (c) => {
  const registry = await listRegistry(c);
  const missing = await missingRows(c);
  return ok(c, {
    total_documents: registry.length,
    missing_required_documents: missing.length,
    expiring_soon: registry.filter((doc) => doc.display_status === "EXPIRING_SOON").length,
    expired: registry.filter((doc) => doc.display_status === "EXPIRED").length,
    top_urgent_renewals: registry.filter((doc) => doc.display_status === "EXPIRING_SOON" || doc.display_status === "EXPIRED").slice(0, 5),
    recently_uploaded: registry.slice(0, 5),
    sensitive_access_alerts_count: 0
  });
});

documentRoutes.post("/uploads/prepare", requirePermission("documents.upload"), async (c) => {
  const startedAt = Date.now();
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  if (!employeeId) return fail(c, 400, "EMPLOYEE_REQUIRED", "Employee is required before preparing document uploads.");
  const rows = Array.isArray(body.rows) ? (body.rows as DocumentUploadPrepareRow[]) : [];
  const response = await prepareDocumentUploadSessions(c, { employeeId, contextType: "employee_document" }, rows);
  safeDocumentUploadLog("document.upload.prepare_timing", {
    request_id: requestIdFromContext(c),
    employee_id: employeeId,
    row_count: rows.length,
    duration_ms: Date.now() - startedAt
  });
  return response;
});

documentRoutes.post("/uploads/complete", requirePermission("documents.upload"), async (c) => {
  const startedAt = Date.now();
  const body = await readJsonBody(c.req.raw);
  const uploadIds = Array.isArray(body.upload_ids) ? body.upload_ids.map((value) => optionalString(value)).filter(Boolean) as string[] : [];
  const result = await completeDocumentUploadSessions(c, uploadIds);
  safeDocumentUploadLog("document.upload.complete_timing", {
    request_id: requestIdFromContext(c),
    upload_count: uploadIds.length,
    completed_count: result.completed_count,
    failed_count: result.failed_count,
    duration_ms: Date.now() - startedAt
  });
  return ok(c, result, result.completed_count > 0 ? 200 : 400);
});

documentRoutes.post("/uploads/:uploadId/file", requirePermission("documents.upload"), async (c) => {
  const startedAt = Date.now();
  const uploadId = c.req.param("uploadId");
  const session = await getUploadSessionForActor(c, uploadId);
  if (!session) return fail(c, 404, "DOCUMENT_UPLOAD_NOT_FOUND", "Prepared upload was not found.");
  if (isExpiredIso(session.expires_at)) {
    await markUploadSessionFailed(c, session, "DOCUMENT_UPLOAD_EXPIRED", "Prepared upload expired.", false);
    return fail(c, 410, "DOCUMENT_UPLOAD_EXPIRED", "Prepared upload expired. Prepare the upload again.");
  }
  if (!["PREPARED", "UPLOADING"].includes(session.status)) {
    return fail(c, 409, "DOCUMENT_UPLOAD_INVALID_STATUS", "This upload cannot receive a file in its current status.");
  }
  const body = await parseMultipart(c);
  if (!body) return fail(c, 400, "INVALID_FORM", "Multipart form data is required.");
  const file = fileFromBody(body);
  if (!file) return fail(c, 400, "FILE_REQUIRED", "File is required.");
  const type = await getType(c.env.DB, session.document_type_id);
  if (!type || type.is_active !== 1) {
    await markUploadSessionFailed(c, session, "INVALID_DOCUMENT_TYPE", "Document type was not found or is inactive.");
    return fail(c, 400, "INVALID_DOCUMENT_TYPE", "Document type was not found or is inactive.");
  }
  const fileIssue = validateFileIssue(type, file);
  if (fileIssue) return documentUploadIssueResponse(c, fileIssue);
  if (file.name !== session.original_filename || file.size !== session.file_size_bytes) {
    return fail(c, 400, "DOCUMENT_UPLOAD_FILE_MISMATCH", "Uploaded file does not match the prepared upload metadata.");
  }
  await c.env.DB.prepare("UPDATE document_upload_sessions SET status = 'UPLOADING', updated_at = ? WHERE id = ?").bind(nowIso(), session.id).run();
  try {
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);
    await c.env.DOCUMENTS_BUCKET.put(session.r2_key, buffer, { httpMetadata: { contentType: file.type || session.file_mime_type || "application/octet-stream" } });
    const uploadedAt = nowIso();
    await c.env.DB.prepare(
      "UPDATE document_upload_sessions SET status = 'UPLOADED', file_hash = ?, uploaded_at = ?, updated_at = ? WHERE id = ?"
    ).bind(hash, uploadedAt, uploadedAt, session.id).run();
    safeDocumentUploadLog("document.upload.file_timing", {
      request_id: requestIdFromContext(c),
      upload_id: session.id,
      batch_id: session.batch_id,
      duration_ms: Date.now() - startedAt
    });
    return ok(c, { upload_id: session.id, status: "UPLOADED", uploaded_at: uploadedAt });
  } catch (error) {
    await markUploadSessionFailed(c, session, "DOCUMENT_UPLOAD_FILE_FAILED", "File upload failed before it could be committed.", true);
    safeDocumentUploadLog("document.upload.file_failed", {
      request_id: requestIdFromContext(c),
      upload_id: session.id,
      batch_id: session.batch_id,
      message: error instanceof Error ? error.message : String(error)
    });
    return fail(c, 500, "DOCUMENT_UPLOAD_FILE_FAILED", "File upload failed. Please retry this row.");
  }
});

employeeDocumentRoutes.get("/:employeeId/documents", requirePermission("documents.view"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  if (!(await ensureEmployee(c.env.DB, employeeId))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const docs = (await listRegistry(c)).filter((doc) => doc.employee_id === employeeId);
  const missing = (await missingRows(c)).filter((row) => (row as { employee_id?: string }).employee_id === employeeId);
  return ok(c, { documents: docs, missing });
});

async function createDocumentVersion(c: Context<AppBindings>, input: { employeeId: string; documentId: string; file: File; versionNo: number; reason?: string | null }) {
  const safeName = sanitizeFileName(input.file.name);
  const key = `employees/${input.employeeId}/documents/${input.documentId}/v${input.versionNo}-${safeName}`;
  const buffer = await input.file.arrayBuffer();
  const hash = await sha256Hex(buffer);
  await c.env.DOCUMENTS_BUCKET.put(key, buffer, { httpMetadata: { contentType: input.file.type || "application/octet-stream" } });
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      `INSERT INTO employee_document_versions
       (id, employee_document_id, version_no, r2_key, original_filename, file_mime_type, file_size_bytes, file_hash, uploaded_by_user_id, reason_for_replacement, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, input.documentId, input.versionNo, key, input.file.name, input.file.type || "application/octet-stream", input.file.size, hash, c.get("currentUser").id, input.reason ?? null).run();
    await c.env.DB.prepare("UPDATE employee_document_versions SET is_current = 0 WHERE employee_document_id = ? AND id != ?").bind(input.documentId, id).run();
    await c.env.DB.prepare("UPDATE employee_documents SET current_version_id = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?").bind(id, new Date().toISOString(), c.get("currentUser").id, input.documentId).run();
    return { id, key };
  } catch (error) {
    await c.env.DOCUMENTS_BUCKET.delete(key).catch(() => undefined);
    throw error;
  }
}

function documentUploadIssueResponse(c: Context<AppBindings>, issue: DocumentUploadValidationIssue, status: 400 | 404 | 409 = 400) {
  return fail(c, status, issue.code, issue.message);
}

function safeUploadRowError(rowIndex: number, field: string, issue: DocumentUploadValidationIssue) {
  return { row_index: rowIndex, field, code: issue.code, message: issue.message };
}

async function validateDocumentEmployeeCompatibility(db: D1Database, employee: Awaited<ReturnType<typeof ensureEmployee>>, type: DocumentTypeRow): Promise<DocumentUploadValidationIssue | null> {
  if (!employee) return { code: "EMPLOYEE_NOT_FOUND", message: "Employee was not found." };
  const specificRules = await db
    .prepare("SELECT employee_type FROM document_required_rules WHERE document_type_id = ? AND is_active = 1 AND employee_type IS NOT NULL")
    .bind(type.id)
    .all<{ employee_type: string }>();
  if (!specificRules.results.length) return null;
  if (specificRules.results.some((rule) => rule.employee_type === employee.employee_type)) return null;
  return {
    code: "DOCUMENT_EMPLOYEE_TYPE_INCOMPATIBLE",
    message: "This document type is not configured for the employee type. Review Document Required Rules or select a matching document type."
  };
}

async function validatePreparedUploadRow(c: Context<AppBindings>, employee: Awaited<ReturnType<typeof ensureEmployee>>, row: DocumentUploadPrepareRow, rowIndex: number) {
  const documentTypeId = optionalString(row.document_type_id);
  const fileName = optionalString(row.file_name);
  const mimeType = optionalString(row.mime_type) ?? "application/octet-stream";
  const fileSize = Number(row.file_size ?? 0);
  if (!documentTypeId) return { error: safeUploadRowError(rowIndex, "document_type_id", { code: "DOCUMENT_TYPE_REQUIRED", message: "Document type is required." }) };
  if (!fileName) return { error: safeUploadRowError(rowIndex, "file", { code: "FILE_REQUIRED", message: "File is required." }) };
  if (!Number.isFinite(fileSize) || fileSize <= 0) return { error: safeUploadRowError(rowIndex, "file", { code: "FILE_SIZE_REQUIRED", message: "File size is required." }) };
  const type = await getType(c.env.DB, documentTypeId);
  if (!type || type.is_active !== 1) return { error: safeUploadRowError(rowIndex, "document_type_id", { code: "INVALID_DOCUMENT_TYPE", message: "Document type was not found or is inactive." }) };
  const meta = {
    document_number: optionalString(row.document_number ?? row.reference),
    issue_date: optionalString(row.issue_date),
    expiry_date: optionalString(row.expiry_date)
  };
  const metaIssue = validateMetadataIssue(type, meta);
  if (metaIssue) return { error: safeUploadRowError(rowIndex, metaIssue.code === "DOCUMENT_NUMBER_REQUIRED" ? "document_number" : metaIssue.code === "ISSUE_DATE_REQUIRED" ? "issue_date" : "expiry_date", metaIssue) };
  const fileIssue = validateFileMetadataIssue(type, { name: fileName, type: mimeType, size: fileSize });
  if (fileIssue) return { error: safeUploadRowError(rowIndex, "file", fileIssue) };
  const compatibilityIssue = await validateDocumentEmployeeCompatibility(c.env.DB, employee, type);
  if (compatibilityIssue) return { error: safeUploadRowError(rowIndex, "document_type_id", compatibilityIssue) };
  return { type, meta, fileName, mimeType, fileSize };
}

export async function prepareDocumentUploadSessions(c: Context<AppBindings>, context: DocumentUploadPrepareContext, rows: DocumentUploadPrepareRow[]) {
  if (!rows.length) {
    return c.json({ ok: false, error: { code: "DOCUMENT_UPLOAD_PREPARE_EMPTY", message: "Add at least one document row.", validation_errors: [safeUploadRowError(0, "row", { code: "DOCUMENT_UPLOAD_PREPARE_EMPTY", message: "Add at least one document row." })] } }, 400);
  }
  if (!context.skipAccessCheck && !(await canAccessEmployee(c.env.DB, c.get("currentUser"), context.employeeId, "documents", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await ensureEmployee(c.env.DB, context.employeeId);
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");

  const errors: Array<{ row_index: number; field: string; code: string; message: string }> = [];
  const preparedRows: Array<{
    rowIndex: number;
    row: DocumentUploadPrepareRow;
    type: DocumentTypeRow;
    meta: { document_number: string | null; issue_date: string | null; expiry_date: string | null };
    fileName: string;
    mimeType: string;
    fileSize: number;
  }> = [];

  for (const [rowIndex, row] of rows.entries()) {
    const validated = await validatePreparedUploadRow(c, employee, row, rowIndex);
    if ("error" in validated) {
      if (validated.error) errors.push(validated.error);
      continue;
    }
    preparedRows.push({ rowIndex, row, type: validated.type, meta: validated.meta, fileName: validated.fileName, mimeType: validated.mimeType, fileSize: validated.fileSize });
  }

  const singleActiveTypes = new Map<string, number[]>();
  for (const item of preparedRows) {
    if (item.type.allow_multiple_files === 1) continue;
    const existing = await c.env.DB.prepare("SELECT id FROM employee_documents WHERE employee_id = ? AND document_type_id = ? AND status = 'ACTIVE'").bind(context.employeeId, item.type.id).first<{ id: string }>();
    if (existing) {
      errors.push(safeUploadRowError(item.rowIndex, "document_type_id", { code: "DUPLICATE_DOCUMENT", message: "This document type does not allow multiple active files for the same employee." }));
    }
    singleActiveTypes.set(item.type.id, [...(singleActiveTypes.get(item.type.id) ?? []), item.rowIndex]);
  }
  for (const rowIndexes of singleActiveTypes.values()) {
    if (rowIndexes.length <= 1) continue;
    for (const rowIndex of rowIndexes) {
      errors.push(safeUploadRowError(rowIndex, "document_type_id", { code: "DUPLICATE_DOCUMENT_TYPE_IN_BATCH", message: "This document type allows only one active file. Remove duplicate rows or select a document type that allows multiple files." }));
    }
  }

  if (errors.length) {
    return c.json({
      ok: false,
      error: {
        code: "DOCUMENT_UPLOAD_PREPARE_VALIDATION_FAILED",
        message: "Review the highlighted document rows before uploading.",
        validation_errors: errors,
        field_errors: Object.fromEntries(errors.map((error) => [`rows.${error.row_index}.${error.field}`, [error.message]]))
      }
    }, 400);
  }

  const batchId = `document_upload_batch_${crypto.randomUUID()}`;
  const expiresAt = uploadSessionExpiry();
  const uploads = [];
  for (const item of preparedRows) {
    const uploadId = `document_upload_${crypto.randomUUID()}`;
    const documentId = crypto.randomUUID();
    const key = `employees/${context.employeeId}/documents/${documentId}/v1-${sanitizeFileName(item.fileName)}`;
    const snapshot = {
      document_type_id: item.type.id,
      document_type_code: item.type.code,
      allowed_mime_types: documentTypeUploadRules(item.type),
      max_file_size_mb: item.type.max_file_size_mb,
      allow_multiple_files: item.type.allow_multiple_files === 1
    };
    await c.env.DB.prepare(
      `INSERT INTO document_upload_sessions
       (id, batch_id, client_row_id, upload_mode, status, context_type, onboarding_case_id,
        employee_id, document_type_id, document_id, version_no, r2_key, original_filename,
        file_mime_type, file_size_bytes, file_hash, document_number, issue_date, expiry_date,
        notes, reason_for_replacement, validation_snapshot_json, created_by_user_id, expires_at)
       VALUES (?, ?, ?, 'worker_proxy', 'PREPARED', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      uploadId,
      batchId,
      optionalString(item.row.client_row_id) ?? `row_${item.rowIndex}`,
      context.contextType ?? "employee_document",
      context.onboardingCaseId ?? null,
      context.employeeId,
      item.type.id,
      documentId,
      key,
      item.fileName,
      item.mimeType,
      item.fileSize,
      optionalString(item.row.checksum),
      item.meta.document_number,
      item.meta.issue_date,
      item.meta.expiry_date,
      optionalString(item.row.notes),
      "Uploaded from accelerated document upload flow",
      JSON.stringify(snapshot),
      c.get("currentUser").id,
      expiresAt
    ).run();
    uploads.push({
      client_row_id: optionalString(item.row.client_row_id) ?? `row_${item.rowIndex}`,
      upload_id: uploadId,
      upload_mode: "worker_proxy",
      upload_url: uploadEndpoint(c, uploadId),
      required_headers: { Authorization: "Bearer token", "X-Request-ID": "generated by client" },
      object_key: key,
      pending_object_reference: key,
      expires_at: expiresAt,
      max_file_size: item.type.max_file_size_mb * 1024 * 1024,
      allowed_mime_types: documentTypeUploadRules(item.type)
    });
  }

  runDocumentBackgroundTask(c, cleanupStalePendingDocumentUploads(c), "document.upload.cleanup_stale", { batch_id: batchId });
  return ok(c, { batch_id: batchId, mode: "worker_proxy", direct_r2_available: false, uploads });
}

async function getUploadSessionForActor(c: Context<AppBindings>, uploadId: string) {
  const session = await c.env.DB.prepare("SELECT * FROM document_upload_sessions WHERE id = ?").bind(uploadId).first<PreparedDocumentUploadSessionRow>();
  if (!session) return null;
  const actor = c.get("currentUser");
  if (!actor.is_owner && session.created_by_user_id && session.created_by_user_id !== actor.id) return null;
  return session;
}

async function markUploadSessionFailed(c: Context<AppBindings>, session: PreparedDocumentUploadSessionRow, code: string, message: string, cleanupObject = false) {
  if (cleanupObject && session.r2_key) {
    await c.env.DOCUMENTS_BUCKET.delete(session.r2_key).catch((error) => {
      safeDocumentUploadLog("document.upload.cleanup_failed", { upload_id: session.id, batch_id: session.batch_id, message: error instanceof Error ? error.message : String(error) });
    });
  }
  await c.env.DB.prepare("UPDATE document_upload_sessions SET status = 'FAILED', error_code = ?, error_message = ?, failed_at = ?, updated_at = ? WHERE id = ?")
    .bind(code, message, nowIso(), nowIso(), session.id)
    .run();
}

async function createDocumentVersionFromUploadedObject(c: Context<AppBindings>, session: PreparedDocumentUploadSessionRow) {
  const versionId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO employee_document_versions
     (id, employee_document_id, version_no, r2_key, original_filename, file_mime_type, file_size_bytes, file_hash, uploaded_by_user_id, reason_for_replacement, is_current)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(versionId, session.document_id, session.version_no, session.r2_key, session.original_filename, session.file_mime_type, session.file_size_bytes, session.file_hash, c.get("currentUser").id, session.reason_for_replacement).run();
  await c.env.DB.prepare("UPDATE employee_document_versions SET is_current = 0 WHERE employee_document_id = ? AND id != ?").bind(session.document_id, versionId).run();
  await c.env.DB.prepare("UPDATE employee_documents SET current_version_id = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?").bind(versionId, nowIso(), c.get("currentUser").id, session.document_id).run();
  return versionId;
}

async function commitUploadedDocumentSession(c: Context<AppBindings>, session: PreparedDocumentUploadSessionRow): Promise<DocumentUploadCompleteResult> {
  if (isExpiredIso(session.expires_at)) {
    await markUploadSessionFailed(c, session, "DOCUMENT_UPLOAD_EXPIRED", "Prepared upload expired.", true);
    throw new Error("DOCUMENT_UPLOAD_EXPIRED");
  }
  if (session.status !== "UPLOADED") throw new Error("DOCUMENT_UPLOAD_NOT_UPLOADED");
  const object = await c.env.DOCUMENTS_BUCKET.head(session.r2_key);
  if (!object) {
    await markUploadSessionFailed(c, session, "DOCUMENT_UPLOAD_OBJECT_MISSING", "Uploaded object was not found.");
    throw new Error("DOCUMENT_UPLOAD_OBJECT_MISSING");
  }
  const employee = await ensureEmployee(c.env.DB, session.employee_id);
  const type = await getType(c.env.DB, session.document_type_id);
  if (!employee || !type || type.is_active !== 1) {
    await markUploadSessionFailed(c, session, "DOCUMENT_UPLOAD_REFERENCE_INVALID", "Employee or document type was not found.");
    throw new Error("DOCUMENT_UPLOAD_REFERENCE_INVALID");
  }
  const meta = { document_number: session.document_number, issue_date: session.issue_date, expiry_date: session.expiry_date };
  const metaIssue = validateMetadataIssue(type, meta);
  if (metaIssue) {
    await markUploadSessionFailed(c, session, metaIssue.code, metaIssue.message, true);
    throw new Error(metaIssue.code);
  }
  const fileIssue = validateFileMetadataIssue(type, { name: session.original_filename, type: session.file_mime_type, size: session.file_size_bytes });
  if (fileIssue) {
    await markUploadSessionFailed(c, session, fileIssue.code, fileIssue.message, true);
    throw new Error(fileIssue.code);
  }
  const compatibilityIssue = await validateDocumentEmployeeCompatibility(c.env.DB, employee, type);
  if (compatibilityIssue) {
    await markUploadSessionFailed(c, session, compatibilityIssue.code, compatibilityIssue.message, true);
    throw new Error(compatibilityIssue.code);
  }
  if (type.allow_multiple_files !== 1) {
    const duplicate = await c.env.DB.prepare("SELECT id FROM employee_documents WHERE employee_id = ? AND document_type_id = ? AND status = 'ACTIVE'").bind(session.employee_id, type.id).first<{ id: string }>();
    if (duplicate) {
      await markUploadSessionFailed(c, session, "DUPLICATE_DOCUMENT", "This document type does not allow multiple active files for the same employee.", true);
      throw new Error("DUPLICATE_DOCUMENT");
    }
  }

  await c.env.DB.prepare("UPDATE document_upload_sessions SET status = 'COMPLETING', updated_at = ? WHERE id = ?").bind(nowIso(), session.id).run();
  let insertedDocument = false;
  try {
    await c.env.DB.prepare(
      `INSERT INTO employee_documents
       (id, employee_id, document_type_id, category_id, document_number, issue_date, expiry_date, is_sensitive, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(session.document_id, session.employee_id, type.id, type.category_id, session.document_number, session.issue_date, session.expiry_date, type.is_sensitive, session.notes, c.get("currentUser").id).run();
    insertedDocument = true;
    const versionId = await createDocumentVersionFromUploadedObject(c, session);
    const doc = await getDocument(c.env.DB, session.document_id, session.employee_id);
    await auditDocument(c, { action: "document.uploaded", entityType: "document", entityId: session.document_id, oldValue: null, newValue: doc, reason: session.reason_for_replacement });
    await publishDocument(c, "document.uploaded", session.document_id, "uploaded");
    await c.env.DB.prepare("UPDATE document_upload_sessions SET status = 'COMPLETED', completed_document_id = ?, completed_version_id = ?, completed_at = ?, updated_at = ? WHERE id = ?")
      .bind(session.document_id, versionId, nowIso(), nowIso(), session.id)
      .run();
    runDocumentBackgroundTask(c, refreshComplianceAfterDocumentChange(c.env.DB, session.employee_id, session.document_id), "document.upload.background_compliance_refresh", { upload_id: session.id, batch_id: session.batch_id });
    return {
      uploadId: session.id,
      clientRowId: session.client_row_id,
      document: doc ? maskDocument(doc, hasPermission(c, "documents.sensitive.view")) : null,
      documentId: session.document_id,
      versionId,
      r2Key: session.r2_key,
      createdNewDocument: true
    };
  } catch (error) {
    if (insertedDocument) {
      await cleanupEmployeeDocumentUploads(c, [{ documentId: session.document_id }]);
    } else {
      await c.env.DOCUMENTS_BUCKET.delete(session.r2_key).catch(() => undefined);
    }
    await markUploadSessionFailed(c, session, "DOCUMENT_UPLOAD_COMMIT_FAILED", "Document upload could not be committed.");
    throw error;
  }
}

export async function completeDocumentUploadSessions(c: Context<AppBindings>, uploadIds: string[], expectedContext?: { employeeId?: string | null; onboardingCaseId?: string | null }) {
  if (!uploadIds.length) {
    return {
      completed_count: 0,
      failed_count: 1,
      documents: [],
      results: [{ upload_id: null, status: "FAILED", code: "DOCUMENT_UPLOAD_COMPLETE_EMPTY", message: "No uploaded document rows were provided." }],
      recalculation_status: "not_queued"
    };
  }
  const documents: Array<ReturnType<typeof maskDocument> | null> = [];
  const results: Array<Record<string, unknown>> = [];
  for (const uploadId of uploadIds) {
    const session = await getUploadSessionForActor(c, uploadId);
    if (!session) {
      results.push({ upload_id: uploadId, status: "FAILED", code: "DOCUMENT_UPLOAD_NOT_FOUND", message: "Prepared upload was not found." });
      continue;
    }
    if (expectedContext?.employeeId && session.employee_id !== expectedContext.employeeId) {
      results.push({ upload_id: uploadId, client_row_id: session.client_row_id, status: "FAILED", code: "DOCUMENT_UPLOAD_CONTEXT_MISMATCH", message: "Prepared upload does not belong to this employee." });
      continue;
    }
    if (expectedContext?.onboardingCaseId && session.onboarding_case_id !== expectedContext.onboardingCaseId) {
      results.push({ upload_id: uploadId, client_row_id: session.client_row_id, status: "FAILED", code: "DOCUMENT_UPLOAD_CONTEXT_MISMATCH", message: "Prepared upload does not belong to this onboarding case." });
      continue;
    }
    try {
      const completed = await commitUploadedDocumentSession(c, session);
      documents.push(completed.document);
      results.push({
        upload_id: completed.uploadId,
        client_row_id: completed.clientRowId,
        status: "UPLOADED",
        document_id: completed.documentId,
        version_id: completed.versionId
      });
    } catch (error) {
      results.push({
        upload_id: uploadId,
        client_row_id: session.client_row_id,
        status: "FAILED",
        code: error instanceof Error ? error.message : "DOCUMENT_UPLOAD_COMPLETE_FAILED",
        message: "Document upload could not be committed. Retry this row or use the fallback batch upload."
      });
    }
  }
  const completedCount = results.filter((result) => result.status === "UPLOADED").length;
  return {
    completed_count: completedCount,
    failed_count: results.length - completedCount,
    documents: documents.filter(Boolean),
    results,
    recalculation_status: completedCount > 0 ? "queued" : "not_queued"
  };
}

function runDocumentBackgroundTask(c: Context<AppBindings>, task: Promise<unknown>, label: string, meta: Record<string, unknown>) {
  const safeTask = task.catch((error) => {
    safeDocumentUploadLog(label, {
      ...meta,
      request_id: c.req.header("X-Request-ID") ?? c.req.header("x-request-id") ?? null,
      message: error instanceof Error ? error.message : String(error)
    });
  });
  const executionCtx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
  if (executionCtx) executionCtx.waitUntil(safeTask);
  else void safeTask;
}

export async function cleanupStalePendingDocumentUploads(c: Context<AppBindings>, limit = 25) {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM document_upload_sessions
     WHERE status IN ('PREPARED', 'UPLOADING', 'UPLOADED', 'FAILED') AND expires_at < ?
     ORDER BY expires_at ASC
     LIMIT ?`
  ).bind(new Date().toISOString(), limit).all<PreparedDocumentUploadSessionRow>();
  let cleaned = 0;
  for (const row of rows.results) {
    if (["UPLOADED", "FAILED"].includes(row.status)) {
      await c.env.DOCUMENTS_BUCKET.delete(row.r2_key).catch((error) => {
        safeDocumentUploadLog("document.upload.orphan_cleanup_failed", { upload_id: row.id, batch_id: row.batch_id, message: error instanceof Error ? error.message : String(error) });
      });
    }
    await c.env.DB.prepare("UPDATE document_upload_sessions SET status = 'CLEANED_UP', cleaned_up_at = ?, updated_at = ? WHERE id = ?")
      .bind(nowIso(), nowIso(), row.id)
      .run();
    cleaned += 1;
  }
  return { cleaned };
}

export async function prepareEmployeeDocumentUpload(c: Context<AppBindings>, input: EmployeeDocumentUploadParts): Promise<{ prepared: PreparedEmployeeDocumentUpload | null; response: Response | null }> {
  const employeeId = input.employeeId;
  if (!input.skipAccessCheck && !(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "manage"))) {
    return { prepared: null, response: fail(c, 404, "NOT_FOUND", "Employee was not found.") };
  }
  const employee = await ensureEmployee(c.env.DB, employeeId);
  if (!employee) return { prepared: null, response: fail(c, 404, "NOT_FOUND", "Employee was not found.") };
  if (!input.file) return { prepared: null, response: fail(c, 400, "FILE_REQUIRED", "File is required.") };
  if (!input.documentTypeId) return { prepared: null, response: fail(c, 400, "DOCUMENT_TYPE_REQUIRED", "Document type is required.") };
  const type = await getType(c.env.DB, input.documentTypeId);
  if (!type || type.is_active !== 1) return { prepared: null, response: fail(c, 400, "INVALID_DOCUMENT_TYPE", "Document type was not found or is inactive.") };
  const compatibilityIssue = await validateDocumentEmployeeCompatibility(c.env.DB, employee, type);
  if (compatibilityIssue) return { prepared: null, response: documentUploadIssueResponse(c, compatibilityIssue) };
  const meta = {
    document_number: optionalString(input.document_number),
    issue_date: optionalString(input.issue_date),
    expiry_date: optionalString(input.expiry_date)
  };
  const metaIssue = validateMetadataIssue(type, meta);
  if (metaIssue) return { prepared: null, response: documentUploadIssueResponse(c, metaIssue) };
  const fileIssue = validateFileIssue(type, input.file);
  if (fileIssue) return { prepared: null, response: documentUploadIssueResponse(c, fileIssue) };

  const replaceDocumentId = input.replaceDocumentId ?? null;
  let oldDocument: EmployeeDocumentRow | null = null;
  let documentId: string | null = replaceDocumentId;
  let versionNo = 1;
  const reason = optionalString(input.reason_for_replacement) ?? input.defaultReplacementReason ?? null;

  if (replaceDocumentId) {
    oldDocument = await getDocument(c.env.DB, replaceDocumentId, employeeId);
    if (!oldDocument) return { prepared: null, response: fail(c, 404, "NOT_FOUND", "Document was not found.") };
    if (oldDocument.status !== "ACTIVE") return { prepared: null, response: fail(c, 409, "DOCUMENT_NOT_ACTIVE", "Archived or soft-deleted documents must be restored before replacement.") };
    if (!reason) return { prepared: null, response: fail(c, 400, "REPLACEMENT_REASON_REQUIRED", "Replacement reason is required.") };
    const last = await c.env.DB.prepare("SELECT MAX(version_no) AS version_no FROM employee_document_versions WHERE employee_document_id = ?").bind(replaceDocumentId).first<{ version_no: number }>();
    versionNo = (last?.version_no ?? 0) + 1;
  } else {
    if (type.allow_multiple_files !== 1) {
      const duplicate = await c.env.DB.prepare("SELECT id FROM employee_documents WHERE employee_id = ? AND document_type_id = ? AND status = 'ACTIVE'").bind(employeeId, type.id).first<{ id: string }>();
      if (duplicate) return { prepared: null, response: fail(c, 409, "DUPLICATE_DOCUMENT", "This document type does not allow multiple active files for the same employee.") };
    }
    documentId = crypto.randomUUID();
  }

  return {
    prepared: {
      employeeId,
      type,
      file: input.file,
      meta,
      notes: optionalString(input.notes),
      replaceDocumentId,
      documentId,
      oldDocument,
      versionNo,
      reason
    },
    response: null
  };
}

export async function savePreparedEmployeeDocumentUpload(c: Context<AppBindings>, prepared: PreparedEmployeeDocumentUpload): Promise<EmployeeDocumentUploadResult> {
  const replacing = Boolean(prepared.replaceDocumentId);
  const documentId = prepared.documentId ?? crypto.randomUUID();
  let insertedDocument = false;
  try {
    if (!replacing) {
      await c.env.DB.prepare(
        `INSERT INTO employee_documents
         (id, employee_id, document_type_id, category_id, document_number, issue_date, expiry_date, is_sensitive, notes, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(documentId, prepared.employeeId, prepared.type.id, prepared.type.category_id, prepared.meta.document_number, prepared.meta.issue_date, prepared.meta.expiry_date, prepared.type.is_sensitive, prepared.notes, c.get("currentUser").id).run();
      insertedDocument = true;
    }
    const version = await createDocumentVersion(c, { employeeId: prepared.employeeId, documentId, file: prepared.file, versionNo: prepared.versionNo, reason: prepared.reason });
    await c.env.DB.prepare("UPDATE employee_documents SET document_number = ?, issue_date = ?, expiry_date = ?, notes = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?").bind(prepared.meta.document_number, prepared.meta.issue_date, prepared.meta.expiry_date, prepared.notes, new Date().toISOString(), c.get("currentUser").id, documentId).run();
    const doc = await getDocument(c.env.DB, documentId, prepared.employeeId);
    await auditDocument(c, { action: replacing ? "document.replaced" : "document.uploaded", entityType: "document", entityId: documentId, oldValue: prepared.oldDocument, newValue: doc, reason: prepared.reason });
    await publishDocument(c, replacing ? "document.replaced" : "document.uploaded", documentId, replacing ? "replaced" : "uploaded");
    await refreshDocumentComplianceQuietly(c, prepared.employeeId, documentId);
    return {
      document: doc ? maskDocument(doc, hasPermission(c, "documents.sensitive.view")) : null,
      documentId,
      versionId: version.id,
      r2Key: version.key,
      createdNewDocument: !replacing
    };
  } catch (error) {
    if (insertedDocument && !replacing) {
      await cleanupEmployeeDocumentUploads(c, [{ documentId }]);
    }
    throw error;
  }
}

export async function cleanupEmployeeDocumentUploads(c: Context<AppBindings>, uploads: Array<{ documentId: string }>) {
  for (const upload of uploads) {
    const versions = await c.env.DB.prepare("SELECT r2_key FROM employee_document_versions WHERE employee_document_id = ?").bind(upload.documentId).all<{ r2_key: string }>();
    for (const version of versions.results) {
      if (version.r2_key) await c.env.DOCUMENTS_BUCKET.delete(version.r2_key).catch(() => undefined);
    }
    await c.env.DB.prepare("DELETE FROM employee_document_versions WHERE employee_document_id = ?").bind(upload.documentId).run();
    await c.env.DB.prepare("DELETE FROM employee_documents WHERE id = ?").bind(upload.documentId).run();
  }
}

export async function uploadEmployeeDocument(c: Context<AppBindings>, replaceDocumentId?: string, forcedTypeId?: string, defaultReplacementReason?: string, forcedEmployeeId?: string) {
  const employeeId = forcedEmployeeId ?? routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await ensureEmployee(c.env.DB, employeeId);
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const body = await parseMultipart(c);
  if (!body) return fail(c, 400, "INVALID_FORM", "Multipart form data is required.");
  const file = fileFromBody(body);
  if (!file) return fail(c, 400, "FILE_REQUIRED", "File is required.");
  const typeId = forcedTypeId ?? (replaceDocumentId ? (await getDocument(c.env.DB, replaceDocumentId, employeeId))?.document_type_id : readString(body.document_type_id));
  if (!typeId) return fail(c, 400, "DOCUMENT_TYPE_REQUIRED", "Document type is required.");
  const prepared = await prepareEmployeeDocumentUpload(c, {
    employeeId,
    documentTypeId: typeId,
    file,
    document_number: readString(body.document_number),
    issue_date: readString(body.issue_date),
    expiry_date: readString(body.expiry_date),
    notes: readString(body.notes),
    replaceDocumentId,
    reason_for_replacement: readString(body.reason_for_replacement),
    defaultReplacementReason
  });
  if (prepared.response || !prepared.prepared) return prepared.response ?? fail(c, 400, "INVALID_DOCUMENT_UPLOAD", "Document upload could not be prepared.");
  const saved = await savePreparedEmployeeDocumentUpload(c, prepared.prepared);
  return ok(c, { document: saved.document }, replaceDocumentId ? 200 : 201);
}

employeeDocumentRoutes.post("/:employeeId/documents/upload", requirePermission("documents.upload"), (c) => uploadEmployeeDocument(c));
employeeDocumentRoutes.post("/:employeeId/documents/:documentId/replace", requirePermission("documents.upload"), (c) => uploadEmployeeDocument(c, routeParam(c, "documentId")));

employeeDocumentRoutes.patch("/:employeeId/documents/:documentId", requirePermission("documents.upload"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "documents", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Document was not found.");
  }
  const doc = await getDocument(c.env.DB, routeParam(c, "documentId"), routeParam(c, "employeeId"));
  if (!doc) return fail(c, 404, "NOT_FOUND", "Document was not found.");
  const type = await getType(c.env.DB, doc.document_type_id);
  if (!type) return fail(c, 400, "INVALID_DOCUMENT_TYPE", "Document type was not found.");
  const body = await readJsonBody(c.req.raw);
  const meta = { document_number: optionalString(body.document_number), issue_date: optionalString(body.issue_date), expiry_date: optionalString(body.expiry_date) };
  const metaError = validateMetadata(c, type, meta);
  if (metaError) return metaError;
  await c.env.DB.prepare("UPDATE employee_documents SET document_number = ?, issue_date = ?, expiry_date = ?, notes = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?").bind(meta.document_number, meta.issue_date, meta.expiry_date, optionalString(body.notes), new Date().toISOString(), c.get("currentUser").id, doc.id).run();
  const updated = await getDocument(c.env.DB, doc.id, doc.employee_id);
  await auditDocument(c, { action: "document.metadata_updated", entityType: "document", entityId: doc.id, oldValue: doc, newValue: updated });
  await refreshDocumentComplianceQuietly(c, doc.employee_id, doc.id);
  return ok(c, { document: updated ? maskDocument(updated, hasPermission(c, "documents.sensitive.view")) : null });
});

async function documentStatusAction(c: Context<AppBindings>, status: StoredStatus, permission: "documents.archive" | "documents.delete", action: string) {
  if (!hasPermission(c, permission)) return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "documents", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Document was not found.");
  }
  const doc = await getDocument(c.env.DB, routeParam(c, "documentId"), routeParam(c, "employeeId"));
  if (!doc) return fail(c, 404, "NOT_FOUND", "Document was not found.");
  const body = await readJsonBody(c.req.raw);
  const reasonResult = await ensureReason(c, body);
  if (reasonResult.response) return reasonResult.response;
  const now = new Date().toISOString();
  const actor = c.get("currentUser").id;
  if (action === "archived") {
    await c.env.DB.prepare("UPDATE employee_documents SET status = 'ARCHIVED', archived_at = ?, archived_by_user_id = ?, archive_reason = ?, updated_at = ? WHERE id = ?").bind(now, actor, reasonResult.reason, now, doc.id).run();
  } else if (action === "restored") {
    await c.env.DB.prepare("UPDATE employee_documents SET status = 'ACTIVE', restored_at = ?, restored_by_user_id = ?, restore_reason = ?, updated_at = ? WHERE id = ?").bind(now, actor, reasonResult.reason, now, doc.id).run();
  } else {
    await c.env.DB.prepare("UPDATE employee_documents SET status = 'SOFT_DELETED', soft_deleted_at = ?, soft_deleted_by_user_id = ?, soft_delete_reason = ?, updated_at = ? WHERE id = ?").bind(now, actor, reasonResult.reason, now, doc.id).run();
  }
  const updated = await getDocument(c.env.DB, doc.id, doc.employee_id);
  await auditDocument(c, { action: `document.${action}`, entityType: "document", entityId: doc.id, oldValue: doc, newValue: updated, reason: reasonResult.reason });
  await publishDocument(c, action === "archived" ? "document.archived" : action === "restored" ? "document.restored" : "document.soft_deleted", doc.id, action);
  await refreshDocumentComplianceQuietly(c, doc.employee_id, doc.id);
  return ok(c, { document: updated ? maskDocument(updated, hasPermission(c, "documents.sensitive.view")) : null });
}

employeeDocumentRoutes.post("/:employeeId/documents/:documentId/archive", (c) => documentStatusAction(c, "ARCHIVED", "documents.archive", "archived"));
employeeDocumentRoutes.post("/:employeeId/documents/:documentId/restore", (c) => documentStatusAction(c, "ACTIVE", "documents.archive", "restored"));
employeeDocumentRoutes.post("/:employeeId/documents/:documentId/soft-delete", (c) => documentStatusAction(c, "SOFT_DELETED", "documents.delete", "soft_deleted"));

employeeDocumentRoutes.delete("/:employeeId/documents/:documentId/permanent-delete", requirePermission("documents.permanent_delete"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "documents", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Document was not found.");
  }
  const doc = await getDocument(c.env.DB, routeParam(c, "documentId"), routeParam(c, "employeeId"));
  if (!doc) return fail(c, 404, "NOT_FOUND", "Document was not found.");
  const body = await readJsonBody(c.req.raw);
  const reasonResult = await ensureReason(c, body);
  if (reasonResult.response) return reasonResult.response;
  const versions = await c.env.DB.prepare("SELECT * FROM employee_document_versions WHERE employee_document_id = ?").bind(doc.id).all<VersionRow>();
  await auditDocument(c, { action: "document.permanently_deleted", entityType: "document", entityId: doc.id, oldValue: { doc, versions: versions.results }, reason: reasonResult.reason });
  for (const version of versions.results) {
    await c.env.DOCUMENTS_BUCKET.delete(version.r2_key);
  }
  await c.env.DB.prepare("DELETE FROM employee_document_versions WHERE employee_document_id = ?").bind(doc.id).run();
  await c.env.DB.prepare("DELETE FROM employee_documents WHERE id = ?").bind(doc.id).run();
  await publishDocument(c, "document.permanently_deleted", doc.id, "permanently_deleted");
  await refreshDocumentComplianceQuietly(c, doc.employee_id, doc.id);
  return ok(c, { deleted: true });
});

employeeDocumentRoutes.get("/:employeeId/documents/:documentId/download", async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "documents", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Document was not found.");
  }
  const doc = await getDocument(c.env.DB, routeParam(c, "documentId"), routeParam(c, "employeeId"));
  if (!doc) return fail(c, 404, "NOT_FOUND", "Document was not found.");
  if (doc.is_sensitive === 1 && !hasPermission(c, "documents.sensitive.download")) return fail(c, 403, "FORBIDDEN", "Sensitive document download permission is required.");
  if (doc.is_sensitive !== 1 && !hasPermission(c, "documents.download")) return fail(c, 403, "FORBIDDEN", "Document download permission is required.");
  const version = await c.env.DB.prepare("SELECT * FROM employee_document_versions WHERE id = ?").bind(doc.current_version_id).first<VersionRow>();
  if (!version) return fail(c, 404, "NOT_FOUND", "Document file version was not found.");
  const object = await c.env.DOCUMENTS_BUCKET.get(version.r2_key);
  if (!object) return fail(c, 404, "NOT_FOUND", "Document file was not found.");
  await auditDocument(c, { action: doc.is_sensitive === 1 ? "document.viewed_sensitive" : "document.downloaded", entityType: "document", entityId: doc.id, newValue: { version_id: version.id } });
  return new Response(object.body, {
    headers: {
      "Content-Type": version.file_mime_type,
      "Content-Disposition": `attachment; filename="${version.original_filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60"
    }
  });
});

employeeDocumentRoutes.get("/:employeeId/documents/:documentId/versions", requirePermission("documents.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "documents", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Document was not found.");
  }
  const doc = await getDocument(c.env.DB, routeParam(c, "documentId"), routeParam(c, "employeeId"));
  if (!doc) return fail(c, 404, "NOT_FOUND", "Document was not found.");
  if (doc.is_sensitive === 1 && !hasPermission(c, "documents.sensitive.view")) return fail(c, 403, "FORBIDDEN", "Sensitive document permission is required.");
  const rows = await c.env.DB.prepare(
    `SELECT v.*, u.name AS uploaded_by_name
     FROM employee_document_versions v
     LEFT JOIN users u ON u.id = v.uploaded_by_user_id
     WHERE v.employee_document_id = ?
     ORDER BY v.version_no DESC`
  ).bind(doc.id).all<VersionRow>();
  return ok(c, { versions: rows.results.map((version) => ({ ...version, is_current: version.is_current === 1, r2_key: undefined })) });
});

employeeDocumentRoutes.post("/:employeeId/profile-photo", requirePermission("documents.upload"), async (c) => {
  const type = await c.env.DB.prepare("SELECT * FROM document_types WHERE code = 'PROFILE_PHOTO' AND is_active = 1").first<DocumentTypeRow>();
  if (!type) return fail(c, 400, "PROFILE_PHOTO_TYPE_MISSING", "Profile Photo document type is not configured.");
  const employeeId = routeParam(c, "employeeId");
  const employee = await c.env.DB.prepare("SELECT id, profile_photo_document_id FROM employees WHERE id = ?").bind(employeeId).first<{ id: string; profile_photo_document_id: string | null }>();
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const existing = await c.env.DB.prepare(
    `SELECT ed.id
     FROM employee_documents ed
     LEFT JOIN employees e ON e.id = ed.employee_id
     WHERE ed.employee_id = ? AND ed.document_type_id = ? AND ed.status = 'ACTIVE'
     ORDER BY CASE WHEN ed.id = e.profile_photo_document_id THEN 0 ELSE 1 END, ed.updated_at DESC
     LIMIT 1`
  ).bind(employeeId, type.id).first<{ id: string }>();
  const response = await uploadEmployeeDocument(c, existing?.id, type.id, "Profile photo updated");
  if (response.status >= 400) return response;
  const documentId = existing?.id ?? (await c.env.DB.prepare("SELECT id FROM employee_documents WHERE employee_id = ? AND document_type_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1").bind(employeeId, type.id).first<{ id: string }>())?.id;
  if (documentId) {
    await c.env.DB.prepare("UPDATE employees SET profile_photo_document_id = ?, updated_at = ? WHERE id = ?").bind(documentId, new Date().toISOString(), employeeId).run();
    await auditDocument(c, { action: "document.profile_photo_updated", entityType: "document", entityId: documentId, newValue: { employee_id: employeeId, replaced: Boolean(existing) } });
    await auditEmployeeProfilePhoto(c, { employeeId, oldValue: { profile_photo_document_id: employee.profile_photo_document_id }, newValue: { profile_photo_document_id: documentId } });
    await publishEmployeeProfilePhoto(c, employeeId, documentId, "profile_photo_changed");
    await resolveDocumentAlertForRenewedDocument(c.env.DB, employeeId, documentId);
  }
  return response;
});

employeeDocumentRoutes.delete("/:employeeId/profile-photo", requirePermission("documents.archive"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "documents", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const type = await c.env.DB.prepare("SELECT * FROM document_types WHERE code = 'PROFILE_PHOTO'").first<DocumentTypeRow>();
  const employee = await c.env.DB.prepare("SELECT id, profile_photo_document_id FROM employees WHERE id = ?").bind(employeeId).first<{ id: string; profile_photo_document_id: string | null }>();
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const active = type
    ? await c.env.DB.prepare(
        `SELECT ed.id
         FROM employee_documents ed
         WHERE ed.employee_id = ? AND ed.document_type_id = ? AND ed.status = 'ACTIVE'
         ORDER BY CASE WHEN ed.id = ? THEN 0 ELSE 1 END, ed.updated_at DESC
         LIMIT 1`
      ).bind(employeeId, type.id, employee?.profile_photo_document_id ?? "").first<{ id: string }>()
    : null;
  const now = new Date().toISOString();
  if (active) {
    await c.env.DB.prepare("UPDATE employee_documents SET status = 'ARCHIVED', archived_at = ?, archived_by_user_id = ?, archive_reason = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?").bind(now, c.get("currentUser").id, "Profile photo cleared", now, c.get("currentUser").id, active.id).run();
    await auditDocument(c, { action: "document.profile_photo_updated", entityType: "document", entityId: active.id, newValue: { cleared: true, archived: true }, reason: "Profile photo cleared" });
  }
  await c.env.DB.prepare("UPDATE employees SET profile_photo_document_id = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), employeeId).run();
  await auditEmployeeProfilePhoto(c, { employeeId, oldValue: { profile_photo_document_id: employee.profile_photo_document_id }, newValue: { profile_photo_document_id: null }, reason: "Profile photo cleared" });
  await publishEmployeeProfilePhoto(c, employeeId, active?.id ?? null, "profile_photo_changed");
  await refreshDocumentComplianceQuietly(c, employeeId, active?.id ?? null);
  return ok(c, { cleared: true });
});

employeeDocumentRoutes.get("/:employeeId/profile-photo", requirePermission("employees.view"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Profile photo was not found.");
  }
  const employee = await c.env.DB.prepare("SELECT id, profile_photo_document_id FROM employees WHERE id = ?").bind(employeeId).first<{ id: string; profile_photo_document_id: string | null }>();
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  if (!employee?.profile_photo_document_id) return fail(c, 404, "NOT_FOUND", "Profile photo was not found.");
  const doc = await getDocument(c.env.DB, employee.profile_photo_document_id, employeeId);
  if (doc?.status !== "ACTIVE") return fail(c, 404, "NOT_FOUND", "Profile photo was not found.");
  if (doc.document_type_code !== "PROFILE_PHOTO") return fail(c, 404, "NOT_FOUND", "Profile photo was not found.");
  if (!doc?.current_version_id) return fail(c, 404, "NOT_FOUND", "Profile photo was not found.");
  const version = await c.env.DB.prepare("SELECT * FROM employee_document_versions WHERE id = ?").bind(doc.current_version_id).first<VersionRow>();
  if (!version) return fail(c, 404, "NOT_FOUND", "Profile photo file was not found.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(version.file_mime_type)) return fail(c, 415, "UNSUPPORTED_MEDIA_TYPE", "Profile photo file type is not supported.");
  const object = await c.env.DOCUMENTS_BUCKET.get(version.r2_key);
  if (!object) return fail(c, 404, "NOT_FOUND", "Profile photo file was not found.");
  return new Response(object.body, { headers: { "Content-Type": version.file_mime_type, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
});
