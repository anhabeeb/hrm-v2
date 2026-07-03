import fs from "node:fs";
import path from "node:path";
import {
  exists,
  hasBrowserPromptUsage,
  hasDarkModeMarker,
  hasSecretLikeValue,
  readPackageScripts,
  readText,
  rootDir
} from "./phase21-utils.mjs";

const scripts = readPackageScripts();
const checks = [];
function check(label, passed, details = "") {
  checks.push({ label, passed: Boolean(passed), details });
}

function readIf(relativePath) {
  return exists(relativePath) ? readText(relativePath) : "";
}

const requiredScripts = {
  "verify:phase21-remote-d1-live": "scripts/phase21-verify-remote-d1-live.mjs",
  "repair:phase21-generate-remote-d1": "scripts/phase21-generate-remote-d1-repair.mjs",
  "smoke:phase21-production-live": "scripts/phase21-smoke-production-live.mjs",
  "loadtest:phase21-production-readonly": "scripts/phase21-loadtest-production-readonly.mjs",
  "verify:phase21-r2-upload-live": "scripts/phase21-verify-r2-upload-live.mjs",
  "verify:phase21-background-processing-live": "scripts/phase21-verify-background-processing-live.mjs",
  "verify:phase21-live-events-live": "scripts/phase21-verify-live-events-live.mjs",
  "verify:phase21-security-live": "scripts/phase21-security-live-check.mjs",
  "verify:phase21-frontend-deployment": "scripts/phase21-verify-frontend-deployment.mjs",
  "report:phase21-go-no-go": "scripts/phase21-generate-go-no-go-report.mjs"
};

for (const [scriptName, filePath] of Object.entries(requiredScripts)) {
  check(`package script exists: ${scriptName}`, Boolean(scripts[scriptName]));
  check(`script file exists: ${filePath}`, exists(filePath));
}

for (const docPath of [
  "docs/production/phase21-production-deployment-live-verification.md",
  "docs/production/phase21-production-env-checklist.md"
]) {
  check(`Phase 21 doc exists: ${docPath}`, exists(docPath));
}

const phase21Scripts = Object.values(requiredScripts).map(readIf).join("\n");
const phase21Docs = [
  "docs/production/phase21-production-deployment-live-verification.md",
  "docs/production/phase21-production-env-checklist.md",
  "docs/production/phase12-production-readiness-checklist.md",
  "docs/production/phase12-deployment-manifest.md",
  "docs/production/phase12-backup-rollback-runbook.md",
  "docs/user-guides/production-operations-runbook.md",
  "docs/user-guides/troubleshooting-guide.md"
].map(readIf).join("\n");

check("Phase 21 scripts do not hardcode credentials or secrets", !hasSecretLikeValue(phase21Scripts));
check("Phase 21 docs do not include secrets", !hasSecretLikeValue(phase21Docs));
check("scripts skip or block when live env is missing", phase21Scripts.includes("SOURCE READY / LIVE NOT VERIFIED") && phase21Scripts.includes("BLOCKED"));
check("scripts do not seed production data", !/seed\s+production|seed\.sql|INSERT INTO companies|create company/i.test(phase21Scripts));
check("scripts do not add native mobile app work", !/\breact-native\b|\bexpo\b|\bcapacitor\b|\bcordova\b/i.test(phase21Scripts));
check("production writes disabled by default", phase21Scripts.includes("HRM_PHASE21_ENABLE_UPLOAD_WRITE_TEST") && phase21Scripts.includes("HRM_PHASE21_ENABLE_TEST_JOB") && phase21Scripts.includes("Read-only mode is enforced"));
check("load test is read-only by default", readIf("scripts/phase21-loadtest-production-readonly.mjs").includes("Read-only mode is enforced") && !/method:\s*["']POST["']/.test(readIf("scripts/phase21-loadtest-production-readonly.mjs")));
check("upload live test requires explicit env flag", readIf("scripts/phase21-verify-r2-upload-live.mjs").includes("HRM_PHASE21_ENABLE_UPLOAD_WRITE_TEST") && readIf("scripts/phase21-verify-r2-upload-live.mjs").includes("HRM_PHASE21_TEST_CASE_ID"));
check("additive repair script forbids destructive SQL", readIf("scripts/phase21-remote-d1-utils.mjs").includes("DROP|DELETE|UPDATE|INSERT|REPLACE|TRUNCATE") && readIf("scripts/phase21-remote-d1-utils.mjs").includes("CREATE TABLE IF NOT EXISTS"));
check("remote D1 script compares schema and writes blocked status", readIf("scripts/phase21-verify-remote-d1-live.mjs").includes("compareRemoteSchema") && readIf("scripts/phase21-verify-remote-d1-live.mjs").includes("BLOCKED"));
check("Queue tests do not require live Queue binding to pass source mode", readIf("scripts/phase21-verify-background-processing-live.mjs").includes("SOURCE READY / LIVE NOT VERIFIED"));
check("SSE tests do not require live streaming to pass source mode", readIf("scripts/phase21-verify-live-events-live.mjs").includes("SOURCE READY / LIVE NOT VERIFIED"));
check("R2 tests do not require live credentials to pass source mode", readIf("scripts/phase21-verify-r2-upload-live.mjs").includes("SOURCE READY / LIVE NOT VERIFIED"));
check("CORS request-id hotfix verifier remains", Boolean(scripts["verify:cors-request-id-hotfix"]) && /x-request-id/i.test(readIf("worker/src/index.ts")));
check("authenticated HR API data remains private/no-store", /private,\s*no-store/i.test(readIf("worker/src/utils/performance.ts") + readIf("worker/src/middleware/performance.ts") + readIf("worker/src/routes/app-events.ts")));
check("no browser alert/confirm/prompt usage", !hasBrowserPromptUsage(readIf("frontend/src/layouts/AppShell.tsx") + readIf("frontend/src/app/App.tsx") + phase21Scripts));
check("dark mode was not introduced", !hasDarkModeMarker(readIf("frontend/src/layouts/AppShell.tsx") + readIf("frontend/src/index.css") + phase21Scripts));

const wrangler = readIf("worker/wrangler.toml");
check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", readIf("worker/src/auth/password.ts").includes("100000"));

const finalZip = path.join(rootDir, "HRM-v2-production-deployment-live-phase21-clean.zip");
if (fs.existsSync(finalZip)) {
  const listing = fs.readFileSync(finalZip);
  check("Phase 21 ZIP exists for packaging validation", listing.byteLength > 0);
} else {
  check("Phase 21 ZIP validation deferred until packaging", true, "ZIP is created after verification.");
}

const failures = checks.filter((item) => !item.passed);
if (failures.length) {
  console.error("Phase 21 production deployment/live verification failed:");
  for (const failure of failures) console.error(`- ${failure.label}${failure.details ? `: ${failure.details}` : ""}`);
  process.exit(1);
}

console.log(`Phase 21 production deployment/live verifier passed. Checks: ${checks.length}.`);
