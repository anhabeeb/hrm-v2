import type { AccessScopeRule, AccessUser, ApiEnvelope, AuthUser, BootstrapStatus, EmployeeUserAccessPreview, Permission, Role, RoleMappingRule, UserStatus } from "../types/auth";
import type { AttendanceCorrection, AttendanceDashboard, AttendanceDayOverride, AttendanceDevice, AttendanceLog, AttendancePayrollImpact, AttendanceRawLog, AttendanceRecord, AttendanceSettings } from "../types/attendance";
import type {
  CompanyInput,
  DepartmentInput,
  JobLevelInput,
  LocationInput,
  OrganizationCompany,
  OrganizationDepartment,
  OrganizationJobLevel,
  OrganizationLocation,
  OrganizationPosition,
  PositionInput
} from "../types/organization";
import type {
  Employee,
  EmployeeContact,
  EmployeeContactInput,
  EmployeeInput,
  EmployeeNumberSettings,
  EmployeeStatusSetting,
  OnboardingStatus,
  OnboardingTask
} from "../types/employees";
import type {
  LeaveApproval,
  LeaveBalance,
  LeaveDashboard,
  LeaveDay,
  LeaveDocument,
  LeavePolicy,
  LeaveRequest,
  LeaveType,
  LeaveWorkflow,
  LeaveWorkflowStep
} from "../types/leave";
import type {
  AssetAssignment,
  AssetAssignmentEvent,
  AssetCategory,
  AssetDashboard,
  AssetDeductionRule,
  AssetItem,
  AuditLogRow,
  EmployeeAssetSummary,
  EmployeeNote,
  EmployeeNoteAttachment,
  EmployeeNoteCategory,
  EmployeeNoteVersion
} from "../types/assets";
import type {
  DocumentCategory,
  DocumentDashboard,
  DocumentRequiredRule,
  DocumentRequiredRuleInput,
  DocumentType,
  DocumentTypeInput,
  EmployeeDocument,
  EmployeeDocumentVersion,
  MissingDocument
} from "../types/documents";
import type { RosterAssignment, RosterDashboard, RosterPeriod, RosterSettings, ShiftTemplate, WeeklyOffRule, WeeklyRoster } from "../types/roster";
import type {
  EmployeePayrollProfile,
  EmployeePayrollSummary,
  PayrollAdjustment,
  PayrollAdvance,
  PayrollComponent,
  PayrollDashboard,
  PayrollDeduction,
  PayrollPeriod,
  PayrollRun,
  PayrollRunEmployee,
  PayrollRunLine,
  PayrollSettings
} from "../types/payroll";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.ok || !envelope.data) {
    throw new ApiError(envelope.error?.message ?? "Request failed.", envelope.error?.code ?? "REQUEST_FAILED", response.status);
  }

  return envelope.data;
}

async function multipartRequest<T>(path: string, body: FormData, token?: string | null) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !envelope.ok || !envelope.data) {
    throw new ApiError(envelope.error?.message ?? "Request failed.", envelope.error?.code ?? "REQUEST_FAILED", response.status);
  }

  return envelope.data;
}

async function blobRequest(path: string, token: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    let message = "Download failed.";
    let code = "REQUEST_FAILED";
    try {
      const envelope = (await response.json()) as ApiEnvelope<unknown>;
      message = envelope.error?.message ?? message;
      code = envelope.error?.code ?? code;
    } catch {
      // The endpoint may return a plain response when the failure is not API-shaped.
    }
    throw new ApiError(message, code, response.status);
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "download"
  };
}

function query(params?: Record<string, string | number | boolean | null | undefined>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  getBootstrapStatus() {
    return request<BootstrapStatus>("/api/v1/bootstrap/status");
  },
  createOwner(input: { name: string; email: string; password: string }) {
    return request<{ token: string; user: AuthUser }>("/api/v1/bootstrap/owner", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  login(input: { email: string; password: string }) {
    return request<{ token: string; user: AuthUser }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  me(token: string) {
    return request<{ user: AuthUser }>("/api/v1/auth/me", {}, token);
  },
  logout(token: string) {
    return request<{ logged_out: boolean }>("/api/v1/auth/logout", { method: "POST" }, token);
  },
  getMainDashboard(token: string) {
    return request<Record<string, unknown>>("/api/v1/dashboard", {}, token);
  },
  getReportCenter(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/reports/dashboard", {}, token);
  },
  getReport(token: string, key: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ report: { key: string; label: string; columns: string[]; rows: Record<string, unknown>[] } }>(`/api/v1/reports/${key}${query(filters)}`, {}, token);
  },
  exportReportCsv(token: string, key: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/reports/${key}/export.csv${query(filters)}`, token);
  },
  getSelfServiceMe(token: string) {
    return request<{ linked_employee: boolean; employee_id: string | null; unavailable_message: string | null }>("/api/v1/self-service/me", {}, token);
  },
  getSelfServiceProfile(token: string) {
    return request<{ employee: Record<string, unknown> | null; contacts: Record<string, unknown>[] }>("/api/v1/self-service/profile", {}, token);
  },
  getSelfServiceDocuments(token: string) {
    return request<{ documents: Record<string, unknown>[]; upload_enabled: boolean; upload_note: string }>("/api/v1/self-service/documents", {}, token);
  },
  getSelfServiceAttendance(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ records: Record<string, unknown>[]; corrections: Record<string, unknown>[]; filters: Record<string, unknown> }>(`/api/v1/self-service/attendance${query(filters)}`, {}, token);
  },
  createSelfServiceAttendanceCorrection(token: string, input: Record<string, unknown>) {
    return request<{ correction_id: string }>("/api/v1/self-service/attendance/corrections", { method: "POST", body: JSON.stringify(input) }, token);
  },
  createSelfServiceLeaveRequest(token: string, input: Record<string, unknown>) {
    return request<{ request: Record<string, unknown>; approvals: Record<string, unknown>[]; document_required: boolean; approval_chain_preview?: Record<string, unknown> | null }>("/api/v1/self-service/leave/requests", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getSelfServiceLeave(token: string) {
    return request<{ balances: Record<string, unknown>[]; balance_cycles: Record<string, unknown>[]; ledger_recent: Record<string, unknown>[]; requests: Record<string, unknown>[]; approvals: Record<string, unknown>[]; leave_request_enabled: boolean }>("/api/v1/self-service/leave", {}, token);
  },
  getSelfServicePayroll(token: string) {
    return request<{ profile: Record<string, unknown> | null; runs: Record<string, unknown>[]; advances: Record<string, unknown>[]; deductions: Record<string, unknown>[]; payslip_download_enabled: boolean }>("/api/v1/self-service/payroll", {}, token);
  },
  getSelfServiceAssets(token: string) {
    return request<{ assignments: Record<string, unknown>[] }>("/api/v1/self-service/assets", {}, token);
  },
  listSelfServiceKycRequests(token: string) {
    return request<{ requests: Record<string, unknown>[] }>("/api/v1/self-service/kyc-requests", {}, token);
  },
  createSelfServiceKycRequest(token: string, input: Record<string, unknown>) {
    return request<{ request_id: string }>("/api/v1/self-service/kyc-requests", { method: "POST", body: JSON.stringify(input) }, token);
  },
  listKycRequests(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ requests: Record<string, unknown>[] }>(`/api/v1/kyc-requests${query(filters)}`, {}, token);
  },
  approveKycRequest(token: string, id: string, review_note?: string | null) {
    return request<{ reviewed: boolean }>(`/api/v1/kyc-requests/${id}/approve`, { method: "POST", body: JSON.stringify({ review_note: review_note ?? null }) }, token);
  },
  rejectKycRequest(token: string, id: string, review_note: string) {
    return request<{ reviewed: boolean }>(`/api/v1/kyc-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ review_note }) }, token);
  },
  getMigrationStatus(token: string) {
    return request<{
      automatic_migration_enabled: boolean;
      validation_only: boolean;
      source: string;
      warning: string;
      supported_placeholders: string[];
    }>("/api/v1/migration/status", {}, token);
  },
  validateMigrationCsvPlaceholder(token: string, input: { import_type: string; filename?: string | null }) {
    return request<{ accepted: boolean; import_type: string; filename: string | null; validation_only: boolean; imported_rows: number; warnings: string[] }>(
      "/api/v1/migration/validate-csv-placeholder",
      { method: "POST", body: JSON.stringify(input) },
      token
    );
  },
  listUsers(token: string) {
    return request<{ users: AccessUser[] }>("/api/v1/users", {}, token);
  },
  getUser(token: string, id: string) {
    return request<{ user: AccessUser }>(`/api/v1/users/${id}`, {}, token);
  },
  createUser(token: string, input: { name: string; email: string; username?: string; password: string; status: UserStatus; role_ids: string[] }) {
    return request<{ user: AccessUser }>(
      "/api/v1/users",
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      token
    );
  },
  updateUser(token: string, id: string, input: { name: string; email: string; username?: string; role_ids: string[] }) {
    return request<{ user: AccessUser }>(
      `/api/v1/users/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(input)
      },
      token
    );
  },
  assignUserRoles(token: string, id: string, role_ids: string[]) {
    return request<{ user: AccessUser }>(
      `/api/v1/users/${id}/assign-roles`,
      {
        method: "POST",
        body: JSON.stringify({ role_ids })
      },
      token
    );
  },
  updateUserStatus(token: string, id: string, status: UserStatus) {
    return request<{ user: AuthUser }>(
      `/api/v1/users/${id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status })
      },
      token
    );
  },
  userAction(token: string, id: string, action: "enable" | "disable" | "lock" | "unlock" | "reset-password", body?: unknown) {
    return request<Record<string, unknown>>(
      `/api/v1/users/${id}/${action}`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {})
      },
      token
    );
  },
  listRoles(token: string) {
    return request<{ roles: Role[] }>("/api/v1/roles", {}, token);
  },
  getRole(token: string, id: string) {
    return request<{ role: Role; permissions: Permission[] }>(`/api/v1/roles/${id}`, {}, token);
  },
  createRole(token: string, input: { name: string; description?: string }) {
    return request<{ role: Role }>(
      "/api/v1/roles",
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      token
    );
  },
  updateRole(token: string, id: string, input: { name: string; description?: string; is_active?: boolean }) {
    return request<{ role: Role }>(
      `/api/v1/roles/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(input)
      },
      token
    );
  },
  setRolePermissions(token: string, id: string, permissions: string[]) {
    return request<{ role: Role }>(
      `/api/v1/roles/${id}/permissions`,
      {
        method: "PATCH",
        body: JSON.stringify({ permissions })
      },
      token
    );
  },
  roleAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ role: Role }>(`/api/v1/roles/${id}/${action}`, { method: "POST" }, token);
  },
  listPermissions(token: string) {
    return request<{ permissions: Permission[]; modules: Record<string, Permission[]> }>("/api/v1/permissions", {}, token);
  },
  listRoleMappings(token: string) {
    return request<{ role_mappings: RoleMappingRule[] }>("/api/v1/role-mappings", {}, token);
  },
  createRoleMapping(token: string, input: Record<string, unknown>) {
    return request<{ role_mapping: RoleMappingRule }>("/api/v1/role-mappings", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateRoleMapping(token: string, id: string, input: Record<string, unknown>) {
    return request<{ role_mapping: RoleMappingRule }>(`/api/v1/role-mappings/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  roleMappingAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ role_mapping: RoleMappingRule }>(`/api/v1/role-mappings/${id}/${action}`, { method: "POST" }, token);
  },
  listAccessScopes(token: string) {
    return request<{ access_scopes: AccessScopeRule[] }>("/api/v1/access-scopes", {}, token);
  },
  createAccessScope(token: string, input: Record<string, unknown>) {
    return request<{ access_scope: AccessScopeRule }>("/api/v1/access-scopes", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAccessScope(token: string, id: string, input: Record<string, unknown>) {
    return request<{ access_scope: AccessScopeRule }>(`/api/v1/access-scopes/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  accessScopeAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ access_scope: AccessScopeRule }>(`/api/v1/access-scopes/${id}/${action}`, { method: "POST" }, token);
  },
  getEmployeeUserAccess(token: string, employeeId: string) {
    return request<{ preview: EmployeeUserAccessPreview }>(`/api/v1/employees/${employeeId}/user-access`, {}, token);
  },
  applyEmployeeRoleMapping(token: string, employeeId: string, role_mapping_rule_id?: string | null) {
    return request<{ applied: boolean; preview: EmployeeUserAccessPreview }>(
      `/api/v1/employees/${employeeId}/user-access/apply`,
      { method: "POST", body: JSON.stringify({ role_mapping_rule_id: role_mapping_rule_id ?? null }) },
      token
    );
  },
  getCompany(token: string) {
    return request<{ company: OrganizationCompany | null }>("/api/v1/organization/company", {}, token);
  },
  saveCompany(token: string, input: CompanyInput, exists: boolean) {
    return request<{ company: OrganizationCompany }>(
      "/api/v1/organization/company",
      {
        method: exists ? "PATCH" : "POST",
        body: JSON.stringify(input)
      },
      token
    );
  },
  listLocations(token: string) {
    return request<{ locations: OrganizationLocation[] }>("/api/v1/organization/locations", {}, token);
  },
  createLocation(token: string, input: LocationInput) {
    return request<{ location: OrganizationLocation }>("/api/v1/organization/locations", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLocation(token: string, id: string, input: LocationInput) {
    return request<{ location: OrganizationLocation }>(`/api/v1/organization/locations/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  locationAction(token: string, id: string, action: "enable" | "disable") {
    return request<Record<string, unknown>>(`/api/v1/organization/locations/${id}/${action}`, { method: "POST" }, token);
  },
  listDepartments(token: string) {
    return request<{ departments: OrganizationDepartment[] }>("/api/v1/organization/departments", {}, token);
  },
  createDepartment(token: string, input: DepartmentInput) {
    return request<{ department: OrganizationDepartment }>("/api/v1/organization/departments", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateDepartment(token: string, id: string, input: DepartmentInput) {
    return request<{ department: OrganizationDepartment }>(`/api/v1/organization/departments/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  departmentAction(token: string, id: string, action: "enable" | "disable") {
    return request<Record<string, unknown>>(`/api/v1/organization/departments/${id}/${action}`, { method: "POST" }, token);
  },
  listJobLevels(token: string) {
    return request<{ job_levels: OrganizationJobLevel[] }>("/api/v1/organization/job-levels", {}, token);
  },
  createJobLevel(token: string, input: JobLevelInput) {
    return request<{ job_level: OrganizationJobLevel }>("/api/v1/organization/job-levels", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateJobLevel(token: string, id: string, input: JobLevelInput) {
    return request<{ job_level: OrganizationJobLevel }>(`/api/v1/organization/job-levels/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  jobLevelAction(token: string, id: string, action: "enable" | "disable") {
    return request<Record<string, unknown>>(`/api/v1/organization/job-levels/${id}/${action}`, { method: "POST" }, token);
  },
  listPositions(token: string) {
    return request<{ positions: OrganizationPosition[] }>("/api/v1/organization/positions", {}, token);
  },
  createPosition(token: string, input: PositionInput) {
    return request<{ position: OrganizationPosition }>("/api/v1/organization/positions", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePosition(token: string, id: string, input: PositionInput) {
    return request<{ position: OrganizationPosition }>(`/api/v1/organization/positions/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  positionAction(token: string, id: string, action: "enable" | "disable") {
    return request<Record<string, unknown>>(`/api/v1/organization/positions/${id}/${action}`, { method: "POST" }, token);
  },
  listEmployees(token: string) {
    return request<{ employees: Employee[] }>("/api/v1/employees", {}, token);
  },
  getEmployeeAssignmentOptions(token: string) {
    return request<{ departments: OrganizationDepartment[]; locations: OrganizationLocation[]; positions: OrganizationPosition[]; job_levels: OrganizationJobLevel[]; reporting_managers: Employee[] }>("/api/v1/employees/assignment-options", {}, token);
  },
  getEmployee(token: string, id: string) {
    return request<{ employee: Employee }>(`/api/v1/employees/${id}`, {}, token);
  },
  createEmployee(token: string, input: EmployeeInput) {
    return request<{ employee: Employee }>("/api/v1/employees", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateEmployee(token: string, id: string, input: EmployeeInput) {
    return request<{ employee: Employee }>(`/api/v1/employees/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveEmployee(token: string, id: string, reason: string) {
    return request<{ employee: Employee }>(`/api/v1/employees/${id}/archive`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  changeEmployeeStatus(token: string, id: string, input: { status_id: string; exit_date?: string | null; exit_reason?: string | null; reason?: string | null }) {
    return request<{ employee: Employee }>(`/api/v1/employees/${id}/status`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  getEmployeeOverview(token: string, id: string) {
    return request<{ employee: Employee; onboarding: OnboardingTask[]; contacts: EmployeeContact[]; audit: Record<string, unknown>[] }>(`/api/v1/employees/${id}/overview`, {}, token);
  },
  listEmployeeContacts(token: string, id: string) {
    return request<{ contacts: EmployeeContact[] }>(`/api/v1/employees/${id}/contacts`, {}, token);
  },
  createEmployeeContact(token: string, id: string, input: EmployeeContactInput) {
    return request<{ contact: EmployeeContact }>(`/api/v1/employees/${id}/contacts`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateEmployeeContact(token: string, id: string, contactId: string, input: EmployeeContactInput) {
    return request<{ contact: EmployeeContact }>(`/api/v1/employees/${id}/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveEmployeeContact(token: string, id: string, contactId: string, reason?: string | null) {
    return request<{ archived: boolean }>(`/api/v1/employees/${id}/contacts/${contactId}/archive`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  listEmployeeJobHistory(token: string, id: string) {
    return request<{ job_history: Record<string, unknown>[] }>(`/api/v1/employees/${id}/job-history`, {}, token);
  },
  createEmployeeJobHistory(token: string, id: string, input: Partial<EmployeeInput> & { effective_date: string; reason?: string | null }) {
    return request<{ employee: Employee }>(`/api/v1/employees/${id}/job-history`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listEmployeeOnboarding(token: string, id: string) {
    return request<{ onboarding: OnboardingTask[] }>(`/api/v1/employees/${id}/onboarding`, {}, token);
  },
  updateEmployeeOnboardingTask(token: string, id: string, taskId: string, status: OnboardingStatus) {
    return request<{ task: OnboardingTask }>(`/api/v1/employees/${id}/onboarding/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
  },
  listEmployeeAudit(token: string, id: string) {
    return request<{ audit: Record<string, unknown>[] }>(`/api/v1/employees/${id}/audit`, {}, token);
  },
  listEmployeeStatuses(token: string) {
    return request<{ statuses: EmployeeStatusSetting[] }>("/api/v1/employees/settings/statuses", {}, token);
  },
  createEmployeeStatus(token: string, input: Partial<EmployeeStatusSetting>) {
    return request<{ status: EmployeeStatusSetting }>("/api/v1/employees/settings/statuses", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateEmployeeStatusSetting(token: string, id: string, input: Partial<EmployeeStatusSetting>) {
    return request<{ status: EmployeeStatusSetting }>(`/api/v1/employees/settings/statuses/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  employeeStatusAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ status: EmployeeStatusSetting }>(`/api/v1/employees/settings/statuses/${id}/${action}`, { method: "POST" }, token);
  },
  getEmployeeNumberingSettings(token: string) {
    return request<{ settings: EmployeeNumberSettings }>("/api/v1/employees/settings/numbering", {}, token);
  },
  updateEmployeeNumberingSettings(token: string, input: Partial<EmployeeNumberSettings>) {
    return request<{ settings: EmployeeNumberSettings }>("/api/v1/employees/settings/numbering", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  previewEmployeeNumber(token: string, query = "") {
    return request<{ employee_no: string }>(`/api/v1/employees/settings/numbering/preview${query}`, {}, token);
  },
  listDocumentCategories(token: string) {
    return request<{ categories: DocumentCategory[] }>("/api/v1/documents/categories", {}, token);
  },
  createDocumentCategory(token: string, input: { name: string; description?: string | null; sort_order?: number }) {
    return request<{ category: DocumentCategory }>("/api/v1/documents/categories", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateDocumentCategory(token: string, id: string, input: { name: string; description?: string | null; sort_order?: number }) {
    return request<{ category: DocumentCategory }>(`/api/v1/documents/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  documentCategoryAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ category: DocumentCategory }>(`/api/v1/documents/categories/${id}/${action}`, { method: "POST" }, token);
  },
  listDocumentTypes(token: string) {
    return request<{ document_types: DocumentType[] }>("/api/v1/documents/types", {}, token);
  },
  createDocumentType(token: string, input: DocumentTypeInput) {
    return request<{ document_type: DocumentType }>("/api/v1/documents/types", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateDocumentType(token: string, id: string, input: DocumentTypeInput) {
    return request<{ document_type: DocumentType }>(`/api/v1/documents/types/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  documentTypeAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ document_type: DocumentType }>(`/api/v1/documents/types/${id}/${action}`, { method: "POST" }, token);
  },
  listDocumentRequiredRules(token: string) {
    return request<{ rules: DocumentRequiredRule[] }>("/api/v1/documents/required-rules", {}, token);
  },
  createDocumentRequiredRule(token: string, input: DocumentRequiredRuleInput) {
    return request<{ rule: DocumentRequiredRule }>("/api/v1/documents/required-rules", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateDocumentRequiredRule(token: string, id: string, input: DocumentRequiredRuleInput) {
    return request<{ rule: DocumentRequiredRule }>(`/api/v1/documents/required-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  documentRequiredRuleAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ rule: DocumentRequiredRule }>(`/api/v1/documents/required-rules/${id}/${action}`, { method: "POST" }, token);
  },
  listDocumentRegistry(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ documents: EmployeeDocument[] }>(`/api/v1/documents/registry${query(filters)}`, {}, token);
  },
  listMissingDocuments(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ missing: MissingDocument[] }>(`/api/v1/documents/missing${query(filters)}`, {}, token);
  },
  listExpiringDocuments(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ documents: EmployeeDocument[] }>(`/api/v1/documents/expiring${query(filters)}`, {}, token);
  },
  getDocumentDashboard(token: string) {
    return request<DocumentDashboard>("/api/v1/documents/dashboard", {}, token);
  },
  exportDocumentRegistryCsv(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/documents/reports/export.csv${query(filters)}`, token);
  },
  listEmployeeDocuments(token: string, employeeId: string) {
    return request<{ documents: EmployeeDocument[]; missing: MissingDocument[] }>(`/api/v1/employees/${employeeId}/documents`, {}, token);
  },
  uploadEmployeeDocument(token: string, employeeId: string, form: FormData) {
    return multipartRequest<{ document: EmployeeDocument }>(`/api/v1/employees/${employeeId}/documents/upload`, form, token);
  },
  replaceEmployeeDocument(token: string, employeeId: string, documentId: string, form: FormData) {
    return multipartRequest<{ document: EmployeeDocument }>(`/api/v1/employees/${employeeId}/documents/${documentId}/replace`, form, token);
  },
  updateEmployeeDocument(token: string, employeeId: string, documentId: string, input: { document_number?: string | null; issue_date?: string | null; expiry_date?: string | null; notes?: string | null }) {
    return request<{ document: EmployeeDocument }>(`/api/v1/employees/${employeeId}/documents/${documentId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  employeeDocumentAction(token: string, employeeId: string, documentId: string, action: "archive" | "restore" | "soft-delete", reason: string) {
    return request<{ document: EmployeeDocument }>(`/api/v1/employees/${employeeId}/documents/${documentId}/${action}`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  permanentlyDeleteEmployeeDocument(token: string, employeeId: string, documentId: string, reason: string) {
    return request<{ deleted: boolean }>(`/api/v1/employees/${employeeId}/documents/${documentId}/permanent-delete`, { method: "DELETE", body: JSON.stringify({ reason }) }, token);
  },
  downloadEmployeeDocument(token: string, employeeId: string, documentId: string) {
    return blobRequest(`/api/v1/employees/${employeeId}/documents/${documentId}/download`, token);
  },
  listEmployeeDocumentVersions(token: string, employeeId: string, documentId: string) {
    return request<{ versions: EmployeeDocumentVersion[] }>(`/api/v1/employees/${employeeId}/documents/${documentId}/versions`, {}, token);
  },
  uploadEmployeeProfilePhoto(token: string, employeeId: string, form: FormData) {
    return multipartRequest<{ document: EmployeeDocument }>(`/api/v1/employees/${employeeId}/profile-photo`, form, token);
  },
  clearEmployeeProfilePhoto(token: string, employeeId: string) {
    return request<{ cleared: boolean }>(`/api/v1/employees/${employeeId}/profile-photo`, { method: "DELETE" }, token);
  },
  deleteEmployeeProfilePhoto(token: string, employeeId: string) {
    return request<{ cleared: boolean }>(`/api/v1/employees/${employeeId}/profile-photo`, { method: "DELETE" }, token);
  },
  fetchEmployeeProfilePhoto(token: string, employeeId: string) {
    return blobRequest(`/api/v1/employees/${employeeId}/profile-photo`, token);
  },
  streamEmployeeProfilePhoto(token: string, employeeId: string) {
    return blobRequest(`/api/v1/employees/${employeeId}/profile-photo`, token);
  },
  listLeaveTypes(token: string) {
    return request<{ leave_types: LeaveType[] }>("/api/v1/leave/types", {}, token);
  },
  createLeaveType(token: string, input: Partial<LeaveType>) {
    return request<{ leave_type: LeaveType }>("/api/v1/leave/types", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLeaveType(token: string, id: string, input: Partial<LeaveType>) {
    return request<{ leave_type: LeaveType }>(`/api/v1/leave/types/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  leaveTypeAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ enabled: boolean }>(`/api/v1/leave/types/${id}/${action}`, { method: "POST" }, token);
  },
  listLeavePolicies(token: string) {
    return request<{ policies: LeavePolicy[] }>("/api/v1/leave/policies", {}, token);
  },
  getLeavePolicy(token: string, id: string) {
    return request<{ policy: LeavePolicy }>(`/api/v1/leave/policies/${id}`, {}, token);
  },
  createLeavePolicy(token: string, input: Partial<LeavePolicy>) {
    return request<{ policy: LeavePolicy }>("/api/v1/leave/policies", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLeavePolicy(token: string, id: string, input: Partial<LeavePolicy>) {
    return request<{ policy: LeavePolicy }>(`/api/v1/leave/policies/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  leavePolicyAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ enabled: boolean }>(`/api/v1/leave/policies/${id}/${action}`, { method: "POST" }, token);
  },
  listLeavePolicyDocumentRules(token: string, policyId: string) {
    return request<{ document_rules: Record<string, unknown>[] }>(`/api/v1/leave/policies/${policyId}/document-rules`, {}, token);
  },
  createLeavePolicyDocumentRule(token: string, policyId: string, input: Record<string, unknown>) {
    return request<{ document_rule: Record<string, unknown> }>(`/api/v1/leave/policies/${policyId}/document-rules`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLeavePolicyDocumentRule(token: string, policyId: string, ruleId: string, input: Record<string, unknown>) {
    return request<{ updated: boolean }>(`/api/v1/leave/policies/${policyId}/document-rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  leavePolicyDocumentRuleAction(token: string, policyId: string, ruleId: string, action: "enable" | "disable") {
    return request<{ enabled: boolean }>(`/api/v1/leave/policies/${policyId}/document-rules/${ruleId}/${action}`, { method: "POST" }, token);
  },
  listLeavePolicyDeductionRules(token: string, policyId: string) {
    return request<{ deduction_rules: Record<string, unknown>[] }>(`/api/v1/leave/policies/${policyId}/deduction-rules`, {}, token);
  },
  createLeavePolicyDeductionRule(token: string, policyId: string, input: Record<string, unknown>) {
    return request<{ deduction_rule: Record<string, unknown> }>(`/api/v1/leave/policies/${policyId}/deduction-rules`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLeavePolicyDeductionRule(token: string, policyId: string, ruleId: string, input: Record<string, unknown>) {
    return request<{ updated: boolean }>(`/api/v1/leave/policies/${policyId}/deduction-rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  leavePolicyDeductionRuleAction(token: string, policyId: string, ruleId: string, action: "enable" | "disable") {
    return request<{ enabled: boolean }>(`/api/v1/leave/policies/${policyId}/deduction-rules/${ruleId}/${action}`, { method: "POST" }, token);
  },
  listLeaveWorkflows(token: string) {
    return request<{ workflows: LeaveWorkflow[] }>("/api/v1/leave/workflows", {}, token);
  },
  getLeaveWorkflow(token: string, id: string) {
    return request<{ workflow: LeaveWorkflow }>(`/api/v1/leave/workflows/${id}`, {}, token);
  },
  createLeaveWorkflow(token: string, input: Partial<LeaveWorkflow>) {
    return request<{ workflow: LeaveWorkflow }>("/api/v1/leave/workflows", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLeaveWorkflow(token: string, id: string, input: Partial<LeaveWorkflow>) {
    return request<{ workflow: LeaveWorkflow }>(`/api/v1/leave/workflows/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  leaveWorkflowAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ enabled: boolean }>(`/api/v1/leave/workflows/${id}/${action}`, { method: "POST" }, token);
  },
  listLeaveWorkflowSteps(token: string, workflowId: string) {
    return request<{ steps: LeaveWorkflowStep[] }>(`/api/v1/leave/workflows/${workflowId}/steps`, {}, token);
  },
  createLeaveWorkflowStep(token: string, workflowId: string, input: Partial<LeaveWorkflowStep>) {
    return request<{ step: LeaveWorkflowStep }>(`/api/v1/leave/workflows/${workflowId}/steps`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLeaveWorkflowStep(token: string, workflowId: string, stepId: string, input: Partial<LeaveWorkflowStep>) {
    return request<{ updated: boolean }>(`/api/v1/leave/workflows/${workflowId}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  deleteLeaveWorkflowStep(token: string, workflowId: string, stepId: string) {
    return request<{ deleted: boolean }>(`/api/v1/leave/workflows/${workflowId}/steps/${stepId}`, { method: "DELETE" }, token);
  },
  listLeaveRequests(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ requests: LeaveRequest[] }>(`/api/v1/leave/requests${query(filters)}`, {}, token);
  },
  getLeaveRequest(token: string, id: string) {
    return request<{ request: LeaveRequest }>(`/api/v1/leave/requests/${id}`, {}, token);
  },
  createLeaveRequest(token: string, input: Partial<LeaveRequest>) {
    return request<{ request: LeaveRequest }>("/api/v1/leave/requests", { method: "POST", body: JSON.stringify(input) }, token);
  },
  calculateLeaveRequest(token: string, input: Record<string, unknown>) {
    return request<Record<string, unknown>>("/api/v1/leave/calculate", { method: "POST", body: JSON.stringify(input) }, token);
  },
  validateLeaveRequest(token: string, input: Record<string, unknown>) {
    return request<Record<string, unknown>>("/api/v1/leave/validate-request", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateLeaveRequest(token: string, id: string, input: Partial<LeaveRequest>) {
    return request<{ request: LeaveRequest }>(`/api/v1/leave/requests/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  submitLeaveRequest(token: string, id: string) {
    return request<{ request: LeaveRequest }>(`/api/v1/leave/requests/${id}/submit`, { method: "POST" }, token);
  },
  approveLeaveRequest(token: string, id: string, note?: string | null) {
    return request<{ request: LeaveRequest }>(`/api/v1/leave/requests/${id}/approve`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }, token);
  },
  rejectLeaveRequest(token: string, id: string, note: string) {
    return request<{ request: LeaveRequest }>(`/api/v1/leave/requests/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }, token);
  },
  cancelLeaveRequest(token: string, id: string, reason: string) {
    return request<{ request: LeaveRequest }>(`/api/v1/leave/requests/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  getLeaveRequestTimeline(token: string, id: string) {
    return request<{ timeline: LeaveApproval[] }>(`/api/v1/leave/requests/${id}/timeline`, {}, token);
  },
  listLeaveRequestDocuments(token: string, id: string) {
    return request<{ documents: LeaveDocument[] }>(`/api/v1/leave/requests/${id}/documents`, {}, token);
  },
  getLeaveRequestDays(token: string, id: string) {
    return request<{ days: LeaveDay[] }>(`/api/v1/leave/requests/${id}/days`, {}, token);
  },
  attachLeaveDocument(token: string, id: string, employee_document_id: string) {
    return request<{ attached: boolean }>(`/api/v1/leave/requests/${id}/documents/attach`, { method: "POST", body: JSON.stringify({ employee_document_id }) }, token);
  },
  detachLeaveDocument(token: string, id: string, documentId: string) {
    return request<{ detached: boolean }>(`/api/v1/leave/requests/${id}/documents/${documentId}`, { method: "DELETE" }, token);
  },
  getEmployeeLeaveSummary(token: string, employeeId: string) {
    return request<{ requests: LeaveRequest[]; balances: LeaveBalance[]; balance_cycles?: LeaveBalance[]; ledger_recent?: Record<string, unknown>[]; calendar: LeaveDay[] }>(`/api/v1/employees/${employeeId}/leave/summary`, {}, token);
  },
  listEmployeeLeaveRequests(token: string, employeeId: string) {
    return request<{ requests: LeaveRequest[] }>(`/api/v1/employees/${employeeId}/leave/requests`, {}, token);
  },
  getEmployeeLeaveBalances(token: string, employeeId: string) {
    return request<{ balances: LeaveBalance[]; balance_cycles?: LeaveBalance[]; ledger_recent?: Record<string, unknown>[] }>(`/api/v1/employees/${employeeId}/leave/balances`, {}, token);
  },
  getEmployeeLeaveCalendar(token: string, employeeId: string) {
    return request<{ calendar: LeaveDay[] }>(`/api/v1/employees/${employeeId}/leave/calendar`, {}, token);
  },
  getLeaveDashboard(token: string) {
    return request<LeaveDashboard>("/api/v1/leave/dashboard", {}, token);
  },
  getLeaveReports(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/leave/reports", {}, token);
  },
  exportLeaveReportCsv(token: string) {
    return blobRequest("/api/v1/leave/reports/export.csv", token);
  },
  listAttendanceRecords(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ records: AttendanceRecord[] }>(`/api/v1/attendance/records${query(filters)}`, {}, token);
  },
  listAttendanceDailyRecords(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ records: AttendanceRecord[]; daily_records: AttendanceRecord[] }>(`/api/v1/attendance/daily${query(filters)}`, {}, token);
  },
  refreshAttendanceDailyRecords(token: string, input: { employee_id: string; date_from?: string; date_to?: string; attendance_date?: string }) {
    return request<{ refreshed: string[] }>("/api/v1/attendance/daily/refresh", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getAttendanceRecord(token: string, id: string) {
    return request<{ record: AttendanceRecord }>(`/api/v1/attendance/records/${id}`, {}, token);
  },
  createAttendanceRecord(token: string, input: Partial<AttendanceRecord>) {
    return request<{ record: AttendanceRecord }>("/api/v1/attendance/records", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAttendanceRecord(token: string, id: string, input: Partial<AttendanceRecord>) {
    return request<{ record: AttendanceRecord }>(`/api/v1/attendance/records/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  recalculateAttendanceRecord(token: string, id: string) {
    return request<{ queued: boolean }>(`/api/v1/attendance/records/${id}/recalculate-placeholder`, { method: "POST" }, token);
  },
  getAttendanceCalendar(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ calendar: AttendanceRecord[] }>(`/api/v1/attendance/calendar${query(filters)}`, {}, token);
  },
  listAttendanceDevices(token: string) {
    return request<{ devices: AttendanceDevice[] }>("/api/v1/attendance/devices", {}, token);
  },
  getAttendanceDevice(token: string, id: string) {
    return request<{ device: AttendanceDevice }>(`/api/v1/attendance/devices/${id}`, {}, token);
  },
  createAttendanceDevice(token: string, input: Partial<AttendanceDevice>) {
    return request<{ device: AttendanceDevice }>("/api/v1/attendance/devices", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAttendanceDevice(token: string, id: string, input: Partial<AttendanceDevice>) {
    return request<{ device: AttendanceDevice }>(`/api/v1/attendance/devices/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  attendanceDeviceAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ device: AttendanceDevice }>(`/api/v1/attendance/devices/${id}/${action}`, { method: "POST" }, token);
  },
  listAttendanceRawLogs(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ logs: AttendanceRawLog[] }>(`/api/v1/attendance/raw-logs${query(filters)}`, {}, token);
  },
  listAttendanceLogs(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ logs: AttendanceLog[] }>(`/api/v1/attendance/logs${query(filters)}`, {}, token);
  },
  createManualAttendanceLog(token: string, input: Partial<AttendanceLog>) {
    return request<{ log: AttendanceLog }>("/api/v1/attendance/logs/manual", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAttendanceLog(token: string, id: string, input: Partial<AttendanceLog>) {
    return request<{ log: AttendanceLog }>(`/api/v1/attendance/logs/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveAttendanceLog(token: string, id: string, reason?: string | null) {
    return request<{ archived: boolean }>(`/api/v1/attendance/logs/${id}/archive`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  importAttendanceRawLogs(token: string, input: { logs: Record<string, unknown>[]; source?: string }) {
    return request<{ imported: number; skipped: number }>("/api/v1/attendance/raw-logs/import", { method: "POST", body: JSON.stringify(input) }, token);
  },
  reconcileAttendanceRawLogs(token: string) {
    return request<{ queued: boolean }>("/api/v1/attendance/raw-logs/reconcile-placeholder", { method: "POST" }, token);
  },
  listAttendanceCorrections(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ corrections: AttendanceCorrection[] }>(`/api/v1/attendance/corrections${query(filters)}`, {}, token);
  },
  getAttendanceCorrection(token: string, id: string) {
    return request<{ correction: AttendanceCorrection }>(`/api/v1/attendance/corrections/${id}`, {}, token);
  },
  createAttendanceCorrection(token: string, input: Partial<AttendanceCorrection>) {
    return request<{ correction: AttendanceCorrection }>("/api/v1/attendance/corrections", { method: "POST", body: JSON.stringify(input) }, token);
  },
  approveAttendanceCorrection(token: string, id: string, note?: string | null) {
    return request<{ correction: AttendanceCorrection }>(`/api/v1/attendance/corrections/${id}/approve`, { method: "POST", body: JSON.stringify({ review_note: note ?? null }) }, token);
  },
  rejectAttendanceCorrection(token: string, id: string, note: string) {
    return request<{ correction: AttendanceCorrection }>(`/api/v1/attendance/corrections/${id}/reject`, { method: "POST", body: JSON.stringify({ review_note: note }) }, token);
  },
  cancelAttendanceCorrection(token: string, id: string, reason?: string | null) {
    return request<{ correction: AttendanceCorrection }>(`/api/v1/attendance/corrections/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  getAttendancePayrollImpact(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ impacts: AttendancePayrollImpact[]; records: AttendanceRecord[] }>(`/api/v1/attendance/payroll-impact${query(filters)}`, {}, token);
  },
  getAttendanceSettings(token: string) {
    return request<{ settings: AttendanceSettings }>("/api/v1/attendance/settings", {}, token);
  },
  updateAttendanceSettings(token: string, input: Partial<AttendanceSettings>) {
    return request<{ settings: AttendanceSettings }>("/api/v1/attendance/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getAttendanceDashboard(token: string) {
    return request<AttendanceDashboard>("/api/v1/attendance/dashboard", {}, token);
  },
  getAttendanceReports(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ reports: Record<string, unknown>[] }>(`/api/v1/attendance/reports${query(filters)}`, {}, token);
  },
  listAttendanceDayOverrides(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ overrides: AttendanceDayOverride[] }>(`/api/v1/attendance/day-overrides${query(filters)}`, {}, token);
  },
  createAttendanceDayOverride(token: string, input: Partial<AttendanceDayOverride>) {
    return request<{ override: AttendanceDayOverride }>("/api/v1/attendance/day-overrides", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAttendanceDayOverride(token: string, id: string, input: Partial<AttendanceDayOverride>) {
    return request<{ override: AttendanceDayOverride }>(`/api/v1/attendance/day-overrides/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  exportAttendanceReportCsv(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/attendance/reports/export.csv${query(filters)}`, token);
  },
  listEmployeeAttendanceRecords(token: string, employeeId: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ records: AttendanceRecord[] }>(`/api/v1/employees/${employeeId}/attendance/records${query(filters)}`, {}, token);
  },
  listEmployeeAttendanceRawLogs(token: string, employeeId: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ logs: AttendanceRawLog[] }>(`/api/v1/employees/${employeeId}/attendance/raw-logs${query(filters)}`, {}, token);
  },
  getEmployeeAttendanceCalendar(token: string, employeeId: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ calendar: AttendanceRecord[] }>(`/api/v1/employees/${employeeId}/attendance/calendar${query(filters)}`, {}, token);
  },
  getEmployeeAttendanceSummary(token: string, employeeId: string) {
    return request<{ summary: Record<string, number>; records: AttendanceRecord[]; corrections: AttendanceCorrection[] }>(`/api/v1/employees/${employeeId}/attendance/summary`, {}, token);
  },
  listShiftTemplates(token: string) {
    return request<{ shift_templates: ShiftTemplate[] }>("/api/v1/roster/shift-templates", {}, token);
  },
  getShiftTemplate(token: string, id: string) {
    return request<{ shift_template: ShiftTemplate }>(`/api/v1/roster/shift-templates/${id}`, {}, token);
  },
  createShiftTemplate(token: string, input: Partial<ShiftTemplate>) {
    return request<{ shift_template: ShiftTemplate }>("/api/v1/roster/shift-templates", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateShiftTemplate(token: string, id: string, input: Partial<ShiftTemplate>) {
    return request<{ shift_template: ShiftTemplate }>(`/api/v1/roster/shift-templates/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  shiftTemplateAction(token: string, id: string, action: "enable" | "disable" | "archive" | "restore") {
    return request<{ enabled: boolean }>(`/api/v1/roster/shift-templates/${id}/${action}`, { method: "POST" }, token);
  },
  getRosterSettings(token: string) {
    return request<{ settings: RosterSettings }>("/api/v1/roster/settings", {}, token);
  },
  updateRosterSettings(token: string, input: Partial<RosterSettings>) {
    return request<{ settings: RosterSettings }>("/api/v1/roster/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listWeeklyOffRules(token: string) {
    return request<{ rules: WeeklyOffRule[] }>("/api/v1/roster/weekly-off-rules", {}, token);
  },
  createWeeklyOffRule(token: string, input: Partial<WeeklyOffRule>) {
    return request<{ rule: WeeklyOffRule }>("/api/v1/roster/weekly-off-rules", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateWeeklyOffRule(token: string, id: string, input: Partial<WeeklyOffRule>) {
    return request<{ rule: WeeklyOffRule }>(`/api/v1/roster/weekly-off-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  weeklyOffRuleAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ rule: WeeklyOffRule }>(`/api/v1/roster/weekly-off-rules/${id}/${action}`, { method: "POST" }, token);
  },
  listRosterPeriods(token: string) {
    return request<{ periods: RosterPeriod[] }>("/api/v1/roster/periods", {}, token);
  },
  getRosterPeriod(token: string, id: string) {
    return request<{ period: RosterPeriod }>(`/api/v1/roster/periods/${id}`, {}, token);
  },
  createRosterPeriod(token: string, input: Partial<RosterPeriod>) {
    return request<{ period: RosterPeriod }>("/api/v1/roster/periods", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateRosterPeriod(token: string, id: string, input: Partial<RosterPeriod>) {
    return request<{ period: RosterPeriod }>(`/api/v1/roster/periods/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  publishRosterPeriod(token: string, id: string) {
    return request<{ period: RosterPeriod }>(`/api/v1/roster/periods/${id}/publish`, { method: "POST" }, token);
  },
  unpublishRosterPeriod(token: string, id: string, reason: string) {
    return request<{ period: RosterPeriod }>(`/api/v1/roster/periods/${id}/unpublish`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  lockRosterPeriod(token: string, id: string, reason?: string | null) {
    return request<{ period: RosterPeriod }>(`/api/v1/roster/periods/${id}/lock`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  unlockRosterPeriod(token: string, id: string, reason: string) {
    return request<{ period: RosterPeriod }>(`/api/v1/roster/periods/${id}/unlock`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  archiveRosterPeriod(token: string, id: string) {
    return request<{ archived: boolean }>(`/api/v1/roster/periods/${id}/archive`, { method: "POST" }, token);
  },
  getWeeklyRoster(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<WeeklyRoster>(`/api/v1/roster/weekly${query(filters)}`, {}, token);
  },
  saveWeeklyRoster(token: string, input: Record<string, unknown>) {
    return request<{ period: RosterPeriod; assignments: RosterAssignment[]; warnings: Record<string, unknown>[] }>("/api/v1/roster/weekly/save", { method: "POST", body: JSON.stringify(input) }, token);
  },
  copyPreviousRosterWeek(token: string, input: Record<string, unknown>) {
    return request<{ period: RosterPeriod; copied: number }>("/api/v1/roster/weekly/copy-previous", { method: "POST", body: JSON.stringify(input) }, token);
  },
  clearRosterWeek(token: string, input: Record<string, unknown>) {
    return request<{ cleared: boolean }>("/api/v1/roster/weekly/clear", { method: "POST", body: JSON.stringify(input) }, token);
  },
  listRosterAssignments(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ assignments: RosterAssignment[] }>(`/api/v1/roster/assignments${query(filters)}`, {}, token);
  },
  getRosterAssignment(token: string, id: string) {
    return request<{ assignment: RosterAssignment }>(`/api/v1/roster/assignments/${id}`, {}, token);
  },
  createRosterAssignment(token: string, input: Partial<RosterAssignment> & { reason?: string }) {
    return request<{ assignment: RosterAssignment; warning?: string | null; warnings?: string[] }>("/api/v1/roster/assignments", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateRosterAssignment(token: string, id: string, input: Partial<RosterAssignment> & { reason?: string }) {
    return request<{ assignment: RosterAssignment; warning?: string | null }>(`/api/v1/roster/assignments/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  cancelRosterAssignment(token: string, id: string, reason: string) {
    return request<{ assignment: RosterAssignment }>(`/api/v1/roster/assignments/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  batchRosterAssignments(token: string, input: Record<string, unknown>) {
    return request<{ assignments: RosterAssignment[] }>("/api/v1/roster/assignments/batch", { method: "POST", body: JSON.stringify(input) }, token);
  },
  bulkRosterAssignments(token: string, input: Record<string, unknown>) {
    return request<{ assignments: RosterAssignment[] }>("/api/v1/roster/assignments/bulk", { method: "POST", body: JSON.stringify(input) }, token);
  },
  copyRosterAssignmentsWeek(token: string, input: Record<string, unknown>) {
    return request<{ period: RosterPeriod; copied: number }>("/api/v1/roster/assignments/copy-week", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getEmployeeRosterSummary(token: string, employeeId: string) {
    return request<{ summary: Record<string, number>; assignments: RosterAssignment[]; history: Record<string, unknown>[] }>(`/api/v1/employees/${employeeId}/roster/summary`, {}, token);
  },
  listEmployeeRosterAssignments(token: string, employeeId: string) {
    return request<{ assignments: RosterAssignment[] }>(`/api/v1/employees/${employeeId}/roster/assignments`, {}, token);
  },
  getEmployeeRosterCurrentWeek(token: string, employeeId: string) {
    return request<{ week_start_date: string; week_end_date: string; assignments: RosterAssignment[] }>(`/api/v1/employees/${employeeId}/roster/current-week`, {}, token);
  },
  getEmployeeRosterHistory(token: string, employeeId: string) {
    return request<{ history: Record<string, unknown>[] }>(`/api/v1/employees/${employeeId}/roster/history`, {}, token);
  },
  getRosterDashboard(token: string) {
    return request<RosterDashboard>("/api/v1/roster/dashboard", {}, token);
  },
  getRosterReports(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ reports: Record<string, unknown>[] }>(`/api/v1/roster/reports${query(filters)}`, {}, token);
  },
  exportRosterReportCsv(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/roster/reports/export.csv${query(filters)}`, token);
  },
  getSelfServiceRoster(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ week_start_date: string; week_end_date: string; assignments: RosterAssignment[] }>(`/api/v1/self-service/roster${query(filters)}`, {}, token);
  },
  getSelfServiceRosterWeek(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ week_start_date: string; week_end_date: string; assignments: RosterAssignment[] }>(`/api/v1/self-service/roster/week${query(filters)}`, {}, token);
  },
  listPayrollComponents(token: string) {
    return request<{ components: PayrollComponent[] }>("/api/v1/payroll/components", {}, token);
  },
  getPayrollComponent(token: string, id: string) {
    return request<{ component: PayrollComponent }>(`/api/v1/payroll/components/${id}`, {}, token);
  },
  createPayrollComponent(token: string, input: Partial<PayrollComponent>) {
    return request<{ component: PayrollComponent }>("/api/v1/payroll/components", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePayrollComponent(token: string, id: string, input: Partial<PayrollComponent>) {
    return request<{ component: PayrollComponent }>(`/api/v1/payroll/components/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  payrollComponentAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ component: PayrollComponent }>(`/api/v1/payroll/components/${id}/${action}`, { method: "POST" }, token);
  },
  getPayrollSettings(token: string) {
    return request<{ settings: PayrollSettings }>("/api/v1/payroll/settings", {}, token);
  },
  updatePayrollSettings(token: string, input: Partial<PayrollSettings>) {
    return request<{ settings: PayrollSettings }>("/api/v1/payroll/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getEmployeePayrollProfile(token: string, employeeId: string) {
    return request<{ profile: EmployeePayrollProfile }>(`/api/v1/employees/${employeeId}/payroll/profile`, {}, token);
  },
  updateEmployeePayrollProfile(token: string, employeeId: string, input: Partial<EmployeePayrollProfile> & { reason?: string }) {
    return request<{ profile: EmployeePayrollProfile }>(`/api/v1/employees/${employeeId}/payroll/profile`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listEmployeeSalaryHistory(token: string, employeeId: string) {
    return request<{ salary_history: Record<string, unknown>[] }>(`/api/v1/employees/${employeeId}/payroll/salary-history`, {}, token);
  },
  createEmployeeSalaryHistory(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ salary_history: Record<string, unknown> }>(`/api/v1/employees/${employeeId}/payroll/salary-history`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listEmployeeIncrements(token: string, employeeId: string) {
    return request<{ increments: Record<string, unknown>[] }>(`/api/v1/employees/${employeeId}/payroll/increments`, {}, token);
  },
  createEmployeeIncrement(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ increment: Record<string, unknown> }>(`/api/v1/employees/${employeeId}/payroll/increments`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listEmployeeAdvances(token: string, employeeId: string) {
    return request<{ advances: PayrollAdvance[] }>(`/api/v1/employees/${employeeId}/payroll/advances`, {}, token);
  },
  getEmployeePayrollSummary(token: string, employeeId: string) {
    return request<EmployeePayrollSummary>(`/api/v1/employees/${employeeId}/payroll/summary`, {}, token);
  },
  listPayrollAdvances(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ advances: PayrollAdvance[] }>(`/api/v1/payroll/advances${query(filters)}`, {}, token);
  },
  getPayrollAdvance(token: string, id: string) {
    return request<{ advance: PayrollAdvance }>(`/api/v1/payroll/advances/${id}`, {}, token);
  },
  createPayrollAdvance(token: string, input: Partial<PayrollAdvance>) {
    return request<{ advance: PayrollAdvance }>("/api/v1/payroll/advances", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePayrollAdvance(token: string, id: string, input: Partial<PayrollAdvance>) {
    return request<{ advance: PayrollAdvance }>(`/api/v1/payroll/advances/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  approvePayrollAdvance(token: string, id: string) {
    return request<{ advance: PayrollAdvance }>(`/api/v1/payroll/advances/${id}/approve`, { method: "POST" }, token);
  },
  cancelPayrollAdvance(token: string, id: string, reason: string) {
    return request<{ advance: PayrollAdvance }>(`/api/v1/payroll/advances/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listPayrollDeductions(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ deductions: PayrollDeduction[] }>(`/api/v1/payroll/deductions${query(filters)}`, {}, token);
  },
  createPayrollDeduction(token: string, input: Partial<PayrollDeduction>) {
    return request<{ deduction: PayrollDeduction }>("/api/v1/payroll/deductions", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePayrollDeduction(token: string, id: string, input: Partial<PayrollDeduction>) {
    return request<{ deduction: PayrollDeduction }>(`/api/v1/payroll/deductions/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  payrollDeductionAction(token: string, id: string, action: "enable" | "disable" | "cancel", reason?: string) {
    return request<{ deduction: PayrollDeduction }>(`/api/v1/payroll/deductions/${id}/${action}`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  listPayrollAdjustments(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ adjustments: PayrollAdjustment[] }>(`/api/v1/payroll/adjustments${query(filters)}`, {}, token);
  },
  createPayrollAdjustment(token: string, input: Partial<PayrollAdjustment>) {
    return request<{ adjustment: PayrollAdjustment }>("/api/v1/payroll/adjustments", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePayrollAdjustment(token: string, id: string, input: Partial<PayrollAdjustment>) {
    return request<{ adjustment: PayrollAdjustment }>(`/api/v1/payroll/adjustments/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  approvePayrollAdjustment(token: string, id: string) {
    return request<{ adjustment: PayrollAdjustment }>(`/api/v1/payroll/adjustments/${id}/approve`, { method: "POST" }, token);
  },
  cancelPayrollAdjustment(token: string, id: string, reason?: string) {
    return request<{ adjustment: PayrollAdjustment }>(`/api/v1/payroll/adjustments/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  listPayrollPeriods(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ periods: PayrollPeriod[] }>(`/api/v1/payroll/periods${query(filters)}`, {}, token);
  },
  getPayrollPeriod(token: string, id: string) {
    return request<{ period: PayrollPeriod }>(`/api/v1/payroll/periods/${id}`, {}, token);
  },
  createPayrollPeriod(token: string, input: Partial<PayrollPeriod>) {
    return request<{ period: PayrollPeriod }>("/api/v1/payroll/periods", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePayrollPeriod(token: string, id: string, input: Partial<PayrollPeriod>) {
    return request<{ period: PayrollPeriod }>(`/api/v1/payroll/periods/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  closePayrollPeriod(token: string, id: string) {
    return request<{ period: PayrollPeriod }>(`/api/v1/payroll/periods/${id}/close`, { method: "POST" }, token);
  },
  cancelPayrollPeriod(token: string, id: string, reason: string) {
    return request<{ period: PayrollPeriod }>(`/api/v1/payroll/periods/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listPayrollRuns(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ runs: PayrollRun[] }>(`/api/v1/payroll/runs${query(filters)}`, {}, token);
  },
  getPayrollRun(token: string, id: string) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}`, {}, token);
  },
  generatePayrollRun(token: string, input: { payroll_period_id: string; notes?: string | null }) {
    return request<{ run: PayrollRun }>("/api/v1/payroll/runs/generate", { method: "POST", body: JSON.stringify(input) }, token);
  },
  recalculatePayrollRun(token: string, id: string) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/recalculate`, { method: "POST" }, token);
  },
  approvePayrollRun(token: string, id: string) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/approve`, { method: "POST" }, token);
  },
  cancelPayrollRun(token: string, id: string, reason: string) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listPayrollRunEmployees(token: string, runId: string) {
    return request<{ employees: PayrollRunEmployee[] }>(`/api/v1/payroll/runs/${runId}/employees`, {}, token);
  },
  getPayrollRunEmployee(token: string, runId: string, runEmployeeId: string) {
    return request<{ employee: PayrollRunEmployee }>(`/api/v1/payroll/runs/${runId}/employees/${runEmployeeId}`, {}, token);
  },
  updatePayrollRunEmployee(token: string, runId: string, runEmployeeId: string, input: Partial<PayrollRunEmployee>) {
    return request<{ employee: PayrollRunEmployee }>(`/api/v1/payroll/runs/${runId}/employees/${runEmployeeId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  holdPayrollRunEmployee(token: string, runId: string, runEmployeeId: string, reason: string) {
    return request<{ employee: PayrollRunEmployee }>(`/api/v1/payroll/runs/${runId}/employees/${runEmployeeId}/hold`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  releasePayrollRunEmployee(token: string, runId: string, runEmployeeId: string) {
    return request<{ employee: PayrollRunEmployee }>(`/api/v1/payroll/runs/${runId}/employees/${runEmployeeId}/release-hold`, { method: "POST" }, token);
  },
  listPayrollRunEmployeeLines(token: string, runId: string, runEmployeeId: string) {
    return request<{ lines: PayrollRunLine[] }>(`/api/v1/payroll/runs/${runId}/employees/${runEmployeeId}/lines`, {}, token);
  },
  exportPayrollRunCsv(token: string, id: string) {
    return blobRequest(`/api/v1/payroll/runs/${id}/export.csv`, token);
  },
  getPayrollDashboard(token: string) {
    return request<PayrollDashboard>("/api/v1/payroll/dashboard", {}, token);
  },
  getPayrollReports(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ reports: Record<string, unknown>[] }>(`/api/v1/payroll/reports${query(filters)}`, {}, token);
  },
  exportPayrollReportCsv(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/payroll/reports/export.csv${query(filters)}`, token);
  },
  listAssetCategories(token: string) {
    return request<{ categories: AssetCategory[] }>("/api/v1/assets/categories", {}, token);
  },
  createAssetCategory(token: string, input: Partial<AssetCategory>) {
    return request<{ category: AssetCategory }>("/api/v1/assets/categories", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAssetCategory(token: string, id: string, input: Partial<AssetCategory>) {
    return request<{ category: AssetCategory }>(`/api/v1/assets/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  assetCategoryAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ category: AssetCategory }>(`/api/v1/assets/categories/${id}/${action}`, { method: "POST" }, token);
  },
  listAssetItems(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ items: AssetItem[] }>(`/api/v1/assets/items${query(filters)}`, {}, token);
  },
  getAssetItem(token: string, id: string) {
    return request<{ item: AssetItem }>(`/api/v1/assets/items/${id}`, {}, token);
  },
  createAssetItem(token: string, input: Partial<AssetItem>) {
    return request<{ item: AssetItem }>("/api/v1/assets/items", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAssetItem(token: string, id: string, input: Partial<AssetItem>) {
    return request<{ item: AssetItem }>(`/api/v1/assets/items/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveAssetItem(token: string, id: string, reason?: string | null) {
    return request<{ item: AssetItem }>(`/api/v1/assets/items/${id}/archive`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  listAssetAssignments(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ assignments: AssetAssignment[] }>(`/api/v1/assets/assignments${query(filters)}`, {}, token);
  },
  getAssetAssignment(token: string, id: string) {
    return request<{ assignment: AssetAssignment }>(`/api/v1/assets/assignments/${id}`, {}, token);
  },
  issueAssetAssignment(token: string, input: Record<string, unknown>) {
    return request<{ assignment: AssetAssignment }>("/api/v1/assets/assignments/issue", { method: "POST", body: JSON.stringify(input) }, token);
  },
  assetAssignmentAction(token: string, id: string, action: "return" | "mark-damaged" | "mark-lost" | "write-off", input?: Record<string, unknown>) {
    return request<{ assignment: AssetAssignment }>(`/api/v1/assets/assignments/${id}/${action}`, { method: "POST", body: JSON.stringify(input ?? {}) }, token);
  },
  replaceAssetAssignment(token: string, id: string, input: Record<string, unknown>) {
    return request<{ assignment: AssetAssignment }>(`/api/v1/assets/assignments/${id}/replace`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  linkAssetDeduction(token: string, id: string, input: Record<string, unknown>) {
    return request<{ assignment: AssetAssignment }>(`/api/v1/assets/assignments/${id}/link-deduction`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listAssetAssignmentEvents(token: string, id: string) {
    return request<{ events: AssetAssignmentEvent[] }>(`/api/v1/assets/assignments/${id}/events`, {}, token);
  },
  listAssetAssignmentAttachments(token: string, id: string) {
    return request<{ attachments: Record<string, unknown>[] }>(`/api/v1/assets/assignments/${id}/attachments`, {}, token);
  },
  attachAssetDocument(token: string, id: string, input: Record<string, unknown>) {
    return request<{ attachment: Record<string, unknown> }>(`/api/v1/assets/assignments/${id}/attachments`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  detachAssetDocument(token: string, id: string, attachmentId: string) {
    return request<{ detached: boolean }>(`/api/v1/assets/assignments/${id}/attachments/${attachmentId}`, { method: "DELETE" }, token);
  },
  listAssetDeductionRules(token: string) {
    return request<{ rules: AssetDeductionRule[] }>("/api/v1/assets/deduction-rules", {}, token);
  },
  createAssetDeductionRule(token: string, input: Partial<AssetDeductionRule>) {
    return request<{ rule: AssetDeductionRule }>("/api/v1/assets/deduction-rules", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAssetDeductionRule(token: string, id: string, input: Partial<AssetDeductionRule>) {
    return request<{ rule: AssetDeductionRule }>(`/api/v1/assets/deduction-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  assetDeductionRuleAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ rule: AssetDeductionRule }>(`/api/v1/assets/deduction-rules/${id}/${action}`, { method: "POST" }, token);
  },
  getEmployeeAssetSummary(token: string, employeeId: string) {
    return request<EmployeeAssetSummary>(`/api/v1/employees/${employeeId}/assets/summary`, {}, token);
  },
  listEmployeeAssetAssignments(token: string, employeeId: string) {
    return request<{ assignments: AssetAssignment[] }>(`/api/v1/employees/${employeeId}/assets/assignments`, {}, token);
  },
  listEmployeeAssetHistory(token: string, employeeId: string) {
    return request<{ history: AssetAssignmentEvent[] }>(`/api/v1/employees/${employeeId}/assets/history`, {}, token);
  },
  getAssetsDashboard(token: string) {
    return request<AssetDashboard>("/api/v1/assets/dashboard", {}, token);
  },
  getAssetsReports(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ reports: Record<string, unknown>[] }>(`/api/v1/assets/reports${query(filters)}`, {}, token);
  },
  exportAssetsReportCsv(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/assets/reports/export.csv${query(filters)}`, token);
  },
  listEmployeeNoteCategories(token: string) {
    return request<{ categories: EmployeeNoteCategory[] }>("/api/v1/employee-notes/categories", {}, token);
  },
  createEmployeeNoteCategory(token: string, input: Partial<EmployeeNoteCategory>) {
    return request<{ category: EmployeeNoteCategory }>("/api/v1/employee-notes/categories", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateEmployeeNoteCategory(token: string, id: string, input: Partial<EmployeeNoteCategory>) {
    return request<{ category: EmployeeNoteCategory }>(`/api/v1/employee-notes/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  noteCategoryAction(token: string, id: string, action: "enable" | "disable") {
    return request<{ category: EmployeeNoteCategory }>(`/api/v1/employee-notes/categories/${id}/${action}`, { method: "POST" }, token);
  },
  listEmployeeNotes(token: string, employeeId: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ notes: EmployeeNote[] }>(`/api/v1/employees/${employeeId}/notes${query(filters)}`, {}, token);
  },
  getEmployeeNote(token: string, employeeId: string, noteId: string) {
    return request<{ note: EmployeeNote }>(`/api/v1/employees/${employeeId}/notes/${noteId}`, {}, token);
  },
  createEmployeeNote(token: string, employeeId: string, input: Partial<EmployeeNote>) {
    return request<{ note: EmployeeNote }>(`/api/v1/employees/${employeeId}/notes`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateEmployeeNote(token: string, employeeId: string, noteId: string, input: Partial<EmployeeNote> & { edit_reason?: string | null }) {
    return request<{ note: EmployeeNote }>(`/api/v1/employees/${employeeId}/notes/${noteId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveEmployeeNote(token: string, employeeId: string, noteId: string, reason: string) {
    return request<{ archived: boolean }>(`/api/v1/employees/${employeeId}/notes/${noteId}/archive`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listEmployeeNoteVersions(token: string, employeeId: string, noteId: string) {
    return request<{ versions: EmployeeNoteVersion[] }>(`/api/v1/employees/${employeeId}/notes/${noteId}/versions`, {}, token);
  },
  listEmployeeNoteAttachments(token: string, employeeId: string, noteId: string) {
    return request<{ attachments: EmployeeNoteAttachment[] }>(`/api/v1/employees/${employeeId}/notes/${noteId}/attachments`, {}, token);
  },
  attachEmployeeNoteDocument(token: string, employeeId: string, noteId: string, input: Record<string, unknown>) {
    return request<{ attachment: EmployeeNoteAttachment }>(`/api/v1/employees/${employeeId}/notes/${noteId}/attachments`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  detachEmployeeNoteDocument(token: string, employeeId: string, noteId: string, attachmentId: string) {
    return request<{ detached: boolean }>(`/api/v1/employees/${employeeId}/notes/${noteId}/attachments/${attachmentId}`, { method: "DELETE" }, token);
  },
  listAuditLogs(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ audit: AuditLogRow[] }>(`/api/v1/audit${query(filters)}`, {}, token);
  },
  exportAuditLogsCsv(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/audit/export.csv${query(filters)}`, token);
  },
  listEmployeeAuditLogs(token: string, employeeId: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ audit: AuditLogRow[] }>(`/api/v1/employees/${employeeId}/audit${query(filters)}`, {}, token);
  },
  exportEmployeeAuditCsv(token: string, employeeId: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return blobRequest(`/api/v1/employees/${employeeId}/audit/export.csv${query(filters)}`, token);
  }
};
