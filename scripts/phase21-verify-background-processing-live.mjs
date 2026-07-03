import { authHeaders, envUrl, joinUrl, phase21Report, reportRowsSection, safeFetchCheck, statusFromRows, writeReport } from "./phase21-utils.mjs";

const apiUrl = envUrl("HRM_PROD_API_URL", "");
const token = process.env.HRM_TEST_AUTH_TOKEN;
const enableTestJob = process.env.HRM_PHASE21_ENABLE_TEST_JOB === "true";
const reportPath = "docs/production/phase21-background-processing-live-report.md";

async function main() {
  const rows = [];
  if (!apiUrl) {
    writeReport(reportPath, phase21Report("Phase 21 Background Processing Live Verification", "SOURCE READY / LIVE NOT VERIFIED", [
      "Set `HRM_PROD_API_URL` to run live background processing checks. Queue/D1 fallback source verification remains covered by Phase 17 verifiers."
    ]));
    console.log("Phase 21 background processing verification skipped: HRM_PROD_API_URL was not provided.");
    return;
  }

  rows.push(await safeFetchCheck("Job list endpoint is protected", joinUrl(apiUrl, "/api/v1/background-jobs?limit=5"), {}, (response) => [401, 403].includes(response.status)));
  rows.push(await safeFetchCheck("Job run endpoint is protected", joinUrl(apiUrl, "/api/v1/background-jobs/run-next"), { method: "POST" }, (response) => [401, 403].includes(response.status)));
  rows.push(await safeFetchCheck("Job retry endpoint is protected", joinUrl(apiUrl, "/api/v1/background-jobs/phase21-test/retry"), { method: "POST" }, (response) => [401, 403].includes(response.status)));
  rows.push(await safeFetchCheck("Job cancel endpoint is protected", joinUrl(apiUrl, "/api/v1/background-jobs/phase21-test/cancel"), { method: "POST" }, (response) => [401, 403].includes(response.status)));

  if (token) {
    rows.push(await safeFetchCheck("Authenticated background jobs list responds safely", joinUrl(apiUrl, "/api/v1/background-jobs?limit=5"), { headers: authHeaders(token) }, (response) => response.status < 500));
    rows.push(await safeFetchCheck("Performance overview reports background mode safely when permitted", joinUrl(apiUrl, "/api/v1/performance/overview"), { headers: authHeaders(token) }, (response) => response.status < 500));
  }

  if (enableTestJob) {
    rows.push({ name: "Harmless test job creation", status: "SKIPPED", http: "-", duration_ms: "-", payload_bytes: "-", detail: "No generic safe test-job creation endpoint is invoked automatically. Production writes remain disabled by default." });
  } else {
    rows.push({ name: "Test job write disabled by default", status: "PASS", http: "-", duration_ms: "-", payload_bytes: "-", detail: "No production background job was created." });
  }

  const status = statusFromRows(rows);
  writeReport(reportPath, phase21Report("Phase 21 Background Processing Live Verification", status, [
    "Supported source modes: `d1`, `queue`, and `hybrid`. Live Queue binding is not required for this source-safe verification to pass.",
    reportRowsSection(rows)
  ]));
  console.log(`Phase 21 background processing verification complete: ${status}.`);
}

main().catch((error) => {
  console.error("Phase 21 background processing verification failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});

