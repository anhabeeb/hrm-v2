import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function addCheck(name, passed, detail = "") {
  checks.push({ name, passed, detail });
}

function hasAll(text, terms) {
  const lower = text.toLowerCase();
  return terms.every((term) => lower.includes(term.toLowerCase()));
}

const requiredDocs = [
  "docs/user-guides/README.md",
  "docs/user-guides/admin-configuration-guide.md",
  "docs/user-guides/hr-operations-guide.md",
  "docs/user-guides/employee-self-service-guide.md",
  "docs/user-guides/module-settings-guide.md",
  "docs/user-guides/onboarding-offboarding-guide.md",
  "docs/user-guides/document-compliance-guide.md",
  "docs/user-guides/payroll-payment-guide.md",
  "docs/user-guides/attendance-leave-roster-guide.md",
  "docs/user-guides/reports-import-export-guide.md",
  "docs/user-guides/background-jobs-performance-guide.md",
  "docs/user-guides/security-permissions-guide.md",
  "docs/user-guides/troubleshooting-guide.md",
  "docs/user-guides/production-operations-runbook.md"
];

for (const file of requiredDocs) {
  addCheck(`${file} exists`, exists(file));
}

const docText = requiredDocs.filter(exists).map(read).join("\n");
const adminGuide = exists("docs/user-guides/admin-configuration-guide.md") ? read("docs/user-guides/admin-configuration-guide.md") : "";
const moduleGuide = exists("docs/user-guides/module-settings-guide.md") ? read("docs/user-guides/module-settings-guide.md") : "";
const documentGuide = exists("docs/user-guides/document-compliance-guide.md") ? read("docs/user-guides/document-compliance-guide.md") : "";
const payrollGuide = exists("docs/user-guides/payroll-payment-guide.md") ? read("docs/user-guides/payroll-payment-guide.md") : "";
const onboardingGuide = exists("docs/user-guides/onboarding-offboarding-guide.md") ? read("docs/user-guides/onboarding-offboarding-guide.md") : "";
const troubleshootingGuide = exists("docs/user-guides/troubleshooting-guide.md") ? read("docs/user-guides/troubleshooting-guide.md") : "";
const runbook = exists("docs/user-guides/production-operations-runbook.md") ? read("docs/user-guides/production-operations-runbook.md") : "";

addCheck("admin configuration guide includes setup order", hasAll(adminGuide, ["recommended initial configuration order", "role and permission mappings", "module toggles", "production maintenance"]));
addCheck("admin configuration guide documents cascading dependencies", hasAll(adminGuide, ["department -> job level -> position", "parent module disabled -> child submodules inactive", "payroll can work without attendance"]));
addCheck("module guide documents disabled parent/child behavior", hasAll(moduleGuide, ["parent disabled -> children inactive", "child toggles are greyed out", "direct routes are blocked", "settings remain available"]));
addCheck("document guide covers local/foreign rules", hasAll(documentGuide, ["local employee", "foreign employee", "any-scope", "onboarding checklist"]));
addCheck("document guide covers visa/work permit foreign-only behavior", hasAll(documentGuide, ["visa and work permit are foreigner-only by default", "local employees are not blocked"]));
addCheck("payroll guide covers cash vs bank transfer", hasAll(payrollGuide, ["cash does not require bank", "bank transfer requires active payment institution", "switching to cash clears stale bank fields"]));
addCheck("payroll guide covers active bank selector examples", hasAll(payrollGuide, ["bml", "mib", "sbi", "boc", "mcb", "hbl", "cbm", "inactive/archived"]));
addCheck("onboarding guide covers batch upload and activation", hasAll(onboardingGuide, ["batch upload", "row-level progress", "activation remains server-validated", "checklist and approval timeline are not visible"]));
addCheck("troubleshooting guide covers CORS/static asset/D1/R2/job issues", hasAll(troubleshootingGuide, ["x-request-id", "static assets returning html", "remote d1 schema mismatch", "r2 upload", "background job stuck"]));
addCheck("production runbook exists and covers safe repair", hasAll(runbook, ["remote d1 schema audit", "additive repair", "do not drop production tables", "worker deployment", "frontend deployment"]));
addCheck("docs do not include obvious secret placeholders with values", !/(JWT_SECRET\s*=|API_KEY\s*=|PASSWORD\s*=|SECRET_ACCESS_KEY\s*=)/i.test(docText));
addCheck("docs avoid destructive SQL instructions", !/(drop\s+table|delete\s+from|truncate\s+table)/i.test(docText));

const routes = read("frontend/src/routes/AppRoutes.tsx");
const helpPage = read("frontend/src/pages/AdminHelpGuidePage.tsx");
const guideContent = read("frontend/src/features/admin-help/hrmGuideContent.ts");
const helpTargets = read("frontend/src/features/admin-help/adminHelpTargets.ts");
const appShell = read("frontend/src/layouts/AppShell.tsx");

addCheck("in-app Help Center route exists", routes.includes('path="help"') && routes.includes("AdminHelpGuidePage"));
addCheck("admin help route remains available", routes.includes('path="admin/help"'));
addCheck("Help Center sidebar/nav entry exists", appShell.includes("Help Center") && appShell.includes("/help"));
addCheck("Help Center is permission-aware for admins and employees", helpPage.includes("canViewAdminHelp") && helpPage.includes("canViewEmployeeHelp") && helpPage.includes('audiences?.includes("employee")'));
addCheck("self-service users have employee-facing help sections", guideContent.includes('audiences: ["employee"]') && guideContent.includes("Employee Help: Getting Started"));
addCheck("contextual help target map includes Phase 15 topics", hasAll(helpTargets, ["moduleSettings", "documentRules", "paymentMethods", "attendance", "onboardingDocuments", "backgroundJobs", "performance", "reportsImportExport"]));

const contextualFiles = {
  "Settings module help": "frontend/src/pages/SettingsPage.tsx",
  "Document rules help": "frontend/src/pages/DocumentSettingsPage.tsx",
  "Attendance settings help": "frontend/src/pages/AttendanceSettingsPage.tsx",
  "Leave settings help": "frontend/src/pages/LeaveSettingsPage.tsx",
  "Approval workflow help": "frontend/src/pages/ApprovalsPage.tsx",
  "Onboarding help": "frontend/src/pages/LifecyclePage.tsx",
  "Background jobs help": "frontend/src/components/jobs/BackgroundJobDrawer.tsx",
  "Performance dashboard help": "frontend/src/pages/PerformanceDashboardPage.tsx",
  "Reports help": "frontend/src/pages/ReportsPage.tsx",
  "Import/export help": "frontend/src/pages/DataTransferPage.tsx"
};

for (const [name, file] of Object.entries(contextualFiles)) {
  const source = exists(file) ? read(file) : "";
  addCheck(`${name} contextual link exists`, source.includes("AdminHelpLink"));
}

const sourceFiles = [
  "frontend/src/pages/AdminHelpGuidePage.tsx",
  "frontend/src/features/admin-help/hrmGuideContent.ts",
  "frontend/src/features/admin-help/adminHelpTargets.ts",
  "frontend/src/features/admin-help/AdminHelpLink.tsx",
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/pages/SettingsPage.tsx",
  "frontend/src/pages/DocumentSettingsPage.tsx",
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/PerformanceDashboardPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/components/jobs/BackgroundJobDrawer.tsx"
];
const sourceText = sourceFiles.filter(exists).map(read).join("\n");
addCheck("browser alert/confirm/prompt not introduced", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(sourceText));
addCheck("dark mode not introduced", !/\bdark:/.test(sourceText));

const wrangler = read("worker/wrangler.toml");
addCheck("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
addCheck("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));

const workerText = fs.readdirSync(path.join(root, "worker/src"), { recursive: true })
  .filter((entry) => String(entry).endsWith(".ts"))
  .map((entry) => read(path.join("worker/src", String(entry))))
  .join("\n");
addCheck("PBKDF2 remains 100000", workerText.includes("100000"));

const packageJson = read("package.json");
for (const script of [
  "verify:final-uiux-consistency-phase14",
  "verify:e2e-workflows-phase13",
  "verify:production-readiness-phase12",
  "verify:performance-observability-phase11",
  "verify:frontend-bundle-performance-phase10",
  "verify:realtime-events-phase9",
  "verify:reports-imports-snapshots-phase8",
  "verify:background-jobs-phase7",
  "verify:large-list-table-performance",
  "verify:document-upload-acceleration-background"
]) {
  addCheck(`${script} remains registered`, packageJson.includes(`"${script}"`));
}

const failed = checks.filter((check) => !check.passed);
if (failed.length) {
  console.error("Phase 15 documentation verifier failed:");
  for (const check of failed) {
    console.error(`- ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
  }
  process.exit(1);
}

console.log(`Phase 15 documentation verifier passed (${checks.length} checks).`);
