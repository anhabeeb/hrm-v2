import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "docs", "production", "onboarding-save-timeout-hotfix-diagnostics.md");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(label, condition, detail) {
  return { label, pass: Boolean(condition), detail };
}

const lifecycle = read("worker/src/routes/lifecycle.ts");
const schema = read("database/schema.sql");
const api = read("frontend/src/lib/api.ts");
const apiClient = read("frontend/src/lib/apiClient.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

const checks = [
  check("Save-status table exists", schema.includes("onboarding_workspace_save_statuses"), "D1 can persist committed save status by request/idempotency key."),
  check("Save-status endpoint exists", lifecycle.includes('onboardingRoutes.get("/cases/:caseId/save-status"'), "Frontend can reconcile timed-out saves."),
  check("Committed status is recorded before refresh is scheduled", lifecycle.indexOf("recordOnboardingSaveCommitted") >= 0 && lifecycle.indexOf("recordOnboardingSaveCommitted") < lifecycle.indexOf("scheduleOnboardingPostSaveRefresh"), "Save response path records the section commit before non-blocking readiness work."),
  check("Idempotent replay exists", lifecycle.includes("replayCommittedOnboardingWorkspaceSave") && lifecycle.includes("idempotent_replay"), "Duplicate retries can return the committed result safely."),
  check("Optional event failures are isolated", lifecycle.includes("optional_event_failed") && lifecycle.includes("onboarding.readiness.event_emit_failed"), "App events/streams cannot block save completion."),
  check("Manual readiness refresh is direct", lifecycle.includes('onboardingRoutes.post("/cases/:caseId/refresh-readiness"') && lifecycle.includes("refreshWorkspaceReadiness(c, caseId"), "Manual retry calculates readiness and returns confirmed workspace data."),
  check("Activation remains server validated", lifecycle.includes("activateEmployeeFromOnboarding") && lifecycle.includes("if (!readiness?.can_activate) return { blocked: true, readiness };"), "Activation does not rely on stale frontend state."),
  check("Frontend save-status API exists", api.includes("getOnboardingWorkspaceSaveStatus"), "Timed-out saves can be checked by request id."),
  check("Frontend timeout reconciliation exists", lifecyclePage.includes("isOnboardingSaveTimeoutError") && lifecyclePage.includes("api.getOnboardingWorkspaceSaveStatus"), "The popup checks committed status before asking for retry."),
  check("User-facing timeout copy is updated", apiClient.includes("Save timed out. Checking whether your changes were saved"), "The alert describes reconciliation rather than immediate failure."),
  check("Payment method save is duplicate-safe", lifecycle.includes("existingPrimary") && lifecycle.includes("UPDATE employee_payment_methods SET payment_method_type"), "Payment retries update the active primary payment method."),
  check("Pension save is duplicate-safe", lifecycle.includes("existing?.id ?? id(\"employee_pension_profile\")"), "Pension retries reuse the active pension profile."),
  check("D1 binding unchanged", wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "The protected D1 binding is intact."),
  check("R2 binding unchanged", wrangler.includes('bucket_name = "hrm-v2-documents"'), "The protected R2 binding is intact."),
  check("PBKDF2 remains 100000", password.includes("100000"), "Authentication hashing settings are unchanged.")
];

const passed = checks.filter((item) => item.pass).length;
const failed = checks.length - passed;
const timestamp = new Date().toISOString();
const lines = [
  "# Onboarding Save Timeout Hotfix Diagnostics",
  "",
  `Generated: ${timestamp}`,
  "",
  `Result: ${failed === 0 ? "PASS" : "FAIL"} (${passed}/${checks.length} checks passed)`,
  "",
  "| Check | Status | Detail |",
  "| --- | --- | --- |",
  ...checks.map((item) => `| ${item.label} | ${item.pass ? "PASS" : "FAIL"} | ${item.detail.replaceAll("|", "\\|")} |`),
  "",
  "This diagnostic is source/local only. It does not run production writes, remote repair, or production seed operations.",
  ""
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join("\n"));

if (failed > 0) {
  console.error(`Onboarding save timeout diagnostics failed. Report written to ${path.relative(root, outputPath)}`);
  process.exit(1);
}

console.log(`Onboarding save timeout diagnostics passed. Report written to ${path.relative(root, outputPath)}`);
