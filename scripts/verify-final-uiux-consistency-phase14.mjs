import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  createCheckCollector,
  exists,
  hasBrowserPromptUsage,
  hasDarkModeMarker,
  packageScripts,
  projectPath,
  read,
  rootDir,
  validateZipListingFromText
} from "./phase12-utils.mjs";

const audit = createCheckCollector();
const check = audit.check;
const scripts = packageScripts();

function readIfExists(relativePath) {
  return exists(relativePath) ? read(relativePath) : "";
}

function sourceFiles(relativeDir) {
  const dir = projectPath(relativeDir);
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = `${current}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "build", ".cache", ".turbo", "coverage"].includes(entry.name)) stack.push(full);
      } else if (/\.(tsx|ts)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  return files;
}

check("Phase 14 verifier package script exists", scripts["verify:final-uiux-consistency-phase14"] === "node scripts/verify-final-uiux-consistency-phase14.mjs");
check("Phase 14 UI guide exists", exists("docs/ui/final-uiux-phase14.md"));
check("Phase 14 visual audit checklist exists", exists("docs/ui/phase14-visual-audit-checklist.md"));

const displayLabels = readIfExists("frontend/src/lib/displayLabels.ts");
const statusBadge = readIfExists("frontend/src/components/ui/status-badge.tsx");
const table = readIfExists("frontend/src/components/ui/table.tsx");
const dataTableShell = readIfExists("frontend/src/components/ui/data-table-shell.tsx");
const dataTableFrame = readIfExists("frontend/src/components/ui/data-table.tsx");
const dialogs = readIfExists("frontend/src/components/ui/dialogs.tsx");
const pageShell = readIfExists("frontend/src/components/ui/page-shell.tsx");
const backgroundJobProgress = readIfExists("frontend/src/components/jobs/BackgroundJobProgress.tsx");
const lifecyclePage = readIfExists("frontend/src/pages/LifecyclePage.tsx");
const wrangler = readIfExists("worker/wrangler.toml");
const password = readIfExists("worker/src/auth/password.ts");
const http = `${readIfExists("worker/src/utils/http.ts")}\n${readIfExists("worker/src/utils/performance.ts")}\n${readIfExists("worker/src/index.ts")}`;

for (const marker of [
  "humanizeTechnicalLabel",
  "formatStatusLabel",
  "formatModuleLabel",
  "formatPaymentMethodLabel",
  "safeDisplayValue",
  "DOCUMENT_COMPLIANCE: \"Document compliance\"",
  "PAYMENT_METHODS: \"Payment methods\"",
  "ASSETS_UNIFORMS: \"Assets & uniforms\"",
  "FINAL_SETTLEMENT: \"Final settlement\"",
  "SELF_SERVICE: \"Self-service\"",
  "READY_FOR_APPROVAL: \"Ready for approval\"",
  "READY_FOR_REVIEW: \"Ready for review\"",
  "NOT_APPLICABLE: \"Not applicable\"",
  "SUPER_ADMIN: \"Super Admin\""
]) {
  check(`display label helper includes ${marker}`, displayLabels.includes(marker));
}

check("StatusBadge uses shared status label formatter", statusBadge.includes("formatStatusLabel") && statusBadge.includes("humanizeStatus"));
check("Background jobs use shared technical label formatter", backgroundJobProgress.includes("humanizeTechnicalLabel(job.job_type"));
check("Table primitive uses min-width guard", table.includes("min-w-full"));
check("Table headers are protected from bad wrapping", table.includes("whitespace-nowrap"));
check("Table cells include min-width guard", table.includes("min-w-0"));
check("ResponsiveTableWrapper uses horizontal overflow guard", dataTableShell.includes("overflow-x-auto") && dataTableShell.includes("overscroll-x-contain"));
check("DataTableFrame routes through ResponsiveTableWrapper", dataTableFrame.includes("ResponsiveTableWrapper"));
check("DetailDrawer has viewport and internal scroll guards", dialogs.includes("max-h-dvh") && dialogs.includes("overflow-y-auto") && dialogs.includes("min-w-0"));
check("ConfirmDialog has viewport and internal scroll guards", dialogs.includes("max-h-[calc(100dvh-3rem)]") && dialogs.includes("overflow-y-auto"));
check("PageActions has wrapping and min-width safeguards", pageShell.includes("PageActions") && pageShell.includes("flex-wrap") && pageShell.includes("min-w-0"));

const visibleRawTokens = [
  "DOCUMENT_COMPLIANCE",
  "PAYMENT_METHODS",
  "ASSETS_UNIFORMS",
  "FINAL_SETTLEMENT",
  "READY_FOR_APPROVAL",
  "READY_FOR_REVIEW",
  "NOT_APPLICABLE",
  "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE",
  "SKIPPED_MINIMUM_NET_PROTECTION"
];
const visibleRawFailures = [];
for (const filePath of sourceFiles("frontend/src")) {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.endsWith("/displayLabels.ts") || normalized.includes("/types/")) continue;
  const content = fs.readFileSync(filePath, "utf8");
  for (const token of visibleRawTokens) {
    const directJsxText = new RegExp(`>\\s*${token}\\s*<`).test(content);
    const directLabelLiteral = new RegExp(`(?:label|title|description|allLabel)\\s*[:=]\\s*["']${token}["']`).test(content);
    if (directJsxText || directLabelLiteral) visibleRawFailures.push(`${normalized}:${token}`);
  }
}
check("no visible raw enum/snake_case labels are introduced", visibleRawFailures.length === 0, visibleRawFailures.slice(0, 8).join("; "));

for (const [file, markers] of Object.entries({
  "frontend/src/pages/EmployeesPage.tsx": ["PageShell", "PageHeader", "PerformanceDataTable"],
  "frontend/src/pages/LifecyclePage.tsx": ["OnboardingEmployeePopupLayout", "onboarding-employee-info-panel", "data-onboarding-section-sidebar"],
  "frontend/src/pages/PayrollRunDetailPage.tsx": ["PerformanceDataTable", "TablePaginationBar"],
  "frontend/src/pages/ReportsPage.tsx": ["PageShell", "PageHeader", "DataTableFrame"],
  "frontend/src/pages/SelfServicePage.tsx": ["PageShell", "MobileListCard"]
})) {
  const content = readIfExists(file);
  for (const marker of markers) check(`${file} keeps ${marker}`, content.includes(marker));
}

check("onboarding popup employee info remains right-side", lifecyclePage.includes("onboarding-employee-info-panel") && lifecyclePage.includes("lg:order-3"));
check("onboarding popup section sidebar completion remains", lifecyclePage.includes("data-onboarding-section-sidebar") && lifecyclePage.includes("<CheckCircle2"));
check("onboarding popup activation remains readiness-aware", lifecyclePage.includes("readinessUpdating") && lifecyclePage.includes("disabled: !canActivate || readinessUpdating"));
check("removed onboarding popup setup tabs are not reintroduced", !lifecyclePage.includes("activeTab === \"Approval Timeline\"") && !lifecyclePage.includes("activeTab === \"Checklist\""));

const requiredRegressionScripts = [
  "verify:form-action-validation-hardening",
  "verify:global-popup-alerts",
  "verify:disabled-module-global-sweep",
  "verify:main-module-submodule-dependencies",
  "verify:sidebar-command-center-welcome",
  "verify:header-search-layout",
  "verify:command-center-dashboard",
  "verify:global-instant-performance-foundation",
  "verify:global-workspace-page-load-reduction",
  "verify:d1-query-payload-optimization",
  "verify:document-upload-acceleration-background",
  "verify:large-list-table-performance",
  "verify:background-jobs-phase7",
  "verify:reports-imports-snapshots-phase8",
  "verify:realtime-events-phase9",
  "verify:frontend-bundle-performance-phase10",
  "verify:performance-observability-phase11",
  "verify:production-readiness-phase12",
  "verify:e2e-workflows-phase13",
  "smoke:production-readiness"
];
for (const scriptName of requiredRegressionScripts) {
  check(`accepted regression verifier remains: ${scriptName}`, Boolean(scripts[scriptName]));
}

check("no browser alert/confirm/prompt usage", !hasBrowserPromptUsage());
check("dark mode was not introduced", !hasDarkModeMarker());
check("authenticated HR API responses remain private/no-store", /private,\s*no-store/i.test(http));
check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000") && !password.includes("210000"));

const finalZip = projectPath("HRM-v2-final-uiux-phase14-clean.zip");
if (fs.existsSync(finalZip)) {
  const result = spawnSync("tar", ["-tf", finalZip], { cwd: rootDir, encoding: "utf8", shell: false });
  check("final Phase 14 ZIP listing can be read", result.status === 0, result.stderr);
  const badEntries = validateZipListingFromText(result.stdout);
  check("final Phase 14 ZIP uses clean forward-slash paths", badEntries.length === 0, badEntries.join("; "));
} else {
  check("final Phase 14 ZIP validation deferred until packaging", true, "HRM-v2-final-uiux-phase14-clean.zip is not present yet.");
}

const failures = audit.failures();
if (failures.length) {
  console.error("Phase 14 final UI/UX consistency verifier failed:");
  for (const failure of failures) console.error(`- ${failure.label}${failure.details ? `: ${failure.details}` : ""}`);
  process.exit(1);
}

console.log(`Phase 14 final UI/UX consistency verifier passed. Checks: ${audit.checks.length}.`);
