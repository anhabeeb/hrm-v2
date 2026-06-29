import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { validateImportRows } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser, Env } from "../types";
import { validationMessageToIssue } from "../utils/import-validation";
import { buildCsv, buildPdfReport, buildXlsxReport, buildXlsxTemplate, friendlyColumnLabel, type ExcelValidationRule } from "../utils/report-export";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type ImportMode = "CREATE_ONLY" | "UPDATE_ONLY" | "UPSERT" | "VALIDATE_ONLY";
type ImportStatus = "UPLOADED" | "VALIDATING" | "VALIDATION_FAILED" | "READY_TO_APPLY" | "APPLYING" | "APPLIED" | "APPLIED_WITH_WARNINGS" | "FAILED" | "CANCELLED";
type RowValidationStatus = "PENDING" | "VALID" | "INVALID" | "WARNING" | "DUPLICATE";
type ExportFormat = "csv" | "xlsx" | "pdf";

type ColumnDef = { key: string; required?: boolean; sensitive?: boolean; protected?: boolean; enumKey?: string; sample?: string; note?: string };
type ImportTypeDefinition = {
  key: string;
  label: string;
  category: string;
  moduleKey: string;
  description: string;
  duplicateKey: string[];
  requiredColumns: string[];
  sensitiveColumns: string[];
  protectedColumns: string[];
  createAllowed: boolean;
  updateAllowed: boolean;
  upsertAllowed: boolean;
  placeholderOnly?: boolean;
  columns: ColumnDef[];
};
type ExportTypeDefinition = {
  key: string;
  label: string;
  category: string;
  moduleKey: string;
  columns: string[];
  source: "table" | "placeholder" | "report_export_logs";
  table?: string;
  sensitive?: boolean;
};
type ImportBatchRow = {
  id: string;
  batch_number: string;
  import_type: string;
  import_mode: ImportMode;
  source_file_name: string | null;
  row_count: number;
  valid_row_count: number;
  invalid_row_count: number;
  warning_count: number;
  duplicate_count: number;
  create_count: number;
  update_count: number;
  skipped_count: number;
  error_count: number;
  status: ImportStatus;
  validation_summary_json: string | null;
  apply_summary_json: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
};
type ImportResultRow = {
  id: string;
  import_batch_id: string;
  row_number: number;
  raw_row_json: string;
  normalized_row_json: string | null;
  target_entity_type: string | null;
  target_entity_id: string | null;
  action: "CREATE" | "UPDATE" | "SKIP" | "ERROR" | "WARNING";
  validation_status: RowValidationStatus;
  apply_status: "NOT_APPLIED" | "APPLIED" | "SKIPPED" | "FAILED";
  error_code: string | null;
  error_message: string | null;
  warning_json: string | null;
  before_snapshot_json: string | null;
  after_snapshot_json: string | null;
  metadata_json: string | null;
};

const now = () => new Date().toISOString();
const IMPORT_MODES: ImportMode[] = ["CREATE_ONLY", "UPDATE_ONLY", "UPSERT", "VALIDATE_ONLY"];
const enumValues: Record<string, string[]> = {
  boolean: ["1", "0", "true", "false", "yes", "no", "Y", "N"],
  employee_type: ["LOCAL", "FOREIGN", "OTHER"],
  employment_type: ["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"],
  employee_status: ["DRAFT", "ONBOARDING", "ACTIVE", "INACTIVE", "SUSPENDED", "EXITED", "TERMINATED"],
  location_type: ["OUTLET", "OFFICE", "WAREHOUSE", "OTHER"],
  payment_method: ["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"],
  payment_method_type: ["BANK_TRANSFER", "CASH", "CHEQUE_PLACEHOLDER", "MOBILE_WALLET_PLACEHOLDER", "OTHER"],
  allocation_type: ["FULL", "PERCENTAGE", "FIXED_AMOUNT"]
};

function cols(keys: Array<string | ColumnDef>) {
  return keys.map((item) => typeof item === "string" ? { key: item } : item);
}

const importTypes: ImportTypeDefinition[] = [
  { key: "employees", label: "Employees", category: "Employees", moduleKey: "employees", description: "Create/update employee master records by employee_number.", duplicateKey: ["employee_number"], requiredColumns: ["employee_number", "full_name"], sensitiveColumns: [], protectedColumns: ["status", "department_code", "position_code", "worksite_code"], createAllowed: true, updateAllowed: true, upsertAllowed: true, columns: cols([{ key: "employee_number", required: true, sample: "EMP-0001" }, { key: "full_name", required: true, sample: "Amin Ali" }, "department_code", "position_code", "worksite_code", { key: "joined_date", note: "YYYY-MM-DD" }, { key: "status", enumKey: "employee_status", sample: "ACTIVE" }, { key: "employee_type", enumKey: "employee_type", sample: "LOCAL" }, { key: "employment_type", enumKey: "employment_type", sample: "FULL_TIME" }]) },
  { key: "departments", label: "Departments", category: "Organization", moduleKey: "organization", description: "Create/update departments by department_code.", duplicateKey: ["department_code"], requiredColumns: ["department_code", "name"], sensitiveColumns: [], protectedColumns: [], createAllowed: true, updateAllowed: true, upsertAllowed: true, columns: cols([{ key: "department_code", required: true, sample: "HR" }, { key: "name", required: true, sample: "Human Resources" }, "description", { key: "is_active", enumKey: "boolean", sample: "1" }]) },
  { key: "positions", label: "Positions", category: "Organization", moduleKey: "organization", description: "Create/update positions by position_code.", duplicateKey: ["position_code"], requiredColumns: ["position_code", "title"], sensitiveColumns: [], protectedColumns: [], createAllowed: true, updateAllowed: true, upsertAllowed: true, columns: cols([{ key: "position_code", required: true, sample: "HR-OFFICER" }, { key: "title", required: true, sample: "HR Officer" }, "department_code", "job_level_code", "description", { key: "is_active", enumKey: "boolean", sample: "1" }]) },
  { key: "locations", label: "Worksites / locations", category: "Organization", moduleKey: "organization", description: "Create/update locations by worksite_code.", duplicateKey: ["worksite_code"], requiredColumns: ["worksite_code", "name"], sensitiveColumns: [], protectedColumns: [], createAllowed: true, updateAllowed: true, upsertAllowed: true, columns: cols([{ key: "worksite_code", required: true, sample: "MALE-01" }, { key: "name", required: true, sample: "Male Outlet 01" }, { key: "type", enumKey: "location_type", sample: "OUTLET" }, "island_city", "address", { key: "is_active", enumKey: "boolean", sample: "1" }]) },
  { key: "users_employee_linking", label: "Users / employee-user linking", category: "Users & Access", moduleKey: "users", description: "Validate user-to-employee linking by email and employee_number. Protected admin records are blocked.", duplicateKey: ["email", "employee_number"], requiredColumns: ["email", "employee_number"], sensitiveColumns: [], protectedColumns: ["email"], createAllowed: false, updateAllowed: true, upsertAllowed: false, placeholderOnly: true, columns: cols([{ key: "email", required: true, sample: "employee@example.com" }, { key: "employee_number", required: true, sample: "EMP-0001" }, "link_mode"]) },
  { key: "leave_balances", label: "Leave balances", category: "Leave", moduleKey: "leave", description: "Validate leave balance rows for module-specific ledger adjustment.", duplicateKey: ["employee_number", "leave_type_code", "cycle_start_date"], requiredColumns: ["employee_number", "leave_type_code", "cycle_start_date", "balance_days"], sensitiveColumns: [], protectedColumns: [], createAllowed: false, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "leave_type_code", required: true }, { key: "cycle_start_date", required: true, note: "YYYY-MM-DD" }, "cycle_end_date", { key: "balance_days", required: true }]) },
  { key: "attendance_raw_logs", label: "Attendance raw logs", category: "Attendance", moduleKey: "attendance", description: "Validate raw logs for handoff to the Prompt 18 pipeline.", duplicateKey: ["employee_number", "device_timestamp"], requiredColumns: ["employee_number", "device_timestamp"], sensitiveColumns: [], protectedColumns: [], createAllowed: true, updateAllowed: false, upsertAllowed: false, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "device_timestamp", required: true }, "punch_type", "device_identifier"]) },
  { key: "roster_assignments", label: "Roster assignments", category: "Roster", moduleKey: "roster", description: "Validate roster rows by employee/date/shift/worksite.", duplicateKey: ["employee_number", "date", "shift_code", "worksite_code"], requiredColumns: ["employee_number", "date", "shift_code", "worksite_code"], sensitiveColumns: [], protectedColumns: [], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "date", required: true, note: "YYYY-MM-DD" }, { key: "shift_code", required: true }, { key: "worksite_code", required: true }]) },
  { key: "payroll_profiles", label: "Payroll profiles", category: "Payroll", moduleKey: "payroll", description: "Create/update payroll profile foundations by employee_number.", duplicateKey: ["employee_number"], requiredColumns: ["employee_number"], sensitiveColumns: ["basic_salary", "bank_account_number"], protectedColumns: ["basic_salary"], createAllowed: true, updateAllowed: true, upsertAllowed: true, columns: cols([{ key: "employee_number", required: true }, { key: "basic_salary", sensitive: true }, "currency", { key: "payment_method", enumKey: "payment_method" }, { key: "payroll_included", enumKey: "boolean" }]) },
  { key: "salary_components", label: "Salary components", category: "Payroll", moduleKey: "payroll", description: "Validate salary component rows for module-specific assignment.", duplicateKey: ["employee_number", "component_code"], requiredColumns: ["employee_number", "component_code", "amount"], sensitiveColumns: ["amount"], protectedColumns: ["amount"], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "component_code", required: true }, { key: "amount", required: true, sensitive: true }, "effective_date"]) },
  { key: "payment_methods", label: "Payment methods", category: "Payroll", moduleKey: "payroll", description: "Validate employee payment method rows.", duplicateKey: ["employee_number", "payment_method_type", "payment_institution_code"], requiredColumns: ["employee_number", "payment_method_type"], sensitiveColumns: ["account_number"], protectedColumns: ["account_number"], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "payment_method_type", required: true, enumKey: "payment_method_type" }, "payment_institution_code", "account_name", { key: "account_number", sensitive: true }, { key: "is_primary", enumKey: "boolean" }, { key: "allocation_type", enumKey: "allocation_type" }, "allocation_percentage"]) },
  { key: "bank_loans", label: "Bank loans", category: "Payroll", moduleKey: "payroll", description: "Validate employee bank loans by employee/institution/reference.", duplicateKey: ["employee_number", "payment_institution_code", "loan_reference_number"], requiredColumns: ["employee_number", "payment_institution_code", "loan_reference_number", "monthly_installment_amount"], sensitiveColumns: ["loan_reference_number", "monthly_installment_amount"], protectedColumns: ["loan_reference_number"], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "payment_institution_code", required: true }, { key: "loan_reference_number", required: true, sensitive: true }, { key: "monthly_installment_amount", required: true, sensitive: true }, "status", "approval_status"]) },
  { key: "pension_profiles", label: "Pension profiles", category: "Payroll", moduleKey: "payroll", description: "Validate pension profile rows.", duplicateKey: ["employee_number", "pension_scheme_code"], requiredColumns: ["employee_number", "pension_scheme_code", "pension_member_id"], sensitiveColumns: ["pension_member_id"], protectedColumns: ["pension_member_id"], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "pension_scheme_code", required: true }, { key: "pension_member_id", required: true, sensitive: true }, "enrollment_status", "effective_date"]) },
  { key: "custom_deductions", label: "Custom deductions", category: "Payroll", moduleKey: "payroll", description: "Validate custom deduction rows.", duplicateKey: ["employee_number", "template_code", "effective_date"], requiredColumns: ["employee_number", "template_code", "effective_date"], sensitiveColumns: ["amount"], protectedColumns: ["amount"], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "template_code", required: true }, { key: "effective_date", required: true }, { key: "amount", sensitive: true }]) },
  { key: "assets", label: "Assets", category: "Assets & Uniforms", moduleKey: "assets", description: "Validate asset registry rows by asset_code.", duplicateKey: ["asset_code"], requiredColumns: ["asset_code", "name"], sensitiveColumns: ["purchase_value"], protectedColumns: [], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "asset_code", required: true }, "category_code", { key: "name", required: true }, "serial_number", "purchase_date", { key: "purchase_value", sensitive: true }, "status"]) },
  { key: "uniform_stock", label: "Uniform stock", category: "Assets & Uniforms", moduleKey: "assets", description: "Validate uniform stock rows.", duplicateKey: ["uniform_type_code", "size_label", "worksite_code"], requiredColumns: ["uniform_type_code", "size_label", "total_quantity", "available_quantity"], sensitiveColumns: [], protectedColumns: [], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "uniform_type_code", required: true }, { key: "size_label", required: true }, "worksite_code", { key: "total_quantity", required: true }, { key: "available_quantity", required: true }]) },
  { key: "contracts", label: "Contracts", category: "Contracts", moduleKey: "contracts", description: "Validate contract metadata rows.", duplicateKey: ["employee_number", "contract_number"], requiredColumns: ["employee_number", "contract_number"], sensitiveColumns: ["salary_amount"], protectedColumns: ["salary_amount"], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "contract_number", required: true }, "contract_type_code", "start_date", "end_date", { key: "salary_amount", sensitive: true }]) },
  { key: "documents_metadata", label: "Documents metadata", category: "Documents", moduleKey: "documents", description: "Validate document metadata only. R2 file upload stays in Document Tracking.", duplicateKey: ["employee_number", "document_type_code", "document_number"], requiredColumns: ["employee_number", "document_type_code"], sensitiveColumns: ["document_number"], protectedColumns: ["document_number"], createAllowed: true, updateAllowed: true, upsertAllowed: true, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "document_type_code", required: true }, { key: "document_number", sensitive: true }, "issue_date", "expiry_date", "status"]) },
  { key: "onboarding_offboarding_cases", label: "Onboarding/offboarding cases", category: "Lifecycle", moduleKey: "onboarding", description: "Placeholder until lifecycle source mapping is finalized.", duplicateKey: ["employee_number", "case_type"], requiredColumns: ["employee_number", "case_type"], sensitiveColumns: [], protectedColumns: [], createAllowed: false, updateAllowed: false, upsertAllowed: false, placeholderOnly: true, columns: cols([{ key: "employee_number", required: true }, { key: "case_type", required: true }, "status"]) }
];

const exportTypes: ExportTypeDefinition[] = [
  { key: "employees", label: "Employees", category: "Employees", moduleKey: "employees", columns: ["employee_no", "full_name", "employee_type", "employment_type", "status_id", "primary_department_id", "primary_location_id"], source: "table", table: "employees" },
  { key: "departments", label: "Departments", category: "Organization", moduleKey: "organization", columns: ["code", "name", "is_active"], source: "table", table: "departments" },
  { key: "users_roles_access_scopes", label: "Users / roles / access scopes", category: "Users & Access", moduleKey: "users", sensitive: true, columns: ["status", "message"], source: "placeholder" },
  { key: "leave_balances", label: "Leave balances", category: "Leave", moduleKey: "leave", columns: ["employee_id", "leave_type_id", "cycle_start_date", "cycle_end_date", "available_days"], source: "table", table: "leave_balance_cycles" },
  { key: "attendance", label: "Attendance", category: "Attendance", moduleKey: "attendance", columns: ["employee_id", "attendance_date", "status", "payroll_impact_status"], source: "table", table: "attendance_daily_records" },
  { key: "roster", label: "Roster", category: "Roster", moduleKey: "roster", columns: ["employee_id", "assignment_date", "status", "location_id"], source: "table", table: "roster_assignments" },
  { key: "payroll", label: "Payroll", category: "Payroll", moduleKey: "payroll", sensitive: true, columns: ["payroll_run_id", "employee_id", "gross_salary", "total_deductions", "net_salary", "status"], source: "table", table: "payroll_employee_results" },
  { key: "payslips_metadata", label: "Payslips metadata", category: "Payroll", moduleKey: "payroll", sensitive: true, columns: ["payroll_run_id", "employee_id", "status", "created_at"], source: "table", table: "payroll_payslips" },
  { key: "payment_methods", label: "Payment methods", category: "Payroll", moduleKey: "payroll", sensitive: true, columns: ["employee_id", "payment_method_type", "payment_institution_id", "bank_account_number_masked", "status"], source: "table", table: "employee_payment_methods" },
  { key: "bank_loans", label: "Bank loans", category: "Payroll", moduleKey: "payroll", sensitive: true, columns: ["employee_id", "payment_institution_id", "loan_reference_number", "monthly_installment_amount", "status"], source: "table", table: "employee_bank_loans" },
  { key: "pension", label: "Pension", category: "Payroll", moduleKey: "payroll", sensitive: true, columns: ["employee_id", "pension_scheme_id", "pension_member_id", "status"], source: "table", table: "employee_pension_profiles" },
  { key: "custom_deductions", label: "Custom deductions", category: "Payroll", moduleKey: "payroll", sensitive: true, columns: ["employee_id", "template_id", "status", "created_at"], source: "table", table: "employee_custom_deductions" },
  { key: "final_settlement", label: "Final settlement", category: "Exit Payroll", moduleKey: "final_settlement", sensitive: true, columns: ["settlement_number", "employee_id", "status", "net_settlement_amount"], source: "table", table: "final_settlement_cases" },
  { key: "contracts", label: "Contracts", category: "Contracts", moduleKey: "contracts", sensitive: true, columns: ["employee_id", "contract_number", "status", "start_date", "end_date"], source: "table", table: "employee_contracts" },
  { key: "document_compliance", label: "Document compliance", category: "Documents", moduleKey: "documents", sensitive: true, columns: ["employee_id", "document_type_id", "status", "expiry_date"], source: "table", table: "employee_documents" },
  { key: "assets_uniforms", label: "Assets / uniforms", category: "Assets", moduleKey: "assets", columns: ["employee_id", "asset_item_id", "status", "assigned_at"], source: "table", table: "employee_asset_assignments" },
  { key: "audit_security_logs", label: "Audit / security logs", category: "Audit", moduleKey: "audit", sensitive: true, columns: ["module", "action", "actor_user_id", "created_at"], source: "table", table: "audit_logs" },
  { key: "settings_summary", label: "Settings summary", category: "Admin", moduleKey: "admin", sensitive: true, columns: ["status", "message"], source: "placeholder" }
];

const qaDefaults = [
  ["login-bootstrap", "Login / bootstrap", "Access"],
  ["role-permissions", "Role permissions", "Access"],
  ["employee-creation", "Employee creation", "Employees"],
  ["document-compliance", "Document compliance", "Documents"],
  ["contract-renewal", "Contract creation / renewal", "Contracts"],
  ["leave-approval", "Leave application / approval", "Leave"],
  ["attendance-import", "Attendance import / correction", "Attendance"],
  ["roster-publish", "Roster publish", "Roster"],
  ["payroll-run", "Payroll run", "Payroll"],
  ["bank-loan-pension", "Bank loan and pension", "Payroll"],
  ["custom-deductions", "Custom deductions", "Payroll"],
  ["final-settlement", "Final settlement", "Exit Payroll"],
  ["assets-uniforms", "Asset / uniform clearance", "Assets"],
  ["self-service", "Self-service dashboard", "Self-Service"],
  ["reports-export", "Reports / export", "Reports"],
  ["admin-settings-security", "Admin settings / security", "Admin"]
] as const;

export const dataImportRoutes = new Hono<AppBindings>();
export const dataExportRoutes = new Hono<AppBindings>();
export const dataTransferAdminRoutes = new Hono<AppBindings>();

dataImportRoutes.use("*", requireAuth);
dataExportRoutes.use("*", requireAuth);
dataTransferAdminRoutes.use("*", requireAuth);

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const user = c.get("currentUser");
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "PERMISSION_DENIED", "You do not have permission to access this data transfer control.");
    await next();
  });
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  return [columns.map(csvEscape).join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
}

function parseCsvLine(line: string) {
  const output: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      output.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  output.push(current);
  return output;
}

function parseDataImportFile(input: string) {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i]?.trim() ?? "";
    });
    return { rowNumber: index + 2, row };
  });
}

function boolish(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return 1;
  if (["0", "false", "no", "n"].includes(normalized)) return 0;
  return null;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOk(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  return /^\d{4}-\d{2}-\d{2}/.test(String(value));
}

function getDataImportTypeDefinition(importType: string) {
  return importTypes.find((definition) => definition.key === importType) ?? null;
}

function getDataExportTypeDefinition(exportType: string) {
  return exportTypes.find((definition) => definition.key === exportType) ?? null;
}

function getImportDuplicateKey(definition: ImportTypeDefinition) {
  return definition.duplicateKey;
}

function getImportApplyHandler(definition: ImportTypeDefinition) {
  if (definition.placeholderOnly) return null;
  const handlers: Record<string, (db: Env["DB"], row: Record<string, unknown>) => Promise<{ id: string; before: unknown; after: unknown }>> = {
    departments: applyDepartment,
    locations: applyLocation,
    positions: applyPosition,
    employees: applyEmployee,
    payroll_profiles: applyPayrollProfile
  };
  return handlers[definition.key] ?? null;
}

function getImportAcceptedEnumValues(enumKey?: string) {
  return enumKey ? enumValues[enumKey] ?? [] : [];
}

function getImportTemplateColumnDefinitions(importType: string) {
  return getDataImportTypeDefinition(importType)?.columns ?? [];
}

function getDataImportTemplate(importType: string) {
  const definition = getDataImportTypeDefinition(importType);
  if (!definition) return null;
  return {
    ...definition,
    columns: getImportTemplateColumnDefinitions(importType).map((column) => ({ ...column, label: friendlyColumnLabel(column.key), accepted_values: getImportAcceptedEnumValues(column.enumKey) })),
    validation_notes: ["Use stable codes instead of internal IDs.", "Use YYYY-MM-DD date format.", "Required Excel headers are marked with *.", "Templates use sample data only and never include real employee data."]
  };
}

function generateCsvImportTemplate(importType: string) {
  const template = getDataImportTemplate(importType);
  if (!template) return null;
  const columns = template.columns.map((column) => column.key);
  const sample = Object.fromEntries(template.columns.map((column) => [column.key, column.sample ?? ""]));
  return toCsv(columns, [sample]);
}

async function readLookupValues(db: Env["DB"], table: string, column: string) {
  try {
    const rows = await db.prepare(`SELECT ${column} AS value FROM ${table} WHERE COALESCE(is_active, 1) = 1 ORDER BY ${column} LIMIT 500`).all<{ value: string }>();
    return rows.results.map((row) => String(row.value ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

async function getImportLookupValues(db: Env["DB"], definition: ImportTypeDefinition) {
  const lookups: Record<string, string[]> = {};
  const dynamic: Record<string, [string, string]> = {
    department_code: ["departments", "code"],
    position_code: ["positions", "code"],
    worksite_code: ["locations", "code"],
    job_level_code: ["job_levels", "code"],
    leave_type_code: ["leave_types", "code"],
    document_type_code: ["document_types", "code"],
    payment_institution_code: ["payment_institutions", "code"],
    pension_scheme_code: ["pension_schemes", "code"],
    template_code: ["custom_deduction_templates", "code"],
    contract_type_code: ["contract_types", "code"]
  };
  for (const column of definition.columns) {
    const enumValuesForColumn = getImportAcceptedEnumValues(column.enumKey);
    if (enumValuesForColumn.length) lookups[column.key] = enumValuesForColumn;
    const lookup = dynamic[column.key];
    if (lookup) {
      const values = await readLookupValues(db, lookup[0], lookup[1]);
      if (values.length) lookups[column.key] = values;
    }
  }
  if (definition.key === "employees" && lookups.department_code && (lookups.position_code || lookups.job_level_code)) {
    lookups.valid_department_job_level_position_combinations = ["Use active Department, Job Level, and Position codes. Backend validation rejects invalid combinations."];
  }
  return lookups;
}

function getColumnValidationRules(definition: ImportTypeDefinition, lookupValues: Record<string, string[]>): ExcelValidationRule[] {
  return definition.columns.flatMap((column): ExcelValidationRule[] => {
    const rules: ExcelValidationRule[] = [];
    const required = definition.requiredColumns.includes(column.key) || Boolean(column.required);
    const prompt = [required ? "Required field." : "", column.note].filter(Boolean).join(" ");
    const values = lookupValues[column.key] ?? getImportAcceptedEnumValues(column.enumKey);
    if (values.length) rules.push({ columnKey: column.key, type: "list", values, required, prompt: prompt || "Choose an allowed value from the dropdown." });
    if (/(date|joined|effective|expiry|start|end|due|period)/i.test(column.key)) rules.push({ columnKey: column.key, type: "date", required, prompt: prompt || "Use YYYY-MM-DD." });
    if (/(amount|salary|percentage|quantity|count|days|hours|minutes|balance|value|installment|principal)/i.test(column.key)) rules.push({ columnKey: column.key, type: /(count|quantity|days|hours|minutes)/i.test(column.key) ? "whole" : "decimal", required, min: 0, max: /percentage/i.test(column.key) ? 100 : 999999999, prompt: prompt || "Use a non-negative number." });
    if (/(code|number|email|phone|passport|reference|account)/i.test(column.key)) rules.push({ columnKey: column.key, type: "textLength", required, min: 0, max: 255, prompt: prompt || "Use a concise text value." });
    return rules;
  });
}

async function generateExcelImportTemplate(db: Env["DB"], importType: string) {
  const definition = getDataImportTypeDefinition(importType);
  if (!definition) return null;
  const lookupValues = await getImportLookupValues(db, definition);
  return buildXlsxTemplate({
    title: definition.label,
    instructions: [
      `${definition.label} import template.`,
      "Fill rows in the Template sheet only.",
      "Required fields are marked with *.",
      "Use YYYY-MM-DD for date fields.",
      "Dropdown fields use the hidden Lookups sheet.",
      "Do not rename columns or delete hidden lookup sheets.",
      "Upload the completed data for validation preview before applying.",
      "Backend validation remains mandatory and may reject invalid references or out-of-scope employees.",
      "For Department -> Job Level -> Position, use valid combinations from the reference data; backend validation is authoritative."
    ],
    columns: definition.columns.map((column) => ({
      key: column.key,
      label: friendlyColumnLabel(column.key),
      required: definition.requiredColumns.includes(column.key) || Boolean(column.required),
      sample: column.sample ?? "",
      note: column.note
    })),
    validations: getColumnValidationRules(definition, lookupValues),
    lookupGroups: lookupValues
  });
}

function normalizeImportRowForType(definition: ImportTypeDefinition, row: Record<string, unknown>) {
  return Object.fromEntries(definition.columns.map((column) => [column.key, typeof row[column.key] === "string" ? String(row[column.key]).trim() : row[column.key] ?? ""]));
}

async function auditDataImportAction(c: Context<AppBindings>, action: string, entityId: string | null, oldValue?: unknown, newValue?: unknown, reason?: string | null) {
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action, module: "data_import", entityType: "data_import_batch", entityId, oldValue, newValue, reason, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") ?? null });
}

async function auditDataExportAction(c: Context<AppBindings>, action: string, entityId: string | null, oldValue?: unknown, newValue?: unknown, reason?: string | null) {
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action, module: "data_export", entityType: "data_export", entityId, oldValue, newValue, reason, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") ?? null });
}

function enforceDataImportPermission(c: Context<AppBindings>, action: "view" | "upload" | "validate" | "apply" | "cancel" | "sensitive" | "manage") {
  const map = {
    view: ["data_import.view", "data_import.manage"],
    upload: ["data_import.upload", "data_import.manage"],
    validate: ["data_import.validate", "data_import.manage"],
    apply: ["data_import.apply", "data_import.manage"],
    cancel: ["data_import.cancel", "data_import.manage"],
    sensitive: ["data_import.sensitive", "data_import.manage"],
    manage: ["data_import.manage"]
  };
  return hasAny(c, map[action]);
}

function enforceDataExportPermission(c: Context<AppBindings>, action: "view" | "run" | "sensitive" | "manage") {
  const map = {
    view: ["data_export.view", "data_export.manage", "reports.view"],
    run: ["data_export.run", "data_export.manage", "reports.export"],
    sensitive: ["data_export.sensitive", "data_export.manage", "reports.export.sensitive"],
    manage: ["data_export.manage"]
  };
  return hasAny(c, map[action]);
}

function enforceSensitiveImportExportReason(settings: Record<string, unknown>, isSensitive: boolean, reason: string | null, direction: "import" | "export") {
  if (!isSensitive) return null;
  const required = direction === "import" ? settings.sensitive_import_requires_reason === 1 : settings.sensitive_export_requires_reason === 1;
  return required && !reason ? "A reason is required for sensitive import/export actions." : null;
}

async function protectAdminRecordsDuringImport(db: Env["DB"], definition: ImportTypeDefinition, row: Record<string, unknown>) {
  if (definition.key !== "users_employee_linking") return null;
  const user = await db.prepare("SELECT is_owner FROM users WHERE email = ? COLLATE NOCASE").bind(String(row.email ?? "")).first<{ is_owner: number }>();
  return user?.is_owner === 1 ? "Protected Owner/Super Admin records cannot be changed through import." : null;
}

async function getDataTransferSettings(db: Env["DB"]) {
  return await db.prepare("SELECT * FROM data_transfer_settings WHERE id = 'data_transfer_settings_default'").first<Record<string, unknown>>() ?? {
    data_import_enabled: 1,
    data_export_enabled: 1,
    max_import_rows: 5000,
    max_export_rows: 5000,
    allowed_import_file_types_json: '["csv","xlsx","text/csv","text/plain","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]',
    sensitive_import_requires_permission: 1,
    sensitive_export_requires_permission: 1,
    sensitive_import_requires_reason: 1,
    sensitive_export_requires_reason: 1,
    import_apply_requires_confirmation: 1
  };
}

async function createDataImportRowResult(db: Env["DB"], batchId: string, rowNumber: number, rawRow: Record<string, unknown>) {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO data_import_rows (id, import_batch_id, row_number, raw_row_json) VALUES (?, ?, ?, ?)").bind(id, batchId, rowNumber, JSON.stringify(rawRow)).run();
  return id;
}

async function createDataImportBatch(c: Context<AppBindings>, input: { importType: string; importMode: ImportMode; csvText: string; sourceFileName?: string | null; notes?: string | null; reason?: string | null }) {
  const definition = getDataImportTypeDefinition(input.importType);
  if (!definition) return { error: fail(c, 400, "IMPORT_TYPE_UNKNOWN", "Unknown import type.") };
  const settings = await getDataTransferSettings(c.env.DB);
  if (settings.data_import_enabled !== 1) return { error: fail(c, 403, "DATA_IMPORT_DISABLED", "Data import is disabled.") };
  if (definition.sensitiveColumns.length && settings.sensitive_import_requires_permission === 1 && !enforceDataImportPermission(c, "sensitive")) return { error: fail(c, 403, "SENSITIVE_IMPORT_PERMISSION_REQUIRED", "Sensitive import permission is required.") };
  const reasonError = enforceSensitiveImportExportReason(settings, definition.sensitiveColumns.length > 0, input.reason ?? null, "import");
  if (reasonError) return { error: fail(c, 400, "SENSITIVE_IMPORT_REASON_REQUIRED", reasonError) };
  const rows = parseDataImportFile(input.csvText);
  if (!rows.length) return { error: fail(c, 400, "IMPORT_FILE_EMPTY", "No CSV rows were found.") };
  if (rows.length > Number(settings.max_import_rows ?? 5000)) return { error: fail(c, 400, "IMPORT_ROW_LIMIT_EXCEEDED", "The import exceeds the configured row limit.") };
  const id = crypto.randomUUID();
  const batchNumber = `IMP-${Date.now()}`;
  await c.env.DB.prepare("INSERT INTO data_import_batches (id, batch_number, import_type, import_mode, source_file_name, uploaded_by_user_id, row_count, notes, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, batchNumber, definition.key, input.importMode, input.sourceFileName ?? null, c.get("currentUser").id, rows.length, input.notes ?? null, JSON.stringify({ prompt: "22", reason: input.reason ?? null }))
    .run();
  for (const row of rows) await createDataImportRowResult(c.env.DB, id, row.rowNumber, row.row);
  await auditDataImportAction(c, "data_import.uploaded", id, undefined, { import_type: definition.key, row_count: rows.length }, input.reason ?? null);
  return { batch: await getDataImportBatchSummary(c.env.DB, id) };
}

async function lookupId(db: Env["DB"], table: string, column: string, value: unknown) {
  if (!value) return null;
  const row = await db.prepare(`SELECT id FROM ${table} WHERE ${column} = ? COLLATE NOCASE LIMIT 1`).bind(String(value)).first<{ id: string }>();
  return row?.id ?? null;
}

async function validateImportForeignReferences(db: Env["DB"], definition: ImportTypeDefinition, row: Record<string, unknown>) {
  const errors: string[] = [];
  const refs: Record<string, string | null> = {};
  const pairs = [
    ["employee_number", "employees", "employee_no", "employee_id", "Employee number"],
    ["department_code", "departments", "code", "department_id", "Department code"],
    ["position_code", "positions", "code", "position_id", "Position code"],
    ["worksite_code", "locations", "code", "location_id", "Worksite code"],
    ["job_level_code", "job_levels", "code", "job_level_id", "Job level code"],
    ["payment_institution_code", "payment_institutions", "code", "payment_institution_id", "Payment institution code"],
    ["leave_type_code", "leave_types", "code", "leave_type_id", "Leave type code"],
    ["document_type_code", "document_types", "code", "document_type_id", "Document type code"]
  ] as const;
  for (const [field, table, column, outKey, label] of pairs) {
    if (row[field]) {
      const id = await lookupId(db, table, column, row[field]);
      refs[outKey] = id;
      if (!id) errors.push(`${label} '${String(row[field])}' was not found.`);
    }
  }
  if (definition.key === "employees" && row.status) refs.status_id = await lookupId(db, "employee_statuses", "key", row.status);
  return { errors, refs };
}

function validateImportEnums(definition: ImportTypeDefinition, row: Record<string, unknown>) {
  const errors: string[] = [];
  for (const column of definition.columns) {
    const accepted = getImportAcceptedEnumValues(column.enumKey).map((value) => value.toLowerCase());
    const value = String(row[column.key] ?? "").trim();
    if (accepted.length && value && !accepted.includes(value.toLowerCase())) errors.push(`${column.key} must be one of ${getImportAcceptedEnumValues(column.enumKey).join(", ")}.`);
  }
  return errors;
}

async function validateImportProtectedRules(db: Env["DB"], user: AuthUser, definition: ImportTypeDefinition, row: Record<string, unknown>) {
  const errors: string[] = [];
  const protectedError = await protectAdminRecordsDuringImport(db, definition, row);
  if (protectedError) errors.push(protectedError);
  if (row.employee_number) {
    const employee = await db.prepare("SELECT id FROM employees WHERE employee_no = ? COLLATE NOCASE").bind(String(row.employee_number)).first<{ id: string }>();
    if (employee && !(await canAccessEmployee(db, user, employee.id, definition.moduleKey, "manage"))) errors.push("Employee is outside your access scope.");
  }
  if (definition.key === "employees" && row.status && ["EXITED", "TERMINATED", "DISABLED", "LOCKED"].includes(String(row.status).toUpperCase())) errors.push("Employee exit/deactivation statuses must use the employee status workflow.");
  return errors;
}

async function validateImportRow(db: Env["DB"], user: AuthUser, definition: ImportTypeDefinition, row: Record<string, unknown>, seenKeys: Set<string>) {
  const normalized = normalizeImportRowForType(definition, row);
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const column of definition.requiredColumns) if (!normalized[column]) errors.push(`${column} is required.`);
  for (const [key, value] of Object.entries(normalized)) {
    if ((key.endsWith("_date") || key.includes("date")) && !dateOk(value)) errors.push(`${key} must use YYYY-MM-DD format.`);
    if (/(amount|salary|quantity|balance_days)/.test(key) && value !== "" && (numberValue(value) === null || Number(value) < 0)) errors.push(`${key} must be a valid non-negative number.`);
  }
  errors.push(...validateImportEnums(definition, normalized));
  const refs = await validateImportForeignReferences(db, definition, normalized);
  errors.push(...refs.errors);
  errors.push(...(await validateImportProtectedRules(db, user, definition, normalized)));
  const duplicateKey = getImportDuplicateKey(definition).map((key) => String(normalized[key] ?? "").toLowerCase()).join("|");
  const duplicate = duplicateKey.replace(/\|/g, "").length > 0 && seenKeys.has(duplicateKey);
  if (duplicate) errors.push("Duplicate row detected.");
  seenKeys.add(duplicateKey);
  if (definition.placeholderOnly) warnings.push("Validated here; apply is reserved for the module-specific workflow.");
  const validationStatus: RowValidationStatus = errors.length ? duplicate ? "DUPLICATE" : "INVALID" : warnings.length ? "WARNING" : "VALID";
  const action = errors.length ? "ERROR" : definition.placeholderOnly ? "WARNING" : "SKIP";
  return { normalized: { ...normalized, ...refs.refs }, errors, warnings, validationStatus, action };
}

function buildImportValidationPreview(batch: ImportBatchRow, rows: ImportResultRow[]) {
  return { batch_id: batch.id, batch_number: batch.batch_number, import_type: batch.import_type, status: batch.status, total_rows: batch.row_count, valid_rows: batch.valid_row_count, invalid_rows: batch.invalid_row_count, duplicate_rows: batch.duplicate_count, warnings: batch.warning_count, create_rows: batch.create_count, update_rows: batch.update_count, skipped_rows: batch.skipped_count, rows: rows.map(rowToApi) };
}

function generateImportErrorCsv(rows: ImportResultRow[]) {
  const reportRows = rows.flatMap((row) => {
    const raw = parseJson<Record<string, unknown>>(row.raw_row_json, {});
    const messages = String(row.error_message ?? row.validation_status ?? "").split(/(?<=\.)\s+/).filter(Boolean);
    return (messages.length ? messages : [String(row.validation_status)]).map((message) => validationMessageToIssue(row.row_number, message, raw));
  });
  return buildCsv(["row_number", "column_name", "submitted_value", "error_message", "severity", "suggested_correction"], reportRows);
}

async function validateDataImportBatch(db: Env["DB"], user: AuthUser, batchId: string) {
  const batch = await db.prepare("SELECT * FROM data_import_batches WHERE id = ?").bind(batchId).first<ImportBatchRow>();
  if (!batch) return null;
  const definition = getDataImportTypeDefinition(batch.import_type);
  if (!definition) throw new Error("Unknown import type.");
  await db.prepare("UPDATE data_import_batches SET status = 'VALIDATING', updated_at = ? WHERE id = ?").bind(now(), batchId).run();
  const rows = await db.prepare("SELECT * FROM data_import_rows WHERE import_batch_id = ? ORDER BY row_number").bind(batchId).all<ImportResultRow>();
  const seen = new Set<string>();
  const summary = { valid: 0, invalid: 0, warning: 0, duplicate: 0, create: 0, update: 0, skipped: 0, errors: 0 };
  const processedRows: Array<{ row_number?: number; errors?: string[] }> = [];
  for (const row of rows.results) {
    const result = await validateImportRow(db, user, definition, parseJson(row.raw_row_json, {}), seen);
    processedRows.push({ row_number: row.row_number, errors: result.errors });
    if (result.validationStatus === "VALID") summary.valid += 1;
    if (result.validationStatus === "WARNING") summary.warning += 1;
    if (result.validationStatus === "INVALID") summary.invalid += 1;
    if (result.validationStatus === "DUPLICATE") summary.duplicate += 1;
    if (result.action === "WARNING") summary.skipped += 1;
    if (result.action === "ERROR") summary.errors += 1;
    await db.prepare("UPDATE data_import_rows SET normalized_row_json = ?, target_entity_type = ?, action = ?, validation_status = ?, error_code = ?, error_message = ?, warning_json = ?, metadata_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(result.normalized), definition.key, result.action, result.validationStatus, result.errors.length ? "VALIDATION_ERROR" : null, result.errors.join(" ") || null, result.warnings.length ? JSON.stringify(result.warnings) : null, JSON.stringify({ sensitive: definition.sensitiveColumns.some((column) => result.normalized[column]) }), now(), row.id)
      .run();
  }
  const sharedIssues = validateImportRows(processedRows);
  if (sharedIssues.length) summary.errors = Math.max(summary.errors, sharedIssues.length);
  const status: ImportStatus = summary.invalid || summary.duplicate ? "VALIDATION_FAILED" : "READY_TO_APPLY";
  await db.prepare("UPDATE data_import_batches SET status = ?, validated_by_user_id = ?, validated_at = ?, valid_row_count = ?, invalid_row_count = ?, warning_count = ?, duplicate_count = ?, create_count = ?, update_count = ?, skipped_count = ?, error_count = ?, validation_summary_json = ?, updated_at = ? WHERE id = ?")
    .bind(status, user.id, now(), summary.valid, summary.invalid, summary.warning, summary.duplicate, summary.create, summary.update, summary.skipped, summary.errors, JSON.stringify(summary), now(), batchId)
    .run();
  return getDataImportBatchSummary(db, batchId);
}

async function applyDepartment(db: Env["DB"], row: Record<string, unknown>) {
  const existing = await db.prepare("SELECT * FROM departments WHERE code = ? COLLATE NOCASE").bind(String(row.department_code)).first<Record<string, unknown>>();
  const id = String(existing?.id ?? crypto.randomUUID());
  await db.prepare("INSERT INTO departments (id, code, name, description, is_active) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, is_active = excluded.is_active, updated_at = ?")
    .bind(id, row.department_code, row.name, row.description ?? null, boolish(row.is_active) ?? 1, now()).run();
  return { id, before: existing, after: row };
}

async function applyLocation(db: Env["DB"], row: Record<string, unknown>) {
  const existing = await db.prepare("SELECT * FROM locations WHERE code = ? COLLATE NOCASE").bind(String(row.worksite_code)).first<Record<string, unknown>>();
  const id = String(existing?.id ?? crypto.randomUUID());
  await db.prepare("INSERT INTO locations (id, code, name, type, island_city, address, is_active) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, island_city = excluded.island_city, address = excluded.address, is_active = excluded.is_active, updated_at = ?")
    .bind(id, row.worksite_code, row.name, row.type || "OUTLET", row.island_city ?? null, row.address ?? null, boolish(row.is_active) ?? 1, now()).run();
  return { id, before: existing, after: row };
}

async function applyPosition(db: Env["DB"], row: Record<string, unknown>) {
  const existing = await db.prepare("SELECT * FROM positions WHERE code = ? COLLATE NOCASE").bind(String(row.position_code)).first<Record<string, unknown>>();
  const id = String(existing?.id ?? crypto.randomUUID());
  await db.prepare("INSERT INTO positions (id, code, title, department_id, level_id, description, is_active) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, department_id = excluded.department_id, level_id = excluded.level_id, description = excluded.description, is_active = excluded.is_active, updated_at = ?")
    .bind(id, row.position_code, row.title, row.department_id ?? null, row.job_level_id ?? null, row.description ?? null, boolish(row.is_active) ?? 1, now()).run();
  return { id, before: existing, after: row };
}

async function applyEmployee(db: Env["DB"], row: Record<string, unknown>) {
  const existing = await db.prepare("SELECT * FROM employees WHERE employee_no = ? COLLATE NOCASE").bind(String(row.employee_number)).first<Record<string, unknown>>();
  const active = await db.prepare("SELECT id FROM employee_statuses WHERE key = 'ACTIVE'").first<{ id: string }>();
  const id = String(existing?.id ?? crypto.randomUUID());
  await db.prepare("INSERT INTO employees (id, employee_no, full_name, display_name, employee_type, employment_type, status_id, primary_department_id, primary_position_id, primary_location_id, joining_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(employee_no) DO UPDATE SET full_name = excluded.full_name, display_name = excluded.display_name, employee_type = excluded.employee_type, employment_type = excluded.employment_type, primary_department_id = excluded.primary_department_id, primary_position_id = excluded.primary_position_id, primary_location_id = excluded.primary_location_id, joining_date = excluded.joining_date, updated_at = ?")
    .bind(id, row.employee_number, row.full_name, row.display_name ?? row.full_name, row.employee_type || "LOCAL", row.employment_type || "FULL_TIME", row.status_id || active?.id, row.department_id ?? null, row.position_id ?? null, row.location_id ?? null, row.joined_date ?? null, now()).run();
  return { id, before: existing, after: row };
}

async function applyPayrollProfile(db: Env["DB"], row: Record<string, unknown>) {
  const employee = await db.prepare("SELECT id FROM employees WHERE employee_no = ? COLLATE NOCASE").bind(String(row.employee_number)).first<{ id: string }>();
  if (!employee) throw new Error("Employee was not found.");
  const existing = await db.prepare("SELECT * FROM employee_payroll_profiles WHERE employee_id = ?").bind(employee.id).first<Record<string, unknown>>();
  const id = String(existing?.id ?? crypto.randomUUID());
  await db.prepare("INSERT INTO employee_payroll_profiles (id, employee_id, basic_salary, currency, payment_method, payroll_included) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(employee_id) DO UPDATE SET basic_salary = excluded.basic_salary, currency = excluded.currency, payment_method = excluded.payment_method, payroll_included = excluded.payroll_included, updated_at = ?")
    .bind(id, employee.id, numberValue(row.basic_salary) ?? Number(existing?.basic_salary ?? 0), row.currency || "MVR", row.payment_method || "CASH", boolish(row.payroll_included) ?? 1, now()).run();
  return { id, before: existing, after: { ...row, basic_salary: row.basic_salary ? "[masked]" : row.basic_salary } };
}

async function applyDataImportBatch(db: Env["DB"], user: AuthUser, batchId: string) {
  const batch = await db.prepare("SELECT * FROM data_import_batches WHERE id = ?").bind(batchId).first<ImportBatchRow>();
  if (!batch) return null;
  if (["APPLIED", "APPLIED_WITH_WARNINGS"].includes(batch.status)) throw new Error("This import batch has already been applied.");
  if (batch.status !== "READY_TO_APPLY") throw new Error("Validate this import batch before applying.");
  if (batch.import_mode === "VALIDATE_ONLY") throw new Error("Validate-only batches cannot be applied.");
  const definition = getDataImportTypeDefinition(batch.import_type);
  if (!definition) throw new Error("Unknown import type.");
  const handler = getImportApplyHandler(definition);
  const rows = await db.prepare("SELECT * FROM data_import_rows WHERE import_batch_id = ? ORDER BY row_number").bind(batchId).all<ImportResultRow>();
  const summary = { applied: 0, skipped: 0, failed: 0, placeholder: !handler };
  await db.prepare("UPDATE data_import_batches SET status = 'APPLYING', updated_at = ? WHERE id = ?").bind(now(), batchId).run();
  for (const row of rows.results) {
    if (!["VALID", "WARNING"].includes(row.validation_status) || !handler) {
      await db.prepare("UPDATE data_import_rows SET apply_status = 'SKIPPED', error_code = COALESCE(error_code, ?), error_message = COALESCE(error_message, ?), updated_at = ? WHERE id = ?").bind(handler ? null : "APPLY_HANDLER_PLACEHOLDER", handler ? null : "Apply is reserved for the module-specific handler.", now(), row.id).run();
      summary.skipped += 1;
      continue;
    }
    try {
      const result = await handler(db, parseJson(row.normalized_row_json, {}));
      await db.prepare("UPDATE data_import_rows SET apply_status = 'APPLIED', target_entity_id = ?, before_snapshot_json = ?, after_snapshot_json = ?, updated_at = ? WHERE id = ?").bind(result.id, JSON.stringify(result.before ?? null), JSON.stringify(result.after ?? null), now(), row.id).run();
      summary.applied += 1;
    } catch (error) {
      await db.prepare("UPDATE data_import_rows SET apply_status = 'FAILED', error_code = 'APPLY_FAILED', error_message = ?, updated_at = ? WHERE id = ?").bind(error instanceof Error ? error.message : "Apply failed.", now(), row.id).run();
      summary.failed += 1;
    }
  }
  const status: ImportStatus = summary.failed ? "FAILED" : summary.skipped ? "APPLIED_WITH_WARNINGS" : "APPLIED";
  await db.prepare("UPDATE data_import_batches SET status = ?, applied_by_user_id = ?, applied_at = ?, apply_summary_json = ?, updated_at = ? WHERE id = ?").bind(status, user.id, now(), JSON.stringify(summary), now(), batchId).run();
  return getDataImportBatchSummary(db, batchId);
}

async function cancelDataImportBatch(db: Env["DB"], user: AuthUser, batchId: string, reason: string | null) {
  const batch = await db.prepare("SELECT status FROM data_import_batches WHERE id = ?").bind(batchId).first<{ status: ImportStatus }>();
  if (!batch) return null;
  if (["APPLIED", "APPLIED_WITH_WARNINGS"].includes(batch.status)) throw new Error("Applied batches cannot be cancelled.");
  await db.prepare("UPDATE data_import_batches SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(user.id, now(), reason, now(), batchId).run();
  return getDataImportBatchSummary(db, batchId);
}

function rowToApi(row: ImportResultRow) {
  return { ...row, raw_row: parseJson(row.raw_row_json, {}), normalized_row: parseJson(row.normalized_row_json, {}), warnings: parseJson(row.warning_json, []), metadata: parseJson(row.metadata_json, {}) };
}

async function getDataImportBatchSummary(db: Env["DB"], batchId: string) {
  const batch = await db.prepare("SELECT * FROM data_import_batches WHERE id = ?").bind(batchId).first<ImportBatchRow>();
  return batch ? { ...batch, validation_summary: parseJson(batch.validation_summary_json, {}), apply_summary: parseJson(batch.apply_summary_json, {}), metadata: parseJson(batch.metadata_json, {}) } : null;
}

function validateDataExportPermission(c: Context<AppBindings>, definition: ExportTypeDefinition, reason?: string | null) {
  if (!enforceDataExportPermission(c, "run")) return "You do not have permission to run exports.";
  if (definition.sensitive && !enforceDataExportPermission(c, "sensitive")) return "This export includes sensitive data and requires sensitive export permission.";
  return enforceSensitiveImportExportReason({ sensitive_export_requires_reason: 1 }, Boolean(definition.sensitive), reason ?? null, "export");
}

function applyDataExportSensitiveMasking(definition: ExportTypeDefinition, row: Record<string, unknown>, canSeeSensitive: boolean) {
  if (!definition.sensitive || canSeeSensitive) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, /(salary|amount|loan|account|pension|settlement|document|audit|email)/i.test(key) ? "Restricted" : value]));
}

async function runDataExport(c: Context<AppBindings>, exportType: string, input: { reason?: string | null; format?: ExportFormat | string | null }) {
  const definition = getDataExportTypeDefinition(exportType);
  if (!definition) return { error: fail(c, 400, "EXPORT_TYPE_UNKNOWN", "Unknown export type.") };
  const settings = await getDataTransferSettings(c.env.DB);
  if (settings.data_export_enabled !== 1) return { error: fail(c, 403, "DATA_EXPORT_DISABLED", "Data export is disabled.") };
  const permissionError = validateDataExportPermission(c, definition, input.reason ?? null);
  if (permissionError) return { error: fail(c, 403, "EXPORT_PERMISSION_DENIED", permissionError) };
  const maxRows = Number(settings.max_export_rows ?? 5000);
  let rows: Record<string, unknown>[] = [];
  if (definition.source === "table" && definition.table) {
    rows = (await c.env.DB.prepare(`SELECT ${definition.columns.join(", ")} FROM ${definition.table} LIMIT ?`).bind(maxRows).all<Record<string, unknown>>()).results;
  } else if (definition.source === "report_export_logs") {
    rows = (await c.env.DB.prepare("SELECT report_key, report_name, export_format, row_count, status, requested_at FROM report_export_logs ORDER BY requested_at DESC LIMIT ?").bind(maxRows).all<Record<string, unknown>>()).results;
  } else {
    rows = [{ status: "PLACEHOLDER", message: "This export type uses existing module-specific export/report foundations." }];
  }
  const maskedRows = rows.map((row) => applyDataExportSensitiveMasking(definition, row, enforceDataExportPermission(c, "sensitive")));
  const exportId = crypto.randomUUID();
  const format = normalizeExportFormat(input.format);
  const fileName = `hrm-v2-${definition.key}-export.${format}`;
  await c.env.DB.prepare("INSERT INTO report_export_logs (id, report_key, report_name, export_format, filter_snapshot_json, row_count, requested_by_user_id, completed_at, status, file_name, sensitive_export, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?)")
    .bind(exportId, `data-export/${definition.key}`, definition.label, format.toUpperCase(), JSON.stringify({ source: "data_export_center", reason: input.reason ?? null }), maskedRows.length, c.get("currentUser").id, now(), fileName, definition.sensitive ? 1 : 0, JSON.stringify({ prompt: "22", formats: ["csv", "xlsx", "pdf"] }))
    .run();
  await auditDataExportAction(c, definition.sensitive ? "data_export.sensitive_run" : "data_export.run", exportId, undefined, { export_type: definition.key, row_count: maskedRows.length }, input.reason ?? null);
  return { export: { id: exportId, type: definition, rows: maskedRows, csv_text: buildCsv(definition.columns, maskedRows), file_name: fileName, export_format: format, placeholder: definition.source === "placeholder" } };
}

function normalizeExportFormat(value: unknown): ExportFormat {
  const format = String(value ?? "csv").toLowerCase();
  return format === "xlsx" || format === "pdf" ? format : "csv";
}

function exportResponse(definition: ExportTypeDefinition, rows: Record<string, unknown>[], format: ExportFormat, fileName: string) {
  if (format === "xlsx") {
    return new Response(buildXlsxReport(definition.label, definition.columns, rows, [`Module: ${definition.moduleKey}`]), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  }
  if (format === "pdf") {
    return new Response(buildPdfReport(definition.label, definition.columns, rows, [`Module: ${definition.moduleKey}`]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  }
  return new Response(buildCsv(definition.columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`
    }
  });
}

async function getImportBody(c: Context<AppBindings>) {
  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.raw.formData();
    const file = form.get("file");
    return {
      import_type: String(form.get("import_type") ?? ""),
      import_mode: String(form.get("import_mode") ?? "VALIDATE_ONLY"),
      csv_text: file instanceof File ? await file.text() : String(form.get("csv_text") ?? ""),
      source_file_name: file instanceof File ? file.name : String(form.get("source_file_name") ?? ""),
      notes: String(form.get("notes") ?? ""),
      reason: String(form.get("reason") ?? "")
    };
  }
  return readJsonBody(c.req.raw) as Promise<Record<string, unknown>>;
}

function actionGuide(command: string, note: string) {
  return { command, note, browser_executable: false };
}

dataImportRoutes.get("/types", requireAnyPermission(["data_import.view", "data_import.manage"]), (c) => ok(c, { types: importTypes }));
dataImportRoutes.get("/templates", requireAnyPermission(["data_import.view", "data_import.manage"]), (c) => ok(c, { templates: importTypes.map((definition) => getDataImportTemplate(definition.key)) }));
dataImportRoutes.get("/templates/:importType", requireAnyPermission(["data_import.view", "data_import.manage"]), (c) => {
  const template = getDataImportTemplate(c.req.param("importType"));
  return template ? ok(c, { template }) : fail(c, 404, "IMPORT_TYPE_NOT_FOUND", "Import template not found.");
});
dataImportRoutes.get("/templates/:importType/download", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => {
  const csv = generateCsvImportTemplate(c.req.param("importType"));
  if (!csv) return fail(c, 404, "IMPORT_TYPE_NOT_FOUND", "Import template not found.");
  await auditDataImportAction(c, "data_import.template_downloaded", c.req.param("importType"));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hrm-v2-${c.req.param("importType")}-import-template.csv"` } });
});
dataImportRoutes.get("/templates/:importType/download.xlsx", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => {
  const xlsx = await generateExcelImportTemplate(c.env.DB, c.req.param("importType"));
  if (!xlsx) return fail(c, 404, "IMPORT_TYPE_NOT_FOUND", "Import template not found.");
  await auditDataImportAction(c, "data_import.excel_template_downloaded", c.req.param("importType"));
  return new Response(xlsx, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="hrm-v2-${c.req.param("importType")}-import-template.xlsx"` } });
});
dataImportRoutes.get("/batches", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => ok(c, { batches: (await c.env.DB.prepare("SELECT * FROM data_import_batches ORDER BY created_at DESC LIMIT 100").all<ImportBatchRow>()).results }));
dataImportRoutes.get("/batches/:batchId", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => {
  const batch = await getDataImportBatchSummary(c.env.DB, c.req.param("batchId"));
  if (!batch) return fail(c, 404, "IMPORT_BATCH_NOT_FOUND", "Import batch not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM data_import_rows WHERE import_batch_id = ? ORDER BY row_number LIMIT 200").bind(c.req.param("batchId")).all<ImportResultRow>();
  return ok(c, { batch, rows: rows.results.map(rowToApi), rollback_placeholder: "Automatic rollback is not available in this phase. Use row-level results and module history/audit to manually reverse changes if needed." });
});
dataImportRoutes.post("/batches", requireAnyPermission(["data_import.upload", "data_import.manage"]), async (c) => {
  const body = await getImportBody(c);
  const importType = readString(body.import_type);
  const importMode = IMPORT_MODES.includes(body.import_mode as ImportMode) ? body.import_mode as ImportMode : "VALIDATE_ONLY";
  const result = await createDataImportBatch(c, { importType, importMode, csvText: String(body.csv_text ?? ""), sourceFileName: readString(body.source_file_name), notes: readString(body.notes), reason: readString(body.reason) });
  if ("error" in result) return result.error;
  return ok(c, { batch: result.batch }, 201);
});
dataImportRoutes.post("/batches/:batchId/validate", requireAnyPermission(["data_import.validate", "data_import.manage"]), async (c) => {
  const batch = await validateDataImportBatch(c.env.DB, c.get("currentUser"), c.req.param("batchId"));
  if (!batch) return fail(c, 404, "IMPORT_BATCH_NOT_FOUND", "Import batch not found.");
  await auditDataImportAction(c, "data_import.validated", c.req.param("batchId"), undefined, batch);
  return ok(c, { batch });
});
dataImportRoutes.get("/batches/:batchId/validation-preview", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => {
  const batch = await c.env.DB.prepare("SELECT * FROM data_import_batches WHERE id = ?").bind(c.req.param("batchId")).first<ImportBatchRow>();
  if (!batch) return fail(c, 404, "IMPORT_BATCH_NOT_FOUND", "Import batch not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM data_import_rows WHERE import_batch_id = ? ORDER BY row_number LIMIT 300").bind(c.req.param("batchId")).all<ImportResultRow>();
  return ok(c, { preview: buildImportValidationPreview(batch, rows.results) });
});
dataImportRoutes.post("/batches/:batchId/apply", requireAnyPermission(["data_import.apply", "data_import.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as { acknowledgement?: string; reason?: string };
  if ((await getDataTransferSettings(c.env.DB)).import_apply_requires_confirmation === 1 && body.acknowledgement !== "APPLY") return fail(c, 400, "IMPORT_APPLY_CONFIRMATION_REQUIRED", "Type APPLY before applying this import batch.");
  try {
    const batch = await applyDataImportBatch(c.env.DB, c.get("currentUser"), c.req.param("batchId"));
    if (!batch) return fail(c, 404, "IMPORT_BATCH_NOT_FOUND", "Import batch not found.");
    await auditDataImportAction(c, "data_import.applied", c.req.param("batchId"), undefined, batch, body.reason ?? null);
    return ok(c, { batch });
  } catch (error) {
    return fail(c, 400, "IMPORT_APPLY_FAILED", error instanceof Error ? error.message : "Unable to apply import batch.");
  }
});
dataImportRoutes.post("/batches/:batchId/cancel", requireAnyPermission(["data_import.cancel", "data_import.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as { reason?: string };
  try {
    const batch = await cancelDataImportBatch(c.env.DB, c.get("currentUser"), c.req.param("batchId"), body.reason ?? null);
    if (!batch) return fail(c, 404, "IMPORT_BATCH_NOT_FOUND", "Import batch not found.");
    await auditDataImportAction(c, "data_import.cancelled", c.req.param("batchId"), undefined, batch, body.reason ?? null);
    return ok(c, { batch });
  } catch (error) {
    return fail(c, 400, "IMPORT_CANCEL_FAILED", error instanceof Error ? error.message : "Unable to cancel import batch.");
  }
});
dataImportRoutes.get("/batches/:batchId/errors", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => ok(c, { errors: (await c.env.DB.prepare("SELECT * FROM data_import_rows WHERE import_batch_id = ? AND validation_status IN ('INVALID','DUPLICATE') ORDER BY row_number").bind(c.req.param("batchId")).all<ImportResultRow>()).results.map(rowToApi) }));
dataImportRoutes.get("/batches/:batchId/results", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => ok(c, { results: (await c.env.DB.prepare("SELECT * FROM data_import_rows WHERE import_batch_id = ? ORDER BY row_number").bind(c.req.param("batchId")).all<ImportResultRow>()).results.map(rowToApi) }));
dataImportRoutes.get("/batches/:batchId/errors/download", requireAnyPermission(["data_import.view", "data_import.manage"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT * FROM data_import_rows WHERE import_batch_id = ? AND validation_status IN ('INVALID','DUPLICATE') ORDER BY row_number").bind(c.req.param("batchId")).all<ImportResultRow>()).results;
  return new Response(generateImportErrorCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hrm-v2-import-errors-${c.req.param("batchId")}.csv"` } });
});

dataExportRoutes.get("/types", requireAnyPermission(["data_export.view", "data_export.manage", "reports.view"]), (c) => ok(c, { types: exportTypes }));
dataExportRoutes.post("/:exportType/run", requireAnyPermission(["data_export.run", "data_export.manage", "reports.export"]), async (c) => {
  const result = await runDataExport(c, c.req.param("exportType"), await readJsonBody(c.req.raw) as { reason?: string });
  if ("error" in result) return result.error;
  return ok(c, result);
});
dataExportRoutes.post("/:exportType/download", requireAnyPermission(["data_export.run", "data_export.manage", "reports.export"]), async (c) => {
  const input = await readJsonBody(c.req.raw) as { reason?: string; format?: string };
  const result = await runDataExport(c, c.req.param("exportType"), input);
  if ("error" in result) return result.error;
  const definition = getDataExportTypeDefinition(c.req.param("exportType"));
  if (!definition) return fail(c, 400, "EXPORT_TYPE_UNKNOWN", "Unknown export type.");
  const format = normalizeExportFormat(input.format);
  return exportResponse(definition, result.export.rows as Record<string, unknown>[], format, result.export.file_name as string);
});
dataExportRoutes.get("/history", requireAnyPermission(["data_export.view", "data_export.manage", "reports.export.history.view"]), async (c) => ok(c, { history: (await c.env.DB.prepare("SELECT * FROM report_export_logs WHERE report_key LIKE 'data-export/%' ORDER BY requested_at DESC LIMIT 100").all<Record<string, unknown>>()).results }));
dataExportRoutes.get("/history/:exportId", requireAnyPermission(["data_export.view", "data_export.manage", "reports.export.history.view"]), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM report_export_logs WHERE id = ?").bind(c.req.param("exportId")).first<Record<string, unknown>>();
  return row ? ok(c, { export: row }) : fail(c, 404, "EXPORT_HISTORY_NOT_FOUND", "Export history record not found.");
});

dataTransferAdminRoutes.get("/data-transfer/settings", requireAnyPermission(["data_transfer.settings.view", "data_transfer.settings.manage"]), async (c) => ok(c, { settings: await getDataTransferSettings(c.env.DB) }));
dataTransferAdminRoutes.patch("/data-transfer/settings", requireAnyPermission(["data_transfer.settings.update", "data_transfer.settings.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  const oldSettings = await getDataTransferSettings(c.env.DB);
  const fields = ["data_import_enabled", "data_export_enabled", "max_import_rows", "max_export_rows", "csv_import_enabled", "csv_export_enabled", "sensitive_import_requires_permission", "sensitive_export_requires_permission", "sensitive_import_requires_reason", "sensitive_export_requires_reason", "import_apply_requires_confirmation", "export_audit_enabled", "import_audit_enabled", "rollback_placeholder_enabled"];
  await c.env.DB.prepare(`INSERT INTO data_transfer_settings (id, ${fields.join(", ")}, allowed_import_file_types_json, updated_at) VALUES ('data_transfer_settings_default', ${fields.map(() => "?").join(", ")}, ?, ?) ON CONFLICT(id) DO UPDATE SET ${fields.map((field) => `${field} = excluded.${field}`).join(", ")}, allowed_import_file_types_json = excluded.allowed_import_file_types_json, updated_at = excluded.updated_at`)
    .bind(...fields.map((field) => body[field] ?? oldSettings[field] ?? null), JSON.stringify(body.allowed_import_file_types ?? parseJson(oldSettings.allowed_import_file_types_json as string | null, ["csv", "text/csv", "text/plain"])), now()).run();
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action: "data_transfer.settings.updated", module: "data_transfer", entityType: "data_transfer_settings", entityId: "data_transfer_settings_default", oldValue: oldSettings, newValue: body, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") ?? null });
  return ok(c, { settings: await getDataTransferSettings(c.env.DB) });
});

dataTransferAdminRoutes.get("/backup-readiness", requireAnyPermission(["backup.readiness.view", "backup.readiness.manage"]), async (c) => ok(c, { checklist: [actionGuide("npx wrangler d1 export hrm-v2 --remote --output backup.sql", "Run from a trusted CLI; browser restore is not available."), actionGuide("npx wrangler r2 object get ...", "Use Cloudflare/R2 tooling for document backup verification."), actionGuide("npm run audit:remote-schema", "Capture schema readiness before production changes.")], records: (await c.env.DB.prepare("SELECT * FROM backup_readiness_records ORDER BY recorded_at DESC LIMIT 100").all<Record<string, unknown>>()).results }));
dataTransferAdminRoutes.post("/backup-readiness/records", requireAnyPermission(["backup.readiness.update", "backup.readiness.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO backup_readiness_records (id, backup_type, status, recorded_by_user_id, backup_reference, notes, checklist_json, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, body.backup_type ?? "D1_DATABASE", body.status ?? "PLANNED", c.get("currentUser").id, body.backup_reference ?? null, body.notes ?? null, JSON.stringify(body.checklist ?? []), JSON.stringify({ prompt: "22" })).run();
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action: "backup.readiness.recorded", module: "backup", entityType: "backup_readiness_record", entityId: id, newValue: body, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") ?? null });
  return ok(c, { id }, 201);
});
dataTransferAdminRoutes.patch("/backup-readiness/records/:recordId", requireAnyPermission(["backup.readiness.update", "backup.readiness.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  await c.env.DB.prepare("UPDATE backup_readiness_records SET status = COALESCE(?, status), backup_reference = COALESCE(?, backup_reference), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").bind(body.status ?? null, body.backup_reference ?? null, body.notes ?? null, now(), c.req.param("recordId")).run();
  return ok(c, { updated: true });
});
dataTransferAdminRoutes.get("/migration-readiness", requireAnyPermission(["migration.readiness.view", "migration.readiness.manage"]), (c) => ok(c, { checklist: ["Restore from D1 backup outside browser", "Apply database/schema.sql", "Apply database/seed.sql", "Verify remote schema readiness", "Run production readiness check", "Run smoke tests", "Verify R2 documents", "Verify Super Admin login", "Verify payroll/final settlement critical data", "Verify document access", "Verify self-service login", "Verify ZKTeco import state"], warning: "Guidance/status only. Destructive restore is not available from the browser." }));
dataTransferAdminRoutes.post("/migration-readiness/record-check", requireAnyPermission(["migration.readiness.update", "migration.readiness.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action: "migration.readiness.record_check", module: "migration", entityType: "migration_readiness", entityId: readString(body.check_key) || null, newValue: body, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") ?? null });
  return ok(c, { recorded: true });
});
dataTransferAdminRoutes.get("/remote-d1-apply-guide", requireAnyPermission(["migration.readiness.view", "deployment.readiness.view", "admin.environment_safety.view"]), (c) => ok(c, { warning: "No remote repair/apply/deploy command can be run from the browser.", steps: [actionGuide("npm run audit:remote-schema", "Audit remote D1."), actionGuide("npm run generate:remote-schema-repair", "Generate repair SQL."), actionGuide("npm run apply:remote-schema-repair", "Apply reviewed repair from trusted CLI only."), actionGuide("npm run verify:remote-schema-ready", "Verify readiness."), actionGuide("npx wrangler d1 execute hrm-v2 --remote --config worker/wrangler.toml --file database/schema.sql", "Apply schema.sql."), actionGuide("npx wrangler d1 execute hrm-v2 --remote --config worker/wrangler.toml --file database/seed.sql", "Apply seed.sql."), actionGuide("npm run smoke:production-readiness", "Run safe local smoke readiness."), actionGuide("npx wrangler deploy --dry-run", "Validate Worker deploy.") ] }));
dataTransferAdminRoutes.get("/qa-test-matrix", requireAnyPermission(["qa.checklist.view", "qa.checklist.manage"]), async (c) => ok(c, { items: (await c.env.DB.prepare("SELECT * FROM qa_test_matrix_items ORDER BY category, test_name").all<Record<string, unknown>>()).results }));
dataTransferAdminRoutes.post("/qa-test-matrix/seed-defaults", requireAnyPermission(["qa.checklist.manage"]), async (c) => {
  for (const [key, name, category] of qaDefaults) await c.env.DB.prepare("INSERT OR IGNORE INTO qa_test_matrix_items (id, test_key, test_name, category, description, expected_result, status, metadata_json) VALUES (?, ?, ?, ?, ?, ?, 'NOT_TESTED', ?)").bind(`qa_${key.replace(/[^a-z0-9]/g, "_")}`, key, name, category, `Verify ${name.toLowerCase()} flow before production.`, "Flow is checked and evidence/notes are recorded.", JSON.stringify({ prompt: "22" })).run();
  return ok(c, { seeded: true });
});
dataTransferAdminRoutes.patch("/qa-test-matrix/:itemId", requireAnyPermission(["qa.checklist.update", "qa.checklist.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  await c.env.DB.prepare("UPDATE qa_test_matrix_items SET status = COALESCE(?, status), tester_user_id = ?, tested_at = ?, notes = COALESCE(?, notes), evidence_reference = COALESCE(?, evidence_reference), updated_at = ? WHERE id = ?").bind(body.status ?? null, c.get("currentUser").id, now(), body.notes ?? null, body.evidence_reference ?? null, now(), c.req.param("itemId")).run();
  return ok(c, { updated: true });
});
dataTransferAdminRoutes.get("/smoke-tests", requireAnyPermission(["qa.smoke_tests.view", "qa.smoke_tests.manage"]), async (c) => ok(c, { runs: (await c.env.DB.prepare("SELECT * FROM smoke_test_runs ORDER BY started_at DESC LIMIT 50").all<Record<string, unknown>>()).results, cli_command: "npm run smoke:production-readiness", note: "Admin UI records smoke results only; the CLI smoke runner does not call production APIs." }));
dataTransferAdminRoutes.post("/smoke-tests/record-result", requireAnyPermission(["qa.smoke_tests.run", "qa.smoke_tests.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO smoke_test_runs (id, run_by_user_id, run_source, status, started_at, completed_at, summary_json, metadata_json) VALUES (?, ?, 'ADMIN_UI_PLACEHOLDER', ?, ?, ?, ?, ?)").bind(id, c.get("currentUser").id, body.status ?? "WARNING", body.started_at ?? now(), body.completed_at ?? now(), JSON.stringify(body.summary ?? {}), JSON.stringify({ prompt: "22" })).run();
  return ok(c, { id }, 201);
});
dataTransferAdminRoutes.get("/deployment-readiness", requireAnyPermission(["deployment.readiness.view", "deployment.readiness.manage"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT * FROM deployment_readiness_records ORDER BY recorded_at DESC LIMIT 50").all<Record<string, unknown>>()).results;
  return ok(c, { latest: rows[0] ?? null, records: rows, rollback_guidance: "Rollback is guidance-only in the browser. Use Cloudflare deployment history and verified database backups from trusted CLI/admin processes." });
});
dataTransferAdminRoutes.post("/deployment-readiness/record", requireAnyPermission(["deployment.readiness.update", "deployment.readiness.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO deployment_readiness_records (id, environment_name, build_version_placeholder, deployment_status, d1_status, r2_status, schema_status, seed_status, production_readiness_status, smoke_test_status, known_blockers_json, last_deployment_note, recorded_by_user_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, body.environment_name ?? "production", body.build_version_placeholder ?? null, body.deployment_status ?? "NOT_READY", body.d1_status ?? null, body.r2_status ?? null, body.schema_status ?? null, body.seed_status ?? null, body.production_readiness_status ?? null, body.smoke_test_status ?? null, JSON.stringify(body.known_blockers ?? []), body.last_deployment_note ?? null, c.get("currentUser").id, JSON.stringify({ prompt: "22" })).run();
  return ok(c, { id }, 201);
});
dataTransferAdminRoutes.patch("/deployment-readiness/:recordId", requireAnyPermission(["deployment.readiness.update", "deployment.readiness.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw) as Record<string, unknown>;
  await c.env.DB.prepare("UPDATE deployment_readiness_records SET deployment_status = COALESCE(?, deployment_status), last_deployment_note = COALESCE(?, last_deployment_note), updated_at = ? WHERE id = ?").bind(body.deployment_status ?? null, body.last_deployment_note ?? null, now(), c.req.param("recordId")).run();
  return ok(c, { updated: true });
});
