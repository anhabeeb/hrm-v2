import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

function includes(file, marker, message = `${file} contains ${marker}`) {
  assert(read(file).includes(marker), message);
}

function notMatches(file, pattern, message) {
  assert(!pattern.test(read(file)), message);
}

const lifecycle = read("worker/src/routes/lifecycle.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");
const packageJson = read("package.json");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

includes("worker/src/routes/lifecycle.ts", "getOnboardingDashboardSummary", "onboarding dashboard summary helper exists");
includes("worker/src/routes/lifecycle.ts", '"/dashboard-summary"', "onboarding dashboard summary API exists");
includes("frontend/src/lib/api.ts", "getOnboardingDashboardSummary", "frontend dashboard summary API helper exists");

[
  "Total Onboarding Cases",
  "Draft / Not Started Cases",
  "In Progress Cases",
  "Ready for Activation",
  "Blocked Cases",
  "Overdue Cases",
  "Starting This Week",
  "Pending Documents",
  "Pending Contract Setup",
  "Pending User Account Setup",
  "Pending Payroll Setup",
  "Pending Approvals"
].forEach((title) => assert(lifecycle.includes(title), `required KPI exists: ${title}`));

[
  "pending_documents",
  "pending_contract_setup",
  "pending_user_account_setup",
  "pending_payroll_setup",
  "pending_approvals",
  "enabled: hasContracts",
  "enabled: hasPayroll",
  "enabled: hasDocuments",
  "enabled: hasUserAccount",
  "enabled: hasApprovals"
].forEach((marker) => assert(lifecycle.includes(marker), `KPI module/permission marker exists: ${marker}`));

assert(lifecycle.includes("listOnboardingCases(c)") && lifecycle.includes("buildEmployeeScopeWhereClause"), "KPI counts use scoped onboarding cases");
assert(lifecycle.includes("try {") && lifecycle.includes("warnings.push") && lifecycle.includes("ONBOARDING_DASHBOARD_SUMMARY_FAILED"), "summary groups fail safely without raw D1 errors");
assert(lifecycle.includes("EMPLOYEE_ACTIVATION_NOT_READY") && lifecycle.includes("action_errors") && lifecycle.includes("readiness"), "backend activation readiness enforcement returns structured blockers");

[
  "OnboardingDashboardSection",
  "data-onboarding-dashboard-kpis",
  "data-onboarding-blocker-readiness-summary",
  "data-onboarding-priority-actions",
  "applyOnboardingDashboardQuery",
  "StandardFilterBar",
  "StandardSearchInput",
  "StandardSelectFilter",
  "StandardDateRangeFilter",
  "MoreFiltersSheet",
  "FilterResetButton",
  "SaveFilterViewButton",
  "ActiveFilterChips",
  "ExportMenu",
  "CardSkeleton",
  "TableSkeleton"
].forEach((marker) => assert(lifecyclePage.includes(marker), `onboarding dashboard UI marker exists: ${marker}`));

[
  "Missing required employee data",
  "Invalid Department / Job Level / Position mapping",
  "Missing required documents",
  "Pending contract setup",
  "Pending payroll setup",
  "Pending user account setup",
  "Pending approvals",
  "Pending asset/uniform setup",
  "Policy/module not available",
  "No permission / assigned owner issue"
].forEach((marker) => assert(lifecycle.includes(marker), `blocker summary marker exists: ${marker}`));

[
  "OnboardingReadinessPills",
  "data-onboarding-readiness-pills",
  "Setup Readiness",
  "Activation Readiness",
  "Required Setup",
  "Ready for Activation",
  "No Permission",
  "Disabled",
  "Not Required",
  "Complete",
  "Blocked",
  "Missing"
].forEach((marker) => assert(lifecyclePage.includes(marker), `workspace readiness marker exists: ${marker}`));

assert(lifecyclePage.includes("Refresh setup") && !lifecyclePage.includes("Refresh checklist</ActionTextButton>"), "workspace setup action avoids incorrect checklist wording");
assert(lifecyclePage.includes("disabled={!canActivate}") && lifecyclePage.includes("border-emerald-600 bg-emerald-600"), "activate button remains permission/readiness gated and green when ready");
assert(lifecyclePage.includes("showSuccess") && lifecyclePage.includes("showApiError"), "global popup alerts are used for onboarding workspace actions");
assert(lifecyclePage.includes("validateWorkspaceJobAssignment") || lifecycle.includes("validateWorkspaceJobAssignment"), "field-level/structured validation foundation remains connected");
assert(lifecycle.includes("lifecycleEmployeeEmailSuggestion") && lifecycle.includes("employee_email_fallback"), "employee email default provisioning did not regress");
assert(lifecycle.includes("action === \"provision_new\"") && lifecycle.includes("action === \"link_existing\"") && lifecycle.includes("ensureLifecycleSelfOnlyScope"), "real user provisioning/linking and access scope assignment remain present");
assert(lifecycle.includes("document_type_warning") && lifecycle.includes("COALESCE(allowed_mime_types"), "document setup state remains safe and metadata-backed");
assert(lifecycle.includes("contractTypes") && lifecycle.includes("payrollProfile") && lifecycle.includes("optional_section_states"), "document/contract/payroll setup states remain module/permission aware");
assert(!/\/contracts[^\n]+retry|setInterval\([^)]*contracts|setInterval\([^)]*pension|setInterval\([^)]*payment/i.test(lifecyclePage), "no repeated optional-section 403 spam pattern in onboarding UI");

[
  "verify:dependency-security-cleanup",
  "verify:professional-app-loader",
  "verify:global-popup-alerts",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "verify:button-color-standardization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
].forEach((script) => assert(packageJson.includes(script), `${script} remains available`));

notMatches("frontend/src/pages/LifecyclePage.tsx", /\b(window\.)?(alert|confirm|prompt)\s*\(/, "LifecyclePage has no browser alert/confirm/prompt");
notMatches("worker/src/routes/lifecycle.ts", /\b(window\.)?(alert|confirm|prompt)\s*\(/, "lifecycle route has no browser alert/confirm/prompt");
assert(!/\bdark:/.test(lifecyclePage), "no dark mode classes introduced in lifecycle page");
assert(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding unchanged");
assert(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding unchanged");
assert(password.includes("PBKDF2_ITERATIONS = 100000") || password.includes("100000"), "PBKDF2 remains 100000");

if (process.exitCode) {
  console.error("Onboarding dashboard KPI verification failed.");
  process.exit(process.exitCode);
}

console.log("Onboarding dashboard KPI verification passed.");
