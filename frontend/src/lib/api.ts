import type { AccessScopeRule, AccessUser, ApiEnvelope, AuthUser, BootstrapStatus, EmployeeUserAccessPreview, Permission, Role, RoleMappingRule, UserStatus } from "../types/auth";
import type {
  ApprovalAction,
  ApprovalDelegationRule,
  ApprovalInstance,
  ApprovalInstanceStep,
  ApprovalNotificationTemplate,
  ApprovalPreview,
  ApprovalStepAssignee,
  ApprovalWorkflow,
  ApprovalWorkflowCondition,
  ApprovalWorkflowSettings,
  ApprovalWorkflowStep
} from "../types/approvals";
import type { AttendanceCorrection, AttendanceDashboard, AttendanceDayOverride, AttendanceDevice, AttendanceDeviceSettings, AttendanceImportBatch, AttendanceImportRowError, AttendanceLockedDayWarning, AttendanceLog, AttendancePayrollImpact, AttendanceRawLog, AttendanceRecord, AttendanceSettings, AttendanceUnmatchedLog, AttendanceVendorIntegration, EmployeeBiometricMapping } from "../types/attendance";
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
  AssetUniformEvent,
  AssetUniformSettings,
  AssetCategory,
  AssetDashboard,
  AssetDeductionRule,
  AssetItem,
  AuditLogRow,
  EmployeeAssetSummary,
  EmployeeNote,
  EmployeeNoteAttachment,
  EmployeeNoteCategory,
  EmployeeNoteVersion,
  UniformAssignment,
  UniformStockItem,
  UniformType
} from "../types/assets";
import type {
  DocumentCategory,
  DocumentComplianceDashboard,
  DocumentComplianceSettings,
  DocumentDashboard,
  DocumentExpiryAlert,
  DocumentRequiredRule,
  DocumentRequiredRuleInput,
  DocumentRenewalCase,
  DocumentRequirementWaiver,
  DocumentType,
  DocumentTypeInput,
  EmployeeDocumentCompliance,
  EmployeeDocument,
  EmployeeDocumentVersion,
  MissingDocument
} from "../types/documents";
import type { RosterAssignment, RosterDashboard, RosterPeriod, RosterSettings, ShiftTemplate, WeeklyOffRule, WeeklyRoster } from "../types/roster";
import type {
  EmployeePayrollProfile,
  EmployeePayrollSummary,
  CustomDeductionTemplate,
  EmployeeCustomDeduction,
  EmployeeCustomDeductionApplication,
  EmployeeBankLoan,
  EmployeeBankLoanPayment,
  EmployeePaymentMethod,
  EmployeePensionProfile,
  BankLoanEligibilityRule,
  BankLoanRemittanceBatch,
  PayrollAdjustment,
  PayrollAdvance,
  PayrollApprovalEvent,
  PayrollComponent,
  PayrollDashboard,
  PayrollDeduction,
  PayrollHistoryRow,
  PayrollPaymentRegister,
  PayrollPayslip,
  PayrollPeriod,
  PayrollPensionContribution,
  PayrollRun,
  PayrollRunEmployee,
  PayrollRunLine,
  PayrollSettings,
  PaymentInstitution,
  PensionRemittanceBatch,
  PensionScheme
} from "../types/payroll";
import type {
  FinalSettlementCalculation,
  FinalSettlementCase,
  FinalSettlementClearanceItem,
  FinalSettlementEvent,
  FinalSettlementLineItem,
  FinalSettlementPaymentRegister,
  FinalSettlementSettings,
  FinalSettlementSummary
} from "../types/final-settlement";
import type {
  LifecycleEvent,
  LifecycleSettings,
  LifecycleSummary,
  LifecycleTask,
  OffboardingCase,
  OnboardingCase
} from "../types/lifecycle";

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
  getApprovalSettings(token: string) {
    return request<{ settings: ApprovalWorkflowSettings }>("/api/v1/approvals/settings", {}, token);
  },
  updateApprovalSettings(token: string, input: Partial<ApprovalWorkflowSettings>) {
    return request<{ settings: ApprovalWorkflowSettings }>("/api/v1/approvals/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listApprovalWorkflows(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ workflows: ApprovalWorkflow[] }>(`/api/v1/approvals/workflows${query(filters)}`, {}, token);
  },
  getApprovalWorkflow(token: string, workflowId: string) {
    return request<{ workflow: ApprovalWorkflow; conditions: ApprovalWorkflowCondition[]; steps: ApprovalWorkflowStep[] }>(`/api/v1/approvals/workflows/${workflowId}`, {}, token);
  },
  createApprovalWorkflow(token: string, input: Partial<ApprovalWorkflow>) {
    return request<{ workflow: ApprovalWorkflow }>("/api/v1/approvals/workflows", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateApprovalWorkflow(token: string, workflowId: string, input: Partial<ApprovalWorkflow>) {
    return request<{ workflow: ApprovalWorkflow }>(`/api/v1/approvals/workflows/${workflowId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  approvalWorkflowAction(token: string, workflowId: string, action: "archive" | "activate" | "deactivate") {
    return request<{ workflow: ApprovalWorkflow }>(`/api/v1/approvals/workflows/${workflowId}/${action}`, { method: "POST" }, token);
  },
  createApprovalWorkflowCondition(token: string, workflowId: string, input: Record<string, unknown>) {
    return request<{ condition_id: string }>(`/api/v1/approvals/workflows/${workflowId}/conditions`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateApprovalWorkflowCondition(token: string, workflowId: string, conditionId: string, input: Record<string, unknown>) {
    return request<{ updated: boolean }>(`/api/v1/approvals/workflows/${workflowId}/conditions/${conditionId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  deleteApprovalWorkflowCondition(token: string, workflowId: string, conditionId: string) {
    return request<{ deleted: boolean }>(`/api/v1/approvals/workflows/${workflowId}/conditions/${conditionId}`, { method: "DELETE" }, token);
  },
  createApprovalWorkflowStep(token: string, workflowId: string, input: Record<string, unknown>) {
    return request<{ step_id: string }>(`/api/v1/approvals/workflows/${workflowId}/steps`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateApprovalWorkflowStep(token: string, workflowId: string, stepId: string, input: Record<string, unknown>) {
    return request<{ updated: boolean }>(`/api/v1/approvals/workflows/${workflowId}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  deleteApprovalWorkflowStep(token: string, workflowId: string, stepId: string) {
    return request<{ deleted: boolean }>(`/api/v1/approvals/workflows/${workflowId}/steps/${stepId}`, { method: "DELETE" }, token);
  },
  listApprovalInbox(token: string, mode: "inbox" | "submitted" | "history" | "overdue" | "escalated" | "delegated-to-me" = "inbox", filters?: Record<string, string | number | boolean | null | undefined>) {
    const path = mode === "inbox" ? "/api/v1/approvals/inbox" : `/api/v1/approvals/${mode}`;
    return request<{ approvals: ApprovalInstance[] }>(`${path}${query(filters)}`, {}, token);
  },
  getApprovalInstance(token: string, instanceId: string) {
    return request<{ instance: ApprovalInstance; steps: ApprovalInstanceStep[]; assignees: ApprovalStepAssignee[]; timeline: ApprovalAction[] }>(`/api/v1/approvals/instances/${instanceId}`, {}, token);
  },
  approvalInstanceAction(token: string, instanceId: string, action: "approve" | "reject" | "send-back" | "cancel", input: Record<string, unknown> = {}) {
    return request<{ instance: ApprovalInstance | null }>(`/api/v1/approvals/instances/${instanceId}/${action}`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  getApprovalTimeline(token: string, instanceId: string) {
    return request<{ timeline: ApprovalAction[] }>(`/api/v1/approvals/instances/${instanceId}/timeline`, {}, token);
  },
  previewApprovalWorkflow(token: string, input: Record<string, unknown>) {
    return request<{ preview: ApprovalPreview }>("/api/v1/approvals/preview", { method: "POST", body: JSON.stringify(input) }, token);
  },
  listApprovalDelegations(token: string) {
    return request<{ delegations: ApprovalDelegationRule[] }>("/api/v1/approvals/delegations", {}, token);
  },
  createApprovalDelegation(token: string, input: Record<string, unknown>) {
    return request<{ delegation_id: string }>("/api/v1/approvals/delegations", { method: "POST", body: JSON.stringify(input) }, token);
  },
  cancelApprovalDelegation(token: string, delegationId: string, reason: string) {
    return request<{ cancelled: boolean }>(`/api/v1/approvals/delegations/${delegationId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  refreshApprovalReminders(token: string) {
    return request<{ reminders_created: number }>("/api/v1/approvals/reminders/refresh", { method: "POST" }, token);
  },
  refreshApprovalEscalations(token: string) {
    return request<{ escalations_created: number }>("/api/v1/approvals/escalations/refresh", { method: "POST" }, token);
  },
  listApprovalNotificationTemplates(token: string) {
    return request<{ templates: ApprovalNotificationTemplate[] }>("/api/v1/approvals/notification-templates", {}, token);
  },
  updateApprovalNotificationTemplate(token: string, templateId: string, input: Partial<ApprovalNotificationTemplate>) {
    return request<{ updated: boolean }>(`/api/v1/approvals/notification-templates/${templateId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getSelfServiceApprovals(token: string) {
    return request<{ approvals: ApprovalInstance[]; visibility_mode: string; message?: string }>("/api/v1/self-service/approvals", {}, token);
  },
  getReportExportLogs(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ logs: Record<string, unknown>[] }>(`/api/v1/reports/export-logs${query(filters)}`, {}, token);
  },
  getContractSettings(token: string) {
    return request<{ settings: Record<string, unknown> }>("/api/v1/contracts/settings", {}, token);
  },
  updateContractSettings(token: string, input: Record<string, unknown>) {
    return request<{ settings: Record<string, unknown> }>("/api/v1/contracts/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listContractTypes(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ types: Record<string, unknown>[] }>(`/api/v1/contracts/types${query(filters)}`, {}, token);
  },
  createContractType(token: string, input: Record<string, unknown>) {
    return request<{ type: Record<string, unknown> }>("/api/v1/contracts/types", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateContractType(token: string, typeId: string, input: Record<string, unknown>) {
    return request<{ type: Record<string, unknown> }>(`/api/v1/contracts/types/${typeId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveContractType(token: string, typeId: string, reason?: string | null) {
    return request<{ archived: boolean }>(`/api/v1/contracts/types/${typeId}/archive`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  listContracts(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ contracts: Record<string, unknown>[] }>(`/api/v1/contracts${query(filters)}`, {}, token);
  },
  getContract(token: string, contractId: string) {
    return request<{ contract: Record<string, unknown>; events: Record<string, unknown>[]; document_status: Record<string, unknown> }>(`/api/v1/contracts/${contractId}`, {}, token);
  },
  createEmployeeContract(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ contract: Record<string, unknown> }>(`/api/v1/employees/${employeeId}/contracts`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateContract(token: string, contractId: string, input: Record<string, unknown>) {
    return request<{ contract: Record<string, unknown> }>(`/api/v1/contracts/${contractId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  contractAction(token: string, contractId: string, action: string, input: Record<string, unknown> = {}) {
    return request<{ contract?: Record<string, unknown>; updated?: boolean }>(`/api/v1/contracts/${contractId}/${action}`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listEmployeeContracts(token: string, employeeId: string) {
    return request<{ contracts: Record<string, unknown>[] }>(`/api/v1/employees/${employeeId}/contracts`, {}, token);
  },
  getEmployeeContractSummary(token: string, employeeId: string) {
    return request<{ active_contract: Record<string, unknown> | null; contract_history: Record<string, unknown>[]; events: Record<string, unknown>[]; alerts: Record<string, unknown>[]; requirement_status: Record<string, unknown>; payroll_impact: Record<string, unknown>; final_settlement_context: Record<string, unknown> }>(`/api/v1/employees/${employeeId}/contracts/summary`, {}, token);
  },
  listProbationDue(token: string) {
    return request<{ contracts: Record<string, unknown>[] }>("/api/v1/contracts/probation/due", {}, token);
  },
  listContractRenewals(token: string) {
    return request<{ renewals: Record<string, unknown>[] }>("/api/v1/contracts/renewals", {}, token);
  },
  listContractAlerts(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ alerts: Record<string, unknown>[] }>(`/api/v1/contracts/alerts${query(filters)}`, {}, token);
  },
  refreshContractAlerts(token: string) {
    return request<{ created: number; disabled: boolean }>("/api/v1/contracts/alerts/refresh", { method: "POST" }, token);
  },
  contractAlertAction(token: string, alertId: string, action: "acknowledge" | "resolve" | "dismiss", input: Record<string, unknown> = {}) {
    return request<{ updated: boolean }>(`/api/v1/contracts/alerts/${alertId}/${action}`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  getSelfServiceContracts(token: string) {
    return request<{ active_contract: Record<string, unknown> | null; contract_history: Record<string, unknown>[]; salary_terms_visible: boolean; message?: string | null }>("/api/v1/self-service/contracts", {}, token);
  },
  getSelfServiceMe(token: string) {
    return request<{ linked_employee: boolean; employee_id: string | null; unavailable_message: string | null; module_visibility?: Record<string, boolean> }>("/api/v1/self-service/me", {}, token);
  },
  getSelfServiceSettings(token: string) {
    return request<{ settings: Record<string, unknown> }>("/api/v1/self-service/settings", {}, token);
  },
  updateSelfServiceSettings(token: string, input: Record<string, unknown>) {
    return request<{ settings: Record<string, unknown> }>("/api/v1/self-service/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getSelfServiceDashboard(token: string) {
    return request<{ employee: Record<string, unknown>; summary: Record<string, unknown>; module_visibility: Record<string, boolean>; notifications: Record<string, unknown>[]; unread_notifications: number }>("/api/v1/self-service/dashboard", {}, token);
  },
  getSelfServiceProfile(token: string) {
    return request<{ employee: Record<string, unknown> | null; contacts: Record<string, unknown>[] }>("/api/v1/self-service/profile", {}, token);
  },
  getSelfServiceProfileUpdateRequests(token: string) {
    return request<{ requests: Record<string, unknown>[] }>("/api/v1/self-service/profile/update-requests", {}, token);
  },
  createSelfServiceProfileUpdateRequest(token: string, input: Record<string, unknown>) {
    return request<{ request_id: string }>("/api/v1/self-service/profile/update-requests", { method: "POST", body: JSON.stringify(input) }, token);
  },
  cancelSelfServiceProfileUpdateRequest(token: string, requestId: string) {
    return request<{ cancelled: boolean }>(`/api/v1/self-service/profile/update-requests/${requestId}/cancel`, { method: "POST" }, token);
  },
  getSelfServiceDocuments(token: string) {
    return request<{ documents: Record<string, unknown>[]; upload_enabled: boolean; upload_note: string }>("/api/v1/self-service/documents", {}, token);
  },
  getSelfServiceDocumentWarnings(token: string) {
    return request<{ warnings: Record<string, unknown>[] }>("/api/v1/self-service/documents/warnings", {}, token);
  },
  getSelfServiceAttendance(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ records: Record<string, unknown>[]; corrections: Record<string, unknown>[]; filters: Record<string, unknown> }>(`/api/v1/self-service/attendance${query(filters)}`, {}, token);
  },
  getSelfServiceAttendanceSummary(token: string) {
    return request<{ summary: Record<string, unknown>[]; corrections: Record<string, unknown>[] }>("/api/v1/self-service/attendance/summary", {}, token);
  },
  getSelfServiceAttendanceCalendar(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ records: Record<string, unknown>[]; filters: Record<string, unknown> }>(`/api/v1/self-service/attendance/calendar${query(filters)}`, {}, token);
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
  getSelfServiceLeaveSummary(token: string) {
    return request<{ summary: Record<string, unknown> }>("/api/v1/self-service/leave/summary", {}, token);
  },
  getSelfServiceLeaveBalances(token: string) {
    return request<{ balance_cycles: Record<string, unknown>[]; ledger_recent: Record<string, unknown>[] }>("/api/v1/self-service/leave/balances", {}, token);
  },
  cancelSelfServiceLeaveRequest(token: string, requestId: string) {
    return request<{ cancelled: boolean }>(`/api/v1/self-service/leave/requests/${requestId}/cancel`, { method: "POST" }, token);
  },
  getSelfServicePayroll(token: string) {
    return request<{ profile: Record<string, unknown> | null; runs: Record<string, unknown>[]; advances: Record<string, unknown>[]; deductions: Record<string, unknown>[]; payslip_download_enabled: boolean }>("/api/v1/self-service/payroll", {}, token);
  },
  getSelfServicePayrollSummary(token: string) {
    return request<{ summary: Record<string, unknown> }>("/api/v1/self-service/payroll/summary", {}, token);
  },
  getSelfServicePayrollHistory(token: string) {
    return request<{ history: Record<string, unknown>[] }>("/api/v1/self-service/payroll/history", {}, token);
  },
  getSelfServiceAssets(token: string) {
    return request<{ assignments: Record<string, unknown>[] }>("/api/v1/self-service/assets", {}, token);
  },
  getSelfServiceUniforms(token: string) {
    return request<{ assignments: Record<string, unknown>[] }>("/api/v1/self-service/uniforms", {}, token);
  },
  getSelfServiceRequests(token: string) {
    return request<{ requests: Record<string, unknown> }>("/api/v1/self-service/requests", {}, token);
  },
  getSelfServiceNotifications(token: string) {
    return request<{ notifications: Record<string, unknown>[]; unread_count: number }>("/api/v1/self-service/notifications", {}, token);
  },
  markSelfServiceNotificationRead(token: string, notificationId: string) {
    return request<{ read: boolean }>(`/api/v1/self-service/notifications/${notificationId}/read`, { method: "POST" }, token);
  },
  markAllSelfServiceNotificationsRead(token: string) {
    return request<{ read: boolean }>("/api/v1/self-service/notifications/mark-all-read", { method: "POST" }, token);
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
  createEmployeeOnboardingCase(token: string, employeeId: string) {
    return request<{ case_id: string }>(`/api/v1/employees/${employeeId}/onboarding/cases`, { method: "POST" }, token);
  },
  createEmployeeOffboardingCase(token: string, employeeId: string, input: { exit_type: string; last_working_day: string; exit_reason?: string | null; exit_notice_date?: string | null }) {
    return request<{ case_id: string }>(`/api/v1/employees/${employeeId}/offboarding/cases`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  getEmployeeLifecycleSummary(token: string, employeeId: string) {
    return request<{ summary: LifecycleSummary }>(`/api/v1/employees/${employeeId}/lifecycle-summary`, {}, token);
  },
  listEmployeeLifecycleEvents(token: string, employeeId: string) {
    return request<{ events: LifecycleEvent[] }>(`/api/v1/employees/${employeeId}/lifecycle-events`, {}, token);
  },
  getLifecycleDashboard(token: string) {
    return request<{ dashboard: Record<string, unknown> }>("/api/v1/lifecycle/dashboard", {}, token);
  },
  listLifecycleEvents(token: string) {
    return request<{ events: LifecycleEvent[] }>("/api/v1/lifecycle/events", {}, token);
  },
  getOnboardingSettings(token: string) {
    return request<{ settings: LifecycleSettings }>("/api/v1/onboarding/settings", {}, token);
  },
  updateOnboardingSettings(token: string, input: Partial<LifecycleSettings>) {
    return request<{ settings: LifecycleSettings }>("/api/v1/onboarding/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listOnboardingCases(token: string) {
    return request<{ cases: OnboardingCase[] }>("/api/v1/onboarding/cases", {}, token);
  },
  getOnboardingDashboard(token: string) {
    return request<{ dashboard: Record<string, unknown> }>("/api/v1/onboarding/dashboard", {}, token);
  },
  listOnboardingAlerts(token: string) {
    return request<{ alerts: Record<string, unknown>[] }>("/api/v1/onboarding/alerts", {}, token);
  },
  refreshOnboardingAlerts(token: string) {
    return request<{ refreshed: boolean }>("/api/v1/onboarding/alerts/refresh", { method: "POST" }, token);
  },
  getOnboardingCase(token: string, caseId: string) {
    return request<{ case: OnboardingCase; employee: Employee; checklist: { tasks: LifecycleTask[] }; approval: Record<string, unknown> }>(`/api/v1/onboarding/cases/${caseId}`, {}, token);
  },
  updateOnboardingCase(token: string, caseId: string, input: Record<string, unknown>) {
    return request<{ case: OnboardingCase }>(`/api/v1/onboarding/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  refreshOnboardingTasks(token: string, caseId: string) {
    return request<{ checklist: { tasks: LifecycleTask[] } }>(`/api/v1/onboarding/cases/${caseId}/tasks/refresh`, { method: "POST" }, token);
  },
  getOnboardingReadiness(token: string, caseId: string) {
    return request<{ readiness: Record<string, unknown> }>(`/api/v1/onboarding/cases/${caseId}/readiness`, {}, token);
  },
  submitOnboardingActivation(token: string, caseId: string) {
    return request<Record<string, unknown>>(`/api/v1/onboarding/cases/${caseId}/submit-activation`, { method: "POST" }, token);
  },
  approveOnboardingActivation(token: string, caseId: string) {
    return request<Record<string, unknown>>(`/api/v1/onboarding/cases/${caseId}/approve-activation`, { method: "POST" }, token);
  },
  activateOnboardingCase(token: string, caseId: string) {
    return request<Record<string, unknown>>(`/api/v1/onboarding/cases/${caseId}/activate`, { method: "POST" }, token);
  },
  activateOnboardingCaseWithOverride(token: string, caseId: string, reason: string) {
    return request<Record<string, unknown>>(`/api/v1/onboarding/cases/${caseId}/activate-with-override`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  completeOnboardingTask(token: string, taskId: string) {
    return request<{ completed: boolean }>(`/api/v1/onboarding/tasks/${taskId}/complete`, { method: "POST" }, token);
  },
  waiveOnboardingTask(token: string, taskId: string, reason: string) {
    return request<{ waived: boolean }>(`/api/v1/onboarding/tasks/${taskId}/waive`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  reopenOnboardingTask(token: string, taskId: string) {
    return request<{ reopened: boolean }>(`/api/v1/onboarding/tasks/${taskId}/reopen`, { method: "POST" }, token);
  },
  getOffboardingSettings(token: string) {
    return request<{ settings: LifecycleSettings }>("/api/v1/offboarding/settings", {}, token);
  },
  updateOffboardingSettings(token: string, input: Partial<LifecycleSettings>) {
    return request<{ settings: LifecycleSettings }>("/api/v1/offboarding/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listOffboardingCases(token: string) {
    return request<{ cases: OffboardingCase[] }>("/api/v1/offboarding/cases", {}, token);
  },
  getOffboardingDashboard(token: string) {
    return request<{ dashboard: Record<string, unknown> }>("/api/v1/offboarding/dashboard", {}, token);
  },
  getOffboardingCase(token: string, caseId: string) {
    return request<{ case: OffboardingCase; employee: Employee; checklist: { tasks: LifecycleTask[] }; approval: Record<string, unknown> }>(`/api/v1/offboarding/cases/${caseId}`, {}, token);
  },
  updateOffboardingCase(token: string, caseId: string, input: Record<string, unknown>) {
    return request<{ case: OffboardingCase }>(`/api/v1/offboarding/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  refreshOffboardingTasks(token: string, caseId: string) {
    return request<{ checklist: { tasks: LifecycleTask[] } }>(`/api/v1/offboarding/cases/${caseId}/tasks/refresh`, { method: "POST" }, token);
  },
  getOffboardingReadiness(token: string, caseId: string) {
    return request<{ readiness: Record<string, unknown> }>(`/api/v1/offboarding/cases/${caseId}/readiness`, {}, token);
  },
  submitOffboardingFinalization(token: string, caseId: string) {
    return request<Record<string, unknown>>(`/api/v1/offboarding/cases/${caseId}/submit-finalization`, { method: "POST" }, token);
  },
  approveOffboardingFinalization(token: string, caseId: string) {
    return request<Record<string, unknown>>(`/api/v1/offboarding/cases/${caseId}/approve-finalization`, { method: "POST" }, token);
  },
  finalizeOffboardingCase(token: string, caseId: string) {
    return request<Record<string, unknown>>(`/api/v1/offboarding/cases/${caseId}/finalize-exit`, { method: "POST" }, token);
  },
  finalizeOffboardingCaseWithOverride(token: string, caseId: string, reason: string) {
    return request<Record<string, unknown>>(`/api/v1/offboarding/cases/${caseId}/finalize-with-override`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  completeOffboardingTask(token: string, taskId: string) {
    return request<{ completed: boolean }>(`/api/v1/offboarding/tasks/${taskId}/complete`, { method: "POST" }, token);
  },
  waiveOffboardingTask(token: string, taskId: string, reason: string) {
    return request<{ waived: boolean }>(`/api/v1/offboarding/tasks/${taskId}/waive`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  reopenOffboardingTask(token: string, taskId: string) {
    return request<{ reopened: boolean }>(`/api/v1/offboarding/tasks/${taskId}/reopen`, { method: "POST" }, token);
  },
  getSelfServiceOnboarding(token: string) {
    return request<{ onboarding: OnboardingCase | null; tasks: LifecycleTask[]; events: LifecycleEvent[] }>("/api/v1/self-service/onboarding", {}, token);
  },
  getSelfServiceOffboarding(token: string) {
    return request<{ offboarding: OffboardingCase | null; tasks: LifecycleTask[]; events: LifecycleEvent[] }>("/api/v1/self-service/offboarding", {}, token);
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
  getDocumentComplianceSettings(token: string) {
    return request<{ settings: DocumentComplianceSettings }>("/api/v1/documents/compliance/settings", {}, token);
  },
  updateDocumentComplianceSettings(token: string, input: Partial<DocumentComplianceSettings>) {
    return request<{ settings: DocumentComplianceSettings }>("/api/v1/documents/compliance/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listDocumentTypeCompliance(token: string) {
    return request<{ document_types: DocumentType[] }>("/api/v1/documents/types/compliance", {}, token);
  },
  updateDocumentTypeCompliance(token: string, typeId: string, input: Partial<DocumentType>) {
    return request<{ document_type: DocumentType }>(`/api/v1/documents/types/${typeId}/compliance`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveDocumentRequiredRule(token: string, ruleId: string) {
    return request<{ archived: boolean }>(`/api/v1/documents/required-rules/${ruleId}/archive`, { method: "POST" }, token);
  },
  getDocumentComplianceDashboard(token: string) {
    return request<DocumentComplianceDashboard>("/api/v1/documents/compliance/dashboard", {}, token);
  },
  refreshDocumentCompliance(token: string) {
    return request<{ refreshed_count: number; employee_ids: string[]; alerts?: Record<string, unknown> }>("/api/v1/documents/compliance/refresh", { method: "POST" }, token);
  },
  listDocumentComplianceMissing(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ missing: Record<string, unknown>[]; rows: Record<string, unknown>[] }>(`/api/v1/documents/compliance/missing${query(filters)}`, {}, token);
  },
  listDocumentComplianceExpiring(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ expiring: Record<string, unknown>[]; rows: Record<string, unknown>[] }>(`/api/v1/documents/compliance/expiring${query(filters)}`, {}, token);
  },
  listDocumentComplianceExpired(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ expired: Record<string, unknown>[]; rows: Record<string, unknown>[] }>(`/api/v1/documents/compliance/expired${query(filters)}`, {}, token);
  },
  listDocumentAlerts(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ alerts: DocumentExpiryAlert[] }>(`/api/v1/documents/alerts${query(filters)}`, {}, token);
  },
  refreshDocumentAlerts(token: string) {
    return request<Record<string, unknown>>("/api/v1/documents/alerts/refresh", { method: "POST" }, token);
  },
  documentAlertAction(token: string, alertId: string, action: "acknowledge" | "resolve" | "dismiss", reason?: string) {
    return request<{ alert: DocumentExpiryAlert }>(`/api/v1/documents/alerts/${alertId}/${action}`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listDocumentRenewalCases(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ renewal_cases: DocumentRenewalCase[] }>(`/api/v1/documents/renewal-cases${query(filters)}`, {}, token);
  },
  getDocumentRenewalCase(token: string, caseId: string) {
    return request<{ renewal_case: DocumentRenewalCase; events: Record<string, unknown>[] }>(`/api/v1/documents/renewal-cases/${caseId}`, {}, token);
  },
  updateDocumentRenewalCase(token: string, caseId: string, input: Partial<DocumentRenewalCase>) {
    return request<{ renewal_case: DocumentRenewalCase }>(`/api/v1/documents/renewal-cases/${caseId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  documentRenewalCaseAction(token: string, caseId: string, action: "assign" | "mark-in-progress" | "mark-waiting" | "complete" | "cancel", input: Record<string, unknown> = {}) {
    return request<{ renewal_case: DocumentRenewalCase }>(`/api/v1/documents/renewal-cases/${caseId}/${action}`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listDocumentRenewalCaseEvents(token: string, caseId: string) {
    return request<{ events: Record<string, unknown>[] }>(`/api/v1/documents/renewal-cases/${caseId}/events`, {}, token);
  },
  listDocumentRequirementWaivers(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ waivers: DocumentRequirementWaiver[] }>(`/api/v1/documents/waivers${query(filters)}`, {}, token);
  },
  cancelDocumentRequirementWaiver(token: string, waiverId: string, reason: string) {
    return request<{ waiver: DocumentRequirementWaiver }>(`/api/v1/documents/waivers/${waiverId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  getEmployeeDocumentCompliance(token: string, employeeId: string) {
    return request<{ compliance: EmployeeDocumentCompliance }>(`/api/v1/employees/${employeeId}/documents/compliance`, {}, token);
  },
  getEmployeeDocumentComplianceSummary(token: string, employeeId: string) {
    return request<{ summary: EmployeeDocumentCompliance }>(`/api/v1/employees/${employeeId}/documents/compliance-summary`, {}, token);
  },
  refreshEmployeeDocumentCompliance(token: string, employeeId: string) {
    return request<{ compliance: EmployeeDocumentCompliance }>(`/api/v1/employees/${employeeId}/documents/compliance/refresh`, { method: "POST" }, token);
  },
  createEmployeeDocumentWaiver(token: string, employeeId: string, input: { document_type_id: string; waiver_reason: string; waiver_start_date?: string | null; waiver_end_date?: string | null; required_rule_id?: string | null }) {
    return request<{ waiver: DocumentRequirementWaiver }>(`/api/v1/employees/${employeeId}/documents/waivers`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  createEmployeeDocumentRenewalCase(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ renewal_case: DocumentRenewalCase }>(`/api/v1/employees/${employeeId}/documents/renewal-cases`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  getSelfServiceDocumentCompliance(token: string) {
    return request<{ compliance: EmployeeDocumentCompliance & { renewal_cases?: Record<string, unknown>[]; upload_note?: string; upload_request_enabled?: boolean } }>("/api/v1/self-service/documents/compliance", {}, token);
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
  getAttendanceDeviceSettings(token: string) {
    return request<{ settings: AttendanceDeviceSettings }>("/api/v1/attendance/devices/settings", {}, token);
  },
  updateAttendanceDeviceSettings(token: string, input: Partial<AttendanceDeviceSettings>) {
    return request<{ settings: AttendanceDeviceSettings }>("/api/v1/attendance/devices/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
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
  archiveAttendanceDevice(token: string, id: string, reason?: string | null) {
    return request<{ archived: boolean }>(`/api/v1/attendance/devices/${id}/archive`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  testAttendanceDeviceConnection(token: string, id: string) {
    return request<{ status: string; message: string }>(`/api/v1/attendance/devices/${id}/test-connection-placeholder`, { method: "POST" }, token);
  },
  getAttendanceDeviceDiagnostics(token: string, id: string) {
    return request<{ device: AttendanceDevice; status_counts: Record<string, unknown>[]; diagnostics: Record<string, unknown> }>(`/api/v1/attendance/devices/${id}/diagnostics`, {}, token);
  },
  listBiometricMappings(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ mappings: EmployeeBiometricMapping[] }>(`/api/v1/attendance/biometric-mappings${query(filters)}`, {}, token);
  },
  createBiometricMapping(token: string, input: Partial<EmployeeBiometricMapping>) {
    return request<{ mapping: EmployeeBiometricMapping }>("/api/v1/attendance/biometric-mappings", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateBiometricMapping(token: string, id: string, input: Partial<EmployeeBiometricMapping>) {
    return request<{ mapping: EmployeeBiometricMapping }>(`/api/v1/attendance/biometric-mappings/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveBiometricMapping(token: string, id: string) {
    return request<{ archived: boolean }>(`/api/v1/attendance/biometric-mappings/${id}/archive`, { method: "POST" }, token);
  },
  listEmployeeBiometricMappings(token: string, employeeId: string) {
    return request<{ mappings: EmployeeBiometricMapping[] }>(`/api/v1/employees/${employeeId}/biometric-mappings`, {}, token);
  },
  createEmployeeBiometricMapping(token: string, employeeId: string, input: Partial<EmployeeBiometricMapping>) {
    return request<{ mapping: EmployeeBiometricMapping }>(`/api/v1/employees/${employeeId}/biometric-mappings`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listAttendanceImportBatches(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ batches: AttendanceImportBatch[] }>(`/api/v1/attendance/import-batches${query(filters)}`, {}, token);
  },
  getAttendanceImportBatch(token: string, id: string) {
    return request<{ batch: AttendanceImportBatch; logs: AttendanceRawLog[]; errors: AttendanceImportRowError[] }>(`/api/v1/attendance/import-batches/${id}`, {}, token);
  },
  uploadZktecoCsvAttendance(token: string, input: { file: File; attendance_device_id?: string | null }) {
    const form = new FormData();
    form.append("file", input.file);
    if (input.attendance_device_id) form.append("attendance_device_id", input.attendance_device_id);
    return multipartRequest<Record<string, unknown>>("/api/v1/attendance/import-batches/zkteco-csv", form, token);
  },
  processAttendanceImportBatch(token: string, id: string) {
    return request<Record<string, unknown>>(`/api/v1/attendance/import-batches/${id}/process`, { method: "POST" }, token);
  },
  cancelAttendanceImportBatch(token: string, id: string, reason: string) {
    return request<{ cancelled: boolean }>(`/api/v1/attendance/import-batches/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listAttendanceImportErrors(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ errors: AttendanceImportRowError[] }>(`/api/v1/attendance/import-errors${query(filters)}`, {}, token);
  },
  listAttendanceRawLogs(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ logs: AttendanceRawLog[] }>(`/api/v1/attendance/raw-logs${query(filters)}`, {}, token);
  },
  getAttendanceRawLog(token: string, id: string) {
    return request<{ log: AttendanceRawLog }>(`/api/v1/attendance/raw-logs/${id}`, {}, token);
  },
  reprocessAttendanceRawLog(token: string, id: string) {
    return request<Record<string, unknown>>(`/api/v1/attendance/raw-logs/${id}/reprocess`, { method: "POST" }, token);
  },
  createManualAttendanceRawLog(token: string, input: Record<string, unknown>) {
    return request<Record<string, unknown>>("/api/v1/attendance/raw-logs/manual", { method: "POST", body: JSON.stringify(input) }, token);
  },
  listAttendanceUnmatchedLogs(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ unmatched_logs: AttendanceUnmatchedLog[] }>(`/api/v1/attendance/unmatched-logs${query(filters)}`, {}, token);
  },
  mapAttendanceUnmatchedLog(token: string, id: string, input: { employee_id: string; note?: string | null }) {
    return request<{ resolved: boolean }>(`/api/v1/attendance/unmatched-logs/${id}/map-employee`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  ignoreAttendanceUnmatchedLog(token: string, id: string, note: string) {
    return request<{ ignored: boolean }>(`/api/v1/attendance/unmatched-logs/${id}/ignore`, { method: "POST", body: JSON.stringify({ note }) }, token);
  },
  reprocessResolvedAttendanceUnmatchedLogs(token: string) {
    return request<Record<string, unknown>>("/api/v1/attendance/unmatched-logs/reprocess-resolved", { method: "POST" }, token);
  },
  listAttendanceLockedDayWarnings(token: string) {
    return request<{ warnings: AttendanceLockedDayWarning[] }>("/api/v1/attendance/locked-day-import-warnings", {}, token);
  },
  resolveAttendanceLockedDayWarning(token: string, id: string, note?: string | null) {
    return request<{ resolved: boolean }>(`/api/v1/attendance/locked-day-import-warnings/${id}/resolve`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }, token);
  },
  dismissAttendanceLockedDayWarning(token: string, id: string, note: string) {
    return request<{ dismissed: boolean }>(`/api/v1/attendance/locked-day-import-warnings/${id}/dismiss`, { method: "POST", body: JSON.stringify({ note }) }, token);
  },
  resolveAttendanceImportError(token: string, id: string, note?: string | null) {
    return request<{ resolved: boolean }>(`/api/v1/attendance/import-errors/${id}/resolve`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }, token);
  },
  ignoreAttendanceImportError(token: string, id: string, note: string) {
    return request<{ ignored: boolean }>(`/api/v1/attendance/import-errors/${id}/ignore`, { method: "POST", body: JSON.stringify({ note }) }, token);
  },
  getAttendanceDeviceDiagnosticsOverview(token: string) {
    return request<{ diagnostics: Record<string, unknown>[] }>("/api/v1/attendance/device-diagnostics", {}, token);
  },
  listAttendanceVendorIntegrations(token: string) {
    return request<{ integrations: AttendanceVendorIntegration[] }>("/api/v1/attendance/vendor-integrations", {}, token);
  },
  createAttendanceVendorIntegration(token: string, input: Partial<AttendanceVendorIntegration>) {
    return request<{ integration: AttendanceVendorIntegration }>("/api/v1/attendance/vendor-integrations", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateAttendanceVendorIntegration(token: string, id: string, input: Partial<AttendanceVendorIntegration>) {
    return request<{ integration: AttendanceVendorIntegration }>(`/api/v1/attendance/vendor-integrations/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  testAttendanceVendorIntegration(token: string, id: string) {
    return request<{ status: string; message: string }>(`/api/v1/attendance/vendor-integrations/${id}/test-placeholder`, { method: "POST" }, token);
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
  getEmployeeAttendanceDeviceSummary(token: string, employeeId: string) {
    return request<{ mappings: EmployeeBiometricMapping[]; raw_log_status_counts: Record<string, unknown>[]; recent_raw_logs: AttendanceRawLog[]; unmatched_related_count: number }>(`/api/v1/employees/${employeeId}/attendance/device-summary`, {}, token);
  },
  getSelfServiceAttendanceDeviceSummary(token: string) {
    return request<{ biometric_mappings: EmployeeBiometricMapping[]; recent_raw_logs: Record<string, unknown>[]; correction_requests: Record<string, unknown>[] }>("/api/v1/self-service/attendance/summary", {}, token);
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
  listPaymentInstitutions(token: string, includeArchived = false) {
    return request<{ institutions: PaymentInstitution[] }>(`/api/v1/payroll/payment-institutions${includeArchived ? "?include_archived=1" : ""}`, {}, token);
  },
  createPaymentInstitution(token: string, input: Partial<PaymentInstitution>) {
    return request<{ institution: PaymentInstitution }>("/api/v1/payroll/payment-institutions", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePaymentInstitution(token: string, id: string, input: Partial<PaymentInstitution>) {
    return request<{ institution: PaymentInstitution }>(`/api/v1/payroll/payment-institutions/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archivePaymentInstitution(token: string, id: string) {
    return request<{ archived: boolean }>(`/api/v1/payroll/payment-institutions/${id}/archive`, { method: "POST" }, token);
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
  listEmployeePaymentMethods(token: string, employeeId: string) {
    return request<{ payment_methods: EmployeePaymentMethod[] }>(`/api/v1/employees/${employeeId}/payment-methods`, {}, token);
  },
  createEmployeePaymentMethod(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ payment_method: EmployeePaymentMethod }>(`/api/v1/employees/${employeeId}/payment-methods`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateEmployeePaymentMethod(token: string, employeeId: string, methodId: string, input: Record<string, unknown>) {
    return request<{ payment_method: EmployeePaymentMethod }>(`/api/v1/employees/${employeeId}/payment-methods/${methodId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  verifyEmployeePaymentMethod(token: string, employeeId: string, methodId: string) {
    return request<{ verified: boolean }>(`/api/v1/employees/${employeeId}/payment-methods/${methodId}/verify`, { method: "POST" }, token);
  },
  archiveEmployeePaymentMethod(token: string, employeeId: string, methodId: string) {
    return request<{ archived: boolean }>(`/api/v1/employees/${employeeId}/payment-methods/${methodId}/archive`, { method: "POST" }, token);
  },
  getEmployeePensionProfile(token: string, employeeId: string) {
    return request<{ profile: EmployeePensionProfile | null }>(`/api/v1/employees/${employeeId}/pension-profile`, {}, token);
  },
  updateEmployeePensionProfile(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ profile: EmployeePensionProfile }>(`/api/v1/employees/${employeeId}/pension-profile`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listPayrollBankLoans(token: string) {
    return request<{ loans: EmployeeBankLoan[] }>("/api/v1/payroll/bank-loans", {}, token);
  },
  createEmployeeBankLoan(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ loan: EmployeeBankLoan }>(`/api/v1/payroll/employees/${employeeId}/bank-loans`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePayrollBankLoan(token: string, loanId: string, input: Record<string, unknown>) {
    return request<{ loan: EmployeeBankLoan }>(`/api/v1/payroll/bank-loans/${loanId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  payrollBankLoanAction(token: string, loanId: string, action: "approve" | "pause" | "cancel") {
    return request<{ loan: EmployeeBankLoan }>(`/api/v1/payroll/bank-loans/${loanId}/${action}`, { method: "POST" }, token);
  },
  listPayrollBankLoanPayments(token: string) {
    return request<{ payments: EmployeeBankLoanPayment[] }>("/api/v1/payroll/bank-loan-payments", {}, token);
  },
  confirmBankLoanPaidToBank(token: string, paymentId: string, input: { remittance_reference: string; notes?: string | null }) {
    return request<{ payment: EmployeeBankLoanPayment }>(`/api/v1/payroll/bank-loan-payments/${paymentId}/confirm-paid-to-bank`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  markBankLoanPaymentBankNotified(token: string, paymentId: string, input: { bank_notification_reference?: string | null; bank_notification_note?: string | null }) {
    return request<{ payment: EmployeeBankLoanPayment }>(`/api/v1/payroll/bank-loan-payments/${paymentId}/mark-bank-notified`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listBankLoanEligibilityRules(token: string) {
    return request<{ rules: BankLoanEligibilityRule[] }>("/api/v1/payroll/bank-loan-eligibility-rules", {}, token);
  },
  createBankLoanEligibilityRule(token: string, input: Partial<BankLoanEligibilityRule>) {
    return request<{ rule: BankLoanEligibilityRule }>("/api/v1/payroll/bank-loan-eligibility-rules", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateBankLoanEligibilityRule(token: string, ruleId: string, input: Partial<BankLoanEligibilityRule>) {
    return request<{ rule: BankLoanEligibilityRule }>(`/api/v1/payroll/bank-loan-eligibility-rules/${ruleId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveBankLoanEligibilityRule(token: string, ruleId: string) {
    return request<{ archived: boolean }>(`/api/v1/payroll/bank-loan-eligibility-rules/${ruleId}/archive`, { method: "POST" }, token);
  },
  listBankLoanRemittanceBatches(token: string) {
    return request<{ batches: BankLoanRemittanceBatch[] }>("/api/v1/payroll/bank-loan-remittance-batches", {}, token);
  },
  createBankLoanRemittanceBatch(token: string, input: Record<string, unknown>) {
    return request<{ batch: BankLoanRemittanceBatch }>("/api/v1/payroll/bank-loan-remittance-batches", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getBankLoanRemittanceBatch(token: string, batchId: string) {
    return request<{ batch: BankLoanRemittanceBatch; items: Record<string, unknown>[] }>(`/api/v1/payroll/bank-loan-remittance-batches/${batchId}`, {}, token);
  },
  confirmBankLoanRemittanceBatch(token: string, batchId: string, input: { remittance_reference: string; confirmation_note: string }) {
    return request<{ confirmed: boolean }>(`/api/v1/payroll/bank-loan-remittance-batches/${batchId}/confirm`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  getBankLoanSummaryReport(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/payroll/reports/bank-loan-summary", {}, token);
  },
  getBankLoanShortfallsReport(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/payroll/reports/bank-loan-shortfalls", {}, token);
  },
  listCustomDeductionTemplates(token: string, includeArchived = false) {
    return request<{ templates: CustomDeductionTemplate[] }>(`/api/v1/payroll/custom-deduction-templates${includeArchived ? "?include_archived=1" : ""}`, {}, token);
  },
  createCustomDeductionTemplate(token: string, input: Record<string, unknown>) {
    return request<{ template: CustomDeductionTemplate }>("/api/v1/payroll/custom-deduction-templates", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateCustomDeductionTemplate(token: string, templateId: string, input: Record<string, unknown>) {
    return request<{ template: CustomDeductionTemplate }>(`/api/v1/payroll/custom-deduction-templates/${templateId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveCustomDeductionTemplate(token: string, templateId: string) {
    return request<{ archived: boolean }>(`/api/v1/payroll/custom-deduction-templates/${templateId}/archive`, { method: "POST" }, token);
  },
  listPayrollCustomDeductions(token: string) {
    return request<{ deductions: EmployeeCustomDeduction[] }>("/api/v1/payroll/custom-deductions", {}, token);
  },
  listEmployeeCustomDeductions(token: string, employeeId: string) {
    return request<{ deductions: EmployeeCustomDeduction[]; applications: EmployeeCustomDeductionApplication[] }>(`/api/v1/employees/${employeeId}/custom-deductions`, {}, token);
  },
  createEmployeeCustomDeduction(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ deduction: EmployeeCustomDeduction }>(`/api/v1/employees/${employeeId}/custom-deductions`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateEmployeeCustomDeduction(token: string, deductionId: string, input: Record<string, unknown>) {
    return request<{ deduction: EmployeeCustomDeduction }>(`/api/v1/payroll/custom-deductions/${deductionId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  customDeductionAction(token: string, deductionId: string, action: "approve" | "reject" | "pause" | "resume" | "cancel", reason?: string) {
    return request<{ deduction: EmployeeCustomDeduction }>(`/api/v1/payroll/custom-deductions/${deductionId}/${action}`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  getCustomDeductionSummaryReport(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/payroll/reports/custom-deductions-summary", {}, token);
  },
  getCustomDeductionsByTemplateReport(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/payroll/reports/custom-deductions-by-template", {}, token);
  },
  getCustomDeductionsByCategoryReport(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/payroll/reports/custom-deductions-by-category", {}, token);
  },
  getCustomDeductionShortfallsReport(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/payroll/reports/custom-deduction-shortfalls", {}, token);
  },
  getCustomDeductionApplicationsReport(token: string) {
    return request<{ reports: EmployeeCustomDeductionApplication[] }>("/api/v1/payroll/reports/custom-deduction-applications", {}, token);
  },
  listPensionSchemes(token: string) {
    return request<{ schemes: PensionScheme[] }>("/api/v1/payroll/pension-schemes", {}, token);
  },
  createPensionScheme(token: string, input: Partial<PensionScheme>) {
    return request<{ scheme: PensionScheme }>("/api/v1/payroll/pension-schemes", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updatePensionScheme(token: string, schemeId: string, input: Partial<PensionScheme>) {
    return request<{ scheme: PensionScheme }>(`/api/v1/payroll/pension-schemes/${schemeId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archivePensionScheme(token: string, schemeId: string) {
    return request<{ archived: boolean }>(`/api/v1/payroll/pension-schemes/${schemeId}/archive`, { method: "POST" }, token);
  },
  listPensionContributions(token: string) {
    return request<{ contributions: PayrollPensionContribution[] }>("/api/v1/payroll/pension-contributions", {}, token);
  },
  getPensionContributionsReport(token: string) {
    return request<{ reports: Record<string, unknown>[] }>("/api/v1/payroll/reports/pension-contributions", {}, token);
  },
  listPensionRemittanceBatches(token: string) {
    return request<{ batches: PensionRemittanceBatch[] }>("/api/v1/payroll/pension-remittance-batches", {}, token);
  },
  createPensionRemittanceBatch(token: string, input: Record<string, unknown>) {
    return request<{ batch: PensionRemittanceBatch }>("/api/v1/payroll/pension-remittance-batches", { method: "POST", body: JSON.stringify(input) }, token);
  },
  confirmPensionRemittanceBatch(token: string, batchId: string, input: { remittance_reference: string; confirmation_note: string }) {
    return request<{ confirmed: boolean }>(`/api/v1/payroll/pension-remittance-batches/${batchId}/confirm`, { method: "POST", body: JSON.stringify(input) }, token);
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
  listPayrollRunApprovals(token: string, id: string) {
    return request<{ approvals: PayrollApprovalEvent[] }>(`/api/v1/payroll/runs/${id}/approvals`, {}, token);
  },
  submitPayrollRunForApproval(token: string, id: string, note?: string | null) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/submit-for-approval`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }, token);
  },
  approvePayrollRun(token: string, id: string, note?: string | null) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/approve`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }, token);
  },
  rejectPayrollRun(token: string, id: string, reason: string, note?: string | null) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/reject`, { method: "POST", body: JSON.stringify({ reason, note: note ?? null }) }, token);
  },
  sendBackPayrollRun(token: string, id: string, reason: string, note?: string | null) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/send-back`, { method: "POST", body: JSON.stringify({ reason, note: note ?? null }) }, token);
  },
  finalizePayrollRun(token: string, id: string, note?: string | null, override = false) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/finalize`, { method: "POST", body: JSON.stringify({ note: note ?? null, override }) }, token);
  },
  unlockFinalizedPayrollRun(token: string, id: string, reason: string) {
    return request<{ run: PayrollRun }>(`/api/v1/payroll/runs/${id}/unlock-finalized`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  getPayrollFinalizationStatus(token: string, id: string) {
    return request<{ finalization: Record<string, unknown> }>(`/api/v1/payroll/runs/${id}/finalization-status`, {}, token);
  },
  generatePayrollRunPayslips(token: string, id: string) {
    return request<{ payslips: PayrollPayslip[] }>(`/api/v1/payroll/runs/${id}/generate-payslips`, { method: "POST" }, token);
  },
  preparePayrollRunPaymentRegister(token: string, id: string) {
    return request<{ payments: PayrollPaymentRegister[] }>(`/api/v1/payroll/runs/${id}/prepare-payment-register`, { method: "POST" }, token);
  },
  listPayrollRunPaymentRegister(token: string, id: string) {
    return request<{ payments: PayrollPaymentRegister[] }>(`/api/v1/payroll/runs/${id}/payment-register`, {}, token);
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
  listPayrollPayslips(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ payslips: PayrollPayslip[] }>(`/api/v1/payroll/payslips${query(filters)}`, {}, token);
  },
  getPayrollPayslip(token: string, id: string) {
    return request<{ payslip: PayrollPayslip & Record<string, unknown> }>(`/api/v1/payroll/payslips/${id}`, {}, token);
  },
  regeneratePayrollPayslip(token: string, id: string) {
    return request<{ payslip: PayrollPayslip }>(`/api/v1/payroll/payslips/${id}/regenerate`, { method: "POST" }, token);
  },
  previewPayrollPayslip(token: string, id: string) {
    return blobRequest(`/api/v1/payroll/payslips/${id}/preview`, token);
  },
  downloadPayrollPayslip(token: string, id: string) {
    return blobRequest(`/api/v1/payroll/payslips/${id}/download`, token);
  },
  listEmployeePayslips(token: string, employeeId: string) {
    return request<{ payslips: PayrollPayslip[] }>(`/api/v1/employees/${employeeId}/payslips`, {}, token);
  },
  listPayrollPaymentRegisters(token: string) {
    return request<{ payments: PayrollPaymentRegister[] }>("/api/v1/payroll/payment-registers", {}, token);
  },
  confirmManualPayrollPayment(token: string, id: string, input: { confirmation_reference: string; confirmation_note: string }) {
    return request<{ payment: PayrollPaymentRegister }>(`/api/v1/payroll/payment-register/${id}/confirm-manual-paid`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  cancelPayrollPaymentRegister(token: string, id: string, reason: string) {
    return request<{ payment: PayrollPaymentRegister }>(`/api/v1/payroll/payment-register/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  getPayrollHistory(token: string) {
    return request<{ history: PayrollHistoryRow[] }>("/api/v1/payroll/history", {}, token);
  },
  getPayrollEmployeeHistory(token: string, employeeId: string) {
    return request<{ history: PayrollHistoryRow[] }>(`/api/v1/payroll/employees/${employeeId}/history`, {}, token);
  },
  getPayrollSummaryReport(token: string, kind: "summary" | "department-totals" | "worksite-totals" | "allowances-deductions" | "attendance-deductions" | "leave-deductions" | "advance-deductions") {
    return request<Record<string, unknown>>(`/api/v1/payroll/reports/${kind}`, {}, token);
  },
  getSelfServicePayslips(token: string) {
    return request<{ payslips: PayrollPayslip[] }>("/api/v1/self-service/payslips", {}, token);
  },
  getSelfServicePayslip(token: string, id: string) {
    return request<{ payslip: PayrollPayslip & Record<string, unknown> }>(`/api/v1/self-service/payslips/${id}`, {}, token);
  },
  previewSelfServicePayslip(token: string, id: string) {
    return blobRequest(`/api/v1/self-service/payslips/${id}/preview`, token);
  },
  getSelfServicePaymentMethods(token: string) {
    return request<{ payment_methods: EmployeePaymentMethod[] }>("/api/v1/self-service/payment-methods", {}, token);
  },
  getSelfServiceBankLoans(token: string) {
    return request<{ loans: EmployeeBankLoan[]; payments: EmployeeBankLoanPayment[] }>("/api/v1/self-service/bank-loans", {}, token);
  },
  getSelfServiceCustomDeductions(token: string) {
    return request<{ deductions: EmployeeCustomDeduction[]; applications: EmployeeCustomDeductionApplication[]; message?: string }>("/api/v1/self-service/custom-deductions", {}, token);
  },
  getSelfServicePension(token: string) {
    return request<{ profile: EmployeePensionProfile | null; contributions: PayrollPensionContribution[] }>("/api/v1/self-service/pension", {}, token);
  },
  downloadSelfServicePayslip(token: string, id: string) {
    return blobRequest(`/api/v1/self-service/payslips/${id}/download`, token);
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
  getFinalSettlementSettings(token: string) {
    return request<{ settings: FinalSettlementSettings }>("/api/v1/final-settlement/settings", {}, token);
  },
  updateFinalSettlementSettings(token: string, input: Partial<FinalSettlementSettings>) {
    return request<{ settings: FinalSettlementSettings }>("/api/v1/final-settlement/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listFinalSettlementCases(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ cases: FinalSettlementCase[] }>(`/api/v1/final-settlement/cases${query(filters)}`, {}, token);
  },
  getFinalSettlementCase(token: string, caseId: string) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}`, {}, token);
  },
  createFinalSettlementCase(token: string, input: Record<string, unknown>) {
    return request<{ case: FinalSettlementCase }>("/api/v1/final-settlement/cases", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateFinalSettlementCase(token: string, caseId: string, input: Record<string, unknown>) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  cancelFinalSettlementCase(token: string, caseId: string, reason: string) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  calculateFinalSettlementCase(token: string, caseId: string) {
    return request<FinalSettlementCalculation>(`/api/v1/final-settlement/cases/${caseId}/calculate`, { method: "POST" }, token);
  },
  recalculateFinalSettlementCase(token: string, caseId: string, reason?: string | null) {
    return request<FinalSettlementCalculation>(`/api/v1/final-settlement/cases/${caseId}/recalculate`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  listFinalSettlementLineItems(token: string, caseId: string) {
    return request<{ line_items: FinalSettlementLineItem[] }>(`/api/v1/final-settlement/cases/${caseId}/line-items`, {}, token);
  },
  createFinalSettlementManualAdjustment(token: string, caseId: string, input: { adjustment_type: "EARNING" | "DEDUCTION"; amount: number; reason: string }) {
    return request<{ adjustment: Record<string, unknown> }>(`/api/v1/final-settlement/cases/${caseId}/manual-adjustments`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  cancelFinalSettlementManualAdjustment(token: string, adjustmentId: string, reason: string) {
    return request<{ cancelled: boolean }>(`/api/v1/final-settlement/manual-adjustments/${adjustmentId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listFinalSettlementClearance(token: string, caseId: string) {
    return request<{ clearance: FinalSettlementClearanceItem[] }>(`/api/v1/final-settlement/cases/${caseId}/clearance`, {}, token);
  },
  updateFinalSettlementClearance(token: string, caseId: string, itemId: string, input: { status: string; reason?: string | null }) {
    return request<{ item: FinalSettlementClearanceItem }>(`/api/v1/final-settlement/cases/${caseId}/clearance/${itemId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  waiveFinalSettlementClearance(token: string, caseId: string, itemId: string, reason: string) {
    return request<{ item: FinalSettlementClearanceItem }>(`/api/v1/final-settlement/cases/${caseId}/clearance/${itemId}/waive`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listFinalSettlementEvents(token: string, caseId: string) {
    return request<{ events: FinalSettlementEvent[] }>(`/api/v1/final-settlement/cases/${caseId}/events`, {}, token);
  },
  submitFinalSettlementForApproval(token: string, caseId: string, note?: string | null) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}/submit-for-approval`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }, token);
  },
  approveFinalSettlement(token: string, caseId: string, note?: string | null) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}/approve`, { method: "POST", body: JSON.stringify({ note: note ?? null }) }, token);
  },
  rejectFinalSettlement(token: string, caseId: string, reason: string) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  sendBackFinalSettlement(token: string, caseId: string, reason: string) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}/send-back`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  finalizeFinalSettlement(token: string, caseId: string, note?: string | null) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}/finalize`, { method: "POST", body: JSON.stringify({ reason: note ?? null }) }, token);
  },
  unlockFinalSettlement(token: string, caseId: string, reason: string) {
    return request<{ case: FinalSettlementCase }>(`/api/v1/final-settlement/cases/${caseId}/unlock-finalized`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  listFinalSettlementPaymentRegister(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ payments: FinalSettlementPaymentRegister[] }>(`/api/v1/final-settlement/payment-register${query(filters)}`, {}, token);
  },
  getFinalSettlementPaymentRegister(token: string, caseId: string) {
    return request<{ payment: FinalSettlementPaymentRegister | null }>(`/api/v1/final-settlement/cases/${caseId}/payment-register`, {}, token);
  },
  prepareFinalSettlementPaymentRegister(token: string, caseId: string) {
    return request<{ payment: FinalSettlementPaymentRegister }>(`/api/v1/final-settlement/cases/${caseId}/prepare-payment-register`, { method: "POST" }, token);
  },
  confirmManualFinalSettlementPayment(token: string, paymentId: string, input: { confirmation_reference: string; confirmation_note: string }) {
    return request<{ payment: FinalSettlementPaymentRegister }>(`/api/v1/final-settlement/payment-register/${paymentId}/confirm-manual-paid`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  cancelFinalSettlementPayment(token: string, paymentId: string, reason: string) {
    return request<{ payment: FinalSettlementPaymentRegister }>(`/api/v1/final-settlement/payment-register/${paymentId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, token);
  },
  getFinalSettlementReportsSummary(token: string) {
    return request<Record<string, unknown>>("/api/v1/final-settlement/reports/summary", {}, token);
  },
  getFinalSettlementDepartmentTotals(token: string) {
    return request<{ rows: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/department-totals", {}, token);
  },
  getFinalSettlementWorksiteTotals(token: string) {
    return request<{ rows: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/worksite-totals", {}, token);
  },
  getFinalSettlementAssetUniformDeductions(token: string) {
    return request<{ rows: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/asset-uniform-deductions", {}, token);
  },
  getFinalSettlementLeaveSettlementReport(token: string) {
    return request<{ rows: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/leave-settlement", {}, token);
  },
  getFinalSettlementAdvanceDeductions(token: string) {
    return request<{ rows: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/advance-deductions", {}, token);
  },
  getFinalSettlementBankLoanSettlementReport(token: string) {
    return request<{ bank_loan_settlement: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/bank-loan-settlement", {}, token);
  },
  getFinalSettlementPensionSettlementReport(token: string) {
    return request<{ pension_settlement: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/pension-settlement", {}, token);
  },
  getFinalSettlementCustomDeductionSettlementReport(token: string) {
    return request<{ custom_deduction_settlement: Record<string, unknown>[] }>("/api/v1/final-settlement/reports/custom-deduction-settlement", {}, token);
  },
  getFinalSettlementNetSummary(token: string) {
    return request<{ summary: Record<string, unknown> }>("/api/v1/final-settlement/reports/net-settlement-summary", {}, token);
  },
  listEmployeeFinalSettlements(token: string, employeeId: string) {
    return request<{ cases: FinalSettlementCase[] }>(`/api/v1/employees/${employeeId}/final-settlements`, {}, token);
  },
  getEmployeeFinalSettlementSummary(token: string, employeeId: string) {
    return request<{ summary: FinalSettlementSummary | null }>(`/api/v1/employees/${employeeId}/final-settlement/summary`, {}, token);
  },
  listAssetCategories(token: string) {
    return request<{ categories: AssetCategory[] }>("/api/v1/assets/categories", {}, token);
  },
  getAssetUniformSettings(token: string) {
    return request<{ settings: AssetUniformSettings }>("/api/v1/assets/settings", {}, token);
  },
  updateAssetUniformSettings(token: string, input: Partial<AssetUniformSettings>) {
    return request<{ settings: AssetUniformSettings }>("/api/v1/assets/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
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
  archiveAssetCategory(token: string, id: string, reason?: string | null) {
    return request<{ archived: boolean }>(`/api/v1/assets/categories/${id}/archive`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
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
  assetAssignmentAdvancedAction(token: string, id: string, action: "approve" | "return" | "transfer" | "mark-damaged" | "mark-lost" | "apply-deduction" | "waive" | "cancel" | "link-document", input?: Record<string, unknown>) {
    return request<{ assignment: AssetAssignment; deduction?: Record<string, unknown>; new_assignment?: AssetAssignment }>(`/api/v1/assets/assignments/${id}/${action}`, { method: "POST", body: JSON.stringify(input ?? {}) }, token);
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
  getEmployeeAssetUniformSummary(token: string, employeeId: string) {
    return request<EmployeeAssetSummary>(`/api/v1/employees/${employeeId}/assets-uniforms/summary`, {}, token);
  },
  assignAssetToEmployee(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ assignment: AssetAssignment }>(`/api/v1/employees/${employeeId}/assets/assign`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listUniformTypes(token: string) {
    return request<{ types: UniformType[] }>("/api/v1/uniforms/types", {}, token);
  },
  createUniformType(token: string, input: Partial<UniformType>) {
    return request<{ type: UniformType }>("/api/v1/uniforms/types", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateUniformType(token: string, id: string, input: Partial<UniformType>) {
    return request<{ type: UniformType }>(`/api/v1/uniforms/types/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  archiveUniformType(token: string, id: string) {
    return request<{ archived: boolean }>(`/api/v1/uniforms/types/${id}/archive`, { method: "POST" }, token);
  },
  listUniformStock(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ stock: UniformStockItem[] }>(`/api/v1/uniforms/stock${query(filters)}`, {}, token);
  },
  createUniformStock(token: string, input: Partial<UniformStockItem>) {
    return request<{ stock_item: UniformStockItem }>("/api/v1/uniforms/stock", { method: "POST", body: JSON.stringify(input) }, token);
  },
  updateUniformStock(token: string, id: string, input: Partial<UniformStockItem>) {
    return request<{ stock_item: UniformStockItem }>(`/api/v1/uniforms/stock/${id}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listUniformAssignments(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ assignments: UniformAssignment[] }>(`/api/v1/uniforms/assignments${query(filters)}`, {}, token);
  },
  issueUniformAssignment(token: string, input: Record<string, unknown>) {
    return request<{ assignment: UniformAssignment }>("/api/v1/uniforms/assignments", { method: "POST", body: JSON.stringify(input) }, token);
  },
  issueEmployeeUniform(token: string, employeeId: string, input: Record<string, unknown>) {
    return request<{ assignment: UniformAssignment }>(`/api/v1/employees/${employeeId}/uniforms/issue`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  uniformAssignmentAction(token: string, id: string, action: "return" | "mark-damaged" | "mark-lost" | "apply-deduction" | "waive" | "link-document", input?: Record<string, unknown>) {
    return request<{ assignment: UniformAssignment; deduction?: Record<string, unknown> }>(`/api/v1/uniforms/assignments/${id}/${action}`, { method: "POST", body: JSON.stringify(input ?? {}) }, token);
  },
  listUniformAssignmentEvents(token: string, id: string) {
    return request<{ events: AssetUniformEvent[] }>(`/api/v1/uniforms/assignments/${id}/events`, {}, token);
  },
  listEmployeeUniformAssignments(token: string, employeeId: string) {
    return request<{ assignments: UniformAssignment[] }>(`/api/v1/employees/${employeeId}/uniforms`, {}, token);
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
  },
  getAdminSettingsHub(token: string) {
    return request<{ sections: Record<string, unknown>[]; modules: Record<string, unknown>[] }>("/api/v1/admin/settings-hub", {}, token);
  },
  getAdminSettingsHubStatus(token: string) {
    return request<{ status: Record<string, unknown> }>("/api/v1/admin/settings-hub/status", {}, token);
  },
  listAdminModules(token: string) {
    return request<{ modules: Record<string, unknown>[] }>("/api/v1/admin/modules", {}, token);
  },
  getAdminModuleDependencyCheck(token: string, moduleKey: string) {
    return request<{ dependency_check: Record<string, unknown> }>(`/api/v1/admin/modules/${moduleKey}/dependency-check`, {}, token);
  },
  updateAdminModule(token: string, moduleKey: string, input: Record<string, unknown>) {
    return request<{ module: Record<string, unknown> | null; warnings: Record<string, unknown>[] }>(`/api/v1/admin/modules/${moduleKey}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listAdminConsistencyChecks(token: string) {
    return request<{ checks: Record<string, unknown>[] }>("/api/v1/admin/consistency-checks", {}, token);
  },
  runAdminConsistencyChecks(token: string) {
    return request<{ checks: Record<string, unknown>[] }>("/api/v1/admin/consistency-checks/run", { method: "POST" }, token);
  },
  listAdminAuditLogs(token: string, filters?: Record<string, string | number | boolean | null | undefined>) {
    return request<{ audit: Record<string, unknown>[] }>(`/api/v1/admin/audit-logs${query(filters)}`, {}, token);
  },
  listAdminSecurityEvents(token: string) {
    return request<{ events: Record<string, unknown>[] }>("/api/v1/admin/security-events", {}, token);
  },
  listPermissionRisks(token: string) {
    return request<{ findings: Record<string, unknown>[] }>("/api/v1/admin/permission-risks", {}, token);
  },
  runPermissionRisks(token: string) {
    return request<{ findings: Record<string, unknown>[] }>("/api/v1/admin/permission-risks/run", { method: "POST" }, token);
  },
  permissionRiskAction(token: string, findingId: string, action: "acknowledge" | "resolve" | "dismiss", reason?: string | null) {
    return request<{ updated: boolean }>(`/api/v1/admin/permission-risks/${findingId}/${action}`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  getAccessScopeReview(token: string) {
    return request<{ review: Record<string, unknown>[] }>("/api/v1/admin/access-scope-review", {}, token);
  },
  getAdminSecuritySettings(token: string) {
    return request<{ settings: Record<string, unknown> | null }>("/api/v1/admin/security-settings", {}, token);
  },
  updateAdminSecuritySettings(token: string, input: Record<string, unknown>) {
    return request<{ settings: Record<string, unknown> | null }>("/api/v1/admin/security-settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getSystemHealth(token: string) {
    return request<{ health: Record<string, unknown> }>("/api/v1/admin/system-health", {}, token);
  },
  refreshSystemHealth(token: string) {
    return request<{ health: Record<string, unknown> }>("/api/v1/admin/system-health/refresh", { method: "POST" }, token);
  },
  getRemoteSchemaToolsStatus(token: string) {
    return request<{ remote_schema_tools: Record<string, unknown> }>("/api/v1/admin/remote-schema-tools", {}, token);
  },
  getDataRetentionSettings(token: string) {
    return request<{ settings: Record<string, unknown> | null }>("/api/v1/admin/data-retention-settings", {}, token);
  },
  updateDataRetentionSettings(token: string, input: Record<string, unknown>) {
    return request<{ settings: Record<string, unknown> | null }>("/api/v1/admin/data-retention-settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getExportSecuritySettings(token: string) {
    return request<{ settings: Record<string, unknown> | null }>("/api/v1/admin/export-security-settings", {}, token);
  },
  updateExportSecuritySettings(token: string, input: Record<string, unknown>) {
    return request<{ settings: Record<string, unknown> | null }>("/api/v1/admin/export-security-settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getProductionReadiness(token: string) {
    return request<{ checks: Record<string, unknown>[] }>("/api/v1/admin/production-readiness", {}, token);
  },
  runProductionReadiness(token: string) {
    return request<{ checks: Record<string, unknown>[] }>("/api/v1/admin/production-readiness/run", { method: "POST" }, token);
  },
  getEnvironmentSafety(token: string) {
    return request<{ environment_safety: Record<string, unknown> }>("/api/v1/admin/environment-safety", {}, token);
  },
  runEnvironmentSafety(token: string) {
    return request<{ environment_safety: Record<string, unknown> }>("/api/v1/admin/environment-safety/check", { method: "POST" }, token);
  },
  listAdminSystemAlerts(token: string) {
    return request<{ alerts: Record<string, unknown>[] }>("/api/v1/admin/system-alerts", {}, token);
  },
  refreshAdminSystemAlerts(token: string) {
    return request<{ alerts: Record<string, unknown>[] }>("/api/v1/admin/system-alerts/refresh", { method: "POST" }, token);
  },
  adminSystemAlertAction(token: string, alertId: string, action: "acknowledge" | "resolve" | "dismiss") {
    return request<{ updated: boolean }>(`/api/v1/admin/system-alerts/${alertId}/${action}`, { method: "POST" }, token);
  },
  listDataImportTypes(token: string) {
    return request<{ types: Record<string, unknown>[] }>("/api/v1/data-import/types", {}, token);
  },
  listDataImportTemplates(token: string) {
    return request<{ templates: Record<string, unknown>[] }>("/api/v1/data-import/templates", {}, token);
  },
  getDataImportTemplate(token: string, importType: string) {
    return request<{ template: Record<string, unknown> }>(`/api/v1/data-import/templates/${importType}`, {}, token);
  },
  downloadDataImportTemplate(token: string, importType: string) {
    return blobRequest(`/api/v1/data-import/templates/${importType}/download`, token);
  },
  listDataImportBatches(token: string) {
    return request<{ batches: Record<string, unknown>[] }>("/api/v1/data-import/batches", {}, token);
  },
  getDataImportBatch(token: string, batchId: string) {
    return request<{ batch: Record<string, unknown>; rows: Record<string, unknown>[]; rollback_placeholder: string }>(`/api/v1/data-import/batches/${batchId}`, {}, token);
  },
  createDataImportBatch(token: string, input: Record<string, unknown>) {
    return request<{ batch: Record<string, unknown> }>("/api/v1/data-import/batches", { method: "POST", body: JSON.stringify(input) }, token);
  },
  validateDataImportBatch(token: string, batchId: string) {
    return request<{ batch: Record<string, unknown> }>(`/api/v1/data-import/batches/${batchId}/validate`, { method: "POST" }, token);
  },
  getDataImportValidationPreview(token: string, batchId: string) {
    return request<{ preview: Record<string, unknown> }>(`/api/v1/data-import/batches/${batchId}/validation-preview`, {}, token);
  },
  applyDataImportBatch(token: string, batchId: string, input: Record<string, unknown>) {
    return request<{ batch: Record<string, unknown> }>(`/api/v1/data-import/batches/${batchId}/apply`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  cancelDataImportBatch(token: string, batchId: string, reason?: string | null) {
    return request<{ batch: Record<string, unknown> }>(`/api/v1/data-import/batches/${batchId}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }, token);
  },
  listDataImportErrors(token: string, batchId: string) {
    return request<{ errors: Record<string, unknown>[] }>(`/api/v1/data-import/batches/${batchId}/errors`, {}, token);
  },
  listDataImportResults(token: string, batchId: string) {
    return request<{ results: Record<string, unknown>[] }>(`/api/v1/data-import/batches/${batchId}/results`, {}, token);
  },
  downloadDataImportErrors(token: string, batchId: string) {
    return blobRequest(`/api/v1/data-import/batches/${batchId}/errors/download`, token);
  },
  listDataExportTypes(token: string) {
    return request<{ types: Record<string, unknown>[] }>("/api/v1/data-export/types", {}, token);
  },
  runDataExport(token: string, exportType: string, input: Record<string, unknown>) {
    return request<{ export: Record<string, unknown> }>(`/api/v1/data-export/${exportType}/run`, { method: "POST", body: JSON.stringify(input) }, token);
  },
  listDataExportHistory(token: string) {
    return request<{ history: Record<string, unknown>[] }>("/api/v1/data-export/history", {}, token);
  },
  getDataTransferSettings(token: string) {
    return request<{ settings: Record<string, unknown> }>("/api/v1/admin/data-transfer/settings", {}, token);
  },
  updateDataTransferSettings(token: string, input: Record<string, unknown>) {
    return request<{ settings: Record<string, unknown> }>("/api/v1/admin/data-transfer/settings", { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  getBackupReadiness(token: string) {
    return request<{ checklist: Record<string, unknown>[]; records: Record<string, unknown>[] }>("/api/v1/admin/backup-readiness", {}, token);
  },
  recordBackupReadiness(token: string, input: Record<string, unknown>) {
    return request<{ id: string }>("/api/v1/admin/backup-readiness/records", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getMigrationReadiness(token: string) {
    return request<{ checklist: string[]; warning: string }>("/api/v1/admin/migration-readiness", {}, token);
  },
  recordMigrationReadinessCheck(token: string, input: Record<string, unknown>) {
    return request<{ recorded: boolean }>("/api/v1/admin/migration-readiness/record-check", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getRemoteD1ApplyGuide(token: string) {
    return request<{ warning: string; steps: Record<string, unknown>[] }>("/api/v1/admin/remote-d1-apply-guide", {}, token);
  },
  getQaTestMatrix(token: string) {
    return request<{ items: Record<string, unknown>[] }>("/api/v1/admin/qa-test-matrix", {}, token);
  },
  seedQaTestMatrix(token: string) {
    return request<{ seeded: boolean }>("/api/v1/admin/qa-test-matrix/seed-defaults", { method: "POST" }, token);
  },
  updateQaTestMatrixItem(token: string, itemId: string, input: Record<string, unknown>) {
    return request<{ updated: boolean }>(`/api/v1/admin/qa-test-matrix/${itemId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
  },
  listSmokeTests(token: string) {
    return request<{ runs: Record<string, unknown>[]; cli_command: string; note: string }>("/api/v1/admin/smoke-tests", {}, token);
  },
  recordSmokeTestResult(token: string, input: Record<string, unknown>) {
    return request<{ id: string }>("/api/v1/admin/smoke-tests/record-result", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getDeploymentReadiness(token: string) {
    return request<{ latest: Record<string, unknown> | null; records: Record<string, unknown>[]; rollback_guidance: string }>("/api/v1/admin/deployment-readiness", {}, token);
  },
  recordDeploymentReadiness(token: string, input: Record<string, unknown>) {
    return request<{ id: string }>("/api/v1/admin/deployment-readiness/record", { method: "POST", body: JSON.stringify(input) }, token);
  },
  getAdminReport(token: string, key: string) {
    return request<{ report: { key: string; rows: Record<string, unknown>[] } }>(`/api/v1/reports/admin/${key}`, {}, token);
  }
};
