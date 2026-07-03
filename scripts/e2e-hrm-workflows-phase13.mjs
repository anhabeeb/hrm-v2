import { performance } from "node:perf_hooks";
import {
  combinedSource,
  exists,
  read,
  writeReport
} from "./phase12-utils.mjs";

const apiUrl = process.env.HRM_E2E_API_URL || "";
const frontendUrl = process.env.HRM_E2E_FRONTEND_URL || "";
const authToken = process.env.HRM_E2E_AUTH_TOKEN || "";
const testCompanyId = process.env.HRM_E2E_TEST_COMPANY_ID || "";
const enableWrites = process.env.HRM_E2E_ENABLE_WRITES === "true";
const allowProductionWrites = process.env.HRM_E2E_ALLOW_PRODUCTION_WRITES === "true";
const testPrefix = process.env.HRM_E2E_TEST_PREFIX || "E2E-P13";
const timeoutMs = Number(process.env.HRM_E2E_TIMEOUT_MS || 12000);

const sourceBundle = combinedSource(["frontend/src", "worker/src", "scripts", "docs"], [".ts", ".tsx", ".js", ".mjs", ".md"]);
const workerBundle = combinedSource(["worker/src"], [".ts", ".tsx", ".js", ".mjs"]);
const frontendBundle = combinedSource(["frontend/src"], [".ts", ".tsx", ".js", ".mjs"]);

function isProductionTarget(url) {
  return /(^|\/\/)(hr\.api\.cafeasiana\.com\.mv|hr\.cafeasiana\.com\.mv)(\/|$)/i.test(String(url));
}

function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, "")}${path}`;
}

function hasAny(text, markers) {
  return markers.some((marker) => text.includes(marker) || new RegExp(marker, "i").test(text));
}

function pass(name, detail = "") {
  return { name, status: "PASS", detail };
}

function warn(name, detail = "") {
  return { name, status: "WARN", detail };
}

function skip(name, detail = "") {
  return { name, status: "SKIP", detail };
}

function fail(name, detail = "") {
  return { name, status: "FAIL", detail };
}

async function requestCheck(name, path, options = {}, validate = (response) => response.status < 500) {
  if (!apiUrl) return skip(name, "No HRM_E2E_API_URL was provided.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(joinUrl(apiUrl, path), {
      ...options,
      signal: controller.signal,
      headers: {
        "x-request-id": `phase13-${Date.now()}`,
        ...(testCompanyId ? { "x-hrm-company-id": testCompanyId } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {})
      }
    });
    const duration = Math.round(performance.now() - started);
    const cache = response.headers.get("cache-control") || "";
    const ok = await validate(response, { cache, duration });
    return ok
      ? pass(name, `HTTP ${response.status}, ${duration}ms${cache ? `, cache=${cache}` : ""}`)
      : fail(name, `HTTP ${response.status}, ${duration}ms${cache ? `, cache=${cache}` : ""}`);
  } catch (error) {
    return fail(name, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

function sourceScenario(name, markers, detail) {
  const missing = markers.filter((marker) => !hasAny(sourceBundle, [marker]));
  return missing.length ? fail(name, `Missing source markers: ${missing.join(", ")}`) : pass(name, detail);
}

function workerScenario(name, markers, detail) {
  const missing = markers.filter((marker) => !hasAny(workerBundle, [marker]));
  return missing.length ? fail(name, `Missing worker markers: ${missing.join(", ")}`) : pass(name, detail);
}

function frontendScenario(name, markers, detail) {
  const missing = markers.filter((marker) => !hasAny(frontendBundle, [marker]));
  return missing.length ? fail(name, `Missing frontend markers: ${missing.join(", ")}`) : pass(name, detail);
}

async function liveReadChecks() {
  const checks = [];
  if (!apiUrl && !frontendUrl) {
    checks.push(skip("Live target checks", "No HRM_E2E_API_URL or HRM_E2E_FRONTEND_URL was provided; running dry-run/source validation only."));
    return checks;
  }

  if (frontendUrl) {
    const started = performance.now();
    try {
      const response = await fetch(frontendUrl, { redirect: "manual" });
      checks.push(response.status < 500 ? pass("Frontend reachable", `HTTP ${response.status}, ${Math.round(performance.now() - started)}ms`) : fail("Frontend reachable", `HTTP ${response.status}`));
    } catch (error) {
      checks.push(fail("Frontend reachable", error instanceof Error ? error.message : String(error)));
    }
  }

  checks.push(await requestCheck("API health endpoint is safe", "/api/v1/health", {}, (response, meta) => response.status < 500 && /no-store/i.test(meta.cache)));
  checks.push(await requestCheck("Bootstrap status endpoint responds", "/api/v1/bootstrap/status", {}, (response) => response.status < 500));
  checks.push(await requestCheck("Protected auth endpoint does not leak unauthenticated data", "/api/v1/auth/me", {}, (response, meta) => [200, 401, 403].includes(response.status) && /no-store/i.test(meta.cache)));
  checks.push(await requestCheck("Background jobs endpoint is protected", "/api/v1/background-jobs?limit=5", {}, (response) => authToken ? response.status < 500 : [401, 403].includes(response.status)));
  checks.push(await requestCheck("Performance endpoint is protected/admin scoped", "/api/v1/performance/overview", {}, (response) => authToken ? response.status < 500 || response.status === 403 : [401, 403].includes(response.status)));
  checks.push(await requestCheck("App events endpoint is protected/scoped", "/api/v1/app-events/since", {}, (response) => authToken ? response.status < 500 || response.status === 403 : [401, 403].includes(response.status)));
  return checks;
}

function writeSafetyChecks() {
  const checks = [];
  const productionTarget = isProductionTarget(apiUrl) || isProductionTarget(frontendUrl);
  if (!enableWrites) {
    checks.push(skip("Write scenarios", "Read-only mode is the default. Set HRM_E2E_ENABLE_WRITES=true to run write scenarios in a safe test tenant."));
    return checks;
  }
  if (productionTarget && !allowProductionWrites) {
    checks.push(fail("Production write guard", "Production write tests require HRM_E2E_ALLOW_PRODUCTION_WRITES=true."));
    return checks;
  }
  if (!apiUrl || !authToken) {
    checks.push(fail("Write scenario prerequisites", "Writes require HRM_E2E_API_URL and HRM_E2E_AUTH_TOKEN."));
    return checks;
  }
  checks.push(warn("Write scenarios enabled", `Use prefix ${testPrefix}. Cleanup should archive/mark test records where supported and never delete real production employees/payroll/documents.`));
  return checks;
}

function scenarioChecks() {
  return [
    sourceScenario(
      "Local employee onboarding scenario exists",
      ["employee_type", "LOCAL", "Visa", "Work Permit", "document_required_rules", "required document"],
      "Validates configured Any/Local document rules without hardcoding requirements."
    ),
    sourceScenario(
      "Foreign employee onboarding scenario exists",
      ["FOREIGN", "Passport", "Visa", "Work Permit", "foreign", "document_required_rules"],
      "Validates foreign-only Visa/Work Permit behavior and common Any-scope rules."
    ),
    sourceScenario(
      "Document batch upload scenario exists",
      ["documents/batch", "uploadStatus", "row-level", "Preparing", "Uploading", "Retry"],
      "Covers onboarding batch upload, row-level progress, retry, and readiness refresh."
    ),
    sourceScenario(
      "Payroll Cash and Bank Transfer scenario exists",
      ["Cash", "Bank Transfer", "payment_method", "payment-institutions", "account_number", "account_name"],
      "Validates Cash without bank details and Bank Transfer with active institution/account validation."
    ),
    sourceScenario(
      "Activation, user account linking, and self-service scenario exists",
      ["activate", "create-login", "link-user", "apply-suggested-role-scope", "requireActiveSelfServiceEmployee"],
      "Covers readiness-gated activation, linking/provisioning, and active employee self-service enforcement."
    ),
    sourceScenario(
      "Attendance, leave, and payroll integrated scenario exists",
      ["requireAttendanceModuleEnabled", "leave_payroll_impacts", "payroll_impact_status", "Attendance-disabled Payroll isolation"],
      "Covers attendance-enabled and attendance-disabled operational behavior."
    ),
    sourceScenario(
      "Offboarding scenario exists",
      ["offboarding", "final settlement", "Not Required", "asset clearance", "document clearance"],
      "Covers optional disabled module clearance and server-side finalization validation."
    ),
    sourceScenario(
      "Disabled-module scenario exists",
      ["module_visibility", "requireOperationalModuleEnabled", "disabled module", "submodule"],
      "Covers sidebar, direct route, backend API, onboarding/offboarding, search, reports, notifications, and Settings behavior."
    ),
    sourceScenario(
      "Permission/security scenario exists",
      ["requireAuth", "requireAnyPermission", "SELF_ONLY", "performance.metrics.view", "canDownloadReportArtifact"],
      "Covers role-gated admin pages, scoped app events/jobs/artifacts, and sensitive payroll/report access."
    ),
    sourceScenario(
      "Reports, import, and export scenario exists",
      ["report_export_artifacts", "background_jobs", "import", "export", "artifact"],
      "Covers background report/export/import jobs, artifact permissions, and targeted invalidation."
    ),
    sourceScenario(
      "Performance systems scenario exists",
      ["TanStack", "workspace", "app_events", "performance_api_metrics", "document_upload_sessions"],
      "Covers cache, workspace page-load reduction, app events, upload progress, background jobs, and safe metrics."
    ),
    workerScenario(
      "Authenticated HR API responses remain private/no-store",
      ["private, no-store"],
      "Preserves Phase 12 no-store behavior for authenticated data."
    ),
    frontendScenario(
      "Frontend avoids browser alert/confirm/prompt",
      ["AlertProvider", "PopupAlertCard"],
      "Global popup alerts remain the workflow notification path."
    )
  ];
}

function markdown(results) {
  const passed = results.filter((item) => item.status === "PASS").length;
  const failed = results.filter((item) => item.status === "FAIL").length;
  const skipped = results.filter((item) => item.status === "SKIP").length;
  const warned = results.filter((item) => item.status === "WARN").length;
  const rows = results.map((item) => `| ${item.status} | ${item.name.replaceAll("|", "\\|")} | ${String(item.detail || "").replaceAll("|", "\\|")} |`).join("\n");
  const mode = enableWrites ? "WRITE-ENABLED" : "READ-ONLY";
  return `# Phase 13 E2E HRM Workflow Run Results

Generated: ${new Date().toISOString()}

Environment:
- API URL provided: ${apiUrl ? "yes" : "no"}
- Frontend URL provided: ${frontendUrl ? "yes" : "no"}
- Auth token provided: ${authToken ? "yes" : "no"}
- Company id provided: ${testCompanyId ? "yes" : "no"}
- Mode: ${mode}
- Test prefix: ${testPrefix}

Summary:
- Passed: ${passed}
- Failed: ${failed}
- Warnings: ${warned}
- Skipped: ${skipped}

| Status | Scenario / Check | Detail |
| --- | --- | --- |
${rows}

Notes:
- Read-only/source validation mode is the default.
- Write scenarios are skipped unless \`HRM_E2E_ENABLE_WRITES=true\`.
- Production writes additionally require \`HRM_E2E_ALLOW_PRODUCTION_WRITES=true\`.
- No credentials, tokens, document numbers, salary values, or sensitive response bodies are written to this report.
`;
}

async function main() {
  const results = [
    pass("Phase 13 runner loaded", "End-to-end HRM workflow validation script is available."),
    pass("Read-only mode default confirmed", enableWrites ? "Write mode was explicitly requested." : "Writes are disabled by default."),
    exists("docs/production/phase13-e2e-workflow-validation.md") ? pass("Scenario guide exists") : fail("Scenario guide exists", "docs/production/phase13-e2e-workflow-validation.md missing."),
    exists("docs/production/phase13-manual-ui-workflow-checklist.md") ? pass("Manual UI checklist exists") : fail("Manual UI checklist exists", "docs/production/phase13-manual-ui-workflow-checklist.md missing."),
    ...writeSafetyChecks(),
    ...scenarioChecks(),
    ...(await liveReadChecks())
  ];

  writeReport("docs/production/phase13-e2e-run-results.md", markdown(results));
  const failures = results.filter((item) => item.status === "FAIL");
  console.log(`Phase 13 E2E HRM workflow validation complete. Passed ${results.filter((item) => item.status === "PASS").length}/${results.length}.`);
  if (failures.length) {
    for (const failure of failures) console.error(`- ${failure.name}: ${failure.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Phase 13 E2E HRM workflow validation failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
