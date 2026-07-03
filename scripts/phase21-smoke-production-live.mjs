import { authHeaders, defaultApiUrl, defaultFrontendUrl, envUrl, joinUrl, phase21Report, reportRowsSection, safeFetchCheck, statusFromRows, writeReport } from "./phase21-utils.mjs";

const frontendUrl = envUrl("HRM_PROD_FRONTEND_URL", "");
const apiUrl = envUrl("HRM_PROD_API_URL", "");
const authToken = process.env.HRM_TEST_AUTH_TOKEN;
const adminToken = process.env.HRM_ADMIN_TEST_AUTH_TOKEN;
const reportPath = "docs/production/phase21-production-smoke-live-report.md";

async function main() {
  const rows = [];
  if (!frontendUrl || !apiUrl) {
    writeReport(reportPath, phase21Report("Phase 21 Production Smoke Live Report", "SOURCE READY / LIVE NOT VERIFIED", [
      `Set \`HRM_PROD_FRONTEND_URL\` and \`HRM_PROD_API_URL\` to run live checks. Expected production frontend: ${defaultFrontendUrl}. Expected production API: ${defaultApiUrl}.`,
      "No production data was read beyond source validation, and no production writes were attempted."
    ]));
    console.log("Phase 21 production smoke skipped: live URLs were not provided.");
    return;
  }

  rows.push(await safeFetchCheck("Frontend root loads", frontendUrl, {}, (response, meta) => response.status < 500 && /text\/html/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Login route loads", joinUrl(frontendUrl, "/login"), {}, (response) => [200, 304].includes(response.status)));
  rows.push(await safeFetchCheck("Favicon loads with image MIME", joinUrl(frontendUrl, "/favicon.ico"), {}, (response, meta) => response.status < 500 && /image|icon|octet-stream/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Brand asset loads with image MIME", joinUrl(frontendUrl, "/brand/omnicore-favicon.svg"), {}, (response, meta) => response.status < 500 && /svg|image/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("Missing static asset is not returned as successful HTML", joinUrl(frontendUrl, "/assets/phase21-missing-asset.js"), {}, (response, meta) => response.status === 404 || (response.status >= 400 && !/text\/html/i.test(meta.contentType))));
  rows.push(await safeFetchCheck("SPA fallback works for frontend route", joinUrl(frontendUrl, "/dashboard"), {}, (response, meta) => [200, 304].includes(response.status) && /html/i.test(meta.contentType)));
  rows.push(await safeFetchCheck("API health endpoint responds", joinUrl(apiUrl, "/api/v1/health"), {}, (response) => response.status < 500));
  rows.push(await safeFetchCheck("API bootstrap/status responds", joinUrl(apiUrl, "/api/v1/bootstrap/status"), {}, (response) => response.status < 500));
  rows.push(await safeFetchCheck("CORS preflight allows request id and auth headers", joinUrl(apiUrl, "/api/v1/bootstrap/status"), {
    method: "OPTIONS",
    headers: {
      Origin: frontendUrl,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "x-request-id, authorization, content-type"
    },
    readBody: false
  }, (response, meta) => [200, 204].includes(response.status) && /x-request-id/i.test(meta.corsAllowHeaders) && /authorization/i.test(meta.corsAllowHeaders)));
  rows.push(await safeFetchCheck("Protected API route rejects unauthenticated access safely", joinUrl(apiUrl, "/api/v1/background-jobs"), {}, (response) => [401, 403].includes(response.status)));
  rows.push(await safeFetchCheck("Authenticated API responses are not public cached", joinUrl(apiUrl, "/api/v1/health"), {}, (response, meta) => response.status < 500 && !/public/i.test(meta.cache)));

  if (authToken) {
    const headers = authHeaders(authToken);
    const checks = [
      ["Current user/session endpoint works", "/api/v1/auth/me"],
      ["Module visibility/settings endpoint works", "/api/v1/admin/module-control"],
      ["Command Center summary endpoint works", "/api/v1/dashboard/command-center"],
      ["Notification list endpoint works", "/api/v1/notifications?limit=5"],
      ["Employee list read-only endpoint works", "/api/v1/employees?limit=5"],
      ["Onboarding cases list read-only endpoint works", "/api/v1/onboarding/cases?limit=5"],
      ["Background jobs list endpoint is safe", "/api/v1/background-jobs?limit=5"],
      ["Performance dashboard endpoint is safe", "/api/v1/performance/overview"],
      ["App events since endpoint works", "/api/v1/app-events/since?limit=5"],
      ["App events stream status/fallback endpoint works", "/api/v1/app-events/stream?status=1"],
      ["Reports endpoint applies permissions safely", "/api/v1/reports/options"],
      ["Backup/retention admin endpoint applies permissions safely", "/api/v1/admin/retention-settings"]
    ];
    for (const [name, pathname] of checks) {
      rows.push(await safeFetchCheck(name, joinUrl(apiUrl, pathname), { headers }, (response) => response.status < 500));
    }
  }

  if (adminToken && adminToken !== authToken) {
    rows.push(await safeFetchCheck("Admin token can reach admin-safe module control endpoint", joinUrl(apiUrl, "/api/v1/admin/module-control"), { headers: authHeaders(adminToken) }, (response) => response.status < 500));
  }

  const status = statusFromRows(rows);
  writeReport(reportPath, phase21Report("Phase 21 Production Smoke Live Report", status, [
    authToken ? "Authenticated read-only checks were included." : "Authenticated checks were skipped because `HRM_TEST_AUTH_TOKEN` was not provided.",
    reportRowsSection(rows)
  ]));
  console.log(`Phase 21 production smoke complete: ${status}.`);
  if (rows.some((row) => row.status === "FAIL") && process.env.HRM_PHASE21_STRICT_LIVE === "true") process.exit(1);
}

main().catch((error) => {
  console.error("Phase 21 production smoke failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});

