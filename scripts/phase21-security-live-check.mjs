import { authHeaders, envUrl, joinUrl, phase21Report, reportRowsSection, safeFetchCheck, statusFromRows, writeReport } from "./phase21-utils.mjs";

const apiUrl = envUrl("HRM_PROD_API_URL", "");
const frontendUrl = envUrl("HRM_PROD_FRONTEND_URL", "https://hr.cafeasiana.com.mv");
const userToken = process.env.HRM_TEST_AUTH_TOKEN;
const adminToken = process.env.HRM_ADMIN_TEST_AUTH_TOKEN;
const reportPath = "docs/production/phase21-security-live-report.md";

const adminRoutes = [
  "/api/v1/performance/overview",
  "/api/v1/background-jobs?limit=5",
  "/api/v1/admin/retention-settings",
  "/api/v1/app-events/stream?status=1",
  "/api/v1/reports/artifacts/phase21/download"
];

async function main() {
  const rows = [];
  if (!apiUrl) {
    writeReport(reportPath, phase21Report("Phase 21 Security Live Check", "SOURCE READY / LIVE NOT VERIFIED", [
      "Set `HRM_PROD_API_URL` to run live security checks. No sensitive response bodies are logged."
    ]));
    console.log("Phase 21 security live check skipped: HRM_PROD_API_URL was not provided.");
    return;
  }

  rows.push(await safeFetchCheck("CORS request-id preflight remains allowed", joinUrl(apiUrl, "/api/v1/bootstrap/status"), {
    method: "OPTIONS",
    headers: {
      Origin: frontendUrl,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "x-request-id, authorization, content-type"
    },
    readBody: false
  }, (response, meta) => [200, 204].includes(response.status) && /x-request-id/i.test(meta.corsAllowHeaders) && meta.corsAllowOrigin !== "*"));

  for (const route of adminRoutes) {
    rows.push(await safeFetchCheck(`Protected route rejects unauthenticated: ${route}`, joinUrl(apiUrl, route), {}, (response, meta) => [401, 403, 404].includes(response.status) && !/public/i.test(meta.cache)));
  }

  if (userToken) {
    for (const route of adminRoutes) {
      rows.push(await safeFetchCheck(`Normal token cannot 500 admin route: ${route}`, joinUrl(apiUrl, route), { headers: authHeaders(userToken) }, (response, meta) => response.status < 500 && !/public/i.test(meta.cache)));
    }
  }

  if (adminToken) {
    rows.push(await safeFetchCheck("Admin token reaches performance/admin-safe endpoint", joinUrl(apiUrl, "/api/v1/performance/overview"), { headers: authHeaders(adminToken) }, (response, meta) => response.status < 500 && !/public/i.test(meta.cache)));
  }

  const status = statusFromRows(rows);
  writeReport(reportPath, phase21Report("Phase 21 Security Live Check", status, [
    "Checks cover unauthenticated rejection, normal/admin token behavior where provided, private/no-store headers, and credentialed CORS origin safety.",
    reportRowsSection(rows)
  ]));
  console.log(`Phase 21 security live check complete: ${status}.`);
}

main().catch((error) => {
  console.error("Phase 21 security live check failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});

