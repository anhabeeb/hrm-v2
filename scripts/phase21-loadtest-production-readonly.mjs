import { authHeaders, envUrl, joinUrl, percentile, phase21Report, markdownTable, safeFetchCheck, writeReport } from "./phase21-utils.mjs";

const apiUrl = envUrl("HRM_PROD_API_URL", "");
const token = process.env.HRM_TEST_AUTH_TOKEN;
const concurrency = Math.max(1, Math.min(10, Number(process.env.HRM_LOADTEST_CONCURRENCY ?? 2)));
const maxRequests = Math.max(1, Math.min(500, Number(process.env.HRM_LOADTEST_MAX_REQUESTS ?? 30)));
const durationSeconds = Math.max(1, Math.min(120, Number(process.env.HRM_LOADTEST_DURATION_SECONDS ?? 30)));
const reportPath = "docs/production/phase21-readonly-loadtest-report.md";

const publicPaths = ["/api/v1/bootstrap/status", "/api/v1/health"];
const authPaths = [
  "/api/v1/auth/me",
  "/api/v1/dashboard/command-center",
  "/api/v1/employees?limit=10",
  "/api/v1/onboarding/cases?limit=10",
  "/api/v1/documents/missing?limit=10",
  "/api/v1/notifications?limit=10",
  "/api/v1/background-jobs?limit=10",
  "/api/v1/performance/overview",
  "/api/v1/app-events/since?limit=10",
  "/api/v1/search/global?q=test&limit=5"
];

function routeKey(url) {
  return url.replace(/\?.*$/, "").replace(/[0-9a-f]{8,}(?:-[0-9a-f]{4,})*/gi, ":id");
}

async function runPool(tasks) {
  const rows = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      rows.push(await task());
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return rows;
}

function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = routeKey(row.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const routeRows = [...groups.entries()].map(([route, items]) => {
    const durations = items.map((item) => Number(item.duration_ms ?? 0));
    const failures = items.filter((item) => item.status !== "PASS").length;
    const payloadAvg = Math.round(items.reduce((sum, item) => sum + Number(item.payload_bytes ?? 0), 0) / items.length);
    return [route, items.length, `${((failures / items.length) * 100).toFixed(2)}%`, percentile(durations, 50), percentile(durations, 95), percentile(durations, 99), payloadAvg];
  });
  const failures = rows.filter((item) => item.status !== "PASS").length;
  return {
    status: failures / Math.max(rows.length, 1) > 0.01 ? "PASS WITH WARNINGS" : "PASS",
    failures,
    routeRows
  };
}

async function main() {
  if (!apiUrl) {
    writeReport(reportPath, phase21Report("Phase 21 Read-Only Production Load Test", "SOURCE READY / LIVE NOT VERIFIED", [
      "Set `HRM_PROD_API_URL` to run safe read-only load checks. The script never creates, updates, deletes, uploads, imports, exports, or seeds production data by default."
    ]));
    console.log("Phase 21 read-only load test skipped: HRM_PROD_API_URL was not provided.");
    return;
  }
  if (process.env.HRM_PHASE21_ENABLE_WRITE_LOAD_TEST === "true") {
    throw new Error("Phase 21 load test does not implement production write scenarios. Read-only mode is enforced.");
  }

  const headers = token ? authHeaders(token) : {};
  const paths = token ? [...publicPaths, ...authPaths] : publicPaths;
  const started = Date.now();
  const tasks = [];
  while (tasks.length < maxRequests && Date.now() - started < durationSeconds * 1000) {
    const pathname = paths[tasks.length % paths.length];
    tasks.push(() => safeFetchCheck(pathname, joinUrl(apiUrl, pathname), { headers }, (response, meta) => response.status < 500 && !/public/i.test(meta.cache)));
  }
  const rows = await runPool(tasks);
  const summary = summarize(rows);
  const corsFailures = rows.filter((row) => /cors/i.test(row.detail ?? "")).length;
  writeReport(reportPath, phase21Report("Phase 21 Read-Only Production Load Test", summary.status, [
    `Mode: read-only\n\nConcurrency: ${concurrency}\n\nMax requests: ${maxRequests}\n\nDuration limit seconds: ${durationSeconds}\n\nAuthenticated scenarios: ${token ? "included" : "skipped"}`,
    `CORS failures observed: ${corsFailures}`,
    markdownTable(["Route", "Count", "Error Rate", "p50 ms", "p95 ms", "p99 ms", "Avg Payload Bytes"], summary.routeRows)
  ]));
  console.log(`Phase 21 read-only load test complete. Requests: ${rows.length}. Failures: ${summary.failures}.`);
  if (summary.failures && process.env.HRM_PHASE21_STRICT_LIVE === "true") process.exit(1);
}

main().catch((error) => {
  console.error("Phase 21 read-only load test failed unexpectedly.");
  console.error(error.message);
  process.exit(1);
});

