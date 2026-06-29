import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(filePath(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function has(relativePath, marker, message) {
  if (!exists(relativePath)) return failures.push(`${relativePath}: missing file`);
  const text = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(text) : text.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  if (!exists(relativePath)) return;
  const text = read(relativePath);
  const ok = marker instanceof RegExp ? !marker.test(text) : !text.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function collectFiles(dir) {
  const fullDir = filePath(dir);
  if (!fs.existsSync(fullDir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".wrangler"].includes(entry.name)) continue;
    const relative = path.join(dir, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...collectFiles(relative));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const pkg = JSON.parse(read("package.json"));
if (pkg.scripts?.["verify:branding-standardization"] !== "node scripts/verify-branding-standardization.mjs") {
  failures.push("package.json: missing verify:branding-standardization script.");
}

[
  "frontend/src/config/branding.ts",
  "frontend/src/pages/LoginPage.tsx",
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/components/loading/AppLoader.tsx",
  "frontend/src/components/loading/PageLoader.tsx",
  "frontend/src/pages/DashboardPage.tsx",
  "frontend/src/pages/AdminHelpGuidePage.tsx",
  "frontend/src/features/admin-help/hrmGuideContent.ts",
  "frontend/src/lib/export-utils.ts",
  "frontend/src/lib/import-utils.ts",
  "worker/src/utils/report-export.ts",
  "worker/src/routes/data-transfer.ts",
  "worker/src/routes/reports.ts",
  "frontend/public/_headers",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts"
].forEach((file) => {
  if (!exists(file)) failures.push(`${file}: missing required branding/verifier file.`);
});

has("frontend/src/config/branding.ts", 'appName: "OmniCore - HR"', "appName must be OmniCore - HR.");
has("frontend/src/config/branding.ts", 'appShortName: "OmniCore"', "appShortName must be OmniCore.");
has("frontend/src/config/branding.ts", 'appModuleName: "HR"', "appModuleName must remain HR.");
has("frontend/src/config/branding.ts", "Secure workforce, payroll, attendance, and employee operations platform.", "login subtitle copy missing.");
has("frontend/src/config/branding.ts", 'browserTitle: "OmniCore - HR"', "browser title branding missing.");

has("frontend/index.html", "<title>OmniCore - HR</title>", "browser title must use OmniCore - HR.");
has("frontend/index.html", 'name="application-name" content="OmniCore - HR"', "application-name metadata missing.");
has("frontend/index.html", "Enterprise HR, payroll, attendance, onboarding, and workforce operations platform.", "browser meta description missing.");

has("frontend/src/pages/LoginPage.tsx", "APP_BRANDING.loginTitle", "login title must come from branding config.");
has("frontend/src/pages/LoginPage.tsx", "APP_BRANDING.loginSubtitle", "login subtitle must come from branding config.");
has("frontend/src/pages/LoginPage.tsx", "Redirecting to ${APP_BRANDING.appName}", "login success alert must use branding config.");
hasNo("frontend/src/pages/LoginPage.tsx", "HRM v2", "login page must not show legacy product name.");

has("frontend/src/layouts/AppShell.tsx", "APP_BRANDING.appName", "sidebar expanded brand must use branding config.");
has("frontend/src/layouts/AppShell.tsx", "APP_BRANDING.appShortName", "header breadcrumb must use branding short name.");
has("frontend/src/layouts/AppShell.tsx", "APP_BRANDING.tagline", "sidebar tagline must use branding config.");
has("frontend/src/layouts/AppShell.tsx", "OC", "collapsed sidebar initials must be clean branded initials.");
has("frontend/src/layouts/AppShell.tsx", "Command Center", "Command Center top-level navigation must remain.");
has("frontend/src/layouts/AppShell.tsx", "OmniCore Guide", "help navigation must use OmniCore branding.");
hasNo("frontend/src/layouts/AppShell.tsx", "HRM v2", "app shell must not show legacy product name.");
hasNo("frontend/src/layouts/AppShell.tsx", "HRM Guide", "help navigation must not use legacy brand.");

has("frontend/src/components/loading/AppLoader.tsx", "APP_BRANDING.loaderTitle", "AppLoader must use branding config.");
has("frontend/src/components/loading/AppLoader.tsx", "APP_BRANDING.appName", "AppLoader visible brand must use branding config.");
has("frontend/src/components/loading/PageLoader.tsx", "APP_BRANDING.appName", "PageLoader copy must use branding config.");
hasNo("frontend/src/components/loading/AppLoader.tsx", "HRM v2", "AppLoader must not show legacy product name.");

has("frontend/src/pages/DashboardPage.tsx", "OmniCore Command Center", "Command Center header must use OmniCore branding.");
has("frontend/src/pages/DashboardPage.tsx", "APP_BRANDING.appName", "Command Center eyebrow must use branding config.");
has("frontend/src/pages/AdminHelpGuidePage.tsx", "APP_BRANDING.appName", "Admin help page must use branding config.");
has("frontend/src/features/admin-help/hrmGuideContent.ts", "APP_BRANDING.appName", "Admin help content must use branding config.");

has("frontend/src/lib/export-utils.ts", "APP_BRANDING.appName", "frontend export metadata must use branding config.");
has("frontend/src/lib/export-utils.ts", "omnicore-hr-", "frontend export filenames must use branded prefix.");
has("frontend/src/lib/export-utils.ts", '["Application", APP_BRANDING.appName]', "frontend XLSX metadata must include application branding.");
has("frontend/src/lib/import-utils.ts", "APP_BRANDING.appShortName", "frontend import template guidance must use branding config.");
has("worker/src/utils/report-export.ts", 'REPORT_APP_NAME = "OmniCore - HR"', "Worker report metadata must use OmniCore - HR.");
has("worker/src/utils/report-export.ts", 'REPORT_FILE_PREFIX = "omnicore-hr"', "Worker report filenames must use branded prefix.");
has("worker/src/utils/report-export.ts", '["Application", REPORT_APP_NAME]', "Worker XLSX metadata must include application branding.");
has("worker/src/routes/data-transfer.ts", "REPORT_FILE_PREFIX", "Data transfer filenames must use report file prefix.");
has("worker/src/routes/reports.ts", 'REPORT_FILE_PREFIX = "omnicore-hr"', "Report route filenames must use branded prefix.");
has("worker/src/routes/payroll.ts", "Confidential OmniCore - HR payroll document", "payslip generated document note must use product branding.");

const forbiddenVisiblePhrases = [
  "HRM v2",
  "HRM Command Center",
  "HRM Guide",
  "Search HRM",
  "Loading HRM",
  "Preparing HRM",
  "Sign in to HRM",
  "Use your HRM",
  "HRM notifications",
  "IndexedDB HRM",
  "HRM reference data"
];

const frontendFiles = collectFiles("frontend/src")
  .filter((file) => !file.startsWith("frontend/src/lib/cache/"))
  .filter((file) => file !== "frontend/src/lib/api.ts");

for (const file of frontendFiles) {
  const text = read(file);
  for (const phrase of forbiddenVisiblePhrases) {
    if (text.includes(phrase)) failures.push(`${file}: forbidden visible legacy product label "${phrase}" found.`);
  }
  if (/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(text)) failures.push(`${file}: browser alert/confirm/prompt is not allowed.`);
  if (/\bdark:|darkMode\b/.test(text)) failures.push(`${file}: dark mode marker is not allowed.`);
}

const headers = read("frontend/public/_headers");
if (!headers.includes("/index.html") || !/Cache-Control:[^\n]*no-cache/.test(headers)) failures.push("frontend/public/_headers: index.html no-cache header missing.");
if (!headers.includes("/assets/*") || !headers.includes("max-age=31536000") || !headers.includes("immutable")) failures.push("frontend/public/_headers: immutable /assets cache header missing.");

has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database_name must remain hrm-v2.");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed.");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket name changed.");
has("worker/src/auth/password.ts", "MAX_WORKER_PBKDF2_ITERATIONS = 100000", "PBKDF2 max iterations must remain 100000.");

[
  "verify:client-side-speed-polish",
  "verify:disabled-module-global-sweep",
  "verify:onboarding-dashboard-kpis",
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
  "verify:command-center-dashboard",
  "verify:settings-toggles-tabs-layout",
  "verify:payroll-submodules",
  "verify:onboarding-workspace",
  "verify:performance-optimization",
  "verify:global-search-notifications",
  "verify:shadcn-navigation-tabs",
  "verify:navigation-tabs",
  "verify:page-layout-consistency",
  "smoke:production-readiness"
].forEach((scriptName) => {
  if (!pkg.scripts?.[scriptName]) failures.push(`package.json: missing regression script ${scriptName}.`);
});

if (failures.length) {
  console.error("Branding standardization verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Branding standardization verification passed.");
