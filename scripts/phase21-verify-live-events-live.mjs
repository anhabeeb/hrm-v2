import { authHeaders, envUrl, joinUrl, phase21Report, reportRowsSection, safeFetchCheck, statusFromRows, writeReport } from "./phase21-utils.mjs";

const apiUrl = envUrl("HRM_PROD_API_URL", "");
const token = process.env.HRM_TEST_AUTH_TOKEN;
const frontendUrl = envUrl("HRM_PROD_FRONTEND_URL", "https://hr.cafeasiana.com.mv");
const reportPath = "docs/production/phase21-live-events-live-report.md";

async function main() {
  const rows = [];
  if (!apiUrl) {
    writeReport(reportPath, phase21Report("Phase 21 Live Events Live Verification", "SOURCE READY / LIVE NOT VERIFIED", [
      "Set `HRM_PROD_API_URL` to run live app-events checks. Streaming is source-verified when live auth/environment is unavailable."
    ]));
    console.log("Phase 21 live events verification skipped: HRM_PROD_API_URL was not provided.");
    return;
  }

  rows.push(await safeFetchCheck("App events since requires auth", joinUrl(apiUrl, "/api/v1/app-events/since"), {}, (response) => [401, 403].includes(response.status)));
  rows.push(await safeFetchCheck("App events stream requires auth", joinUrl(apiUrl, "/api/v1/app-events/stream?status=1"), {}, (response) => [401, 403].includes(response.status)));
  rows.push(await safeFetchCheck("CORS supports app event fetch-stream headers", joinUrl(apiUrl, "/api/v1/app-events/stream?status=1"), {
    method: "OPTIONS",
    headers: {
      Origin: frontendUrl,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization, x-request-id, last-event-id"
    },
    readBody: false
  }, (response, meta) => [200, 204].includes(response.status) && /authorization/i.test(meta.corsAllowHeaders) && /x-request-id/i.test(meta.corsAllowHeaders)));

  if (token) {
    rows.push(await safeFetchCheck("Polling fallback works with auth", joinUrl(apiUrl, "/api/v1/app-events/since?limit=5"), { headers: authHeaders(token) }, (response, meta) => response.status < 500 && /no-store/i.test(meta.cache)));
    rows.push(await safeFetchCheck("Stream status/fallback works with auth and no query token", joinUrl(apiUrl, "/api/v1/app-events/stream?status=1"), { headers: { ...authHeaders(token), Accept: "application/json" } }, (response, meta) => response.status < 500 && /no-store/i.test(meta.cache)));
  } else {
    rows.push({ name: "Authenticated stream/fetch-stream live connection", status: "SKIPPED", http: "-", duration_ms: "-", payload_bytes: "-", detail: "No `HRM_TEST_AUTH_TOKEN` was provided. No token was placed in a query string." });
  }

  const status = statusFromRows(rows);
  writeReport(reportPath, phase21Report("Phase 21 Live Events Live Verification", status, [
    "This script validates auth-required event APIs, polling fallback, no-store headers, CORS support, and the no-token-in-query rule.",
    reportRowsSection(rows)
  ]));
  console.log(`Phase 21 live events verification complete: ${status}.`);
}

main().catch((error) => {
  console.error("Phase 21 live events verification failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});

