import { APP_BRANDING } from "../../config/branding";

export type GuideTone = "info" | "warning" | "success";

export type GuideBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "checklist"; title: string; items: string[] }
  | { type: "callout"; tone: GuideTone; title: string; text: string };

export type GuideSection = {
  id: string;
  title: string;
  navTitle?: string;
  keywords: string[];
  aliases?: string[];
  relatedRoutes?: Array<{ label: string; to: string }>;
  blocks: GuideBlock[];
};

export { ADMIN_HELP_PERMISSION_KEYS, contextualHelpTargets } from "./adminHelpTargets";

export const guideSections: GuideSection[] = [
  {
    id: "purpose",
    title: "Purpose of this Guide",
    keywords: ["purpose", "principles", "server authoritative", "audit", "scope", "security"],
    relatedRoutes: [{ label: "Admin Settings", to: "/settings/admin" }],
    blocks: [
      { type: "paragraph", text: `This guide explains how to configure and operate ${APP_BRANDING.appName} from start to finish. It is intended for Super Admins and authorized HR administrators who manage company setup, employees, leave, attendance, roster, payroll, approvals, documents, assets, onboarding, offboarding, reports, and production controls.` },
      { type: "paragraph", text: `${APP_BRANDING.appName} is server-authoritative: Cloudflare Worker API and D1 are the true source of information, while browser IndexedDB is only a secondary read cache and safe draft cache.` },
      { type: "list", items: ["Every sensitive action must be permission-controlled.", "Employee data must respect department, worksite, location, role, and access scope boundaries.", "Payroll, leave, attendance, bank loans, pension, final settlement, and security decisions must be validated by the backend.", "Employees should only see their own self-service data.", "Protected Owner/Super Admin accounts must never be accidentally disabled, deleted, or demoted.", "All critical actions must be audited."] }
    ]
  },
  {
    id: "first-time-setup",
    title: "First-Time System Setup",
    keywords: ["first time", "setup", "production readiness", "bindings", "seed"],
    relatedRoutes: [{ label: "Production Readiness", to: "/settings/admin?section=readiness" }],
    blocks: [
      { type: "checklist", title: "After deployment, confirm", items: ["Company profile is configured.", "Owner/Super Admin role exists.", "At least one protected Super Admin user exists.", "D1 binding is DB and database is hrm-v2.", "R2 binding is DOCUMENTS_BUCKET.", "Seed data has been applied.", "Production readiness smoke check passes.", "No module is misconfigured in Admin Settings."] },
      { type: "callout", tone: "warning", title: "Before adding real employees", text: "Fix any Production Readiness warning or failed check before adding real employee, payroll, document, or attendance data." }
    ]
  },
  {
    id: "initial-super-admin-setup",
    title: "Initial Super Admin Setup",
    keywords: ["super admin", "owner", "bootstrap", "protected", "first account"],
    relatedRoutes: [{ label: "Users & Access", to: "/users-access" }],
    blocks: [
      { type: "paragraph", text: "The first Owner/Super Admin account is created during bootstrap. It is allowed to be a standalone system user and does not need to be linked to an employee profile." },
      { type: "list", items: ["Keep at least one active protected Owner/Super Admin user.", "Do not share a Super Admin account.", "Use Users & Access to create named administrators.", "Review roles and access scopes before handing access to HR, Finance, Operations, or outlet managers."] }
    ]
  },
  {
    id: "company-setup",
    title: "Company Setup",
    keywords: ["company", "currency", "timezone", "Maldives", "payroll month"],
    relatedRoutes: [{ label: "Company Settings", to: "/settings" }],
    blocks: [
      { type: "paragraph", text: "Go to Settings -> Company Settings and configure company name, registration details, default currency, timezone, default work week, company logo where supported, payroll month rules, and default country/local rules." },
      { type: "list", items: ["Maldives example: Currency MVR.", "Timezone: Indian/Maldives.", "Payroll period: 1st to month end.", "Salary payment date: 10th of the next month."] }
    ]
  },
  {
    id: "users-roles-access-scope",
    title: "Users, Roles, Permissions, and Access Scope",
    keywords: ["users", "roles", "permissions", "access scope", "role mapping", "risk"],
    relatedRoutes: [{ label: "Users & Access", to: "/users-access" }, { label: "Permission Risks", to: "/settings/admin?section=permission-risks" }],
    blocks: [
      { type: "paragraph", text: "Roles define what a user can do. Access scopes define which employees, departments, locations, and records the user can access." },
      { type: "list", items: ["Common roles: Super Admin, HR Admin, HR Officer, Payroll Manager, Payroll Officer, Department Manager, Roster Manager, Asset Handler, Employee Self-Service.", "A Payroll Officer may view payroll periods and prepare payroll but should not finalize payroll, change Super Admin roles, view security logs, or export sensitive payroll unless explicitly required.", "A department manager should usually use own-department or own-worksite scope, not whole-company scope."] },
      { type: "callout", tone: "warning", title: "Permission risk", text: "After major role or scope changes, run Admin Settings -> Permission Risks and resolve critical findings before production work continues." }
    ]
  },
  {
    id: "employee-master-data",
    title: "Employee Master Data",
    keywords: ["employee", "employee 360", "profile", "contacts", "avatar", "status"],
    relatedRoutes: [{ label: "Employees", to: "/employees" }],
    blocks: [
      { type: "paragraph", text: "Employees should be created through the Employee Creation Wizard or onboarding workflow. Employee 360 is the main workspace for profile, job details, contracts, documents, leave, attendance, roster, payroll, payment methods, bank loans, pension, assets/uniforms, lifecycle, notes, and audit history." },
      { type: "checklist", title: "Typical employee setup", items: ["Employee number", "Full name", "Employment type", "Department", "Worksite/location", "Position", "Joining date", "Status", "Reporting manager", "Profile photo/avatar", "Contacts", "Emergency contacts"] },
      { type: "paragraph", text: "Example: Ahmed Rasheed, CA-MLE-0001, Operations, Male Outlet 1, Cashier, joining 2026-07-01, Draft/Onboarding. Activate only when onboarding requirements are satisfied if enforcement is enabled." }
    ]
  },
  {
    id: "organization-structure",
    title: "Organization Structure",
    keywords: ["organization", "departments", "locations", "worksites", "manager", "head"],
    relatedRoutes: [{ label: "Organization Settings", to: "/settings/organization" }],
    blocks: [
      { type: "paragraph", text: "Departments group employees by function. Worksites represent physical working places. Both are used by attendance, roster, access scope, reports, payroll filters, ZKTeco device mapping, asset assignments, and workflow routing." },
      { type: "list", items: ["Example departments: HR, Finance, Operations, Kitchen, Service, IT, Admin.", "Example worksites: Male Outlet 1, Male Outlet 2, Hulhumale Outlet, Addu Outlet, Head Office.", "Departments and worksites can optionally have head/manager employees for reporting and approval foundations."] }
    ]
  },
  {
    id: "leave-configuration",
    title: "Leave Configuration",
    keywords: ["leave", "annual leave", "sick leave", "long leave", "workflow", "documents", "deduction"],
    aliases: ["sick-leave"],
    relatedRoutes: [{ label: "Leave Settings", to: "/leave/settings" }, { label: "Leave Requests", to: "/leave/requests" }],
    blocks: [
      { type: "paragraph", text: "Go to Leave -> Leave Settings -> Leave Types. Configure entitlement days, renewal cycle, approval workflow, salary deduction behavior, document rules, public holiday counting, weekend/off-day counting, and roster-aware work requirements." },
      { type: "checklist", title: "Sick Leave example", items: ["Default entitlement: 30 days.", "Document not required for first 15 used days if request is not more than 2 consecutive chargeable days.", "Document required for more than 2 consecutive sick days.", "Public holidays and weekends are excluded unless roster requires work.", "Salary deduction can start after entitlement is exhausted."] },
      { type: "list", items: ["Annual leave workflow example: Department Senior -> Manager -> HR.", "Long leave workflow example: Manager -> Director -> HR Manager -> Payroll.", "Sick leave workflow example: HR Officer -> HR Manager."] }
    ]
  },
  {
    id: "attendance-configuration",
    title: "Attendance Configuration",
    keywords: ["attendance", "late", "early leave", "missing punch", "correction", "payroll lock"],
    relatedRoutes: [{ label: "Attendance Settings", to: "/attendance/settings" }, { label: "Corrections", to: "/attendance/corrections" }],
    blocks: [
      { type: "paragraph", text: "Go to Attendance -> Attendance Settings and configure module status, late threshold, early leave threshold, missing punch rules, correction request rules, payroll lock rules, biometric import rules, and ZKTeco import settings." },
      { type: "list", items: ["Daily records summarize present, absent, late, early leave, missing punch, leave, sick, payroll locked, and correction pending states.", "If payroll is locked, corrections should warn and require authorized correction/unlock before payroll impact is changed."] }
    ]
  },
  {
    id: "zkteco",
    title: "ZKTeco Biometric Attendance",
    keywords: ["zkteco", "biometric", "device", "csv", "adms", "bridge", "unmatched logs"],
    relatedRoutes: [{ label: "Attendance Imports", to: "/attendance/imports" }, { label: "Biometric Mappings", to: "/attendance/biometric-mappings" }],
    blocks: [
      { type: "paragraph", text: "Add devices under Attendance -> Devices. Supported foundations include ZKTeco CSV import, local bridge placeholder, push/ADMS placeholder, ZKBioTime placeholder, and manual entry." },
      { type: "steps", items: ["Export attendance file from ZKTeco device/software.", "Open Attendance -> Imports.", "Upload CSV.", "Map columns if needed.", "Validate rows.", "Process import.", "Review unmatched, duplicate, and failed rows.", "Attendance daily records update."] },
      { type: "callout", tone: "warning", title: "Biometric privacy", text: `Do not store fingerprint or face templates in ${APP_BRANDING.appName}. Store only safe biometric user ID mappings.` }
    ]
  },
  {
    id: "roster-scheduling",
    title: "Roster and Scheduling",
    keywords: ["roster", "schedule", "shift", "weekly matrix", "cross worksite"],
    relatedRoutes: [{ label: "Roster Weekly", to: "/roster/weekly" }, { label: "Roster Settings", to: "/roster/settings" }],
    blocks: [
      { type: "paragraph", text: "Roster controls expected work schedules. Configure week start day, shift templates, worksite-based roster, publish/approval rules, lock rules, and cross-worksite assignment permission." },
      { type: "list", items: ["Preferred view: employees as rows and days as columns.", "Roster affects expected workdays, expected minutes, off days, public holiday work requirements, cross-midnight shifts, and leave day counting.", "Do not hardcode weekends as off-days; use roster/work requirements."] }
    ]
  },
  {
    id: "payroll-configuration",
    title: "Payroll Configuration",
    keywords: ["payroll", "period", "run", "cutoff", "payslip", "payment register"],
    relatedRoutes: [{ label: "Payroll Settings", to: "/payroll/settings" }, { label: "Payroll Periods", to: "/payroll/periods" }],
    blocks: [
      { type: "paragraph", text: "Go to Payroll -> Settings. Configure payroll cycle, cutoffs, salary components, deductions, pension, bank loans, payment methods, custom deductions, approval flow, and finalization rules." },
      { type: "list", items: ["Recommended schedule: payroll period 1st to month end.", "Employee submission cutoff: 3rd next month.", "Manager/HOD approval cutoff: 5th.", "HR attendance review lock: 6th.", "Draft payroll calculation: 6th/7th.", "Final lock: 8th/9th.", "Salary payment: 10th."] },
      { type: "steps", items: ["Create payroll period.", "Create payroll run.", "Pull employee payroll profiles.", "Pull attendance, leave, and roster impact.", "Calculate salary.", "Review warnings.", "Submit and approve payroll.", "Finalize payroll.", "Generate payslips.", "Prepare payment register.", "Manually confirm payment."] }
    ]
  },
  {
    id: "payment-methods",
    title: "Payment Methods",
    keywords: ["payment methods", "bank transfer", "cash", "split payment", "bank account"],
    relatedRoutes: [{ label: "Payment Institutions", to: "/payroll/payment-institutions" }],
    blocks: [
      { type: "paragraph", text: "Employees can be paid by bank transfer, cash, cheque placeholder, mobile wallet placeholder, other, or split payment. Cash salary is valid and does not require bank details." },
      { type: "list", items: ["Example split: 70% to BML account and 30% cash.", "Each employee can have multiple methods, one primary method, allocation percentage/fixed amount, active/inactive status, and verification status.", "Cash-only employees are usually not normally eligible for bank salary-loan deductions unless eligibility is documented or overridden."] }
    ]
  },
  {
    id: "bank-loans",
    title: "Bank Loan Deductions",
    keywords: ["bank loan", "salary loan", "minimum net salary", "remittance", "direct collection"],
    relatedRoutes: [{ label: "Bank Loans", to: "/payroll/bank-loans" }, { label: "Payroll Settings", to: "/payroll/settings" }],
    blocks: [
      { type: "paragraph", text: "Bank loans are external bank obligations, not salary advances. Track payment institution, loan reference, installment, outstanding balance, deduction start, status, approval, and payment history." },
      { type: "callout", tone: "info", title: "Minimum net salary protection", text: "If deducting an installment would reduce salary below the configured threshold, the installment is skipped, marked SKIPPED_MINIMUM_NET_PROTECTION and BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE, and excluded from employer remittance totals." },
      { type: "list", items: ["Bank remittance reports should show bank, period, employee, reference, scheduled installment, deducted amount, skipped amount, direct collection status, and bank notification status.", "Authorized payroll users can mark the bank as notified with reference, note, and date."] }
    ]
  },
  {
    id: "pension",
    title: "Pension Configuration",
    keywords: ["pension", "MRPS", "employee contribution", "employer contribution", "remittance"],
    relatedRoutes: [{ label: "Pension", to: "/payroll/pension" }, { label: "Payroll Settings", to: "/payroll/settings" }],
    blocks: [
      { type: "paragraph", text: "Pension settings should be configurable and effective-dated. Default Maldives MRPS-style setup can use 7% employee contribution, 7% employer contribution, basic salary only, local employees eligible, and foreign employees off by default unless voluntarily enrolled." },
      { type: "list", items: ["Employee contribution is deducted from salary.", "Employer contribution is company cost and not deducted from salary.", "Payslips should show both when permitted."] }
    ]
  },
  {
    id: "custom-deductions",
    title: "Custom Deductions",
    keywords: ["custom deductions", "visa fee", "medical", "insurance", "installments"],
    relatedRoutes: [{ label: "Custom Deductions", to: "/payroll/custom-deductions" }],
    blocks: [
      { type: "paragraph", text: "Custom deductions are internal/company deductions such as visa fee, medical fee, insurance, work permit fee, accommodation, staff meal, uniform deduction, asset damage, or penalty placeholder." },
      { type: "list", items: ["A template can be one-time, recurring, installment, fixed amount, percentage, approval-required, shown on payslip, shown in self-service, and included in final settlement.", "Visa fee example: total MVR 3,000, 3 installments, MVR 1,000 monthly, show on payslip, include in final settlement."] }
    ]
  },
  {
    id: "final-settlement",
    title: "Final Settlement and Exit Payroll",
    keywords: ["final settlement", "exit payroll", "clearance", "last working day", "termination"],
    relatedRoutes: [{ label: "Exit Payroll", to: "/payroll/exit-payroll" }],
    blocks: [
      { type: "paragraph", text: "Final settlement calculates what the company owes the employee or what the employee owes the company at exit. It reads unpaid salary, pending payroll, leave balance, attendance impact, roster requirement, bank loans, pension, custom deductions, assets/uniforms, advances, and final payment method." },
      { type: "steps", items: ["Create settlement case.", "Enter exit type and last working day.", "Calculate settlement.", "Review warnings.", "Check clearance.", "Submit for approval.", "Approve.", "Finalize.", "Prepare settlement payment register.", "Manually confirm paid/received."] }
    ]
  },
  {
    id: "contracts",
    title: "Contracts",
    keywords: ["contracts", "probation", "renewal", "expiry", "confirmation"],
    relatedRoutes: [{ label: "Contracts", to: "/contracts" }, { label: "Contract Settings", to: "/settings/contracts" }],
    blocks: [
      { type: "paragraph", text: "Contract types include permanent, fixed term, temporary, probation, renewal, part-time placeholder, and consultancy placeholder. Contract lifecycle supports draft, pending approval, active, expiring soon, expired, renewed, terminated, cancelled, and archived statuses." },
      { type: "list", items: ["Contracts support probation, confirmation, renewal, expiry alerts, salary terms snapshot, document link, and Employee 360 integration."] }
    ]
  },
  {
    id: "document-compliance",
    title: "Document Compliance",
    keywords: ["documents", "passport", "visa", "work permit", "expiry", "renewal", "compliance"],
    relatedRoutes: [{ label: "Document Compliance", to: "/documents/compliance" }, { label: "Document Settings", to: "/settings/documents" }],
    blocks: [
      { type: "paragraph", text: "Document types include passport, visa, work permit, ID card, employment contract, medical document, insurance document, education certificate, training certificate, and custom document." },
      { type: "list", items: ["Each type can define expiry required, issue date required, document number required, warning days, urgent warning days, employee visibility, download allowed, sensitive level, payroll warning behavior, and final settlement warning behavior.", "Use compliance dashboards to find missing required documents, expiring documents, expired documents, renewal cases, waivers, and document alerts."] }
    ]
  },
  {
    id: "assets-uniforms",
    title: "Assets and Uniforms",
    keywords: ["assets", "uniforms", "damage", "lost", "clearance", "deduction"],
    relatedRoutes: [{ label: "Assets", to: "/assets" }, { label: "Asset Settings", to: "/assets/settings" }],
    blocks: [
      { type: "paragraph", text: "Track company property such as laptops, phones, tablets, POS devices, biometric devices, keys, access cards, equipment, furniture, and accommodation items. Track uniforms by stock, size, issue, return, damaged/lost quantity, employee assignment, and clearance status." },
      { type: "list", items: ["Asset statuses include available, assigned, returned, damaged, lost, under repair, retired, and archived.", "Lost/damaged item deduction should create or link to a custom deduction assignment.", "Example: lost phone, MVR 1,500, asset damage deduction, payroll deduction yes, final settlement impact yes."] }
    ]
  },
  {
    id: "approval-workflow-builder",
    title: "Approval Workflow Builder",
    keywords: ["approval", "workflow", "delegation", "escalation", "notifications", "self approval"],
    relatedRoutes: [{ label: "Approvals", to: "/approvals/workflows" }, { label: "Approval Settings", to: "/approvals/settings" }],
    blocks: [
      { type: "paragraph", text: "The approval builder lets Super Admin configure approval flows without hardcoding departments or roles. It supports sequential approvals, parallel approvals, any-one approver, all approvers required, delegation, escalation, reminders, and notification templates." },
      { type: "list", items: ["Leave example: Department Senior -> Manager -> HR.", "Payroll finalization example: Payroll Manager -> Super Admin.", "Final settlement example: HR -> Payroll -> Asset Clearance -> Finance -> Final Approval.", "Self-approval is blocked by default."] }
    ]
  },
  {
    id: "onboarding",
    title: "Onboarding",
    keywords: ["onboarding", "draft employee", "activation", "checklist"],
    relatedRoutes: [{ label: "Onboarding", to: "/onboarding" }],
    blocks: [
      { type: "steps", items: ["Create draft employee.", "Complete personal, job, and contact data.", "Add required documents.", "Create contract.", "Set payroll profile.", "Add payment method.", "Configure pension if required.", "Add biometric mapping if required.", "Issue uniform/assets if required.", "Submit activation.", "Approve activation.", "Employee becomes active."] },
      { type: "list", items: ["Common blockers: missing documents, missing contract, payroll profile missing, payment method missing, worksite missing, biometric mapping missing, user access missing, asset/uniform issue pending."] }
    ]
  },
  {
    id: "offboarding",
    title: "Offboarding",
    keywords: ["offboarding", "exit", "clearance", "access revocation"],
    relatedRoutes: [{ label: "Offboarding", to: "/offboarding" }],
    blocks: [
      { type: "steps", items: ["Create offboarding case.", "Enter exit type and last working day.", "Check attendance.", "Check leave balance.", "Check payroll.", "Check bank loan, pension, and custom deductions.", "Clear assets/uniforms.", "Create/finalize final settlement.", "Deactivate access if required.", "Finalize exit."] },
      { type: "list", items: ["System should check pending leave requests, pending attendance corrections, future roster assignments, payroll status, final settlement, asset/uniform clearance, user access revocation, and document checklist."] }
    ]
  },
  {
    id: "self-service",
    title: "Self-Service",
    keywords: ["self-service", "employee portal", "own data", "profile", "leave", "attendance"],
    relatedRoutes: [{ label: "Self-Service", to: "/self-service" }, { label: "Self-Service Settings", to: "/settings/self-service" }],
    blocks: [
      { type: "paragraph", text: "Employees can access their dashboard, profile, leave, attendance, roster, payroll/payslips, payment methods, bank loans, pension, documents, contracts, assets/uniforms, approvals, onboarding/offboarding, and notifications where enabled." },
      { type: "callout", tone: "warning", title: "Self-service security rule", text: "Employees must only see their own data. Never accept a client-supplied employee_id for self-service access to another employee." }
    ]
  },
  {
    id: "reports-exports",
    title: "Reports and Exports",
    keywords: ["reports", "exports", "csv", "audit", "sensitive"],
    relatedRoutes: [{ label: "Report Center", to: "/reports" }, { label: "Export Controls", to: "/settings/admin?section=export-security" }],
    blocks: [
      { type: "paragraph", text: "Reports include payroll, pension, bank loan, custom deduction, final settlement, attendance variance, leave impact, roster impact, payment register, document compliance, contract, asset/uniform, audit/security, onboarding, and offboarding reports." },
      { type: "list", items: ["CSV export is supported.", "JSON/internal output is supported.", "Excel/PDF remain placeholders unless implemented safely.", "Sensitive exports require permission and audit."] }
    ]
  },
  {
    id: "data-import",
    title: "Data Import",
    keywords: ["import", "csv", "templates", "validation", "migration"],
    aliases: ["import-employees"],
    relatedRoutes: [{ label: "Data Import", to: "/settings/admin/imports" }, { label: "Import Templates", to: "/settings/admin/import-templates" }],
    blocks: [
      { type: "paragraph", text: "Use the import center for bulk setup of employees, departments, positions, worksites, users, leave balances, attendance raw logs, roster assignments, payroll profiles, payment methods, bank loans, pension profiles, custom deductions, assets, uniforms, contracts, and document metadata." },
      { type: "steps", items: ["Download template.", "Fill CSV.", "Upload file.", "Validate.", "Review errors/warnings.", "Apply valid rows.", "Review import results."] },
      { type: "callout", tone: "warning", title: "Validation first", text: "Never apply imports without validation." }
    ]
  },
  {
    id: "admin-settings-production-controls",
    title: "Admin Settings and Production Controls",
    keywords: ["admin settings", "production controls", "readiness", "security events", "permission risks"],
    relatedRoutes: [{ label: "Admin Settings", to: "/settings/admin" }],
    blocks: [
      { type: "paragraph", text: "Admin Settings includes settings hub, module controls, consistency checker, audit log viewer, security event log, permission risk checker, access scope review, security settings, system health, production readiness, environment safety, data retention, export security, and admin alerts." },
      { type: "list", items: ["Run production readiness checks regularly.", "Review security events and permission risks after major setup changes.", "Use remote schema tooling only from CLI and only after audit."] }
    ]
  },
  {
    id: "hybrid-cache-timeout",
    title: "Hybrid Cache, Sync, and Timeout",
    keywords: ["cache", "indexeddb", "timeout", "logout", "15 minutes", "security"],
    aliases: ["cache-timeout"],
    relatedRoutes: [{ label: "Security Settings", to: "/settings/admin?section=security-settings" }, { label: "Cache & Sync", to: "/settings/admin?section=cache-sync" }],
    blocks: [
      { type: "paragraph", text: `${APP_BRANDING.appName} uses D1/server as source of truth and IndexedDB as secondary read cache for faster loading, reference data, dashboard summaries, safe drafts, and module cache.` },
      { type: "list", items: ["IndexedDB must not override server decisions.", "Clear sensitive cache on logout, idle timeout, permission change, role/scope change, and session expiry.", "Sensitive cache includes payroll, payslips, bank loans, pension, final settlement, documents, audit/security logs."] },
      { type: "callout", tone: "info", title: "Default idle timeout", text: "The default idle timeout is 15 minutes and can be changed from Security Settings. A warning appears before logout; if ignored, sensitive cache is cleared and the user returns to login." }
    ]
  },
  {
    id: "common-examples",
    title: "Common Configuration Examples",
    keywords: ["examples", "sick leave", "bank loan", "pension", "onboard", "offboard", "import employees"],
    aliases: ["configure-sick-leave", "configure-bank-loan", "configure-pension", "onboard-employee", "offboard-employee"],
    relatedRoutes: [{ label: "Leave Settings", to: "/leave/settings" }, { label: "Payroll Settings", to: "/payroll/settings" }],
    blocks: [
      { type: "checklist", title: "Configure Sick Leave", items: ["Open Leave Settings.", "Open Sick Leave.", "Set entitlement to 30 days.", "Configure document rule: no document for 2 consecutive days or less, required above threshold.", "Configure public holiday and weekend/off-day behavior through roster/work requirement.", "Configure salary deduction after entitlement exhausted if policy says so.", "Save and test with a sample request."] },
      { type: "checklist", title: "Configure Bank Loan Deduction", items: ["Add BML under Payment Institutions if needed.", "Open Employee 360 -> Payroll -> Bank Loans.", "Create loan with bank, reference, monthly installment, active status, and approved status.", "Configure minimum net salary protection.", "Run payroll and review deduction/remittance."] },
      { type: "checklist", title: "Configure Pension", items: ["Open Payroll Settings -> Pension.", "Create/confirm scheme.", "Set employee and employer contribution percentages.", "Set basis as Basic Salary Only.", "Exclude allowances by default.", "Keep foreign employee default off unless voluntarily enrolled.", "Run payroll and review pension report."] },
      { type: "checklist", title: "Onboard a New Employee", items: ["Create employee as draft.", "Add personal and job details.", "Upload required documents.", "Create contract.", "Set payroll profile and payment method.", "Configure pension and biometric mapping if required.", "Issue assets/uniforms if required.", "Submit and approve activation."] },
      { type: "checklist", title: "Offboard an Employee", items: ["Create offboarding case.", "Enter exit type and last working day.", "Refresh checklist.", "Complete attendance, leave, payroll, bank loan, pension, and custom deduction checks.", "Clear assets/uniforms.", "Create, calculate, approve, and finalize settlement.", "Confirm payment, revoke access, and finalize exit."] },
      { type: "checklist", title: "Import Employees", items: ["CSV columns: employee_number, full_name, department_code, position_code, worksite_code, joined_date, status.", "Open Data Import.", "Download template.", "Fill CSV.", "Upload.", "Validate.", "Fix errors.", "Apply valid rows.", "Review results."] }
    ]
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    keywords: ["troubleshooting", "payroll warning", "wrong leave days", "self-service", "unmatched zkteco", "settlement warnings"],
    blocks: [
      { type: "list", items: ["Payroll warning: employee missing payment method. Fix by opening Employee 360 -> Payroll -> Payment Methods, adding/verifying a method, then recalculating payroll.", "Leave request has wrong day count. Check leave type public holiday rule, weekend/off-day rule, roster assignment, employee work requirement, date range, and public holiday setup.", "Employee cannot access self-service. Check linked user, self-service enabled, role permissions, user status, employee status, and SELF_ONLY scope.", "ZKTeco logs are unmatched. Check biometric user ID, employee biometric mapping, device mapping, worksite/location, and duplicate conflicts.", "Final settlement calculation warnings. Check pending payroll, leave, attendance corrections, bank loan status, pension, custom deductions, assets/uniforms, and missing payment method."] }
    ]
  },
  {
    id: "security-rules",
    title: "Security Rules for Admins",
    keywords: ["security", "admin", "super admin", "audit", "secrets", "remote repair"],
    blocks: [
      { type: "checklist", title: "Always remember", items: ["Do not share Super Admin account.", "Do not grant manage permissions to normal employees.", "Do not export sensitive reports unless needed.", "Do not disable protected Super Admin users.", "Do not apply remote DB repair unless schema audit requires it.", "Do not store real secrets in ZIP/source.", "Review audit logs regularly.", "Run permission risk checker after major role changes."] }
    ]
  },
  {
    id: "deployment-maintenance",
    title: "Deployment and Maintenance",
    keywords: ["deployment", "maintenance", "build", "verifiers", "schema", "seed", "worker"],
    aliases: ["deployment"],
    relatedRoutes: [{ label: "Deployment Readiness", to: "/settings/admin/deployment-readiness" }, { label: "Remote D1 Guide", to: "/settings/admin/remote-d1-apply-guide" }],
    blocks: [
      { type: "steps", items: ["Run full build.", "Run all verifiers.", "Run smoke test.", "Run local schema.", "Run local seed.", "Check ZIP cleanliness.", "Audit remote schema.", "Apply remote schema when needed.", "Apply remote seed when needed.", "Deploy Worker.", "Deploy frontend.", "Run manual smoke test."] },
      { type: "callout", tone: "warning", title: "Remote safety", text: "Do not run destructive remote repairs from the browser. Remote schema work should be CLI-audited and reviewed before apply." }
    ]
  },
  {
    id: "known-limitations",
    title: "Known Limitations",
    keywords: ["limitations", "MFA", "bank transfer", "sms", "zkteco bridge", "esignature"],
    blocks: [
      { type: "list", items: ["No direct bank transfer integration.", "No official bank export file.", "No official Pension Office upload file.", "No real MFA yet.", "No SMS/WhatsApp integration.", "No real ZKTeco Windows bridge app yet.", "No live device SDK polling from Cloudflare Worker.", "No biometric template/image storage.", "No official e-signature.", "No employee official document self-upload/replacement.", "No destructive browser-based D1 repair/restore.", "No automated production deployment from browser."] }
    ]
  },
  {
    id: "recommended-operating-routine",
    title: "Recommended Operating Routine",
    keywords: ["routine", "daily", "weekly", "monthly", "backup"],
    blocks: [
      { type: "checklist", title: "Daily", items: ["Check approvals inbox.", "Check attendance warnings.", "Check document/contract alerts.", "Check onboarding/offboarding tasks."] },
      { type: "checklist", title: "Weekly", items: ["Review roster.", "Review missing documents.", "Review attendance corrections.", "Review permission risk warnings."] },
      { type: "checklist", title: "Monthly", items: ["Run payroll.", "Review pension report.", "Review bank loan remittance.", "Review custom deductions.", "Confirm payment register.", "Publish payslips.", "Run reports.", "Backup D1/R2 manually according to company policy."] },
      { type: "checklist", title: "Before major changes", items: ["Run production readiness check.", "Run consistency checker.", "Export backup where appropriate.", "Review audit/security events."] }
    ]
  },
  {
    id: "final-notes",
    title: "Final Notes",
    keywords: ["final notes", "configure", "preview", "validate", "audit", "report"],
    blocks: [
      { type: "paragraph", text: `${APP_BRANDING.appName} is designed to be configurable. Avoid hardcoding company policies unless absolutely necessary.` },
      { type: "steps", items: ["Check module settings.", "Check permissions.", "Check access scope.", "Check audit logs.", "Run consistency checker.", "Review Employee 360.", "Use reports for cross-module confirmation."] },
      { type: "callout", tone: "success", title: "Safest operating pattern", text: "Configure -> Preview -> Validate -> Approve -> Apply -> Audit -> Report." }
    ]
  }
];

export const guideSearchKeywords = guideSections.flatMap((section) => [section.title, section.navTitle ?? section.title, ...section.keywords, ...(section.aliases ?? [])]);
