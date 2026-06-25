import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";
import { applyLeaveBalanceChange, getLeaveApprovalChainPreview, getSelfServiceLeaveCycles } from "./leave";

type Row = Record<string, unknown>;

export const selfServiceRoutes = new Hono<AppBindings>();
export const kycRoutes = new Hono<AppBindings>();

selfServiceRoutes.use("*", requireAuth);
kycRoutes.use("*", requireAuth);

kycRoutes.use("*", async (c, next) => {
  if (!hasAny(c, ["employees.update", "employees.sensitive.update"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to review KYC requests.");
  }
  await next();
});

async function linkedEmployeeId(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  if (user.employee_id) return user.employee_id;
  const row = await c.env.DB.prepare("SELECT id FROM employees WHERE user_id = ? LIMIT 1").bind(user.id).first<{ id: string }>();
  return row?.id ?? null;
}

async function requireLinkedEmployee(c: Context<AppBindings>) {
  const employeeId = await linkedEmployeeId(c);
  if (!employeeId) {
    return { employeeId: null, response: fail(c, 403, "SELF_SERVICE_UNAVAILABLE", "This account is not linked to an employee profile.") };
  }
  return { employeeId, response: null };
}

function maskSelfServiceDocuments(rows: Row[]) {
  return rows.map((row) => {
    const sensitive = Number(row.is_sensitive ?? 0) === 1;
    if (!sensitive) return { ...row, restricted: false };
    return {
      ...row,
      document_number: null,
      original_filename: null,
      document_type_name: "Restricted document",
      category_name: "Restricted",
      is_sensitive: true,
      restricted: true
    };
  });
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const userPermissions = c.get("currentUser").permissions;
  return permissions.some((permission) => userPermissions.includes(permission));
}

const selfServiceSettingKeys = [
  "module_enabled",
  "dashboard_enabled",
  "profile_enabled",
  "profile_update_requests_enabled",
  "leave_enabled",
  "attendance_enabled",
  "roster_enabled",
  "payroll_enabled",
  "payslips_enabled",
  "payment_methods_enabled",
  "bank_loans_enabled",
  "pension_enabled",
  "documents_enabled",
  "documents_compliance_enabled",
  "contracts_enabled",
  "assets_enabled",
  "uniforms_enabled",
  "approvals_enabled",
  "onboarding_enabled",
  "offboarding_enabled",
  "notifications_enabled",
  "show_sensitive_payroll_values",
  "show_sensitive_bank_details",
  "allow_profile_update_requests",
  "allow_attendance_correction_requests",
  "allow_leave_requests",
  "allow_payslip_downloads"
] as const;

const selfServiceDefaultSettings = {
  id: "self_service_settings_default",
  module_enabled: 1,
  dashboard_enabled: 1,
  profile_enabled: 1,
  profile_update_requests_enabled: 1,
  leave_enabled: 1,
  attendance_enabled: 1,
  roster_enabled: 1,
  payroll_enabled: 1,
  payslips_enabled: 1,
  payment_methods_enabled: 1,
  bank_loans_enabled: 1,
  pension_enabled: 1,
  documents_enabled: 1,
  documents_compliance_enabled: 1,
  contracts_enabled: 1,
  assets_enabled: 1,
  uniforms_enabled: 1,
  approvals_enabled: 1,
  onboarding_enabled: 1,
  offboarding_enabled: 1,
  notifications_enabled: 1,
  show_sensitive_payroll_values: 1,
  show_sensitive_bank_details: 0,
  allow_profile_update_requests: 1,
  allow_attendance_correction_requests: 1,
  allow_leave_requests: 1,
  allow_payslip_downloads: 1
};

type SelfServiceSettingKey = (typeof selfServiceSettingKeys)[number];

async function ensureSelfServiceSettings(db: AppBindings["Bindings"]["DB"]) {
  const existing = await db.prepare("SELECT * FROM self_service_settings WHERE id = 'self_service_settings_default'").first<Row>();
  if (existing) return { ...selfServiceDefaultSettings, ...existing };
  await db
    .prepare(
      `INSERT INTO self_service_settings
       (id, module_enabled, dashboard_enabled, profile_enabled, profile_update_requests_enabled,
        leave_enabled, attendance_enabled, roster_enabled, payroll_enabled, payslips_enabled,
        payment_methods_enabled, bank_loans_enabled, pension_enabled, documents_enabled,
        documents_compliance_enabled, contracts_enabled, assets_enabled, uniforms_enabled,
        approvals_enabled, onboarding_enabled, offboarding_enabled, notifications_enabled,
        show_sensitive_payroll_values, show_sensitive_bank_details, allow_profile_update_requests,
        allow_attendance_correction_requests, allow_leave_requests, allow_payslip_downloads)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(selfServiceDefaultSettings.id, ...selfServiceSettingKeys.map((key) => selfServiceDefaultSettings[key]))
    .run();
  return { ...selfServiceDefaultSettings };
}

async function getSelfServiceSettingsRow(c: Context<AppBindings>) {
  return ensureSelfServiceSettings(c.env.DB);
}

function boolSetting(settings: Row, key: SelfServiceSettingKey) {
  return Number(settings[key] ?? selfServiceDefaultSettings[key]) === 1;
}

export async function requireSelfServiceEnabled(c: Context<AppBindings>) {
  const settings = await getSelfServiceSettingsRow(c);
  if (!boolSetting(settings, "module_enabled")) {
    return fail(c, 503, "SELF_SERVICE_DISABLED", "Employee self-service is disabled.");
  }
  return null;
}

export async function assertSelfServiceModuleEnabled(c: Context<AppBindings>, moduleKey: SelfServiceSettingKey) {
  const disabled = await requireSelfServiceEnabled(c);
  if (disabled) return disabled;
  const settings = await getSelfServiceSettingsRow(c);
  if (!boolSetting(settings, moduleKey)) {
    return fail(c, 403, "SELF_SERVICE_MODULE_DISABLED", "This self-service module is disabled.");
  }
  return null;
}

export async function getAuthenticatedSelfServiceEmployee(c: Context<AppBindings>) {
  const employeeId = await linkedEmployeeId(c);
  if (!employeeId) return null;
  return c.env.DB
    .prepare(
      `SELECT e.*, d.name AS department_name, p.title AS position_title, l.name AS location_name, jl.name AS job_level_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Row>();
}

export async function requireSelfServiceEmployeeContext(c: Context<AppBindings>) {
  const disabled = await requireSelfServiceEnabled(c);
  if (disabled) return { employee: null, employeeId: null, response: disabled };
  const employee = await getAuthenticatedSelfServiceEmployee(c);
  if (!employee) {
    return { employee: null, employeeId: null, response: fail(c, 403, "SELF_SERVICE_UNAVAILABLE", "This account is not linked to an active employee profile.") };
  }
  return { employee, employeeId: String(employee.id), response: null };
}

export async function requireSelfServiceOwnEmployee(c: Context<AppBindings>, employeeId?: string | null) {
  const context = await requireSelfServiceEmployeeContext(c);
  if (context.response) return context;
  if (employeeId && employeeId !== context.employeeId) {
    return { ...context, response: fail(c, 404, "SELF_SERVICE_SCOPE_DENIED", "Self-service can only access the linked employee profile.") };
  }
  return context;
}

export function maskSelfServiceSensitiveFields(row: Row | null | undefined, allowSensitive = false) {
  if (!row) return row;
  if (allowSensitive) return row;
  const masked = { ...row };
  for (const key of ["bank_account_name", "bank_account_no", "bank_account_number_encrypted_or_plain_placeholder", "iban_or_swift_placeholder", "basic_salary", "net_salary", "gross_salary"]) {
    if (key in masked) masked[key] = null;
  }
  return masked;
}

export async function getSelfServiceModuleVisibility(c: Context<AppBindings>) {
  const settings = await getSelfServiceSettingsRow(c);
  const can = (key: string, fallback = "self_service.view") => hasAny(c, [key, fallback]);
  return {
    dashboard: boolSetting(settings, "dashboard_enabled") && can("self_service.dashboard.view"),
    profile: boolSetting(settings, "profile_enabled") && can("self_service.profile.view"),
    profile_update_requests: boolSetting(settings, "profile_update_requests_enabled") && can("self_service.profile_update_requests.view"),
    documents: boolSetting(settings, "documents_enabled") && can("self_service.documents.compliance.view"),
    leave: boolSetting(settings, "leave_enabled") && can("self_service.leave.view"),
    attendance: boolSetting(settings, "attendance_enabled") && can("self_service.attendance.view"),
    roster: boolSetting(settings, "roster_enabled") && can("self_service.roster.view"),
    payroll: boolSetting(settings, "payroll_enabled") && can("self_service.payroll.view"),
    payslips: boolSetting(settings, "payslips_enabled") && can("self_service.payslips.view"),
    payment_methods: boolSetting(settings, "payment_methods_enabled") && can("self_service.payment_methods.view"),
    bank_loans: boolSetting(settings, "bank_loans_enabled") && can("self_service.bank_loans.view"),
    pension: boolSetting(settings, "pension_enabled") && can("self_service.pension.view"),
    contracts: boolSetting(settings, "contracts_enabled") && can("self_service.contracts.view"),
    assets: boolSetting(settings, "assets_enabled") && can("self_service.assets.view"),
    uniforms: boolSetting(settings, "uniforms_enabled") && can("self_service.uniforms.view"),
    approvals: boolSetting(settings, "approvals_enabled") && can("self_service.approvals.view"),
    onboarding: boolSetting(settings, "onboarding_enabled") && can("self_service.onboarding.view"),
    offboarding: boolSetting(settings, "offboarding_enabled") && can("self_service.offboarding.view"),
    notifications: boolSetting(settings, "notifications_enabled") && can("self_service.notifications.view")
  };
}

export async function getSelfServiceDashboardSummary(c: Context<AppBindings>, employeeId: string) {
  const [leaveOpen, attendanceCorrections, expiringDocs, payslips, assets, approvals, kyc] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM leave_requests WHERE employee_id = ? AND status IN ('DRAFT', 'PENDING_APPROVAL')").bind(employeeId).first<Row>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM attendance_correction_requests WHERE employee_id = ? AND status IN ('PENDING', 'SUBMITTED')").bind(employeeId).first<Row>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM employee_documents WHERE employee_id = ? AND status = 'ACTIVE' AND expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+30 day')").bind(employeeId).first<Row>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM payroll_payslips WHERE employee_id = ? AND status IN ('GENERATED', 'REGENERATED')").bind(employeeId).first<Row>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM employee_asset_assignments WHERE employee_id = ? AND COALESCE(returned_date, '') = ''").bind(employeeId).first<Row>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM approval_instances WHERE employee_id = ? OR submitted_by_user_id = ?").bind(employeeId, c.get("currentUser").id).first<Row>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM employee_kyc_update_requests WHERE employee_id = ? AND status IN ('SUBMITTED', 'PENDING')").bind(employeeId).first<Row>()
  ]);
  const upcomingRoster = (
    await c.env.DB
      .prepare(
        `SELECT ra.roster_date, ra.status, st.code AS shift_code, st.name AS shift_name, st.start_time, st.end_time
         FROM roster_assignments ra
         JOIN roster_periods rp ON rp.id = ra.roster_period_id
         LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
         WHERE ra.employee_id = ? AND ra.roster_date >= date('now') AND rp.status IN ('PUBLISHED', 'LOCKED')
         ORDER BY ra.roster_date ASC LIMIT 7`
      )
      .bind(employeeId)
      .all<Row>()
  ).results;
  return {
    open_leave_requests: Number(leaveOpen?.count ?? 0),
    pending_attendance_corrections: Number(attendanceCorrections?.count ?? 0),
    expiring_documents: Number(expiringDocs?.count ?? 0),
    available_payslips: Number(payslips?.count ?? 0),
    active_assets: Number(assets?.count ?? 0),
    submitted_approvals: Number(approvals?.count ?? 0),
    pending_profile_updates: Number(kyc?.count ?? 0),
    upcoming_roster: upcomingRoster
  };
}

export async function getSelfServiceProfile(c: Context<AppBindings>, employeeId: string) {
  const employee = await c.env.DB.prepare("SELECT id, employee_no, full_name, display_name, employee_type, employment_type, joining_date, confirmation_date, contract_start_date, contract_end_date, primary_department_id, primary_position_id, primary_location_id, job_level_id, profile_photo_document_id FROM employees WHERE id = ?").bind(employeeId).first<Row>();
  const contacts = (await c.env.DB.prepare("SELECT contact_type, value, country_code, relationship, is_primary, emergency_priority FROM employee_contacts WHERE employee_id = ? AND archived_at IS NULL ORDER BY is_primary DESC, emergency_priority ASC, contact_type ASC").bind(employeeId).all<Row>()).results;
  return { employee, contacts };
}

export async function getSelfServiceProfileUpdateRequests(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT id, section, field_key, old_value_json, requested_value_json, reason, status, reviewed_at, review_note, created_at, updated_at FROM employee_kyc_update_requests WHERE employee_id = ? ORDER BY created_at DESC").bind(employeeId).all<Row>()).results;
}

export async function createSelfServiceProfileUpdateRequest(c: Context<AppBindings>, employeeId: string, body: Row) {
  const section = readString(body.section);
  const fieldKey = readString(body.field_key);
  const requestedValue = unwrapRequestedValue(body.requested_value ?? body.requested_value_json ?? body.fields);
  if (!section || !fieldKey || requestedValue === undefined || requestedValue === null) {
    return { response: fail(c, 400, "VALIDATION_ERROR", "Section, field, and requested value are required.") };
  }
  if (protectedProfileUpdateFields.has(fieldKey)) {
    return { response: fail(c, 400, "PROTECTED_FIELD", "This profile field cannot be changed through self-service requests.") };
  }
  const oldValue = await currentProfileFieldValue(c.env.DB, employeeId, fieldKey);
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO employee_kyc_update_requests (id, employee_id, requested_by_user_id, section, field_key, old_value_json, requested_value_json, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, employeeId, c.get("currentUser").id, section, fieldKey, JSON.stringify({ [fieldKey]: oldValue }), JSON.stringify({ [fieldKey]: requestedValue }), readString(body.reason) || null)
    .run();
  return { request_id: id };
}

export async function cancelSelfServiceProfileUpdateRequest(c: Context<AppBindings>, employeeId: string, requestId: string) {
  const row = await c.env.DB.prepare("SELECT id, status FROM employee_kyc_update_requests WHERE id = ? AND employee_id = ?").bind(requestId, employeeId).first<Row>();
  if (!row) return fail(c, 404, "NOT_FOUND", "Profile update request was not found.");
  if (!["SUBMITTED", "PENDING"].includes(String(row.status))) return fail(c, 400, "REQUEST_NOT_CANCELLABLE", "Only submitted requests can be cancelled.");
  await c.env.DB.prepare("UPDATE employee_kyc_update_requests SET status = 'CANCELLED', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), requestId).run();
  return ok(c, { cancelled: true });
}

export async function getSelfServiceLeaveSummary(c: Context<AppBindings>, employeeId: string) {
  const cycles = await getSelfServiceLeaveCycles(c, employeeId);
  const requests = (await c.env.DB.prepare("SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results;
  return { ...cycles, requests };
}

export async function getSelfServiceLeaveBalances(c: Context<AppBindings>, employeeId: string) {
  return getSelfServiceLeaveCycles(c, employeeId);
}

export async function createSelfServiceLeaveRequest(c: Context<AppBindings>) {
  return fail(c, 501, "USE_SELF_SERVICE_LEAVE_REQUEST_ROUTE", "Use POST /api/v1/self-service/leave/requests.");
}

export async function getSelfServiceLeaveApprovalTimeline(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT a.* FROM leave_request_approvals a JOIN leave_requests lr ON lr.id = a.leave_request_id WHERE lr.employee_id = ? ORDER BY a.created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceAttendanceSummary(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT status, COUNT(*) AS count FROM attendance_daily_records WHERE employee_id = ? AND attendance_date >= date('now', '-30 day') GROUP BY status").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceAttendanceCalendar(c: Context<AppBindings>, employeeId: string, from: string, to: string) {
  return (await c.env.DB.prepare("SELECT * FROM attendance_daily_records WHERE employee_id = ? AND attendance_date >= ? AND attendance_date <= ? ORDER BY attendance_date DESC").bind(employeeId, from, to).all<Row>()).results;
}

export async function createSelfServiceAttendanceCorrection(c: Context<AppBindings>) {
  return fail(c, 501, "USE_SELF_SERVICE_ATTENDANCE_CORRECTION_ROUTE", "Use POST /api/v1/self-service/attendance/corrections.");
}

export async function getSelfServiceAttendanceCorrectionTimeline(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM attendance_correction_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceRosterWeekly(c: Context<AppBindings>, employeeId: string, start: string, end: string) {
  return (await c.env.DB.prepare("SELECT * FROM roster_assignments WHERE employee_id = ? AND roster_date BETWEEN ? AND ? ORDER BY roster_date").bind(employeeId, start, end).all<Row>()).results;
}

export async function getSelfServiceUpcomingShifts(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM roster_assignments WHERE employee_id = ? AND roster_date >= date('now') ORDER BY roster_date LIMIT 14").bind(employeeId).all<Row>()).results;
}

export async function getSelfServicePublishedRosterOnly(c: Context<AppBindings>, employeeId: string) {
  return getSelfServiceUpcomingShifts(c, employeeId);
}

export async function getSelfServicePayrollSummary(c: Context<AppBindings>, employeeId: string) {
  const profile = await c.env.DB.prepare("SELECT employee_id, basic_salary, currency, payroll_included, payment_method, effective_from FROM employee_payroll_profiles WHERE employee_id = ?").bind(employeeId).first<Row>();
  const recent = (await c.env.DB.prepare("SELECT id, payroll_run_id, basic_salary, total_earnings, total_deductions, net_salary, status, created_at FROM payroll_employee_results WHERE employee_id = ? ORDER BY created_at DESC LIMIT 12").bind(employeeId).all<Row>()).results;
  return { profile, recent };
}

export async function getSelfServicePayrollHistory(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM payroll_employee_results WHERE employee_id = ? ORDER BY created_at DESC LIMIT 24").bind(employeeId).all<Row>()).results;
}

export async function getSelfServicePayslips(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE employee_id = ? AND status IN ('GENERATED', 'REGENERATED') ORDER BY generated_at DESC").bind(employeeId).all<Row>()).results;
}

export async function getSelfServicePayslipDetail(c: Context<AppBindings>, employeeId: string, payslipId: string) {
  return c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ? AND employee_id = ?").bind(payslipId, employeeId).first<Row>();
}

export async function downloadSelfServicePayslip(c: Context<AppBindings>, employeeId: string, payslipId: string) {
  return getSelfServicePayslipDetail(c, employeeId, payslipId);
}

export async function getSelfServiceBankLoans(c: Context<AppBindings>, employeeId: string) {
  const loans = (await c.env.DB.prepare("SELECT * FROM employee_bank_loans WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY created_at DESC").bind(employeeId).all<Row>()).results;
  const payments = (await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results;
  return { loans, payments };
}

export async function getSelfServiceBankLoanPaymentHistory(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results;
}

export async function getSelfServicePensionSummary(c: Context<AppBindings>, employeeId: string) {
  const profile = await c.env.DB.prepare("SELECT * FROM employee_pension_profiles WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY effective_date DESC LIMIT 1").bind(employeeId).first<Row>();
  const contributions = await getSelfServicePensionContributionHistory(c, employeeId);
  return { profile, contributions };
}

export async function getSelfServicePensionContributionHistory(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM payroll_pension_contributions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceDocumentCompliance(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM employee_document_checklist_items WHERE employee_id = ? AND is_active = 1").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceDocumentWarnings(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM employee_documents WHERE employee_id = ? AND status = 'ACTIVE' AND expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+30 day')").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceContracts(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM employee_contracts WHERE employee_id = ? ORDER BY contract_start_date DESC, created_at DESC").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceContractSummary(c: Context<AppBindings>, employeeId: string) {
  const contracts = await getSelfServiceContracts(c, employeeId);
  return { active_contract: contracts.find((row) => row.status === "ACTIVE" || row.status === "EXPIRING_SOON") ?? null, contract_history: contracts };
}

export async function getSelfServiceAssets(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM employee_asset_assignments WHERE employee_id = ? ORDER BY issued_date DESC").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceUniforms(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM employee_uniform_assignments WHERE employee_id = ? ORDER BY issued_date DESC").bind(employeeId).all<Row>()).results;
}

export async function getSelfServiceApprovalStatus(c: Context<AppBindings>, employeeId: string) {
  return (await c.env.DB.prepare("SELECT * FROM approval_instances WHERE employee_id = ? OR submitted_by_user_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId, c.get("currentUser").id).all<Row>()).results;
}

export async function getSelfServiceRequestTimeline(c: Context<AppBindings>, employeeId: string) {
  return getSelfServiceSubmittedRequests(c, employeeId);
}

export async function getSelfServiceSubmittedRequests(c: Context<AppBindings>, employeeId: string) {
  const profileUpdates = await getSelfServiceProfileUpdateRequests(c, employeeId);
  const leaveRequests = (await c.env.DB.prepare("SELECT id, 'leave' AS request_type, status, created_at, reason FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 50").bind(employeeId).all<Row>()).results;
  const corrections = await getSelfServiceAttendanceCorrectionTimeline(c, employeeId);
  return { profile_updates: profileUpdates, leave_requests: leaveRequests, attendance_corrections: corrections };
}

export async function getSelfServiceOnboardingStatus(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB.prepare("SELECT * FROM employee_onboarding_cases WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1").bind(employeeId).first<Row>();
}

export async function getSelfServiceOffboardingStatus(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB.prepare("SELECT * FROM employee_offboarding_cases WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1").bind(employeeId).first<Row>();
}

export async function getSelfServiceLifecycleSummary(c: Context<AppBindings>, employeeId: string) {
  return { onboarding: await getSelfServiceOnboardingStatus(c, employeeId), offboarding: await getSelfServiceOffboardingStatus(c, employeeId) };
}

export async function getSelfServiceNotifications(c: Context<AppBindings>, employeeId: string) {
  const [approvals, kyc, leave, attendance] = await Promise.all([
    c.env.DB.prepare("SELECT id, 'approval' AS type, status AS severity, module_key AS title, created_at, updated_at FROM approval_instances WHERE employee_id = ? OR submitted_by_user_id = ? ORDER BY created_at DESC LIMIT 25").bind(employeeId, c.get("currentUser").id).all<Row>(),
    c.env.DB.prepare("SELECT id, 'profile_update' AS type, status AS severity, field_key AS title, created_at, updated_at FROM employee_kyc_update_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 25").bind(employeeId).all<Row>(),
    c.env.DB.prepare("SELECT id, 'leave' AS type, status AS severity, leave_type_id AS title, created_at, updated_at FROM leave_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 25").bind(employeeId).all<Row>(),
    c.env.DB.prepare("SELECT id, 'attendance_correction' AS type, status AS severity, attendance_date AS title, created_at, updated_at FROM attendance_correction_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 25").bind(employeeId).all<Row>()
  ]);
  return [...approvals.results, ...kyc.results, ...leave.results, ...attendance.results].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))).slice(0, 50);
}

export async function markSelfServiceNotificationRead(c: Context<AppBindings>, employeeId: string, notificationId: string) {
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action: "self_service.notification.read", module: "self_service", entityType: "notification", entityId: notificationId, newValue: { employee_id: employeeId }, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") });
}

export async function getSelfServiceUnreadNotificationCount(c: Context<AppBindings>, employeeId: string) {
  const pending = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM employee_kyc_update_requests WHERE employee_id = ? AND status IN ('SUBMITTED', 'PENDING')").bind(employeeId).first<Row>();
  return Number(pending?.count ?? 0);
}

const protectedProfileUpdateFields = new Set([
  "salary",
  "role",
  "roles",
  "access",
  "status",
  "employee_status",
  "department",
  "department_id",
  "primary_department_id",
  "position",
  "position_id",
  "primary_position_id",
  "location",
  "location_id",
  "primary_location_id",
  "worksite",
  "reporting_manager",
  "reporting_manager_employee_id",
  "payroll_included",
  "roster_eligible",
  "internal_notes",
  "notes_summary"
]);

function unwrapRequestedValue(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value && Object.keys(value as Record<string, unknown>).length === 1) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

async function currentProfileFieldValue(db: AppBindings["Bindings"]["DB"], employeeId: string, fieldKey: string) {
  const allowedEmployeeFields = new Set(["display_name", "nationality", "gender", "date_of_birth", "joining_date", "confirmation_date", "contract_start_date", "contract_end_date"]);
  if (!allowedEmployeeFields.has(fieldKey)) return null;
  const row = await db.prepare(`SELECT ${fieldKey} AS value FROM employees WHERE id = ?`).bind(employeeId).first<{ value: unknown }>();
  return row?.value ?? null;
}

async function getSelfServiceAttendanceSettings(c: Context<AppBindings>) {
  const settings = await c.env.DB.prepare("SELECT * FROM attendance_settings WHERE id = 'attendance_settings_default'").first<Record<string, unknown>>();
  return settings ?? { module_enabled: 1, allow_employee_correction_requests: 1 };
}

async function requireSelfServiceAttendanceEnabled(c: Context<AppBindings>) {
  const settings = await getSelfServiceAttendanceSettings(c);
  if (Number(settings.module_enabled ?? 1) !== 1) return fail(c, 503, "ATTENDANCE_MODULE_DISABLED", "Attendance module is disabled.");
  return null;
}

async function getSelfServiceRosterSettings(c: Context<AppBindings>) {
  const settings = await c.env.DB.prepare("SELECT * FROM roster_settings WHERE id = 'roster_settings_default'").first<Record<string, unknown>>();
  return {
    module_enabled: 1,
    employee_self_service_roster_visibility_enabled: 1,
    require_publish_before_employee_visibility: 1,
    ...settings
  };
}

async function requireSelfServiceRosterEnabled(c: Context<AppBindings>) {
  const settings = await getSelfServiceRosterSettings(c);
  if (Number(settings.module_enabled ?? 1) !== 1) return fail(c, 503, "ROSTER_MODULE_DISABLED", "Roster module is disabled.");
  if (Number(settings.employee_self_service_roster_visibility_enabled ?? 1) !== 1) return fail(c, 403, "ROSTER_SELF_SERVICE_DISABLED", "Self-service roster visibility is disabled.");
  return null;
}

function parseAttendanceStatus(value: unknown) {
  const status = readString(value).toUpperCase();
  if (status === "SICK") return "SICK_LEAVE";
  if (status === "OFF_DAY") return "DAY_OFF";
  if (status === "HOLIDAY") return "PUBLIC_HOLIDAY";
  return status || null;
}

function selfServiceAttendanceSnapshot(record: Record<string, unknown> | null | undefined) {
  return {
    record_id: record?.id ?? null,
    status: record?.status ?? null,
    final_status: record?.final_status ?? null,
    first_clock_in: record?.first_clock_in ?? null,
    last_clock_out: record?.last_clock_out ?? null,
    total_work_minutes: record?.total_work_minutes ?? null,
    missed_punch: record?.missed_punch ?? null
  };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

async function selfServiceEmployee(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB
    .prepare(
      `SELECT e.*, d.name AS department_name, p.title AS position_title, l.name AS location_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Row>();
}

async function findSelfServiceLeavePolicy(c: Context<AppBindings>, employee: Row, leaveTypeId: string) {
  return c.env.DB
    .prepare(
      `SELECT * FROM leave_policies
       WHERE leave_type_id = ? AND is_active = 1
         AND (applies_to_employee_type IS NULL OR applies_to_employee_type = ?)
         AND (applies_to_employment_type IS NULL OR applies_to_employment_type = ?)
         AND (department_id IS NULL OR department_id = ?)
         AND (position_id IS NULL OR position_id = ?)
         AND (location_id IS NULL OR location_id = ?)
       ORDER BY priority ASC, created_at ASC LIMIT 1`
    )
    .bind(leaveTypeId, employee.employee_type, employee.employment_type, employee.primary_department_id, employee.primary_position_id, employee.primary_location_id)
    .first<Row>();
}

function calculateSelfServiceLeaveDays(startDate: string, endDate: string, halfDayType: string, includeWeeklyOff: boolean) {
  const total = daysBetween(startDate, endDate);
  if (!total) return null;
  let counted = 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < total; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
    if (!weekend || includeWeeklyOff) counted += 1;
  }
  if (total === 1 && halfDayType !== "NONE") counted = 0.5;
  return { total, counted };
}

async function generateSelfServiceLeaveDays(c: Context<AppBindings>, requestId: string, startDate: string, endDate: string, halfDayType: string, includeWeeklyOff: boolean) {
  const total = daysBetween(startDate, endDate) ?? 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const statements = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
    const singleHalf = total === 1 && halfDayType !== "NONE";
    const dayType = singleHalf ? "HALF_DAY" : weekend ? "WEEKLY_OFF" : "FULL_DAY";
    statements.push(
      c.env.DB
        .prepare("INSERT INTO leave_request_days (id, leave_request_id, leave_date, day_type, counted_as_leave, payroll_impact_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), requestId, isoDate(date), dayType, dayType === "WEEKLY_OFF" && !includeWeeklyOff ? 0 : 1, JSON.stringify({ source: "self_service_foundation" }))
    );
  }
  if (statements.length) await c.env.DB.batch(statements);
}

function selfServiceDocumentRequired(policy: Row | null, requestedDays: number) {
  if (!policy) return false;
  if (Number(policy.requires_document) === 1) return true;
  const consecutive = Number(policy.document_required_after_consecutive_days ?? 0);
  return consecutive > 0 && requestedDays > consecutive;
}

async function selfServiceFirstUserWithPermission(c: Context<AppBindings>, permission: string) {
  return c.env.DB
    .prepare(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE u.status = 'ACTIVE' AND p.key = ?
       LIMIT 1`
    )
    .bind(permission)
    .first<{ id: string }>();
}

async function generateSelfServiceApprovalTimeline(c: Context<AppBindings>, request: Row) {
  const workflow = await c.env.DB
    .prepare(
      `SELECT * FROM leave_approval_workflows
       WHERE is_active = 1
         AND (applies_to_leave_type_id IS NULL OR applies_to_leave_type_id = ?)
         AND (applies_to_employee_type IS NULL OR applies_to_employee_type = ?)
         AND (applies_to_employment_type IS NULL OR applies_to_employment_type = ?)
         AND (department_id IS NULL OR department_id = ?)
         AND (location_id IS NULL OR location_id = ?)
       ORDER BY CASE WHEN is_default = 1 THEN 1 ELSE 0 END ASC, priority ASC, created_at ASC
       LIMIT 1`
    )
    .bind(request.leave_type_id, request.employee_type, request.employment_type, request.primary_department_id, request.primary_location_id)
    .first<Row>();
  const steps = workflow
    ? (await c.env.DB.prepare("SELECT * FROM leave_approval_steps WHERE workflow_id = ? ORDER BY step_order").bind(String(workflow.id)).all<Row>()).results
    : [{ step_order: 1, step_name: "HR approval", approver_type: "PERMISSION", permission_key: "leave.approve", is_required: 1, skip_if_no_approver: 0 }];
  for (const step of steps) {
    const approver = String(step.approver_type) === "PERMISSION" ? (await selfServiceFirstUserWithPermission(c, String(step.permission_key ?? "leave.approve")))?.id ?? null : null;
    const skipped = !approver && Number(step.skip_if_no_approver ?? 0) === 1;
    await c.env.DB
      .prepare("INSERT INTO leave_request_approvals (id, leave_request_id, workflow_id, step_id, step_order, step_name, approver_user_id, approver_type, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), request.id, workflow?.id ?? null, step.id ?? null, Number(step.step_order), String(step.step_name), approver, String(step.approver_type), skipped ? "SKIPPED" : "PENDING", skipped ? "Skipped because no approver was resolved." : approver ? null : "No approver resolved; HR/admin action required.")
      .run();
  }
}

async function updateSelfServiceLeaveBalance(c: Context<AppBindings>, request: Row, mode: "pending_add" | "approve") {
  await applyLeaveBalanceChange(c, request, mode);
  const employeeId = String(request.employee_id);
  const leaveTypeId = String(request.leave_type_id);
  const year = Number(String(request.start_date).slice(0, 4));
  const requested = Number(request.requested_days ?? 0);
  const existing = await c.env.DB.prepare("SELECT id FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND period_year = ?").bind(employeeId, leaveTypeId, year).first<{ id: string }>();
  if (!existing) {
    await c.env.DB.prepare("INSERT INTO leave_balances (id, employee_id, leave_type_id, period_year, accrued_days, closing_balance) VALUES (?, ?, ?, ?, 0, 0)").bind(crypto.randomUUID(), employeeId, leaveTypeId, year).run();
  }
  const clause = mode === "pending_add" ? "pending_days = pending_days + ?" : "used_days = used_days + ?";
  await c.env.DB.prepare(`UPDATE leave_balances SET ${clause}, closing_balance = opening_balance + accrued_days + adjusted_days + carried_forward_days - used_days - pending_days - expired_days, updated_at = ? WHERE employee_id = ? AND leave_type_id = ? AND period_year = ?`).bind(requested, new Date().toISOString(), employeeId, leaveTypeId, year).run();
}

selfServiceRoutes.get("/me", async (c) => {
  const disabled = await requireSelfServiceEnabled(c);
  if (disabled) return disabled;
  const employeeId = await linkedEmployeeId(c);
  const visibility = await getSelfServiceModuleVisibility(c);
  return ok(c, {
    linked_employee: Boolean(employeeId),
    employee_id: employeeId,
    module_visibility: visibility,
    unavailable_message: employeeId ? null : "This account is not linked to an employee profile."
  });
});

selfServiceRoutes.get("/settings", async (c) => {
  if (!hasAny(c, ["self_service.settings.view", "self_service.settings.manage", "settings.view", "settings.manage"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service settings.");
  }
  return ok(c, { settings: await getSelfServiceSettingsRow(c) });
});

selfServiceRoutes.patch("/settings", async (c) => {
  if (!hasAny(c, ["self_service.settings.update", "self_service.settings.manage", "settings.manage"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to update self-service settings.");
  }
  const oldSettings = await getSelfServiceSettingsRow(c);
  const body = await readJsonBody(c.req.raw);
  const updates: string[] = [];
  const bindings: unknown[] = [];
  for (const key of selfServiceSettingKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      updates.push(`${key} = ?`);
      bindings.push(body[key] ? 1 : 0);
    }
  }
  if (updates.length) {
    updates.push("updated_by_user_id = ?", "updated_at = ?");
    bindings.push(c.get("currentUser").id, new Date().toISOString());
    await c.env.DB.prepare(`UPDATE self_service_settings SET ${updates.join(", ")} WHERE id = 'self_service_settings_default'`).bind(...bindings).run();
  }
  const settings = await getSelfServiceSettingsRow(c);
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "self_service.settings.updated",
    module: "self_service",
    entityType: "self_service_settings",
    entityId: "self_service_settings_default",
    oldValue: oldSettings,
    newValue: settings,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "self_service.changed", { actor_user_id: c.get("currentUser").id, entity_type: "self_service", entity_id: "self_service_settings_default", action: "settings_updated" });
  return ok(c, { settings });
});

selfServiceRoutes.get("/dashboard", async (c) => {
  if (!hasAny(c, ["self_service.dashboard.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view the self-service dashboard.");
  const disabled = await assertSelfServiceModuleEnabled(c, "dashboard_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const [summary, visibility, notifications] = await Promise.all([
    getSelfServiceDashboardSummary(c, gate.employeeId!),
    getSelfServiceModuleVisibility(c),
    getSelfServiceNotifications(c, gate.employeeId!)
  ]);
  return ok(c, { employee: gate.employee, summary, module_visibility: visibility, notifications: notifications.slice(0, 8), unread_notifications: await getSelfServiceUnreadNotificationCount(c, gate.employeeId!) });
});

selfServiceRoutes.get("/profile", async (c) => {
  if (!hasAny(c, ["self_service.profile.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your self-service profile.");
  const disabled = await assertSelfServiceModuleEnabled(c, "profile_enabled");
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const employee = await c.env.DB
    .prepare(
      `SELECT e.id, e.employee_no, e.profile_photo_document_id, e.full_name, e.display_name,
        e.employee_type, e.employment_type, e.joining_date, e.confirmation_date,
        e.contract_start_date, e.contract_end_date, s.name AS status_name,
        d.name AS department_name, p.title AS position_title, l.name AS location_name,
        jl.name AS job_level_name
       FROM employees e
       LEFT JOIN employee_statuses s ON s.id = e.status_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       WHERE e.id = ?`
    )
    .bind(gate.employeeId)
    .first<Row>();
  const contacts = (
    await c.env.DB
      .prepare(
        `SELECT contact_type, value, country_code, relationship, is_primary, emergency_priority
         FROM employee_contacts
         WHERE employee_id = ? AND archived_at IS NULL
         ORDER BY is_primary DESC, emergency_priority ASC, contact_type ASC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { employee, contacts });
});

selfServiceRoutes.get("/profile/update-requests", async (c) => {
  if (!hasAny(c, ["self_service.profile_update_requests.view", "self_service.kyc_request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view profile update requests.");
  const disabled = await assertSelfServiceModuleEnabled(c, "profile_update_requests_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { requests: await getSelfServiceProfileUpdateRequests(c, gate.employeeId!) });
});

selfServiceRoutes.post("/profile/update-requests", async (c) => {
  if (!hasAny(c, ["self_service.profile_update_requests.create", "self_service.kyc_request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to submit profile update requests.");
  const disabled = await assertSelfServiceModuleEnabled(c, "profile_update_requests_enabled");
  if (disabled) return disabled;
  const settings = await getSelfServiceSettingsRow(c);
  if (!boolSetting(settings, "allow_profile_update_requests")) return fail(c, 403, "SELF_SERVICE_PROFILE_UPDATES_DISABLED", "Profile update requests are disabled.");
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const result = await createSelfServiceProfileUpdateRequest(c, gate.employeeId!, await readJsonBody(c.req.raw));
  if ("response" in result) return result.response;
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action: "self_service.profile_update_request.created", module: "self_service", entityType: "profile_update_request", entityId: result.request_id, newValue: { employee_id: gate.employeeId }, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") });
  return ok(c, result, 201);
});

selfServiceRoutes.post("/profile/update-requests/:requestId/cancel", async (c) => {
  if (!hasAny(c, ["self_service.profile_update_requests.create", "self_service.kyc_request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to cancel profile update requests.");
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return cancelSelfServiceProfileUpdateRequest(c, gate.employeeId!, c.req.param("requestId"));
});

selfServiceRoutes.get("/documents", async (c) => {
  if (!hasAny(c, ["self_service.documents.compliance.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your self-service documents.");
  const disabled = await assertSelfServiceModuleEnabled(c, "documents_enabled");
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const rows = (
    await c.env.DB
      .prepare(
        `SELECT ed.id, dt.name AS document_type_name, dc.name AS category_name,
          ed.document_number, ed.issue_date, ed.expiry_date,
          CASE
            WHEN ed.status <> 'ACTIVE' THEN ed.status
            WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) < date('now') THEN 'EXPIRED'
            WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) <= date('now', '+30 day') THEN 'EXPIRING_SOON'
            ELSE 'VALID'
          END AS display_status,
          ed.status, COALESCE(ed.is_sensitive, dt.is_sensitive, 0) AS is_sensitive,
          v.original_filename
         FROM employee_documents ed
         JOIN document_types dt ON dt.id = ed.document_type_id
         LEFT JOIN document_categories dc ON dc.id = ed.category_id
         LEFT JOIN employee_document_versions v ON v.id = ed.current_version_id
         WHERE ed.employee_id = ? AND ed.status <> 'SOFT_DELETED'
         ORDER BY COALESCE(ed.expiry_date, ed.created_at) ASC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { documents: maskSelfServiceDocuments(rows), upload_enabled: false, upload_note: "Document uploads are managed by HR/Admin." });
});

selfServiceRoutes.get("/documents/warnings", async (c) => {
  if (!hasAny(c, ["self_service.documents.compliance.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your document warnings.");
  const disabled = await assertSelfServiceModuleEnabled(c, "documents_compliance_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { warnings: maskSelfServiceDocuments(await getSelfServiceDocumentWarnings(c, gate.employeeId!)) });
});

selfServiceRoutes.get("/attendance", async (c) => {
  if (!hasAny(c, ["self_service.attendance.view", "self_service.view", "attendance.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service attendance.");
  const selfServiceDisabled = await assertSelfServiceModuleEnabled(c, "attendance_enabled");
  if (selfServiceDisabled) return selfServiceDisabled;
  const disabled = await requireSelfServiceAttendanceEnabled(c);
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const from = c.req.query("date_from") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = c.req.query("date_to") ?? new Date().toISOString().slice(0, 10);
  const records = (
    await c.env.DB
      .prepare(
        `SELECT id, attendance_date, status, first_clock_in, last_clock_out,
          total_work_minutes, late_minutes, early_checkout_minutes, missed_punch, source, payroll_impact_json, notes
         FROM attendance_daily_records
         WHERE employee_id = ? AND attendance_date >= ? AND attendance_date <= ?
         ORDER BY attendance_date DESC`
      )
      .bind(gate.employeeId, from, to)
      .all<Row>()
  ).results;
  const corrections = (
    await c.env.DB
      .prepare(
        `SELECT id, attendance_date, requested_clock_in, requested_clock_out, requested_status,
          reason, status, reviewed_at, review_note, created_at
         FROM attendance_correction_requests
         WHERE employee_id = ?
         ORDER BY created_at DESC LIMIT 100`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { attendance_module_enabled: true, records, corrections, filters: { date_from: from, date_to: to } });
});

selfServiceRoutes.get("/attendance/summary", async (c) => {
  if (!hasAny(c, ["self_service.attendance.view", "self_service.view", "attendance.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service attendance.");
  const disabled = await assertSelfServiceModuleEnabled(c, "attendance_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const summary = await getSelfServiceAttendanceSummary(c, gate.employeeId!);
  const corrections = await getSelfServiceAttendanceCorrectionTimeline(c, gate.employeeId!);
  return ok(c, { summary, corrections });
});

selfServiceRoutes.get("/attendance/calendar", async (c) => {
  if (!hasAny(c, ["self_service.attendance.view", "self_service.view", "attendance.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service attendance.");
  const disabled = await assertSelfServiceModuleEnabled(c, "attendance_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const from = c.req.query("date_from") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = c.req.query("date_to") ?? new Date().toISOString().slice(0, 10);
  return ok(c, { records: await getSelfServiceAttendanceCalendar(c, gate.employeeId!, from, to), filters: { date_from: from, date_to: to } });
});

selfServiceRoutes.get("/attendance/daily-records", async (c) => {
  if (!hasAny(c, ["self_service.attendance.view", "self_service.view", "attendance.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service attendance.");
  const disabled = await assertSelfServiceModuleEnabled(c, "attendance_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const from = c.req.query("date_from") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = c.req.query("date_to") ?? new Date().toISOString().slice(0, 10);
  return ok(c, { records: await getSelfServiceAttendanceCalendar(c, gate.employeeId!, from, to), filters: { date_from: from, date_to: to } });
});

selfServiceRoutes.get("/attendance/corrections", async (c) => {
  if (!hasAny(c, ["self_service.attendance_correction.view", "self_service.attendance.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service attendance corrections.");
  const disabled = await assertSelfServiceModuleEnabled(c, "attendance_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { corrections: await getSelfServiceAttendanceCorrectionTimeline(c, gate.employeeId!) });
});

selfServiceRoutes.post("/attendance/corrections", async (c) => {
  if (!hasAny(c, ["self_service.attendance_correction.request", "self_service.attendance_correction", "attendance.corrections.create"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to request attendance corrections.");
  const selfServiceDisabled = await assertSelfServiceModuleEnabled(c, "attendance_enabled");
  if (selfServiceDisabled) return selfServiceDisabled;
  const disabled = await requireSelfServiceAttendanceEnabled(c);
  if (disabled) return disabled;
  const selfServiceSettings = await getSelfServiceSettingsRow(c);
  if (!boolSetting(selfServiceSettings, "allow_attendance_correction_requests")) return fail(c, 403, "SELF_SERVICE_ATTENDANCE_CORRECTIONS_DISABLED", "Attendance correction requests are disabled.");
  const settings = await getSelfServiceAttendanceSettings(c);
  if (Number(settings.allow_employee_correction_requests ?? 1) !== 1) return fail(c, 403, "ATTENDANCE_CORRECTIONS_DISABLED", "Employee attendance correction requests are disabled.");
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw);
  const attendanceDate = readString(body.attendance_date);
  const reason = readString(body.reason);
  if (!attendanceDate || !reason) {
    return fail(c, 400, "VALIDATION_ERROR", "Attendance date and reason are required.");
  }
  const current = await c.env.DB.prepare("SELECT * FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(gate.employeeId, attendanceDate).first<Record<string, unknown>>();
  const requested = {
    requested_clock_in: readString(body.requested_clock_in) || null,
    requested_clock_out: readString(body.requested_clock_out) || null,
    requested_status: parseAttendanceStatus(body.requested_status)
  };
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO attendance_correction_requests
       (id, employee_id, attendance_date, current_record_id, request_type, current_values_json, requested_values_json, requested_clock_in, requested_clock_out, requested_status, reason, status, requested_by_user_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
    )
    .bind(id, gate.employeeId, attendanceDate, current?.id ?? null, readString(body.request_type) || "SELF_SERVICE", JSON.stringify(selfServiceAttendanceSnapshot(current)), JSON.stringify(requested), requested.requested_clock_in, requested.requested_clock_out, requested.requested_status, reason, c.get("currentUser").id, JSON.stringify({ source: "self_service" }))
    .run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "self_service.attendance_correction_requested",
    module: "self_service",
    entityType: "self_service",
    entityId: id,
    newValue: { attendance_date: attendanceDate },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "self_service.changed", { actor_user_id: c.get("currentUser").id, entity_type: "self_service", entity_id: id, action: "attendance_correction_requested" });
  return ok(c, { correction_id: id }, 201);
});

selfServiceRoutes.post("/attendance/correction-requests", async (c) => {
  if (!hasAny(c, ["self_service.attendance_correction.request", "self_service.attendance_correction", "attendance.corrections.create"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to request attendance corrections.");
  const disabled = await requireSelfServiceAttendanceEnabled(c);
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw);
  const attendanceDate = readString(body.attendance_date);
  const reason = readString(body.reason);
  if (!attendanceDate || !reason) return fail(c, 400, "VALIDATION_ERROR", "Attendance date and reason are required.");
  const current = await c.env.DB.prepare("SELECT * FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(gate.employeeId, attendanceDate).first<Record<string, unknown>>();
  const requested = { requested_clock_in: readString(body.requested_clock_in) || null, requested_clock_out: readString(body.requested_clock_out) || null, requested_status: parseAttendanceStatus(body.requested_status) };
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO attendance_correction_requests
     (id, employee_id, attendance_date, current_record_id, request_type, current_values_json, requested_values_json, requested_clock_in, requested_clock_out, requested_status, reason, status, requested_by_user_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
  ).bind(id, gate.employeeId, attendanceDate, current?.id ?? null, readString(body.request_type) || "SELF_SERVICE", JSON.stringify(selfServiceAttendanceSnapshot(current)), JSON.stringify(requested), requested.requested_clock_in, requested.requested_clock_out, requested.requested_status, reason, c.get("currentUser").id, JSON.stringify({ source: "self_service" })).run();
  return ok(c, { correction_id: id }, 201);
});

selfServiceRoutes.get("/leave", async (c) => {
  if (!hasAny(c, ["self_service.leave.view", "self_service.leave_request", "leave.request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service leave.");
  const disabled = await assertSelfServiceModuleEnabled(c, "leave_enabled");
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const balances = (await c.env.DB.prepare("SELECT * FROM leave_balances WHERE employee_id = ? ORDER BY period_year DESC").bind(gate.employeeId).all<Row>()).results;
  const cycles = await getSelfServiceLeaveCycles(c, gate.employeeId);
  const requests = (
    await c.env.DB
      .prepare(
        `SELECT lr.*, lt.name AS leave_type_name
         FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.employee_id = ? ORDER BY lr.created_at DESC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  const approvals = (
    await c.env.DB
      .prepare(
        `SELECT a.* FROM leave_request_approvals a
         JOIN leave_requests lr ON lr.id = a.leave_request_id
         WHERE lr.employee_id = ? ORDER BY a.step_order ASC, a.created_at ASC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { balances, balance_cycles: cycles.balance_cycles, ledger_recent: cycles.ledger_recent, requests, approvals, leave_request_enabled: c.get("currentUser").permissions.includes("self_service.leave_request") || c.get("currentUser").permissions.includes("leave.request") });
});

selfServiceRoutes.get("/leave/summary", async (c) => {
  if (!hasAny(c, ["self_service.leave.view", "self_service.leave_request", "leave.request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service leave.");
  const disabled = await assertSelfServiceModuleEnabled(c, "leave_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { summary: await getSelfServiceLeaveSummary(c, gate.employeeId!) });
});

selfServiceRoutes.get("/leave/balances", async (c) => {
  if (!hasAny(c, ["self_service.leave.view", "self_service.leave_request", "leave.request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service leave balances.");
  const disabled = await assertSelfServiceModuleEnabled(c, "leave_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, await getSelfServiceLeaveBalances(c, gate.employeeId!));
});

selfServiceRoutes.get("/leave/requests", async (c) => {
  if (!hasAny(c, ["self_service.leave.view", "self_service.leave_request", "leave.request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service leave requests.");
  const disabled = await assertSelfServiceModuleEnabled(c, "leave_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const requests = (await c.env.DB.prepare("SELECT lr.*, lt.name AS leave_type_name FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.employee_id = ? ORDER BY lr.created_at DESC").bind(gate.employeeId).all<Row>()).results;
  return ok(c, { requests });
});

selfServiceRoutes.post("/leave/requests", async (c) => {
  if (!hasAny(c, ["self_service.leave_request", "leave.request"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to create a self-service leave request.");
  }
  const selfServiceDisabled = await assertSelfServiceModuleEnabled(c, "leave_enabled");
  if (selfServiceDisabled) return selfServiceDisabled;
  const selfServiceSettings = await getSelfServiceSettingsRow(c);
  if (!boolSetting(selfServiceSettings, "allow_leave_requests")) return fail(c, 403, "SELF_SERVICE_LEAVE_REQUESTS_DISABLED", "Leave requests are disabled.");
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw);
  const leaveTypeId = readString(body.leave_type_id);
  const startDate = readString(body.start_date);
  const endDate = readString(body.end_date);
  const halfDayType = readString(body.half_day_type) || "NONE";
  if (!leaveTypeId || !startDate || !endDate) {
    return fail(c, 400, "VALIDATION_ERROR", "Leave type, start date, and end date are required.");
  }
  const employee = await selfServiceEmployee(c, gate.employeeId);
  if (!employee) return fail(c, 400, "INVALID_EMPLOYEE", "Linked employee profile was not found or is archived.");
  const leaveType = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ? AND is_active = 1").bind(leaveTypeId).first<Row>();
  if (!leaveType) return fail(c, 400, "INVALID_LEAVE_TYPE", "Leave type was not found or is disabled.");
  const overlap = await c.env.DB
    .prepare("SELECT id FROM leave_requests WHERE employee_id = ? AND status NOT IN ('REJECTED', 'CANCELLED') AND (? <= end_date AND ? >= start_date) LIMIT 1")
    .bind(gate.employeeId, startDate, endDate)
    .first<{ id: string }>();
  if (overlap) return fail(c, 409, "OVERLAPPING_LEAVE", "An active leave request already overlaps this date range.");
  const policy = await findSelfServiceLeavePolicy(c, employee, leaveTypeId);
  if (halfDayType !== "NONE" && policy && Number(policy.allow_half_day) !== 1) {
    return fail(c, 400, "HALF_DAY_NOT_ALLOWED", "Selected policy does not allow half-day leave.");
  }
  const calculated = calculateSelfServiceLeaveDays(startDate, endDate, halfDayType, Number(policy?.include_weekly_off_days ?? 0) === 1);
  if (!calculated || calculated.counted <= 0) return fail(c, 400, "INVALID_DATES", "Leave dates must produce at least one counted leave day.");
  if (policy?.max_consecutive_days && calculated.counted > Number(policy.max_consecutive_days)) {
    return fail(c, 400, "MAX_CONSECUTIVE_DAYS", "Requested leave exceeds the policy maximum consecutive days.");
  }
  const documentRequired = selfServiceDocumentRequired(policy, calculated.counted);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const salaryMode = String(policy?.salary_deduction_mode ?? "NONE");
  await c.env.DB
    .prepare(
      `INSERT INTO leave_requests
       (id, employee_id, leave_type_id, policy_id, start_date, end_date, total_days, requested_days, half_day_type,
        reason, status, document_required, document_status, salary_deduction_mode, salary_deduction_estimate_json,
        public_holiday_handling_json, submitted_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      gate.employeeId,
      leaveTypeId,
      policy?.id ?? null,
      startDate,
      endDate,
      calculated.total,
      calculated.counted,
      halfDayType,
      readString(body.reason) || null,
      documentRequired ? 1 : 0,
      documentRequired ? "REQUIRED_PENDING" : "NOT_REQUIRED",
      salaryMode,
      JSON.stringify({ mode: salaryMode, estimated_days: salaryMode === "NONE" ? 0 : calculated.counted, source: "self_service_foundation" }),
      JSON.stringify({ include_weekly_off_days: Number(policy?.include_weekly_off_days ?? 0) === 1 }),
      c.get("currentUser").id
    )
    .run();
  await generateSelfServiceLeaveDays(c, id, startDate, endDate, halfDayType, Number(policy?.include_weekly_off_days ?? 0) === 1);
  let finalStatus = "DRAFT";
  if (!documentRequired) {
    const requestForTimeline = { ...employee, id, employee_id: gate.employeeId, leave_type_id: leaveTypeId, start_date: startDate, requested_days: calculated.counted };
    await generateSelfServiceApprovalTimeline(c, requestForTimeline);
    const pending = await c.env.DB.prepare("SELECT id FROM leave_request_approvals WHERE leave_request_id = ? AND status = 'PENDING' ORDER BY step_order LIMIT 1").bind(id).first();
    if (pending) {
      finalStatus = "PENDING_APPROVAL";
      await c.env.DB.prepare("UPDATE leave_requests SET status = 'PENDING_APPROVAL', submitted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
      await updateSelfServiceLeaveBalance(c, { id, employee_id: gate.employeeId, leave_type_id: leaveTypeId, policy_id: policy?.id ?? null, start_date: startDate, requested_days: calculated.counted }, "pending_add");
    } else {
      finalStatus = "APPROVED";
      await c.env.DB.prepare("UPDATE leave_requests SET status = 'APPROVED', submitted_at = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(now, now, now, id).run();
      await updateSelfServiceLeaveBalance(c, { id, employee_id: gate.employeeId, leave_type_id: leaveTypeId, policy_id: policy?.id ?? null, start_date: startDate, requested_days: calculated.counted }, "approve");
    }
  }
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: documentRequired ? "self_service.leave_request.created" : "self_service.leave_request.submitted",
    module: "self_service",
    entityType: "leave_request",
    entityId: id,
    newValue: { leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate, status: finalStatus, document_required: documentRequired },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "self_service.changed", { actor_user_id: c.get("currentUser").id, entity_type: "leave_request", entity_id: id, action: "self_service.leave_request.submitted" });
  const request = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE id = ?").bind(id).first<Row>();
  const approvals = (await c.env.DB.prepare("SELECT * FROM leave_request_approvals WHERE leave_request_id = ? ORDER BY step_order").bind(id).all<Row>()).results;
  const approval_chain_preview = request ? await getLeaveApprovalChainPreview(c, { ...employee, ...request, department_id: employee.primary_department_id, position_id: employee.primary_position_id, location_id: employee.primary_location_id }) : null;
  return ok(c, { request, approvals, document_required: documentRequired, approval_chain_preview }, 201);
});

selfServiceRoutes.get("/leave/requests/:requestId", async (c) => {
  if (!hasAny(c, ["self_service.leave.view", "self_service.leave_request", "leave.request", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view this leave request.");
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const request = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE id = ? AND employee_id = ?").bind(c.req.param("requestId"), gate.employeeId).first<Row>();
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const approvals = (await c.env.DB.prepare("SELECT * FROM leave_request_approvals WHERE leave_request_id = ? ORDER BY step_order").bind(c.req.param("requestId")).all<Row>()).results;
  return ok(c, { request, approvals });
});

selfServiceRoutes.post("/leave/requests/:requestId/cancel", async (c) => {
  if (!hasAny(c, ["self_service.leave.cancel", "leave.cancel", "leave.requests.cancel", "self_service.leave_request"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to cancel this leave request.");
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const request = await c.env.DB.prepare("SELECT * FROM leave_requests WHERE id = ? AND employee_id = ?").bind(c.req.param("requestId"), gate.employeeId).first<Row>();
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!["DRAFT", "PENDING_APPROVAL"].includes(String(request.status))) return fail(c, 400, "LEAVE_NOT_CANCELLABLE", "Only draft or pending leave requests can be cancelled from self-service.");
  await c.env.DB.prepare("UPDATE leave_requests SET status = 'CANCELLED', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), c.req.param("requestId")).run();
  await recordAudit(c.env.DB, { actorUserId: c.get("currentUser").id, action: "self_service.leave_request.cancelled", module: "self_service", entityType: "leave_request", entityId: c.req.param("requestId"), newValue: { employee_id: gate.employeeId }, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") });
  return ok(c, { cancelled: true });
});

selfServiceRoutes.get("/roster", async (c) => {
  if (!hasAny(c, ["self_service.roster.view", "roster.self.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your roster.");
  const selfServiceDisabled = await assertSelfServiceModuleEnabled(c, "roster_enabled");
  if (selfServiceDisabled) return selfServiceDisabled;
  const disabled = await requireSelfServiceRosterEnabled(c);
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const weekStart = readString(c.req.query("week_start_date")) || isoDate(new Date());
  const start = /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStart : isoDate(new Date());
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = isoDate(endDate);
  const assignments = (
    await c.env.DB
      .prepare(
        `SELECT ra.*, rp.status AS period_status, st.code AS shift_code, st.name AS shift_name,
          st.start_time AS shift_start_time, st.end_time AS shift_end_time, st.color_label AS shift_color_label,
          l.name AS location_name, d.name AS department_name
         FROM roster_assignments ra
         JOIN roster_periods rp ON rp.id = ra.roster_period_id
         LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
         LEFT JOIN locations l ON l.id = rp.location_id
         LEFT JOIN departments d ON d.id = rp.department_id
         WHERE ra.employee_id = ? AND ra.roster_date BETWEEN ? AND ? AND rp.status IN ('PUBLISHED', 'LOCKED')
         ORDER BY ra.roster_date ASC`
      )
      .bind(gate.employeeId, start, end)
      .all<Row>()
  ).results;
  return ok(c, { week_start_date: start, week_end_date: end, assignments });
});

selfServiceRoutes.get("/roster/weekly", async (c) => {
  if (!hasAny(c, ["self_service.roster.view", "roster.self.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your roster.");
  const disabled = await assertSelfServiceModuleEnabled(c, "roster_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  const start = readString(c.req.query("week_start_date")) || isoDate(new Date());
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = isoDate(endDate);
  return ok(c, { week_start_date: start, week_end_date: end, assignments: await getSelfServiceRosterWeekly(c, gate.employeeId!, start, end) });
});

selfServiceRoutes.get("/roster/upcoming", async (c) => {
  if (!hasAny(c, ["self_service.roster.view", "roster.self.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your roster.");
  const disabled = await assertSelfServiceModuleEnabled(c, "roster_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { assignments: await getSelfServiceUpcomingShifts(c, gate.employeeId!) });
});

selfServiceRoutes.get("/roster/week", async (c) => {
  if (!hasAny(c, ["self_service.roster.view", "roster.self.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your roster.");
  const selfServiceDisabled = await assertSelfServiceModuleEnabled(c, "roster_enabled");
  if (selfServiceDisabled) return selfServiceDisabled;
  const disabled = await requireSelfServiceRosterEnabled(c);
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const weekStart = readString(c.req.query("week_start_date")) || isoDate(new Date());
  const start = /^\d{4}-\d{2}-\d{2}$/.test(weekStart) ? weekStart : isoDate(new Date());
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = isoDate(endDate);
  const assignments = (
    await c.env.DB
      .prepare(
        `SELECT ra.*, rp.status AS period_status, st.code AS shift_code, st.name AS shift_name,
          st.start_time AS shift_start_time, st.end_time AS shift_end_time, st.color_label AS shift_color_label,
          l.name AS location_name, d.name AS department_name
         FROM roster_assignments ra
         JOIN roster_periods rp ON rp.id = ra.roster_period_id
         LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
         LEFT JOIN locations l ON l.id = rp.location_id
         LEFT JOIN departments d ON d.id = rp.department_id
         WHERE ra.employee_id = ? AND ra.roster_date BETWEEN ? AND ? AND rp.status IN ('PUBLISHED', 'LOCKED')
         ORDER BY ra.roster_date ASC`
      )
      .bind(gate.employeeId, start, end)
      .all<Row>()
  ).results;
  return ok(c, { week_start_date: start, week_end_date: end, assignments });
});

selfServiceRoutes.get("/payroll", async (c) => {
  if (!hasAny(c, ["self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service payroll.");
  const disabled = await assertSelfServiceModuleEnabled(c, "payroll_enabled");
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const payrollSettings = await c.env.DB.prepare("SELECT module_enabled FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Row>();
  if (Number(payrollSettings?.module_enabled ?? 1) !== 1) return fail(c, 503, "PAYROLL_MODULE_DISABLED", "Payroll module is disabled.");
  const profile = await c.env.DB.prepare("SELECT employee_id, basic_salary, currency, payroll_included, payment_method, effective_from FROM employee_payroll_profiles WHERE employee_id = ?").bind(gate.employeeId).first<Row>();
  const runs = (
    await c.env.DB
      .prepare(
        `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
          pre.status, pre.basic_salary, pre.total_earnings, pre.total_deductions, pre.net_salary, pr.finalized_at
         FROM payroll_employee_results pre
         JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
         JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
         WHERE pre.employee_id = ?
         ORDER BY pp.period_year DESC, pp.period_month DESC LIMIT 24`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  const advances = (await c.env.DB.prepare("SELECT amount, payment_date, status, notes, created_at FROM payroll_advance_payments WHERE employee_id = ? ORDER BY payment_date DESC LIMIT 24").bind(gate.employeeId).all<Row>()).results;
  const deductions = (await c.env.DB.prepare("SELECT deduction_type, amount, start_date, end_date, status, reason FROM payroll_deductions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 24").bind(gate.employeeId).all<Row>()).results;
  const payslips = (await c.env.DB.prepare("SELECT ps.id, ps.payslip_number, ps.status, ps.generated_at, ps.version_number, pp.period_month, pp.period_year, pre.net_salary FROM payroll_payslips ps INNER JOIN payroll_periods pp ON pp.id = ps.payroll_period_id INNER JOIN payroll_employee_results pre ON pre.id = ps.payroll_employee_result_id WHERE ps.employee_id = ? AND ps.status IN ('GENERATED', 'REGENERATED') ORDER BY pp.period_year DESC, pp.period_month DESC, ps.generated_at DESC LIMIT 24").bind(gate.employeeId).all<Row>()).results;
  const selfServiceSettings = await getSelfServiceSettingsRow(c);
  return ok(c, { profile: maskSelfServiceSensitiveFields(profile, boolSetting(selfServiceSettings, "show_sensitive_payroll_values")), runs, advances, deductions, payslips, payslip_download_enabled: boolSetting(selfServiceSettings, "allow_payslip_downloads") && hasAny(c, ["self_service.payslips.download", "self_service.payroll.view", "self_service.view"]) });
});

selfServiceRoutes.get("/payroll/summary", async (c) => {
  if (!hasAny(c, ["self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service payroll.");
  const disabled = await assertSelfServiceModuleEnabled(c, "payroll_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { summary: await getSelfServicePayrollSummary(c, gate.employeeId!) });
});

selfServiceRoutes.get("/payroll/history", async (c) => {
  if (!hasAny(c, ["self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service payroll history.");
  const disabled = await assertSelfServiceModuleEnabled(c, "payroll_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { history: await getSelfServicePayrollHistory(c, gate.employeeId!) });
});

selfServiceRoutes.get("/payroll/payslips", async (c) => {
  if (!hasAny(c, ["self_service.payslips.view", "self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view payslips.");
  const disabled = await assertSelfServiceModuleEnabled(c, "payslips_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { payslips: await getSelfServicePayslips(c, gate.employeeId!) });
});

selfServiceRoutes.get("/payslips", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  if (!hasAny(c, ["self_service.payslips.view", "self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view payslips.");
  const disabled = await assertSelfServiceModuleEnabled(c, "payslips_enabled");
  if (disabled) return disabled;
  const rows = (await c.env.DB.prepare("SELECT ps.id, ps.payslip_number, ps.status, ps.generated_at, ps.version_number, pp.period_month, pp.period_year, pre.net_salary FROM payroll_payslips ps INNER JOIN payroll_periods pp ON pp.id = ps.payroll_period_id INNER JOIN payroll_employee_results pre ON pre.id = ps.payroll_employee_result_id WHERE ps.employee_id = ? AND ps.status IN ('GENERATED', 'REGENERATED') ORDER BY pp.period_year DESC, pp.period_month DESC, ps.generated_at DESC").bind(gate.employeeId).all<Row>()).results;
  return ok(c, { payslips: rows });
});

selfServiceRoutes.get("/payslips/:payslipId", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  if (!hasAny(c, ["self_service.payslips.view", "self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view payslips.");
  const row = await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ? AND employee_id = ?").bind(c.req.param("payslipId"), gate.employeeId).first<Row>();
  if (!row) return fail(c, 404, "PAYSIP_ACCESS_DENIED", "You can only view your own payslips.");
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "self_service.payslip.viewed",
    module: "payroll",
    entityType: "payroll_payslip",
    entityId: String(row.id),
    newValue: { employee_id: gate.employeeId },
    oldValue: undefined,
    reason: null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("user-agent") ?? null
  });
  return ok(c, { payslip: row });
});

selfServiceRoutes.get("/payslips/:payslipId/preview", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  if (!hasAny(c, ["self_service.payslips.view", "self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to preview payslips.");
  const row = await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ? AND employee_id = ?").bind(c.req.param("payslipId"), gate.employeeId).first<Row>();
  if (!row) return fail(c, 404, "PAYSIP_ACCESS_DENIED", "You can only view your own payslips.");
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "self_service.payslip.previewed",
    module: "payroll",
    entityType: "payroll_payslip",
    entityId: String(row.id),
    newValue: { employee_id: gate.employeeId },
    oldValue: undefined,
    reason: null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("user-agent") ?? null
  });
  return new Response(String(row.html_snapshot ?? ""), { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

selfServiceRoutes.get("/payslips/:payslipId/download", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  if (!hasAny(c, ["self_service.payslips.download", "self_service.payroll.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to download payslips.");
  const row = await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ? AND employee_id = ?").bind(c.req.param("payslipId"), gate.employeeId).first<Row>();
  if (!row) return fail(c, 404, "PAYSIP_ACCESS_DENIED", "You can only download your own payslips.");
  await c.env.DB.prepare("UPDATE payroll_payslips SET download_count = COALESCE(download_count, 0) + 1, last_downloaded_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), row.id).run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "self_service.payslip.downloaded",
    module: "payroll",
    entityType: "payroll_payslip",
    entityId: String(row.id),
    newValue: { employee_id: gate.employeeId },
    oldValue: undefined,
    reason: null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("user-agent") ?? null
  });
  return new Response(String(row.html_snapshot ?? ""), { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename=${row.payslip_number ?? "payslip"}.html` } });
});

selfServiceRoutes.get("/assets", async (c) => {
  if (!hasAny(c, ["self_service.assets.view", "self_service.view", "assets.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view your assets.");
  const disabled = await assertSelfServiceModuleEnabled(c, "assets_enabled");
  if (disabled) return disabled;
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const assignments = (
    await c.env.DB
      .prepare(
        `SELECT aa.id, ac.name AS category_name, ai.code AS asset_code, ai.name AS asset_name,
          ai.variant, ai.size, aa.issued_date, aa.expected_return_date, aa.returned_date,
          aa.status, aa.condition_on_issue, aa.condition_on_return, aa.deduction_amount
         FROM employee_asset_assignments aa
         JOIN asset_items ai ON ai.id = aa.asset_item_id
         JOIN asset_categories ac ON ac.id = ai.category_id
         WHERE aa.employee_id = ?
         ORDER BY aa.issued_date DESC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { assignments });
});

selfServiceRoutes.get("/requests", async (c) => {
  if (!hasAny(c, ["self_service.approvals.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service requests.");
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { requests: await getSelfServiceSubmittedRequests(c, gate.employeeId!) });
});

selfServiceRoutes.get("/approvals", async (c) => {
  if (!hasAny(c, ["self_service.approvals.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service approvals.");
  const disabled = await assertSelfServiceModuleEnabled(c, "approvals_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { approvals: await getSelfServiceApprovalStatus(c, gate.employeeId!), visibility_mode: "SELF_SERVICE" });
});

selfServiceRoutes.get("/notifications", async (c) => {
  if (!hasAny(c, ["self_service.notifications.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view self-service notifications.");
  const disabled = await assertSelfServiceModuleEnabled(c, "notifications_enabled");
  if (disabled) return disabled;
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  return ok(c, { notifications: await getSelfServiceNotifications(c, gate.employeeId!), unread_count: await getSelfServiceUnreadNotificationCount(c, gate.employeeId!) });
});

selfServiceRoutes.post("/notifications/:notificationId/read", async (c) => {
  if (!hasAny(c, ["self_service.notifications.update", "self_service.notifications.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to update self-service notifications.");
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  await markSelfServiceNotificationRead(c, gate.employeeId!, c.req.param("notificationId"));
  return ok(c, { read: true });
});

selfServiceRoutes.post("/notifications/mark-all-read", async (c) => {
  if (!hasAny(c, ["self_service.notifications.update", "self_service.notifications.view", "self_service.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to update self-service notifications.");
  const gate = await requireSelfServiceEmployeeContext(c);
  if (gate.response) return gate.response;
  await markSelfServiceNotificationRead(c, gate.employeeId!, "all");
  return ok(c, { read: true });
});

selfServiceRoutes.get("/kyc-requests", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const rows = (
    await c.env.DB
      .prepare(
        `SELECT id, section, field_key, old_value_json, requested_value_json, reason, status,
          reviewed_at, review_note, created_at, updated_at
         FROM employee_kyc_update_requests
         WHERE employee_id = ?
         ORDER BY created_at DESC`
      )
      .bind(gate.employeeId)
      .all<Row>()
  ).results;
  return ok(c, { requests: rows });
});

selfServiceRoutes.post("/kyc-requests", async (c) => {
  const gate = await requireLinkedEmployee(c);
  if (gate.response) return gate.response;
  const body = await readJsonBody(c.req.raw);
  const section = readString(body.section);
  const fieldKey = readString(body.field_key);
  const reason = readString(body.reason);
  const requestedValue = unwrapRequestedValue(body.requested_value ?? body.requested_value_json ?? body.fields);
  if (!section || requestedValue === undefined || requestedValue === null) {
    return fail(c, 400, "VALIDATION_ERROR", "Section and requested value are required.");
  }
  if (!fieldKey || protectedProfileUpdateFields.has(fieldKey)) {
    return fail(c, 400, "PROTECTED_FIELD", "This profile field cannot be changed through self-service requests.");
  }
  const oldValue = await currentProfileFieldValue(c.env.DB, gate.employeeId, fieldKey);
  const oldSnapshot = { [fieldKey]: oldValue };
  const requestedSnapshot = { [fieldKey]: requestedValue };
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_kyc_update_requests
       (id, employee_id, requested_by_user_id, section, field_key, old_value_json, requested_value_json, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, gate.employeeId, c.get("currentUser").id, section, fieldKey, JSON.stringify(oldSnapshot), JSON.stringify(requestedSnapshot), reason || null)
    .run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "kyc_request.submitted",
    module: "self_service",
    entityType: "kyc_request",
    entityId: id,
    newValue: { section, field_key: fieldKey || null },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "kyc_request.submitted", { actor_user_id: c.get("currentUser").id, entity_type: "kyc_request", entity_id: id, action: "kyc_request.submitted" });
  return ok(c, { request_id: id }, 201);
});

kycRoutes.get("/", async (c) => {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "employees", "manage", "e");
  conditions.push(scope.sql);
  bindings.push(...scope.params);
  const search = readString(c.req.query("search"));
  const status = readString(c.req.query("status"));
  const section = readString(c.req.query("section"));
  const dateFrom = readString(c.req.query("date_from"));
  const dateTo = readString(c.req.query("date_to"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR kr.field_key LIKE ? OR kr.reason LIKE ?)");
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push("kr.status = ?");
    bindings.push(status);
  }
  if (section) {
    conditions.push("kr.section = ?");
    bindings.push(section);
  }
  if (dateFrom) {
    conditions.push("date(kr.created_at) >= date(?)");
    bindings.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("date(kr.created_at) <= date(?)");
    bindings.push(dateTo);
  }
  const rows = (
    await c.env.DB
      .prepare(
        `SELECT kr.id, kr.employee_id, e.employee_no, e.full_name AS employee_name,
          kr.section, kr.field_key, kr.old_value_json, kr.requested_value_json, kr.reason, kr.status,
          u.name AS requested_by_name, kr.created_at, kr.reviewed_at, kr.review_note
         FROM employee_kyc_update_requests kr
         JOIN employees e ON e.id = kr.employee_id
         LEFT JOIN users u ON u.id = kr.requested_by_user_id
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         ORDER BY kr.created_at DESC LIMIT 500`
      )
      .bind(...bindings)
      .all<Row>()
  ).results;
  return ok(c, { requests: rows });
});

kycRoutes.post("/:id/approve", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reviewNote = readString(body.review_note);
  const request = await c.env.DB.prepare("SELECT employee_id, field_key, requested_value_json FROM employee_kyc_update_requests WHERE id = ?").bind(c.req.param("id")).first<{ employee_id: string; field_key: string | null; requested_value_json: string }>();
  if (!request || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), request.employee_id, "employees", "manage"))) return fail(c, 404, "NOT_FOUND", "KYC request was not found.");
  const fieldKey = request.field_key ?? "";
  const allowedEmployeeFields = new Set(["display_name", "nationality", "gender", "date_of_birth", "joining_date", "confirmation_date", "contract_start_date", "contract_end_date"]);
  if (allowedEmployeeFields.has(fieldKey)) {
    const parsed = JSON.parse(request.requested_value_json) as Record<string, unknown>;
    const cleanValue = unwrapRequestedValue(parsed[fieldKey]);
    await c.env.DB.prepare(`UPDATE employees SET ${fieldKey} = ?, updated_at = ? WHERE id = ?`).bind(cleanValue === undefined ? null : String(cleanValue), new Date().toISOString(), request.employee_id).run();
  }
  await c.env.DB.prepare("UPDATE employee_kyc_update_requests SET status = 'APPROVED', reviewed_by_user_id = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), reviewNote || null, new Date().toISOString(), c.req.param("id")).run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "kyc_request.approved",
    module: "employees",
    entityType: "kyc_request",
    entityId: c.req.param("id"),
    reason: reviewNote || null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "kyc_request.reviewed", { actor_user_id: c.get("currentUser").id, entity_type: "kyc_request", entity_id: c.req.param("id"), action: "kyc_request.approved" });
  return ok(c, { reviewed: true });
});

kycRoutes.post("/:id/reject", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reviewNote = readString(body.review_note);
  if (!reviewNote) return fail(c, 400, "REVIEW_NOTE_REQUIRED", "Review note is required when rejecting a KYC request.");
  const request = await c.env.DB.prepare("SELECT employee_id FROM employee_kyc_update_requests WHERE id = ?").bind(c.req.param("id")).first<{ employee_id: string }>();
  if (!request || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), request.employee_id, "employees", "manage"))) return fail(c, 404, "NOT_FOUND", "KYC request was not found.");
  await c.env.DB.prepare("UPDATE employee_kyc_update_requests SET status = 'REJECTED', reviewed_by_user_id = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), reviewNote || null, new Date().toISOString(), c.req.param("id")).run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "kyc_request.rejected",
    module: "employees",
    entityType: "kyc_request",
    entityId: c.req.param("id"),
    reason: reviewNote || null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "kyc_request.reviewed", { actor_user_id: c.get("currentUser").id, entity_type: "kyc_request", entity_id: c.req.param("id"), action: "kyc_request.rejected" });
  return ok(c, { reviewed: true });
});
