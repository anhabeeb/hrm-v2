import { spawnSync } from "node:child_process";
import fs from "node:fs";
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

check("Phase 13 e2e package script exists", scripts["e2e:hrm-workflows-phase13"] === "node scripts/e2e-hrm-workflows-phase13.mjs");
check("Phase 13 verifier package script exists", scripts["verify:e2e-workflows-phase13"] === "node scripts/verify-e2e-workflows-phase13.mjs");
check("Phase 13 e2e script exists", exists("scripts/e2e-hrm-workflows-phase13.mjs"));
check("Phase 13 verifier script exists", exists("scripts/verify-e2e-workflows-phase13.mjs"));
check("Phase 13 workflow guide exists", exists("docs/production/phase13-e2e-workflow-validation.md"));
check("Phase 13 manual UI checklist exists", exists("docs/production/phase13-manual-ui-workflow-checklist.md"));

const e2e = exists("scripts/e2e-hrm-workflows-phase13.mjs") ? read("scripts/e2e-hrm-workflows-phase13.mjs") : "";
const workflowDoc = exists("docs/production/phase13-e2e-workflow-validation.md") ? read("docs/production/phase13-e2e-workflow-validation.md") : "";
const checklistDoc = exists("docs/production/phase13-manual-ui-workflow-checklist.md") ? read("docs/production/phase13-manual-ui-workflow-checklist.md") : "";
const packageJson = read("package.json");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

check("write tests are disabled by default", e2e.includes("HRM_E2E_ENABLE_WRITES") && /enableWrites\s*=\s*process\.env\.HRM_E2E_ENABLE_WRITES\s*===\s*\"true\"/.test(e2e));
check("production writes require explicit confirmation", e2e.includes("HRM_E2E_ALLOW_PRODUCTION_WRITES") && e2e.includes("allowProductionWrites"));
check("test prefix is supported", e2e.includes("HRM_E2E_TEST_PREFIX") && e2e.includes("E2E-P13"));
check("API/frontend/token/company env vars are supported", ["HRM_E2E_API_URL", "HRM_E2E_FRONTEND_URL", "HRM_E2E_AUTH_TOKEN", "HRM_E2E_TEST_COMPANY_ID"].every((marker) => e2e.includes(marker)));
check("dry-run/source validation mode is present", e2e.includes("dry-run/source validation") || e2e.includes("source validation only"));
check("script does not hardcode test credentials", !/(password\s*[:=]\s*[\"'][^\"']+[\"']|Bearer\s+[A-Za-z0-9_.-]{12,}|HRM_E2E_AUTH_TOKEN\s*=\s*[\"'])/i.test(e2e));

const scenarioMarkers = {
  "local employee onboarding scenario": ["Local employee onboarding", "LOCAL", "Visa", "Work Permit"],
  "foreign employee onboarding scenario": ["Foreign employee onboarding", "FOREIGN", "Passport", "Visa", "Work Permit"],
  "document batch upload scenario": ["Document batch upload", "row-level progress", "Retry"],
  "payroll cash/bank transfer scenario": ["Cash", "Bank Transfer", "account_number"],
  "employee activation scenario": ["Activation", "activate", "readiness"],
  "user account linking scenario": ["user account linking", "create-login", "link-user"],
  "self-service enforcement scenario": ["self-service", "requireActiveSelfServiceEmployee"],
  "attendance/leave/payroll scenario": ["Attendance", "Leave", "Payroll"],
  "offboarding scenario": ["Offboarding", "final settlement"],
  "disabled-module scenario": ["Disabled-module", "module_visibility"],
  "permission/security scenario": ["Permission/security", "requireAnyPermission"],
  "reports/import/export scenario": ["Reports", "import", "export"],
  "background job/event/performance scenario": ["background_jobs", "app_events", "performance"]
};

for (const [label, markers] of Object.entries(scenarioMarkers)) {
  const body = `${e2e}\n${workflowDoc}\n${checklistDoc}`;
  check(`${label} exists`, markers.every((marker) => body.includes(marker)));
}

const requiredScripts = [
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
  "verify:cors-request-id-hotfix",
  "verify:onboarding-employee-popup-layout",
  "verify:onboarding-batch-document-upload",
  "verify:onboarding-document-payroll-validation",
  "verify:sidebar-command-center-welcome",
  "verify:header-search-layout",
  "verify:command-center-dashboard",
  "verify:global-search-notifications",
  "verify:global-popup-alerts",
  "verify:disabled-module-global-sweep",
  "verify:main-module-submodule-dependencies",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "smoke:production-readiness"
];

for (const scriptName of requiredScripts) {
  check(`accepted Phase 1-12/HRM verifier remains: ${scriptName}`, Boolean(scripts[scriptName]));
}

check("scenario report docs are documented", workflowDoc.includes("phase13-e2e-run-results.md") && checklistDoc.includes("Manual UI Workflow Checklist"));
check("no browser alert/confirm/prompt usage", !hasBrowserPromptUsage());
check("dark mode was not introduced", !hasDarkModeMarker());
check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000") && !password.includes("210000"));
check("package scripts include Phase 13 commands only as safe scripts", packageJson.includes("e2e:hrm-workflows-phase13") && packageJson.includes("verify:e2e-workflows-phase13"));

const finalZip = projectPath("HRM-v2-e2e-workflows-phase13-clean.zip");
if (fs.existsSync(finalZip)) {
  const result = spawnSync("tar", ["-tf", finalZip], { cwd: rootDir, encoding: "utf8", shell: false });
  check("final Phase 13 ZIP listing can be read", result.status === 0, result.stderr);
  const badEntries = validateZipListingFromText(result.stdout);
  check("final Phase 13 ZIP cleanup rules hold", badEntries.length === 0, badEntries.join("; "));
} else {
  check("final Phase 13 ZIP validation deferred until packaging", true, "HRM-v2-e2e-workflows-phase13-clean.zip is not present yet.");
}

const failures = audit.failures();
if (failures.length) {
  console.error("Phase 13 E2E workflow verifier failed:");
  for (const failure of failures) console.error(`- ${failure.label}${failure.details ? `: ${failure.details}` : ""}`);
  process.exit(1);
}

console.log(`Phase 13 E2E workflow verifier passed. Checks: ${audit.checks.length}.`);
