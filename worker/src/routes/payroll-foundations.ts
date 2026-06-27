import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDateRange, validatePayrollRules } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";

type Row = Record<string, unknown>;
type BindValue = string | number | null;
type BankLoanInputResult = {
  loan_reference_number: string;
  monthly_installment_amount: number;
  original_loan_amount: number | null;
  outstanding_balance: number | null;
  priority_number: number | null;
  deduction_start_date: string | null;
  deduction_end_date: string | null;
} | { error: string };

export const payrollFoundationRoutes = new Hono<AppBindings>();
export const employeePayrollFoundationRoutes = new Hono<AppBindings>();
export const selfServicePayrollFoundationRoutes = new Hono<AppBindings>();

payrollFoundationRoutes.use("*", requireAuth);
employeePayrollFoundationRoutes.use("*", requireAuth);
selfServicePayrollFoundationRoutes.use("*", requireAuth);

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const user = c.get("currentUser");
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAnyPermission(permissions: string[]): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    await next();
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}

function now() {
  return new Date().toISOString();
}

function maskAccount(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "");
  if (compact.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, compact.length - 4))}${compact.slice(-4)}`;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const BANK_LOAN_INSUFFICIENT_SALARY_MODES = new Set(["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"]);
const BANK_LOAN_MINIMUM_NET_THRESHOLD_TYPES = new Set(["PERCENTAGE_OF_NET_SALARY", "FIXED_AMOUNT"]);
const CUSTOM_DEDUCTION_TYPES = new Set(["ONE_TIME", "RECURRING", "INSTALLMENT", "BALANCE_BASED", "FORMULA_PLACEHOLDER"]);
const CUSTOM_DEDUCTION_AMOUNT_TYPES = new Set(["FIXED_AMOUNT", "PERCENTAGE_OF_BASIC", "PERCENTAGE_OF_GROSS", "CUSTOM_FORMULA_PLACEHOLDER"]);
const CUSTOM_DEDUCTION_INTERVALS = new Set(["MONTHLY", "PAYROLL_PERIOD", "WEEKLY_PLACEHOLDER", "CUSTOM_PLACEHOLDER"]);
const CUSTOM_DEDUCTION_MODULES = new Set(["PAYROLL", "DOCUMENTS", "ASSETS", "UNIFORMS", "DISCIPLINARY_PLACEHOLDER", "OTHER"]);
const CUSTOM_DEDUCTION_TEMPLATE_STATUSES = new Set(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const CUSTOM_DEDUCTION_APPROVAL_STATUSES = new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"]);
const CUSTOM_DEDUCTION_STATUSES = new Set(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "ARCHIVED"]);
const CUSTOM_DEDUCTION_SOURCES = new Set(["MANUAL", "TEMPLATE", "ASSET_DAMAGE", "UNIFORM", "DOCUMENT", "DISCIPLINARY_PLACEHOLDER", "OTHER"]);
const CUSTOM_DEDUCTION_INSUFFICIENT_SALARY_MODES = new Set(["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"]);

function bankLoanInsufficientSalaryMode(value: unknown) {
  const mode = text(value).toUpperCase();
  return BANK_LOAN_INSUFFICIENT_SALARY_MODES.has(mode) ? mode : "REQUIRE_OVERRIDE";
}

function bankLoanMinimumNetThreshold(settings: Row, netSalaryBeforeLoans: number) {
  const type = text(settings.bank_loan_minimum_net_salary_threshold_type).toUpperCase();
  const thresholdType = BANK_LOAN_MINIMUM_NET_THRESHOLD_TYPES.has(type) ? type : "FIXED_AMOUNT";
  const value = thresholdType === "PERCENTAGE_OF_NET_SALARY"
    ? Number((Math.max(0, netSalaryBeforeLoans) * numberValue(settings.bank_loan_minimum_net_salary_threshold_percentage, 0) / 100).toFixed(2))
    : Number(numberValue(settings.bank_loan_minimum_net_salary_threshold_amount, 0).toFixed(2));
  return { threshold_type: thresholdType, threshold_value: Math.max(0, value) };
}

function customDeductionInsufficientSalaryMode(value: unknown) {
  const mode = text(value).toUpperCase();
  return CUSTOM_DEDUCTION_INSUFFICIENT_SALARY_MODES.has(mode) ? mode : "WARN_ONLY";
}

function customDeductionSettingsEnabled(settings: Row | null | undefined) {
  return bool(settings?.custom_deductions_enabled, true);
}

type PayrollSubmoduleKey =
  | "payment_methods_enabled"
  | "payment_institutions_enabled"
  | "pension_enabled"
  | "bank_loan_deductions_enabled"
  | "custom_deductions_enabled";

const PAYROLL_SUBMODULE_LABELS: Record<PayrollSubmoduleKey, string> = {
  payment_methods_enabled: "Employee payment methods",
  payment_institutions_enabled: "Payment institutions",
  pension_enabled: "Pension",
  bank_loan_deductions_enabled: "Bank loan deductions",
  custom_deductions_enabled: "Custom deductions"
};

function payrollSubmoduleEnabled(settings: Row | null | undefined, key: PayrollSubmoduleKey) {
  return bool(settings?.module_enabled, true) && bool(settings?.[key], true);
}

async function requirePayrollSubmoduleEnabled(c: Context<AppBindings>, key: PayrollSubmoduleKey) {
  const settings = await getPayrollSettingsRow(c);
  if (!bool(settings?.module_enabled, true)) return fail(c, 503, "PAYROLL_MODULE_DISABLED", "Payroll module is disabled.");
  if (!payrollSubmoduleEnabled(settings, key)) {
    return fail(c, 403, "PAYROLL_SUBMODULE_DISABLED", `${PAYROLL_SUBMODULE_LABELS[key]} payroll submodule is disabled.`);
  }
  return null;
}

function requirePayrollSubmoduleMiddleware(key: PayrollSubmoduleKey): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const disabled = await requirePayrollSubmoduleEnabled(c, key);
    if (disabled) return disabled;
    await next();
  };
}

function readCustomDeductionTemplateInput(body: Row, old?: Row) {
  const code = (hasInput(body, "code") ? text(body.code) : text(old?.code)).toUpperCase();
  const name = hasInput(body, "name") ? text(body.name) : text(old?.name);
  const deductionType = (hasInput(body, "deduction_type") ? text(body.deduction_type) : text(old?.deduction_type || "ONE_TIME")).toUpperCase();
  const amountType = (hasInput(body, "amount_type") ? text(body.amount_type) : text(old?.amount_type || "FIXED_AMOUNT")).toUpperCase();
  const interval = hasInput(body, "default_recurrence_interval") ? text(body.default_recurrence_interval).toUpperCase() : text(old?.default_recurrence_interval || "PAYROLL_PERIOD").toUpperCase();
  const module = hasInput(body, "linked_module") ? text(body.linked_module).toUpperCase() : text(old?.linked_module || "PAYROLL").toUpperCase();
  const status = hasInput(body, "status") ? text(body.status).toUpperCase() : text(old?.status || "ACTIVE").toUpperCase();
  const defaultAmount = nullableNumberValue(hasInput(body, "default_amount") ? body.default_amount : old?.default_amount);
  const defaultPercentage = nullableNumberValue(hasInput(body, "default_percentage") ? body.default_percentage : old?.default_percentage);
  const defaultInstallments = nullableNumberValue(hasInput(body, "default_installment_count") ? body.default_installment_count : old?.default_installment_count);
  if (!code || !name) return { error: "Template code and name are required." };
  if (!CUSTOM_DEDUCTION_TYPES.has(deductionType)) return { error: "A valid deduction type is required." };
  if (!CUSTOM_DEDUCTION_AMOUNT_TYPES.has(amountType)) return { error: "A valid amount type is required." };
  if (hasValidationErrors(validatePayrollRules({ amount: defaultAmount }))) return { error: "Default amount cannot be negative." };
  if (defaultAmount !== null && (!Number.isFinite(defaultAmount) || defaultAmount < 0)) return { error: "Default amount cannot be negative." };
  if (defaultPercentage !== null && (!Number.isFinite(defaultPercentage) || defaultPercentage < 0 || defaultPercentage > 100)) return { error: "Default percentage must be between 0 and 100." };
  if (defaultInstallments !== null && (!Number.isFinite(defaultInstallments) || defaultInstallments <= 0)) return { error: "Default installment count must be positive." };
  return {
    code,
    name,
    description: hasInput(body, "description") ? text(body.description) || null : old?.description ?? null,
    category: (hasInput(body, "category") ? text(body.category) : text(old?.category || "OTHER")).toUpperCase() || "OTHER",
    deduction_type: deductionType,
    amount_type: amountType,
    default_amount: defaultAmount,
    default_percentage: defaultPercentage,
    default_currency: hasInput(body, "default_currency") ? text(body.default_currency) || "MVR" : text(old?.default_currency || "MVR"),
    default_installment_count: defaultInstallments == null ? null : Math.trunc(defaultInstallments),
    default_recurrence_interval: CUSTOM_DEDUCTION_INTERVALS.has(interval) ? interval : "PAYROLL_PERIOD",
    default_priority_number: nullableNumberValue(hasInput(body, "default_priority_number") ? body.default_priority_number : old?.default_priority_number),
    affects_net_salary: bool(hasInput(body, "affects_net_salary") ? body.affects_net_salary : old?.affects_net_salary, true) ? 1 : 0,
    show_on_payslip: bool(hasInput(body, "show_on_payslip") ? body.show_on_payslip : old?.show_on_payslip, true) ? 1 : 0,
    show_in_self_service: bool(hasInput(body, "show_in_self_service") ? body.show_in_self_service : old?.show_in_self_service, true) ? 1 : 0,
    require_employee_acknowledgement_placeholder: bool(hasInput(body, "require_employee_acknowledgement_placeholder") ? body.require_employee_acknowledgement_placeholder : old?.require_employee_acknowledgement_placeholder, false) ? 1 : 0,
    require_approval: bool(hasInput(body, "require_approval") ? body.require_approval : old?.require_approval, true) ? 1 : 0,
    require_document: bool(hasInput(body, "require_document") ? body.require_document : old?.require_document, false) ? 1 : 0,
    allow_employee_override_amount: bool(hasInput(body, "allow_employee_override_amount") ? body.allow_employee_override_amount : old?.allow_employee_override_amount, true) ? 1 : 0,
    allow_installment_override: bool(hasInput(body, "allow_installment_override") ? body.allow_installment_override : old?.allow_installment_override, true) ? 1 : 0,
    allow_pause_resume: bool(hasInput(body, "allow_pause_resume") ? body.allow_pause_resume : old?.allow_pause_resume, true) ? 1 : 0,
    include_in_final_settlement: bool(hasInput(body, "include_in_final_settlement") ? body.include_in_final_settlement : old?.include_in_final_settlement, true) ? 1 : 0,
    linked_module: CUSTOM_DEDUCTION_MODULES.has(module) ? module : "OTHER",
    status: CUSTOM_DEDUCTION_TEMPLATE_STATUSES.has(status) ? status : "ACTIVE",
    metadata_json: typeof body.metadata_json === "string" ? body.metadata_json : old?.metadata_json ?? null
  };
}

function customDeductionScheduledAmount(row: Row, basicSalary: number, grossSalary: number) {
  const amountType = text(row.amount_type).toUpperCase();
  if (amountType === "PERCENTAGE_OF_BASIC") return Number((basicSalary * numberValue(row.assigned_percentage) / 100).toFixed(2));
  if (amountType === "PERCENTAGE_OF_GROSS") return Number((grossSalary * numberValue(row.assigned_percentage) / 100).toFixed(2));
  if (amountType === "CUSTOM_FORMULA_PLACEHOLDER") return 0;
  if (text(row.deduction_type) === "INSTALLMENT" && row.installment_amount != null) return numberValue(row.installment_amount);
  return numberValue(row.assigned_amount);
}

async function getPayrollSettingsRow(c: Context<AppBindings>) {
  return c.env.DB.prepare("SELECT * FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Row>();
}

async function requireCustomDeductionsEnabled(c: Context<AppBindings>) {
  const settings = await getPayrollSettingsRow(c);
  if (!customDeductionSettingsEnabled(settings)) return fail(c, 403, "CUSTOM_DEDUCTIONS_DISABLED", "Custom deductions are disabled in payroll settings.");
  return null;
}

payrollFoundationRoutes.use("/payment-institutions", requirePayrollSubmoduleMiddleware("payment_institutions_enabled"));
payrollFoundationRoutes.use("/payment-institutions/*", requirePayrollSubmoduleMiddleware("payment_institutions_enabled"));
employeePayrollFoundationRoutes.use("/:employeeId/payment-methods", requirePayrollSubmoduleMiddleware("payment_methods_enabled"));
employeePayrollFoundationRoutes.use("/:employeeId/payment-methods/*", requirePayrollSubmoduleMiddleware("payment_methods_enabled"));
selfServicePayrollFoundationRoutes.use("/payment-methods", requirePayrollSubmoduleMiddleware("payment_methods_enabled"));

payrollFoundationRoutes.use("/bank-loans", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/bank-loans/*", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/employees/:employeeId/bank-loans", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/employees/:employeeId/bank-loans/*", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/bank-loan-payments", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/bank-loan-payments/*", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/bank-loan-eligibility-rules", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/bank-loan-eligibility-rules/*", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/bank-loan-remittance-batches", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/bank-loan-remittance-batches/*", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/reports/bank-loan-summary", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
payrollFoundationRoutes.use("/reports/bank-loan-shortfalls", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));
selfServicePayrollFoundationRoutes.use("/bank-loans", requirePayrollSubmoduleMiddleware("bank_loan_deductions_enabled"));

payrollFoundationRoutes.use("/custom-deduction-templates", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/custom-deduction-templates/*", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/custom-deductions", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/custom-deductions/*", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/reports/custom-deductions-summary", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/reports/custom-deductions-by-template", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/reports/custom-deductions-by-category", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/reports/custom-deduction-shortfalls", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
payrollFoundationRoutes.use("/reports/custom-deduction-applications", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
employeePayrollFoundationRoutes.use("/:employeeId/custom-deductions", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
employeePayrollFoundationRoutes.use("/:employeeId/custom-deductions/*", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));
selfServicePayrollFoundationRoutes.use("/custom-deductions", requirePayrollSubmoduleMiddleware("custom_deductions_enabled"));

payrollFoundationRoutes.use("/pension-schemes", requirePayrollSubmoduleMiddleware("pension_enabled"));
payrollFoundationRoutes.use("/pension-schemes/*", requirePayrollSubmoduleMiddleware("pension_enabled"));
payrollFoundationRoutes.use("/pension-contributions", requirePayrollSubmoduleMiddleware("pension_enabled"));
payrollFoundationRoutes.use("/pension-contributions/*", requirePayrollSubmoduleMiddleware("pension_enabled"));
payrollFoundationRoutes.use("/pension-remittance-batches", requirePayrollSubmoduleMiddleware("pension_enabled"));
payrollFoundationRoutes.use("/pension-remittance-batches/*", requirePayrollSubmoduleMiddleware("pension_enabled"));
payrollFoundationRoutes.use("/reports/pension-contributions", requirePayrollSubmoduleMiddleware("pension_enabled"));
employeePayrollFoundationRoutes.use("/:employeeId/pension-profile", requirePayrollSubmoduleMiddleware("pension_enabled"));
employeePayrollFoundationRoutes.use("/:employeeId/pension-profile/*", requirePayrollSubmoduleMiddleware("pension_enabled"));
selfServicePayrollFoundationRoutes.use("/pension", requirePayrollSubmoduleMiddleware("pension_enabled"));

async function canViewEmployeeCustomDeductions(c: Context<AppBindings>, employeeId: string) {
  if (!hasAny(c, ["payroll.employee_custom_deductions.view", "payroll.employee_custom_deductions.manage", "employees.custom_deductions.view", "employees.custom_deductions.manage", "payroll.view", "employees.payroll.view"])) return false;
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "view");
}

async function canManageEmployeeCustomDeductions(c: Context<AppBindings>, employeeId: string) {
  if (!hasAny(c, ["payroll.employee_custom_deductions.create", "payroll.employee_custom_deductions.update", "payroll.employee_custom_deductions.manage", "employees.custom_deductions.manage", "payroll.manage", "employees.payroll.update"])) return false;
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage");
}

async function readCustomDeductionTemplate(c: Context<AppBindings>, templateId: string) {
  return c.env.DB.prepare("SELECT * FROM custom_deduction_templates WHERE id = ?").bind(templateId).first<Row>();
}

function readEmployeeCustomDeductionInput(body: Row, template: Row, settings: Row | null | undefined, old?: Row) {
  const deductionType = (hasInput(body, "deduction_type") ? text(body.deduction_type) : text(old?.deduction_type ?? template.deduction_type)).toUpperCase();
  const amountType = (hasInput(body, "amount_type") ? text(body.amount_type) : text(old?.amount_type ?? template.amount_type)).toUpperCase();
  const recurrence = (hasInput(body, "recurrence_interval") ? text(body.recurrence_interval) : text(old?.recurrence_interval ?? template.default_recurrence_interval ?? "PAYROLL_PERIOD")).toUpperCase();
  const source = (hasInput(body, "source") ? text(body.source) : text(old?.source ?? "TEMPLATE")).toUpperCase();
  const assignedAmount = nullableNumberValue(hasInput(body, "assigned_amount") ? body.assigned_amount : old?.assigned_amount ?? template.default_amount);
  const assignedPercentage = nullableNumberValue(hasInput(body, "assigned_percentage") ? body.assigned_percentage : old?.assigned_percentage ?? template.default_percentage);
  const totalAmount = nullableNumberValue(hasInput(body, "total_amount") ? body.total_amount : old?.total_amount);
  const installmentCount = nullableNumberValue(hasInput(body, "installment_count") ? body.installment_count : old?.installment_count ?? template.default_installment_count);
  const installmentAmount = nullableNumberValue(hasInput(body, "installment_amount") ? body.installment_amount : old?.installment_amount);
  if (!CUSTOM_DEDUCTION_TYPES.has(deductionType)) return { error: "A valid deduction type is required." };
  if (!CUSTOM_DEDUCTION_AMOUNT_TYPES.has(amountType)) return { error: "A valid amount type is required." };
  if (assignedAmount !== null && (!Number.isFinite(assignedAmount) || assignedAmount <= 0)) return { error: "Assigned amount must be greater than 0." };
  if (assignedPercentage !== null && (!Number.isFinite(assignedPercentage) || assignedPercentage < 0 || assignedPercentage > 100)) return { error: "Assigned percentage must be between 0 and 100." };
  if (["FIXED_AMOUNT"].includes(amountType) && assignedAmount === null && installmentAmount === null && totalAmount === null) return { error: "A fixed amount custom deduction needs an assigned amount, installment amount, or total amount." };
  if (["PERCENTAGE_OF_BASIC", "PERCENTAGE_OF_GROSS"].includes(amountType) && assignedPercentage === null) return { error: "Percentage custom deductions require an assigned percentage." };
  if (deductionType === "INSTALLMENT" && (installmentCount === null || !Number.isFinite(installmentCount) || installmentCount <= 0)) return { error: "Installment deductions require a positive installment count." };
  const effectiveFrom = hasInput(body, "effective_from") ? text(body.effective_from) : text(old?.effective_from) || now().slice(0, 10);
  const effectiveTo = hasInput(body, "effective_to") ? text(body.effective_to) || null : text(old?.effective_to) || null;
  const startDate = hasInput(body, "start_date") ? text(body.start_date) || null : text(old?.start_date) || effectiveFrom;
  const endDate = hasInput(body, "end_date") ? text(body.end_date) || null : text(old?.end_date) || null;
  if (!validDate(effectiveFrom) || !validDate(effectiveTo) || !validDate(startDate) || !validDate(endDate)) return { error: "Dates must use YYYY-MM-DD format." };
  if (hasValidationErrors(validateDateRange({ start: effectiveFrom, end: effectiveTo, startField: "effective_from", endField: "effective_to", label: "Effective to date" }))) return { error: "Effective to date cannot be before effective from date." };
  if (hasValidationErrors(validateDateRange({ start: startDate, end: endDate, startField: "start_date", endField: "end_date", label: "End date" }))) return { error: "End date cannot be before start date." };
  if (startDate && endDate && endDate < startDate) return { error: "End date cannot be before start date." };
  const remainingBalance = hasInput(body, "remaining_balance")
    ? nullableNumberValue(body.remaining_balance)
    : old?.remaining_balance ?? totalAmount ?? (deductionType === "INSTALLMENT" || deductionType === "BALANCE_BASED" ? assignedAmount : null);
  const approvalRequired = bool(template.require_approval, true) || bool(settings?.require_custom_deduction_approval, true);
  return {
    template_code_snapshot: text(template.code),
    template_name_snapshot: text(template.name),
    category_snapshot: text(template.category),
    deduction_type: deductionType,
    amount_type: amountType,
    assigned_amount: assignedAmount,
    assigned_percentage: assignedPercentage,
    currency: hasInput(body, "currency") ? text(body.currency) || text(template.default_currency || "MVR") : text(old?.currency ?? template.default_currency ?? "MVR"),
    total_amount: totalAmount ?? (deductionType === "INSTALLMENT" || deductionType === "BALANCE_BASED" ? assignedAmount : null),
    remaining_balance: remainingBalance == null ? null : Math.max(0, numberValue(remainingBalance)),
    installment_count: installmentCount == null ? null : Math.trunc(installmentCount),
    installment_amount: installmentAmount,
    recurrence_interval: CUSTOM_DEDUCTION_INTERVALS.has(recurrence) ? recurrence : "PAYROLL_PERIOD",
    payroll_period_id_start: hasInput(body, "payroll_period_id_start") ? text(body.payroll_period_id_start) || null : old?.payroll_period_id_start ?? null,
    payroll_period_id_end: hasInput(body, "payroll_period_id_end") ? text(body.payroll_period_id_end) || null : old?.payroll_period_id_end ?? null,
    start_date: startDate,
    end_date: endDate,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    priority_number: nullableNumberValue(hasInput(body, "priority_number") ? body.priority_number : old?.priority_number ?? template.default_priority_number ?? settings?.custom_deduction_priority_default),
    show_on_payslip: bool(hasInput(body, "show_on_payslip") ? body.show_on_payslip : old?.show_on_payslip ?? template.show_on_payslip ?? settings?.custom_deduction_show_on_payslip_default, true) ? 1 : 0,
    show_in_self_service: bool(hasInput(body, "show_in_self_service") ? body.show_in_self_service : old?.show_in_self_service ?? template.show_in_self_service ?? settings?.custom_deduction_show_in_self_service_default, true) ? 1 : 0,
    include_in_final_settlement: bool(hasInput(body, "include_in_final_settlement") ? body.include_in_final_settlement : old?.include_in_final_settlement ?? template.include_in_final_settlement ?? settings?.custom_deduction_include_in_final_settlement_default, true) ? 1 : 0,
    approval_status: hasInput(body, "approval_status") ? text(body.approval_status).toUpperCase() : text(old?.approval_status ?? (approvalRequired ? "PENDING_APPROVAL" : "APPROVED")).toUpperCase(),
    status: hasInput(body, "status") ? text(body.status).toUpperCase() : text(old?.status ?? (approvalRequired ? "DRAFT" : "ACTIVE")).toUpperCase(),
    source: CUSTOM_DEDUCTION_SOURCES.has(source) ? source : "TEMPLATE",
    source_reference_type: hasInput(body, "source_reference_type") ? text(body.source_reference_type) || null : text(old?.source_reference_type) || null,
    source_reference_id: hasInput(body, "source_reference_id") ? text(body.source_reference_id) || null : text(old?.source_reference_id) || null,
    supporting_document_id: hasInput(body, "supporting_document_id") ? text(body.supporting_document_id) || null : text(old?.supporting_document_id) || null,
    reason: hasInput(body, "reason") ? text(body.reason) || null : text(old?.reason) || null,
    notes: hasInput(body, "notes") ? text(body.notes) || null : text(old?.notes) || null,
    metadata_json: typeof body.metadata_json === "string" ? body.metadata_json : text(old?.metadata_json) || null
  };
}

export function getCustomDeductionRemainingBalance(row: Row) {
  if (row.remaining_balance == null || row.remaining_balance === "") return null;
  return Math.max(0, numberValue(row.remaining_balance));
}

export function calculateCustomDeductionAmount(row: Row, basicSalary: number, grossSalary: number, availableNetSalary: number, settings: Row) {
  const mode = customDeductionInsufficientSalaryMode(settings.custom_deduction_insufficient_salary_mode);
  const remainingBalance = getCustomDeductionRemainingBalance(row);
  let scheduled = customDeductionScheduledAmount(row, basicSalary, grossSalary);
  if (remainingBalance !== null) scheduled = Math.min(scheduled, remainingBalance);
  scheduled = Number(Math.max(0, scheduled).toFixed(2));
  const allowPartial = bool(settings.custom_deduction_allow_partial_deduction, true);
  let deducted = scheduled;
  let applicationStatus = scheduled > 0 ? "APPLIED_IN_PAYROLL" : "SKIPPED";
  let warning: string | null = null;
  let requiresResolution = false;
  if (scheduled > availableNetSalary) {
    warning = `Custom deduction ${row.template_name_snapshot ?? row.template_code_snapshot} exceeds available salary by ${(scheduled - availableNetSalary).toFixed(2)}.`;
    if (mode === "PARTIAL_DEDUCTION" && allowPartial) {
      deducted = Math.max(0, availableNetSalary);
      applicationStatus = deducted > 0 ? "PARTIAL" : "SKIPPED";
    } else {
      deducted = 0;
      applicationStatus = mode === "SKIP_AND_MARK_FAILED" ? "FAILED" : "SKIPPED";
      requiresResolution = mode === "BLOCK_PAYROLL" || mode === "REQUIRE_OVERRIDE";
    }
  }
  const shortfall = Number(Math.max(0, scheduled - deducted).toFixed(2));
  const before = remainingBalance;
  const after = before == null ? null : Number(Math.max(0, before - deducted).toFixed(2));
  return {
    scheduled_amount: scheduled,
    deducted_amount: Number(deducted.toFixed(2)),
    shortfall_amount: shortfall,
    remaining_balance_before: before,
    remaining_balance_after: after,
    installment_number: row.deduction_type === "INSTALLMENT" ? numberValue(row.installments_completed) + 1 : null,
    application_status: applicationStatus,
    warning,
    requires_resolution: requiresResolution,
    insufficient_salary_mode: mode
  };
}

export async function getActiveCustomDeductionsForPayroll(c: Context<AppBindings>, employeeId: string, period: Row) {
  return (await c.env.DB
    .prepare(
      `SELECT ecd.*, cdt.default_amount, cdt.default_percentage, cdt.affects_net_salary
       FROM employee_custom_deductions ecd
       INNER JOIN custom_deduction_templates cdt ON cdt.id = ecd.template_id
       WHERE ecd.employee_id = ?
         AND ecd.status = 'ACTIVE'
         AND ecd.approval_status = 'APPROVED'
         AND cdt.status = 'ACTIVE'
         AND (ecd.effective_from IS NULL OR ecd.effective_from <= ?)
         AND (ecd.effective_to IS NULL OR ecd.effective_to >= ?)
         AND (ecd.start_date IS NULL OR ecd.start_date <= ?)
         AND (ecd.end_date IS NULL OR ecd.end_date >= ?)
         AND (ecd.payroll_period_id_start IS NULL OR ecd.payroll_period_id_start = ? OR ecd.payroll_period_id_start <= ?)
         AND (ecd.payroll_period_id_end IS NULL OR ecd.payroll_period_id_end = ? OR ecd.payroll_period_id_end >= ?)
       ORDER BY COALESCE(ecd.priority_number, 999), ecd.created_at`
    )
    .bind(employeeId, period.end_date, period.start_date, period.end_date, period.start_date, period.id, period.id, period.id, period.id)
    .all<Row>()).results;
}

export async function applyCustomDeductionsToPayroll(c: Context<AppBindings>, employeeId: string, period: Row, basicSalary: number, grossSalary: number, availableNetSalary: number, settings: Row) {
  if (!customDeductionSettingsEnabled(settings)) return { deductions: [], applications: [], total: 0, warnings: [] as string[], requires_resolution: false };
  const rows = await getActiveCustomDeductionsForPayroll(c, employeeId, period);
  let remaining = Math.max(0, availableNetSalary);
  const warnings: string[] = [];
  let requiresResolution = false;
  const applications = rows.map((row) => {
    const calc = calculateCustomDeductionAmount(row, basicSalary, grossSalary, remaining, settings);
    remaining = Math.max(0, remaining - numberValue(calc.deducted_amount));
    if (calc.warning) warnings.push(calc.warning);
    if (calc.requires_resolution) requiresResolution = true;
    return { ...row, ...calc };
  });
  return {
    deductions: rows,
    applications,
    total: Number(applications.reduce((sum, item) => sum + numberValue(item.deducted_amount), 0).toFixed(2)),
    warnings,
    requires_resolution: requiresResolution
  };
}

export async function recordCustomDeductionPayrollApplications(c: Context<AppBindings>, period: Row, run: Row, payrollEmployeeResultId: string, employeeId: string, applications: Row[]) {
  for (const application of applications) {
    const id = crypto.randomUUID();
    await c.env.DB
      .prepare(
        `INSERT OR REPLACE INTO employee_custom_deduction_applications
         (id, employee_custom_deduction_id, employee_id, template_id, payroll_period_id, payroll_run_id,
          payroll_employee_result_id, scheduled_amount, deducted_amount, shortfall_amount,
          remaining_balance_before, remaining_balance_after, installment_number, application_status,
          reason, notes, metadata_json)
         VALUES (
          COALESCE((SELECT id FROM employee_custom_deduction_applications WHERE employee_custom_deduction_id = ? AND payroll_period_id = ? AND payroll_employee_result_id = ?), ?),
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         )`
      )
      .bind(
        application.id,
        period.id,
        payrollEmployeeResultId,
        id,
        application.id,
        employeeId,
        application.template_id,
        period.id,
        run.id,
        payrollEmployeeResultId,
        application.scheduled_amount,
        application.deducted_amount,
        application.shortfall_amount,
        application.remaining_balance_before ?? null,
        application.remaining_balance_after ?? null,
        application.installment_number ?? null,
        application.application_status,
        application.reason ?? null,
        application.notes ?? null,
        JSON.stringify({ template_code: application.template_code_snapshot, category: application.category_snapshot, insufficient_salary_mode: application.insufficient_salary_mode ?? null })
      )
      .run();
    await audit(c, "payroll.custom_deduction.applied", "employee_custom_deduction", String(application.id), { newValue: application });
  }
}

export async function updateCustomDeductionAfterPayrollFinalized(c: Context<AppBindings>, payrollRunId: string) {
  const applications = (await c.env.DB
    .prepare(
      `SELECT ecda.*, ecd.deduction_type, ecd.installment_count, ecd.installments_completed
       FROM employee_custom_deduction_applications ecda
       INNER JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id
       WHERE ecda.payroll_run_id = ? AND ecda.application_status IN ('APPLIED_IN_PAYROLL', 'PARTIAL')`
    )
    .bind(payrollRunId)
    .all<Row>()).results;
  for (const application of applications) {
    const completedInstallments = text(application.deduction_type) === "INSTALLMENT" ? numberValue(application.installments_completed) + 1 : numberValue(application.installments_completed);
    const remaining = application.remaining_balance_after == null ? null : numberValue(application.remaining_balance_after);
    const isComplete = text(application.deduction_type) === "ONE_TIME"
      || (remaining !== null && remaining <= 0.01)
      || (text(application.deduction_type) === "INSTALLMENT" && application.installment_count != null && completedInstallments >= numberValue(application.installment_count));
    await c.env.DB
      .prepare(
        `UPDATE employee_custom_deductions
         SET remaining_balance = COALESCE(?, remaining_balance),
           installments_completed = ?,
           status = CASE WHEN ? = 1 THEN 'COMPLETED' ELSE status END,
           completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END,
           updated_at = ?
         WHERE id = ?`
      )
      .bind(remaining, completedInstallments, isComplete ? 1 : 0, isComplete ? 1 : 0, now(), now(), application.employee_custom_deduction_id)
      .run();
  }
}

export async function getCustomDeductionOutstandingBalanceForSettlement(db: D1Database, employeeId: string) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(remaining_balance, total_amount, assigned_amount, 0)), 0) AS outstanding_balance
       FROM employee_custom_deductions
       WHERE employee_id = ? AND include_in_final_settlement = 1 AND status IN ('ACTIVE', 'PAUSED')`
    )
    .bind(employeeId)
    .first<Row>();
  return numberValue(row?.outstanding_balance);
}

export async function getCustomDeductionWarningsForSettlement(db: D1Database, employeeId: string) {
  return (await db
    .prepare(
      `SELECT id, template_name_snapshot, status, approval_status, remaining_balance
       FROM employee_custom_deductions
       WHERE employee_id = ? AND include_in_final_settlement = 1
         AND (status = 'PAUSED' OR approval_status IN ('DRAFT', 'PENDING_APPROVAL') OR remaining_balance > 0)
       ORDER BY created_at DESC`
    )
    .bind(employeeId)
    .all<Row>()).results;
}

export async function getFinalSettlementCustomDeductionImpact(db: D1Database, employeeId: string) {
  return {
    outstanding_balance: await getCustomDeductionOutstandingBalanceForSettlement(db, employeeId),
    warnings: await getCustomDeductionWarningsForSettlement(db, employeeId),
    source: "employee_custom_deductions"
  };
}

function hasInput(body: Row, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function validDate(value: unknown) {
  const raw = text(value);
  return !raw || /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

function nullableNumberValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readLoanInput(body: Row, old?: Row): BankLoanInputResult {
  const loanReferenceNumber = hasInput(body, "loan_reference_number") ? text(body.loan_reference_number) : text(old?.loan_reference_number);
  const monthlyRaw = hasInput(body, "monthly_installment_amount") ? body.monthly_installment_amount : old?.monthly_installment_amount;
  const monthlyInstallment = nullableNumberValue(monthlyRaw);
  const originalLoanAmount = nullableNumberValue(hasInput(body, "original_loan_amount") ? body.original_loan_amount : old?.original_loan_amount);
  const outstandingBalance = nullableNumberValue(hasInput(body, "outstanding_balance") ? body.outstanding_balance : old?.outstanding_balance);
  const priorityNumber = nullableNumberValue(hasInput(body, "priority_number") ? body.priority_number : old?.priority_number);
  const deductionStartDate = hasInput(body, "deduction_start_date") ? text(body.deduction_start_date) || null : (old?.deduction_start_date as string | null | undefined) ?? null;
  const deductionEndDate = hasInput(body, "deduction_end_date") ? text(body.deduction_end_date) || null : (old?.deduction_end_date as string | null | undefined) ?? null;
  if (!loanReferenceNumber) return { error: "Loan reference number is required." };
  if (monthlyInstallment == null || !Number.isFinite(monthlyInstallment) || monthlyInstallment <= 0) return { error: "Monthly installment amount must be greater than 0." };
  if (originalLoanAmount !== null && (!Number.isFinite(originalLoanAmount) || originalLoanAmount < 0)) return { error: "Original loan amount cannot be negative." };
  if (outstandingBalance !== null && (!Number.isFinite(outstandingBalance) || outstandingBalance < 0)) return { error: "Outstanding balance cannot be negative." };
  if (priorityNumber !== null && (!Number.isFinite(priorityNumber) || priorityNumber < 0)) return { error: "Priority number cannot be negative." };
  if (!validDate(deductionStartDate) || !validDate(deductionEndDate)) return { error: "Deduction start and end dates must use YYYY-MM-DD format." };
  if (hasValidationErrors(validateDateRange({ start: deductionStartDate, end: deductionEndDate, startField: "deduction_start_date", endField: "deduction_end_date", label: "Deduction end date" }))) return { error: "Deduction end date cannot be before start date." };
  if (deductionStartDate && deductionEndDate && deductionEndDate < deductionStartDate) return { error: "Deduction end date cannot be before start date." };
  return {
    loan_reference_number: loanReferenceNumber,
    monthly_installment_amount: monthlyInstallment,
    original_loan_amount: originalLoanAmount,
    outstanding_balance: outstandingBalance,
    priority_number: priorityNumber,
    deduction_start_date: deductionStartDate,
    deduction_end_date: deductionEndDate
  };
}

async function audit(c: Context<AppBindings>, action: string, entityType: string, entityId: string | null, input: { oldValue?: unknown; newValue?: unknown; reason?: string | null } = {}) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action,
    module: "payroll",
    entityType,
    entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason ?? null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function canViewEmployeePayrollFoundation(c: Context<AppBindings>, employeeId: string) {
  if (!hasAny(c, ["employees.payment_methods.view", "employees.payment_methods.manage", "payroll.payment_methods.view", "payroll.payment_methods.manage", "payroll.view", "employees.payroll.view"])) return false;
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "view");
}

async function canManageEmployeePayrollFoundation(c: Context<AppBindings>, employeeId: string) {
  if (!hasAny(c, ["employees.payment_methods.manage", "employees.payment_methods.create", "employees.payment_methods.update", "payroll.payment_methods.manage", "payroll.manage", "employees.payroll.update"])) return false;
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage");
}

async function linkedEmployeeId(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  if (!user.employee_id) return null;
  const employee = await c.env.DB.prepare("SELECT id FROM employees WHERE id = ? AND archived_at IS NULL").bind(user.employee_id).first<Row>();
  return employee ? String(employee.id) : null;
}

function safePaymentMethod(row: Row, sensitive: boolean) {
  const copy = { ...row };
  if (!sensitive) {
    copy.bank_account_number_encrypted_or_plain_placeholder = null;
    copy.iban_or_swift_placeholder = null;
    copy.wallet_number = copy.wallet_number ? maskAccount(copy.wallet_number) : null;
  }
  return copy;
}

export async function getEmployeePaymentMethods(db: D1Database, employeeId: string, sensitive = false) {
  const rows = await db
    .prepare(
      `SELECT epm.*, pi.name AS payment_institution_name, pi.code AS payment_institution_code, l.name AS cash_collection_location_name
       FROM employee_payment_methods epm
       LEFT JOIN payment_institutions pi ON pi.id = epm.payment_institution_id
       LEFT JOIN locations l ON l.id = epm.cash_collection_location_id
       WHERE epm.employee_id = ? AND epm.status != 'ARCHIVED'
       ORDER BY epm.is_primary DESC, epm.effective_date DESC, epm.created_at DESC`
    )
    .bind(employeeId)
    .all<Row>();
  return rows.results.map((row) => safePaymentMethod(row, sensitive));
}

export async function getActivePaymentMethodSnapshot(db: D1Database, employeeId: string, amount: number) {
  const methods = (await db
    .prepare(
      `SELECT epm.*, pi.name AS payment_institution_name, pi.code AS payment_institution_code
       FROM employee_payment_methods epm
       LEFT JOIN payment_institutions pi ON pi.id = epm.payment_institution_id
       WHERE epm.employee_id = ? AND epm.status = 'ACTIVE'
       ORDER BY epm.is_primary DESC, epm.effective_date DESC, epm.created_at DESC`
    )
    .bind(employeeId)
    .all<Row>()).results;
  if (methods.length === 0) {
    return { primary: null, split: [], warning: "Payment method is missing." };
  }
  const primary = methods.find((method) => Number(method.is_primary ?? 0) === 1) ?? methods[0];
  const active: Array<Row & { allocated_amount: number }> = methods.length === 1 && text(methods[0].allocation_type) === "FULL" ? [{ ...methods[0], allocated_amount: amount }] : methods.map((method) => {
    const allocationType = text(method.allocation_type) || "FULL";
    const allocated = allocationType === "PERCENTAGE"
      ? amount * numberValue(method.allocation_percentage) / 100
      : allocationType === "FIXED_AMOUNT"
        ? Math.min(amount, numberValue(method.allocation_amount))
        : amount;
    return { ...method, allocated_amount: Number(allocated.toFixed(2)) };
  });
  const percentTotal = methods.filter((method) => text(method.allocation_type) === "PERCENTAGE").reduce((sum, method) => sum + numberValue(method.allocation_percentage), 0);
  const fixedTotal = methods.filter((method) => text(method.allocation_type) === "FIXED_AMOUNT").reduce((sum, method) => sum + numberValue(method.allocation_amount), 0);
  const warnings = [];
  if (percentTotal > 0 && Math.abs(percentTotal - 100) > 0.01) warnings.push("Active percentage payment method allocations do not total 100%.");
  if (fixedTotal > amount) warnings.push("Fixed payment method allocations exceed net salary.");
  return {
    primary,
    split: active,
    warning: warnings.join(" "),
    snapshot_json: JSON.stringify({
      split_payment_methods: active.map((method) => ({
        payment_method_type: method.payment_method_type,
        payment_institution_id: method.payment_institution_id,
        payment_institution_name: method.payment_institution_name ?? method.bank_name_snapshot ?? null,
        allocation_type: method.allocation_type,
        allocation_percentage: method.allocation_percentage,
        allocation_amount: method.allocation_amount,
        allocated_amount: method.allocated_amount,
        bank_account_number_masked: method.bank_account_number_masked,
        cash_collection_note: method.cash_collection_note
      }))
    })
  };
}

async function readInstitution(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT * FROM payment_institutions WHERE id = ?").bind(id).first<Row>();
}

async function loanEligibilitySnapshot(c: Context<AppBindings>, employeeId: string, institutionId: string | null, paymentMethods?: Row[]) {
  const settings = await c.env.DB.prepare("SELECT * FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Row>();
  const methods = paymentMethods ?? (await getEmployeePaymentMethods(c.env.DB, employeeId, false));
  const activeMethods = methods.filter((method) => text(method.status) === "ACTIVE");
  const cashOnly = activeMethods.length > 0 && activeMethods.every((method) => text(method.payment_method_type) === "CASH");
  const rule = await c.env.DB
    .prepare(
      `SELECT * FROM bank_loan_eligibility_rules
       WHERE status = 'ACTIVE' AND (payment_institution_id IS NULL OR payment_institution_id = ?)
       ORDER BY CASE WHEN payment_institution_id = ? THEN 0 ELSE 1 END, effective_from DESC
       LIMIT 1`
    )
    .bind(institutionId, institutionId)
    .first<Row>();
  if (cashOnly && bool(settings?.bank_loan_cash_salary_default_ineligible, true) && text(rule?.cash_salary_eligibility_rule || "INELIGIBLE_BY_DEFAULT") === "INELIGIBLE_BY_DEFAULT") {
    return {
      salary_payment_method_snapshot: "CASH",
      salary_routed_to_bank: 0,
      eligibility_status: "INELIGIBLE_CASH_SALARY",
      eligibility_reason: "Employee receives salary by cash. Bank salary-loan eligibility may require salary routing or bank statements."
    };
  }
  return {
    salary_payment_method_snapshot: activeMethods.map((method) => method.payment_method_type).join(",") || "MISSING",
    salary_routed_to_bank: activeMethods.some((method) => text(method.payment_method_type) === "BANK_TRANSFER") ? 1 : 0,
    eligibility_status: activeMethods.length ? "ELIGIBLE" : "PENDING_DOCUMENTS",
    eligibility_reason: activeMethods.length ? null : "Payment method is missing."
  };
}

export async function getActiveApprovedBankLoansForPayroll(c: Context<AppBindings>, employeeId: string, period: Row, availableAfterPension: number, settings: Row) {
  if (!bool(settings.bank_loan_deductions_enabled, true)) return { loans: [], total: 0, warnings: [] as string[], insufficient_salary_mode: bankLoanInsufficientSalaryMode(settings.bank_loan_insufficient_salary_mode), requires_resolution: false };
  const rows = (await c.env.DB
    .prepare(
      `SELECT ebl.*, pi.name AS payment_institution_name
       FROM employee_bank_loans ebl
       INNER JOIN payment_institutions pi ON pi.id = ebl.payment_institution_id
       WHERE ebl.employee_id = ? AND ebl.status = 'ACTIVE' AND ebl.approval_status = 'APPROVED'
       AND (ebl.deduction_start_date IS NULL OR ebl.deduction_start_date <= ?)
       AND (ebl.deduction_end_date IS NULL OR ebl.deduction_end_date >= ?)
       ORDER BY COALESCE(ebl.priority_number, 999), ebl.created_at`
    )
    .bind(employeeId, period.end_date, period.start_date)
    .all<Row>()).results;
  let remaining = Math.max(0, availableAfterPension);
  const warnings: string[] = [];
  const mode = bankLoanInsufficientSalaryMode(settings.bank_loan_insufficient_salary_mode);
  const minimumProtection = bankLoanMinimumNetThreshold(settings, availableAfterPension);
  const minimumProtectionEnabled = bool(settings.bank_loan_minimum_net_salary_protection_enabled, false) && bool(settings.bank_loan_skip_if_below_threshold_enabled, true);
  const directCollectionEnabled = bool(settings.bank_loan_employee_direct_collection_status_enabled, true);
  const bankNotificationRequired = bool(settings.bank_loan_bank_notification_required_on_skip, true);
  const carryForwardEnabled = bool(settings.bank_loan_carry_forward_shortfall_enabled, false);
  let requiresResolution = false;
  const loans = rows.map((loan) => {
    const scheduled = Math.max(0, numberValue(loan.monthly_installment_amount));
    const partialAllowed = loan.partial_deduction_allowed == null ? bool(settings.allow_partial_loan_deduction, true) : bool(loan.partial_deduction_allowed, true);
    const netBeforeLoan = Number(remaining.toFixed(2));
    const netAfterAttemptedLoan = Number((remaining - scheduled).toFixed(2));
    let deducted = scheduled;
    let status = "DEDUCTED_IN_PAYROLL";
    let modeAction = "FULL_DEDUCTION";
    let requiresOverride = false;
    let blocksPayroll = false;
    let carriedForward = 0;
    let skippedMinimumProtection = false;
    let bankDirectCollectionRequired = false;
    let bankNotificationStatus: string | null = null;
    if (minimumProtectionEnabled && scheduled > 0 && netAfterAttemptedLoan < minimumProtection.threshold_value) {
      deducted = 0;
      status = "SKIPPED_MINIMUM_NET_PROTECTION";
      modeAction = "MINIMUM_NET_SALARY_PROTECTION";
      skippedMinimumProtection = true;
      bankDirectCollectionRequired = directCollectionEnabled;
      bankNotificationStatus = bankNotificationRequired ? "BANK_NOTIFICATION_PENDING" : "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE";
      warnings.push(`Bank loan ${loan.loan_reference_number} was skipped because deduction would reduce take-home salary below the protected threshold of ${minimumProtection.threshold_value.toFixed(2)}. Bank collection is direct from employee.`);
    } else if (scheduled > remaining) {
      const shortfallBeforeAction = Number((scheduled - remaining).toFixed(2));
      warnings.push(`Bank loan ${loan.loan_reference_number} exceeds available salary by ${shortfallBeforeAction.toFixed(2)} using ${mode}.`);
      if (bool(settings.block_payroll_if_loan_exceeds_net_salary, false) && mode !== "PARTIAL_DEDUCTION") {
        requiresResolution = true;
        blocksPayroll = true;
      }
      if (mode === "PARTIAL_DEDUCTION") {
        deducted = partialAllowed ? remaining : 0;
        status = deducted > 0 ? "PARTIAL" : "FAILED";
        modeAction = partialAllowed ? "PARTIAL_DEDUCTION" : "PARTIAL_NOT_ALLOWED";
      } else if (mode === "SKIP_AND_MARK_FAILED") {
        deducted = 0;
        status = "FAILED";
        modeAction = "SKIPPED_FAILED";
      } else if (mode === "WARN_ONLY") {
        deducted = 0;
        status = "PENDING_BANK_REVIEW";
        modeAction = "WARNING_ONLY_NO_DEDUCTION";
      } else if (mode === "BLOCK_PAYROLL") {
        deducted = 0;
        status = "PENDING_BANK_REVIEW";
        blocksPayroll = true;
        requiresResolution = true;
        modeAction = "BLOCKED_REQUIRES_RESOLUTION";
      } else {
        deducted = 0;
        status = "PENDING_BANK_REVIEW";
        requiresOverride = true;
        requiresResolution = true;
        modeAction = "REQUIRE_OVERRIDE_NO_DEDUCTION";
      }
      carriedForward = carryForwardEnabled ? Number((scheduled - deducted).toFixed(2)) : 0;
      warnings.push(`Bank loan ${loan.loan_reference_number} has a shortfall of ${(scheduled - deducted).toFixed(2)}.`);
    }
    remaining = Math.max(0, remaining - deducted);
    return {
      ...loan,
      scheduled_installment_amount: scheduled,
      deducted_amount: Number(deducted.toFixed(2)),
      shortfall_amount: Number((scheduled - deducted).toFixed(2)),
      carried_forward_amount: carriedForward,
      payment_status: status,
      insufficient_salary_mode: mode,
      insufficient_salary_action: modeAction,
      minimum_net_salary_threshold_type: skippedMinimumProtection ? minimumProtection.threshold_type : null,
      minimum_net_salary_threshold_value: skippedMinimumProtection ? minimumProtection.threshold_value : null,
      net_salary_before_loan: netBeforeLoan,
      net_salary_after_attempted_loan: netAfterAttemptedLoan,
      skipped_due_to_minimum_net_salary: skippedMinimumProtection ? 1 : 0,
      bank_direct_collection_required: bankDirectCollectionRequired ? 1 : 0,
      bank_notification_status: bankNotificationStatus,
      employee_direct_collection_message: skippedMinimumProtection ? "This month's loan deduction was skipped by payroll due to minimum salary protection. Bank collection is marked as direct collection from employee." : null,
      requires_override: requiresOverride ? 1 : 0,
      blocks_payroll: blocksPayroll ? 1 : 0,
      requires_resolution: requiresOverride || blocksPayroll ? 1 : 0
    };
  });
  return {
    loans,
    total: Number(loans.reduce((sum, loan) => sum + numberValue(loan.deducted_amount), 0).toFixed(2)),
    warnings,
    insufficient_salary_mode: mode,
    requires_resolution: requiresResolution || loans.some((loan) => bool(loan.requires_resolution, false))
  };
}

export async function recordBankLoanPayrollPayments(c: Context<AppBindings>, period: Row, run: Row, payrollEmployeeResultId: string, employeeId: string, loans: Row[]) {
  for (const loan of loans) {
    const id = crypto.randomUUID();
    await c.env.DB
      .prepare(
        `INSERT OR IGNORE INTO employee_bank_loan_payments
         (id, employee_bank_loan_id, employee_id, payroll_period_id, payroll_run_id, payroll_employee_result_id,
          payment_institution_id, bank_name_snapshot, loan_reference_number_snapshot,
          scheduled_installment_amount, deducted_amount, shortfall_amount, carried_forward_amount, payment_status,
          minimum_net_salary_threshold_type, minimum_net_salary_threshold_value, net_salary_before_loan, net_salary_after_attempted_loan,
          skipped_due_to_minimum_net_salary, bank_direct_collection_required, bank_notification_status, notes, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        loan.id,
        employeeId,
        period.id,
        run.id,
        payrollEmployeeResultId,
        loan.payment_institution_id,
        loan.payment_institution_name ?? loan.bank_name_snapshot,
        loan.loan_reference_number,
        loan.scheduled_installment_amount,
        loan.deducted_amount,
        loan.shortfall_amount,
        loan.carried_forward_amount ?? 0,
        loan.payment_status,
        loan.minimum_net_salary_threshold_type ?? null,
        loan.minimum_net_salary_threshold_value ?? null,
        loan.net_salary_before_loan ?? null,
        loan.net_salary_after_attempted_loan ?? null,
        loan.skipped_due_to_minimum_net_salary ?? 0,
        loan.bank_direct_collection_required ?? 0,
        loan.bank_notification_status ?? null,
        loan.skipped_due_to_minimum_net_salary
          ? "Skipped by payroll due to minimum net salary protection. Bank to collect directly from employee."
          : loan.shortfall_amount ? `Shortfall handled by ${loan.insufficient_salary_mode ?? "REQUIRE_OVERRIDE"}; action ${loan.insufficient_salary_action ?? "REVIEW"}.` : null,
        JSON.stringify({
          insufficient_salary_mode: loan.insufficient_salary_mode ?? null,
          insufficient_salary_action: loan.insufficient_salary_action ?? null,
          direct_collection_status: loan.skipped_due_to_minimum_net_salary ? "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE" : null,
          employee_direct_collection_message: loan.employee_direct_collection_message ?? null
        })
      )
      .run();
  }
}

export async function calculatePayrollPensionContribution(c: Context<AppBindings>, employee: Row, period: Row, basicSalary: number, settings: Row) {
  if (!bool(settings.pension_enabled, true) || !bool(settings.pension_auto_calculation_enabled, true)) return null;
  const profile = await c.env.DB
    .prepare(
      `SELECT epp.*, ps.scheme_code, ps.scheme_name, ps.employee_contribution_percent, ps.employer_contribution_percent,
        ps.contribution_basis, ps.local_employee_required, ps.foreign_employee_allowed, ps.foreign_employee_default_required
       FROM employee_pension_profiles epp
       LEFT JOIN pension_schemes ps ON ps.id = epp.pension_scheme_id
       WHERE epp.employee_id = ? AND epp.status = 'ACTIVE'
       AND (epp.effective_date IS NULL OR epp.effective_date <= ?)
       AND (epp.end_date IS NULL OR epp.end_date >= ?)
       ORDER BY epp.effective_date DESC
       LIMIT 1`
    )
    .bind(employee.id, period.end_date, period.start_date)
    .first<Row>();
  let scheme = profile?.pension_scheme_id ? profile : null;
  if (!scheme) {
    scheme = await c.env.DB
      .prepare(
        `SELECT * FROM pension_schemes
         WHERE status = 'ACTIVE' AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY effective_from DESC
         LIMIT 1`
      )
      .bind(period.end_date, period.start_date)
      .first<Row>();
  }
  if (!scheme) return null;
  const employeeType = text(employee.employee_type ?? employee.employee_type_snapshot);
  const enrollment = text(profile?.enrollment_status);
  if (employeeType === "FOREIGN" && !bool(scheme.foreign_employee_default_required, false) && !["ENROLLED", "VOLUNTARY"].includes(enrollment)) return null;
  if (enrollment === "EXEMPTED" || enrollment === "SUSPENDED" || enrollment === "NOT_ENROLLED") return null;
  const basis = text(profile?.contribution_basis_override ?? scheme.contribution_basis ?? settings.pension_basis_default) || "BASIC_SALARY_ONLY";
  const pensionableWage = basis === "BASIC_SALARY_ONLY" ? basicSalary : basicSalary;
  const employeePercent = numberValue(profile?.employee_contribution_percent_override ?? scheme.employee_contribution_percent ?? settings.pension_employee_contribution_default_percent, 0);
  const employerPercent = numberValue(profile?.employer_contribution_percent_override ?? scheme.employer_contribution_percent ?? settings.pension_employer_contribution_default_percent, 0);
  const extra = numberValue(profile?.employee_extra_voluntary_contribution_amount, 0);
  const employeeShare = Number((pensionableWage * employeePercent / 100 + extra).toFixed(2));
  const employerShare = Number((pensionableWage * employerPercent / 100).toFixed(2));
  const employerPaysEmployeeShare = bool(profile?.employer_pays_employee_share, false);
  return {
    profile,
    scheme,
    pensionable_wage: pensionableWage,
    employee_contribution_percent: employeePercent,
    employee_contribution_amount: employerPaysEmployeeShare ? 0 : employeeShare,
    employer_contribution_percent: employerPercent,
    employer_contribution_amount: employerPaysEmployeeShare ? employerShare + employeeShare : employerShare,
    employer_paid_employee_share_amount: employerPaysEmployeeShare ? employeeShare : 0,
    employee_extra_voluntary_contribution_amount: extra,
    total_contribution_amount: employeeShare + employerShare
  };
}

export async function recordPayrollPensionContribution(c: Context<AppBindings>, period: Row, run: Row, payrollEmployeeResultId: string, employeeId: string, pension: Row | null) {
  if (!pension) return;
  await c.env.DB
    .prepare(
      `INSERT OR REPLACE INTO payroll_pension_contributions
       (id, payroll_period_id, payroll_run_id, payroll_employee_result_id, employee_id, pension_scheme_id,
        pensionable_wage, employee_contribution_percent, employee_contribution_amount,
        employer_contribution_percent, employer_contribution_amount, total_contribution_amount,
        employer_paid_employee_share_amount, employee_extra_voluntary_contribution_amount, contribution_status, metadata_json)
       VALUES (COALESCE((SELECT id FROM payroll_pension_contributions WHERE payroll_employee_result_id = ?), ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INCLUDED_IN_PAYROLL', ?)`
    )
    .bind(
      payrollEmployeeResultId,
      crypto.randomUUID(),
      period.id,
      run.id,
      payrollEmployeeResultId,
      employeeId,
      (pension.scheme as Row).id,
      pension.pensionable_wage,
      pension.employee_contribution_percent,
      pension.employee_contribution_amount,
      pension.employer_contribution_percent,
      pension.employer_contribution_amount,
      pension.total_contribution_amount,
      pension.employer_paid_employee_share_amount,
      pension.employee_extra_voluntary_contribution_amount,
      JSON.stringify({ scheme: pension.scheme, profile: pension.profile })
    )
    .run();
}

payrollFoundationRoutes.get("/payment-institutions", requireAnyPermission(["payroll.payment_institutions.view", "payroll.payment_institutions.manage", "payroll.view"]), async (c) => {
  const includeArchived = c.req.query("include_archived") === "1";
  const rows = await c.env.DB.prepare(`SELECT * FROM payment_institutions WHERE ${includeArchived ? "1 = 1" : "status != 'ARCHIVED'"} ORDER BY display_order, name`).all<Row>();
  return ok(c, { institutions: rows.results });
});

payrollFoundationRoutes.post("/payment-institutions", requireAnyPermission(["payroll.payment_institutions.create", "payroll.payment_institutions.manage"]), async (c) => {
  const body = await c.req.json<Row>();
  const code = text(body.code).toUpperCase();
  const name = text(body.name);
  const type = text(body.type) || "BANK";
  if (!code || !name) return fail(c, 400, "VALIDATION_ERROR", "Code and name are required.");
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO payment_institutions (id, code, name, type, country_code, swift_code, display_order, created_by_user_id, updated_by_user_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, code, name, type, text(body.country_code) || null, text(body.swift_code) || null, numberValue(body.display_order, 100), c.get("currentUser").id, c.get("currentUser").id, body.metadata_json ? JSON.stringify(body.metadata_json) : null)
    .run();
  const institution = await readInstitution(c, id);
  await audit(c, "payroll.payment_institution.created", "payment_institution", id, { newValue: institution });
  return ok(c, { institution }, 201);
});

payrollFoundationRoutes.patch("/payment-institutions/:institutionId", requireAnyPermission(["payroll.payment_institutions.update", "payroll.payment_institutions.manage"]), async (c) => {
  const old = await readInstitution(c, c.req.param("institutionId"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Payment institution was not found.");
  const body = await c.req.json<Row>();
  await c.env.DB
    .prepare("UPDATE payment_institutions SET name = ?, type = ?, country_code = ?, swift_code = ?, is_active = ?, status = ?, display_order = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(text(body.name) || old.name, text(body.type) || old.type, text(body.country_code) || null, text(body.swift_code) || null, bool(body.is_active, Boolean(old.is_active)) ? 1 : 0, text(body.status) || old.status, numberValue(body.display_order, Number(old.display_order ?? 100)), c.get("currentUser").id, now(), old.id)
    .run();
  const institution = await readInstitution(c, String(old.id));
  await audit(c, "payroll.payment_institution.updated", "payment_institution", String(old.id), { oldValue: old, newValue: institution });
  return ok(c, { institution });
});

payrollFoundationRoutes.post("/payment-institutions/:institutionId/archive", requireAnyPermission(["payroll.payment_institutions.archive", "payroll.payment_institutions.manage"]), async (c) => {
  const old = await readInstitution(c, c.req.param("institutionId"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Payment institution was not found.");
  await c.env.DB.prepare("UPDATE payment_institutions SET status = 'ARCHIVED', is_active = 0, archived_by_user_id = ?, archived_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now(), now(), old.id).run();
  await audit(c, "payroll.payment_institution.archived", "payment_institution", String(old.id), { oldValue: old });
  return ok(c, { archived: true });
});

employeePayrollFoundationRoutes.get("/:employeeId/payment-methods", async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canViewEmployeePayrollFoundation(c, employeeId))) return fail(c, 404, "NOT_FOUND", "Employee payment methods were not found.");
  const sensitive = hasAny(c, ["employees.payment_methods.sensitive.view", "employees.payment_methods.manage", "payroll.payment_methods.manage", "payroll.manage"]);
  return ok(c, { payment_methods: await getEmployeePaymentMethods(c.env.DB, employeeId, sensitive) });
});

employeePayrollFoundationRoutes.post("/:employeeId/payment-methods", async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canManageEmployeePayrollFoundation(c, employeeId))) return fail(c, 404, "NOT_FOUND", "Employee payment methods were not found.");
  const body = await c.req.json<Row>();
  const methodType = text(body.payment_method_type);
  if (!["BANK_TRANSFER", "CASH", "CHEQUE_PLACEHOLDER", "MOBILE_WALLET_PLACEHOLDER", "OTHER"].includes(methodType)) return fail(c, 400, "VALIDATION_ERROR", "A valid payment method type is required.");
  if (methodType === "BANK_TRANSFER" && (!text(body.payment_institution_id) || !text(body.bank_account_name) || !text(body.bank_account_number))) return fail(c, 400, "VALIDATION_ERROR", "Bank transfer requires bank/payment institution, account name, and account number.");
  const institution = text(body.payment_institution_id) ? await readInstitution(c, text(body.payment_institution_id)) : null;
  if (text(body.payment_institution_id) && (!institution || text(institution.status) === "ARCHIVED")) return fail(c, 400, "VALIDATION_ERROR", "Selected payment institution is not active.");
  const id = crypto.randomUUID();
  const accountNumber = text(body.bank_account_number);
  if (bool(body.is_primary, false)) await c.env.DB.prepare("UPDATE employee_payment_methods SET is_primary = 0 WHERE employee_id = ? AND status = 'ACTIVE'").bind(employeeId).run();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_payment_methods
       (id, employee_id, payment_method_type, payment_institution_id, bank_name_snapshot, bank_account_name,
        bank_account_number_encrypted_or_plain_placeholder, bank_account_number_masked, iban_or_swift_placeholder,
        wallet_provider, wallet_number, cheque_payee_name, cash_collection_location_id, cash_collection_note,
        is_primary, allocation_type, allocation_percentage, allocation_amount, currency, effective_date, notes,
        created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employeeId, methodType, institution?.id ?? null, institution?.name ?? (text(body.bank_name_snapshot) || null), text(body.bank_account_name) || null, accountNumber || null, maskAccount(accountNumber), text(body.iban_or_swift_placeholder) || null, text(body.wallet_provider) || null, text(body.wallet_number) || null, text(body.cheque_payee_name) || null, text(body.cash_collection_location_id) || null, text(body.cash_collection_note) || null, bool(body.is_primary, false) ? 1 : 0, text(body.allocation_type) || "FULL", body.allocation_percentage ?? null, body.allocation_amount ?? null, text(body.currency) || "MVR", text(body.effective_date) || now().slice(0, 10), text(body.notes) || null, c.get("currentUser").id, c.get("currentUser").id)
    .run();
  const methods = await getEmployeePaymentMethods(c.env.DB, employeeId, true);
  await audit(c, "employee.payment_method.created", "employee_payment_method", id, { newValue: methods.find((method) => method.id === id) });
  return ok(c, { payment_method: methods.find((method) => method.id === id) }, 201);
});

employeePayrollFoundationRoutes.patch("/:employeeId/payment-methods/:methodId", async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canManageEmployeePayrollFoundation(c, employeeId))) return fail(c, 404, "NOT_FOUND", "Employee payment method was not found.");
  const old = await c.env.DB.prepare("SELECT * FROM employee_payment_methods WHERE id = ? AND employee_id = ?").bind(c.req.param("methodId"), employeeId).first<Row>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Employee payment method was not found.");
  const body = await c.req.json<Row>();
  if (bool(body.is_primary, Boolean(old.is_primary))) await c.env.DB.prepare("UPDATE employee_payment_methods SET is_primary = 0 WHERE employee_id = ? AND id != ? AND status = 'ACTIVE'").bind(employeeId, old.id).run();
  const methodType = text(body.payment_method_type) || text(old.payment_method_type);
  if (!["BANK_TRANSFER", "CASH", "CHEQUE_PLACEHOLDER", "MOBILE_WALLET_PLACEHOLDER", "OTHER"].includes(methodType)) return fail(c, 400, "VALIDATION_ERROR", "A valid payment method type is required.");
  const requestedInstitutionId = hasInput(body, "payment_institution_id") ? text(body.payment_institution_id) : text(old.payment_institution_id);
  const institution = requestedInstitutionId ? await readInstitution(c, requestedInstitutionId) : null;
  if (requestedInstitutionId && (!institution || text(institution.status) === "ARCHIVED" || !bool(institution.is_active, true))) return fail(c, 400, "VALIDATION_ERROR", "Selected payment institution is not active.");
  const accountName = hasInput(body, "bank_account_name") ? text(body.bank_account_name) : text(old.bank_account_name);
  const accountNumber = text(body.bank_account_number) || text(old.bank_account_number_encrypted_or_plain_placeholder);
  if (methodType === "BANK_TRANSFER" && (!requestedInstitutionId || !accountName || !accountNumber)) return fail(c, 400, "VALIDATION_ERROR", "Bank transfer requires bank/payment institution, account name, and account number.");
  const savedInstitutionId = methodType === "BANK_TRANSFER" ? requestedInstitutionId : null;
  const bankNameSnapshot = institution?.name ?? (savedInstitutionId ? text(old.bank_name_snapshot) || null : null);
  await c.env.DB
    .prepare(
      `UPDATE employee_payment_methods SET payment_method_type = ?, payment_institution_id = ?, bank_name_snapshot = ?, bank_account_name = ?, bank_account_number_encrypted_or_plain_placeholder = ?,
        bank_account_number_masked = ?, wallet_provider = ?, wallet_number = ?, cheque_payee_name = ?, cash_collection_location_id = ?,
        cash_collection_note = ?, is_primary = ?, allocation_type = ?, allocation_percentage = ?, allocation_amount = ?, currency = ?,
        status = ?, effective_date = ?, end_date = ?, notes = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ? AND employee_id = ?`
    )
    .bind(methodType, savedInstitutionId || null, bankNameSnapshot, accountName || null, accountNumber || null, maskAccount(accountNumber), text(body.wallet_provider) || old.wallet_provider, text(body.wallet_number) || old.wallet_number, text(body.cheque_payee_name) || old.cheque_payee_name, text(body.cash_collection_location_id) || old.cash_collection_location_id, text(body.cash_collection_note) || old.cash_collection_note, bool(body.is_primary, Boolean(old.is_primary)) ? 1 : 0, text(body.allocation_type) || old.allocation_type, body.allocation_percentage ?? old.allocation_percentage, body.allocation_amount ?? old.allocation_amount, text(body.currency) || old.currency, text(body.status) || old.status, text(body.effective_date) || old.effective_date, text(body.end_date) || old.end_date, text(body.notes) || old.notes, c.get("currentUser").id, now(), old.id, employeeId)
    .run();
  const method = (await getEmployeePaymentMethods(c.env.DB, employeeId, true)).find((row) => row.id === old.id);
  await audit(c, "employee.payment_method.updated", "employee_payment_method", String(old.id), { oldValue: old, newValue: method });
  return ok(c, { payment_method: method });
});

employeePayrollFoundationRoutes.post("/:employeeId/payment-methods/:methodId/verify", requireAnyPermission(["employees.payment_methods.verify", "employees.payment_methods.manage", "payroll.payment_methods.manage"]), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee payment method was not found.");
  await c.env.DB.prepare("UPDATE employee_payment_methods SET verification_status = 'VERIFIED', verified_by_user_id = ?, verified_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ? AND employee_id = ?").bind(c.get("currentUser").id, now(), c.get("currentUser").id, now(), c.req.param("methodId"), employeeId).run();
  await audit(c, "employee.payment_method.verified", "employee_payment_method", c.req.param("methodId"));
  return ok(c, { verified: true });
});

employeePayrollFoundationRoutes.post("/:employeeId/payment-methods/:methodId/archive", requireAnyPermission(["employees.payment_methods.archive", "employees.payment_methods.manage", "payroll.payment_methods.manage"]), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee payment method was not found.");
  await c.env.DB.prepare("UPDATE employee_payment_methods SET status = 'ARCHIVED', archived_by_user_id = ?, archived_at = ?, updated_at = ? WHERE id = ? AND employee_id = ?").bind(c.get("currentUser").id, now(), now(), c.req.param("methodId"), employeeId).run();
  await audit(c, "employee.payment_method.archived", "employee_payment_method", c.req.param("methodId"));
  return ok(c, { archived: true });
});

async function listBankLoans(c: Context<AppBindings>, employeeId?: string) {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  if (employeeId) { conditions.push("ebl.employee_id = ?"); params.push(employeeId); }
  const rows = await c.env.DB
    .prepare(
      `SELECT ebl.*, e.employee_no, e.full_name AS employee_name, pi.name AS payment_institution_name
       FROM employee_bank_loans ebl
       INNER JOIN employees e ON e.id = ebl.employee_id
       INNER JOIN payment_institutions pi ON pi.id = ebl.payment_institution_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ebl.created_at DESC`
    )
    .bind(...params)
    .all<Row>();
  const visible = [];
  for (const row of rows.results) {
    if (await canAccessEmployee(c.env.DB, c.get("currentUser"), String(row.employee_id), "payroll", "view")) visible.push(row);
  }
  return visible;
}

payrollFoundationRoutes.get("/bank-loans", requireAnyPermission(["payroll.bank_loans.view", "payroll.bank_loans.manage", "payroll.view"]), async (c) => ok(c, { loans: await listBankLoans(c) }));

payrollFoundationRoutes.post("/employees/:employeeId/bank-loans", requireAnyPermission(["payroll.bank_loans.create", "payroll.bank_loans.manage"]), async (c) => {
  const employeeId = c.req.param("employeeId") ?? "";
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const body = await c.req.json<Row>();
  const institution = await readInstitution(c, text(body.payment_institution_id));
  if (!institution || text(institution.status) === "ARCHIVED") return fail(c, 400, "VALIDATION_ERROR", "Active bank/payment institution is required.");
  const loanInput = readLoanInput(body);
  if ("error" in loanInput) return fail(c, 400, "VALIDATION_ERROR", loanInput.error);
  const eligibility = await loanEligibilitySnapshot(c, employeeId, String(institution.id));
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_bank_loans
       (id, employee_id, payment_institution_id, bank_name_snapshot, loan_reference_number, loan_type,
        original_loan_amount, outstanding_balance, monthly_installment_amount, deduction_start_date, deduction_end_date,
        employer_undertaking_required, employer_undertaking_reference, employer_undertaking_status,
        source, status, approval_status, priority_number, partial_deduction_allowed,
        salary_payment_method_snapshot, salary_routed_to_bank, bank_statement_months_available, salary_slips_months_available,
        eligibility_status, eligibility_reason, notes, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employeeId, institution.id, institution.name, loanInput.loan_reference_number, text(body.loan_type) || "SALARY_DEDUCTION", loanInput.original_loan_amount, loanInput.outstanding_balance, loanInput.monthly_installment_amount, loanInput.deduction_start_date, loanInput.deduction_end_date, bool(body.employer_undertaking_required, false) ? 1 : 0, text(body.employer_undertaking_reference) || null, bool(body.employer_undertaking_required, false) ? "REQUIRED" : "NOT_REQUIRED", text(body.source) || "MANUAL", loanInput.priority_number, body.partial_deduction_allowed ?? null, eligibility.salary_payment_method_snapshot, eligibility.salary_routed_to_bank, body.bank_statement_months_available ?? null, body.salary_slips_months_available ?? null, eligibility.eligibility_status, eligibility.eligibility_reason, text(body.notes) || null, c.get("currentUser").id, c.get("currentUser").id)
    .run();
  await audit(c, "payroll.bank_loan.created", "employee_bank_loan", id, { newValue: body });
  return ok(c, { loan: (await listBankLoans(c, employeeId)).find((loan) => loan.id === id) }, 201);
});

payrollFoundationRoutes.patch("/bank-loans/:loanId", requireAnyPermission(["payroll.bank_loans.update", "payroll.bank_loans.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM employee_bank_loans WHERE id = ?").bind(c.req.param("loanId") ?? "").first<Row>();
  if (!old || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Bank loan was not found.");
  const body = await c.req.json<Row>();
  const loanInput = readLoanInput(body, old);
  if ("error" in loanInput) return fail(c, 400, "VALIDATION_ERROR", loanInput.error);
  await c.env.DB.prepare("UPDATE employee_bank_loans SET loan_reference_number = ?, monthly_installment_amount = ?, original_loan_amount = ?, outstanding_balance = ?, deduction_start_date = ?, deduction_end_date = ?, priority_number = ?, partial_deduction_allowed = ?, eligibility_status = ?, eligibility_reason = ?, notes = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(loanInput.loan_reference_number, loanInput.monthly_installment_amount, loanInput.original_loan_amount, loanInput.outstanding_balance, loanInput.deduction_start_date, loanInput.deduction_end_date, loanInput.priority_number, body.partial_deduction_allowed ?? old.partial_deduction_allowed, text(body.eligibility_status) || old.eligibility_status, text(body.eligibility_reason) || old.eligibility_reason, text(body.notes) || old.notes, c.get("currentUser").id, now(), old.id).run();
  await audit(c, "payroll.bank_loan.updated", "employee_bank_loan", String(old.id), { oldValue: old, newValue: body });
  return ok(c, { loan: await c.env.DB.prepare("SELECT * FROM employee_bank_loans WHERE id = ?").bind(old.id).first<Row>() });
});

for (const [route, status, approval, permission, action] of [
  ["approve", "ACTIVE", "APPROVED", "payroll.bank_loans.approve", "payroll.bank_loan.approved"],
  ["pause", "PAUSED", null, "payroll.bank_loans.pause", "payroll.bank_loan.paused"],
  ["cancel", "CANCELLED", null, "payroll.bank_loans.cancel", "payroll.bank_loan.cancelled"]
] as const) {
  payrollFoundationRoutes.post(`/bank-loans/:loanId/${route}`, requireAnyPermission([permission, "payroll.bank_loans.manage"]), async (c) => {
    const old = await c.env.DB.prepare("SELECT * FROM employee_bank_loans WHERE id = ?").bind(c.req.param("loanId")).first<Row>();
    if (!old || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Bank loan was not found.");
    await c.env.DB.prepare(`UPDATE employee_bank_loans SET status = ?, approval_status = COALESCE(?, approval_status), updated_by_user_id = ?, updated_at = ?, approved_by_user_id = CASE WHEN ? = 'APPROVED' THEN ? ELSE approved_by_user_id END, approved_at = CASE WHEN ? = 'APPROVED' THEN ? ELSE approved_at END WHERE id = ?`).bind(status, approval, c.get("currentUser").id, now(), approval, c.get("currentUser").id, approval, now(), old.id).run();
    await audit(c, action, "employee_bank_loan", String(old.id), { oldValue: old });
    return ok(c, { loan: await c.env.DB.prepare("SELECT * FROM employee_bank_loans WHERE id = ?").bind(old.id).first<Row>() });
  });
}

payrollFoundationRoutes.get("/bank-loan-payments", requireAnyPermission(["payroll.bank_loan_payments.view", "payroll.bank_loan_payments.manage", "payroll.bank_loans.view"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT eblp.*, e.employee_no, e.full_name AS employee_name FROM employee_bank_loan_payments eblp INNER JOIN employees e ON e.id = eblp.employee_id ORDER BY eblp.created_at DESC LIMIT 500").all<Row>()).results;
  const visible = [];
  for (const row of rows) if (await canAccessEmployee(c.env.DB, c.get("currentUser"), String(row.employee_id), "payroll", "view")) visible.push(row);
  return ok(c, { payments: visible });
});

payrollFoundationRoutes.post("/bank-loan-payments/:paymentId/confirm-paid-to-bank", requireAnyPermission(["payroll.bank_loan_payments.confirm", "payroll.bank_loan_payments.manage"]), async (c) => {
  const payment = await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE id = ?").bind(c.req.param("paymentId")).first<Row>();
  if (!payment || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(payment.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Bank loan payment was not found.");
  if (bool(payment.skipped_due_to_minimum_net_salary, false) || bool(payment.bank_direct_collection_required, false)) return fail(c, 400, "DIRECT_COLLECTION_REQUIRED", "This skipped loan installment is marked for direct bank collection from the employee, not employer remittance.");
  const body = await c.req.json<Row>();
  await c.env.DB.prepare("UPDATE employee_bank_loan_payments SET payment_status = 'MANUALLY_CONFIRMED_PAID_TO_BANK', remittance_reference = ?, confirmed_by_user_id = ?, confirmed_at = ?, notes = ?, updated_at = ? WHERE id = ?").bind(text(body.remittance_reference) || null, c.get("currentUser").id, now(), text(body.notes) || null, now(), payment.id).run();
  await audit(c, "payroll.bank_loan_payment.confirmed_paid_to_bank", "employee_bank_loan_payment", String(payment.id), { oldValue: payment, reason: text(body.notes) || null });
  return ok(c, { payment: await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE id = ?").bind(payment.id).first<Row>() });
});

payrollFoundationRoutes.post("/bank-loan-payments/:paymentId/mark-bank-notified", requireAnyPermission(["payroll.bank_loan_payments.confirm", "payroll.bank_loan_payments.manage"]), async (c) => {
  const payment = await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE id = ?").bind(c.req.param("paymentId")).first<Row>();
  if (!payment || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(payment.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Bank loan payment was not found.");
  const body = await c.req.json<Row>();
  const reference = text(body.bank_notification_reference ?? body.reference);
  const note = text(body.bank_notification_note ?? body.note);
  if (!reference && !note) return fail(c, 400, "VALIDATION_ERROR", "Bank notification reference or note is required.");
  await c.env.DB
    .prepare(
      `UPDATE employee_bank_loan_payments
       SET bank_notification_status = 'BANK_NOTIFIED', bank_notification_reference = ?, bank_notification_note = ?,
         bank_notified_by_user_id = ?, bank_notified_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(reference || null, note || null, c.get("currentUser").id, now(), now(), payment.id)
    .run();
  const saved = await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE id = ?").bind(payment.id).first<Row>();
  await audit(c, "payroll.bank_loan_payment.bank_notified", "employee_bank_loan_payment", String(payment.id), { oldValue: payment, newValue: saved, reason: note || reference });
  return ok(c, { payment: saved });
});

payrollFoundationRoutes.get("/bank-loan-eligibility-rules", requireAnyPermission(["payroll.bank_loans.view", "payroll.bank_loans.manage"]), async (c) => ok(c, { rules: (await c.env.DB.prepare("SELECT bler.*, pi.name AS payment_institution_name FROM bank_loan_eligibility_rules bler LEFT JOIN payment_institutions pi ON pi.id = bler.payment_institution_id WHERE bler.status != 'ARCHIVED' ORDER BY pi.name, bler.loan_product_name").all<Row>()).results }));
payrollFoundationRoutes.post("/bank-loan-eligibility-rules", requireAnyPermission(["payroll.bank_loans.manage"]), async (c) => {
  const body = await c.req.json<Row>();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO bank_loan_eligibility_rules (id, payment_institution_id, loan_product_name, required_statement_months, required_salary_slip_months, employer_salary_undertaking_required, minimum_employment_months, cash_salary_eligibility_rule, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, text(body.payment_institution_id) || null, text(body.loan_product_name) || null, body.required_statement_months ?? null, body.required_salary_slip_months ?? null, bool(body.employer_salary_undertaking_required, false) ? 1 : 0, body.minimum_employment_months ?? null, text(body.cash_salary_eligibility_rule) || "INELIGIBLE_BY_DEFAULT", c.get("currentUser").id, c.get("currentUser").id).run();
  await audit(c, "payroll.bank_loan_eligibility_rule.created", "bank_loan_eligibility_rule", id, { newValue: body });
  return ok(c, { rule: await c.env.DB.prepare("SELECT * FROM bank_loan_eligibility_rules WHERE id = ?").bind(id).first<Row>() }, 201);
});

payrollFoundationRoutes.patch("/bank-loan-eligibility-rules/:ruleId", requireAnyPermission(["payroll.bank_loans.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM bank_loan_eligibility_rules WHERE id = ?").bind(c.req.param("ruleId")).first<Row>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Bank loan eligibility rule was not found.");
  const body = await c.req.json<Row>();
  await c.env.DB
    .prepare(
      `UPDATE bank_loan_eligibility_rules SET payment_institution_id = ?, loan_product_name = ?, salary_routing_required = ?,
        required_statement_months = ?, required_salary_slip_months = ?, employer_salary_undertaking_required = ?,
        minimum_employment_months = ?, bank_instruction_document_required = ?, allowed_employee_types_json = ?,
        cash_salary_eligibility_rule = ?, override_allowed = ?, override_requires_reason = ?, override_requires_document = ?,
        status = ?, effective_from = ?, effective_to = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`
    )
    .bind(
      text(body.payment_institution_id) || old.payment_institution_id,
      text(body.loan_product_name) || old.loan_product_name,
      bool(body.salary_routing_required, Boolean(old.salary_routing_required)) ? 1 : 0,
      body.required_statement_months ?? old.required_statement_months,
      body.required_salary_slip_months ?? old.required_salary_slip_months,
      bool(body.employer_salary_undertaking_required, Boolean(old.employer_salary_undertaking_required)) ? 1 : 0,
      body.minimum_employment_months ?? old.minimum_employment_months,
      bool(body.bank_instruction_document_required, Boolean(old.bank_instruction_document_required)) ? 1 : 0,
      typeof body.allowed_employee_types_json === "string" ? body.allowed_employee_types_json : old.allowed_employee_types_json,
      text(body.cash_salary_eligibility_rule) || old.cash_salary_eligibility_rule,
      bool(body.override_allowed, Boolean(old.override_allowed)) ? 1 : 0,
      bool(body.override_requires_reason, Boolean(old.override_requires_reason)) ? 1 : 0,
      bool(body.override_requires_document, Boolean(old.override_requires_document)) ? 1 : 0,
      text(body.status) || old.status,
      text(body.effective_from) || old.effective_from,
      text(body.effective_to) || old.effective_to,
      c.get("currentUser").id,
      now(),
      old.id
    )
    .run();
  const rule = await c.env.DB.prepare("SELECT * FROM bank_loan_eligibility_rules WHERE id = ?").bind(old.id).first<Row>();
  await audit(c, "payroll.bank_loan_eligibility_rule.updated", "bank_loan_eligibility_rule", String(old.id), { oldValue: old, newValue: rule });
  return ok(c, { rule });
});

payrollFoundationRoutes.post("/bank-loan-eligibility-rules/:ruleId/archive", requireAnyPermission(["payroll.bank_loans.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM bank_loan_eligibility_rules WHERE id = ?").bind(c.req.param("ruleId")).first<Row>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Bank loan eligibility rule was not found.");
  await c.env.DB.prepare("UPDATE bank_loan_eligibility_rules SET status = 'ARCHIVED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now(), old.id).run();
  await audit(c, "payroll.bank_loan_eligibility_rule.archived", "bank_loan_eligibility_rule", String(old.id), { oldValue: old });
  return ok(c, { archived: true });
});

payrollFoundationRoutes.get("/bank-loan-remittance-batches", requireAnyPermission(["payroll.bank_loan_remittance.view", "payroll.bank_loan_remittance.manage"]), async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT blrb.*, pp.period_month, pp.period_year, pi.name AS payment_institution_name
       FROM bank_loan_remittance_batches blrb
       INNER JOIN payroll_periods pp ON pp.id = blrb.payroll_period_id
       INNER JOIN payment_institutions pi ON pi.id = blrb.payment_institution_id
       ORDER BY blrb.created_at DESC`
    )
    .all<Row>();
  return ok(c, { batches: rows.results });
});

payrollFoundationRoutes.post("/bank-loan-remittance-batches", requireAnyPermission(["payroll.bank_loan_remittance.prepare", "payroll.bank_loan_remittance.manage"]), async (c) => {
  const body = await c.req.json<Row>();
  const periodId = text(body.payroll_period_id);
  const institutionId = text(body.payment_institution_id);
  if (!periodId || !institutionId) return fail(c, 400, "VALIDATION_ERROR", "Payroll period and bank/payment institution are required.");
  const eligiblePayments = (await c.env.DB
    .prepare(
      `SELECT * FROM employee_bank_loan_payments
       WHERE payroll_period_id = ? AND payment_institution_id = ?
       AND payment_status IN ('DEDUCTED_IN_PAYROLL', 'PARTIAL')
       AND remittance_batch_id IS NULL`
    )
    .bind(periodId, institutionId)
    .all<Row>()).results;
  if (eligiblePayments.length === 0) return fail(c, 400, "NO_PAYMENTS", "No prepared bank loan deductions are available for this batch.");
  const id = crypto.randomUUID();
  const total = eligiblePayments.reduce((sum, row) => sum + numberValue(row.deducted_amount), 0);
  await c.env.DB
    .prepare(
      `INSERT INTO bank_loan_remittance_batches
       (id, payroll_period_id, payment_institution_id, period_label, total_deducted_amount, employee_count, status, prepared_by_user_id, prepared_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, 'PREPARED', ?, ?, ?)`
    )
    .bind(id, periodId, institutionId, text(body.period_label) || periodId, Number(total.toFixed(2)), new Set(eligiblePayments.map((row) => row.employee_id)).size, c.get("currentUser").id, now(), JSON.stringify({ direct_bank_integration: false, official_bank_export_generated: false }))
    .run();
  for (const payment of eligiblePayments) {
    await c.env.DB
      .prepare("INSERT INTO bank_loan_remittance_batch_items (id, remittance_batch_id, employee_bank_loan_payment_id, employee_id, deducted_amount, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, payment.id, payment.employee_id, payment.deducted_amount, JSON.stringify({ manual_confirmation_only: true }))
      .run();
    await c.env.DB.prepare("UPDATE employee_bank_loan_payments SET remittance_batch_id = ?, payment_status = 'PREPARED_FOR_BANK', updated_at = ? WHERE id = ?").bind(id, now(), payment.id).run();
  }
  await audit(c, "payroll.bank_loan_remittance.prepared", "bank_loan_remittance_batch", id, { newValue: { payment_count: eligiblePayments.length, total } });
  return ok(c, { batch: await c.env.DB.prepare("SELECT * FROM bank_loan_remittance_batches WHERE id = ?").bind(id).first<Row>() }, 201);
});

payrollFoundationRoutes.get("/bank-loan-remittance-batches/:batchId", requireAnyPermission(["payroll.bank_loan_remittance.view", "payroll.bank_loan_remittance.manage"]), async (c) => {
  const batch = await c.env.DB.prepare("SELECT blrb.*, pi.name AS payment_institution_name FROM bank_loan_remittance_batches blrb INNER JOIN payment_institutions pi ON pi.id = blrb.payment_institution_id WHERE blrb.id = ?").bind(c.req.param("batchId")).first<Row>();
  if (!batch) return fail(c, 404, "NOT_FOUND", "Bank loan remittance batch was not found.");
  const items = await c.env.DB
    .prepare(
      `SELECT bli.*, e.employee_no, e.full_name AS employee_name, eblp.loan_reference_number_snapshot
       FROM bank_loan_remittance_batch_items bli
       INNER JOIN employees e ON e.id = bli.employee_id
       INNER JOIN employee_bank_loan_payments eblp ON eblp.id = bli.employee_bank_loan_payment_id
       WHERE bli.remittance_batch_id = ?
       ORDER BY e.employee_no`
    )
    .bind(batch.id)
    .all<Row>();
  return ok(c, { batch, items: items.results });
});

payrollFoundationRoutes.post("/bank-loan-remittance-batches/:batchId/confirm", requireAnyPermission(["payroll.bank_loan_remittance.confirm", "payroll.bank_loan_remittance.manage"]), async (c) => {
  const batch = await c.env.DB.prepare("SELECT * FROM bank_loan_remittance_batches WHERE id = ?").bind(c.req.param("batchId")).first<Row>();
  if (!batch) return fail(c, 404, "NOT_FOUND", "Bank loan remittance batch was not found.");
  const body = await c.req.json<Row>();
  if (!text(body.remittance_reference) || !text(body.confirmation_note)) return fail(c, 400, "VALIDATION_ERROR", "Remittance reference and confirmation note are required.");
  await c.env.DB.prepare("UPDATE bank_loan_remittance_batches SET status = 'MANUALLY_CONFIRMED_PAID_TO_BANK', confirmed_by_user_id = ?, confirmed_at = ?, remittance_reference = ?, confirmation_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now(), text(body.remittance_reference), text(body.confirmation_note), now(), batch.id).run();
  await c.env.DB.prepare("UPDATE bank_loan_remittance_batch_items SET status = 'CONFIRMED' WHERE remittance_batch_id = ?").bind(batch.id).run();
  await c.env.DB.prepare("UPDATE employee_bank_loan_payments SET payment_status = 'MANUALLY_CONFIRMED_PAID_TO_BANK', remittance_reference = ?, confirmed_by_user_id = ?, confirmed_at = ?, updated_at = ? WHERE remittance_batch_id = ?").bind(text(body.remittance_reference), c.get("currentUser").id, now(), now(), batch.id).run();
  await audit(c, "payroll.bank_loan_remittance.confirmed", "bank_loan_remittance_batch", String(batch.id), { oldValue: batch, reason: text(body.confirmation_note) });
  return ok(c, { confirmed: true });
});

payrollFoundationRoutes.get("/reports/bank-loan-summary", requireAnyPermission(["payroll.reports.view", "payroll.bank_loan_payments.view", "payroll.bank_loan_remittance.view"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT payment_institution_id, bank_name_snapshot, COUNT(DISTINCT employee_id) AS employee_count, SUM(deducted_amount) AS total_deduction_amount, SUM(shortfall_amount) AS total_shortfall_amount, SUM(CASE WHEN skipped_due_to_minimum_net_salary = 1 THEN scheduled_installment_amount ELSE 0 END) AS total_direct_collection_amount, bank_notification_status, payment_status FROM employee_bank_loan_payments GROUP BY payment_institution_id, bank_name_snapshot, payment_status, bank_notification_status ORDER BY bank_name_snapshot").all<Row>()).results;
  return ok(c, { reports: rows });
});

payrollFoundationRoutes.get("/reports/bank-loan-shortfalls", requireAnyPermission(["payroll.reports.view", "payroll.bank_loan_payments.view"]), async (c) => ok(c, { reports: (await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE shortfall_amount > 0 ORDER BY created_at DESC").all<Row>()).results }));

payrollFoundationRoutes.get("/custom-deduction-templates", requireAnyPermission(["payroll.custom_deduction_templates.view", "payroll.custom_deduction_templates.manage", "payroll.view"]), async (c) => {
  const includeArchived = c.req.query("include_archived") === "1";
  const rows = await c.env.DB
    .prepare(`SELECT * FROM custom_deduction_templates WHERE ${includeArchived ? "1 = 1" : "status != 'ARCHIVED'"} ORDER BY status, category, name`)
    .all<Row>();
  return ok(c, { templates: rows.results });
});

payrollFoundationRoutes.post("/custom-deduction-templates", requireAnyPermission(["payroll.custom_deduction_templates.create", "payroll.custom_deduction_templates.manage"]), async (c) => {
  const body = await c.req.json<Row>();
  const input = readCustomDeductionTemplateInput(body);
  if ("error" in input) return fail(c, 400, "VALIDATION_ERROR", input.error ?? "Validation failed.");
  const id = crypto.randomUUID();
  try {
    await c.env.DB
      .prepare(
        `INSERT INTO custom_deduction_templates
         (id, code, name, description, category, deduction_type, amount_type, default_amount, default_percentage,
          default_currency, default_installment_count, default_recurrence_interval, default_priority_number,
          affects_net_salary, show_on_payslip, show_in_self_service, require_employee_acknowledgement_placeholder,
          require_approval, require_document, allow_employee_override_amount, allow_installment_override,
          allow_pause_resume, include_in_final_settlement, linked_module, status, created_by_user_id, updated_by_user_id, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.code, input.name, input.description, input.category, input.deduction_type, input.amount_type, input.default_amount, input.default_percentage, input.default_currency, input.default_installment_count, input.default_recurrence_interval, input.default_priority_number, input.affects_net_salary, input.show_on_payslip, input.show_in_self_service, input.require_employee_acknowledgement_placeholder, input.require_approval, input.require_document, input.allow_employee_override_amount, input.allow_installment_override, input.allow_pause_resume, input.include_in_final_settlement, input.linked_module, input.status, c.get("currentUser").id, c.get("currentUser").id, input.metadata_json)
      .run();
  } catch {
    return fail(c, 409, "CUSTOM_DEDUCTION_TEMPLATE_DUPLICATE", "Template code must be unique.");
  }
  const template = await readCustomDeductionTemplate(c, id);
  await audit(c, "payroll.custom_deduction_template.created", "custom_deduction_template", id, { newValue: template });
  return ok(c, { template }, 201);
});

payrollFoundationRoutes.patch("/custom-deduction-templates/:templateId", requireAnyPermission(["payroll.custom_deduction_templates.update", "payroll.custom_deduction_templates.manage"]), async (c) => {
  const old = await readCustomDeductionTemplate(c, c.req.param("templateId") ?? "");
  if (!old) return fail(c, 404, "CUSTOM_DEDUCTION_TEMPLATE_NOT_FOUND", "Custom deduction template was not found.");
  const body = await c.req.json<Row>();
  const input = readCustomDeductionTemplateInput(body, old);
  if ("error" in input) return fail(c, 400, "VALIDATION_ERROR", input.error ?? "Validation failed.");
  try {
    await c.env.DB
      .prepare(
        `UPDATE custom_deduction_templates SET code = ?, name = ?, description = ?, category = ?, deduction_type = ?,
          amount_type = ?, default_amount = ?, default_percentage = ?, default_currency = ?, default_installment_count = ?,
          default_recurrence_interval = ?, default_priority_number = ?, affects_net_salary = ?, show_on_payslip = ?,
          show_in_self_service = ?, require_employee_acknowledgement_placeholder = ?, require_approval = ?, require_document = ?,
          allow_employee_override_amount = ?, allow_installment_override = ?, allow_pause_resume = ?,
          include_in_final_settlement = ?, linked_module = ?, status = ?, updated_by_user_id = ?, updated_at = ?, metadata_json = ?
         WHERE id = ?`
      )
      .bind(input.code, input.name, input.description, input.category, input.deduction_type, input.amount_type, input.default_amount, input.default_percentage, input.default_currency, input.default_installment_count, input.default_recurrence_interval, input.default_priority_number, input.affects_net_salary, input.show_on_payslip, input.show_in_self_service, input.require_employee_acknowledgement_placeholder, input.require_approval, input.require_document, input.allow_employee_override_amount, input.allow_installment_override, input.allow_pause_resume, input.include_in_final_settlement, input.linked_module, input.status, c.get("currentUser").id, now(), input.metadata_json, old.id)
      .run();
  } catch {
    return fail(c, 409, "CUSTOM_DEDUCTION_TEMPLATE_DUPLICATE", "Template code must be unique.");
  }
  const template = await readCustomDeductionTemplate(c, String(old.id));
  await audit(c, "payroll.custom_deduction_template.updated", "custom_deduction_template", String(old.id), { oldValue: old, newValue: template });
  return ok(c, { template });
});

payrollFoundationRoutes.post("/custom-deduction-templates/:templateId/archive", requireAnyPermission(["payroll.custom_deduction_templates.archive", "payroll.custom_deduction_templates.manage"]), async (c) => {
  const old = await readCustomDeductionTemplate(c, c.req.param("templateId") ?? "");
  if (!old) return fail(c, 404, "CUSTOM_DEDUCTION_TEMPLATE_NOT_FOUND", "Custom deduction template was not found.");
  await c.env.DB.prepare("UPDATE custom_deduction_templates SET status = 'ARCHIVED', archived_by_user_id = ?, archived_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now(), c.get("currentUser").id, now(), old.id).run();
  await audit(c, "payroll.custom_deduction_template.archived", "custom_deduction_template", String(old.id), { oldValue: old });
  return ok(c, { archived: true });
});

async function listEmployeeCustomDeductions(c: Context<AppBindings>, employeeId?: string) {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  if (employeeId) { conditions.push("ecd.employee_id = ?"); params.push(employeeId); }
  const rows = (await c.env.DB
    .prepare(
      `SELECT ecd.*, e.employee_no, e.full_name AS employee_name,
        d.name AS department_name, l.name AS location_name,
        cdt.code AS template_code, cdt.name AS template_name
       FROM employee_custom_deductions ecd
       INNER JOIN employees e ON e.id = ecd.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       INNER JOIN custom_deduction_templates cdt ON cdt.id = ecd.template_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ecd.created_at DESC`
    )
    .bind(...params)
    .all<Row>()).results;
  const visible: Row[] = [];
  for (const row of rows) {
    if (await canViewEmployeeCustomDeductions(c, String(row.employee_id))) visible.push(row);
  }
  return visible;
}

payrollFoundationRoutes.get("/custom-deductions", requireAnyPermission(["payroll.employee_custom_deductions.view", "payroll.employee_custom_deductions.manage", "payroll.view"]), async (c) => {
  return ok(c, { deductions: await listEmployeeCustomDeductions(c) });
});

employeePayrollFoundationRoutes.get("/:employeeId/custom-deductions", async (c) => {
  const employeeId = c.req.param("employeeId") ?? "";
  if (!(await canViewEmployeeCustomDeductions(c, employeeId))) return fail(c, 404, "EMPLOYEE_CUSTOM_DEDUCTION_NOT_FOUND", "Custom deductions were not found.");
  const deductions = await listEmployeeCustomDeductions(c, employeeId);
  const applications = (await c.env.DB.prepare("SELECT * FROM employee_custom_deduction_applications WHERE employee_id = ? ORDER BY created_at DESC LIMIT 200").bind(employeeId).all<Row>()).results;
  return ok(c, { deductions, applications });
});

employeePayrollFoundationRoutes.post("/:employeeId/custom-deductions", async (c) => {
  const disabled = await requireCustomDeductionsEnabled(c);
  if (disabled) return disabled;
  const employeeId = c.req.param("employeeId") ?? "";
  if (!(await canManageEmployeeCustomDeductions(c, employeeId))) return fail(c, 404, "EMPLOYEE_CUSTOM_DEDUCTION_NOT_FOUND", "Employee was not found.");
  const body = await c.req.json<Row>();
  const template = await readCustomDeductionTemplate(c, text(body.template_id));
  if (!template || text(template.status) !== "ACTIVE") return fail(c, 404, "CUSTOM_DEDUCTION_TEMPLATE_NOT_FOUND", "Active custom deduction template was not found.");
  const settings = await getPayrollSettingsRow(c);
  const input = readEmployeeCustomDeductionInput(body, template, settings);
  if ("error" in input) return fail(c, 400, "VALIDATION_ERROR", input.error ?? "Validation failed.");
  if (!CUSTOM_DEDUCTION_APPROVAL_STATUSES.has(input.approval_status)) return fail(c, 400, "VALIDATION_ERROR", "Invalid approval status.");
  if (!CUSTOM_DEDUCTION_STATUSES.has(input.status)) return fail(c, 400, "VALIDATION_ERROR", "Invalid custom deduction status.");
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_custom_deductions
       (id, employee_id, template_id, template_code_snapshot, template_name_snapshot, category_snapshot,
        deduction_type, amount_type, assigned_amount, assigned_percentage, currency, total_amount, remaining_balance,
        installment_count, installment_amount, recurrence_interval, payroll_period_id_start, payroll_period_id_end,
        start_date, end_date, effective_from, effective_to, priority_number, show_on_payslip, show_in_self_service,
        include_in_final_settlement, approval_status, status, source, source_reference_type, source_reference_id,
        supporting_document_id, reason, notes, created_by_user_id, updated_by_user_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employeeId, template.id, input.template_code_snapshot, input.template_name_snapshot, input.category_snapshot, input.deduction_type, input.amount_type, input.assigned_amount, input.assigned_percentage, input.currency, input.total_amount, input.remaining_balance, input.installment_count, input.installment_amount, input.recurrence_interval, input.payroll_period_id_start, input.payroll_period_id_end, input.start_date, input.end_date, input.effective_from, input.effective_to, input.priority_number, input.show_on_payslip, input.show_in_self_service, input.include_in_final_settlement, input.approval_status, input.status, input.source, input.source_reference_type, input.source_reference_id, input.supporting_document_id, input.reason, input.notes, c.get("currentUser").id, c.get("currentUser").id, input.metadata_json)
    .run();
  const saved = (await listEmployeeCustomDeductions(c, employeeId)).find((row) => row.id === id);
  await audit(c, "payroll.employee_custom_deduction.created", "employee_custom_deduction", id, { newValue: saved, reason: input.reason });
  return ok(c, { deduction: saved }, 201);
});

payrollFoundationRoutes.patch("/custom-deductions/:deductionId", requireAnyPermission(["payroll.employee_custom_deductions.update", "payroll.employee_custom_deductions.manage", "employees.custom_deductions.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM employee_custom_deductions WHERE id = ?").bind(c.req.param("deductionId") ?? "").first<Row>();
  if (!old || !(await canManageEmployeeCustomDeductions(c, String(old.employee_id)))) return fail(c, 404, "EMPLOYEE_CUSTOM_DEDUCTION_NOT_FOUND", "Employee custom deduction was not found.");
  if (["COMPLETED", "CANCELLED", "ARCHIVED"].includes(text(old.status))) return fail(c, 400, "CUSTOM_DEDUCTION_ALREADY_COMPLETED", "Completed, cancelled, or archived deductions cannot be edited.");
  const body = await c.req.json<Row>();
  const template = await readCustomDeductionTemplate(c, String(old.template_id));
  if (!template) return fail(c, 404, "CUSTOM_DEDUCTION_TEMPLATE_NOT_FOUND", "Custom deduction template was not found.");
  const input = readEmployeeCustomDeductionInput(body, template, await getPayrollSettingsRow(c), old);
  if ("error" in input) return fail(c, 400, "VALIDATION_ERROR", input.error ?? "Validation failed.");
  await c.env.DB
    .prepare(
      `UPDATE employee_custom_deductions SET deduction_type = ?, amount_type = ?, assigned_amount = ?, assigned_percentage = ?,
        currency = ?, total_amount = ?, remaining_balance = ?, installment_count = ?, installment_amount = ?,
        recurrence_interval = ?, payroll_period_id_start = ?, payroll_period_id_end = ?, start_date = ?, end_date = ?,
        effective_from = ?, effective_to = ?, priority_number = ?, show_on_payslip = ?, show_in_self_service = ?,
        include_in_final_settlement = ?, approval_status = ?, status = ?, source = ?, source_reference_type = ?,
        source_reference_id = ?, supporting_document_id = ?, reason = ?, notes = ?, updated_by_user_id = ?, updated_at = ?,
        metadata_json = ? WHERE id = ?`
    )
    .bind(input.deduction_type, input.amount_type, input.assigned_amount, input.assigned_percentage, input.currency, input.total_amount, input.remaining_balance, input.installment_count, input.installment_amount, input.recurrence_interval, input.payroll_period_id_start, input.payroll_period_id_end, input.start_date, input.end_date, input.effective_from, input.effective_to, input.priority_number, input.show_on_payslip, input.show_in_self_service, input.include_in_final_settlement, input.approval_status, input.status, input.source, input.source_reference_type, input.source_reference_id, input.supporting_document_id, input.reason, input.notes, c.get("currentUser").id, now(), input.metadata_json, old.id)
    .run();
  const saved = (await listEmployeeCustomDeductions(c, String(old.employee_id))).find((row) => row.id === old.id);
  await audit(c, "payroll.employee_custom_deduction.updated", "employee_custom_deduction", String(old.id), { oldValue: old, newValue: saved, reason: input.reason });
  return ok(c, { deduction: saved });
});

async function customDeductionAction(c: Context<AppBindings>, action: "approve" | "reject" | "pause" | "resume" | "cancel") {
  const disabled = ["approve", "resume"].includes(action) ? await requireCustomDeductionsEnabled(c) : null;
  if (disabled) return disabled;
  const row = await c.env.DB.prepare("SELECT * FROM employee_custom_deductions WHERE id = ?").bind(c.req.param("deductionId") ?? "").first<Row>();
  if (!row || !(await canManageEmployeeCustomDeductions(c, String(row.employee_id)))) return fail(c, 404, "EMPLOYEE_CUSTOM_DEDUCTION_NOT_FOUND", "Employee custom deduction was not found.");
  const body = await c.req.json<Row>().catch((): Row => ({}));
  const reason = text(body.reason);
  const nowValue = now();
  if ((action === "reject" || action === "cancel") && !reason) return fail(c, 400, "CUSTOM_DEDUCTION_REASON_REQUIRED", "Reason is required.");
  if (action === "approve") {
    await c.env.DB.prepare("UPDATE employee_custom_deductions SET approval_status = 'APPROVED', status = 'ACTIVE', approved_by_user_id = ?, approved_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowValue, c.get("currentUser").id, nowValue, row.id).run();
  } else if (action === "reject") {
    await c.env.DB.prepare("UPDATE employee_custom_deductions SET approval_status = 'REJECTED', status = 'CANCELLED', cancellation_reason = ?, cancelled_by_user_id = ?, cancelled_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(reason, c.get("currentUser").id, nowValue, c.get("currentUser").id, nowValue, row.id).run();
  } else if (action === "pause") {
    await c.env.DB.prepare("UPDATE employee_custom_deductions SET status = 'PAUSED', paused_by_user_id = ?, paused_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowValue, c.get("currentUser").id, nowValue, row.id).run();
  } else if (action === "resume") {
    await c.env.DB.prepare("UPDATE employee_custom_deductions SET status = 'ACTIVE', resumed_by_user_id = ?, resumed_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowValue, c.get("currentUser").id, nowValue, row.id).run();
  } else {
    await c.env.DB.prepare("UPDATE employee_custom_deductions SET approval_status = 'CANCELLED', status = 'CANCELLED', cancellation_reason = ?, cancelled_by_user_id = ?, cancelled_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(reason, c.get("currentUser").id, nowValue, c.get("currentUser").id, nowValue, row.id).run();
  }
  const saved = await c.env.DB.prepare("SELECT * FROM employee_custom_deductions WHERE id = ?").bind(row.id).first<Row>();
  const auditActionByTransition = {
    approve: "payroll.employee_custom_deduction.approved",
    reject: "payroll.employee_custom_deduction.rejected",
    pause: "payroll.employee_custom_deduction.paused",
    resume: "payroll.employee_custom_deduction.resumed",
    cancel: "payroll.employee_custom_deduction.cancelled"
  } as const;
  await audit(c, auditActionByTransition[action], "employee_custom_deduction", String(row.id), { oldValue: row, newValue: saved, reason });
  return ok(c, { deduction: saved });
}

payrollFoundationRoutes.post("/custom-deductions/:deductionId/approve", requireAnyPermission(["payroll.employee_custom_deductions.approve", "payroll.employee_custom_deductions.manage"]), (c) => customDeductionAction(c, "approve"));
payrollFoundationRoutes.post("/custom-deductions/:deductionId/reject", requireAnyPermission(["payroll.employee_custom_deductions.reject", "payroll.employee_custom_deductions.manage"]), (c) => customDeductionAction(c, "reject"));
payrollFoundationRoutes.post("/custom-deductions/:deductionId/pause", requireAnyPermission(["payroll.employee_custom_deductions.pause", "payroll.employee_custom_deductions.manage"]), (c) => customDeductionAction(c, "pause"));
payrollFoundationRoutes.post("/custom-deductions/:deductionId/resume", requireAnyPermission(["payroll.employee_custom_deductions.resume", "payroll.employee_custom_deductions.manage"]), (c) => customDeductionAction(c, "resume"));
payrollFoundationRoutes.post("/custom-deductions/:deductionId/cancel", requireAnyPermission(["payroll.employee_custom_deductions.cancel", "payroll.employee_custom_deductions.manage"]), (c) => customDeductionAction(c, "cancel"));

payrollFoundationRoutes.get("/reports/custom-deductions-summary", requireAnyPermission(["payroll.custom_deduction_reports.view", "payroll.reports.view"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT application_status, COUNT(*) AS application_count, SUM(scheduled_amount) AS scheduled_amount, SUM(deducted_amount) AS deducted_amount, SUM(shortfall_amount) AS shortfall_amount FROM employee_custom_deduction_applications GROUP BY application_status ORDER BY application_status").all<Row>()).results;
  return ok(c, { reports: rows });
});

payrollFoundationRoutes.get("/reports/custom-deductions-by-template", requireAnyPermission(["payroll.custom_deduction_reports.view", "payroll.reports.view"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT ecd.template_code_snapshot, ecd.template_name_snapshot, COUNT(*) AS assignment_count, SUM(COALESCE(ecda.deducted_amount, 0)) AS deducted_amount, SUM(COALESCE(ecd.remaining_balance, 0)) AS remaining_balance FROM employee_custom_deductions ecd LEFT JOIN employee_custom_deduction_applications ecda ON ecda.employee_custom_deduction_id = ecd.id GROUP BY ecd.template_code_snapshot, ecd.template_name_snapshot ORDER BY ecd.template_name_snapshot").all<Row>()).results;
  return ok(c, { reports: rows });
});

payrollFoundationRoutes.get("/reports/custom-deductions-by-category", requireAnyPermission(["payroll.custom_deduction_reports.view", "payroll.reports.view"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT ecd.category_snapshot, COUNT(*) AS assignment_count, SUM(COALESCE(ecda.deducted_amount, 0)) AS deducted_amount, SUM(COALESCE(ecd.remaining_balance, 0)) AS remaining_balance FROM employee_custom_deductions ecd LEFT JOIN employee_custom_deduction_applications ecda ON ecda.employee_custom_deduction_id = ecd.id GROUP BY ecd.category_snapshot ORDER BY ecd.category_snapshot").all<Row>()).results;
  return ok(c, { reports: rows });
});

payrollFoundationRoutes.get("/reports/custom-deduction-shortfalls", requireAnyPermission(["payroll.custom_deduction_reports.view", "payroll.reports.view"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT ecda.*, e.employee_no, e.full_name AS employee_name, ecd.template_name_snapshot, ecd.category_snapshot FROM employee_custom_deduction_applications ecda INNER JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id INNER JOIN employees e ON e.id = ecda.employee_id WHERE ecda.shortfall_amount > 0 ORDER BY ecda.created_at DESC").all<Row>()).results;
  return ok(c, { reports: rows });
});

payrollFoundationRoutes.get("/reports/custom-deduction-applications", requireAnyPermission(["payroll.custom_deduction_reports.view", "payroll.reports.view"]), async (c) => {
  const rows = (await c.env.DB.prepare("SELECT ecda.*, e.employee_no, e.full_name AS employee_name, ecd.template_name_snapshot, ecd.category_snapshot FROM employee_custom_deduction_applications ecda INNER JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id INNER JOIN employees e ON e.id = ecda.employee_id ORDER BY ecda.created_at DESC LIMIT 1000").all<Row>()).results;
  return ok(c, { reports: rows });
});

payrollFoundationRoutes.get("/pension-schemes", requireAnyPermission(["payroll.pension_schemes.view", "payroll.pension_schemes.manage", "payroll.view"]), async (c) => ok(c, { schemes: (await c.env.DB.prepare("SELECT * FROM pension_schemes WHERE status != 'ARCHIVED' ORDER BY effective_from DESC, scheme_name").all<Row>()).results }));
payrollFoundationRoutes.post("/pension-schemes", requireAnyPermission(["payroll.pension_schemes.create", "payroll.pension_schemes.manage"]), async (c) => {
  const body = await c.req.json<Row>();
  const dateIssues = validateDateRange({ start: text(body.effective_from) || now().slice(0, 10), end: text(body.effective_to) || null, startField: "effective_from", endField: "effective_to", label: "Effective to date" });
  if (hasValidationErrors(dateIssues)) return fail(c, 400, "VALIDATION_ERROR", dateIssues[0].message);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO pension_schemes (id, scheme_code, scheme_name, country_code, employee_contribution_percent, employer_contribution_percent, contribution_basis, include_allowances, min_employee_age, max_employee_age, local_employee_required, foreign_employee_allowed, foreign_employee_default_required, employer_can_pay_employee_share, effective_from, notes, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, text(body.scheme_code).toUpperCase(), text(body.scheme_name), text(body.country_code) || "MV", numberValue(body.employee_contribution_percent), numberValue(body.employer_contribution_percent), text(body.contribution_basis) || "BASIC_SALARY_ONLY", bool(body.include_allowances, false) ? 1 : 0, body.min_employee_age ?? null, body.max_employee_age ?? null, bool(body.local_employee_required, true) ? 1 : 0, bool(body.foreign_employee_allowed, true) ? 1 : 0, bool(body.foreign_employee_default_required, false) ? 1 : 0, bool(body.employer_can_pay_employee_share, true) ? 1 : 0, text(body.effective_from) || now().slice(0, 10), text(body.notes) || null, c.get("currentUser").id, c.get("currentUser").id).run();
  await audit(c, "payroll.pension_scheme.created", "pension_scheme", id, { newValue: body });
  return ok(c, { scheme: await c.env.DB.prepare("SELECT * FROM pension_schemes WHERE id = ?").bind(id).first<Row>() }, 201);
});

payrollFoundationRoutes.patch("/pension-schemes/:schemeId", requireAnyPermission(["payroll.pension_schemes.update", "payroll.pension_schemes.manage"]), async (c) => {
  const old = await c.env.DB.prepare("SELECT * FROM pension_schemes WHERE id = ?").bind(c.req.param("schemeId")).first<Row>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Pension scheme was not found.");
  const body = await c.req.json<Row>();
  const dateIssues = validateDateRange({ start: text(body.effective_from) || text(old.effective_from), end: text(body.effective_to) || text(old.effective_to) || null, startField: "effective_from", endField: "effective_to", label: "Effective to date" });
  if (hasValidationErrors(dateIssues)) return fail(c, 400, "VALIDATION_ERROR", dateIssues[0].message);
  await c.env.DB.prepare("UPDATE pension_schemes SET scheme_name = ?, employee_contribution_percent = ?, employer_contribution_percent = ?, contribution_basis = ?, include_allowances = ?, effective_from = ?, effective_to = ?, status = ?, notes = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(text(body.scheme_name) || old.scheme_name, numberValue(body.employee_contribution_percent, Number(old.employee_contribution_percent)), numberValue(body.employer_contribution_percent, Number(old.employer_contribution_percent)), text(body.contribution_basis) || old.contribution_basis, bool(body.include_allowances, Boolean(old.include_allowances)) ? 1 : 0, text(body.effective_from) || old.effective_from, text(body.effective_to) || old.effective_to, text(body.status) || old.status, text(body.notes) || old.notes, c.get("currentUser").id, now(), old.id).run();
  await audit(c, "payroll.pension_scheme.updated", "pension_scheme", String(old.id), { oldValue: old, newValue: body });
  return ok(c, { scheme: await c.env.DB.prepare("SELECT * FROM pension_schemes WHERE id = ?").bind(old.id).first<Row>() });
});

payrollFoundationRoutes.post("/pension-schemes/:schemeId/archive", requireAnyPermission(["payroll.pension_schemes.archive", "payroll.pension_schemes.manage"]), async (c) => {
  await c.env.DB.prepare("UPDATE pension_schemes SET status = 'ARCHIVED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now(), c.req.param("schemeId")).run();
  await audit(c, "payroll.pension_scheme.archived", "pension_scheme", c.req.param("schemeId"));
  return ok(c, { archived: true });
});

employeePayrollFoundationRoutes.get("/:employeeId/pension-profile", requireAnyPermission(["employees.pension_profiles.view", "employees.pension_profiles.manage", "payroll.pension_contributions.view"]), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Pension profile was not found.");
  const profile = await c.env.DB.prepare("SELECT epp.*, ps.scheme_name, ps.scheme_code FROM employee_pension_profiles epp LEFT JOIN pension_schemes ps ON ps.id = epp.pension_scheme_id WHERE epp.employee_id = ? AND epp.status != 'ARCHIVED' ORDER BY epp.effective_date DESC LIMIT 1").bind(employeeId).first<Row>();
  const sensitive = hasAny(c, ["employees.pension_profiles.sensitive.view", "employees.pension_profiles.manage", "payroll.pension_contributions.manage"]);
  if (profile && !sensitive) { profile.pension_member_id = profile.pension_member_id ? "Restricted" : null; profile.registration_number = profile.registration_number ? "Restricted" : null; }
  return ok(c, { profile });
});

employeePayrollFoundationRoutes.patch("/:employeeId/pension-profile", requireAnyPermission(["employees.pension_profiles.update", "employees.pension_profiles.manage"]), async (c) => {
  const employeeId = c.req.param("employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const body = await c.req.json<Row>();
  const existing = await c.env.DB.prepare("SELECT * FROM employee_pension_profiles WHERE employee_id = ? AND status = 'ACTIVE' ORDER BY effective_date DESC LIMIT 1").bind(employeeId).first<Row>();
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO employee_pension_profiles
    (id, employee_id, pension_scheme_id, pension_member_id, registration_number, enrollment_status,
     employee_contribution_percent_override, employer_contribution_percent_override, employer_pays_employee_share,
     employee_extra_voluntary_contribution_amount, contribution_basis_override, effective_date, exemption_reason, notes,
     created_by_user_id, updated_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET pension_scheme_id = excluded.pension_scheme_id, pension_member_id = excluded.pension_member_id,
      registration_number = excluded.registration_number, enrollment_status = excluded.enrollment_status,
      employee_contribution_percent_override = excluded.employee_contribution_percent_override,
      employer_contribution_percent_override = excluded.employer_contribution_percent_override,
      employer_pays_employee_share = excluded.employer_pays_employee_share,
      employee_extra_voluntary_contribution_amount = excluded.employee_extra_voluntary_contribution_amount,
      contribution_basis_override = excluded.contribution_basis_override, effective_date = excluded.effective_date,
      exemption_reason = excluded.exemption_reason, notes = excluded.notes, updated_by_user_id = excluded.updated_by_user_id, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
    .bind(id, employeeId, text(body.pension_scheme_id) || null, text(body.pension_member_id) || null, text(body.registration_number) || null, text(body.enrollment_status) || "ENROLLED", body.employee_contribution_percent_override ?? null, body.employer_contribution_percent_override ?? null, bool(body.employer_pays_employee_share, false) ? 1 : 0, numberValue(body.employee_extra_voluntary_contribution_amount), text(body.contribution_basis_override) || null, text(body.effective_date) || now().slice(0, 10), text(body.exemption_reason) || null, text(body.notes) || null, c.get("currentUser").id, c.get("currentUser").id).run();
  await audit(c, "employee.pension_profile.updated", "employee_pension_profile", id, { oldValue: existing, newValue: body });
  return ok(c, { profile: await c.env.DB.prepare("SELECT * FROM employee_pension_profiles WHERE id = ?").bind(id).first<Row>() });
});

payrollFoundationRoutes.get("/pension-contributions", requireAnyPermission(["payroll.pension_contributions.view", "payroll.pension_contributions.manage", "payroll.view"]), async (c) => ok(c, { contributions: (await c.env.DB.prepare("SELECT ppc.*, e.employee_no, e.full_name AS employee_name, ps.scheme_name FROM payroll_pension_contributions ppc INNER JOIN employees e ON e.id = ppc.employee_id INNER JOIN pension_schemes ps ON ps.id = ppc.pension_scheme_id ORDER BY ppc.created_at DESC LIMIT 500").all<Row>()).results }));
payrollFoundationRoutes.get("/reports/pension-contributions", requireAnyPermission(["payroll.reports.view", "payroll.pension_contributions.view", "payroll.pension_remittance.view"]), async (c) => ok(c, { reports: (await c.env.DB.prepare("SELECT ps.scheme_name, ppc.contribution_status, COUNT(DISTINCT ppc.employee_id) AS employee_count, SUM(ppc.pensionable_wage) AS pensionable_wage, SUM(ppc.employee_contribution_amount) AS employee_contribution_total, SUM(ppc.employer_contribution_amount) AS employer_contribution_total, SUM(ppc.total_contribution_amount) AS total_contribution FROM payroll_pension_contributions ppc INNER JOIN pension_schemes ps ON ps.id = ppc.pension_scheme_id GROUP BY ps.scheme_name, ppc.contribution_status ORDER BY ps.scheme_name").all<Row>()).results }));

payrollFoundationRoutes.get("/pension-remittance-batches", requireAnyPermission(["payroll.pension_remittance.view", "payroll.pension_remittance.manage"]), async (c) => ok(c, { batches: (await c.env.DB.prepare("SELECT prb.*, ps.scheme_name FROM pension_remittance_batches prb INNER JOIN pension_schemes ps ON ps.id = prb.scheme_id ORDER BY prb.created_at DESC").all<Row>()).results }));
payrollFoundationRoutes.post("/pension-remittance-batches", requireAnyPermission(["payroll.pension_remittance.prepare", "payroll.pension_remittance.manage"]), async (c) => {
  const body = await c.req.json<Row>();
  const periodId = text(body.payroll_period_id);
  const schemeId = text(body.scheme_id);
  const totals = await c.env.DB.prepare("SELECT SUM(employee_contribution_amount) AS employee_total, SUM(employer_contribution_amount) AS employer_total, SUM(employee_extra_voluntary_contribution_amount) AS voluntary_total, SUM(total_contribution_amount) AS total FROM payroll_pension_contributions WHERE payroll_period_id = ? AND pension_scheme_id = ?").bind(periodId, schemeId).first<Row>();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO pension_remittance_batches (id, payroll_period_id, scheme_id, period_label, employee_contribution_total, employer_contribution_total, employee_extra_voluntary_contribution_total, total_remittance_amount, status, prepared_by_user_id, prepared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PREPARED', ?, ?)").bind(id, periodId, schemeId, text(body.period_label) || periodId, numberValue(totals?.employee_total), numberValue(totals?.employer_total), numberValue(totals?.voluntary_total), numberValue(totals?.total), c.get("currentUser").id, now()).run();
  await audit(c, "payroll.pension_remittance.prepared", "pension_remittance_batch", id, { newValue: totals });
  return ok(c, { batch: await c.env.DB.prepare("SELECT * FROM pension_remittance_batches WHERE id = ?").bind(id).first<Row>() }, 201);
});
payrollFoundationRoutes.post("/pension-remittance-batches/:batchId/confirm", requireAnyPermission(["payroll.pension_remittance.confirm", "payroll.pension_remittance.manage"]), async (c) => {
  const body = await c.req.json<Row>();
  if (!text(body.remittance_reference) || !text(body.confirmation_note)) return fail(c, 400, "VALIDATION_ERROR", "Remittance reference and confirmation note are required.");
  await c.env.DB.prepare("UPDATE pension_remittance_batches SET status = 'MANUALLY_CONFIRMED_REMITTED', confirmed_by_user_id = ?, confirmed_at = ?, remittance_reference = ?, confirmation_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now(), text(body.remittance_reference), text(body.confirmation_note), now(), c.req.param("batchId")).run();
  await audit(c, "payroll.pension_remittance.confirmed", "pension_remittance_batch", c.req.param("batchId"), { reason: text(body.confirmation_note) });
  return ok(c, { confirmed: true });
});

selfServicePayrollFoundationRoutes.get("/payment-methods", requireAnyPermission(["self_service.payment_methods.view", "self_service.payroll.view", "self_service.view"]), async (c) => {
  const employeeId = await linkedEmployeeId(c);
  if (!employeeId) return fail(c, 404, "EMPLOYEE_NOT_LINKED", "Your account is not linked to an employee profile.");
  return ok(c, { payment_methods: await getEmployeePaymentMethods(c.env.DB, employeeId, false) });
});

selfServicePayrollFoundationRoutes.get("/bank-loans", requireAnyPermission(["self_service.bank_loans.view", "self_service.payroll.view", "self_service.view"]), async (c) => {
  const employeeId = await linkedEmployeeId(c);
  if (!employeeId) return fail(c, 404, "EMPLOYEE_NOT_LINKED", "Your account is not linked to an employee profile.");
  const settings = await c.env.DB.prepare("SELECT show_loan_details_in_self_service FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Row>();
  if (!bool(settings?.show_loan_details_in_self_service, true)) return ok(c, { loans: [], payments: [] });
  const loans = await listBankLoans(c, employeeId);
  const payments = (await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results.map((payment) => ({
    ...payment,
    employee_direct_collection_message: bool(payment.skipped_due_to_minimum_net_salary, false) || bool(payment.bank_direct_collection_required, false)
      ? "This month's loan deduction was skipped by payroll due to minimum salary protection. Bank collection is marked as direct collection from employee."
      : null
  }));
  return ok(c, { loans, payments });
});

selfServicePayrollFoundationRoutes.get("/custom-deductions", requireAnyPermission(["self_service.custom_deductions.view", "self_service.payroll.view", "self_service.view"]), async (c) => {
  const employeeId = await linkedEmployeeId(c);
  if (!employeeId) return fail(c, 404, "EMPLOYEE_NOT_LINKED", "Your account is not linked to an employee profile.");
  const settings = await getPayrollSettingsRow(c);
  if (!customDeductionSettingsEnabled(settings)) return ok(c, { deductions: [], applications: [] });
  const deductions = (await c.env.DB
    .prepare(
      `SELECT id, template_code_snapshot, template_name_snapshot, category_snapshot, deduction_type, amount_type,
        assigned_amount, assigned_percentage, currency, total_amount, remaining_balance, installment_count,
        installments_completed, installment_amount, recurrence_interval, effective_from, effective_to,
        show_in_self_service, approval_status, status, source, reason, notes, created_at, updated_at
       FROM employee_custom_deductions
       WHERE employee_id = ? AND show_in_self_service = 1 AND status != 'ARCHIVED'
       ORDER BY status, created_at DESC`
    )
    .bind(employeeId)
    .all<Row>()).results;
  const applications = (await c.env.DB
    .prepare(
      `SELECT ecda.*, ecd.template_name_snapshot, ecd.category_snapshot
       FROM employee_custom_deduction_applications ecda
       INNER JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id
       WHERE ecda.employee_id = ? AND ecd.show_in_self_service = 1
       ORDER BY ecda.created_at DESC LIMIT 100`
    )
    .bind(employeeId)
    .all<Row>()).results;
  return ok(c, { deductions, applications, message: "My Custom Deductions are read-only in self-service." });
});

selfServicePayrollFoundationRoutes.get("/pension", requireAnyPermission(["self_service.pension.view", "self_service.payroll.view", "self_service.view"]), async (c) => {
  const employeeId = await linkedEmployeeId(c);
  if (!employeeId) return fail(c, 404, "EMPLOYEE_NOT_LINKED", "Your account is not linked to an employee profile.");
  const settings = await c.env.DB.prepare("SELECT pension_show_in_self_service FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Row>();
  if (!bool(settings?.pension_show_in_self_service, true)) return ok(c, { profile: null, contributions: [] });
  const profile = await c.env.DB.prepare("SELECT epp.*, ps.scheme_name, ps.scheme_code FROM employee_pension_profiles epp LEFT JOIN pension_schemes ps ON ps.id = epp.pension_scheme_id WHERE epp.employee_id = ? AND epp.status != 'ARCHIVED' ORDER BY epp.effective_date DESC LIMIT 1").bind(employeeId).first<Row>();
  const contributions = (await c.env.DB.prepare("SELECT ppc.*, ps.scheme_name FROM payroll_pension_contributions ppc INNER JOIN pension_schemes ps ON ps.id = ppc.pension_scheme_id WHERE ppc.employee_id = ? ORDER BY ppc.created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results;
  return ok(c, { profile, contributions });
});
