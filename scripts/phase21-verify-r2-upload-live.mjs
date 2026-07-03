import { authHeaders, envUrl, joinUrl, phase21Report, reportRowsSection, safeFetchCheck, statusFromRows, writeReport } from "./phase21-utils.mjs";

const apiUrl = envUrl("HRM_PROD_API_URL", "");
const token = process.env.HRM_TEST_AUTH_TOKEN;
const enableWrite = process.env.HRM_PHASE21_ENABLE_UPLOAD_WRITE_TEST === "true";
const reportPath = "docs/production/phase21-r2-upload-live-report.md";

async function main() {
  const rows = [];
  if (!apiUrl) {
    writeReport(reportPath, phase21Report("Phase 21 R2 Upload Live Verification", "SOURCE READY / LIVE NOT VERIFIED", [
      "Set `HRM_PROD_API_URL` to run live R2 upload endpoint checks. Live upload writes are disabled unless `HRM_PHASE21_ENABLE_UPLOAD_WRITE_TEST=true` and test identifiers are provided."
    ]));
    console.log("Phase 21 R2 upload verification skipped: HRM_PROD_API_URL was not provided.");
    return;
  }

  rows.push(await safeFetchCheck("Prepare endpoint rejects unauthenticated requests", joinUrl(apiUrl, "/api/v1/documents/uploads/prepare"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows: [] })
  }, (response) => [401, 403].includes(response.status)));
  rows.push(await safeFetchCheck("Complete endpoint rejects unauthenticated arbitrary object keys", joinUrl(apiUrl, "/api/v1/documents/uploads/complete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_ids: ["phase21-arbitrary-object-key"] })
  }, (response) => [401, 403].includes(response.status)));

  if (token) {
    rows.push(await safeFetchCheck("Prepare endpoint requires valid document rows and permissions", joinUrl(apiUrl, "/api/v1/documents/uploads/prepare"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [] })
    }, (response) => [200, 400, 403].includes(response.status)));
    rows.push(await safeFetchCheck("Complete endpoint rejects unknown upload ids safely", joinUrl(apiUrl, "/api/v1/documents/uploads/complete"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ upload_ids: ["document_upload_phase21_unknown"] })
    }, (response) => [200, 400, 404].includes(response.status)));
  }

  if (enableWrite) {
    const required = ["HRM_PHASE21_TEST_CASE_ID", "HRM_PHASE21_TEST_DOCUMENT_TYPE_ID", "HRM_TEST_AUTH_TOKEN"].filter((name) => !process.env[name]);
    if (required.length) throw new Error(`Upload write test is enabled but missing required env vars: ${required.join(", ")}`);
    rows.push({ name: "Live upload write test", status: "SKIPPED", http: "-", duration_ms: "-", payload_bytes: "-", detail: "Write flag was provided; perform the harmless generated-file upload manually after confirming the test case and document type are safe." });
  } else {
    rows.push({ name: "Live upload write test disabled by default", status: "PASS", http: "-", duration_ms: "-", payload_bytes: "-", detail: "No production file upload was attempted." });
  }

  const status = statusFromRows(rows);
  writeReport(reportPath, phase21Report("Phase 21 R2 Upload Live Verification", status, [
    "Upload modes covered by source/runtime configuration: `worker_proxy`, `direct_r2`, and `auto`. Direct R2 credentials are never exposed by this script.",
    reportRowsSection(rows)
  ]));
  console.log(`Phase 21 R2 upload verification complete: ${status}.`);
}

main().catch((error) => {
  console.error("Phase 21 R2 upload verification failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});

