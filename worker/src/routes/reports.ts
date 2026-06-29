import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDateRange, validateOrganizationCascade, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { disabledModuleResponse, isOperationalModuleEnabled } from "../utils/module-enforcement";

type ReportRow = Record<string, unknown>;

const REPORT_FILE_PREFIX = "omnicore-hr";

interface ReportConfig {
  label: string;
  group: string;
  module: string;
  moduleViewPermissions: string[];
  moduleExportPermissions: string[];
  sensitivePermissions?: string[];
  columns: string[];
}

const basePermissions = {
  payroll: ["reports.payroll.view", "payroll.reports.view", "payroll.view"],
  pension: ["reports.pension.view", "payroll.pension_contributions.view", "payroll.reports.view", "payroll.view"],
  bankLoans: ["reports.bank_loans.view", "payroll.bank_loan_payments.view", "payroll.bank_loans.view", "payroll.reports.view", "payroll.view"],
  customDeductions: ["reports.custom_deductions.view", "payroll.custom_deduction_reports.view", "payroll.employee_custom_deductions.view", "payroll.reports.view", "payroll.view"],
  finalSettlement: ["reports.final_settlement.view", "final_settlement.reports.view", "final_settlement.view"],
  variance: ["reports.attendance_variance.view", "reports.leave_payroll.view", "reports.roster_payroll.view", "payroll.reports.view", "payroll.view"],
  paymentRegister: ["reports.payment_register.view", "payroll.payment_register.view", "payroll.reports.view", "payroll.view"],
  contracts: ["reports.contracts.view", "contracts.view", "employees.contracts.view"]
};

const payrollColumns = ["period", "run_no", "employee_no", "employee_name", "department", "location", "basic_salary", "gross_earnings", "total_deductions", "employee_pension", "bank_loan_deductions", "custom_deductions", "advances", "net_salary", "payment_method", "payment_status", "payroll_status", "warnings", "finalized_date", "confirmed_date"];
const pensionColumns = ["period", "employee_no", "employee_name", "department", "location", "pension_scheme", "pensionable_wage", "employee_contribution_percent", "employee_contribution_amount", "employer_contribution_percent", "employer_contribution_amount", "voluntary_contribution_amount", "total_contribution", "remittance_status", "remittance_reference", "warnings"];
const bankLoanColumns = ["period", "bank", "employee_no", "employee_name", "department", "location", "loan_reference", "scheduled_installment", "deducted_amount", "shortfall_amount", "skipped_amount", "payment_status", "minimum_net_salary_protection_status", "direct_bank_collection_status", "bank_notification_status", "bank_notification_reference", "confirmation_note", "confirmed_at", "eligibility_status", "warnings"];
const customDeductionColumns = ["period", "employee_no", "employee_name", "department", "location", "deduction_template", "category", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance", "installment_number", "status", "approval_status", "final_settlement_inclusion", "warnings"];
const finalSettlementColumns = ["settlement_number", "employee_no", "employee_name", "department", "location", "exit_type", "exit_date", "last_working_day", "settlement_status", "total_earnings", "total_deductions", "net_settlement_amount", "payment_direction", "payment_status", "clearance_status", "approval_status", "finalized_date", "warnings"];
const varianceColumns = ["period", "employee_no", "employee_name", "department", "location", "roster_expected_days", "roster_expected_minutes", "attendance_actual_days", "attendance_actual_minutes", "absent_days", "late_count", "early_leave_count", "leave_days", "unpaid_leave_days", "payroll_impact_amount", "warning_status", "approval_or_correction_status"];
const paymentRegisterColumns = ["period", "employee_no", "employee_name", "payment_method", "payment_institution", "masked_account_or_cash_details", "net_salary", "payment_status", "prepared_date", "confirmed_date", "confirmation_reference", "confirmation_note", "settlement_or_payment_direction"];
const contractColumns = ["employee_no", "employee_name", "department", "location", "position", "contract_number", "contract_type", "contract_status", "start_date", "end_date", "days_until_expiry", "probation_status", "confirmation_due_date", "renewal_status", "document_status", "warning_status"];
const attendanceDeviceColumns = ["employee_no", "employee_name", "department", "location", "device_name", "device_code", "biometric_user_id", "punch_time", "punch_type", "process_status", "source", "batch_number", "warning_status"];
const documentComplianceColumns = ["employee_no", "employee_name", "department", "location", "position", "compliance_status", "compliance_percent", "total_required_documents", "submitted_required_documents", "missing_required_documents", "expiring_documents", "urgent_expiring_documents", "expired_documents", "waived_required_documents"];
const documentRequirementColumns = ["employee_no", "employee_name", "department", "location", "position", "employee_type", "employment_type", "document_type", "category", "document_number", "expiry_date", "days_until_expiry", "requirement_status", "alert_status", "waiver_reason", "is_sensitive", "restricted"];
const documentRenewalColumns = ["renewal_case_number", "employee_no", "employee_name", "department", "location", "document_type", "case_type", "status", "priority", "current_expiry_date", "target_renewal_date", "due_date", "assigned_to", "completed_at", "cancelled_at"];
const documentWaiverColumns = ["employee_no", "employee_name", "department", "location", "document_type", "waiver_reason", "waiver_start_date", "waiver_end_date", "status", "approved_at", "cancelled_at"];
const approvalColumns = ["request_title", "module_key", "action_key", "entity_type", "entity_id", "employee_id", "workflow_name_snapshot", "status", "current_step_number", "submitted_at", "completed_at", "fallback_used"];
const approvalHistoryColumns = ["action", "module_key", "action_key", "entity_type", "entity_id", "actor_name_snapshot", "previous_status", "new_status", "reason", "created_at"];
const assetLifecycleColumns = ["employee_no", "employee_name", "department", "location", "category", "asset_code", "asset_name", "issued_date", "expected_return_date", "returned_date", "status", "assignment_status", "clearance_status", "condition_status", "deduction_amount", "custom_deduction_id"];
const uniformLifecycleColumns = ["employee_no", "employee_name", "department", "location", "uniform_type", "size_label", "quantity_issued", "quantity_returned", "quantity_damaged", "quantity_lost", "issued_date", "expected_return_date", "returned_date", "assignment_status", "clearance_status", "deduction_amount", "custom_deduction_id"];
const onboardingColumns = ["case_number", "employee_no", "employee_name", "department", "location", "position", "onboarding_status", "activation_status", "due_date", "assigned_owner", "created_at", "activated_at", "blockers"];
const offboardingColumns = ["case_number", "employee_no", "employee_name", "department", "location", "position", "exit_type", "last_working_day", "offboarding_status", "finalization_status", "due_date", "assigned_owner", "created_at", "finalized_at", "blockers"];
const lifecycleEventColumns = ["employee_no", "employee_name", "case_type", "case_id", "action", "previous_status", "new_status", "actor_name_snapshot", "reason", "created_at"];
const lifecycleSlaColumns = ["metric", "scope", "open_cases", "overdue_cases", "completed_cases", "average_days_placeholder"];

const reportConfigs: Record<string, ReportConfig> = {
  employees: {
    label: "Employee reports",
    group: "Core",
    module: "employees",
    moduleViewPermissions: ["employees.view"],
    moduleExportPermissions: ["employees.view"],
    columns: ["employee_no", "employee_name", "status", "department", "position", "location", "employee_type", "employment_type", "joining_date", "created_at"]
  },
  documents: {
    label: "Document reports",
    group: "Core",
    module: "documents",
    moduleViewPermissions: ["documents.reports.view", "documents.view"],
    moduleExportPermissions: ["documents.reports.export"],
    sensitivePermissions: ["documents.sensitive.view", "documents.sensitive.download"],
    columns: ["employee_no", "employee_name", "document_type", "category", "document_number", "issue_date", "expiry_date", "display_status", "stored_status", "is_sensitive", "restricted"]
  },
  "documents/compliance-summary": {
    label: "Document Compliance Summary",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view", "documents.registry.sensitive.view"],
    columns: documentComplianceColumns
  },
  "onboarding/summary": {
    label: "Onboarding Case Summary",
    group: "Lifecycle Reports",
    module: "onboarding",
    moduleViewPermissions: ["reports.onboarding.view", "onboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.onboarding.view"],
    columns: onboardingColumns
  },
  "onboarding/overdue-tasks": {
    label: "Onboarding Overdue Tasks",
    group: "Lifecycle Reports",
    module: "onboarding",
    moduleViewPermissions: ["reports.onboarding.view", "onboarding.tasks.view"],
    moduleExportPermissions: ["reports.export", "reports.onboarding.view"],
    columns: ["case_number", "employee_no", "employee_name", "task_name", "task_group", "task_status", "due_date", "assigned_to"]
  },
  "onboarding/blocked": {
    label: "Onboarding Blocked Employees",
    group: "Lifecycle Reports",
    module: "onboarding",
    moduleViewPermissions: ["reports.onboarding.view", "onboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.onboarding.view"],
    columns: onboardingColumns
  },
  "onboarding/completed": {
    label: "Onboarding Completed This Month",
    group: "Lifecycle Reports",
    module: "onboarding",
    moduleViewPermissions: ["reports.onboarding.view", "onboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.onboarding.view"],
    columns: onboardingColumns
  },
  "onboarding/by-department": {
    label: "Onboarding by Department",
    group: "Lifecycle Reports",
    module: "onboarding",
    moduleViewPermissions: ["reports.onboarding.view", "onboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.onboarding.view"],
    columns: ["department", "total_cases", "blocked_cases", "activated_cases"]
  },
  "onboarding/by-worksite": {
    label: "Onboarding by Worksite/Location",
    group: "Lifecycle Reports",
    module: "onboarding",
    moduleViewPermissions: ["reports.onboarding.view", "onboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.onboarding.view"],
    columns: ["location", "total_cases", "blocked_cases", "activated_cases"]
  },
  "onboarding/overrides": {
    label: "Onboarding Activation Override Report",
    group: "Lifecycle Reports",
    module: "onboarding",
    moduleViewPermissions: ["reports.onboarding.view", "onboarding.activation.view"],
    moduleExportPermissions: ["reports.export", "reports.onboarding.view"],
    columns: onboardingColumns
  },
  "offboarding/summary": {
    label: "Offboarding Case Summary",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "offboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: offboardingColumns
  },
  "offboarding/overdue-tasks": {
    label: "Offboarding Overdue Tasks",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "offboarding.tasks.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: ["case_number", "employee_no", "employee_name", "task_name", "task_group", "task_status", "due_date", "assigned_to"]
  },
  "offboarding/by-exit-type": {
    label: "Exiting Employees by Exit Type",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "offboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: ["exit_type", "total_cases", "pending_cases", "completed_cases"]
  },
  "offboarding/pending-clearance": {
    label: "Pending Clearance",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "offboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: offboardingColumns
  },
  "offboarding/pending-final-settlement": {
    label: "Pending Final Settlement",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "final_settlement.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: offboardingColumns
  },
  "offboarding/pending-payroll-check": {
    label: "Pending Payroll Final Check",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "payroll.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: offboardingColumns
  },
  "offboarding/pending-access-revocation": {
    label: "Pending Access Revocation",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "users.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: offboardingColumns
  },
  "offboarding/completed": {
    label: "Completed Exits",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "offboarding.cases.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: offboardingColumns
  },
  "offboarding/overrides": {
    label: "Offboarding Override Report",
    group: "Lifecycle Reports",
    module: "offboarding",
    moduleViewPermissions: ["reports.offboarding.view", "offboarding.finalization.view"],
    moduleExportPermissions: ["reports.export", "reports.offboarding.view"],
    columns: offboardingColumns
  },
  "lifecycle/events": {
    label: "Lifecycle Events Report",
    group: "Lifecycle Reports",
    module: "lifecycle",
    moduleViewPermissions: ["reports.lifecycle.view", "lifecycle.events.view"],
    moduleExportPermissions: ["reports.export", "reports.lifecycle.view"],
    sensitivePermissions: ["reports.lifecycle.sensitive.view", "lifecycle.events.sensitive.view"],
    columns: lifecycleEventColumns
  },
  "lifecycle/sla-placeholder": {
    label: "Onboarding/Offboarding SLA Placeholder",
    group: "Lifecycle Reports",
    module: "lifecycle",
    moduleViewPermissions: ["reports.lifecycle.view", "lifecycle.events.view"],
    moduleExportPermissions: ["reports.export", "reports.lifecycle.view"],
    columns: lifecycleSlaColumns
  },
  "documents/missing-required": {
    label: "Missing Required Documents",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view", "documents.registry.sensitive.view"],
    columns: documentRequirementColumns
  },
  "documents/expiring": {
    label: "Expiring Documents",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view", "documents.registry.sensitive.view"],
    columns: documentRequirementColumns
  },
  "documents/expired": {
    label: "Expired Documents",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view", "documents.registry.sensitive.view"],
    columns: documentRequirementColumns
  },
  "documents/renewal-cases": {
    label: "Document Renewal Cases",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.renewal_cases.view", "documents.compliance.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view"],
    columns: documentRenewalColumns
  },
  "documents/waivers": {
    label: "Document Requirement Waivers",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.waivers.view", "documents.compliance.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view"],
    columns: documentWaiverColumns
  },
  "documents/by-department": {
    label: "Document Compliance by Department",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    columns: ["department", "employee_count", "missing_required_documents", "expiring_documents", "urgent_expiring_documents", "expired_documents", "average_compliance_percent"]
  },
  "documents/by-worksite": {
    label: "Document Compliance by Worksite",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    columns: ["location", "employee_count", "missing_required_documents", "expiring_documents", "urgent_expiring_documents", "expired_documents", "average_compliance_percent"]
  },
  "documents/foreign-compliance": {
    label: "Foreign Employee Document Compliance",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view"],
    columns: documentRequirementColumns
  },
  "documents/contract-compliance": {
    label: "Contract Document Compliance",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "contracts.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view"],
    columns: ["employee_no", "employee_name", "department", "location", "contract_number", "contract_status", "contract_end_date", "document_status", "document_type", "expiry_date", "warning_status"]
  },
  "documents/medical-insurance-expiry": {
    label: "Medical and Insurance Expiry",
    group: "Document Compliance Reports",
    module: "documents",
    moduleViewPermissions: ["reports.documents.view", "documents.compliance.view", "documents.view"],
    moduleExportPermissions: ["reports.documents.export", "documents.reports.export"],
    sensitivePermissions: ["reports.documents.sensitive.view", "documents.sensitive.view"],
    columns: documentRequirementColumns
  },
  "approvals/pending": {
    label: "Approval Pending Report",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.reports.view", "approvals.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    sensitivePermissions: ["reports.approvals.sensitive.view"],
    columns: approvalColumns
  },
  "approvals/overdue": {
    label: "Approval Overdue Report",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.overdue.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: [...approvalColumns, "due_at"]
  },
  "approvals/history": {
    label: "Approval Decision History",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.reports.view", "approvals.timeline.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    sensitivePermissions: ["reports.approvals.sensitive.view"],
    columns: approvalHistoryColumns
  },
  "approvals/by-module": {
    label: "Approval by Module",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: ["module_key", "action_key", "status", "count"]
  },
  "approvals/by-department": {
    label: "Approval by Department",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: ["department", "status", "count"]
  },
  "approvals/by-worksite": {
    label: "Approval by Worksite/Location",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: ["location", "status", "count"]
  },
  "approvals/escalations": {
    label: "Escalation Report",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.escalations.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: approvalHistoryColumns
  },
  "approvals/delegations": {
    label: "Delegation Report",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.delegations.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: ["delegator_user_id", "delegate_user_id", "module_key", "action_key", "start_at", "end_at", "status", "reason"]
  },
  "approvals/workflow-usage": {
    label: "Workflow Usage Report",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: ["workflow_code_snapshot", "workflow_name_snapshot", "status", "count"]
  },
  "approvals/turnaround-time": {
    label: "Approval Turnaround Time Report",
    group: "Approval Reports",
    module: "approvals",
    moduleViewPermissions: ["reports.approvals.view", "approvals.reports.view"],
    moduleExportPermissions: ["reports.approvals.view", "reports.export"],
    columns: ["module_key", "action_key", "average_hours"]
  },
  attendance: {
    label: "Attendance reports",
    group: "Core",
    module: "attendance",
    moduleViewPermissions: ["attendance.reports.view", "attendance.view"],
    moduleExportPermissions: ["attendance.reports.export"],
    columns: ["attendance_date", "employee_no", "employee_name", "department", "location", "status", "first_clock_in", "last_clock_out", "late_minutes", "missed_punch", "source"]
  },
  leave: {
    label: "Leave reports",
    group: "Core",
    module: "leave",
    moduleViewPermissions: ["leave.reports.view", "leave.view"],
    moduleExportPermissions: ["leave.reports.export"],
    columns: ["employee_no", "employee_name", "leave_type", "start_date", "end_date", "total_days", "status", "document_status", "submitted_at", "approved_at"]
  },
  payroll: {
    label: "Payroll reports",
    group: "Payroll Reports",
    module: "payroll",
    moduleViewPermissions: basePermissions.payroll,
    moduleExportPermissions: ["payroll.reports.export"],
    sensitivePermissions: ["reports.export.sensitive", "payroll.reports.sensitive.view", "payroll.results.sensitive.view"],
    columns: payrollColumns
  },
  roster: {
    label: "Roster reports",
    group: "Core",
    module: "roster",
    moduleViewPermissions: ["roster.reports.view", "roster.view"],
    moduleExportPermissions: ["roster.reports.export"],
    columns: ["roster_date", "employee_no", "employee_name", "department", "location", "shift", "status", "week_start_date", "period_status"]
  },
  assets: {
    label: "Assets and uniforms reports",
    group: "Core",
    module: "assets",
    moduleViewPermissions: ["assets.reports.view", "assets.view"],
    moduleExportPermissions: ["assets.reports.export"],
    columns: ["employee_no", "employee_name", "category", "asset_code", "asset_name", "issued_date", "expected_return_date", "returned_date", "status", "condition_status", "deduction_amount"]
  },
  "assets/assigned": { label: "Assigned Assets", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: assetLifecycleColumns },
  "assets/available": { label: "Available Assets", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: assetLifecycleColumns },
  "assets/damaged": { label: "Damaged Assets", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: assetLifecycleColumns },
  "assets/lost": { label: "Lost Assets", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: assetLifecycleColumns },
  "assets/history": { label: "Asset Lifecycle History", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: [...assetLifecycleColumns, "event_action", "event_reason", "event_created_at"] },
  "assets/by-employee": { label: "Assets by Employee", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: assetLifecycleColumns },
  "assets/by-department": { label: "Assets by Department", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: ["department", "assignment_count", "pending_clearance", "deduction_amount"] },
  "assets/by-worksite": { label: "Assets by Worksite", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: ["location", "assignment_count", "pending_clearance", "deduction_amount"] },
  "assets/pending-returns": { label: "Pending Asset Returns", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: assetLifecycleColumns },
  "assets/clearance": { label: "Asset Clearance", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.clearance.view", "assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: assetLifecycleColumns },
  "uniforms/issue-summary": { label: "Uniform Issue Summary", group: "Asset & Uniform Reports", module: "uniforms", moduleViewPermissions: ["uniforms.reports.view", "uniforms.view", "assets.view"], moduleExportPermissions: ["uniforms.reports.export", "assets.reports.export"], columns: uniformLifecycleColumns },
  "uniforms/stock": { label: "Uniform Stock", group: "Asset & Uniform Reports", module: "uniforms", moduleViewPermissions: ["uniforms.reports.view", "uniforms.stock.view", "uniforms.view"], moduleExportPermissions: ["uniforms.reports.export", "assets.reports.export"], columns: ["uniform_type", "size_label", "location", "total_quantity", "available_quantity", "issued_quantity", "damaged_quantity", "lost_quantity", "retired_quantity", "reorder_level", "status"] },
  "uniforms/damaged-lost": { label: "Damaged / Lost Uniforms", group: "Asset & Uniform Reports", module: "uniforms", moduleViewPermissions: ["uniforms.reports.view", "uniforms.view", "assets.view"], moduleExportPermissions: ["uniforms.reports.export", "assets.reports.export"], columns: uniformLifecycleColumns },
  "uniforms/clearance": { label: "Uniform Clearance", group: "Asset & Uniform Reports", module: "uniforms", moduleViewPermissions: ["uniforms.clearance.view", "uniforms.reports.view", "uniforms.view"], moduleExportPermissions: ["uniforms.reports.export", "assets.reports.export"], columns: uniformLifecycleColumns },
  "assets-uniforms/deductions": { label: "Asset / Uniform Deductions", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.deductions.manage", "assets.reports.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: ["employee_no", "employee_name", "department", "location", "source", "item_name", "assignment_status", "clearance_status", "deduction_amount", "custom_deduction_id"] },
  "assets-uniforms/final-settlement-impact": { label: "Asset / Uniform Final Settlement Impact", group: "Asset & Uniform Reports", module: "assets", moduleViewPermissions: ["assets.clearance.view", "assets.reports.view", "final_settlement.view", "assets.view"], moduleExportPermissions: ["assets.reports.export"], columns: ["employee_no", "employee_name", "department", "location", "source", "item_name", "assignment_status", "clearance_status", "deduction_amount", "custom_deduction_id"] },
  "attendance-devices/raw-logs": { label: "Attendance Device Raw Logs", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.raw_logs.view", "attendance.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], sensitivePermissions: ["reports.attendance_devices.sensitive.view"], columns: attendanceDeviceColumns },
  "attendance-devices/import-batches": { label: "Attendance Import Batches", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.import_batches.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: ["batch_number", "source", "device_name", "file_name", "status", "total_rows", "inserted_rows", "duplicate_rows", "unmatched_rows", "error_rows", "locked_warning_rows", "uploaded_at", "processed_at"] },
  "attendance-devices/unmatched": { label: "Unmatched Attendance Logs", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.unmatched_logs.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: attendanceDeviceColumns },
  "attendance-devices/duplicates": { label: "Duplicate Attendance Punches", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.raw_logs.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: attendanceDeviceColumns },
  "attendance-devices/import-errors": { label: "Attendance Import Errors", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.import_errors.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: ["batch_number", "file_name", "row_number", "error_code", "error_message", "status", "created_at"] },
  "attendance-devices/sync-status": { label: "Attendance Device Sync Status", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.device_diagnostics.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: ["device_name", "device_code", "vendor", "device_mode", "status", "health_status", "last_seen_at", "last_sync_at", "raw_log_count", "open_unmatched_count"] },
  "attendance-devices/warnings": { label: "Attendance Device Warnings", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.locked_warnings.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: ["employee_no", "employee_name", "department", "location", "attendance_date", "warning_type", "message", "status", "created_at"] },
  "attendance-devices/locked-day-imports": { label: "Locked-Day Import Warnings", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.locked_warnings.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: ["employee_no", "employee_name", "department", "location", "attendance_date", "warning_type", "message", "status", "created_at"] },
  "attendance-devices/biometric-mappings": { label: "Employee Biometric Mappings", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.biometric_mappings.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: ["employee_no", "employee_name", "department", "location", "device_name", "device_code", "biometric_user_id", "biometric_user_name", "external_employee_code", "mapping_source", "status"] },
  "attendance-devices/reconciliation": { label: "Attendance Device Reconciliation", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.raw_logs.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: attendanceDeviceColumns },
  "attendance-devices/night-shift-warnings": { label: "Night Shift Device Warnings", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.raw_logs.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: attendanceDeviceColumns },
  "attendance-devices/manual-logs": { label: "Manual Device Log Entries", group: "Attendance Device Reports", module: "attendance", moduleViewPermissions: ["reports.attendance_devices.view", "attendance.raw_logs.view"], moduleExportPermissions: ["reports.attendance_devices.export", "attendance.reports.export"], columns: attendanceDeviceColumns },
  audit: {
    label: "Audit reports",
    group: "Export History / Report Audit Logs",
    module: "audit",
    moduleViewPermissions: ["audit.view"],
    moduleExportPermissions: ["audit.export"],
    columns: ["created_at", "actor_name", "module", "action", "entity_type", "entity_id", "reason"]
  },
  "payroll/run-summary": { label: "Payroll Run Summary", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: payrollColumns },
  "payroll/period-summary": { label: "Payroll Period Summary", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: ["period", "employee_count", "gross_earnings", "total_deductions", "employee_pension", "bank_loan_deductions", "custom_deductions", "advances", "net_salary", "payroll_status", "warnings"] },
  "payroll/employee-history": { label: "Employee Payroll History", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: payrollColumns },
  "payroll/components": { label: "Payroll Components Summary", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: ["period", "run_no", "line_type", "category", "description", "source", "employee_count", "amount"] },
  "payroll/gross-to-net": { label: "Gross-to-Net Summary", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: payrollColumns },
  "payroll/adjustments": { label: "Payroll Adjustments Summary", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: ["employee_no", "employee_name", "period", "adjustment_type", "amount", "status", "reason", "created_at"] },
  "payroll/payment-status": { label: "Payroll Payment Status Summary", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.payment_register.sensitive.view"], columns: paymentRegisterColumns },
  "payroll/exceptions": { label: "Payroll Exception / Warning Report", group: "Payroll Reports", module: "payroll", moduleViewPermissions: basePermissions.payroll, moduleExportPermissions: ["payroll.reports.export"], columns: ["period", "run_no", "employee_no", "employee_name", "department", "location", "payroll_status", "warnings", "hold_reason", "missed_date_ranges"] },
  "pension/monthly-contributions": { label: "Monthly Pension Contribution Report", group: "Pension Reports", module: "payroll", moduleViewPermissions: basePermissions.pension, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.pension_profiles.sensitive.view"], columns: pensionColumns },
  "pension/remittance-summary": { label: "Pension Remittance Summary", group: "Pension Reports", module: "payroll", moduleViewPermissions: basePermissions.pension, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: ["period", "pension_scheme", "employee_count", "pensionable_wage", "employee_contribution_amount", "employer_contribution_amount", "voluntary_contribution_amount", "total_contribution", "remittance_status", "remittance_reference"] },
  "pension/employee-history": { label: "Employee Pension Contribution History", group: "Pension Reports", module: "payroll", moduleViewPermissions: basePermissions.pension, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.pension_profiles.sensitive.view"], columns: pensionColumns },
  "pension/exceptions": { label: "Pension Exceptions Report", group: "Pension Reports", module: "payroll", moduleViewPermissions: basePermissions.pension, moduleExportPermissions: ["payroll.reports.export"], columns: pensionColumns },
  "bank-loans/deduction-summary": { label: "Bank Loan Deduction Summary", group: "Bank Loan Reports", module: "payroll", moduleViewPermissions: basePermissions.bankLoans, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.bank_loans.sensitive.view"], columns: bankLoanColumns },
  "bank-loans/remittance-summary": { label: "Bank Loan Remittance Summary by Bank", group: "Bank Loan Reports", module: "payroll", moduleViewPermissions: basePermissions.bankLoans, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.bank_loans.sensitive.view"], columns: ["period", "bank", "employee_count", "scheduled_installment", "deducted_amount", "shortfall_amount", "skipped_amount", "direct_collection_total", "remittance_total", "bank_notification_status", "payment_status"] },
  "bank-loans/employee-history": { label: "Employee Bank Loan Payment History", group: "Bank Loan Reports", module: "payroll", moduleViewPermissions: basePermissions.bankLoans, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.bank_loans.sensitive.view"], columns: bankLoanColumns },
  "bank-loans/shortfalls": { label: "Bank Loan Shortfall Report", group: "Bank Loan Reports", module: "payroll", moduleViewPermissions: basePermissions.bankLoans, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.bank_loans.sensitive.view"], columns: bankLoanColumns },
  "bank-loans/direct-collection": { label: "Direct Bank Collection Report", group: "Bank Loan Reports", module: "payroll", moduleViewPermissions: basePermissions.bankLoans, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.bank_loans.sensitive.view"], columns: bankLoanColumns },
  "bank-loans/notification-pending": { label: "Bank Notification Pending Report", group: "Bank Loan Reports", module: "payroll", moduleViewPermissions: basePermissions.bankLoans, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.bank_loans.sensitive.view"], columns: bankLoanColumns },
  "bank-loans/cash-salary-eligibility": { label: "Cash Salary Loan Eligibility Warning Report", group: "Bank Loan Reports", module: "payroll", moduleViewPermissions: basePermissions.bankLoans, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.bank_loans.sensitive.view"], columns: bankLoanColumns },
  "custom-deductions/summary": { label: "Custom Deduction Summary", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.custom_deduction_reports.sensitive.view"], columns: customDeductionColumns },
  "custom-deductions/by-template": { label: "Custom Deduction by Template", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: ["deduction_template", "category", "assignment_count", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance"] },
  "custom-deductions/by-category": { label: "Custom Deduction by Category", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: ["category", "assignment_count", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance"] },
  "custom-deductions/by-department": { label: "Custom Deduction by Department", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: ["department", "assignment_count", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance"] },
  "custom-deductions/by-worksite": { label: "Custom Deduction by Worksite/Location", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: ["location", "assignment_count", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance"] },
  "custom-deductions/active": { label: "Active Employee Deductions", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: customDeductionColumns },
  "custom-deductions/remaining-balances": { label: "Deduction Installment Remaining Balance", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: customDeductionColumns },
  "custom-deductions/shortfalls": { label: "Custom Deduction Shortfall Report", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: customDeductionColumns },
  "custom-deductions/applications": { label: "Payroll Period Custom Deduction Applications", group: "Custom Deduction Reports", module: "payroll", moduleViewPermissions: basePermissions.customDeductions, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: customDeductionColumns },
  "final-settlement/summary": { label: "Final Settlement Summary", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/pending": { label: "Pending Settlements", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/ready-for-approval": { label: "Ready for Approval Settlements", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/finalized": { label: "Finalized Settlements", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/by-department": { label: "Settlement by Department", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: ["department", "case_count", "total_earnings", "total_deductions", "net_settlement_amount", "company_owes_employee_amount", "employee_owes_company_amount"] },
  "final-settlement/by-worksite": { label: "Settlement by Worksite/Location", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: ["location", "case_count", "total_earnings", "total_deductions", "net_settlement_amount", "company_owes_employee_amount", "employee_owes_company_amount"] },
  "final-settlement/leave-impact": { label: "Leave Payout / Deduction Summary", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/bank-loan-impact": { label: "Bank Loan Settlement Impact", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/pension-impact": { label: "Pension Settlement Impact", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/custom-deduction-impact": { label: "Custom Deduction Settlement Impact", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/asset-uniform-impact": { label: "Asset / Uniform Settlement Deductions", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "final-settlement/net-summary": { label: "Net Settlement Summary", group: "Final Settlement Reports", module: "final_settlement", moduleViewPermissions: basePermissions.finalSettlement, moduleExportPermissions: ["final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.reports.sensitive.view"], columns: finalSettlementColumns },
  "variance/attendance-payroll": { label: "Attendance Payroll Variance Report", group: "Attendance / Leave / Roster Payroll Variance Reports", module: "attendance", moduleViewPermissions: basePermissions.variance, moduleExportPermissions: ["payroll.reports.export", "attendance.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: varianceColumns },
  "variance/leave-payroll": { label: "Leave Payroll Impact Report", group: "Attendance / Leave / Roster Payroll Variance Reports", module: "leave", moduleViewPermissions: basePermissions.variance, moduleExportPermissions: ["payroll.reports.export", "leave.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: varianceColumns },
  "variance/roster-attendance": { label: "Roster vs Attendance Report", group: "Attendance / Leave / Roster Payroll Variance Reports", module: "roster", moduleViewPermissions: basePermissions.variance, moduleExportPermissions: ["payroll.reports.export", "roster.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: varianceColumns },
  "variance/late-early-absence": { label: "Late / Early / Absence Payroll Impact Report", group: "Attendance / Leave / Roster Payroll Variance Reports", module: "attendance", moduleViewPermissions: basePermissions.variance, moduleExportPermissions: ["payroll.reports.export", "attendance.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.results.sensitive.view"], columns: varianceColumns },
  "variance/pending-attendance-corrections": { label: "Pending Attendance Corrections Affecting Payroll", group: "Attendance / Leave / Roster Payroll Variance Reports", module: "attendance", moduleViewPermissions: basePermissions.variance, moduleExportPermissions: ["payroll.reports.export", "attendance.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: varianceColumns },
  "variance/pending-leave-approvals": { label: "Leave Pending Approval Affecting Payroll", group: "Attendance / Leave / Roster Payroll Variance Reports", module: "leave", moduleViewPermissions: basePermissions.variance, moduleExportPermissions: ["payroll.reports.export", "leave.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: varianceColumns },
  "variance/missing-roster-assignments": { label: "Roster Missing Assignment Affecting Payroll", group: "Attendance / Leave / Roster Payroll Variance Reports", module: "roster", moduleViewPermissions: basePermissions.variance, moduleExportPermissions: ["payroll.reports.export", "roster.reports.export"], sensitivePermissions: ["reports.export.sensitive"], columns: varianceColumns },
  "payment-register/salary-summary": { label: "Salary Payment Register Summary", group: "Payment Register Reports", module: "payroll", moduleViewPermissions: basePermissions.paymentRegister, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.payment_register.sensitive.view"], columns: paymentRegisterColumns },
  "payment-register/by-method": { label: "Salary Payment by Method", group: "Payment Register Reports", module: "payroll", moduleViewPermissions: basePermissions.paymentRegister, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.payment_register.sensitive.view"], columns: ["period", "payment_method", "payment_institution", "employee_count", "net_salary", "payment_status"] },
  "payment-register/cash": { label: "Cash Salary Payment Summary", group: "Payment Register Reports", module: "payroll", moduleViewPermissions: basePermissions.paymentRegister, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.payment_register.sensitive.view"], columns: paymentRegisterColumns },
  "payment-register/bank-transfer": { label: "Bank Transfer Salary Summary", group: "Payment Register Reports", module: "payroll", moduleViewPermissions: basePermissions.paymentRegister, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.payment_register.sensitive.view"], columns: paymentRegisterColumns },
  "payment-register/split-payments": { label: "Split Payment Summary", group: "Payment Register Reports", module: "payroll", moduleViewPermissions: basePermissions.paymentRegister, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.payment_register.sensitive.view"], columns: paymentRegisterColumns },
  "payment-register/final-settlement": { label: "Final Settlement Payment Register Summary", group: "Payment Register Reports", module: "final_settlement", moduleViewPermissions: basePermissions.paymentRegister.concat(basePermissions.finalSettlement), moduleExportPermissions: ["payroll.reports.export", "final_settlement.reports.view"], sensitivePermissions: ["reports.export.sensitive", "final_settlement.payment_register.sensitive.view"], columns: paymentRegisterColumns },
  "payment-register/manual-confirmations": { label: "Manual Payment Confirmation Report", group: "Payment Register Reports", module: "payroll", moduleViewPermissions: basePermissions.paymentRegister, moduleExportPermissions: ["payroll.reports.export"], sensitivePermissions: ["reports.export.sensitive", "payroll.payment_register.sensitive.view"], columns: paymentRegisterColumns },
  "contracts/active": { label: "Active Contracts", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], sensitivePermissions: ["reports.contracts.sensitive.view", "contracts.salary_terms.view"], columns: contractColumns },
  "contracts/expiring": { label: "Expiring Contracts", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], sensitivePermissions: ["reports.contracts.sensitive.view", "contracts.salary_terms.view"], columns: contractColumns },
  "contracts/expired": { label: "Expired Contracts", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], sensitivePermissions: ["reports.contracts.sensitive.view", "contracts.salary_terms.view"], columns: contractColumns },
  "contracts/missing": { label: "Missing Contract Report", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: contractColumns },
  "contracts/probation-due": { label: "Probation Due Report", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: contractColumns },
  "contracts/probation-confirmation": { label: "Probation Confirmation Report", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: contractColumns },
  "contracts/renewals-due": { label: "Contract Renewals Due", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: contractColumns },
  "contracts/renewals-completed": { label: "Contract Renewals Completed", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: contractColumns },
  "contracts/by-department": { label: "Contracts by Department", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: ["department", "contract_count", "active_count", "expiring_count", "expired_count", "probation_due_count"] },
  "contracts/by-worksite": { label: "Contracts by Worksite/Location", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: ["location", "contract_count", "active_count", "expiring_count", "expired_count", "probation_due_count"] },
  "contracts/salary-differences": { label: "Contract Salary vs Payroll Salary Difference Report", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], sensitivePermissions: ["reports.contracts.sensitive.view", "contracts.salary_terms.view", "payroll.results.sensitive.view"], columns: ["employee_no", "employee_name", "department", "location", "contract_number", "contract_salary", "payroll_salary", "difference_amount", "warning_status"] },
  "contracts/foreign-alignment-placeholder": { label: "Foreign Employee Contract / Visa / Work Permit Alignment Placeholder", group: "Contract Reports", module: "contracts", moduleViewPermissions: basePermissions.contracts, moduleExportPermissions: ["reports.export"], columns: ["employee_no", "employee_name", "employee_type", "contract_number", "contract_end_date", "visa_status", "work_permit_status", "warning_status"] }
};

export const reportRoutes = new Hono<AppBindings>();

reportRoutes.use("*", requireAuth);

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const userPermissions = c.get("currentUser").permissions;
  return permissions.some((permission) => userPermissions.includes(permission));
}

function canViewReport(c: Context<AppBindings>, config: ReportConfig) {
  return hasAny(c, ["reports.view"]) && hasAny(c, config.moduleViewPermissions);
}

function canExportReport(c: Context<AppBindings>, config: ReportConfig) {
  return hasAny(c, ["reports.export"]) && (config.moduleExportPermissions.length === 0 || hasAny(c, config.moduleExportPermissions));
}

function requireReportPermission(c: Context<AppBindings>, config: ReportConfig, action: "view" | "export" = "view") {
  if (action === "export") {
    if (!canViewReport(c, config) || !canExportReport(c, config)) return fail(c, 403, "REPORT_EXPORT_NOT_ALLOWED", "You do not have permission to export this report.");
  } else if (!canViewReport(c, config)) {
    return fail(c, 403, "REPORT_PERMISSION_DENIED", "You do not have permission to view this report.");
  }
  return null;
}

function filters(c: Context<AppBindings>) {
  return c.req.query() as Record<string, string | undefined>;
}

function addFilter(conditions: string[], bindings: unknown[], value: string | undefined, sql: string) {
  if (value) {
    conditions.push(sql);
    bindings.push(value);
  }
}

function addLikeFilter(conditions: string[], bindings: unknown[], value: string | undefined, columns: string[]) {
  if (!value) return;
  conditions.push(`(${columns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
  columns.forEach(() => bindings.push(`%${value}%`));
}

type ReportDateRange = { error: "REPORT_DATE_RANGE_INVALID" } | { date_from?: string; date_to?: string };

function parseReportDateRange(c: Context<AppBindings>): ReportDateRange {
  const f = filters(c);
  if (f.date_from && Number.isNaN(Date.parse(f.date_from))) return { error: "REPORT_DATE_RANGE_INVALID" as const };
  if (f.date_to && Number.isNaN(Date.parse(f.date_to))) return { error: "REPORT_DATE_RANGE_INVALID" as const };
  if (hasValidationErrors(validateDateRange({ start: f.date_from, end: f.date_to, startField: "date_from", endField: "date_to", label: "Report date to" }))) return { error: "REPORT_DATE_RANGE_INVALID" as const };
  return { date_from: f.date_from, date_to: f.date_to };
}

function parseReportPagination(c: Context<AppBindings>) {
  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, Number.parseInt(c.req.query("limit") ?? "100", 10) || 100));
  return { page, limit, offset: (page - 1) * limit };
}

function addPagination(sql: string, c: Context<AppBindings>) {
  const pagination = parseReportPagination(c);
  return { sql: `${sql} LIMIT ? OFFSET ?`, params: [pagination.limit, pagination.offset], pagination };
}

function whereClause(conditions: string[]) {
  return conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function generateCsvExport(columns: string[], rows: ReportRow[]) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
}

function csvResponse(filename: string, columns: string[], rows: ReportRow[]) {
  const csv = generateCsvExport(columns, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

function hasSensitiveReportPermission(c: Context<AppBindings>, config: ReportConfig) {
  return c.get("currentUser").is_owner || hasAny(c, ["reports.export.sensitive", ...(config.sensitivePermissions ?? [])]);
}

function maskValue(value: unknown) {
  if (value === null || value === undefined || value === "") return value;
  return "Restricted";
}

const sensitiveColumns = new Set([
  "basic_salary",
  "gross_earnings",
  "total_earnings",
  "total_deductions",
  "employee_pension",
  "bank_loan_deductions",
  "custom_deductions",
  "advances",
  "net_salary",
  "pensionable_wage",
  "employee_contribution_amount",
  "employer_contribution_amount",
  "voluntary_contribution_amount",
  "total_contribution",
  "loan_reference",
  "scheduled_installment",
  "deducted_amount",
  "shortfall_amount",
  "skipped_amount",
  "direct_collection_total",
  "remaining_balance",
  "net_settlement_amount",
  "company_owes_employee_amount",
  "employee_owes_company_amount",
  "contract_salary",
  "payroll_salary",
  "difference_amount",
  "payment_institution",
  "masked_account_or_cash_details",
  "confirmation_reference"
]);

function maskSensitiveReportFields(c: Context<AppBindings>, config: ReportConfig, rows: ReportRow[]) {
  if (hasSensitiveReportPermission(c, config)) return rows.map((row) => ({ ...row, restricted: false }));
  return rows.map((row) => {
    const masked: ReportRow = { ...row, restricted: true };
    for (const column of sensitiveColumns) {
      if (column in masked) masked[column] = maskValue(masked[column]);
    }
    if (Number(masked.is_sensitive ?? 0) === 1) {
      masked.document_type = "Restricted document";
      masked.category = "Restricted";
      masked.document_number = null;
    }
    return masked;
  });
}

async function reportModuleEnabled(c: Context<AppBindings>, config: ReportConfig) {
  return isOperationalModuleEnabled(c.env.DB, config.module);
}

async function requireReportModuleEnabled(c: Context<AppBindings>, config: ReportConfig) {
  return (await reportModuleEnabled(c, config)) ? null : disabledModuleResponse(c, config.module, config.label);
}

async function applyReportEmployeeScope(c: Context<AppBindings>, conditions: string[], bindings: unknown[], moduleKey: string, employeeAlias = "e", employeeColumn?: string) {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), moduleKey, "view", employeeAlias);
  conditions.push(employeeColumn ? `${employeeColumn} IN (SELECT ${employeeAlias}.id FROM employees ${employeeAlias} WHERE ${scope.sql})` : scope.sql);
  bindings.push(...scope.params);
  return scope.summary;
}

function addCommonEmployeeFilters(conditions: string[], bindings: unknown[], f: Record<string, string | undefined>, alias = "e") {
  addLikeFilter(conditions, bindings, f.search, [`${alias}.employee_no`, `${alias}.full_name`, `${alias}.display_name`]);
  addFilter(conditions, bindings, f.employee_number, `${alias}.employee_no = ?`);
  addFilter(conditions, bindings, f.department_id, `${alias}.primary_department_id = ?`);
  addFilter(conditions, bindings, f.position_id, `${alias}.primary_position_id = ?`);
  addFilter(conditions, bindings, f.location_id, `${alias}.primary_location_id = ?`);
  addFilter(conditions, bindings, f.employee_type, `${alias}.employee_type = ?`);
  addFilter(conditions, bindings, f.employment_type, `${alias}.employment_type = ?`);
}

function addPeriodFilters(conditions: string[], bindings: unknown[], f: Record<string, string | undefined>, periodAlias = "pp", runAlias = "pr") {
  addFilter(conditions, bindings, f.payroll_period_id, `${periodAlias}.id = ?`);
  addFilter(conditions, bindings, f.payroll_run_status, `${runAlias}.status = ?`);
  addFilter(conditions, bindings, f.payroll_run_id, `${runAlias}.id = ?`);
}

async function queryRows(c: Context<AppBindings>, sql: string, bindings: unknown[]) {
  const paginated = addPagination(sql, c);
  return {
    rows: (await c.env.DB.prepare(paginated.sql).bind(...bindings, ...paginated.params).all<ReportRow>()).results,
    pagination: paginated.pagination
  };
}

async function employeeReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "employees", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.status, "s.key = ?");
  if (f.date_from) {
    conditions.push("date(e.created_at) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(e.created_at) <= date(?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name, s.name AS status,
      d.name AS department, p.title AS position, l.name AS location,
      e.employee_type, e.employment_type, e.joining_date, e.created_at
    FROM employees e
    LEFT JOIN employee_statuses s ON s.id = e.status_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN positions p ON p.id = e.primary_position_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY e.created_at DESC`;
  return queryRows(c, sql, bindings);
}

async function documentReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "documents", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "dt.name", "ed.document_number"]);
  addFilter(conditions, bindings, f.document_type_id, "ed.document_type_id = ?");
  addFilter(conditions, bindings, f.category_id, "ed.category_id = ?");
  addFilter(conditions, bindings, f.status, "ed.status = ?");
  if (f.sensitive === "true" || f.sensitive === "false") {
    conditions.push("COALESCE(ed.is_sensitive, dt.is_sensitive, 0) = ?");
    bindings.push(f.sensitive === "true" ? 1 : 0);
  }
  if (f.date_from) {
    conditions.push("date(ed.expiry_date) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(ed.expiry_date) <= date(?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name,
      dt.name AS document_type, dc.name AS category, ed.document_number,
      ed.issue_date, ed.expiry_date,
      CASE
        WHEN ed.status <> 'ACTIVE' THEN ed.status
        WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) < date('now') THEN 'EXPIRED'
        WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) <= date('now', '+30 day') THEN 'EXPIRING_SOON'
        ELSE 'VALID'
      END AS display_status,
      ed.status AS stored_status,
      COALESCE(ed.is_sensitive, dt.is_sensitive, 0) AS is_sensitive
    FROM employee_documents ed
    JOIN employees e ON e.id = ed.employee_id
    JOIN document_types dt ON dt.id = ed.document_type_id
    LEFT JOIN document_categories dc ON dc.id = ed.category_id
    ${whereClause(conditions)}
    ORDER BY COALESCE(ed.expiry_date, ed.created_at) ASC`;
  return queryRows(c, sql, bindings);
}

async function getDocumentComplianceReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "documents", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");

  if (key === "documents/compliance-summary") {
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location, p.title AS position,
        COALESCE(s.compliance_status, 'NOT_REFRESHED') AS compliance_status,
        COALESCE(s.compliance_percent, 0) AS compliance_percent,
        COALESCE(s.total_required_documents, 0) AS total_required_documents,
        COALESCE(s.submitted_required_documents, 0) AS submitted_required_documents,
        COALESCE(s.missing_required_documents, 0) AS missing_required_documents,
        COALESCE(s.expiring_documents, 0) AS expiring_documents,
        COALESCE(s.urgent_expiring_documents, 0) AS urgent_expiring_documents,
        COALESCE(s.expired_documents, 0) AS expired_documents,
        COALESCE(s.waived_required_documents, 0) AS waived_required_documents
      FROM employees e
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN positions p ON p.id = e.primary_position_id
      LEFT JOIN employee_document_compliance_snapshots s ON s.employee_id = e.id
        AND s.snapshot_date = (SELECT MAX(snapshot_date) FROM employee_document_compliance_snapshots sx WHERE sx.employee_id = e.id)
      ${whereClause(conditions)}
      ORDER BY e.employee_no`;
    return queryRows(c, sql, bindings);
  }

  if (key === "documents/by-department" || key === "documents/by-worksite") {
    const groupColumn = key === "documents/by-department" ? "COALESCE(d.name, 'Unassigned')" : "COALESCE(l.name, 'Unassigned')";
    const label = key === "documents/by-department" ? "department" : "location";
    const sql = `SELECT ${groupColumn} AS ${label}, COUNT(DISTINCT e.id) AS employee_count,
        SUM(COALESCE(s.missing_required_documents, 0)) AS missing_required_documents,
        SUM(COALESCE(s.expiring_documents, 0)) AS expiring_documents,
        SUM(COALESCE(s.urgent_expiring_documents, 0)) AS urgent_expiring_documents,
        SUM(COALESCE(s.expired_documents, 0)) AS expired_documents,
        ROUND(AVG(COALESCE(s.compliance_percent, 0)), 2) AS average_compliance_percent
      FROM employees e
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN employee_document_compliance_snapshots s ON s.employee_id = e.id
        AND s.snapshot_date = (SELECT MAX(snapshot_date) FROM employee_document_compliance_snapshots sx WHERE sx.employee_id = e.id)
      ${whereClause(conditions)}
      GROUP BY ${groupColumn}
      ORDER BY ${groupColumn}`;
    return queryRows(c, sql, bindings);
  }

  if (key === "documents/missing-required" || key === "documents/foreign-compliance") {
    conditions.push("rr.is_active = 1");
    conditions.push("rr.is_required = 1");
    if (key === "documents/foreign-compliance") conditions.push("e.employee_type = 'FOREIGN'");
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location, p.title AS position,
        e.employee_type, e.employment_type, dt.name AS document_type, dc.name AS category, NULL AS document_number,
        NULL AS expiry_date, NULL AS days_until_expiry, 'MISSING_REQUIRED' AS requirement_status,
        COALESCE(a.status, 'OPEN') AS alert_status, NULL AS waiver_reason, dt.is_sensitive
      FROM document_required_rules rr
      JOIN document_types dt ON dt.id = rr.document_type_id AND dt.is_active = 1
      LEFT JOIN document_categories dc ON dc.id = dt.category_id
      JOIN employees e ON e.archived_at IS NULL
        AND (rr.employee_type IS NULL OR rr.employee_type = e.employee_type)
        AND (rr.employment_type IS NULL OR rr.employment_type = e.employment_type)
        AND (rr.department_id IS NULL OR rr.department_id = e.primary_department_id)
        AND (rr.position_id IS NULL OR rr.position_id = e.primary_position_id)
        AND (rr.location_id IS NULL OR rr.location_id = e.primary_location_id)
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN positions p ON p.id = e.primary_position_id
      LEFT JOIN document_expiry_alerts a ON a.employee_id = e.id AND a.document_type_id = dt.id AND a.alert_type = 'MISSING_REQUIRED' AND a.status IN ('OPEN', 'ACKNOWLEDGED')
      ${whereClause(conditions)}
        AND NOT EXISTS (SELECT 1 FROM employee_documents ed WHERE ed.employee_id = e.id AND ed.document_type_id = dt.id AND ed.status = 'ACTIVE')
        AND NOT EXISTS (
          SELECT 1 FROM document_requirement_waivers w
          WHERE w.employee_id = e.id AND w.document_type_id = dt.id AND w.status = 'ACTIVE'
            AND date(w.waiver_start_date) <= date('now') AND (w.waiver_end_date IS NULL OR date(w.waiver_end_date) >= date('now'))
        )
      ORDER BY e.employee_no, dt.name`;
    return queryRows(c, sql, bindings);
  }

  if (key === "documents/expiring" || key === "documents/expired" || key === "documents/medical-insurance-expiry") {
    addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "dt.name", "ed.document_number"]);
    const statusExpression = key === "documents/expired"
      ? "date(ed.expiry_date) < date('now')"
      : "date(ed.expiry_date) >= date('now') AND date(ed.expiry_date) <= date('now', '+' || COALESCE(dt.expiring_soon_days, 30) || ' days')";
    conditions.push("ed.status = 'ACTIVE'");
    conditions.push("ed.expiry_date IS NOT NULL");
    conditions.push(statusExpression);
    if (key === "documents/medical-insurance-expiry") conditions.push("dt.code IN ('MEDICAL_DOCUMENT', 'INSURANCE')");
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location, p.title AS position,
        e.employee_type, e.employment_type, dt.name AS document_type, dc.name AS category, ed.document_number,
        ed.expiry_date, CAST(julianday(ed.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry,
        CASE WHEN date(ed.expiry_date) < date('now') THEN 'EXPIRED' ELSE 'EXPIRING_SOON' END AS requirement_status,
        COALESCE(a.status, '-') AS alert_status, NULL AS waiver_reason, ed.is_sensitive
      FROM employee_documents ed
      JOIN employees e ON e.id = ed.employee_id
      JOIN document_types dt ON dt.id = ed.document_type_id
      LEFT JOIN document_categories dc ON dc.id = ed.category_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN positions p ON p.id = e.primary_position_id
      LEFT JOIN document_expiry_alerts a ON a.document_id = ed.id AND a.status IN ('OPEN', 'ACKNOWLEDGED')
      ${whereClause(conditions)}
      ORDER BY ed.expiry_date ASC`;
    return queryRows(c, sql, bindings);
  }

  if (key === "documents/renewal-cases") {
    addFilter(conditions, bindings, f.status, "rc.status = ?");
    const sql = `SELECT rc.renewal_case_number, e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        dt.name AS document_type, rc.case_type, rc.status, rc.priority, rc.current_expiry_date, rc.target_renewal_date, rc.due_date,
        u.name AS assigned_to, rc.completed_at, rc.cancelled_at
      FROM document_renewal_cases rc
      JOIN employees e ON e.id = rc.employee_id
      JOIN document_types dt ON dt.id = rc.document_type_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN users u ON u.id = rc.assigned_to_user_id
      ${whereClause(conditions)}
      ORDER BY COALESCE(rc.due_date, rc.created_at) ASC`;
    return queryRows(c, sql, bindings);
  }

  if (key === "documents/waivers") {
    addFilter(conditions, bindings, f.status, "w.status = ?");
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        dt.name AS document_type, w.waiver_reason, w.waiver_start_date, w.waiver_end_date, w.status, w.approved_at, w.cancelled_at
      FROM document_requirement_waivers w
      JOIN employees e ON e.id = w.employee_id
      JOIN document_types dt ON dt.id = w.document_type_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(conditions)}
      ORDER BY w.created_at DESC`;
    return queryRows(c, sql, bindings);
  }

  if (key === "documents/contract-compliance") {
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        ec.contract_number, ec.status AS contract_status, ec.contract_end_date,
        CASE WHEN ec.document_id IS NULL THEN 'MISSING' WHEN ed.status = 'ACTIVE' THEN 'LINKED' ELSE ed.status END AS document_status,
        dt.name AS document_type, ed.expiry_date,
        CASE
          WHEN ec.document_id IS NULL THEN 'DOCUMENT_MISSING'
          WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) < date('now') THEN 'DOCUMENT_EXPIRED'
          WHEN ed.expiry_date IS NOT NULL AND date(ed.expiry_date) <= date('now', '+30 days') THEN 'DOCUMENT_EXPIRING'
          ELSE 'OK'
        END AS warning_status
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      LEFT JOIN employee_documents ed ON ed.id = ec.document_id
      LEFT JOIN document_types dt ON dt.id = ed.document_type_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(conditions)}
      ORDER BY COALESCE(ec.contract_end_date, ec.created_at) ASC`;
    return queryRows(c, sql, bindings);
  }

  throw new Error("REPORT_NOT_FOUND");
}

async function attendanceReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "attendance", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.status || f.attendance_status, "a.status = ?");
  addFilter(conditions, bindings, f.source, "a.source = ?");
  if (f.missed_punch === "true") conditions.push("a.missed_punch = 1");
  if (f.late_only === "true") conditions.push("COALESCE(a.late_minutes, 0) > 0");
  if (f.early_checkout_only === "true") conditions.push("COALESCE(a.early_checkout_minutes, 0) > 0");
  if (f.payroll_impact === "true") conditions.push("(a.payroll_impact_status IS NOT NULL OR a.payroll_impact_json IS NOT NULL)");
  if (f.date_from) {
    conditions.push("a.attendance_date >= ?");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("a.attendance_date <= ?");
    bindings.push(f.date_to);
  }
  const sql = `SELECT a.attendance_date, e.employee_no, e.full_name AS employee_name,
      d.name AS department, l.name AS location, a.status, a.first_clock_in,
      a.last_clock_out, a.late_minutes, a.missed_punch, a.source
    FROM attendance_daily_records a
    JOIN employees e ON e.id = a.employee_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY a.attendance_date DESC`;
  return queryRows(c, sql, bindings);
}

async function getAttendanceDeviceReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (key === "attendance-devices/import-batches") {
    addFilter(conditions, bindings, f.status, "aib.status = ?");
    addFilter(conditions, bindings, f.device_id, "aib.attendance_device_id = ?");
    if (f.date_from) { conditions.push("date(aib.uploaded_at) >= date(?)"); bindings.push(f.date_from); }
    if (f.date_to) { conditions.push("date(aib.uploaded_at) <= date(?)"); bindings.push(f.date_to); }
    return queryRows(c, `SELECT aib.batch_number, aib.source, ad.name AS device_name, aib.file_name, aib.status,
        aib.total_rows, aib.inserted_rows, aib.duplicate_rows, aib.unmatched_rows, aib.error_rows,
        aib.locked_warning_rows, aib.uploaded_at, aib.processed_at
      FROM attendance_import_batches aib
      LEFT JOIN attendance_devices ad ON ad.id = aib.attendance_device_id
      ${whereClause(conditions)}
      ORDER BY aib.uploaded_at DESC`, bindings);
  }

  if (key === "attendance-devices/sync-status") {
    return queryRows(c, `SELECT ad.name AS device_name, ad.device_code, ad.vendor, ad.device_mode, ad.status,
        ad.health_status, ad.last_seen_at, ad.last_sync_at,
        (SELECT COUNT(*) FROM attendance_raw_logs arl WHERE COALESCE(arl.attendance_device_id, arl.device_id) = ad.id) AS raw_log_count,
        (SELECT COUNT(*) FROM attendance_unmatched_logs aul WHERE aul.attendance_device_id = ad.id AND aul.status = 'OPEN') AS open_unmatched_count
      FROM attendance_devices ad
      WHERE ad.status != 'ARCHIVED'
      ORDER BY ad.name`, bindings);
  }

  if (key === "attendance-devices/import-errors") {
    addFilter(conditions, bindings, f.status, "aire.status = ?");
    return queryRows(c, `SELECT aib.batch_number, aib.file_name, aire.row_number, aire.error_code, aire.error_message,
        aire.status, aire.created_at
      FROM attendance_import_row_errors aire
      LEFT JOIN attendance_import_batches aib ON aib.id = aire.import_batch_id
      ${whereClause(conditions)}
      ORDER BY aire.created_at DESC`, bindings);
  }

  if (key === "attendance-devices/warnings" || key === "attendance-devices/locked-day-imports") {
    await applyReportEmployeeScope(c, conditions, bindings, "attendance", "e", "w.employee_id");
    addCommonEmployeeFilters(conditions, bindings, f, "e");
    addFilter(conditions, bindings, f.status, "w.status = ?");
    return queryRows(c, `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        w.attendance_date, w.warning_type, w.message, w.status, w.created_at
      FROM attendance_locked_day_import_warnings w
      LEFT JOIN employees e ON e.id = w.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(conditions)}
      ORDER BY w.created_at DESC`, bindings);
  }

  if (key === "attendance-devices/biometric-mappings") {
    await applyReportEmployeeScope(c, conditions, bindings, "attendance", "e");
    addCommonEmployeeFilters(conditions, bindings, f, "e");
    addFilter(conditions, bindings, f.status, "ebm.status = ?");
    return queryRows(c, `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        ad.name AS device_name, ad.device_code, ebm.biometric_user_id, ebm.biometric_user_name,
        ebm.external_employee_code, ebm.mapping_source, ebm.status
      FROM employee_biometric_mappings ebm
      JOIN employees e ON e.id = ebm.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN attendance_devices ad ON ad.id = ebm.attendance_device_id
      ${whereClause(conditions)}
      ORDER BY e.employee_no, ad.name`, bindings);
  }

  await applyReportEmployeeScope(c, conditions, bindings, "attendance", "e", "arl.employee_id");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.device_id, "COALESCE(arl.attendance_device_id, arl.device_id) = ?");
  addFilter(conditions, bindings, f.process_status, "arl.process_status = ?");
  if (f.date_from) { conditions.push("arl.punch_date >= ?"); bindings.push(f.date_from); }
  if (f.date_to) { conditions.push("arl.punch_date <= ?"); bindings.push(f.date_to); }
  if (key === "attendance-devices/unmatched") conditions.push("arl.process_status = 'UNMATCHED'");
  if (key === "attendance-devices/duplicates") conditions.push("(arl.is_duplicate = 1 OR arl.process_status = 'DUPLICATE')");
  if (key === "attendance-devices/manual-logs") conditions.push("arl.is_manual_entry = 1");
  if (key === "attendance-devices/night-shift-warnings") conditions.push("(time(arl.punch_time) >= time('22:00') OR time(arl.punch_time) <= time('05:00'))");

  return queryRows(c, `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
      ad.name AS device_name, ad.device_code, arl.biometric_user_id, arl.punch_time, arl.punch_type,
      arl.process_status, arl.source, aib.batch_number,
      CASE WHEN arl.process_status IN ('UNMATCHED','ERROR','LOCKED_WARNING') THEN arl.process_status ELSE 'OK' END AS warning_status
    FROM attendance_raw_logs arl
    LEFT JOIN employees e ON e.id = arl.employee_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    LEFT JOIN attendance_devices ad ON ad.id = COALESCE(arl.attendance_device_id, arl.device_id)
    LEFT JOIN attendance_import_batches aib ON aib.id = arl.import_batch_id
    ${whereClause(conditions)}
    ORDER BY arl.punch_time DESC`, bindings);
}

async function leaveReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "leave", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.leave_type_id, "lr.leave_type_id = ?");
  addFilter(conditions, bindings, f.status, "lr.status = ?");
  if (f.pending_my_approval === "true") {
    conditions.push("pending.approver_user_id = ?");
    bindings.push(c.get("currentUser").id);
  }
  if (f.date_from) {
    conditions.push("lr.start_date >= ?");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("lr.end_date <= ?");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name, lt.name AS leave_type,
      lr.start_date, lr.end_date, lr.total_days, lr.status, lr.document_status,
      lr.submitted_at, lr.approved_at
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    JOIN leave_types lt ON lt.id = lr.leave_type_id
    LEFT JOIN leave_request_approvals pending ON pending.id = (
      SELECT id FROM leave_request_approvals
      WHERE leave_request_id = lr.id AND status = 'PENDING'
      ORDER BY step_order LIMIT 1
    )
    ${whereClause(conditions)}
    ORDER BY lr.created_at DESC`;
  return queryRows(c, sql, bindings);
}

async function getPayrollRunSummaryReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addPeriodFilters(conditions, bindings, f, "pp", "pr");
  addFilter(conditions, bindings, f.status, "pre.status = ?");
  addFilter(conditions, bindings, f.payment_status, "ppr.payment_status = ?");
  if (f.date_from) {
    conditions.push("date(pp.start_date) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(pp.end_date) <= date(?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      pr.run_no, pre.employee_no_snapshot AS employee_no, pre.employee_name_snapshot AS employee_name,
      d.name AS department, l.name AS location, pre.basic_salary, pre.total_earnings AS gross_earnings,
      pre.total_deductions,
      COALESCE((SELECT SUM(employee_contribution_amount) FROM payroll_pension_contributions ppc WHERE ppc.payroll_employee_result_id = pre.id), 0) AS employee_pension,
      COALESCE((SELECT SUM(deducted_amount) FROM employee_bank_loan_payments eblp WHERE eblp.payroll_employee_result_id = pre.id), 0) AS bank_loan_deductions,
      COALESCE((SELECT SUM(deducted_amount) FROM employee_custom_deduction_applications ecda WHERE ecda.payroll_employee_result_id = pre.id), 0) AS custom_deductions,
      pre.advance_deductions AS advances, pre.net_salary,
      COALESCE(ppr.payment_method_snapshot, 'Not prepared') AS payment_method,
      COALESCE(ppr.payment_status, 'NOT_PREPARED') AS payment_status,
      pre.status AS payroll_status, pre.hold_reason AS warnings, pre.finalized_at AS finalized_date,
      ppr.confirmed_paid_at AS confirmed_date
    FROM payroll_employee_results pre
    JOIN employees e ON e.id = pre.employee_id
    JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
    JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
    LEFT JOIN payroll_payment_register ppr ON ppr.payroll_employee_result_id = pre.id
    LEFT JOIN departments d ON d.id = pre.department_id
    LEFT JOIN locations l ON l.id = pre.location_id
    ${whereClause(conditions)}
    ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC, pre.employee_no_snapshot`;
  return queryRows(c, sql, bindings);
}

async function getPayrollPeriodSummaryReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addPeriodFilters(conditions, bindings, f, "pp", "pr");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      COUNT(DISTINCT pre.employee_id) AS employee_count,
      SUM(pre.total_earnings) AS gross_earnings,
      SUM(pre.total_deductions) AS total_deductions,
      COALESCE(SUM((SELECT employee_contribution_amount FROM payroll_pension_contributions ppc WHERE ppc.payroll_employee_result_id = pre.id)), 0) AS employee_pension,
      COALESCE(SUM((SELECT SUM(deducted_amount) FROM employee_bank_loan_payments eblp WHERE eblp.payroll_employee_result_id = pre.id)), 0) AS bank_loan_deductions,
      COALESCE(SUM((SELECT SUM(deducted_amount) FROM employee_custom_deduction_applications ecda WHERE ecda.payroll_employee_result_id = pre.id)), 0) AS custom_deductions,
      SUM(pre.advance_deductions) AS advances,
      SUM(pre.net_salary) AS net_salary,
      pr.status AS payroll_status,
      SUM(CASE WHEN pre.status = 'HELD' OR pre.hold_reason IS NOT NULL THEN 1 ELSE 0 END) AS warnings
    FROM payroll_employee_results pre
    JOIN employees e ON e.id = pre.employee_id
    JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
    JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
    ${whereClause(conditions)}
    GROUP BY pp.id, pr.status
    ORDER BY pp.period_year DESC, pp.period_month DESC`;
  return queryRows(c, sql, bindings);
}

async function getPayrollComponentReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addPeriodFilters(conditions, bindings, f, "pp", "pr");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period, pr.run_no,
      prli.line_type, prli.category, prli.description, prli.source,
      COUNT(DISTINCT pre.employee_id) AS employee_count, SUM(prli.amount) AS amount
    FROM payroll_result_line_items prli
    JOIN payroll_employee_results pre ON pre.id = prli.payroll_run_employee_id
    JOIN employees e ON e.id = pre.employee_id
    JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
    JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
    ${whereClause(conditions)}
    GROUP BY pp.id, pr.id, prli.line_type, prli.category, prli.description, prli.source
    ORDER BY pp.period_year DESC, pp.period_month DESC, prli.line_type, prli.category`;
  return queryRows(c, sql, bindings);
}

async function getPayrollAdjustmentsReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  const sql = `SELECT e.employee_no, e.full_name AS employee_name,
      printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      pa.adjustment_type, pa.amount, pa.status, pa.reason, pa.created_at
    FROM payroll_adjustments pa
    JOIN employees e ON e.id = pa.employee_id
    LEFT JOIN payroll_periods pp ON pp.id = pa.payroll_period_id
    ${whereClause(conditions)}
    ORDER BY pa.created_at DESC`;
  return queryRows(c, sql, bindings);
}

async function getPayrollExceptionsReport(c: Context<AppBindings>) {
  const result = await getPayrollRunSummaryReport(c);
  result.rows = result.rows.filter((row) => String(row.payroll_status ?? "") === "HELD" || Boolean(row.warnings));
  return result;
}

async function getPensionContributionReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.payroll_period_id, "pp.id = ?");
  addFilter(conditions, bindings, f.pension_scheme_id, "ps.id = ?");
  addFilter(conditions, bindings, f.status, "ppc.contribution_status = ?");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
      ps.scheme_name AS pension_scheme, ppc.pensionable_wage,
      ppc.employee_contribution_percent, ppc.employee_contribution_amount,
      ppc.employer_contribution_percent, ppc.employer_contribution_amount,
      ppc.employee_extra_voluntary_contribution_amount AS voluntary_contribution_amount,
      ppc.total_contribution_amount AS total_contribution,
      COALESCE(prb.status, ppc.contribution_status) AS remittance_status,
      prb.remittance_reference, NULL AS warnings
    FROM payroll_pension_contributions ppc
    JOIN employees e ON e.id = ppc.employee_id
    JOIN payroll_periods pp ON pp.id = ppc.payroll_period_id
    JOIN pension_schemes ps ON ps.id = ppc.pension_scheme_id
    LEFT JOIN pension_remittance_batches prb ON prb.id = ppc.remittance_batch_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY pp.period_year DESC, pp.period_month DESC, e.employee_no`;
  return queryRows(c, sql, bindings);
}

async function getPensionRemittanceReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addFilter(conditions, bindings, f.payroll_period_id, "pp.id = ?");
  addFilter(conditions, bindings, f.pension_scheme_id, "ps.id = ?");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      ps.scheme_name AS pension_scheme,
      COUNT(DISTINCT ppc.employee_id) AS employee_count,
      SUM(ppc.pensionable_wage) AS pensionable_wage,
      SUM(ppc.employee_contribution_amount) AS employee_contribution_amount,
      SUM(ppc.employer_contribution_amount) AS employer_contribution_amount,
      SUM(ppc.employee_extra_voluntary_contribution_amount) AS voluntary_contribution_amount,
      SUM(ppc.total_contribution_amount) AS total_contribution,
      COALESCE(prb.status, ppc.contribution_status) AS remittance_status,
      prb.remittance_reference
    FROM payroll_pension_contributions ppc
    JOIN employees e ON e.id = ppc.employee_id
    JOIN payroll_periods pp ON pp.id = ppc.payroll_period_id
    JOIN pension_schemes ps ON ps.id = ppc.pension_scheme_id
    LEFT JOIN pension_remittance_batches prb ON prb.id = ppc.remittance_batch_id
    ${whereClause(conditions)}
    GROUP BY pp.id, ps.id, prb.status, ppc.contribution_status, prb.remittance_reference
    ORDER BY pp.period_year DESC, pp.period_month DESC, ps.scheme_name`;
  return queryRows(c, sql, bindings);
}

async function getBankLoanDeductionReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.payroll_period_id, "pp.id = ?");
  addFilter(conditions, bindings, f.payment_institution_id, "eblp.payment_institution_id = ?");
  addFilter(conditions, bindings, f.payment_status, "eblp.payment_status = ?");
  if (key.includes("shortfalls")) conditions.push("eblp.shortfall_amount > 0");
  if (key.includes("direct-collection")) conditions.push("(eblp.bank_direct_collection_required = 1 OR eblp.payment_status = 'BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE')");
  if (key.includes("notification-pending")) conditions.push("eblp.bank_notification_status = 'BANK_NOTIFICATION_PENDING'");
  if (key.includes("cash-salary-eligibility")) conditions.push("eblp.notes LIKE '%cash%' OR eblp.metadata_json LIKE '%cash%'");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      eblp.bank_name_snapshot AS bank, e.employee_no, e.full_name AS employee_name,
      d.name AS department, l.name AS location,
      eblp.loan_reference_number_snapshot AS loan_reference,
      eblp.scheduled_installment_amount AS scheduled_installment,
      eblp.deducted_amount, eblp.shortfall_amount,
      CASE WHEN eblp.skipped_due_to_minimum_net_salary = 1 THEN eblp.scheduled_installment_amount ELSE 0 END AS skipped_amount,
      eblp.payment_status,
      CASE WHEN eblp.skipped_due_to_minimum_net_salary = 1 THEN 'SKIPPED_MINIMUM_NET_PROTECTION' ELSE 'NOT_TRIGGERED' END AS minimum_net_salary_protection_status,
      CASE WHEN eblp.bank_direct_collection_required = 1 THEN 'BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE' ELSE 'NOT_REQUIRED' END AS direct_bank_collection_status,
      eblp.bank_notification_status, eblp.bank_notification_reference,
      eblp.notes AS confirmation_note, eblp.confirmed_at,
      CASE WHEN ebl.status IS NULL THEN 'UNKNOWN' ELSE ebl.status END AS eligibility_status,
      CASE WHEN eblp.shortfall_amount > 0 OR eblp.skipped_due_to_minimum_net_salary = 1 THEN 'WARNING' ELSE NULL END AS warnings
    FROM employee_bank_loan_payments eblp
    JOIN employees e ON e.id = eblp.employee_id
    JOIN payroll_periods pp ON pp.id = eblp.payroll_period_id
    LEFT JOIN employee_bank_loans ebl ON ebl.id = eblp.employee_bank_loan_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY pp.period_year DESC, pp.period_month DESC, eblp.bank_name_snapshot, e.employee_no`;
  return queryRows(c, sql, bindings);
}

async function getBankLoanRemittanceReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addFilter(conditions, bindings, f.payroll_period_id, "pp.id = ?");
  addFilter(conditions, bindings, f.payment_institution_id, "eblp.payment_institution_id = ?");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      eblp.bank_name_snapshot AS bank,
      COUNT(DISTINCT eblp.employee_id) AS employee_count,
      SUM(eblp.scheduled_installment_amount) AS scheduled_installment,
      SUM(eblp.deducted_amount) AS deducted_amount,
      SUM(eblp.shortfall_amount) AS shortfall_amount,
      SUM(CASE WHEN eblp.skipped_due_to_minimum_net_salary = 1 THEN eblp.scheduled_installment_amount ELSE 0 END) AS skipped_amount,
      SUM(CASE WHEN eblp.bank_direct_collection_required = 1 THEN eblp.scheduled_installment_amount ELSE 0 END) AS direct_collection_total,
      SUM(CASE WHEN eblp.skipped_due_to_minimum_net_salary = 1 OR eblp.bank_direct_collection_required = 1 THEN 0 ELSE eblp.deducted_amount END) AS remittance_total,
      eblp.bank_notification_status, eblp.payment_status
    FROM employee_bank_loan_payments eblp
    JOIN payroll_periods pp ON pp.id = eblp.payroll_period_id
    ${whereClause(conditions)}
    GROUP BY pp.id, eblp.payment_institution_id, eblp.bank_name_snapshot, eblp.bank_notification_status, eblp.payment_status
    ORDER BY pp.period_year DESC, pp.period_month DESC, eblp.bank_name_snapshot`;
  return queryRows(c, sql, bindings);
}

async function getCustomDeductionReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.payroll_period_id, "pp.id = ?");
  addFilter(conditions, bindings, f.deduction_template_id, "ecda.template_id = ?");
  addFilter(conditions, bindings, f.deduction_category, "ecd.category_snapshot = ?");
  addFilter(conditions, bindings, f.status, "ecda.application_status = ?");
  if (key.includes("shortfalls")) conditions.push("ecda.shortfall_amount > 0");
  if (key.includes("remaining-balances")) conditions.push("COALESCE(ecda.remaining_balance_after, ecd.remaining_balance, 0) > 0");
  if (key.includes("active")) conditions.push("ecd.status = 'ACTIVE'");
  const baseSql = `FROM employee_custom_deduction_applications ecda
    JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id
    JOIN employees e ON e.id = ecda.employee_id
    JOIN payroll_periods pp ON pp.id = ecda.payroll_period_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}`;
  if (key.endsWith("by-template")) {
    return queryRows(c, `SELECT ecd.template_name_snapshot AS deduction_template, ecd.category_snapshot AS category, COUNT(*) AS assignment_count, SUM(ecda.scheduled_amount) AS scheduled_amount, SUM(ecda.deducted_amount) AS deducted_amount, SUM(ecda.shortfall_amount) AS shortfall_amount, SUM(COALESCE(ecda.remaining_balance_after, ecd.remaining_balance, 0)) AS remaining_balance ${baseSql} GROUP BY ecda.template_id, ecd.template_name_snapshot, ecd.category_snapshot ORDER BY ecd.template_name_snapshot`, bindings);
  }
  if (key.endsWith("by-category")) {
    return queryRows(c, `SELECT ecd.category_snapshot AS category, COUNT(*) AS assignment_count, SUM(ecda.scheduled_amount) AS scheduled_amount, SUM(ecda.deducted_amount) AS deducted_amount, SUM(ecda.shortfall_amount) AS shortfall_amount, SUM(COALESCE(ecda.remaining_balance_after, ecd.remaining_balance, 0)) AS remaining_balance ${baseSql} GROUP BY ecd.category_snapshot ORDER BY ecd.category_snapshot`, bindings);
  }
  if (key.endsWith("by-department")) {
    return queryRows(c, `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(*) AS assignment_count, SUM(ecda.scheduled_amount) AS scheduled_amount, SUM(ecda.deducted_amount) AS deducted_amount, SUM(ecda.shortfall_amount) AS shortfall_amount, SUM(COALESCE(ecda.remaining_balance_after, ecd.remaining_balance, 0)) AS remaining_balance ${baseSql} GROUP BY d.name ORDER BY d.name`, bindings);
  }
  if (key.endsWith("by-worksite")) {
    return queryRows(c, `SELECT COALESCE(l.name, 'Unassigned') AS location, COUNT(*) AS assignment_count, SUM(ecda.scheduled_amount) AS scheduled_amount, SUM(ecda.deducted_amount) AS deducted_amount, SUM(ecda.shortfall_amount) AS shortfall_amount, SUM(COALESCE(ecda.remaining_balance_after, ecd.remaining_balance, 0)) AS remaining_balance ${baseSql} GROUP BY l.name ORDER BY l.name`, bindings);
  }
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
      ecd.template_name_snapshot AS deduction_template, ecd.category_snapshot AS category,
      ecda.scheduled_amount, ecda.deducted_amount, ecda.shortfall_amount,
      COALESCE(ecda.remaining_balance_after, ecd.remaining_balance, 0) AS remaining_balance,
      ecda.installment_number, ecda.application_status AS status,
      ecd.approval_status, CASE WHEN ecd.include_in_final_settlement = 1 THEN 'INCLUDED' ELSE 'EXCLUDED' END AS final_settlement_inclusion,
      CASE WHEN ecda.shortfall_amount > 0 THEN 'SHORTFALL' ELSE NULL END AS warnings
    ${baseSql}
    ORDER BY pp.period_year DESC, pp.period_month DESC, e.employee_no`;
  return queryRows(c, sql, bindings);
}

async function getFinalSettlementReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "final_settlement", "e", "fsc.employee_id");
  addLikeFilter(conditions, bindings, f.search, ["fsc.settlement_number", "fsc.employee_number_snapshot", "fsc.employee_name_snapshot"]);
  addFilter(conditions, bindings, f.department_id, "fsc.department_id = ?");
  addFilter(conditions, bindings, f.location_id, "fsc.worksite_id = ?");
  addFilter(conditions, bindings, f.final_settlement_status || f.status, "fsc.status = ?");
  if (key.endsWith("pending")) conditions.push("fsc.status IN ('DRAFT', 'CALCULATING')");
  if (key.endsWith("ready-for-approval")) conditions.push("fsc.status = 'SUBMITTED_FOR_APPROVAL'");
  if (key.endsWith("finalized")) conditions.push("fsc.status IN ('FINALIZED', 'LOCKED')");
  if (key.includes("leave-impact")) conditions.push("fsc.id IN (SELECT settlement_case_id FROM final_settlement_line_items WHERE component_source IN ('UNUSED_LEAVE_PAYOUT', 'NEGATIVE_LEAVE_BALANCE_DEDUCTION', 'UNPAID_LEAVE_DEDUCTION'))");
  if (key.includes("bank-loan-impact")) conditions.push("fsc.id IN (SELECT settlement_case_id FROM final_settlement_line_items WHERE component_source LIKE 'BANK_LOAN%')");
  if (key.includes("pension-impact")) conditions.push("fsc.id IN (SELECT settlement_case_id FROM final_settlement_line_items WHERE component_source LIKE 'PENSION%')");
  if (key.includes("custom-deduction-impact")) conditions.push("fsc.id IN (SELECT settlement_case_id FROM final_settlement_line_items WHERE component_source LIKE 'CUSTOM_DEDUCTION%')");
  if (key.includes("asset-uniform-impact")) conditions.push("fsc.id IN (SELECT settlement_case_id FROM final_settlement_line_items WHERE component_source IN ('ASSET_DEDUCTION', 'UNIFORM_DEDUCTION'))");
  if (f.date_from) {
    conditions.push("date(fsc.exit_date) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(fsc.exit_date) <= date(?)");
    bindings.push(f.date_to);
  }
  if (key.endsWith("by-department")) {
    return queryRows(c, `SELECT COALESCE(fsc.department_snapshot, 'Unassigned') AS department, COUNT(*) AS case_count, SUM(fsc.total_earnings) AS total_earnings, SUM(fsc.total_deductions) AS total_deductions, SUM(fsc.net_settlement_amount) AS net_settlement_amount, SUM(fsc.company_owes_employee_amount) AS company_owes_employee_amount, SUM(fsc.employee_owes_company_amount) AS employee_owes_company_amount FROM final_settlement_cases fsc ${whereClause(conditions)} GROUP BY fsc.department_snapshot ORDER BY fsc.department_snapshot`, bindings);
  }
  if (key.endsWith("by-worksite")) {
    return queryRows(c, `SELECT COALESCE(fsc.worksite_snapshot, fsc.location_snapshot, 'Unassigned') AS location, COUNT(*) AS case_count, SUM(fsc.total_earnings) AS total_earnings, SUM(fsc.total_deductions) AS total_deductions, SUM(fsc.net_settlement_amount) AS net_settlement_amount, SUM(fsc.company_owes_employee_amount) AS company_owes_employee_amount, SUM(fsc.employee_owes_company_amount) AS employee_owes_company_amount FROM final_settlement_cases fsc ${whereClause(conditions)} GROUP BY COALESCE(fsc.worksite_snapshot, fsc.location_snapshot) ORDER BY location`, bindings);
  }
  const sql = `SELECT fsc.settlement_number, fsc.employee_number_snapshot AS employee_no, fsc.employee_name_snapshot AS employee_name,
      fsc.department_snapshot AS department, COALESCE(fsc.worksite_snapshot, fsc.location_snapshot) AS location,
      fsc.exit_type, fsc.exit_date, fsc.last_working_day, fsc.status AS settlement_status,
      fsc.total_earnings, fsc.total_deductions, fsc.net_settlement_amount,
      fsc.payment_direction, fsc.payment_status, fsc.clearance_status, fsc.approval_status,
      fsc.finalized_at AS finalized_date, fsc.calculation_warnings_json AS warnings
    FROM final_settlement_cases fsc
    ${whereClause(conditions)}
    ORDER BY fsc.created_at DESC`;
  return queryRows(c, sql, bindings);
}

async function getAttendancePayrollVarianceReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "attendance", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.attendance_status || f.status, "a.status = ?");
  if (f.date_from) {
    conditions.push("a.attendance_date >= ?");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("a.attendance_date <= ?");
    bindings.push(f.date_to);
  }
  if (key.includes("late-early-absence")) conditions.push("(COALESCE(a.late_minutes, 0) > 0 OR COALESCE(a.early_checkout_minutes, 0) > 0 OR a.status IN ('ABSENT', 'MISSING_PUNCH', 'EARLY_LEAVE'))");
  if (key.includes("pending-attendance-corrections")) conditions.push("EXISTS (SELECT 1 FROM attendance_correction_requests acr WHERE acr.employee_id = a.employee_id AND acr.attendance_date = a.attendance_date AND acr.status IN ('PENDING', 'REQUESTED'))");
  const sql = `SELECT NULL AS period, e.employee_no, e.full_name AS employee_name,
      d.name AS department, l.name AS location,
      0 AS roster_expected_days,
      COALESCE(a.payroll_impact_minutes, 0) AS roster_expected_minutes,
      CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END AS attendance_actual_days,
      a.total_work_minutes AS attendance_actual_minutes,
      CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END AS absent_days,
      CASE WHEN COALESCE(a.late_minutes, 0) > 0 THEN 1 ELSE 0 END AS late_count,
      CASE WHEN COALESCE(a.early_checkout_minutes, 0) > 0 THEN 1 ELSE 0 END AS early_leave_count,
      0 AS leave_days, 0 AS unpaid_leave_days,
      COALESCE(a.payroll_impact_days, 0) AS payroll_impact_amount,
      a.payroll_impact_status AS warning_status,
      a.correction_status AS approval_or_correction_status
    FROM attendance_daily_records a
    JOIN employees e ON e.id = a.employee_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY a.attendance_date DESC`;
  return queryRows(c, sql, bindings);
}

async function getLeavePayrollVarianceReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "leave", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.leave_type_id, "lr.leave_type_id = ?");
  if (key.includes("pending-leave-approvals")) conditions.push("lr.status = 'PENDING_APPROVAL'");
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
      0 AS roster_expected_days, 0 AS roster_expected_minutes, 0 AS attendance_actual_days, 0 AS attendance_actual_minutes,
      0 AS absent_days, 0 AS late_count, 0 AS early_leave_count,
      lr.total_days AS leave_days, COALESCE(lpi.chargeable_days, 0) AS unpaid_leave_days,
      COALESCE(lpi.estimated_amount, 0) AS payroll_impact_amount,
      lpi.status AS warning_status, lr.status AS approval_or_correction_status
    FROM leave_requests lr
    JOIN employees e ON e.id = lr.employee_id
    LEFT JOIN leave_payroll_impacts lpi ON lpi.leave_request_id = lr.id
    LEFT JOIN payroll_periods pp ON pp.id = lpi.payroll_period_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY lr.created_at DESC`;
  return queryRows(c, sql, bindings);
}

async function getRosterPayrollVarianceReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "roster", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  if (key.includes("missing-roster-assignments")) conditions.push("ra.id IS NULL");
  if (f.date_from) {
    conditions.push("(ra.roster_date IS NULL OR ra.roster_date >= ?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("(ra.roster_date IS NULL OR ra.roster_date <= ?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT NULL AS period, e.employee_no, e.full_name AS employee_name,
      d.name AS department, l.name AS location,
      CASE WHEN ra.status IN ('PUBLISHED', 'CHANGED_AFTER_PUBLISH') THEN 1 ELSE 0 END AS roster_expected_days,
      ra.expected_work_minutes AS roster_expected_minutes,
      CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END AS attendance_actual_days,
      a.total_work_minutes AS attendance_actual_minutes,
      CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END AS absent_days,
      CASE WHEN COALESCE(a.late_minutes, 0) > 0 THEN 1 ELSE 0 END AS late_count,
      CASE WHEN COALESCE(a.early_checkout_minutes, 0) > 0 THEN 1 ELSE 0 END AS early_leave_count,
      CASE WHEN ra.status IN ('LEAVE', 'SICK_LEAVE', 'LONG_LEAVE') THEN 1 ELSE 0 END AS leave_days,
      0 AS unpaid_leave_days, 0 AS payroll_impact_amount,
      CASE WHEN ra.id IS NULL THEN 'MISSING_ROSTER_ASSIGNMENT' ELSE ra.status END AS warning_status,
      a.correction_status AS approval_or_correction_status
    FROM employees e
    LEFT JOIN roster_assignments ra ON ra.employee_id = e.id
    LEFT JOIN attendance_daily_records a ON a.employee_id = e.id AND a.attendance_date = ra.roster_date
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${whereClause(conditions)}
    ORDER BY COALESCE(ra.roster_date, e.created_at) DESC`;
  return queryRows(c, sql, bindings);
}

async function getPaymentRegisterReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  if (key.includes("final-settlement")) {
    await applyReportEmployeeScope(c, conditions, bindings, "final_settlement", "e", "fspr.employee_id");
    addFilter(conditions, bindings, f.payment_status, "fspr.payment_status = ?");
    const sql = `SELECT NULL AS period, fspr.employee_number_snapshot AS employee_no,
        fspr.employee_name_snapshot AS employee_name, fspr.payment_method_snapshot AS payment_method,
        fspr.payment_institution_snapshot AS payment_institution,
        fspr.payment_method_type_snapshot AS masked_account_or_cash_details,
        fspr.amount AS net_salary, fspr.payment_status, fspr.prepared_at AS prepared_date,
        fspr.confirmed_paid_at AS confirmed_date, fspr.confirmation_reference, fspr.confirmation_note,
        fsc.payment_direction AS settlement_or_payment_direction
      FROM final_settlement_payment_register fspr
      JOIN final_settlement_cases fsc ON fsc.id = fspr.settlement_case_id
      ${whereClause(conditions)}
      ORDER BY fspr.created_at DESC`;
    return queryRows(c, sql, bindings);
  }
  await applyReportEmployeeScope(c, conditions, bindings, "payroll", "e", "ppr.employee_id");
  addFilter(conditions, bindings, f.payroll_period_id, "pp.id = ?");
  addFilter(conditions, bindings, f.payment_status, "ppr.payment_status = ?");
  if (key.includes("cash")) conditions.push("ppr.payment_method_snapshot LIKE '%CASH%'");
  if (key.includes("bank-transfer")) conditions.push("ppr.payment_method_snapshot LIKE '%BANK%'");
  if (key.includes("split-payments")) conditions.push("ppr.payment_method_snapshot LIKE '%SPLIT%'");
  if (key.includes("manual-confirmations")) conditions.push("ppr.confirmed_paid_at IS NOT NULL");
  if (key.includes("by-method")) {
    const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
        ppr.payment_method_snapshot AS payment_method, ppr.bank_name_snapshot AS payment_institution,
        COUNT(*) AS employee_count, SUM(ppr.net_salary_amount) AS net_salary, ppr.payment_status
      FROM payroll_payment_register ppr
      JOIN payroll_periods pp ON pp.id = ppr.payroll_period_id
      ${whereClause(conditions)}
      GROUP BY pp.id, ppr.payment_method_snapshot, ppr.bank_name_snapshot, ppr.payment_status
      ORDER BY pp.period_year DESC, pp.period_month DESC`;
    return queryRows(c, sql, bindings);
  }
  const sql = `SELECT printf('%02d/%d', pp.period_month, pp.period_year) AS period,
      ppr.employee_number_snapshot AS employee_no, ppr.employee_name_snapshot AS employee_name,
      ppr.payment_method_snapshot AS payment_method, ppr.bank_name_snapshot AS payment_institution,
      COALESCE(ppr.bank_account_number_masked, ppr.payment_method_snapshot) AS masked_account_or_cash_details,
      ppr.net_salary_amount AS net_salary, ppr.payment_status, ppr.prepared_at AS prepared_date,
      ppr.confirmed_paid_at AS confirmed_date, ppr.confirmation_reference, ppr.confirmation_note,
      'SALARY' AS settlement_or_payment_direction
    FROM payroll_payment_register ppr
    JOIN payroll_periods pp ON pp.id = ppr.payroll_period_id
    ${whereClause(conditions)}
    ORDER BY pp.period_year DESC, pp.period_month DESC, ppr.employee_number_snapshot`;
  return queryRows(c, sql, bindings);
}

async function rosterReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "roster", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.status, "ra.status = ?");
  addFilter(conditions, bindings, f.shift_template_id, "ra.shift_template_id = ?");
  addFilter(conditions, bindings, f.week_start_date, "rp.week_start_date = ?");
  const sql = `SELECT ra.roster_date, e.employee_no, e.full_name AS employee_name,
      d.name AS department, l.name AS location, st.name AS shift, ra.status,
      rp.week_start_date, rp.status AS period_status
    FROM roster_assignments ra
    JOIN roster_periods rp ON rp.id = ra.roster_period_id
    JOIN employees e ON e.id = ra.employee_id
    LEFT JOIN departments d ON d.id = rp.department_id
    LEFT JOIN locations l ON l.id = rp.location_id
    LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
    ${whereClause(conditions)}
    ORDER BY ra.roster_date DESC`;
  return queryRows(c, sql, bindings);
}

async function assetReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "assets", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "ai.code", "ai.name"]);
  addFilter(conditions, bindings, f.category_id, "ai.category_id = ?");
  addFilter(conditions, bindings, f.status, "aa.status = ?");
  addFilter(conditions, bindings, f.item_status, "ai.status = ?");
  addFilter(conditions, bindings, f.condition_status, "ai.condition_status = ?");
  if (f.date_from) {
    conditions.push("aa.issued_date >= ?");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("aa.issued_date <= ?");
    bindings.push(f.date_to);
  }
  const sql = `SELECT e.employee_no, e.full_name AS employee_name, ac.name AS category,
      ai.code AS asset_code, ai.name AS asset_name, aa.issued_date, aa.expected_return_date,
      aa.returned_date, aa.status, ai.condition_status, aa.deduction_amount
    FROM employee_asset_assignments aa
    JOIN employees e ON e.id = aa.employee_id
    JOIN asset_items ai ON ai.id = aa.asset_item_id
    JOIN asset_categories ac ON ac.id = ai.category_id
    ${whereClause(conditions)}
    ORDER BY aa.issued_date DESC`;
  return queryRows(c, sql, bindings);
}

async function assetUniformReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);

  if (key === "uniforms/stock") {
    const conditions: string[] = [];
    const bindings: unknown[] = [];
    addFilter(conditions, bindings, f.uniform_type_id, "us.uniform_type_id = ?");
    addFilter(conditions, bindings, f.location_id, "COALESCE(us.location_id, us.worksite_id) = ?");
    addFilter(conditions, bindings, f.status, "us.status = ?");
    addLikeFilter(conditions, bindings, f.search, ["ut.code", "ut.name", "us.size_label", "l.name", "wl.name"]);
    const sql = `SELECT NULL AS employee_no, NULL AS employee_name, NULL AS department,
        COALESCE(l.name, wl.name) AS location, ut.name AS uniform_type, us.size_label,
        us.total_quantity, us.available_quantity, us.issued_quantity, us.damaged_quantity, us.lost_quantity,
        NULL AS issued_date, NULL AS expected_return_date, NULL AS returned_date,
        us.status AS assignment_status, NULL AS clearance_status, NULL AS deduction_amount, NULL AS custom_deduction_id
      FROM uniform_stock_items us
      JOIN uniform_types ut ON ut.id = us.uniform_type_id
      LEFT JOIN locations l ON l.id = us.location_id
      LEFT JOIN locations wl ON wl.id = us.worksite_id
      ${whereClause(conditions)}
      ORDER BY ut.display_order, ut.name, us.size_label`;
    return queryRows(c, sql, bindings);
  }

  if (key.startsWith("uniforms/")) {
    const conditions: string[] = [];
    const bindings: unknown[] = [];
    await applyReportEmployeeScope(c, conditions, bindings, "uniforms", "e");
    addCommonEmployeeFilters(conditions, bindings, f, "e");
    addFilter(conditions, bindings, f.uniform_type_id, "ua.uniform_type_id = ?");
    addFilter(conditions, bindings, f.status, "ua.assignment_status = ?");
    addFilter(conditions, bindings, f.clearance_status, "ua.clearance_status = ?");
    addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "ut.name", "ua.assignment_number", "ua.notes"]);
    if (f.date_from) {
      conditions.push("date(ua.issued_date) >= date(?)");
      bindings.push(f.date_from);
    }
    if (f.date_to) {
      conditions.push("date(ua.issued_date) <= date(?)");
      bindings.push(f.date_to);
    }
    if (key === "uniforms/damaged-lost") conditions.push("ua.assignment_status IN ('DAMAGED', 'LOST')");
    if (key === "uniforms/clearance") conditions.push("ua.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING')");

    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        ut.name AS uniform_type, ua.size_label, ua.quantity_issued, ua.quantity_returned,
        ua.quantity_damaged, ua.quantity_lost, ua.issued_date, ua.expected_return_date, ua.returned_date,
        ua.assignment_status, ua.clearance_status, ua.deduction_amount, ua.custom_deduction_id,
        ua.final_settlement_case_id, ua.deduction_status,
        CASE
          WHEN ua.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING') THEN 'ACTION_REQUIRED'
          ELSE 'OK'
        END AS warning_status
      FROM employee_uniform_assignments ua
      JOIN employees e ON e.id = ua.employee_id
      JOIN uniform_types ut ON ut.id = ua.uniform_type_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(conditions)}
      ORDER BY ua.issued_date DESC, e.employee_no`;
    return queryRows(c, sql, bindings);
  }

  if (key === "assets/available") {
    const conditions: string[] = ["(ai.lifecycle_status = 'AVAILABLE' OR ai.status = 'AVAILABLE')"];
    const bindings: unknown[] = [];
    addFilter(conditions, bindings, f.category_id, "ai.category_id = ?");
    addFilter(conditions, bindings, f.condition_status, "ai.condition_status = ?");
    addLikeFilter(conditions, bindings, f.search, ["ai.code", "ai.asset_code", "ai.serial_no", "ai.serial_number", "ai.name", "ac.name"]);
    const sql = `SELECT NULL AS employee_no, NULL AS employee_name, NULL AS department, NULL AS location,
        ac.name AS category, COALESCE(ai.asset_code, ai.code) AS asset_code, ai.name AS asset_name,
        NULL AS issued_date, ai.expected_return_date, NULL AS returned_date, ai.status,
        ai.lifecycle_status AS assignment_status, 'NOT_REQUIRED' AS clearance_status,
        ai.condition_status, NULL AS deduction_amount, NULL AS custom_deduction_id,
        COALESCE(ai.serial_number, ai.serial_no) AS serial_number, ai.current_value,
        'AVAILABLE' AS warning_status
      FROM asset_items ai
      JOIN asset_categories ac ON ac.id = ai.category_id
      ${whereClause(conditions)}
      ORDER BY ac.name, ai.name`;
    return queryRows(c, sql, bindings);
  }

  if (key === "assets/by-department" || key === "assets/by-worksite") {
    const conditions: string[] = [];
    const bindings: unknown[] = [];
    await applyReportEmployeeScope(c, conditions, bindings, "assets", "e");
    addCommonEmployeeFilters(conditions, bindings, f, "e");
    const groupColumn = key === "assets/by-department" ? "COALESCE(d.name, 'Unassigned')" : "COALESCE(l.name, 'Unassigned')";
    const label = key === "assets/by-department" ? "department" : "location";
    const sql = `SELECT ${groupColumn} AS ${label}, COUNT(aa.id) AS assignment_count,
        SUM(CASE WHEN COALESCE(aa.assignment_status, aa.status) IN ('ASSIGNED', 'ISSUED') THEN 1 ELSE 0 END) AS assigned_count,
        SUM(CASE WHEN COALESCE(aa.assignment_status, aa.status) = 'DAMAGED' THEN 1 ELSE 0 END) AS damaged_count,
        SUM(CASE WHEN COALESCE(aa.assignment_status, aa.status) = 'LOST' THEN 1 ELSE 0 END) AS lost_count,
        SUM(CASE WHEN aa.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING') THEN 1 ELSE 0 END) AS clearance_pending_count,
        SUM(COALESCE(aa.deduction_amount, 0)) AS deduction_amount
      FROM employee_asset_assignments aa
      JOIN employees e ON e.id = aa.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(conditions)}
      GROUP BY ${groupColumn}
      ORDER BY ${groupColumn}`;
    return queryRows(c, sql, bindings);
  }

  if (key.startsWith("assets-uniforms/")) {
    const assetConditions: string[] = [];
    const uniformConditions: string[] = [];
    const assetBindings: unknown[] = [];
    const uniformBindings: unknown[] = [];
    await applyReportEmployeeScope(c, assetConditions, assetBindings, "assets", "e");
    await applyReportEmployeeScope(c, uniformConditions, uniformBindings, "uniforms", "e");
    addCommonEmployeeFilters(assetConditions, assetBindings, f, "e");
    addCommonEmployeeFilters(uniformConditions, uniformBindings, f, "e");
    if (key === "assets-uniforms/final-settlement-impact") {
      assetConditions.push("aa.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING', 'DEDUCTION_APPLIED')");
      uniformConditions.push("ua.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING', 'DEDUCTION_APPLIED')");
    } else {
      assetConditions.push("(COALESCE(aa.deduction_amount, 0) > 0 OR aa.custom_deduction_id IS NOT NULL)");
      uniformConditions.push("(COALESCE(ua.deduction_amount, 0) > 0 OR ua.custom_deduction_id IS NOT NULL)");
    }
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        'ASSET' AS source, ai.name AS item_name, aa.assignment_status, aa.clearance_status,
        aa.deduction_amount, aa.custom_deduction_id, aa.final_settlement_case_id,
        CASE WHEN aa.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING') THEN 'ACTION_REQUIRED' ELSE 'OK' END AS warning_status
      FROM employee_asset_assignments aa
      JOIN employees e ON e.id = aa.employee_id
      JOIN asset_items ai ON ai.id = aa.asset_item_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(assetConditions)}
      UNION ALL
      SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        'UNIFORM' AS source, ut.name || COALESCE(' / ' || ua.size_label, '') AS item_name,
        ua.assignment_status, ua.clearance_status, ua.deduction_amount, ua.custom_deduction_id,
        ua.final_settlement_case_id,
        CASE WHEN ua.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING') THEN 'ACTION_REQUIRED' ELSE 'OK' END AS warning_status
      FROM employee_uniform_assignments ua
      JOIN employees e ON e.id = ua.employee_id
      JOIN uniform_types ut ON ut.id = ua.uniform_type_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(uniformConditions)}
      ORDER BY employee_no, source, item_name`;
    return queryRows(c, sql, [...assetBindings, ...uniformBindings]);
  }

  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "assets", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.category_id, "ai.category_id = ?");
  addFilter(conditions, bindings, f.status, "aa.assignment_status = ?");
  addFilter(conditions, bindings, f.clearance_status, "aa.clearance_status = ?");
  addLikeFilter(conditions, bindings, f.search, ["e.employee_no", "e.full_name", "ai.code", "ai.asset_code", "ai.name", "ai.serial_no", "ai.serial_number"]);
  if (f.date_from) {
    conditions.push("date(COALESCE(aa.assigned_date, aa.issued_date)) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(COALESCE(aa.assigned_date, aa.issued_date)) <= date(?)");
    bindings.push(f.date_to);
  }
  if (key === "assets/assigned") conditions.push("COALESCE(aa.assignment_status, aa.status) IN ('ASSIGNED', 'ISSUED')");
  if (key === "assets/damaged") conditions.push("COALESCE(aa.assignment_status, aa.status) = 'DAMAGED'");
  if (key === "assets/lost") conditions.push("COALESCE(aa.assignment_status, aa.status) = 'LOST'");
  if (key === "assets/pending-returns") conditions.push("COALESCE(aa.assignment_status, aa.status) IN ('ASSIGNED', 'ISSUED') AND aa.expected_return_date IS NOT NULL");
  if (key === "assets/clearance") conditions.push("aa.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING')");

  const historyJoin = key === "assets/history" ? "LEFT JOIN asset_uniform_assignment_events ev ON ev.entity_type = 'ASSET_ASSIGNMENT' AND ev.assignment_id = aa.id" : "";
  const historyColumns = key === "assets/history" ? ", ev.action AS event_action, ev.reason AS event_reason, ev.created_at AS event_created_at" : ", NULL AS event_action, NULL AS event_reason, NULL AS event_created_at";
  const orderBy = key === "assets/history" ? "COALESCE(ev.created_at, aa.issued_date, aa.assigned_date) DESC" : "COALESCE(aa.issued_date, aa.assigned_date) DESC";
  const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
      ac.name AS category, COALESCE(ai.asset_code, ai.code) AS asset_code, ai.name AS asset_name,
      COALESCE(aa.assigned_date, aa.issued_date) AS issued_date, aa.expected_return_date, aa.returned_date,
      aa.status, aa.assignment_status, aa.clearance_status, ai.condition_status,
      aa.deduction_amount, aa.custom_deduction_id, aa.final_settlement_case_id,
      COALESCE(ai.serial_number, ai.serial_no) AS serial_number, aa.deduction_status,
      CASE
        WHEN aa.clearance_status IN ('PENDING', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING') THEN 'ACTION_REQUIRED'
        ELSE 'OK'
      END AS warning_status
      ${historyColumns}
    FROM employee_asset_assignments aa
    JOIN employees e ON e.id = aa.employee_id
    JOIN asset_items ai ON ai.id = aa.asset_item_id
    JOIN asset_categories ac ON ac.id = ai.category_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    ${historyJoin}
    ${whereClause(conditions)}
    ORDER BY ${orderBy}`;
  return queryRows(c, sql, bindings);
}

async function auditReport(c: Context<AppBindings>) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addLikeFilter(conditions, bindings, f.search, ["a.action", "a.module", "a.entity_type", "a.entity_id", "u.name", "u.email"]);
  addFilter(conditions, bindings, f.module, "a.module = ?");
  addFilter(conditions, bindings, f.action, "a.action = ?");
  addFilter(conditions, bindings, f.entity_type, "a.entity_type = ?");
  addFilter(conditions, bindings, f.actor_user_id, "a.actor_user_id = ?");
  if (f.date_from) {
    conditions.push("date(a.created_at) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(a.created_at) <= date(?)");
    bindings.push(f.date_to);
  }
  const sql = `SELECT a.created_at, u.name AS actor_name, a.module, a.action, a.entity_type, a.entity_id, a.reason
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
    ${whereClause(conditions)}
    ORDER BY a.created_at DESC`;
  return queryRows(c, sql, bindings);
}

async function getContractReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "contracts", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");
  addFilter(conditions, bindings, f.status, "ec.status = ?");
  addFilter(conditions, bindings, f.contract_type_id, "ec.contract_type_id = ?");
  if (f.date_from) {
    conditions.push("date(COALESCE(ec.contract_end_date, ec.contract_start_date)) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(COALESCE(ec.contract_end_date, ec.contract_start_date)) <= date(?)");
    bindings.push(f.date_to);
  }

  if (key === "contracts/missing") {
    const missingConditions = [...conditions, "ec.id IS NULL"];
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location, p.title AS position,
        NULL AS contract_number, NULL AS contract_type, 'MISSING' AS contract_status, NULL AS start_date, NULL AS end_date,
        NULL AS days_until_expiry, NULL AS probation_status, NULL AS confirmation_due_date, NULL AS renewal_status,
        'MISSING' AS document_status, 'MISSING_CONTRACT' AS warning_status
      FROM employees e
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN positions p ON p.id = e.primary_position_id
      LEFT JOIN employee_contracts ec ON ec.employee_id = e.id AND ec.status IN ('ACTIVE', 'EXPIRING_SOON')
      ${whereClause(missingConditions)}
      ORDER BY e.employee_no`;
    return queryRows(c, sql, bindings);
  }

  if (key === "contracts/by-department" || key === "contracts/by-worksite") {
    const groupColumn = key === "contracts/by-department" ? "COALESCE(d.name, 'Unassigned')" : "COALESCE(l.name, 'Unassigned')";
    const label = key === "contracts/by-department" ? "department" : "location";
    const sql = `SELECT ${groupColumn} AS ${label},
        COUNT(ec.id) AS contract_count,
        SUM(CASE WHEN ec.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN ec.status = 'EXPIRING_SOON' OR (ec.contract_end_date IS NOT NULL AND ec.contract_end_date BETWEEN date('now') AND date('now', '+30 days')) THEN 1 ELSE 0 END) AS expiring_count,
        SUM(CASE WHEN ec.status = 'EXPIRED' OR (ec.contract_end_date IS NOT NULL AND ec.contract_end_date < date('now')) THEN 1 ELSE 0 END) AS expired_count,
        SUM(CASE WHEN ec.probation_status IN ('IN_PROBATION', 'EXTENDED') AND ec.confirmation_due_date <= date('now', '+14 days') THEN 1 ELSE 0 END) AS probation_due_count
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(conditions)}
      GROUP BY ${groupColumn}
      ORDER BY ${groupColumn}`;
    return queryRows(c, sql, bindings);
  }

  if (key === "contracts/salary-differences") {
    conditions.push("ec.status IN ('ACTIVE', 'EXPIRING_SOON')");
    conditions.push("COALESCE(ec.basic_salary_snapshot, -1) <> COALESCE(pp.basic_salary, -1)");
    const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location,
        ec.contract_number, ec.basic_salary_snapshot AS contract_salary, pp.basic_salary AS payroll_salary,
        COALESCE(ec.basic_salary_snapshot, 0) - COALESCE(pp.basic_salary, 0) AS difference_amount,
        'SALARY_MISMATCH' AS warning_status
      FROM employee_contracts ec
      JOIN employees e ON e.id = ec.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN employee_payroll_profiles pp ON pp.employee_id = e.id
      ${whereClause(conditions)}
      ORDER BY ABS(COALESCE(ec.basic_salary_snapshot, 0) - COALESCE(pp.basic_salary, 0)) DESC`;
    return queryRows(c, sql, bindings);
  }

  if (key === "contracts/active") conditions.push("ec.status IN ('ACTIVE', 'EXPIRING_SOON')");
  if (key === "contracts/expiring") conditions.push("ec.contract_end_date IS NOT NULL AND ec.contract_end_date BETWEEN date('now') AND date('now', '+30 days')");
  if (key === "contracts/expired") conditions.push("(ec.status = 'EXPIRED' OR (ec.contract_end_date IS NOT NULL AND ec.contract_end_date < date('now')))");
  if (key === "contracts/probation-due") conditions.push("ec.probation_status IN ('IN_PROBATION', 'EXTENDED') AND ec.confirmation_due_date IS NOT NULL AND ec.confirmation_due_date <= date('now', '+14 days')");
  if (key === "contracts/probation-confirmation") conditions.push("ec.probation_status = 'CONFIRMED'");
  if (key === "contracts/renewals-due") conditions.push("ec.renewal_status IN ('DUE_SOON', 'PENDING_RENEWAL') OR (ec.renewal_due_date IS NOT NULL AND ec.renewal_due_date <= date('now', '+30 days'))");
  if (key === "contracts/renewals-completed") conditions.push("ec.renewal_status = 'RENEWED'");
  if (key === "contracts/foreign-alignment-placeholder") conditions.push("e.employee_type = 'FOREIGN'");

  const sql = `SELECT e.employee_no, e.full_name AS employee_name, d.name AS department, l.name AS location, p.title AS position,
      ec.contract_number, COALESCE(ec.contract_type_name_snapshot, ct.name) AS contract_type,
      ec.status AS contract_status, ec.contract_start_date AS start_date, ec.contract_end_date AS end_date,
      CASE WHEN ec.contract_end_date IS NULL THEN NULL ELSE CAST(julianday(ec.contract_end_date) - julianday('now') AS INTEGER) END AS days_until_expiry,
      ec.probation_status, ec.confirmation_due_date, ec.renewal_status,
      CASE WHEN ec.document_id IS NULL THEN 'MISSING' ELSE COALESCE(ed.status, 'LINKED') END AS document_status,
      CASE
        WHEN ec.contract_end_date IS NOT NULL AND ec.contract_end_date < date('now') THEN 'EXPIRED'
        WHEN ec.contract_end_date IS NOT NULL AND ec.contract_end_date <= date('now', '+30 days') THEN 'EXPIRING_SOON'
        WHEN ec.probation_status IN ('IN_PROBATION', 'EXTENDED') AND ec.confirmation_due_date <= date('now', '+14 days') THEN 'PROBATION_DUE'
        WHEN ec.document_id IS NULL THEN 'DOCUMENT_MISSING'
        ELSE 'OK'
      END AS warning_status,
      CASE WHEN e.employee_type = 'FOREIGN' THEN 'Placeholder - use document registry for visa status' ELSE NULL END AS visa_status,
      CASE WHEN e.employee_type = 'FOREIGN' THEN 'Placeholder - use document registry for work permit status' ELSE NULL END AS work_permit_status,
      e.employee_type
    FROM employee_contracts ec
    JOIN employees e ON e.id = ec.employee_id
    LEFT JOIN contract_types ct ON ct.id = ec.contract_type_id
    LEFT JOIN employee_documents ed ON ed.id = ec.document_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    LEFT JOIN positions p ON p.id = e.primary_position_id
    ${whereClause(conditions)}
    ORDER BY COALESCE(ec.contract_end_date, ec.contract_start_date), e.employee_no`;
  return queryRows(c, sql, bindings);
}

async function applyApprovalReportScope(c: Context<AppBindings>, conditions: string[], bindings: unknown[], tableAlias: string) {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "approvals", "view", "e");
  conditions.push(`(${tableAlias}.employee_id IS NULL OR ${tableAlias}.employee_id IN (SELECT e.id FROM employees e WHERE ${scope.sql}))`);
  bindings.push(...scope.params);
}

async function getApprovalReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (key === "approvals/delegations") {
    addFilter(conditions, bindings, f.status, "adr.status = ?");
    addFilter(conditions, bindings, f.module_key, "adr.module_key = ?");
    addFilter(conditions, bindings, f.action_key, "adr.action_key = ?");
    if (f.date_from) {
      conditions.push("date(adr.start_at) >= date(?)");
      bindings.push(f.date_from);
    }
    if (f.date_to) {
      conditions.push("date(adr.end_at) <= date(?)");
      bindings.push(f.date_to);
    }
    const sql = `SELECT delegator.name AS delegator_user_id, delegate.name AS delegate_user_id,
        adr.module_key, adr.action_key, adr.start_at, adr.end_at, adr.status, adr.reason
      FROM approval_delegation_rules adr
      LEFT JOIN users delegator ON delegator.id = adr.delegator_user_id
      LEFT JOIN users delegate ON delegate.id = adr.delegate_user_id
      ${whereClause(conditions)}
      ORDER BY adr.start_at DESC`;
    return queryRows(c, sql, bindings);
  }

  if (key === "approvals/history" || key === "approvals/escalations") {
    await applyApprovalReportScope(c, conditions, bindings, "aa");
    if (key === "approvals/escalations") conditions.push("aa.action = 'ESCALATED'");
    addFilter(conditions, bindings, f.module_key, "aa.module_key = ?");
    addFilter(conditions, bindings, f.action_key, "aa.action_key = ?");
    addFilter(conditions, bindings, f.action, "aa.action = ?");
    if (f.date_from) {
      conditions.push("date(aa.created_at) >= date(?)");
      bindings.push(f.date_from);
    }
    if (f.date_to) {
      conditions.push("date(aa.created_at) <= date(?)");
      bindings.push(f.date_to);
    }
    addLikeFilter(conditions, bindings, f.search, ["aa.entity_id", "aa.actor_name_snapshot"]);
    const sql = `SELECT aa.action, aa.module_key, aa.action_key, aa.entity_type, aa.entity_id,
        aa.actor_name_snapshot, aa.previous_status, aa.new_status, aa.reason, aa.created_at
      FROM approval_actions aa
      ${whereClause(conditions)}
      ORDER BY aa.created_at DESC`;
    return queryRows(c, sql, bindings);
  }

  await applyApprovalReportScope(c, conditions, bindings, "ai");
  addFilter(conditions, bindings, f.module_key, "ai.module_key = ?");
  addFilter(conditions, bindings, f.action_key, "ai.action_key = ?");
  addFilter(conditions, bindings, f.status, "ai.status = ?");
  if (f.date_from) {
    conditions.push("date(ai.submitted_at) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(ai.submitted_at) <= date(?)");
    bindings.push(f.date_to);
  }
  addLikeFilter(conditions, bindings, f.search, ["ai.request_title", "ai.entity_id", "ai.workflow_name_snapshot", "e.employee_no", "e.full_name"]);

  if (key === "approvals/pending") conditions.push("ai.status IN ('PENDING', 'PARTIALLY_APPROVED', 'SENT_BACK')");
  if (key === "approvals/overdue") {
    conditions.push("ai.status IN ('PENDING', 'PARTIALLY_APPROVED', 'SENT_BACK')");
    conditions.push("EXISTS (SELECT 1 FROM approval_instance_steps sx WHERE sx.approval_instance_id = ai.id AND sx.status = 'PENDING' AND sx.due_at IS NOT NULL AND datetime(sx.due_at) < datetime('now'))");
  }

  if (key === "approvals/by-module") {
    const sql = `SELECT ai.module_key, ai.action_key, ai.status, COUNT(*) AS count
      FROM approval_instances ai
      LEFT JOIN employees e ON e.id = ai.employee_id
      ${whereClause(conditions)}
      GROUP BY ai.module_key, ai.action_key, ai.status
      ORDER BY ai.module_key, ai.action_key, ai.status`;
    return queryRows(c, sql, bindings);
  }

  if (key === "approvals/by-department" || key === "approvals/by-worksite") {
    const groupColumn = key === "approvals/by-department" ? "COALESCE(d.name, 'Unassigned')" : "COALESCE(l.name, 'Unassigned')";
    const label = key === "approvals/by-department" ? "department" : "location";
    const sql = `SELECT ${groupColumn} AS ${label}, ai.status, COUNT(*) AS count
      FROM approval_instances ai
      LEFT JOIN employees e ON e.id = ai.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      ${whereClause(conditions)}
      GROUP BY ${groupColumn}, ai.status
      ORDER BY ${groupColumn}, ai.status`;
    return queryRows(c, sql, bindings);
  }

  if (key === "approvals/workflow-usage") {
    const sql = `SELECT COALESCE(ai.workflow_code_snapshot, 'fallback') AS workflow_code_snapshot,
        COALESCE(ai.workflow_name_snapshot, 'Fallback / module default') AS workflow_name_snapshot,
        ai.status, COUNT(*) AS count
      FROM approval_instances ai
      LEFT JOIN employees e ON e.id = ai.employee_id
      ${whereClause(conditions)}
      GROUP BY COALESCE(ai.workflow_code_snapshot, 'fallback'), COALESCE(ai.workflow_name_snapshot, 'Fallback / module default'), ai.status
      ORDER BY workflow_name_snapshot, ai.status`;
    return queryRows(c, sql, bindings);
  }

  if (key === "approvals/turnaround-time") {
    conditions.push("ai.completed_at IS NOT NULL");
    const sql = `SELECT ai.module_key, ai.action_key,
        ROUND(AVG((julianday(ai.completed_at) - julianday(ai.submitted_at)) * 24), 2) AS average_hours
      FROM approval_instances ai
      LEFT JOIN employees e ON e.id = ai.employee_id
      ${whereClause(conditions)}
      GROUP BY ai.module_key, ai.action_key
      ORDER BY average_hours DESC`;
    return queryRows(c, sql, bindings);
  }

  const sql = `SELECT ai.request_title, ai.module_key, ai.action_key, ai.entity_type, ai.entity_id,
      ai.employee_id, ai.workflow_name_snapshot, ai.status, ai.current_step_number, ai.submitted_at,
      ai.completed_at, ai.fallback_used, MIN(pending.due_at) AS due_at
    FROM approval_instances ai
    LEFT JOIN employees e ON e.id = ai.employee_id
    LEFT JOIN approval_instance_steps pending ON pending.approval_instance_id = ai.id AND pending.status = 'PENDING'
    ${whereClause(conditions)}
    GROUP BY ai.id
    ORDER BY COALESCE(MIN(pending.due_at), ai.submitted_at) ASC`;
  return queryRows(c, sql, bindings);
}

async function getLifecycleReport(c: Context<AppBindings>, key: string) {
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  await applyReportEmployeeScope(c, conditions, bindings, "employees", "e");
  addCommonEmployeeFilters(conditions, bindings, f, "e");

  if (key.startsWith("onboarding/")) {
    if (key === "onboarding/overdue-tasks") {
      conditions.push("ot.due_date IS NOT NULL AND date(ot.due_date) < date('now')");
      conditions.push("ot.task_status NOT IN ('COMPLETED', 'WAIVED', 'NOT_REQUIRED', 'CANCELLED')");
      const sql = `SELECT oc.case_number, e.employee_no, e.full_name AS employee_name,
          COALESCE(ot.task_name, ot.title) AS task_name, ot.task_group, ot.task_status, ot.due_date, u.name AS assigned_to
        FROM employee_onboarding_tasks ot
        JOIN employee_onboarding_cases oc ON oc.id = ot.onboarding_case_id
        JOIN employees e ON e.id = ot.employee_id
        LEFT JOIN users u ON u.id = ot.assigned_to_user_id
        ${whereClause(conditions)}
        ORDER BY ot.due_date ASC`;
      return queryRows(c, sql, bindings);
    }

    if (key === "onboarding/by-department" || key === "onboarding/by-worksite") {
      const label = key === "onboarding/by-department" ? "department" : "location";
      const group = key === "onboarding/by-department" ? "COALESCE(d.name, 'Unassigned')" : "COALESCE(l.name, 'Unassigned')";
      const sql = `SELECT ${group} AS ${label}, COUNT(*) AS total_cases,
          SUM(CASE WHEN oc.onboarding_status = 'BLOCKED' THEN 1 ELSE 0 END) AS blocked_cases,
          SUM(CASE WHEN oc.activation_status = 'ACTIVATED' THEN 1 ELSE 0 END) AS activated_cases
        FROM employee_onboarding_cases oc
        JOIN employees e ON e.id = oc.employee_id
        LEFT JOIN departments d ON d.id = e.primary_department_id
        LEFT JOIN locations l ON l.id = e.primary_location_id
        ${whereClause(conditions)}
        GROUP BY ${group}
        ORDER BY ${group}`;
      return queryRows(c, sql, bindings);
    }

    if (key === "onboarding/blocked") conditions.push("oc.onboarding_status = 'BLOCKED'");
    if (key === "onboarding/completed") conditions.push("oc.activation_status = 'ACTIVATED' AND strftime('%Y-%m', oc.activated_at) = strftime('%Y-%m', 'now')");
    if (key === "onboarding/overrides") conditions.push("oc.activation_status = 'OVERRIDDEN'");
    const sql = `SELECT oc.case_number, e.employee_no, e.full_name AS employee_name,
        d.name AS department, l.name AS location, p.title AS position,
        oc.onboarding_status, oc.activation_status, oc.due_date, u.name AS assigned_owner,
        oc.created_at, oc.activated_at, oc.blockers_json AS blockers
      FROM employee_onboarding_cases oc
      JOIN employees e ON e.id = oc.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN positions p ON p.id = e.primary_position_id
      LEFT JOIN users u ON u.id = oc.assigned_owner_user_id
      ${whereClause(conditions)}
      ORDER BY oc.created_at DESC`;
    return queryRows(c, sql, bindings);
  }

  if (key.startsWith("offboarding/")) {
    if (key === "offboarding/overdue-tasks") {
      conditions.push("ot.due_date IS NOT NULL AND date(ot.due_date) < date('now')");
      conditions.push("ot.task_status NOT IN ('COMPLETED', 'WAIVED', 'NOT_REQUIRED', 'CANCELLED')");
      const sql = `SELECT oc.case_number, e.employee_no, e.full_name AS employee_name,
          ot.task_name, ot.task_group, ot.task_status, ot.due_date, u.name AS assigned_to
        FROM employee_offboarding_tasks ot
        JOIN employee_offboarding_cases oc ON oc.id = ot.offboarding_case_id
        JOIN employees e ON e.id = ot.employee_id
        LEFT JOIN users u ON u.id = ot.assigned_to_user_id
        ${whereClause(conditions)}
        ORDER BY ot.due_date ASC`;
      return queryRows(c, sql, bindings);
    }

    if (key === "offboarding/by-exit-type") {
      const sql = `SELECT oc.exit_type, COUNT(*) AS total_cases,
          SUM(CASE WHEN oc.offboarding_status != 'COMPLETED' THEN 1 ELSE 0 END) AS pending_cases,
          SUM(CASE WHEN oc.offboarding_status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_cases
        FROM employee_offboarding_cases oc
        JOIN employees e ON e.id = oc.employee_id
        ${whereClause(conditions)}
        GROUP BY oc.exit_type
        ORDER BY oc.exit_type`;
      return queryRows(c, sql, bindings);
    }

    if (key === "offboarding/pending-clearance") conditions.push("oc.offboarding_status = 'WAITING_FOR_CLEARANCE'");
    if (key === "offboarding/pending-final-settlement") conditions.push("oc.offboarding_status = 'WAITING_FOR_FINAL_SETTLEMENT'");
    if (key === "offboarding/pending-payroll-check") conditions.push("oc.offboarding_status = 'WAITING_FOR_PAYROLL'");
    if (key === "offboarding/pending-access-revocation") conditions.push("oc.offboarding_status = 'WAITING_FOR_ACCESS_REVOCATION'");
    if (key === "offboarding/completed") conditions.push("oc.offboarding_status = 'COMPLETED'");
    if (key === "offboarding/overrides") conditions.push("oc.finalization_status = 'OVERRIDDEN'");
    const sql = `SELECT oc.case_number, e.employee_no, e.full_name AS employee_name,
        d.name AS department, l.name AS location, p.title AS position,
        oc.exit_type, oc.last_working_day, oc.offboarding_status, oc.finalization_status,
        oc.due_date, u.name AS assigned_owner, oc.created_at, oc.finalized_at, oc.blockers_json AS blockers
      FROM employee_offboarding_cases oc
      JOIN employees e ON e.id = oc.employee_id
      LEFT JOIN departments d ON d.id = e.primary_department_id
      LEFT JOIN locations l ON l.id = e.primary_location_id
      LEFT JOIN positions p ON p.id = e.primary_position_id
      LEFT JOIN users u ON u.id = oc.assigned_owner_user_id
      ${whereClause(conditions)}
      ORDER BY oc.created_at DESC`;
    return queryRows(c, sql, bindings);
  }

  if (key === "lifecycle/sla-placeholder") {
    const onboardingSql = `SELECT 'Onboarding activation SLA' AS metric, 'Onboarding' AS scope,
        SUM(CASE WHEN oc.activation_status != 'ACTIVATED' THEN 1 ELSE 0 END) AS open_cases,
        SUM(CASE WHEN oc.due_date IS NOT NULL AND date(oc.due_date) < date('now') AND oc.activation_status != 'ACTIVATED' THEN 1 ELSE 0 END) AS overdue_cases,
        SUM(CASE WHEN oc.activation_status = 'ACTIVATED' THEN 1 ELSE 0 END) AS completed_cases,
        NULL AS average_days_placeholder
      FROM employee_onboarding_cases oc
      JOIN employees e ON e.id = oc.employee_id
      ${whereClause(conditions)}`;
    const offboardingSql = `SELECT 'Offboarding finalization SLA' AS metric, 'Offboarding' AS scope,
        SUM(CASE WHEN oc.finalization_status != 'FINALIZED' THEN 1 ELSE 0 END) AS open_cases,
        SUM(CASE WHEN oc.due_date IS NOT NULL AND date(oc.due_date) < date('now') AND oc.finalization_status != 'FINALIZED' THEN 1 ELSE 0 END) AS overdue_cases,
        SUM(CASE WHEN oc.finalization_status = 'FINALIZED' THEN 1 ELSE 0 END) AS completed_cases,
        NULL AS average_days_placeholder
      FROM employee_offboarding_cases oc
      JOIN employees e ON e.id = oc.employee_id
      ${whereClause(conditions)}`;
    return queryRows(c, `${onboardingSql} UNION ALL ${offboardingSql}`, [...bindings, ...bindings]);
  }

  const sql = `SELECT e.employee_no, e.full_name AS employee_name, le.case_type, le.case_id,
      le.action, le.previous_status, le.new_status, le.actor_name_snapshot, le.reason, le.created_at
    FROM employee_lifecycle_events le
    JOIN employees e ON e.id = le.employee_id
    ${whereClause(conditions)}
    ORDER BY le.created_at DESC`;
  return queryRows(c, sql, bindings);
}

async function runReport(c: Context<AppBindings>, key: string) {
  if (key === "employees") return employeeReport(c);
  if (key === "documents") return documentReport(c);
  if (key.startsWith("onboarding/") || key.startsWith("offboarding/") || key.startsWith("lifecycle/")) return getLifecycleReport(c, key);
  if (key.startsWith("documents/")) return getDocumentComplianceReport(c, key);
  if (key.startsWith("approvals/")) return getApprovalReport(c, key);
  if (key === "attendance") return attendanceReport(c);
  if (key.startsWith("attendance-devices/")) return getAttendanceDeviceReport(c, key);
  if (key === "leave") return leaveReport(c);
  if (key === "payroll" || key === "payroll/run-summary" || key === "payroll/employee-history" || key === "payroll/gross-to-net") return getPayrollRunSummaryReport(c);
  if (key === "payroll/period-summary") return getPayrollPeriodSummaryReport(c);
  if (key === "payroll/components") return getPayrollComponentReport(c);
  if (key === "payroll/adjustments") return getPayrollAdjustmentsReport(c);
  if (key === "payroll/payment-status") return getPaymentRegisterReport(c, "payment-register/salary-summary");
  if (key === "payroll/exceptions") return getPayrollExceptionsReport(c);
  if (key.startsWith("pension/remittance-summary")) return getPensionRemittanceReport(c);
  if (key.startsWith("pension/")) return getPensionContributionReport(c);
  if (key === "bank-loans/remittance-summary") return getBankLoanRemittanceReport(c);
  if (key.startsWith("bank-loans/")) return getBankLoanDeductionReport(c, key);
  if (key.startsWith("custom-deductions/")) return getCustomDeductionReport(c, key);
  if (key.startsWith("final-settlement/")) return getFinalSettlementReport(c, key);
  if (key.startsWith("variance/leave")) return getLeavePayrollVarianceReport(c, key);
  if (key.startsWith("variance/roster") || key.startsWith("variance/missing-roster")) return getRosterPayrollVarianceReport(c, key);
  if (key.startsWith("variance/")) return getAttendancePayrollVarianceReport(c, key);
  if (key.startsWith("payment-register/")) return getPaymentRegisterReport(c, key);
  if (key.startsWith("contracts/")) return getContractReport(c, key);
  if (key === "roster") return rosterReport(c);
  if (key === "assets") return assetReport(c);
  if (key.startsWith("assets/") || key.startsWith("uniforms/") || key.startsWith("assets-uniforms/")) return assetUniformReport(c, key);
  if (key === "audit") return auditReport(c);
  throw new Error("REPORT_NOT_FOUND");
}

async function createReportExportLog(c: Context<AppBindings>, input: { reportKey: string; reportName: string; format: string; filters: Record<string, unknown>; rowCount: number; status: "COMPLETED" | "FAILED" | "PLACEHOLDER"; fileName?: string | null; errorMessage?: string | null; sensitiveExport?: boolean; metadata?: Record<string, unknown> }) {
  const user = c.get("currentUser");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO report_export_logs
      (id, report_key, report_name, export_format, filter_snapshot_json, row_count, requested_by_user_id,
       requested_at, completed_at, status, file_name, file_reference, error_message, sensitive_export, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
  ).bind(
    id,
    input.reportKey,
    input.reportName,
    input.format,
    JSON.stringify(input.filters),
    input.rowCount,
    user.id,
    now,
    input.status === "COMPLETED" || input.status === "PLACEHOLDER" ? now : null,
    input.status,
    input.fileName ?? null,
    input.errorMessage ?? null,
    input.sensitiveExport ? 1 : 0,
    input.metadata ? JSON.stringify(input.metadata) : null
  ).run();
  await recordAudit(c.env.DB, {
    actorUserId: user.id,
    action: input.status === "FAILED" ? "report.export_failed" : input.sensitiveExport ? "report.sensitive_export_requested" : "report.export_completed",
    module: "reports",
    entityType: "report_export",
    entityId: id,
    newValue: { report_key: input.reportKey, report_name: input.reportName, format: input.format, rows: input.rowCount, filters: input.filters },
    reason: input.errorMessage ?? null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  await publishAccessEvent(c.env, "report.exported", { actor_user_id: user.id, entity_type: "report", entity_id: id, action: "report.exported" });
  return id;
}

async function runConfiguredReport(c: Context<AppBindings>, reportKey: string, config: ReportConfig) {
  const dateRange = parseReportDateRange(c);
  if ("error" in dateRange) return { error: fail(c, 400, dateRange.error, "The report date range is invalid.") };
  const f = filters(c);
  const filterIssues = await validateOrganizationCascade(c.env.DB, {
    department_id: f.department_id,
    location_id: f.location_id,
    position_id: f.position_id
  });
  if (hasValidationErrors(filterIssues)) return { error: validationResponse(c, filterIssues) };
  const result = await runReport(c, reportKey);
  const rows = maskSensitiveReportFields(c, config, result.rows);
  return { report: { key: reportKey, label: config.label, group: config.group, columns: config.columns, rows, pagination: result.pagination } };
}

reportRoutes.get("/dashboard", async (c) => {
  if (!hasAny(c, ["reports.view"])) {
    return fail(c, 403, "FORBIDDEN", "You do not have permission to view reports.");
  }
  const reports = [];
  for (const [key, config] of Object.entries(reportConfigs)) {
    if (!(await reportModuleEnabled(c, config))) continue;
    reports.push({
      key,
      label: config.label,
      group: config.group,
      module: config.module,
      can_view: canViewReport(c, config),
      can_export: canExportReport(c, config)
    });
  }
  return ok(c, {
    reports
  });
});

reportRoutes.get("/export-logs", async (c) => {
  if (!hasAny(c, ["reports.export.history.view", "reports.manage", "audit.view"])) return fail(c, 403, "REPORT_PERMISSION_DENIED", "You do not have permission to view report export history.");
  const f = filters(c);
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  addFilter(conditions, bindings, f.report_key, "rel.report_key = ?");
  addFilter(conditions, bindings, f.status, "rel.status = ?");
  addFilter(conditions, bindings, f.export_format, "rel.export_format = ?");
  if (f.date_from) {
    conditions.push("date(rel.requested_at) >= date(?)");
    bindings.push(f.date_from);
  }
  if (f.date_to) {
    conditions.push("date(rel.requested_at) <= date(?)");
    bindings.push(f.date_to);
  }
  const { sql, params } = addPagination(
    `SELECT rel.*, u.name AS requested_by_name
     FROM report_export_logs rel
     LEFT JOIN users u ON u.id = rel.requested_by_user_id
     ${whereClause(conditions)}
     ORDER BY rel.requested_at DESC`,
    c
  );
  const logs = (await c.env.DB.prepare(sql).bind(...bindings, ...params).all<ReportRow>()).results;
  return ok(c, { logs });
});

reportRoutes.get("/export-logs/:exportId/download", async (c) => {
  if (!hasAny(c, ["reports.export.history.view", "reports.export"])) return fail(c, 403, "REPORT_EXPORT_NOT_ALLOWED", "You do not have permission to download report exports.");
  return fail(c, 501, "REPORT_EXPORT_FORMAT_NOT_AVAILABLE", "Stored report export downloads will be added in a later export phase.");
});

Object.entries(reportConfigs).forEach(([reportKey, config]) => {
  reportRoutes.get(`/${reportKey}`, async (c) => {
    const disabled = await requireReportModuleEnabled(c, config);
    if (disabled) return disabled;
    const denied = requireReportPermission(c, config);
    if (denied) return denied;
    const result = await runConfiguredReport(c, reportKey, config);
    if ("error" in result) return result.error;
    return ok(c, { report: result.report });
  });

  reportRoutes.get(`/${reportKey}/export.csv`, async (c) => {
    const disabled = await requireReportModuleEnabled(c, config);
    if (disabled) return disabled;
    const denied = requireReportPermission(c, config, "export");
    if (denied) return denied;
    const result = await runConfiguredReport(c, reportKey, config);
    if ("error" in result) return result.error;
    const sensitiveExport = hasSensitiveReportPermission(c, config);
    const fileName = `${REPORT_FILE_PREFIX}-${reportKey.replace(/\//g, "-")}-report.csv`;
    await createReportExportLog(c, { reportKey, reportName: config.label, format: "CSV", filters: filters(c), rowCount: result.report.rows.length, status: "COMPLETED", fileName, sensitiveExport });
    return csvResponse(fileName, config.columns, result.report.rows);
  });

  reportRoutes.post(`/${reportKey}/export`, async (c) => {
    const disabled = await requireReportModuleEnabled(c, config);
    if (disabled) return disabled;
    const denied = requireReportPermission(c, config, "export");
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({})) as { export_format?: string };
    const exportFormat = String(body.export_format ?? c.req.query("export_format") ?? "CSV").toUpperCase();
    if (!["CSV", "JSON", "EXCEL", "PDF"].includes(exportFormat)) return fail(c, 400, "REPORT_EXPORT_FORMAT_NOT_AVAILABLE", "The requested export format is not available.");
    if (exportFormat === "EXCEL" || exportFormat === "PDF") {
      const exportId = await createReportExportLog(c, { reportKey, reportName: config.label, format: exportFormat, filters: filters(c), rowCount: 0, status: "PLACEHOLDER", sensitiveExport: hasSensitiveReportPermission(c, config), metadata: { placeholder: true } });
      return ok(c, { export_id: exportId, status: "PLACEHOLDER", message: "Excel/PDF export will be added in a later export phase." });
    }
    const result = await runConfiguredReport(c, reportKey, config);
    if ("error" in result) return result.error;
    const sensitiveExport = hasSensitiveReportPermission(c, config);
    const fileName = `${REPORT_FILE_PREFIX}-${reportKey.replace(/\//g, "-")}-report.${exportFormat === "CSV" ? "csv" : "json"}`;
    const exportId = await createReportExportLog(c, { reportKey, reportName: config.label, format: exportFormat, filters: filters(c), rowCount: result.report.rows.length, status: "COMPLETED", fileName, sensitiveExport });
    if (exportFormat === "CSV") return csvResponse(fileName, config.columns, result.report.rows);
    return ok(c, { export_id: exportId, report: result.report, generated_at: new Date().toISOString() });
  });
});
