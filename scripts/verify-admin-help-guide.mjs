import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function has(relativePath, pattern, message) {
  const content = read(relativePath);
  const ok = pattern instanceof RegExp ? pattern.test(content) : content.includes(pattern);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, pattern, message) {
  const content = read(relativePath);
  const ok = pattern instanceof RegExp ? !pattern.test(content) : !content.includes(pattern);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function ensureExists(relativePath) {
  if (!exists(relativePath)) failures.push(`${relativePath}: missing required file`);
}

const requiredFiles = [
  "frontend/src/pages/AdminHelpGuidePage.tsx",
  "frontend/src/features/admin-help/AdminHelpLink.tsx",
  "frontend/src/features/admin-help/hrmGuideContent.ts",
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/routes/AppRoutes.tsx",
  "database/seed.sql",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts",
  "scripts/verify-prompt23.mjs",
  "scripts/run-production-smoke-checks.mjs"
];

requiredFiles.forEach(ensureExists);

has("package.json", "\"verify:admin-help\": \"node scripts/verify-admin-help-guide.mjs\"", "verify:admin-help script missing");
has("frontend/src/routes/AppRoutes.tsx", "AdminHelpGuidePage", "admin help page is not lazy-routed");
has("frontend/src/routes/AppRoutes.tsx", "path=\"admin/help\"", "admin help route missing");
has("frontend/src/layouts/AppShell.tsx", "OmniCore Guide", "sidebar link missing");
has("frontend/src/layouts/AppShell.tsx", "admin.help.view", "sidebar permission guard missing");

has("database/seed.sql", "admin.help.view", "admin.help.view permission missing from seed");
has("database/seed.sql", "admin.help.manage", "admin.help.manage permission missing from seed");

has("frontend/src/pages/AdminHelpGuidePage.tsx", "PermissionDeniedState", "permission denied state missing");
has("frontend/src/pages/AdminHelpGuidePage.tsx", "canAccessAdminHelp", "page does not use shared admin help access guard");
has("frontend/src/pages/AdminHelpGuidePage.tsx", "guideSearchKeywords", "search keyword index is not wired");
has("frontend/src/pages/AdminHelpGuidePage.tsx", "navigator.clipboard", "copyable checklist support missing");
has("frontend/src/pages/AdminHelpGuidePage.tsx", "Static guide", "static-guide badge missing");
has("frontend/src/features/admin-help/AdminHelpLink.tsx", "admin.help.view", "contextual help link permission guard missing");
has("frontend/src/features/admin-help/AdminHelpLink.tsx", "contextualHelpTargets", "contextual help target map missing");

const guide = "frontend/src/features/admin-help/hrmGuideContent.ts";
[
  "Purpose of this Guide",
  "First-Time System Setup",
  "Initial Super Admin Setup",
  "Users, Roles, Permissions, and Access Scope",
  "Leave Configuration",
  "Attendance Configuration",
  "ZKTeco Biometric Attendance",
  "Roster and Scheduling",
  "Payroll Configuration",
  "Bank Loans",
  "Pension",
  "Custom Deductions",
  "Final Settlement and Exit Payroll",
  "Contracts",
  "Document Compliance",
  "Approval Workflow Builder",
  "Onboarding",
  "Offboarding",
  "Self-Service",
  "Reports and Exports",
  "Data Import",
  "Admin Settings and Production Controls",
  "Hybrid Cache, Sync, and Timeout",
  "Common Configuration Examples",
  "Troubleshooting",
  "Security Rules for Admins",
  "Deployment and Maintenance",
  "Known Limitations",
  "Recommended Operating Routine",
  "Final Notes"
].forEach((marker) => has(guide, marker, `guide marker missing: ${marker}`));

[
  "configure-sick-leave",
  "configure-bank-loan",
  "configure-pension",
  "onboard-employee",
  "offboard-employee",
  "cache-timeout",
  "import-employees",
  "deployment"
].forEach((marker) => has(guide, marker, `guide alias missing: ${marker}`));

[
  "LeaveSettingsPage.tsx",
  "PayrollAdminPages.tsx",
  "PayrollFoundationPages.tsx",
  "AttendanceDeviceOperationsPage.tsx",
  "FinalSettlementPage.tsx",
  "ApprovalsPage.tsx",
  "DataTransferPage.tsx",
  "AdminSettingsPage.tsx"
].forEach((fileName) => has(`frontend/src/pages/${fileName}`, "AdminHelpLink", `${fileName} contextual help link missing`));

const helpFiles = [
  "frontend/src/pages/AdminHelpGuidePage.tsx",
  "frontend/src/features/admin-help/AdminHelpLink.tsx",
  "frontend/src/features/admin-help/hrmGuideContent.ts"
];

const forbiddenIntegrationPattern = /\b(Ollama|WorkersAI|Workers AI|OpenAI|chatCompletion|ai\.run|@cf\/meta|@cf\/mistral|assistant provider)\b/i;
helpFiles.forEach((file) => hasNo(file, forbiddenIntegrationPattern, "help center must stay static and must not add intelligence provider integration"));

const browserPromptPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
[
  ...helpFiles,
  "frontend/src/pages/LeaveSettingsPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/DataTransferPage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx"
].forEach((file) => hasNo(file, browserPromptPattern, "browser alert/confirm/prompt usage is not allowed"));

has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");
has("worker/src/auth/password.ts", "const ITERATIONS = 100000", "PBKDF2 iterations must remain 100000");

if (failures.length) {
  console.error("Admin help guide verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Admin help guide verification passed.");
